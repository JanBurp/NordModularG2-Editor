import { ref, computed, watch } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useDeviceStore } from '@/store/device';
import { useSettingsStore } from '@/store/settings';
import { bankSizeFor, defaultBankKind } from '@/constants/ui';
import { showToast } from './useToast';

// Source types for bank download
type SourceType = 'pchList' | 'folder';

// Singleton state shared between the menu-action opener and the dialog component
export const showBankDownloadDialog = ref(false);
export const bankDownloadType = ref<'patch' | 'performance'>('patch');
export const bankDownloadBankNum = ref<number>(1);
export const bankDownloadSourceType = ref<SourceType>('pchList');
export const bankDownloadSourcePath = ref<string>('');
export const bankDownloadInProgress = ref<boolean>(false);
// Type and bank pre-filled by the caller (Bank Organizer column) and not changeable
export const bankDownloadLocked = ref<boolean>(false);
export const bankDownloadReloadingNames = ref<boolean>(false);
export const bankDownloadShowWarning = ref<boolean>(true);
export interface BankDownloadProgress {
	location: number;
	total: number;
	written: number;
	cleared: number;
	failed: number;
	name: string;
}
export const bankDownloadProgress = ref<BankDownloadProgress | null>(null);

// One-shot wait/notify pair so downloadBankToDevice() can await the "names"
// watch event actually landing, instead of firing reload-names and returning early.
let namesReloadedResolvers: Array<() => void> = [];
export function notifyNamesReloaded(): void {
	namesReloadedResolvers.forEach((r) => r());
	namesReloadedResolvers = [];
}
export function waitForNamesReload(timeoutMs = 5000): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, timeoutMs); // safety net if device disconnects mid-reload
		namesReloadedResolvers.push(() => {
			clearTimeout(timer);
			resolve();
		});
	});
}

export function useBankDownloadDialog() {
	const slotsStore = useSlotsStore();
	const deviceStore = useDeviceStore();
	const settings = useSettingsStore();

	const maxBank = computed(() => bankSizeFor(bankDownloadType.value));
	const bankOptions = computed(() => {
		const max = maxBank.value;
		return Array.from({ length: max }, (_, i) => i + 1);
	});

	watch(bankDownloadType, () => {
		if (bankDownloadBankNum.value > maxBank.value) bankDownloadBankNum.value = maxBank.value;
	});

	function open(opts?: { type?: 'patch' | 'performance'; bankNum?: number; locked?: boolean }): void {
		// Re-opening mid-transfer must keep the running progress visible, not reset it
		if (bankDownloadInProgress.value) {
			showBankDownloadDialog.value = true;
			return;
		}
		bankDownloadType.value = opts?.type ?? defaultBankKind(slotsStore.isPerformanceMode, deviceStore.isHardwarePerformanceMode);
		bankDownloadBankNum.value = opts?.bankNum ?? 1;
		bankDownloadLocked.value = opts?.locked ?? false;
		bankDownloadSourceType.value = 'pchList';
		bankDownloadSourcePath.value = '';
		bankDownloadShowWarning.value = true;
		bankDownloadProgress.value = null;
		bankDownloadReloadingNames.value = false;
		showBankDownloadDialog.value = true;
	}

	function cancel(): void {
		showBankDownloadDialog.value = false;
	}

	async function selectSource(): Promise<void> {
		if (bankDownloadSourceType.value === 'pchList') {
			const result = await window.electronAPI.selectPchListFile();
			if (result.success && result.filepath) {
				bankDownloadSourcePath.value = result.filepath;
			}
		} else {
			const result = await window.electronAPI.selectBankFolder(bankDownloadSourcePath.value || settings.bankFolder);
			if (result.success && result.folder) {
				bankDownloadSourcePath.value = result.folder;
				settings.setBankFolder(result.folder);
			}
		}
	}

	async function confirm(): Promise<void> {
		if (bankDownloadInProgress.value) return;
		if (!bankDownloadSourcePath.value) {
			showToast('Please select a source .pchList file or folder');
			return;
		}

		bankDownloadInProgress.value = true;
		bankDownloadProgress.value = null;
		try {
			const source: { type: 'pchList'; filepath: string } | { type: 'folder'; folderPath: string } =
				bankDownloadSourceType.value === 'pchList'
					? { type: 'pchList', filepath: bankDownloadSourcePath.value }
					: { type: 'folder', folderPath: bankDownloadSourcePath.value };
			const result = await slotsStore.downloadBankToDevice(source, bankDownloadBankNum.value, bankDownloadType.value);
			if (result) {
				if (result.aborted) {
					console.error('send-bank aborted:', result.abortReason, result.failures);
					showToast(`Bank upload stopped early: ${result.abortReason} (${result.written} written, ${result.cleared} cleared before stopping)`);
				} else if (result.failed > 0) {
					console.warn('send-bank: patches skipped:', result.failures);
					const shown = result.failures
						.slice(0, 3)
						.map((f) => `loc ${f.location} (${f.name}): ${f.reason}`)
						.join('; ');
					const more = result.failures.length > 3 ? `; +${result.failures.length - 3} more` : '';
					showToast(`Bank ${bankDownloadBankNum.value}: ${result.failed} patch(es) skipped - ${shown}${more}`);
				} else {
					showToast(`Bank downloaded to G2 bank ${bankDownloadBankNum.value} successfully`);
				}
				cancel();
			} else {
				showToast('Bank download failed - check the device connection');
			}
		} catch (err) {
			console.error('Bank download failed:', err);
			showToast('Failed to download bank to G2');
		} finally {
			bankDownloadInProgress.value = false;
		}
	}

	function setSourceType(type: SourceType): void {
		bankDownloadSourceType.value = type;
		bankDownloadSourcePath.value = type === 'folder' ? settings.bankFolder : '';
	}

	return {
		showDialog: showBankDownloadDialog,
		type: bankDownloadType,
		bankNum: bankDownloadBankNum,
		sourceType: bankDownloadSourceType,
		sourcePath: bankDownloadSourcePath,
		inProgress: bankDownloadInProgress,
		locked: bankDownloadLocked,
		reloadingNames: bankDownloadReloadingNames,
		progress: bankDownloadProgress,
		showWarning: bankDownloadShowWarning,
		bankOptions,
		open,
		confirm,
		cancel,
		setSourceType,
		selectSource,
	};
}
