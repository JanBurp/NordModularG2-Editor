import { ref, computed } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useDeviceStore } from '@/store/device';
import { showToast } from './useToast';

// Bank types for G2
const BANK_TYPES = ['patch', 'performance'] as const;

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

	const maxBank = computed(() => (bankUploadType.value === 'performance' ? 8 : 32));
	const bankOptions = computed(() => {
		const max = maxBank.value;
		return Array.from({ length: max }, (_, i) => i + 1);
	});

	function open(): void {
		bankUploadType.value = slotsStore.isPerformanceMode || deviceStore.isPerformanceMode ? 'performance' : 'patch';
		bankUploadBankNum.value = 1;
		bankUploadFolder.value = '';
		bankUploadFilename.value = '';
		bankUploadProgress.value = null;
		showBankUploadDialog.value = true;
	}

	function cancel(): void {
		showBankUploadDialog.value = false;
	}

	async function selectFolder(): Promise<void> {
		const result = await window.electronAPI.selectBankFolder();
		if (result.success && result.folder) {
			bankUploadFolder.value = result.folder;
		}
	}

	async function confirm(): Promise<void> {
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
		bankTypes: BANK_TYPES,
		open,
		confirm,
		cancel,
		selectFolder,
	};
}
