# CLAUDE.md

## Project Context
Editor for the Nord Modular G2 synthesizer. USB layer in C, Electron (Vue 3 + TypeScript) frontend. Changes often flow across all layers.

## Workflow Discipline
- Bug fixes: stay focused on the file/command mentioned. Don't explore unrelated files.
- Code review: clarify scope (commit, branch range, or working tree) before starting.
- After multi-file TypeScript edits: run `npm run typecheck` before reporting success.

## Coding Guidelines

### 1. Think Before Coding
- State assumptions explicitly. If uncertain or multiple interpretations exist, ask.
- If something is unclear, name it and ask — even for typos.

### 2. Simplicity First
- Minimum code that solves the problem. Nothing speculative.
- No features, flexibility, or error handling beyond what was asked.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
- Touch only what the task requires. Match existing style.
- Mention (don't fix) unrelated improvements, dead code, or simplification opportunities you notice.
- Remove imports/variables YOUR changes made unused; leave pre-existing dead code alone.

### 4. Goal-Driven Execution
- For multi-step tasks, state a brief plan with verify steps before starting.
- Loop until criteria are met. Avoid weak criteria like "make it work".

## Repository Structure
- `cli/` — C CLI tool for USB communication with the Nord G2 hardware
- `g2-editor/` — Electron desktop app (Vue 3 + TypeScript)
- `test-patches/` — Sample `.pch2` patch files for testing
- `doc/` — Architectural documentation

## Commands

### CLI (C tool)
```bash
cd cli && make          # build
cd cli && make test     # run tests
./cli/build/bin/g2-cli --help
cd cli && ./g2tmux.sh   # tmux split: daemon output + command shell (recommended)
```

### Electron GUI
```bash
cd g2-editor && npm install
cd ../cli && make && cd ../g2-editor   # rebuild CLI first
npm run postinstall     # copies CLI binary into Electron app
npm run dev             # development server
npm run build           # production build + package
npm test                # Vitest unit tests
```
`@/` resolves to `g2-editor/src/`.

## State & Business Logic
Pinia stores (`src/store/`) are the single source of truth.

| Store | File | Purpose |
|-------|------|---------|
| slots | `slots.ts` | Patch data for 4 slots (A–D): loading, parsing, mutations |
| device | `device.ts` | Connection state, device info, slot info, BPM |
| ui | `ui.ts` | Active slot/area, right pane tab, selected module/cable |
| browser | `browser.ts` | Patch browser state, synth patches, performances, disk nav |

### Key Composables (`src/composables/`)
- `useG2.ts` — device connection/startup/status polling
- `usePatchFile.ts` — file load/save via IPC bridge
- `useJackPatching.ts` — cable add/delete logic
- `useCableVisibility.ts` — cable filtering/visibility
- `useModuleControls.ts` — knob/slider/mode parameter changes

### Parser & Mutations (`src/parser/`)
- `nmg2PatchParser.ts` — parses `.pch2` binary format into JS objects
- `nmg2PatchSerializer.ts` — serializes patches back to binary
- `patchMutations.ts` — immutable mutations (add/delete/move modules & cables, set color/label)
- `g2usb.ts` — USB protocol abstraction

### Renderer Data (`src/renderer/`)
- `nmg2mods.ts` — module definition database (200+ modules, ~162KB)
- `parammap.ts` — parameter metadata mappings
- `moduleRenderer.ts` / `cableRenderer.ts` — SVG rendering logic

### Components (`src/components/`)
- `canvas/` — `PatchCanvas.vue`, `Module.vue`, knob/slider/switch/jack/visual elements
- `panels/` — `SidePanel.vue`, `ModulesPane.vue`, `PatchBrowser.vue`
- `toolbar/` — `ToolBar.vue`, `StatusBar.vue`, `Button.vue`, `BtnGroup.vue`
- `common/` — `ColorPicker.vue`, `TreeNode.vue`, `Dialog.vue` (title, slot, OK/Cancel, ESC/Enter)

### Styling
Tailwind CSS v4 (`@tailwindcss/vite`). Global styles in `src/style.css`. No separate config file. Use inline classes for unique styles; add shared styles to `src/style.css`.

### Testing
Vitest (`npm test` in `g2-editor/`). Parser unit tests in `src/parser/__tests__/`.
