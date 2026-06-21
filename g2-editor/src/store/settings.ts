import { defineStore } from 'pinia';

export type ThemeMode = 'system' | 'light' | 'dark';

export const useSettingsStore = defineStore('settings', {
	state: () => ({
		path: '' as string,
		hidden_modules: false as boolean,
		theme: 'system' as ThemeMode,
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
	},
	persist: true,
});
