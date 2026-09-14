import { ref, computed } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useDeviceStore } from '@/store/device';
import { showToast } from './useToast';

// Bank types for G2
const BANK_TYPES = ['patch', 'performance'] as const;

// Source types for bank download
const SOURCE_TYPES = ['pchList', 'folder'] as const;

type SourceType = (typeof SOURCE_TYPES)[number];

// Singleton state shared between the menu-action opener and the dialog component
export const showBankDownloadDialog = ref(false);
export const bankDownloadType = ref<'patch' | 'performance'>('patch');
export const bankDownloadBankNum = ref<number>(1);
export const bankDownloadSourceType = ref<SourceType>('pchList');
export const bankDownloadSourcePath = ref<string>('');
export const bankDownloadInProgress = ref<boolean>(false);
export const bankDownloadShowWarning = ref<boolean>(true);
export interface BankDownloadProgress {
	location: number;
	total: number;
	written: number;
	cleared: number;
	failed: number;
}
export const bankDownloadProgress = ref<BankDownloadProgress | null>(null);

export function useBankDownloadDialog() {
	const slotsStore = useSlotsStore();
	const deviceStore = useDeviceStore();

	const maxBank = computed(() => (bankDownloadType.value === 'performance' ? 8 : 32));
	const bankOptions = computed(() => {
		const max = maxBank.value;
		return Array.from({ length: max }, (_, i) => i + 1);
	});

	function open(): void {
		bankDownloadType.value = slotsStore.isPerformanceMode || deviceStore.isPerformanceMode ? 'performance' : 'patch';
		bankDownloadBankNum.value = 1;
		bankDownloadSourceType.value = 'pchList';
		bankDownloadSourcePath.value = '';
		bankDownloadShowWarning.value = true;
		bankDownloadProgress.value = null;
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
			const result = await window.electronAPI.selectBankFolder();
			if (result.success && result.folder) {
				bankDownloadSourcePath.value = result.folder;
			}
		}
	}

	async function confirm(): Promise<void> {
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
			const success = await slotsStore.downloadBankToDevice(source, bankDownloadBankNum.value, bankDownloadType.value);
			if (success) {
				showToast(`Bank downloaded to G2 bank ${bankDownloadBankNum.value} successfully`);
				cancel();
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
		bankDownloadSourcePath.value = '';
	}

	return {
		showDialog: showBankDownloadDialog,
		type: bankDownloadType,
		bankNum: bankDownloadBankNum,
		sourceType: bankDownloadSourceType,
		sourcePath: bankDownloadSourcePath,
		inProgress: bankDownloadInProgress,
		progress: bankDownloadProgress,
		showWarning: bankDownloadShowWarning,
		bankOptions,
		bankTypes: BANK_TYPES,
		sourceTypes: SOURCE_TYPES,
		open,
		confirm,
		cancel,
		setSourceType,
		selectSource,
	};
}
