# Nord Modular G2 - Editor

For all non tech documentation see: https://janburp.github.io/NordModularG2-Editor/

What follows is a brief technical overview and how to setup a local development.

## Tech stack

- An editor for the Nord Modular G2 for multiple platforms (macOS, Windows and later Linux)
- Using tech that is widely available and used by many developers.

This editor is build with electronjs, with TypeScript and VueJS.
It uses a C CLI/Daemon to handle the USB communication. Which will be part of the build.

### CLI/Daemon in C

The CLI/Daemon handles all USB communication with the G2 hardware.
All responses from the G2 goes to stdout in JSON format.
All commands are send to the Daemon (or CLI) via stdin.

This CLI / Daemon approach makes it possible to use the CLI/Daemon on it's own, or to be used in a different editor.
There are commands for connecting, transfering patches, editing patches, editing settings etc.

### ElectronJS

ElectronJS is used for the actual editor. It can run in an offline mode without the daemon (so without connected G2) to edit only files. In the default online mode it communicates with the G2 through the daemon.

## Structure

- `cli/` — C CLI tool for USB communication with the G2 hardware
- `g2-editor/` — Electron desktop app (Vue 3 + TypeScript)

## Documentation

- [USB Protocol](doc/usb.md) — USB framing, commands, watch events, daemon architecture
- [Patch File Format](doc/parsing.md) — PCH2/PRF2 binary format, sections, bit encoding

## Prerequisites

- **macOS**: `brew install libusb`
- **Windows**: handled via the release build script (MinGW cross-compile)

## Build

### CLI

```bash
cd cli
make                    # build cli
make test               # run all tests
make test-unit          # run unit tests (no need for connected G2)
make test-integration   # run integrations tests (needs connected G2)
```

### Electron app

```bash
cd g2-editor
npm install
cd ../cli && make && cd ../g2-editor   # rebuild CLI first
npm run postinstall                     # copies CLI binary into app resources
npm run dev                             # development server
```

## CLI Commands

### Connection

| Command | Arguments | Description |
|---|---|---|
| `connect` | | Connect to G2 |
| `disconnect` | | Close connection |
| `startup` | | Full startup (init + device + all slots + names) |
| `device` | | Show device info |
| `list-devices` | | List USB devices (debug) |

### Patches & Performances

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

### Slots

| Command | Arguments | Description |
|---|---|---|
| `slot` | `<A\|B\|C\|D>` | Change active slot |
| `variation` | `<1–8> [slot]` | Select variation for slot |
| `set-slot-enabled` | `<slot> <0\|1>` | Enable/disable a slot |
| `set-slot-key` | `<slot> <0\|1>` | Assign/unassign keyboard to slot |
| `set-slot-hold` | `<slot> <0\|1>` | Set slot hold mode |
| `set-slot-range` | `<slot> <lower> <upper>` | Set note range for slot (0–127) |
| `set-range-enable` | `<0\|1>` | Enable/disable slot range |

### Voice

| Command | Arguments | Description |
|---|---|---|
| `voice-mode` | `<slot> <0–3>` | Set voice mode (0=poly 1=mono 2=legato 3=slgt) |
| `voice-count` | `<slot> <1–32>` | Set voice count |

### Clock

| Command | Arguments | Description |
|---|---|---|
| `set-master-clock-run` | `<0\|1>` | Start/stop master clock |
| `set-master-clock-bpm` | `<30–240>` | Set master clock BPM |

### Modules

| Command | Arguments | Description |
|---|---|---|
| `add-module` | `<slot> <va\|fx> <type-id> <module-id> <col> <row> <color> <num-modes> [modes] <num-params> [params] <name>` | Add module to patch |
| `del-module` | `<slot> <va\|fx> <module-id>` | Delete module (delete cables first) |
| `move-module` | `<slot> <va\|fx> <module-id> <col> <row>` | Move module to grid position |
| `set-module-color` | `<slot> <va\|fx> <module-id> <color:0–24>` | Set module color |
| `set-module-name` | `<slot> <va\|fx> <module-id> <name>` | Set module label |
| `set-module-mode` | `<slot> <va\|fx> <module-id> <param-idx> <value>` | Set module mode parameter |

### Cables

| Command | Arguments | Description |
|---|---|---|
| `add-cable` | `<slot> <va\|fx> <color:0–6> <from-mod> <0\|1> <from-con> <to-mod> <0\|1> <to-con>` | Add cable between jacks |
| `del-cable` | `<slot> <va\|fx> <from-mod> <0\|1> <from-con> <to-mod> <0\|1> <to-con>` | Delete cable |
| `set-cable-color` | `<slot> <va\|fx> <color:0–6> <from-mod> <0\|1> <from-con> <to-mod> <0\|1> <to-con>` | Set cable color |

### Parameters

| Command | Arguments | Description |
|---|---|---|
| `set-param` | `<slot> <va\|fx\|patch> <module-id> <param-idx> <value> <variation>` | Set module parameter value |
| `set-param-label` | `<slot> <va\|fx> <module-id> <param-idx> <label-idx> <label>` | Set parameter label |

### Resources & Daemon

| Command | Arguments | Description |
|---|---|---|
| `get-resources` | `<slot>` | Get CPU/memory resource usage |
| `daemon` | | Persistent: watch events + accept JSON commands on stdin |
| `seq` | `"<cmd1>" "<cmd2>" ...` | Run multiple commands sequentially |

### Monitoring

```bash
g2-cli watch                            # monitor G2 messages
g2-cli daemon                           # persistent connection: watch (stout) + commands on stdin
```

#### Daemon

**Recommended: [tmux](https://github.com/tmux/tmux/wiki/Installing) dev environment**

For interactive daemon use, use the tmux launcher (needs tmux installed on your machine):

```bash
cd cli
./g2tmux.sh
```

This opens a split-pane tmux session:
- **Left pane**: daemon output (watch events, responses)
- **Right pane**: command shell with autocomplete

Type commands directly (no prefix needed), some examples:
```bash
slot A                                  # switch focus to slot A
get-patch A                             # read patch from slot A
variation 4 B                           # select variation 4 on slot B
verbose off                             # suppress LED/volume updates
set-perf-mode patch                     # switch to patch mode
stop                                    # kill daemon
start                                   # restart daemon
```

Note: Type command name + `TAB` to autocomplete (commands only, system commands suppressed). Arguments also autocomplete: `get-patch <TAB>` → `A B C D`.

**Manual daemon mode** (if not using tmux):

```bash
# Terminal 1 — start daemon, reading commands from a named pipe
mkfifo /tmp/g2-cmd
./build/bin/g2-cli daemon < /tmp/g2-cmd

# Terminal 2 — keep the pipe open and send commands like this:
exec 3>/tmp/g2-cmd
echo '{"id":1,"cmd":"slot","args":["B"]}' >&3               # Change slot B
echo '{"id":2,"cmd":"variation","args":["4","B"]}' >&3      # Change to variation 4 on slot B
echo '{"id":3,"cmd":"device"}' >&3                          # device info
echo '{"id":5,"cmd":"verbose","args":["off"]}' >&3          # suppress LED/volume
exec 3>&-   # close when done (causes daemon to exit cleanly)
```

The `exec 3>/tmp/g2-cmd` keeps the write end open so each `echo` doesn't trigger EOF.
