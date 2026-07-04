---
title: Basics
parent: User Guide
nav_order: 1
---

# Basics

## File Operations

| Action | How |
|---|---|
| New patch | `Cmd+N` |
| New performance | File menu → New Performance |
| Open file | `Cmd+O` |
| Save | `Cmd+S` |
| Save As | `Cmd+Shift+S` |
| Save all slots | File menu → Save All |

---

## Patch Settings (toolbar)

- **Patch name** — click to rename
- **Category** — dropdown to set sound category
- **Voice mode** — mono / legato / poly
- **Voice count** — number of voices
- **Variations 1–8 / Init** — click to switch variation
  - **Right-click** any variation button to copy its parameters to another variation or to Init
  - Non-Init variations also offer **Set to Init** (overwrites this variation with Init parameters)
  - **Drag** a variation button onto another to copy (asks for confirmation)

---

## Morph Toolbar

Shown below the patch toolbar whenever a patch is loaded:

- **4 Morph knobs** — one per morph; each has a source selector below it to pick what drives it
- **Patch Level** — master patch volume (knob)
- **Active/Mute** — checkbox next to Patch Level toggles patch monitoring

Right-click a Morph knob to assign a MIDI CC to it (see [MIDI CC Assignment](midi-cc)).

---

## Slots (A / B / C / D)

- Click a slot button to make it active
- Top indicator: keyboard status; bottom indicator: active status
- `Shift+click` — toggle slot active; `Ctrl+click` — toggle slot keyboard

---

## Performance Mode

Click **Perf** in the toolbar to switch between patch and performance mode.

- **Performance name** — click to rename (max 16 chars)
- **BPM** — click to set tempo (30–240)
- **Run** — toggle master clock

**Settings pane → Performance Settings** also has:
- **Range Enable** — turns KB Split on/off for the performance

Per-slot configuration is in the same section:

| Column | Meaning |
|---|---|
| Active | Slot plays audio |
| Key | Slot receives MIDI |
| Hold | Slot holds notes when not key-active |
| Range | MIDI note range (0–127) for this slot |

---

## Settings Pane (`Cmd+,`)

### Editor Settings
- **Theme** — editor color theme
- **Knob control** — Knob Mode (relative/absolute) and drag Sensitivity
- **Cable rendering** — Gravity, Opacity, Thickness
- **Hidden modules** — show/hide hidden (not recognised by Clavia editor) modules in patch browser

> The patch browser's disk folder is set from the **`…`** button in the Disk tab (see Patch Browser below), not from this pane.

### Synth Settings (requires G2 connected)
- **Synth name**
- **Memory Protect**
- **MIDI channels** — per slot (A/B/C/D) and global; each can be set to Off
- **MIDI settings** — Local, Clock (off/send/recv/both), Program Change, CC (off/send/recv/both), Sysex channel (or All)
- **Tuning** — Semi, Cents
- **Pedal** — Polarity, Gain
- **Global Oct.** — global octave shift (−2 to +2) with an Active toggle

### Patch Settings
- **Arpeggiator** — on/off, Time, Mode, Octaves
- **Vibrato** — Source, Rate
- **Glide** — Type, Time
- **Bend** — on/off, Semitones
- **Octave Shift** — −2 to +2

---

## Patch Browser (`Cmd+B`)

Three tabs: **Disk**, **Patches**, **Performances**. With the Browser pane focused (and no text field active), `←` / `→` cycles between them.

### Disk Tab

- `↑` — navigate to parent folder
- `…` — open system folder picker
- **Search** — filter files; Esc to clear
- Click folder — navigate into it
- Click `.pch2` / `.prf2` — load into active slot

### Patches / Performances Tabs (G2 connected)

Patches and performances stored on the G2, grouped by bank.

**Navigation**

| Action | Result |
|---|---|
| Click bank header | Collapse / expand bank |
| ▶ / ▼ button (top-right) | Expand all / collapse all banks |
| Click entry | Load patch or performance |
| `/` or focus search | Jump to search |
| `↑` / `↓` in search | Move selection through visible entries |
| `Enter` | Load selected (or first) entry |
| `Esc` | Clear search |

**Search** — auto-expands any bank with a matching result; restores previous collapse state when cleared.

**Right-click a patch entry**

| Item | Action |
|---|---|
| Store "*name*" here | Write the current slot's patch to this bank location |
| Delete (clear this location) | Erase this location from the G2 bank |

**Right-click a bank header**

| Item | Action |
|---|---|
| Store "*name*" | Submenu listing all locations — choose where to write |
| Clear all in bank | Erase every location in this bank |
| Sort | Submenu: By location · By name A–Z · By name Z–A · By category |

> Store is unavailable for performance banks unless the G2 is in Performance mode.

---

## Resource Monitor

The toolbar shows real-time CPU and memory usage from the connected G2:

| Indicator | Meaning |
|---|---|
| VA cycles | Voice-area DSP load |
| VA mem | Voice-area RAM usage |
| FX cycles | FX-area DSP load |
| FX mem | FX-area internal memory |
