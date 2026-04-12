# G2 CLI - C Implementation Plan

## Overview

Create a C-based CLI tool using libusb-1.0 to communicate with Nord G2 synthesizer. Reuse the working USB code from G2-Edit (src/usbComms.c) which successfully communicates with the G2.

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   main.c     │ <-> │ g2_device.c│ <-> │ libusb-1.0   │
│  (CLI args)  │     │             │     │   (system)   │
└──────────────┘     └─────────────┘     └──────────────┘
       │                   │
       │            ┌──────┴──────┐
       │            │ g2_protocol.c│
       │            │ g2_parse.c  │
       │            └─────────────┘
       v
   stdout (JSON/text)
```

## Commands

| Command | SubCommand | Status |
|---------|------------|--------|
| `g2-cli connect` | - | Done |
| `g2-cli disconnect` | - | Done |
| `g2-cli list-devices` | - | Done |
| `g2-cli settings` | 0x02 | Done |
| `g2-cli get-patch [slot]` | 0x35+0x28 | Not implemented |
| `g2-cli get-patch-name [slot]` | 0x28 | Not implemented |
| `g2-cli set-patch-json <slot> <file.json>` | 0x37 | Not implemented |
| `g2-cli set-patch-pch <slot> <file.pch2>` | 0x37 | Not implemented |
| `g2-cli set-patch-prf <file.prf2>` | - | Not implemented |
| `g2-cli select-slot <A|B|C|D>` | 0x09 | Not implemented |
| `g2-cli select-variation <1-8>` | 0x6a | Not implemented |
| `g2-cli list-modules [slot]` | 0x34 | Not implemented |
| `g2-cli get-param <module> <param> [variation]` | 0x2e | Not implemented |
| `g2-cli set-param <module> <param> <value> [variation]` | 0x40 | Not implemented |
| `g2-cli watch` | - | Not implemented |

## Output Flags

| Flag | Output |
|------|--------|
| (default) | Single-line JSON |
| `--json` | Single-line JSON (for piping) |
| `--pretty` | Multi-line formatted |
| `--tree` | Indented tree view |

## Reusable Code from G2-Edit

| File | Parts to Reuse |
|------|----------------|
| src/usbComms.c | USB init, libusb_bulk_transfer calls, send/recv |
| src/protocol.c | Patch parsing/serializing |
| src/defs.h | All protocol constants (COMMAND_*, SUB_COMMAND_*) |
| src/types.h | Data structures (tModuleKey, tLocation, etc.) |
| src/utils.c | CRC calculation |

## USB Communication Details (from usbComms.c)

- **VID/PID**: 0x0ffc / 0x0002
- **Bulk OUT**: endpoint 3 (writes)
- **Interrupt IN**: endpoint 0x81 (responses)
- **Bulk IN**: endpoint 0x82 (extended data)
- **Timeout**: 100ms standard, 2000ms for bulk data

## Command Format

```
[length:2] [0x01] [CMD] [0x41] [subCommand] [CRC:2]
```

- CMD: 0x2c (CMD_REQ|CMD_SYS) or 0x28 (CMD_REQ|CMD_SLOT)
- CRC: CCITT-16 calculated over data bytes

## Project Structure

```
c-cli/
├── Makefile
├── src/
│   ├── main.c           # CLI entry, argument parsing
│   ├── g2_device.c     # USB connect/disconnect, status command
│   ├── g2_device.h
│   ├── bitstream.c      # Bit stream parsing
│   └── bitstream.h
├── include/
│   ├── defs.h          # Protocol constants (from G2-Edit)
│   └── g2_device.h
└── build/
    └── bin/
        └── g2-cli      # Built executable
```

## Build Requirements

- libusb-1.0 (installed at /opt/homebrew/Cellar/libusb/1.0.29)
- gcc or clang
- make

## Build & Run Commands

```bash
cd c-cli

# Build
make

# Run tests
./build/bin/g2-cli --help
./build/bin/g2-cli list-devices
./build/bin/g2-cli connect
./build/bin/g2-cli settings
```

## Example output:

### settings

```json
{
  "name": "The Burp",
  "mode": "Patch",
  "midi": {
    "slots": {
      "a": 10,
      "b": 11,
      "c": 12,
      "d": 13,
      "global": 15
    },
    "sysex": 17,
    "local": true,
    "prgch": "recv",
    "clkse": true,
    "clkre": true
  },
  "tuning": {
    "semi": 0,
    "cent": 0
  },
  "pedal": {
    "polarity": false,
    "gain": 1.5
  },
  "performance": {
    "name": "New Performance",
    "focus": "a",
    "rangeEnable": true,
    "bpm": 80,
    "clockRunning": true,
    "kbSplit": false
  },
  "slots": [
    {
      "slot": "a",
      "patch": "1:16",
      "name": "Piano&Mic",
      "active": true,
      "key": true,
      "hold": false,
      "range": {"lower": 0, "upper": 127}
    },
    {
      "slot": "b",
      "patch": "1:1",
      "name": "O-CoasT",
      "active": false,
      "key": false,
      "hold": false,
      "range": {"lower": 0, "upper": 127}
    },
    {
      "slot": "c",
      "patch": "1:1",
      "name": "O-CoasT",
      "active": false,
      "key": false,
      "hold": false,
      "range": {"lower": 0, "upper": 127}
    },
    {
      "slot": "d",
      "patch": "10:10",
      "name": "ER 1",
      "active": false,
      "key": false,
      "hold": false,
      "range": {"lower": 0, "upper": 127}
    }
  ]
}
```

---

## Progress

### Phase 1: Project Setup
- [x] Create Makefile
- [x] Create include/ directory with defs.h from G2-Edit
- [x] Create src/ directory structure
- [x] Verify build: `make` - SUCCESS

### Phase 2: USB Device Layer
- [x] Create g2_device.c/h from usbComms.c
- [x] Implement connect/disconnect
- [x] Test list-devices command
- [x] Test connect command

### Phase 3: Protocol - Settings Command
- [x] Create g2_protocol.c/h (command building)
- [x] Create output.c/h (JSON formatting)
- [x] Implement settings command (renamed from status)
- [x] Parse synth settings (mode, MIDI channels, sysex, local, prgch, clkse, clkre)
- [x] Parse tuning (semi, cent)
- [x] Parse pedal (polarity, gain)
- [x] Parse performance data (name, focus, rangeEnable, bpm, clockRunning, kbSplit)
- [x] Parse slot data (slot, patch, name, active, key, hold, range)
- [x] Test: `./build/bin/g2-cli settings` - WORKS!
- [x] Refactored to output JSON internally, then pass to `output_json()` for formatting
- [x] Implemented tree format output
- [x] Commands output JSON then call generic `output_json()` for formatting

### Phase 4: Protocol - Get-Patch
- [ ] Implement get-patch-name command
- [ ] Implement get-patch command
- [ ] Test: `./build/bin/g2-cli get-patch A`

### Phase 5: Protocol - Write
- [ ] Implement set-patch-json
- [ ] Implement set-patch-pch
- [ ] Implement set-patch-prf
- [ ] Test file uploads

### Phase 6: Live Control
- [ ] Implement select-slot, select-variation
- [ ] Implement list-modules, get-param, set-param
- [ ] Implement watch (polling)

---

## Decisions Log

- 2026-04-12: C implementation using libusb-1.0 directly
- 2026-04-12: Reuse working code from G2-Edit
- 2026-04-12: JSON as primary data format
- 2026-04-12: Separate commands for JSON vs raw patch upload
- 2026-04-12: Performance files (.prf2) don't need slot parameter
- 2026-04-12: Boolean values use true/false (not "on"/"off" strings)
- 2026-04-12: Command renamed from "status" to "settings"

## Verified Byte Offsets (Synth Settings Bulk Data)

| Field | Byte Offset | Bits | Notes |
|-------|-------------|------|-------|
| name | 4-13 | - | Up to 16 bytes, null-terminated |
| mode | 14 | bit 0 | 0=Patch, 1=Performance |
| MIDI A-D, Global | 18-22 | - | Channels 0-15 |
| sysex | 23 | - | +1 for display |
| local | 24 | bit 7 | 0x80 = on |
| prgch | 25 | bits 0-1 | 0=off, 1=send, 2=recv, 3=send/recv |
| clkse | 27 | bit 1 | lookup ['on','off'] = [0,1] |
| clkre | 27 | bit 0 | lookup ['on','off'] = [0,1] |
| tune cent | 28 | - | Signed byte |
| tune semi | 30 | - | Signed byte |
| pedal polarity | 32 | bit 0 | |
| pedal gain | 34 | - | 1.0 + 0.5 * val / 32 |

## Performance Data Parsing

Commands: 0x81 (get selection), then 0x10 (get performance data)

| Field | Byte Offset | Notes |
|-------|-------------|-------|
| name | 4-... | parse_name returns name + remaining data |
| perf settings | +11 | Skip 4 header + name |
| slot name | +0 | parse_name for each slot |
| slot data | +16 after name | active, key, hold, bank, patch, low, high |
| slot stride | +10 after data | |

## Notes

- Based on original C code from G2-Edit project
- Protocol constants copied from defs.h
- USB VID: 0x0ffc, PID: 0x02
- Using libusb-1.0 (not node-usb)
- Build uses hardcoded libusb path: /opt/homebrew/Cellar/libusb/1.0.29