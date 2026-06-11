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

```bash
g2-cli connect                          # connect to G2
g2-cli disconnect                       # close connection
g2-cli startup                          # full startup (init + device + all slots + names)
g2-cli device                           # show device info
g2-cli -h                               # list all available commands
```

### Monitoring

```bash
g2-cli watch                            # monitor G2 messages
g2-cli daemon                           # persistent connection: watch (stout) + commands on stdin
```

**Recommended: tmux dev environment**

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
