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
| `get-patch-file` | `<slot> [file]` | Save patch as .pch2 file |
| `get-perf-file` | `[file]` | Save current performance as .prf2 file |
| `upload-patch` | `<slot> <filepath>` | Upload .pch2 to slot |
| `upload-perf` | `<filepath>` | Upload .prf2 performance |
| `select-patch` | `<slot> <bank> <loc>` | Load bank patch into slot (bank 1–32, loc 1–127) |
| `select-perf` | `<bank> <loc>` | Load bank performance |
| `list` | `[type] [bank <n>]` | List patches/performances (optionally filter by type or bank) |
| `get-perf-settings` | | Get current performance settings |
| `set-perf-mode` | `<patch\|performance>` | Switch between patch and performance mode |
| `set-perf-name` | `<name>` | Set performance name |
| `set-patch-name` | `<slot> <name>` | Set patch name |
| `set-patch-description` | `<slot> <hexdata>` | Set patch description (hex-encoded) |
| `set-synth-settings` | `<json>` | Set all synth settings from JSON |

## Slots

| Command | Arguments | Description |
|---|---|---|
| `slot` | `<A\|B\|C\|D>` | Change active slot |
| `variation` | `<1–8> [slot]` | Select variation for slot |
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

## Clock

| Command | Arguments | Description |
|---|---|---|
| `set-master-clock-run` | `<0\|1>` | Start/stop master clock |
| `set-master-clock-bpm` | `<30–240>` | Set master clock BPM |

## Modules

| Command | Arguments | Description |
|---|---|---|
| `add-module` | `<slot> <va\|fx> <type-id> <module-id> <col> <row> <color> <num-modes> [modes] <num-params> [params] <name>` | Add module to patch |
| `del-module` | `<slot> <va\|fx> <module-id>` | Delete module (delete cables first) |
| `move-module` | `<slot> <va\|fx> <module-id> <col> <row>` | Move module to grid position |
| `set-module-color` | `<slot> <va\|fx> <module-id> <color:0–24>` | Set module color |
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
| `set-param` | `<slot> <va\|fx\|patch> <module-id> <param-idx> <value> <variation>` | Set module parameter value |
| `set-param-label` | `<slot> <va\|fx> <module-id> <param-idx> <label-idx> <label>` | Set parameter label |

## Resources & Daemon

| Command | Arguments | Description |
|---|---|---|
| `get-resources` | `<slot>` | Get CPU/memory resource usage |
| `daemon` | | Persistent: watch events + accept JSON commands on stdin |
| `seq` | `"<cmd1>" "<cmd2>" ...` | Run multiple commands sequentially |

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
