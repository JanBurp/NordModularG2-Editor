import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDeviceStore, DeviceStatus } from '@/store/device';
import {
	useBankDownloadDialog,
	showBankDownloadDialog,
	bankDownloadType,
	bankDownloadBankNum,
	bankDownloadSourceType,
	bankDownloadSourcePath,
	bankDownloadInProgress,
	bankDownloadProgress,
	notifyNamesReloaded,
} from '../useBankDownloadDialog';

function bankResultJson(overrides: Partial<Record<string, unknown>> = {}): string {
	return JSON.stringify({ written: 2, cleared: 126, failed: 0, failures: [], aborted: false, ...overrides });
}

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = {
		cli: { run: vi.fn().mockResolvedValue(undefined) },
		electronAPI: { selectBankFolder: vi.fn(), selectPchListFile: vi.fn() },
	};
	showBankDownloadDialog.value = false;
	bankDownloadType.value = 'patch';
	bankDownloadBankNum.value = 1;
	bankDownloadSourceType.value = 'pchList';
	bankDownloadSourcePath.value = '';
	bankDownloadInProgress.value = false;
	bankDownloadProgress.value = null;
});

// downloadBankToDevice awaits waitForNamesReload() (5s safety-net timer) after
// send-bank succeeds - resolve it immediately, same as the real "names" watch
// event notifying it, so these tests don't need fake timers.
function mockSendBankSuccess(result = bankResultJson()) {
	(globalThis as any).window.cli.run = vi.fn().mockImplementation(async (args: string[]) => {
		if (args[0] === 'reload-names') {
			Promise.resolve().then(notifyNamesReloaded);
			return undefined;
		}
		return result;
	});
}

describe('useBankDownloadDialog — open/cancel', () => {
	it('open() resets state and defaults type/bank from opts', () => {
		const dialog = useBankDownloadDialog();
		dialog.open({ type: 'performance', bankNum: 4 });

		expect(dialog.showDialog.value).toBe(true);
		expect(dialog.type.value).toBe('performance');
		expect(dialog.bankNum.value).toBe(4);
		expect(dialog.sourcePath.value).toBe('');
	});
});

describe('useBankDownloadDialog — confirm()', () => {
	it('does nothing when a source path has not been selected', async () => {
		const dialog = useBankDownloadDialog();
		useDeviceStore().status = DeviceStatus.Connected;

		await dialog.confirm();

		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('no-ops when a download is already in flight', async () => {
		const dialog = useBankDownloadDialog();
		dialog.sourcePath.value = '/tmp/Bank1.pchList';
		bankDownloadInProgress.value = true;

		await dialog.confirm();

		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('downloads the bank and closes the dialog on a clean success', async () => {
		const dialog = useBankDownloadDialog();
		useDeviceStore().status = DeviceStatus.Connected;
		mockSendBankSuccess();
		dialog.open({ type: 'patch', bankNum: 5 });
		dialog.sourceType.value = 'pchList';
		dialog.sourcePath.value = '/tmp/Bank1.pchList';

		await dialog.confirm();

		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['send-bank', 'patch', 'pchList', '/tmp/Bank1.pchList', '5']);
		expect(dialog.showDialog.value).toBe(false);
		expect(dialog.inProgress.value).toBe(false);
	});

	it('still closes the dialog when send-bank reports partial failures (only the toast differs)', async () => {
		const dialog = useBankDownloadDialog();
		useDeviceStore().status = DeviceStatus.Connected;
		mockSendBankSuccess(bankResultJson({ failed: 1, failures: [{ location: 3, name: 'Bad.pch2', reason: 'device refused write' }] }));
		dialog.open();
		dialog.sourceType.value = 'folder';
		dialog.sourcePath.value = '/tmp/src';

		await dialog.confirm();

		// confirm() calls cancel() on every non-null result, including partial failures -
		// same as the clean-success path; the distinct toast is the only difference.
		expect(dialog.showDialog.value).toBe(false);
	});

	it('leaves the dialog open when the download fails outright', async () => {
		const dialog = useBankDownloadDialog();
		useDeviceStore().status = DeviceStatus.Disconnected; // downloadBankToDevice no-ops -> null
		dialog.open();
		dialog.sourcePath.value = '/tmp/Bank1.pchList';

		await dialog.confirm();

		expect(dialog.showDialog.value).toBe(true);
		expect(dialog.inProgress.value).toBe(false);
	});
});
