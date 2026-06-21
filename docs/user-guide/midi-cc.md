---
title: MIDI CC Assignment
parent: User Guide
nav_order: 3
---

# MIDI CC Assignment

MIDI CC assignment maps MIDI continuous controller numbers (CC 0–127) to patch parameters. Assigned parameters respond to incoming MIDI CC messages sent to the G2's slot channel.

---

## MIDI CC Pane

Open the MIDI CC pane by clicking the **MIDI CC** tab in the Side Panel (right side of the editor).

The pane lists all allowed CCs (2–119, excluding reserved numbers). Each row shows:

| Column | Description |
|--------|-------------|
| **CC** | Controller number |
| **Name** | Short controller name (e.g. "Brightness") |
| **Module** | Module the CC is assigned to (empty if unassigned) |
| **Parameter** | Parameter index within that module |

Unassigned rows appear dimmed. Click a row to select it; **Ctrl/Cmd+click** toggles; **Shift+click** extends the selection.

### Buttons

| Button | Action |
|--------|--------|
| **Remove** | Deassign selected CCs |
| **Remove All** | Deassign every CC in the current slot |
| **Auto Assign** | Assign free CCs to the currently selected module's parameters in order |

---

## Assigning via Context Menu

Right-click any parameter (knob, slider, switch, or spinner) on the canvas to open the context menu. Three MIDI CC options are available:

- **Assign CC (last received)** — assigns whichever CC the G2 most recently received. Useful when you twiddle a hardware knob first to pick the CC.
- **Assign CC…** — opens a submenu listing all allowed CCs by number and name. Click one to assign it.
- **Deassign CC** — removes the current assignment. This item is only shown when the parameter already has a CC assigned.

---

## CC Overlay

Press **F8** to toggle a yellow overlay on the canvas that shows CC number badges on every assigned parameter. Press **F8** again to hide the overlay.

Badge width scales with the CC number (2 digits vs 3 digits).

---

## Allowed CC Numbers

The G2 accepts CC values 0–119 for assignment. The editor additionally excludes a set of reserved controllers (bank select, mod wheel, volume, expression, sustain, etc.) to avoid conflicts. The effective allowed range is **CC 2–119** minus a small reserved list.

CCs 120–127 (channel mode messages) are never available for assignment.
