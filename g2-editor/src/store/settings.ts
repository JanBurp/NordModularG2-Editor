import { clamp } from '@/utils/math';
import { defineStore } from 'pinia';

export type ThemeMode = 'system' | 'light' | 'dark';
export type PaneTab = 'browser' | 'modules' | 'midicc' | 'text' | 'settings' | '';
export type KnobMode = 'vertical' | 'horizontal' | 'circular';
export type ToolbarMode = 'hidden' | 'classic' | 'compact';
export type SettingsSection = 'Patch Settings' | 'Performance Settings' | 'Synth Settings' | 'Editor Settings';
export type CableConnectMode = 'drag' | 'click';
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
		cableThickness: 1.5 as number,
		cableMagneticRadius: 96 as number,
		cableConnectMode: 'drag' as CableConnectMode,
		autoSuggestCable: false as boolean,
		rightPaneTab: '' as PaneTab,
		showRightPane: false as boolean,
		settingsSection: null as SettingsSection | null,
		toolbarMode: 'classic' as ToolbarMode,
		showVirtualKeyboard: false as boolean,
		showParamPages: false as boolean,
		browserSortMode: 'location' as 'location' | 'name' | 'name-desc' | 'category',
		browserView: 'patches' as 'disk' | 'patches' | 'performances',
		browserCollapsedBanks: [] as number[],
		knobMode: 'vertical' as KnobMode,
		knobSensitivity: 1 as number,
		wheelReverse: false as boolean,
		wheelSensitivity: 1 as number,
		wheelPreventScroll: false as boolean,
		canvasZoom: 1 as number,
		recentFiles: [] as RecentFile[],
		bankFolder: '' as string,
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
			this.settingsSection = null;
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
		openSettingsSection(section: SettingsSection) {
			if (this.showRightPane && this.rightPaneTab === 'settings' && this.settingsSection === section) {
				this.showRightPane = false;
				this.rightPaneTab = '';
				this.settingsSection = null;
				return;
			}
			this.rightPaneTab = 'settings';
			this.showRightPane = true;
			this.settingsSection = section;
		},
		setPath(value: string) {
			this.path = value;
		},
		setBankFolder(value: string) {
			this.bankFolder = value;
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
			this.cableGravity = clamp(value, 0, 200);
		},
		setCableOpacity(value: number) {
			this.cableOpacity = clamp(value, 0, 100);
		},
		setCableThickness(value: number) {
			this.cableThickness = clamp(value, 0, 3);
		},
		setCableMagneticRadius(value: number) {
			this.cableMagneticRadius = clamp(value, 0, 115);
		},
		setCableConnectMode(value: CableConnectMode) {
			this.cableConnectMode = value;
		},
		setAutoSuggestCable(value: boolean) {
			this.autoSuggestCable = value;
		},
		setKnobMode(value: KnobMode) {
			this.knobMode = value;
		},
		setKnobSensitivity(value: number) {
			this.knobSensitivity = clamp(value, 0.1, 10);
		},
		setWheelReverse(value: boolean) {
			this.wheelReverse = value;
		},
		setWheelSensitivity(value: number) {
			this.wheelSensitivity = clamp(value, 0.25, 4);
		},
		setWheelPreventScroll(value: boolean) {
			this.wheelPreventScroll = value;
		},
		setCanvasZoom(value: number) {
			this.canvasZoom = clamp(value, 0.25, 3);
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
	persist: {
		// Restored state bypasses the setters; re-clamp values whose range has shrunk.
		afterRestore: ({ store }) => {
			store.setCableGravity(store.cableGravity);
			store.setCableThickness(store.cableThickness);
		},
	},
});
