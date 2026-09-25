import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit {
	@Input() id!: string;

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;

	rejectControl = new FormControl('', {
		nonNullable: true,
		validators: [Validators.required],
	});

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	get timeline(): TimelineEntry[] {
		return [...(this.detail?.audit ?? [])].sort(
			(a, b) => Date.parse(a.at) - Date.parse(b.at),
		);
	}

	get canApprove(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' &&
			canApprovePolicy(this.session.user);
	}

	get canReject(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' &&
			canApprovePolicy(this.session.user);
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting || !this.detail) return;

		this.submitting = true;
		this.actionError = undefined;

		try {
			const updated = await this.api.approve(
				this.session.user,
				this.detail.id,
				new Date().toISOString(),
			);
			this.state = { status: 'loaded', data: updated };
		} catch (err) {
			const message = (err as Error).message;
			await this.load();
			this.actionError = message;
		} finally {
			this.submitting = false;
		}
	}

	async reject(): Promise<void> {
		this.rejectControl.markAsTouched();
		const reason = this.rejectControl.value.trim();

		if (!reason || this.rejectControl.invalid || !this.canReject ||
			this.submitting || !this.detail) return;

		this.submitting = true;
		this.actionError = undefined;

		try {
			const updated = await this.api.reject(
				this.session.user,
				this.detail.id,
				new Date().toISOString(),
				reason,
			);
			this.state = { status: 'loaded', data: updated };
		} catch (err) {
			const message = (err as Error).message;
			await this.load();
			this.actionError = message;
		} finally {
			this.submitting = false;
		}
	}
}