# G2 CLI Plan

## Overview

C/C++ CLI tool to communicate with Nord G2 synthesizer via USB, without graphical rendering.

## Architecture
```
┌──────────────┐     ┌─────────────┐
│  C/C++       │ <-> │     usb     │
│  CLI         │     │  (libusb)   │
└──────────────┘     └─────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `g2-cli connect` | Connect to G2 (auto-detect) |
| `g2-cli disconnect` | Close connection |
| `g2-cli list-devices` | List USB devices (debug) |
| `g2-cli status` | All 4 slots, current slot, variation, performance |
| `g2-cli get-patch [slot]` | Full patch as JSON (default: current) |
| `g2-cli get-patch-name [slot]` | Just the name (fast) |
| `g2-cli set-patch <slot> <file.json>` | Upload JSON patch |
| `g2-cli import-patch <file.pch2> [slot]` | Import native G2 format |
| `g2-cli watch` | Monitor param changes live |
| `g2-cli select-slot <A|B|C|D>` | Change active slot |
| `g2-cli select-variation <1-8>` | Change variation |
| `g2-cli list-modules [slot]` | List modules in patch |
| `g2-cli get-param <module> <param> [variation]` | Get param value |
| `g2-cli set-param <module> <param> <value> [variation]` | Set param value |

## Output Flags

| Flag | Output |
|------|--------|
| (default) | Compact single-line |
| `--json` | Single-line JSON (for piping) |
| `--pretty` | Multi-line formatted |
| `--tree` | Indented tree view |

## Dependencies

- `commander` - CLI framework
- `usb` - USB communication
- `object-treeify` - Tree output

## Test Commands

```bash
```

## Preferences

1. Default slot: Current slot from synth
2. Validation: Strict (full valid data required, fail on errors)
3. Async: Promises (async/await)

---

## Progress

### Phase 1: Core Utilities
- [ ] Initialize project
- [ ] Create src/utils/bitstream.ts
- [ ] Create src/utils/crc.ts
- [ ] Create src/protocol/constants.ts
- [ ] Test bitstream and CRC (`node dist/test/test.js --phase1`)

### Phase 2: USB Device Layer
- [ ] Create src/usb/device.ts
- [ ] Implement connect/disconnect
- [ ] Test list-devices command (`node dist/test/test.js --phase2`)

### Phase 3: Protocol - Status Command
- [ ] Create src/protocol/types.ts
- [ ] Create src/protocol/commands.ts
- [ ] Create src/utils/output.ts
- [ ] Create src/protocol/client.ts
- [ ] Implement status command
- [ ] Debug: G2 not responding to commands (needs init sequence investigation)

### Phase 4: Protocol - Get-Patch Command
- [ ] Implement get-patch command

### Phase 5: Protocol - Write
- [ ] Create src/protocol/serializer.ts
- [ ] Create src/protocol/import.ts
- [ ] Implement set-patch command
- [ ] Implement import-patch command

### Phase 6: Live Control
- [ ] Implement watch command
- [ ] Implement select-slot command
- [ ] Implement select-variation command
- [ ] Implement list-modules, get-param, set-param

---

## Decisions Log

- 2026-04-11: JSON as primary data format
- 2026-04-11: Promises for async operations
- 2026-04-11: Strict validation mode

## Notes

- Based on original C code from G2-Edit project
- Protocol constants copied from defs.h
- USB VID: 0x0ffc, PID: 0x02
