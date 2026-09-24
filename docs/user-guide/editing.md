---
title: Editing Modules & Cables
parent: User Guide
nav_order: 2
---

# Editing Modules & Cables

## Adding Modules

Open the **Modules pane** (`Cmd+L`), search or scroll, then drag a module onto the canvas (Voice or FX area).

**Quick add** — press `M`, type to search, then `Enter` or click a result to place it at the cursor position.

---

## Selecting & Moving

| Action | Result |
|---|---|
| Click module | Select |
| `Shift+click` module | Add/remove from selection |
| Drag on empty canvas | Rubber-band select |
| Drag module title bar | Move module(s) |
| `Cmd+A` | Select all modules in current area |
| `Backspace` | Delete selected modules and their cables |
| `Shift+Arrow` (module selected) | Jump to adjacent module; wraps at area edges, crosses Voice↔FX in split view |

---

## Cut / Copy / Paste

- **Copy** (`Cmd+C`) — copies selected modules and any cables connecting them
- **Cut** (`Cmd+X`) — copies modules then deletes selection; cables are deleted without copying
- **Paste** (`Cmd+V`) — places modules at the mouse cursor; layout, parameters, variation values, and inter-module cables are preserved; cross-area paste (Voice ↔ FX) is supported

---

## Renaming & Coloring

- **Rename** — double-click module title, or right-click → Rename…
- **Set color** — select modules, then click the **color swatch** in the toolbar to apply the current color, or **▾** next to it to pick a different one

---

## Editing Parameters

| Control | Mouse interaction | Double-click |
|---|---|---|
| Knob | Drag up/down | Reset to default |
| Slider | Drag handle; click track to step | Reset to default |
| Switch | Click to cycle | — |
| Spinner | Click/hold +/− to inc/dec | Reset to default |

**Right-click a parameter** for a precise-entry dialog (dropdown for enums, number field for numeric, with optional MIDI note display), or **Rename label** to set a custom display name.

**Keyboard** (module selected): `←`/`→` navigate parameters, `↑`/`↓` adjust ±1, `Alt+↑`/`Alt+↓` adjust ±16.

---

## Cabling

| Action | Result |
|---|---|
| Drag output jack → input jack | Create cable |
| Right-click connected jack → Set Cable Color | Pick from 8 colors |
| Right-click connected jack → Delete Connected | Remove all cables on this jack |

**Cable visibility** (toolbar) — 8 color buttons toggle visibility per color; **H** hides/shows all cables; **S** shuffles cable routing.

---

## Morph Assignment

Pick the active Morph Group first — click one of the **8 toolbar knobs**, or `Cmd+1–8`.

| Action | Result |
|---|---|
| `Cmd+Click` parameter | Assign / deassign to active Morph Group |
| `Cmd+Drag` parameter (vertical) | Set morph range (knobs/sliders only — buttons, switches and spinners are fixed-range) |
| Right-click parameter → **Morph assign** | Assign / deassign to active Morph Group |
| `Cmd+Enter` (parameter selected) | Assign / deassign to active Morph Group |
| `Cmd+↑` / `Cmd+↓` (parameter selected) | Nudge morph range |

Assigned parameters are tinted on the canvas — red for the active group, blue for others. Hold `F6` to show each assigned parameter's range, `F7` to show which group(s) it belongs to.

Right-click a toolbar Morph knob for **Clear** (remove all assignments in that group) or **Copy To →** another group.

---

## Module Help

- `F1` — show help for the selected module (or all visible modules)
- Right-click module on canvas → **Show Help** — opens Modules pane to that module's docs
- In the **Modules pane**: click a module to toggle its help text; **Show all help** shows docs for every visible module
