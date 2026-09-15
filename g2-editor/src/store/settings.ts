import { defineStore } from 'pinia';

export type ThemeMode = 'system' | 'light' | 'dark';
export type PaneTab = 'browser' | 'modules' | 'midicc' | 'text' | 'settings' | '';
export type KnobMode = 'vertical' | 'horizontal' | 'circular';
export type ToolbarMode = 'hidden' | 'classic' | 'compact';
export type RecentFile = { path: string; kind: 'patch' | 'performance' };

const MAX_RECENT_FILES = 20;

export const useSettingsStore = defineStore('settings', {
	state: () => ({
		path: '' as string,
		hidden_modules: false as boolean,
		categoriesExpanded: true as boolean,
		theme: 'system' as ThemeMode,
		cableGravity: 50 as number,
		cableOpacity: 90 as number,
		cableThickness: 1 as number,
		rightPaneTab: '' as PaneTab,
		showRightPane: false as boolean,
		toolbarMode: 'classic' as ToolbarMode,
		showVirtualKeyboard: false as boolean,
		showParamPages: false as boolean,
		browserSortMode: 'location' as 'location' | 'name' | 'name-desc' | 'category',
		browserView: 'patches' as 'disk' | 'patches' | 'performances',
		browserCollapsedBanks: [] as number[],
		knobMode: 'vertical' as KnobMode,
		knobSensitivity: 1 as number,
		canvasZoom: 1 as number,
		recentFiles: [] as RecentFile[],
	}),
	actions: {
		addRecentFile(path: string, kind: RecentFile['kind']) {
			this.recentFiles = [{ path, kind }, ...this.recentFiles.filter((f) => f.path !== path)].slice(0, MAX_RECENT_FILES);
			// IPC uses structured clone, which chokes on Pinia's reactive Proxy — send plain objects.
			window.electronAPI?.updateRecentFiles(this.recentFiles.map((f) => ({ ...f })));
		},
		cycleToolbarMode() {
			const order: ToolbarMode[] = ['hidden', 'classic', 'compact'];
			this.toolbarMode = order[(order.indexOf(this.toolbarMode) + 1) % order.length];
		},
		toggleVirtualKeyboard() {
			this.showVirtualKeyboard = !this.showVirtualKeyboard;
		},
		toggleParamPages() {
			this.showParamPages = !this.showParamPages;
		},
		toggleSidebar(tab: PaneTab) {
			if (this.rightPaneTab === tab) {
				this.showRightPane = !this.showRightPane;
				if (this.showRightPane === false) {
					this.rightPaneTab = '';
				}
			} else {
				this.rightPaneTab = tab;
				this.showRightPane = true;
			}
		},
		setPath(value: string) {
			this.path = value;
		},
		setHiddenModules(value: boolean) {
			this.hidden_modules = value;
		},
		setCategoriesExpanded(value: boolean) {
			this.categoriesExpanded = value;
		},
		setTheme(value: ThemeMode) {
			this.theme = value;
			window.electronAPI?.setTheme(value);
		},
		setCableGravity(value: number) {
			this.cableGravity = Math.max(0, Math.min(100, value));
		},
		setCableOpacity(value: number) {
			this.cableOpacity = Math.max(0, Math.min(100, value));
		},
		setCableThickness(value: number) {
			this.cableThickness = Math.max(0, Math.min(10, value));
		},
		setKnobMode(value: KnobMode) {
			this.knobMode = value;
		},
		setKnobSensitivity(value: number) {
			this.knobSensitivity = Math.max(0.1, Math.min(10, value));
		},
		setCanvasZoom(value: number) {
			this.canvasZoom = Math.max(0.25, Math.min(3, value));
		},
		zoomIn() {
			this.setCanvasZoom(this.canvasZoom + 0.1);
		},
		zoomOut() {
			this.setCanvasZoom(this.canvasZoom - 0.1);
		},
		resetCanvasZoom() {
			this.canvasZoom = 1;
		},
	},
	persist: true,
});
