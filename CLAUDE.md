# CLAUDE.md

## Project Context
Editor for the Nord Modular G2 synthesizer. USB communication layer in C. And an electronjs (VueJS, TypeScript) frontend. Changes often need to flow across all layers.

## Coding And behavioral guidelines to reduce LLM coding mistakes

## Workflow Discipline
- When fixing a specific bug, stay focused on the file/command mentioned. Do NOT explore unrelated files unless the user explicitly asks.
- For code review requests, ask whether to review a specific commit, branch range, or working tree before starting.

## Verification Before Done
- For C/firmware bit-field parsing changes, request a raw byte dump from the connected G2 and verify each field (including inverted bits like clkse) before claiming the fix is complete.
- For Vue/SVG refactors, run the test suite AND check for ID collisions when components are duplicated (e.g., gradient defs should live at App root).
- Always run `npm run typecheck` (or equivalent) after multi-file TypeScript edits before reporting success.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask. Even when user makes typos.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must.**

When editing existing code:
- If you see code that could be improved (simpler, less code), don't change, metion it.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.
- If you notice code that could be simpler or more abstracted, mention it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code, only mention it.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


## Repository Structure

- `cli/` — C CLI tool for USB communication with the Nord G2 hardware
- `g2-editor/` — Electron desktop app (Vue 3 + TypeScript)
- `test-patches/` — Sample `.pch2` patch files for testing
- `doc` - For architecural documentation

## Commands

### CLI (C tool)
```bash
cd cli && make          # build
cd cli && make test     # run tests
./cli/build/bin/g2-cli --help
```
Key slot commands: `add-module`, `del-module`, `move-module`, `set-module-color`, `set-module-name`, `set-param`, `add-cable`, `del-cable`. All take `<slot> <va|fx> ...` as first args. Subcmd bytes documented in `doc/usb.md`.

**Interactive daemon use (recommended):**
```bash
cd cli && ./g2tmux.sh   # tmux split: left = daemon output, right = command shell
```
Right pane: type commands directly (`get-patch A`, `variation 4 B`, `stop`, `start`, etc.) with TAB autocomplete. See README.md for examples.

### Electron GUI
```bash
cd g2-editor
npm install
cd ../cli && make && cd ../g2-editor   # rebuild CLI first
npm run postinstall     # copies CLI binary into Electron app
npm run dev             # development server
npm run build           # production build + package
npm run preview         # preview production build
npm test                # run Vitest unit tests
```
The `@/` path alias resolves to `g2-editor/src/`.

### State & Business Logic
State lives in **Pinia stores** (`src/store/`). Stores are the single source of truth.

| Store | File | Purpose |
|-------|------|---------|
| slots | `slots.ts` | Patch data for 4 slots (A–D): loading, parsing, mutations |
| device | `device.ts` | Connection state, device info, slot info, BPM |
| ui | `ui.ts` | Active slot/area, right pane tab, selected module/cable |
| browser | `browser.ts` | Patch browser state, synth patches, performances, disk nav |

### Key Composables (`src/composables/`)
- `useG2.ts` — main device connection/startup/status polling
- `usePatchFile.ts` — file load/save via IPC bridge
- `useJackPatching.ts` — cable add/delete logic
- `useCableVisibility.ts` — cable filtering/visibility
- `useModuleControls.ts` — knob/slider/mode parameter changes

### Parser & Mutations (`src/parser/`)
- `nmg2PatchParser.ts` — parses `.pch2` binary format into JS objects
- `nmg2PatchSerializer.ts` — serializes patches back to binary
- `patchMutations.ts` — immutable patch mutations (add/delete/move modules & cables, set color/label)
- `g2usb.ts` — USB protocol abstraction

### Renderer Data (`src/renderer/`)
- `nmg2mods.ts` — complete module definition database (200+ modules, ~162KB)
- `parammap.ts` — parameter metadata mappings
- `moduleRenderer.ts` / `cableRenderer.ts` — SVG rendering logic

### Components (`src/components/`)
- `canvas/` — `PatchCanvas.vue`, `Module.vue`, `ModuleKnob`, `ModuleSlider`, `ModuleSwitch`, `ModuleJack`, `ModuleVe*` visual elements
- `panels/` — `SidePanel.vue`, `ModulesPane.vue`, `PatchBrowser.vue`
- `toolbar/` — `ToolBar.vue`, `StatusBar.vue`, `Button.vue`, `BtnGroup.vue`
- `common/` — `ColorPicker.vue`, `TreeNode.vue`, `Dialog.vue` (generic modal: title, slot, OK/Cancel, ESC/Enter)

### Styling
Tailwind CSS v4 (via `@tailwindcss/vite` plugin). Global styles in `src/style.css`. No separate Tailwind config file — configuration is done in CSS. Use only inline classes when it is unique. Otherwise add class to `src/style.css`.

### Testing
Vitest (`npm test` in `g2-editor/`). Parser unit tests in `src/parser/__tests__/`.
