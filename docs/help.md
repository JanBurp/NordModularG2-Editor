# G2 Editor Help

## Working with Patches

### File Operations

| Action | How |
|---|---|
| New patch | `Cmd+N` |
| New performance | File menu → New Performance |
| Open file | `Cmd+O` |
| Save | `Cmd+S` |
| Save As | `Cmd+Shift+S` |
| Save all slots | File menu → Save All |

### Patch Settings (toolbar)

- **Patch name** — click to rename
- **Category** — dropdown to set sound category
- **Voice mode** — mono / legato / poly
- **Voice count** — number of voices
- **Variations 1–8** — click to switch variation
- **Level** — master patch volume (knob)
- **Active/Monitor** — toggle patch monitoring

### Slots (A / B / C / D)

- Click a slot button to make it active
- Top indicator: keyboard status; bottom indicator: active status
- `Shift+click` — toggle slot active; `Ctrl+click` — toggle slot keyboard

---

## Building a Patch

### Adding Modules

1. Open the **Modules pane** (`Cmd+M`)
2. Search by name or category, or scroll the list
3. Drag a module onto the canvas (Voice or FX area)

### Selecting & Moving

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

### Cut / Copy / Paste

- **Copy** (`Cmd+C`) — copies selected modules and any cables connecting them to an in-memory clipboard
- **Cut** (`Cmd+X`) — copies modules then deletes selection; for cables, deletes without copying
- **Paste** (`Cmd+V`) — places modules at the mouse cursor (top-left of group) with new IDs; relative layout, all parameters, variation values, and inter-module cables are preserved; cross-area paste (Voice ↔ FX) is supported

### Renaming & Coloring

- **Rename** — double-click module title, or right-click → Rename…
- **Set color** — right-click → Set Color (10 swatches); double-click the toolbar color picker to reset selected modules to default color

---

## Editing Parameters

| Control | Mouse interaction | Double-click |
|---|---|---|
| Knob | Drag up/down to change value | Reset to default |
| Slider | Drag handle; click track to step | Reset to default |
| Switch | Click to cycle | — |
| Spinner | Click/hold the +/− buttons to inc/dec | Reset to default |

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

## Voice & FX Areas

Patches have two independent areas: **Voice** (polyphonic signal path) and **FX** (effects chain). Use the status bar to switch:

| Button / Key | Area shown |
|---|---|
| `Opt+V` | Voice only |
| `Opt+F` | FX only |
| `Opt+S` | Split view (both) |

In split view, drag the center divider to resize the two areas.

The status bar shows module and cable counts for each area.

---

## Module Help

- `F1` — show help for the selected module (or all visible modules)
- Right-click module on canvas → **Show Help** — opens Modules pane to that module's docs
- In the **Modules pane**: click a module to toggle its help text; enable **Show all help** to display docs for every visible module

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

### Performance Settings
See **Performance Mode** above.

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
- Browse patches and performances from G2
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

---

## Keyboard Shortcuts

### File

| Key | Action |
|---|---|
| `Cmd+N` | New patch |
| `Cmd+O` | Open file |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save As |

### Edit

| Key | Action |
|---|---|
| `Cmd+C` | Copy selected modules (with inter-module cables) |
| `Cmd+X` | Cut selected modules; cut cables (delete only — no paste) |
| `Cmd+V` | Paste modules at mouse cursor; layout, parameters and cables preserved |
| `Cmd+A` | Select all modules |
| `Delete` / `Backspace` | Delete selection |

### Slots & Variations

| Key | Action |
|---|---|
| `Opt+A/B/C/D` | Select slot A / B / C / D |
| `Opt+1–8` | Select variation 1–8 |

### View & Areas

| Key | Action |
|---|---|
| `Opt+V` | Voice area |
| `Opt+S` | Split view |
| `Opt+F` | FX area |

### Panels

| Key | Action |
|---|---|
| `Cmd+M` | Toggle Modules pane |
| `Cmd+B` | Toggle Browser pane |
| `Cmd+,` | Toggle Settings pane |

### Modules & Parameters

| Key | Action |
|---|---|
| `Shift+Arrow` | Navigate between modules |
| `←` / `→` | Navigate parameters (module selected) |
| `↑` / `↓` | Adjust parameter ±1 |
| `Alt+↑` / `Alt+↓` | Adjust parameter ±16 |
| `F1` | Show module help |
