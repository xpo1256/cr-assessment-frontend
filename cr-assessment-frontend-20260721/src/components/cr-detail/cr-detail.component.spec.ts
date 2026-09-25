import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});
	it('renders timeline entries from oldest to newest', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const detail = fixture.componentInstance.detail;

		expect(detail).not.toBeNull();
		if (!detail) return;

		const expectedActions = [...detail.audit]
			.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
			.map((entry) => entry.action);

		const renderedActions = Array.from(
			fixture.nativeElement.querySelectorAll('.cr-timeline__action'),
			(element) => (element as HTMLElement).textContent?.trim(),
		);

		expect(renderedActions).toEqual(expectedActions);
	});
	it('keeps Reject disabled until a real reason is entered', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const textarea: HTMLTextAreaElement =
			fixture.nativeElement.querySelector('.cr-actions__reason');
		const rejectButton: HTMLButtonElement =
			fixture.nativeElement.querySelector('.cr-actions__reject-btn');

		expect(rejectButton.disabled).toBe(true);

		textarea.value = '   ';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectButton.disabled).toBe(true);

		textarea.value = 'Incorrect quantity';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectButton.disabled).toBe(false);
	});
	it('rejects a pending CR and shows the reason in the timeline', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const textarea: HTMLTextAreaElement =
			fixture.nativeElement.querySelector('.cr-actions__reason');

		textarea.value = 'Incorrect quantity';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();

		const rejectButton: HTMLButtonElement =
			fixture.nativeElement.querySelector('.cr-actions__reject-btn');
		expect(rejectButton.disabled).toBe(false);

		rejectButton.click();
		fixture.detectChanges();
		await flush(); // ننتظر رد الـ mock API
		fixture.detectChanges();

		const status: HTMLElement =
			fixture.nativeElement.querySelector('.cr-detail__header .cr-status');
		const notes: NodeListOf<HTMLElement> =
			fixture.nativeElement.querySelectorAll('.cr-timeline__note');

		expect(status.textContent?.trim()).toBe('REJECTED');
		expect(notes[notes.length - 1].textContent).toContain('Incorrect quantity');
		expect(rejectButton.disabled).toBe(true);
	});
	it('disables Approve while submitting and sends only one request', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		const approveSpy = jest.spyOn(api, 'approve');
		const button: HTMLButtonElement =
			fixture.nativeElement.querySelector('.cr-actions__approve');

		button.click();
		fixture.detectChanges();

		expect(button.disabled).toBe(true);

		button.click(); // نحاول الضغط مرة ثانية قبل رد الـ API
		expect(approveSpy).toHaveBeenCalledTimes(1);

		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-status')?.textContent?.trim())
			.toBe('APPROVED');
	});
	it('shows an error and refreshes the CR after an approve request fails', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		api.failNext = true;

		const button: HTMLButtonElement =
			fixture.nativeElement.querySelector('.cr-actions__approve');

		button.click();
		fixture.detectChanges();

		await flush(); // استجابة approve الفاشلة
		await flush(); // استجابة getChangeRequest لإعادة قراءة الطلب
		fixture.detectChanges();

		const error: HTMLElement =
			fixture.nativeElement.querySelector('.cr-actions__error');
		const status: HTMLElement =
			fixture.nativeElement.querySelector('.cr-detail__header .cr-status');

		expect(error.textContent).toContain('Network error');
		expect(status.textContent?.trim()).toBe('APPROVED');
		expect(button.disabled).toBe(true);
	});
});
