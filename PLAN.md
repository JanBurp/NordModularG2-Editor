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

| Command | SubCommand | Notes |
|---------|------------|-------|
| `g2-cli connect` | - | Auto-detect G2, claim interface |
| `g2-cli disconnect` | - | Release interface, close |
| `g2-cli list-devices` | - | Debug: list all USB devices |
| `g2-cli status` | 0x02 | All 4 slots, current slot, variation, performance |
| `g2-cli get-patch [slot]` | 0x35+0x28 | Full patch data as JSON (default: current) |
| `g2-cli get-patch-name [slot]` | 0x28 | Just the name (fast) |
| `g2-cli set-patch-json <slot> <file.json>` | 0x37 | Parse JSON and upload patch |
| `g2-cli set-patch-pch <slot> <file.pch2>` | 0x37 | Upload raw G2 patch file |
| `g2-cli set-patch-prf <file.prf2>` | - | Upload performance file (no slot needed) |
| `g2-cli select-slot <A|B|C|D>` | 0x09 | Change active slot |
| `g2-cli select-variation <1-8>` | 0x6a | Change variation |
| `g2-cli list-modules [slot]` | 0x34 | List modules in patch |
| `g2-cli get-param <module> <param> [variation]` | 0x2e | Get param value |
| `g2-cli set-param <module> <param> <value> [variation]` | 0x40 | Set param value |
| `g2-cli watch` | - | Monitor param changes live |

## File Formats

- **.pch2**: Native G2 patch format (raw binary)
- **.prf2**: Native G2 performance format (raw binary)
- **.json**: Parsed patch structure (for editing)

## Output Flags

| Flag | Output |
|------|--------|
| (default) | Compact single-line |
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
- **Timeout**: 100ms standard

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
│   ├── g2_device.c     # USB connect/disconnect (from usbComms.c)
│   ├── g2_device.h
│   ├── g2_protocol.c   # Command building (from usbComms.c)
│   ├── g2_protocol.h
│   ├── g2_parse.c      # Response parsing (from protocol.c)
│   ├── g2_parse.h
│   ├── output.c         # JSON/text output formatting
│   ├── output.h
│   ├── crc.c            # CRC-16 (from utils.c)
│   ├── crc.h
│   └── bitstream.c      # Bit stream parsing (from utils.c)
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
./build/bin/g2-cli status
```

## Example output:

### status

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
        "polarity": "open",
        "gain": 1.5
    },
    "performance": {
        "name": "New Performance",
        "focus": "a",
        "rangeEnable": false,
        "bpm": 80,
        "clockRunning": true,
        "kbSplit": false
    },
    "slots": []
}



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

### Phase 3: Protocol - Status Command
- [x] Create g2_protocol.c/h (command building)
- [x] Create output.c/h (JSON formatting)
- [x] Implement status command
- [x] Test: `./build/bin/g2-cli status` - WORKS! Returns `{"status": "ok", "performance": "The Burp"}`

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

## Notes

- Based on original C code from G2-Edit project
- Protocol constants copied from defs.h
- USB VID: 0x0ffc, PID: 0x02
- Using libusb-1.0 (not node-usb)
- Build uses hardcoded libusb path: /opt/homebrew/Cellar/libusb/1.0.29
