// Copyright (C) 2026 Jan den Besten
// SPDX-License-Identifier: AGPL-3.0-or-later

import './style.css';

import App from './App.vue';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { useSettingsStore } from './store/settings';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
app.use(pinia);

const settings = useSettingsStore();
window.electronAPI?.setTheme(settings.theme);
// Every device view shares localStorage; follow setting changes made in another view.
window.addEventListener('storage', (e) => {
	if (e.key === settings.$id) settings.$hydrate({ runHooks: true });
});

app.mount('#app');
