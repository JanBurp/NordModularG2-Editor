import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDeviceStore, DeviceStatus } from '@/store/device';
import {
	useBankUploadDialog,
	showBankUploadDialog,
	bankUploadType,
	bankUploadBankNum,
	bankUploadFolder,
	bankUploadFilename,
	bankUploadInProgress,
	bankUploadProgress,
} from '../useBankUploadDialog';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined) }, electronAPI: { selectBankFolder: vi.fn() } };
	showBankUploadDialog.value = false;
	bankUploadType.value = 'patch';
	bankUploadBankNum.value = 1;
	bankUploadFolder.value = '';
	bankUploadFilename.value = '';
	bankUploadInProgress.value = false;
	bankUploadProgress.value = null;
});

describe('useBankUploadDialog — open/cancel', () => {
	it('open() resets state and defaults type/bank from opts', () => {
		const dialog = useBankUploadDialog();
		dialog.open({ type: 'performance', bankNum: 3 });

		expect(dialog.showDialog.value).toBe(true);
		expect(dialog.type.value).toBe('performance');
		expect(dialog.bankNum.value).toBe(3);
		expect(dialog.folder.value).toBe('');
	});

	it('cancel() closes the dialog', () => {
		const dialog = useBankUploadDialog();
		dialog.open();
		dialog.cancel();

		expect(dialog.showDialog.value).toBe(false);
	});
});

describe('useBankUploadDialog — confirm()', () => {
	it('does nothing when a folder has not been selected', async () => {
		const dialog = useBankUploadDialog();
		useDeviceStore().status = DeviceStatus.Connected;

		await dialog.confirm();

		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('no-ops when an upload is already in flight', async () => {
		const dialog = useBankUploadDialog();
		dialog.folder.value = '/tmp/dest';
		bankUploadInProgress.value = true;

		await dialog.confirm();

		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('uploads the bank and closes the dialog on success', async () => {
		const dialog = useBankUploadDialog();
		useDeviceStore().status = DeviceStatus.Connected;
		dialog.open({ type: 'patch', bankNum: 5 });
		dialog.folder.value = '/tmp/dest';

		await dialog.confirm();

		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['get-bank', 'patch', '5', '/tmp/dest', 'PatchBank5']);
		expect(dialog.showDialog.value).toBe(false);
		expect(dialog.inProgress.value).toBe(false);
	});

	it('keeps the dialog open and leaves inProgress false when the upload fails', async () => {
		const dialog = useBankUploadDialog();
		useDeviceStore().status = DeviceStatus.Disconnected; // uploadBankFromDevice no-ops -> false
		dialog.open();
		dialog.folder.value = '/tmp/dest';

		await dialog.confirm();

		expect(dialog.showDialog.value).toBe(true);
		expect(dialog.inProgress.value).toBe(false);
	});
});
