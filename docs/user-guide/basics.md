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
- **Level** — master patch volume (knob)
- **Active/Monitor** — toggle patch monitoring

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

Per-slot configuration is in the **Settings pane → Performance Settings**:

| Column | Meaning |
|---|---|
| Active | Slot plays audio |
| Key | Slot receives MIDI |
| Hold | Slot holds notes when not key-active |
| Range | MIDI note range (0–127) for this slot |

---

## Settings Pane (`Cmd+,`)

### Editor Settings
- **Disk path** — default folder for the patch browser
- **Hidden modules** — show/hide hidden (not recognised by Clavia editor) modules in patch browser

### Synth Settings (requires G2 connected)
- **Synth name**
- **MIDI channels** — per slot (A/B/C/D) and global

### Patch Settings
- **Arpeggiator** — on/off, Time, Mode, Octaves
- **Vibrato** — Source, Rate
- **Glide** — Type, Time
- **Bend** — on/off, Semitones
- **Octave Shift** — −2 to +2

---

## Patch Browser (`Cmd+B`)

### Disk Tab
- `↑` — navigate to parent folder
- `…` — open system folder picker
- **Search** — filter files (Esc to clear)
- Click folder — navigate into it
- Click `.pch2` / `.prf2` — load file

### Synth Tab (G2 connected)
- Browse patches and performances stored in the G2
- Click bank header to expand/collapse
- Click entry to load

---

## Resource Monitor

The toolbar shows real-time CPU and memory usage from the connected G2:

| Indicator | Meaning |
|---|---|
| VA cycles | Voice-area DSP load |
| VA mem | Voice-area RAM usage |
| FX cycles | FX-area DSP load |
| FX mem | FX-area internal memory |
