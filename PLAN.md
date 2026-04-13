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
| `g2-cli settings` | 0x02 | Done (including performance data and slot parsing) |
| `g2-cli slot <A\|B\|C\|D>` | 0x7d | Done |
| `g2-cli variation <1-8>` | 0x6a | NOT WORKING |
| `g2-cli get-patch <slot>` | 0x35+0x28 | Done (slot required) |
| `g2-cli get-patch-name [slot]` | 0x28 | Not implemented |
| `g2-cli list` | 0x14 | **Done** |
| `g2-cli set-patch-json <slot> <file.json>` | 0x37 | Not implemented |
| `g2-cli set-patch-pch <slot> <file.pch2>` | 0x37 | Not implemented |
| `g2-cli set-patch-prf <file.prf2>` | - | Not implemented |
| `g2-cli select-slot <A\|B\|C\|D>` | 0x09 | Done (alias for slot) |
| `g2-cli select-variation <1-8>` | 0x6a | Done (alias for variation) |
| `g2-cli list-modules [slot]` | 0x34 | Not implemented |
| `g2-cli get-param <module> <param> [variation]` | 0x2e | Not implemented |
| `g2-cli set-param <module> <param> <value> [variation]` | 0x40 | Not implemented |
| `g2-cli watch` | - | Not implemented |

## Testing Notes

**Real G2 hardware testing required for:**
- `g2-cli list` - Test with real G2 to verify patch/performance listing
- `g2-cli get-patch-file <slot> [filename]` - Test file output with real G2
- `g2-cli variation <1-8>` - Debug why NOT WORKING

## Output Flags

| Flag | Output |
|------|--------|
| (default) | Pretty JSON (multi-line formatted) |
| `--json` | Single-line JSON (for piping) |
| `--pretty` | Multi-line formatted (same as default) |
| `--tree` | Indented tree view |

### Tip

use --json output together with fx (https://fx.wtf/):

`g2-cli --json settings |fx`


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
│   ├── bitstream.h
│   ├── utils.c          # CRC, parse_slot, parse_name utilities
│   ├── utils.h
│   ├── output.c         # JSON/text formatting
│   ├── output.h
│   ├── cjson.c          # JSON library
│   └── cjson.h
├── include/
│   ├── defs.h          # Protocol constants (from G2-Edit)
│   └── g2_device.h
├── test/
│   ├── unity.h         # Unity test framework
│   ├── unity.c
│   ├── unity_internals.h
│   ├── run_tests.c     # Test runner
│   ├── test_crc.c
│   ├── test_parse.c
│   ├── test_bitstream.c
│   ├── test_settings_parse.c
│   ├── test_real_data.c
│   ├── test_parse_settings.h
│   └── mocks/          # Real G2 responses (hex format)
│       ├── patch-focus-c.txt
│       ├── perf-focus-c.txt
│       ├── patch-focus-a.txt
│       ├── patch-focus-d.txt
│       ├── factory-patch.txt
│       └── perf-focus-a.txt
└── build/
    ├── bin/
    │   └── g2-cli      # Built executable
    └── test/
        └── g2-tests     # Test executable
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

# Run CLI
./build/bin/g2-cli --help
./build/bin/g2-cli list-devices
./build/bin/g2-cli connect
./build/bin/g2-cli settings

# Run unit tests
make test
```

## Example output:

### settings (Patch mode - outputs "patches")

```json
{
  "synthName": "The Burp",
  "mode": "Patch",
  "midi": {
    "slots": { "a": 10, "b": 11, "c": 12, "d": 13, "global": 15 },
    "sysex": 17,
    "local": true,
    "prgch": "recv",
    "clkse": false,
    "clkre": false
  },
  "tuning": { "semi": 0, "cent": 0 },
  "pedal": { "polarity": false, "gain": 1.5 },
  "patches": {
    "name": "Lyra4",
    "focus": "c",
    "rangeEnable": false,
    "bpm": 105,
    "clockRunning": false,
    "kbSplit": false
  },
  "slots": [
    { "slot": "a", "bank": 0, "patch": 15, "name": "Piano&Mic", "active": false, "key": false, "hold": false, "range": { "lower": 0, "upper": 59 } },
    { "slot": "b", "bank": 0, "patch": 0, "name": "O-CoasT", "active": false, "key": false, "hold": false, "range": { "lower": 0, "upper": 59 } },
    { "slot": "c", "bank": 0, "patch": 1, "name": "Lyra4", "active": true, "key": true, "hold": false, "range": { "lower": 60, "upper": 127 } },
    { "slot": "d", "bank": 9, "patch": 9, "name": "ER 1", "active": false, "key": false, "hold": false, "range": { "lower": 60, "upper": 127 } }
  ]
}
```

### settings (Performance mode - outputs "performance")

```json
{
  "synthName": "The Burp",
  "mode": "Performance",
  "midi": { ... },
  "tuning": { ... },
  "pedal": { ... },
  "performance": {
    "name": "PianPerformance",
    "focus": "c",
    "rangeEnable": false,
    "bpm": 120,
    "clockRunning": true,
    "kbSplit": false
  },
  "slots": [ ... ]
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
- [x] Integrated cJSON library for robust JSON building (cJSON.c + cJSON.h in src/)

### Phase 4: Protocol - Get-Patch
- [x] Implement get-patch command (slot, version, patch data, name)
- [x] Handle both EMBEDDED (slots B,C,D) and EXTENDED (slot A) response types
- [x] Name parsing offset: 5 for EMBEDDED, 4 for EXTENDED
- [x] Test: `./build/bin/g2-cli get-patch A` - Returns "Piano&Mic"
- [x] Test: `./build/bin/g2-cli get-patch B` - Returns "O-CoasT"
- [x] Test: `./build/bin/g2-cli get-patch C` - Returns "Lyra4"
- [x] Test: `./build/bin/g2-cli get-patch D` - Returns "ER 1"

### Phase 5: Protocol - Write
- [ ] Implement set-patch-json
- [ ] Implement set-patch-pch
- [ ] Implement set-patch-prf
- [ ] Test file uploads

### Phase 6: Live Control
- [x] Implement slot command (matching g2ctl protocol)
- [x] Implement variation command (matching g2ctl protocol) - NOT WORKING
- [ ] Debug variation command
- [ ] Implement list-modules, get-param, set-param
- [ ] Implement watch (polling)

### Phase 7: Unit Tests
- [x] Set up Unity test framework
- [x] Create test infrastructure (test/, run_tests.c)
- [x] Test CRC calculation (6 tests passing)
- [x] Test parse_slot (6 tests passing)
- [x] Test parse_name (6 tests passing)
- [x] Test bitstream init/seek/tell (3 tests passing)
- [x] Test g2_parse_settings with mock data (9 tests passing)
- [x] All 30 tests passing
- [x] Added --debug flag to capture real G2 responses
- [x] Captured 6 real G2 mock data states
- [x] All 36 tests passing (30 unit + 6 real data)
- [x] Added 10 get-patch name parsing tests (46 total now)

### Phase 8: List Command
- [x] Implement list command to enumerate all patches and performances in G2 memory
- [x] Iterate through both Patch (Pch2) and Performance (Prf2) modes
- [x] Parse control codes: JUMP, SKIP, BANK, MODE, CONTINUE
- [x] Parse category names using g2categories mapping
- [ ] Test with real G2 hardware

---

## List Command Protocol

**Reference:** `g2ctl.py:1055-1117`

**Command:** `CMD_SYS + 0x41 + 0x14 + mode + bank + patch`
- `CMD_SYS = 0x0c`
- `0x14 = g2QueryBankPatchList`
- `mode`: 0 = Pch2 (patches), 1 = Prf2 (performances)
- `bank`: 0-8 (bank number, 1-indexed in output)
- `patch`: 0-127 (patch number within bank, 1-indexed in output)

**Response:** Bulk data starting at offset 9, ending at offset -2
```
[data[9:-2]]
```

**Control Codes in Response:**
| Code | Value | Name | Action |
|------|-------|------|--------|
| JUMP | 1 | JUMP | `patch = data[1]`; data = data[2:] |
| SKIP | 2 | SKIP | `patch += 1`; data = data[1:] |
| BANK | 3 | BANK | `bank = data[1], patch = data[2]`; data = data[3:] |
| MODE | 4 | MODE | `mode += 1, bank = 0, patch = 0`; data = data[1:] |
| CONTINUE | 5 | CONTINUE | Continue to next entry |

**Entry Format (when code > CONTINUE):**
```
[code] [name...] [category:1]
```
- `name`: parse_name() returns name + remaining data
- `category`: data[0], remaining = data[1:]
- Output: `type bank:patch category name`

**G2 Categories:**
| Value | Name |
|-------|------|
| 0 | no_cat |
| 1 | acoustic |
| 2 | sequencer |
| 3 | bass |
| 4 | classic |
| 5 | drum |
| 6 | fantasy |
| 7 | fx |
| 8 | lead |
| 9 | organ |
| 10 | pad |
| 11 | piano |
| 12 | synth |
| 13 | audio_in |
| 14 | user_1 |
| 15 | user_2 |

**Example JSON Output:**
```json
{
  "patches": [
    { "bank": 1, "patch": 1, "category": "Lead", "name": "My Patch" }
  ],
  "performances": [
    { "bank": 1, "patch": 1, "category": "-", "name": "My Perf" }
  ]
}
```

---

## Decisions Log

- 2026-04-12: C implementation using libusb-1.0 directly
- 2026-04-12: Reuse working code from G2-Edit
- 2026-04-12: JSON as primary data format
- 2026-04-12: Separate commands for JSON vs raw patch upload
- 2026-04-12: Performance files (.prf2) don't need slot parameter
- 2026-04-12: Boolean values use true/false (not "on"/"off" strings)
- 2026-04-12: Command renamed from "status" to "settings"
- 2026-04-12: Using cJSON library for JSON building (ultralightweight, single-file, MIT license)
- 2026-04-12: Pretty-print uses 2-space indent, 1 space after colon (compact format)
- 2026-04-12: JSON output mode uses silent connect (no messages to stderr)
- 2026-04-12: Connection/status messages go to stderr (not stdout)
- 2026-04-12: Mode byte offset is 13 (after null), bit 7 (not byte 14, bit 0)
- 2026-04-12: Focus slot byte offset is 8, bits 4-5 (not byte 21)
- 2026-04-12: Settings command outputs "patches" in Patch mode, "performance" in Performance mode
- 2026-04-12: Slot command implemented matching g2ctl protocol (0x7d + multi-step selection)
- 2026-04-12: Variation command implemented matching g2ctl protocol (0x35 + 0x6a)
- 2026-04-12: Extracted parsing functions to utils.c for testability
- 2026-04-12: Created g2_parse_settings() for testable parsing without USB
- 2026-04-12: Using Unity test framework for unit tests
- 2026-04-12: slot_t moved to defs.h for shared use across modules
- 2026-04-13: get-patch name parsing: EMBEDDED uses offset 5, EXTENDED uses offset 4

## Verified Byte Offsets (Synth Settings Bulk Data)

| Field | Byte Offset | Bits | Notes |
|-------|-------------|------|-------|
| name | 4-11 | - | Up to 16 bytes, null-terminated (8 chars + null for "The Burp") |
| mode | 13 | bit 7 | 0=Patch, 1=Performance (byte after null terminator) |
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

**Byte offsets relative to start of performance bulk data:**

| Field | Byte Offset | Notes |
|-------|-------------|-------|
| perf name | 4-... | parse_name returns name + null + remaining |
| remaining after name | nameLen | parse_name returns nameLen including null |
| focus | remaining[0] | bits 4-5 (after BitStream seek to bit 32) |
| rangeEnable | remaining[5] | 8-bit value at bit 38 |
| bpm | remaining[6] | 8-bit value at bit 46 |
| split | remaining[7] & 1 | bit 0 of byte 7 |
| clockRun | remaining[8] & 1 | bit 0 of byte 8 |
| slot data | remaining[11] | start of slot parsing loop |
| slot stride | 10 bytes | 7 bytes data + 3 padding |

**Note:** In Patch mode, `name` field uses `slotNames[focusSlot]` instead of perf name.

## Notes

- Based on original C code from G2-Edit project
- Protocol constants copied from defs.h
- USB VID: 0x0ffc, PID: 0x02
- Using libusb-1.0 (not node-usb)
- Build uses hardcoded libusb path: /opt/homebrew/Cellar/libusb/1.0.29
