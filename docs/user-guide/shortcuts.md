---
title: Keyboard Shortcuts
parent: User Guide
nav_order: 4
---

# Keyboard Shortcuts

## File

| Key | Action |
|---|---|
| `Cmd+N` | New patch |
| `Cmd+O` | Open file |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save As |

## Synth

| Key | Action |
|---|---|
| `Cmd+G` | Open Synth Settings |
| `Cmd+U` | Upload Active Slot |
| `Cmd+M` | Send Controller Snapshot |
| `Cmd+1` | Dump One |
| `Option+S` | Save in Synth (store the patch in a synth bank) |

## Edit

| Key | Action |
|---|---|
| `Cmd+C` | Copy selected modules (with inter-module cables) |
| `Cmd+X` | Cut selected modules; cut cables (delete only — no paste) |
| `Cmd+V` | Paste modules at mouse cursor; layout, parameters and cables preserved |
| `Cmd+A` | Select all modules |
| `Cmd+E` | Paste Params |
| `Backspace` | Delete selection (or hovered jack's cable/nest) |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |

## Cabling

| Key / Mouse | Action |
|---|---|
| Drag jack → jack | Connect (Settings ▸ Connect Mode: Drag — default) |
| Click jack, then click another jack | Connect (Settings ▸ Connect Mode: Click); click the armed jack again to cancel |
| Click connected jack | Cycle through its connections (Drag connect mode only) |
| `Cmd/Ctrl`+Click connected jack | Grab its cable(s) to re-route |
| `Cmd/Ctrl`+Drag | Move the grabbed cable |
| Right-click jack | Context menu: Delete connected (remove all cables) / Break (remove just this jack from a multi-cable nest) |
| Click ghost cable | Confirm the auto-suggested cable after adding or deleting a module (Settings ▸ Auto-suggest Cable) |
| `Enter` | Confirm an armed-jack connection or an auto-suggested ghost cable |
| `Space` | Cycle to the next-best auto-suggested cable (Auto-suggest Cable on) |
| `Escape` | Cancel an armed jack or dismiss a ghost-cable suggestion |

## Slots & Variations

| Key | Action |
|---|---|
| `A` / `B` / `C` / `D` | Select slot A / B / C / D |
| `1–8` | Select variation 1–8 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle to next / previous slot |

## View & Areas

| Key | Action |
|---|---|
| `V` | Show Voice area (Split if already Voice-only) |
| `F` | Show FX area (Split if already FX-only) |
| `Space` | Show / hide all cables |
| `Ctrl+Space` | Shake cables |
| `Cmd+=` | Zoom in |
| `Cmd+-` | Zoom out |
| `Cmd+0` | Actual size |

## Patch

| Key | Action |
|---|---|
| `Cmd+P` | Open Patch Settings |
| `Cmd+D` | Download to Slot |

## Performance

| Key | Action |
|---|---|
| `Cmd+R` | Open Performance Settings |

## Panels

| Key | Action |
|---|---|
| `Cmd+L` | Toggle Modules pane |
| `Cmd+B` | Toggle Browser pane |
| `Cmd+I` | Toggle Midi CC pane |
| `Cmd+J` | Toggle Text pane |
| `Cmd+K` | Toggle Keyboard pane |
| `Cmd+,` | Toggle Settings pane |
| `Cmd+T` | Toggle Extended Toolbar |
| `Cmd+F` | Toggle Parameter Pages |

## Browser Pane

Arrow keys work whether or not the search box is focused. Banks (Patches/Performances) get a cursor row too; on the Disk tab folders take their place.

| Key | Action |
|---|---|
| `↑` / `↓` | Move cursor over banks / folders and items |
| `←` / `→` | Switch Disk/Patches/Performances tab (only while no cursor is set) |
| `←` | Collapse the bank under the cursor; on Disk, go up one folder |
| `→` / `Enter` / `Space` | Expand the bank, open the folder, or load the item under the cursor |
| `Escape` | Reset the cursor |
| Double-click | Load the file, patch or performance (a single click only selects) |

The cursor also resets when you switch tab or start/stop filtering. (`Space` types a space while the search box is focused.)

## Morph Groups

| Key | Action |
|---|---|
| `Cmd/Ctrl`+Click parameter | Assign / deassign it to the selected Morph Group |
| `Cmd/Ctrl`+Drag assigned knob/slider | Set morph range |
| `Ctrl+1–8` | Select active Morph Group (`Cmd+1` is Dump One) |
| `Cmd/Ctrl+Enter` | Assign / deassign selected parameter to active Morph Group |
| `Cmd/Ctrl+↑` / `Cmd/Ctrl+↓` | Nudge morph range of selected parameter |

## Overlays

Hold the key to show the overlay; release or press `Escape` to hide.

| Key | Action |
|---|---|
| `F5` | Show parameter values on canvas |
| `F6` | Show morph ranges on canvas |
| `F7` | Show morph group assignments on canvas |
| `F8` | Show Midi CC assignments on canvas |

## Modules & Parameters

| Key | Action |
|---|---|
| `M` | Quick add module at cursor position |
| `Shift+Arrow` | Navigate between modules |
| `←` / `→` | Navigate parameters (module selected), in the original editor's order |
| `↑` / `↓` | Adjust parameter ±1 (also for a selected knob) |
| `Alt+↑` / `Alt+↓` | Adjust parameter ±16 |
| Click / hold ▲▼ spinner | Spinner under a selected knob: ±1; with `Alt` ±16 |
| `L` | Assign last received MIDI CC to selected parameter |
| `Tab` / `Shift+Tab` | Cycle module category (Module Picker toolbar) |
| `,` / `.` | Select module (Module Picker toolbar) |
| `Enter` | Add selected module (Module Picker toolbar) |
| `F1` | Show module help |

## Parameter Pages

| Key / Mouse | Action |
|---|---|
| `Alt`+Drag a page cell | Drag it onto a canvas parameter or another cell to assign it |
| Right-click module | Assign / Global Assign all its parameters (Page ▸ Multi Column / Column N) |

## Other

| Key | Action |
|---|---|
| `R` | Toggle clock run / stop |
| `/` | Focus search / filter |
| `Escape` | Close dialog / menu / overlay, cancel an armed jack / ghost cable, or clear search filter |
