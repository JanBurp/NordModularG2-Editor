import { ref, computed, watch } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useDeviceStore } from '@/store/device';
import { useSettingsStore } from '@/store/settings';
import { bankSizeFor, defaultBankKind } from '@/constants/ui';
import { showToast } from './useToast';

// Singleton state shared between the menu-action opener and the dialog component
export const showBankUploadDialog = ref(false);
export const bankUploadType = ref<'patch' | 'performance'>('patch');
export const bankUploadBankNum = ref<number>(1);
export const bankUploadFolder = ref<string>('');
export const bankUploadFilename = ref<string>('');
export const bankUploadInProgress = ref<boolean>(false);
export interface BankUploadProgress {
	location: number;
	total: number;
	written: number;
	empty: number;
	corrupt: number;
	name: string;
}
export const bankUploadProgress = ref<BankUploadProgress | null>(null);

export function useBankUploadDialog() {
	const slotsStore = useSlotsStore();
	const deviceStore = useDeviceStore();
	const settings = useSettingsStore();

	const maxBank = computed(() => bankSizeFor(bankUploadType.value));
	const bankOptions = computed(() => {
		const max = maxBank.value;
		return Array.from({ length: max }, (_, i) => i + 1);
	});

	watch(bankUploadType, () => {
		if (bankUploadBankNum.value > maxBank.value) bankUploadBankNum.value = maxBank.value;
	});

	function open(opts?: { type?: 'patch' | 'performance'; bankNum?: number }): void {
		// Re-opening mid-transfer must keep the running progress visible, not reset it
		if (bankUploadInProgress.value) {
			showBankUploadDialog.value = true;
			return;
		}
		bankUploadType.value = opts?.type ?? defaultBankKind(slotsStore.isPerformanceMode, deviceStore.isHardwarePerformanceMode);
		bankUploadBankNum.value = opts?.bankNum ?? 1;
		bankUploadFolder.value = settings.bankFolder;
		bankUploadFilename.value = '';
		bankUploadProgress.value = null;
		showBankUploadDialog.value = true;
	}

	function cancel(): void {
		showBankUploadDialog.value = false;
	}

	async function selectFolder(): Promise<void> {
		const result = await window.electronAPI.selectBankFolder(bankUploadFolder.value || settings.bankFolder);
		if (result.success && result.folder) {
			bankUploadFolder.value = result.folder;
			settings.setBankFolder(result.folder);
		}
	}

	async function confirm(): Promise<void> {
		if (bankUploadInProgress.value) return;
		if (!bankUploadFolder.value) {
			showToast('Please select a destination folder');
			return;
		}

		bankUploadInProgress.value = true;
		bankUploadProgress.value = null;
		try {
			const success = await slotsStore.uploadBankFromDevice(
				bankUploadType.value,
				bankUploadBankNum.value,
				bankUploadFolder.value,
				bankUploadFilename.value || undefined,
			);
			if (success) {
				showToast(`Bank ${bankUploadBankNum.value} uploaded from G2 successfully`);
				cancel();
			} else {
				showToast('Bank upload failed - check the device connection');
			}
		} catch (err) {
			console.error('Bank upload failed:', err);
			showToast('Failed to upload bank from G2');
		} finally {
			bankUploadInProgress.value = false;
		}
	}

	return {
		showDialog: showBankUploadDialog,
		type: bankUploadType,
		bankNum: bankUploadBankNum,
		folder: bankUploadFolder,
		filename: bankUploadFilename,
		inProgress: bankUploadInProgress,
		progress: bankUploadProgress,
		bankOptions,
		open,
		confirm,
		cancel,
		selectFolder,
	};
}
