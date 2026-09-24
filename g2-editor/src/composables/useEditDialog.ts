import { ref } from 'vue';

// Shared by useBpmDialog/usePatchNameDialog/usePerfNameDialog/useMorphLabelDialog: a dialog
// editing a single value (plus, when the caller needs to know *which* thing it's editing, an
// optional context — e.g. useMorphLabelDialog's group index). confirm() awaits the caller's save
// callback, logs+swallows any error, and always hides the dialog.
export function useEditDialog<T, C = undefined>(initial: T, errorLabel: string, save: (value: T, context: C | undefined) => Promise<void>) {
	const showDialog = ref(false);
	const editingValue = ref<T>(initial);
	const context = ref<C | undefined>(undefined);

	function open(value: T, ctx?: C): void {
		editingValue.value = value;
		context.value = ctx;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		try {
			await save(editingValue.value, context.value);
		} catch (e: any) {
			console.error(`${errorLabel} failed:`, e?.message ?? e);
		} finally {
			showDialog.value = false;
		}
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, editingValue, open, confirm, cancel };
}
