// Copyright (C) 2026 Jan den Besten
// SPDX-License-Identifier: AGPL-3.0-or-later

import './style.css';

import App from './App.vue';
import { createApp } from 'vue';
import { createPinia } from 'pinia';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
