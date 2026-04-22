# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

- `cli/` — C CLI tool for USB communication with the Nord G2 hardware
- `g2-editor/` — Electron desktop app (Vue 3 + TypeScript)

## Commands

### CLI (C tool)
```bash
cd cli && make          # build
cd cli && make test     # run tests
./cli/build/bin/g2-cli --help
```

### Electron GUI
```bash
cd g2-editor
npm install
cd ../cli && make && cd ../g2-editor   # rebuild CLI first
npm run postinstall     # copies CLI binary into Electron app
npm run dev             # development server
npm run build           # production build + package
npm run preview         # preview production build
```

The `@/` path alias resolves to `g2-editor/src/`.

## Architecture

This is an **Electron + Vue 3** desktop app for editing Nord G2 synthesizer patches.

### Process Model
- **Electron main** (`electron/main.ts`) — spawns the `g2-cli` C binary as a child process for all USB/device communication
- **Preload** (`electron/preload.ts`) — exposes `window.cli.run()` to the renderer via `contextBridge`
- **Renderer** (`src/`) — Vue 3 SPA; talks to hardware only through the IPC bridge

### State & Business Logic
State lives in **composables**, not Pinia (Pinia is present but barely used):

| Composable | Owns |
|---|---|
| `usePatchManager()` | Loaded patch, area/variation selection, module + cable lists |
| `useG2Connection()` | USB device status, upload/download, log output |
| `useCableVisibility()` | Per-color cable show/hide toggles |
| `useCableShake()` | Animation trigger |
| `useRightPanel()` | Right sidebar tab selection |
| `usePatchCategory()` | Category filter |

`App.vue` is the composition root — it instantiates the composables and passes state/handlers down as props.

### Key Data Flow
1. User opens a `.pch2` file → `usePatchManager.handleFileLoad()` → parser in `src/parser/` → reactive `patch` ref
2. USB ops → `useG2Connection` → `window.cli.run()` → Electron IPC → spawned `g2-cli` binary → events back to renderer
3. `PatchCanvas.vue` renders modules and cables from `currentModules` / `currentCables` computed values

### Styling
Tailwind CSS v4 (via `@tailwindcss/vite` plugin). Global styles in `src/style.css`. No separate Tailwind config file — configuration is done in CSS.

### No test framework for the renderer
Only the C CLI (`cli/`) has tests (`make test`). The Vue/Electron side has no test runner configured.
