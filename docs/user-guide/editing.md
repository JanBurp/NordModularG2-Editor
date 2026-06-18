---
title: Editing Modules & Cables
parent: User Guide
nav_order: 2
---

# Editing Modules & Cables

## Adding Modules

1. Open the **Modules pane** (`Cmd+M`)
2. Search by name or category, or scroll the list
3. Drag a module onto the canvas (Voice or FX area)

---

## Selecting & Moving

| Action | Result |
|---|---|
| Click module | Select |
| `Shift+click` module | Add/remove from selection |
| Drag on empty canvas | Rubber-band select |
| Drag module title bar | Move module(s) |
| `Cmd+A` | Select all modules in current area |
| `Delete` / `Backspace` | Delete selected modules and their cables |

### Keyboard Navigation Between Modules

With any module selected, use `Shift+Arrow` keys to jump to adjacent modules on the canvas. Navigation wraps at area edges and crosses Voice↔FX in split view.

---

## Cut / Copy / Paste

- **Copy** (`Cmd+C`) — copies selected modules and any cables connecting them
- **Cut** (`Cmd+X`) — copies modules then deletes selection; cables are deleted without copying
- **Paste** (`Cmd+V`) — places modules at the mouse cursor; relative layout, all parameters, variation values, and inter-module cables are preserved; cross-area paste (Voice ↔ FX) is supported

---

## Renaming & Coloring

- **Rename** — double-click module title, or right-click → Rename…
- **Set color** — select modules, then click the **color swatch** in the toolbar to apply the current color, or click **▾** next to it to pick a different color

---

## Editing Parameters

| Control | Mouse interaction | Double-click |
|---|---|---|
| Knob | Drag up/down | Reset to default |
| Slider | Drag handle; click track to step | Reset to default |
| Switch | Click to cycle | — |
| Spinner | Click/hold +/− to inc/dec | Reset to default |

### Right-click a parameter → edit dialog

Opens a precise-entry dialog: enum parameters show a dropdown; numeric parameters show a number field (with optional MIDI note display).

### Keyboard (module selected)

| Key | Action |
|---|---|
| `←` / `→` | Navigate to previous/next parameter |
| `↑` / `↓` | Increase / decrease value by 1 |
| `Alt+↑` / `Alt+↓` | Increase / decrease value by 16 |

### Parameter Labels

Right-click a parameter → **Rename label** to set a custom display name.

---

## Cabling

| Action | Result |
|---|---|
| Drag output jack → input jack | Create cable |
| Right-click connected jack → Set Cable Color | Pick from 8 colors |
| Right-click connected jack → Delete Connected | Remove all cables on this jack |

### Cable Visibility (toolbar)

- **8 color buttons** — toggle visibility per color
- **H** — hide / show all cables
- **S** — shuffle cable routing

---

## Module Help

- `F1` — show help for the selected module (or all visible modules)
- Right-click module on canvas → **Show Help** — opens Modules pane to that module's docs
- In the **Modules pane**: click a module to toggle its help text; enable **Show all help** to display docs for every visible module
