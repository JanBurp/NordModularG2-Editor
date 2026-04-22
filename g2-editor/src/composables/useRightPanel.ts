import { ref } from "vue";

export type PaneTab = "browser" | "modules" | "data" | "usb";

export function useRightPanel() {
	const rightPaneTab = ref<PaneTab>("usb");
	const showRightPane = ref<boolean>(true);

	function toggleSidebar(tab: PaneTab): void {
		if (rightPaneTab.value === tab && showRightPane.value) {
			showRightPane.value = false;
		} else {
			rightPaneTab.value = tab;
			showRightPane.value = true;
		}
	}

	function handleToggleOff(tab: PaneTab): void {
		if (showRightPane.value) {
			showRightPane.value = false;
		} else {
			rightPaneTab.value = tab;
			showRightPane.value = true;
		}
	}

	return {
		// State
		rightPaneTab,
		showRightPane,
		// Actions
		toggleSidebar,
		handleToggleOff,
	};
}
