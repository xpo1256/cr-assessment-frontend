import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrListComponent } from './cr-list.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser): Promise<ComponentFixture<CrListComponent>> {
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrListComponent);
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded/empty state
	return fixture;
}

describe('CrListComponent', () => {
	it('renders a row per change request in the user org', async () => {
		const fixture = await render(users.approver);
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3); // org-alpha: CR-1, CR-2, CR-3
	});

	it('shows the empty state when the org has no change requests', async () => {
		const fixture = await render({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('filters the rendered rows by status and restores them with ALL', async () => {
		const fixture = await render(users.approver);
		const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');

		select.value = 'PENDING_APPROVAL';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();

		const rows: NodeListOf<HTMLTableRowElement> =
			fixture.nativeElement.querySelectorAll('.cr-list__row');

		expect(rows.length).toBe(1);
		expect(rows[0].textContent).toContain('CR-1');

		select.value = 'REJECTED';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(0);
		expect(fixture.nativeElement.querySelector('.cr-list__empty')?.textContent)
			.toContain('No change requests match this status');

		select.value = 'ALL';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3);
	});
	it('shows loading before the API responds, then shows the rows', async () => {
		TestBed.configureTestingModule({
			imports: [CrListComponent],
			providers: [{ provide: SessionService, useValue: { user: users.approver } }],
		});
		await TestBed.compileComponents();

		const fixture = TestBed.createComponent(CrListComponent);
		fixture.detectChanges(); // يبدأ ngOnInit طلب البيانات

		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();

		await flush(); // الآن يرجع الـ mock API
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-list__loading')).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3);
	});
	it('shows an API error and loads rows after Retry', async () => {
		TestBed.configureTestingModule({
			imports: [CrListComponent],
			providers: [{ provide: SessionService, useValue: { user: users.approver } }],
		});
		await TestBed.compileComponents();

		const api = TestBed.inject(CrApiService);
		api.failNext = true; // نخلي أول طلب يفشل

		const fixture = TestBed.createComponent(CrListComponent);
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		const error: HTMLElement =
			fixture.nativeElement.querySelector('.cr-list__error');
		expect(error.textContent).toContain('Network error');
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();

		const retryButton = error.querySelector<HTMLButtonElement>('button');
		expect(retryButton).not.toBeNull();
		if (!retryButton) throw new Error('Retry button was not rendered');

		retryButton.click();
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-list__error')).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3);
	});
});
