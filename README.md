# G2 Editor

CLI and Electron GUI for Nord G2 synthesizer.

## Structure

- `cli/` — C CLI tool for USB communication with the G2 hardware
- `g2-editor/` — Electron desktop app (Vue 3 + TypeScript)

## Build

### CLI

```bash
cd cli && make
cd cli && make test   # run tests
```

### Electron app

```bash
cd g2-editor
npm install
cd ../cli && make && cd ../g2-editor   # rebuild CLI first
npm run postinstall                     # copies CLI binary into app resources
npm run dev                             # development server
npm run build                           # production build + package
```

## CLI Commands

### Connection

```bash
g2-cli startup                          # full startup (init + device + all slots + names)
g2-cli connect                          # connect to G2
g2-cli disconnect                       # close connection
g2-cli device                           # show device info
g2-cli list-devices                     # list USB devices (debug)
```

### Patches

```bash
g2-cli get-patch <A|B|C|D>             # read patch from slot as JSON
g2-cli get-patch-file <slot> [file]    # save patch as .pch2 file
g2-cli list [type] [bank <n>]          # list patches and performances
g2-cli slot <A|B|C|D>                  # change active slot on device
g2-cli variation <1-8> <A-D>           # select variation for slot
```

### Modules

Area: `va` = voice area, `fx` = FX area. Grid: `col`/`row` are 0-based.

```bash
g2-cli add-module <slot> <va|fx> <type-id> <module-id> <col> <row>
g2-cli del-module <slot> <va|fx> <module-id>    # delete cables first
g2-cli move-module <slot> <va|fx> <module-id> <col> <row>
```

### Cables

Jack type: `0` = input, `1` = output. Color: 0–6.

```bash
g2-cli add-cable <slot> <va|fx> <color> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>
g2-cli del-cable <slot> <va|fx> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>
```

### Monitoring

```bash
g2-cli watch                            # monitor param/cable/slot changes live
```

### Output formats

```bash
g2-cli --json <command>                 # single-line JSON output
g2-cli --pretty <command>              # pretty-printed JSON
g2-cli --debug <command>               # show raw USB data in hex
```
