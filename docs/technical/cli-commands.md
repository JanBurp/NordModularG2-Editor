---
title: CLI Commands
parent: Technical Reference
nav_order: 2
---

# CLI Commands

The `g2-cli` tool handles all USB communication with the G2 hardware. All G2 responses go to stdout as JSON; all commands are sent via stdin.

## Connection

| Command | Arguments | Description |
|---|---|---|
| `connect` | | Connect to G2 |
| `disconnect` | | Close connection |
| `startup` | | Full startup (init + device + all slots + names) |
| `device` | | Show device info |
| `list-devices` | | List USB devices (debug) |

## Patches & Performances

| Command | Arguments | Description |
|---|---|---|
| `get-patch` | `<slot>` | Get patch from slot as JSON |
| `get-patch-file` | `<slot> [file]` | Save patch as .pch2 file (official text header, sections, trailing CRC) |
| `get-perf-file` | `[file]` | Save current performance as .prf2 file (official text header, sections, trailing CRC) |
| `upload-patch` | `<slot> <filepath>` | Upload .pch2 to slot |
| `upload-perf` | `<filepath>` | Upload .prf2 performance |
| `select-patch` | `<slot> <bank> <loc>` | Load bank patch into slot (bank 1–32, loc 1–127) |
| `select-perf` | `<bank> <loc>` | Load bank performance |
| `store-patch` | `<slot> <bank> <loc>` | Store slot's patch to bank location (slot 0-3, use slot 4 for performances) |
| `clear-patch` | `<patch\|performance> <bank> <loc>` | Clear a single bank location |
| `clear-bank` | `<patch\|performance> <bank>` | Clear all entries in a bank (locations 1–128) |
| `reload-names` | | Re-fetch patch/performance name list from G2: emits a `names_progress` event per bank (daemon only), then the complete `names` event. |
| `list` | `[type] [bank <n>]` | List patches/performances (optionally filter by type or bank). The unfiltered list also reports `flashUsage` (flash used, per mille 0–1000) |
| `get-perf-settings` | | Get current performance settings |
| `set-perf-mode` | `<patch\|performance> [shift]` | Switch between patch and performance mode. With `shift` it acts as SHIFT+PERF: patch→performance creates a new performance ("New Performance") from the current slot patches (key/active kept); performance→patch keeps the performance's patches in the slots |
| `set-perf-name` | `<name>` | Set performance name (may be empty) |
| `set-patch-name` | `<slot> <name>` | Set patch name (may be empty) |
| `set-patch-description` | `<slot> <hexdata>` | Set patch description (hex-encoded) |
| `set-synth-settings` | `<json>` | Set all synth settings from JSON |

## Slots

| Command | Arguments | Description |
|---|---|---|
| `slot` | `<A\|B\|C\|D>` | Change active slot |
| `variation` | `<1–10> [slot]` | Select variation for slot. 10 (index 9) is the Patch Mutator audition variation |
| `set-slot-enabled` | `<slot> <0\|1>` | Enable/disable a slot |
| `set-slot-key` | `<slot> <0\|1>` | Assign/unassign keyboard to slot |
| `set-slot-hold` | `<slot> <0\|1>` | Set slot hold mode |
| `set-slot-range` | `<slot> <lower> <upper>` | Set note range for slot (0–127) |
| `set-range-enable` | `<0\|1>` | Enable/disable slot range |

## Voice

| Command | Arguments | Description |
|---|---|---|
| `voice-mode` | `<slot> <0–3>` | Set voice mode (0=poly 1=mono 2=legato 3=slgt) |
| `voice-count` | `<slot> <1–32>` | Set voice count |

## Controller & Bank

| Command | Arguments | Description |
|---|---|---|
| `send-controller-snapshot` | | Send all assigned MIDI Controller values to MIDI OUT |
| `dump-patch` | `<slot>` | Dump patch from slot as MIDI SYSEX (A-D) |
| `get-bank` | `<type> <bank> <folder> [<name>]` | Get bank from device: saves each occupied location as a `.pch2`/`.prf2` plus a `.pchList` index (type: patch|performance, bank: 1-32 or 1-8) |
| `send-bank` | `<type> <source-type> <source-path> <bank>` | Send bank to device — OVERWRITES the target bank, clearing any location with no matching source entry (type: patch|performance, source-type: pchList|folder, bank: 1-32 or 1-8) |
| `get-location` | `<type> <bank> <location> <file>` | Read one bank location to a `.pch2`/`.prf2` file (location: 1-128). Returns `{name, empty, corrupt}`; no file is written for an empty or corrupt entry |
| `put-location` | `<type> <bank> <location> <file> [<name>]` | Write a `.pch2`/`.prf2` file to one bank location, overwriting it (name defaults to the file name) |

## Clock

| Command | Arguments | Description |
|---|---|---|
| `set-master-clock-run` | `<0\|1>` | Start/stop master clock |
| `set-master-clock-bpm` | `<30–240>` | Set master clock BPM |
| `play-note` | `<note 0–127> <0\|1>` | Virtual Keyboard: sound (1) or release (0) a note |

## Modules

| Command | Arguments | Description |
|---|---|---|
| `add-module` | `<slot> <va\|fx> <type-id> <module-id> <col> <row> <color> <num-modes> [modes] <num-params> [params] <name> [muta-lock:0\|1]` | Add module to patch. `module-id` must be 1–127; Fx-In (type 127) is FX-only. The G2 ignores `params` and uses its own defaults. `muta-lock` sets Exclude From Mutation (default 0) |
| `del-module` | `<slot> <va\|fx> <module-id>` | Delete module (delete cables first; zero its morph ranges first, or the G2 is corrupted until power-off) |
| `move-module` | `<slot> <va\|fx> <module-id> <col> <row>` | Move module to grid position |
| `set-module-color` | `<slot> <va\|fx> <module-id> <color:0–24>` | Set module color |
| `set-module-uprate` | `<slot> <va\|fx> <module-id> <0\|1>` | Set module audio-rate (uprate) flag; the editor sends it after every cable change, as the official editor does |
| `set-mutation-lock` | `<slot> <va\|fx> <module-id> <0\|1>` | Exclude a module from Patch Mutator changes (`0x90`) |
| `set-module-name` | `<slot> <va\|fx> <module-id> <name>` | Set module label |
| `set-module-mode` | `<slot> <va\|fx> <module-id> <param-idx> <value>` | Set module mode parameter |

## Cables

| Command | Arguments | Description |
|---|---|---|
| `add-cable` | `<slot> <va\|fx> <color:0–6> <from-mod> <0\|1> <from-con> <to-mod> <0\|1> <to-con>` | Add cable between jacks |
| `del-cable` | `<slot> <va\|fx> <from-mod> <0\|1> <from-con> <to-mod> <0\|1> <to-con>` | Delete cable |
| `set-cable-color` | `<slot> <va\|fx> <color:0–6> <from-mod> <0\|1> <from-con> <to-mod> <0\|1> <to-con>` | Set cable color |

## Parameters

| Command | Arguments | Description |
|---|---|---|
| `set-param` | `<slot> <va\|fx\|patch> <module-id> <param-idx> <value> <variation>` | Set module parameter value (variation 0–9; never acked, so a large burst can lose values on the G2) |
| `set-morph-range` | `<slot> <va\|fx> <module-id> <param-idx> <range> <group> <variation>` | Set a parameter's morph range (range 0 removes the assignment) |
| `set-morph-range-batch` | `<slot> [<va\|fx> <mod> <param> <range> <group> <variation>]...` | Set multiple morph ranges in one call |
| `select-param` | `<slot> <va\|fx\|patch> <module-id> <param-idx>` | Move the front-panel cursor to a parameter (`0x2F`) |
| `send-sections` | `<slot> <hex>` | Send whole patch sections (`[type][len16][data]...`, as in a `.pch2`) as one acked edit. The Patch Mutator uses it to write a complete variation |
| `set-module-labels` | `<slot> <va\|fx\|patch> <module-id> <param-idx> <count> <label>... [<param-idx> <count> <label>...]` | Set the labels of all labelled params of a module (replaces the module's whole list; always pass every label param, the block size is fixed per module type) |
| `copy-variation` | `<slot> <from> <to>` | Copy all parameter values from one variation to another (0-based indices) |

## Parameter Pages & Knobs

| Command | Arguments | Description |
|---|---|---|
| `assign-knob` | `<slot> <va\|fx\|patch> <module-id> <param-idx> <slot-index> [led]` | Assign a parameter (or, with `led`=1, a level meter by LED number) to a Parameter Page knob (0–119). `patch` = Morph Groups |
| `deassign-knob` | `<slot> <slot-index>` | Remove a Parameter Page knob assignment |
| `select-param-page` | `<slot> <page-id>` | Select the front-panel Parameter Page (`page-id` = page*3 + bank, 0–14) |
| `get-param-page` | `<slot>` | Ask which Parameter Page the G2 shows; the reply arrives as a `param_page_change` event |
| `assign-global-knob` | `<slot> <target-slot> <va\|fx\|patch> <module-id> <param-idx> <slot-index> [led]` | Assign a parameter (or, with `led`=1, a level meter by LED number) to a Global Parameter Page knob (0–119) |
| `deassign-global-knob` | `<slot> <slot-index>` | Remove a Global Parameter Page knob assignment |
| `select-global-page` | `<slot> <page-id>` | Select the active Global Parameter Page (`page-id` = page*3 + bank, 0–14) |
| `get-global-knobs` | | Fetch the Global Parameter Pages assignment list (system-wide, no slot) |
| `set-knob-source` | `<0\|1>` | Parameter Pages knob-assign source (1=Global, 0=Patch), as SHIFT+GLOBAL |

## MIDI CC Assignments

| Command | Arguments | Description |
|---|---|---|
| `assign-midicc` | `<slot> <va\|fx\|patch> <module-id> <param-idx> <cc-num>` | Assign MIDI CC to a module parameter (CC 0–119) |
| `deassign-midicc` | `<slot> <cc-num>` | Remove a MIDI CC assignment |
| `assign-midicc-batch` | `<slot> <loc> <mod> <param> <cc> [<loc> <mod> <param> <cc> ...]` | Assign multiple CCs in one USB frame |
| `deassign-midicc-batch` | `<slot> <cc> [<cc> ...]` | Remove multiple CC assignments in one USB frame |

## Resources & Daemon

| Command | Arguments | Description |
|---|---|---|
| `get-resources` | `<slot>` | Get CPU/memory resource usage |
| `daemon` | `[<bus> <device>]` | Persistent: watch events + accept JSON commands on stdin (optional bus/device pins one specific G2) |
| `seq` | `"<cmd1>" "<cmd2>" ...` | Run multiple commands sequentially |
| `debug` | `<on\|off>` | Enable/disable debug timing output (emits JSON `debug` events to stdout) |

---

## Daemon Mode

The daemon maintains a persistent connection: it streams watch events to stdout and accepts JSON commands on stdin.

### Recommended: tmux launcher

```bash
cd cli
./g2tmux.sh
```

Opens a split-pane tmux session — left pane: daemon output; right pane: command shell with autocomplete.

```bash
slot A                  # switch focus to slot A
get-patch A             # read patch from slot A
variation 4 B           # select variation 4 on slot B
verbose off             # suppress LED/volume updates
set-perf-mode patch     # switch to patch mode
set-perf-mode performance shift   # SHIFT+PERF: new performance from the slot patches
stop                    # kill daemon
start                   # restart daemon
```

Type command name + `TAB` to autocomplete. Arguments also autocomplete: `get-patch <TAB>` → `A B C D`.

### Manual daemon mode

```bash
# Terminal 1 — start daemon reading from a named pipe
mkfifo /tmp/g2-cmd
./build/bin/g2-cli daemon < /tmp/g2-cmd

# Terminal 2 — keep the pipe open and send commands
exec 3>/tmp/g2-cmd
echo '{"id":1,"cmd":"slot","args":["B"]}' >&3
echo '{"id":2,"cmd":"variation","args":["4","B"]}' >&3
echo '{"id":3,"cmd":"device"}' >&3
echo '{"id":5,"cmd":"verbose","args":["off"]}' >&3
exec 3>&-   # close when done (causes daemon to exit cleanly)
```

### Monitoring

```bash
g2-cli watch     # monitor G2 messages (one-shot)
g2-cli daemon    # persistent: watch (stdout) + commands on stdin
```
