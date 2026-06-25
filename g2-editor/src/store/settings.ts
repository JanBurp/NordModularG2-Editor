import { defineStore } from 'pinia';

export type ThemeMode = 'system' | 'light' | 'dark';
export type PaneTab = 'browser' | 'modules' | 'midicc' | 'settings' | '';

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
		browserSortMode: 'location' as 'location' | 'name' | 'name-desc' | 'category',
		browserView: 'patches' as 'disk' | 'patches' | 'performances',
		browserCollapsedBanks: [] as number[],
	}),
	actions: {
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
			this.cableGravity = value;
		},
		setCableOpacity(value: number) {
			this.cableOpacity = value;
		},
		setCableThickness(value: number) {
			this.cableThickness = value;
		},
	},
	persist: true,
});
