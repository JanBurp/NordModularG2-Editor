import { defineStore } from 'pinia';

export type ThemeMode = 'system' | 'light' | 'dark';

export const useSettingsStore = defineStore('settings', {
	state: () => ({
		path: '' as string,
		hidden_modules: false as boolean,
		theme: 'system' as ThemeMode,
		cableGravity: 50 as number,
		cableOpacity: 90 as number,
		cableThickness: 1 as number,
	}),
	actions: {
		setPath(value: string) {
			this.path = value;
		},
		setHiddenModules(value: boolean) {
			this.hidden_modules = value;
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
