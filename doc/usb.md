# Nord G2 USB Protocol

Reference derived from the CLI source in `cli/src/g2_device.c`, `cli/include/defs.h`, `cli/src/utils.c`, confirmed against the original Delphi editor (`BVE.NMG2USB.pas`), and cross-checked with the Python tool `g2ools/g2ctl.py`.

---

## 1. USB Device

| Property | Value |
|----------|-------|
| Vendor ID | `0x0ffc` |
| Product ID | `0x0002` |
| Interface | 0 |
| Bulk OUT endpoint | `0x03` |
| Interrupt IN endpoint | `0x81` |
| Bulk IN endpoint | `0x82` |

**Timeouts:**
- Standard: 100 ms
- Long (patch name): 2000 ms
- Send delay (after every bulk write): 10 ms (`usleep(10000)`)

> Note: the interrupt endpoint (`0x81`) is polled with `libusb_bulk_transfer`, not `libusb_interrupt_transfer`. On macOS, interrupt_transfer can ignore timeouts after rapid transfers and hang the watch loop.

> **`libusb_clear_halt` gotcha:** Do NOT call `libusb_clear_halt` on a freshly cold-reset G2. With no halt present, the resulting CLEAR_FEATURE(ENDPOINT_HALT) request puts the device in a state where streaming notifications still flow (e.g. `assigned_voices`) but direct queries time out (`recv_interrupt` returns nothing) and BULK_OUT eventually stalls on the next send. Only issue `libusb_clear_halt` after a verified halt condition (e.g. a prior bulk transfer returned `LIBUSB_ERROR_PIPE`).

---

## 2. Packet Framing

Every outgoing packet has the same envelope:

```
Offset  Bytes  Description
──────  ─────  ────────────────────────────────────────────────────
0       2      Length (big-endian uint16).  Covers bytes [2..end].
                Does NOT include these 2 length bytes themselves.
2       1      Message header — always 0x01
                (Exception: CMD_INIT uses 0x80, no 0x01 header)
3       1      Scope byte  (see §4)
4       1      Command ID  (0x41 for most system commands)
5+      N      Sub-command + payload
N-2     2      CRC-16/CCITT (big-endian), computed over bytes [2..N-3]
```

**Example — GET_SYNTH_SETTINGS built step by step:**

```
payload bytes (before CRC):  01 2C 41 02
crc = calc_crc16([01 2C 41 02])
full packet: 00 08  01 2C 41 02  CRC_HI CRC_LO
             └─len─┘└────payload + CRC────────┘
```

Length field = 8 (4 payload bytes + 4 framing: 2 length bytes not counted, but length covers header+payload+CRC = 4+2+2 = 8 - wait, see below for exact formula).

**Length formula (from code):**
```
msgLength = (number of payload bytes including 0x01 header)
msgLength += 4   ← always added after CRC is appended (accounts for length field + 2 CRC bytes + padding)
buff[0] = (msgLength >> 8) & 0xff
buff[1] = msgLength & 0xff
```

So length = (header + scope + cmd_id + subcmd + extra) + 4.

---

## 3. CRC-16/CCITT

Polynomial `0x1021`, seed `0x0000`. Computed over the payload bytes starting at offset 2 (the `0x01` header), **not** including the 2-byte length field.

```c
uint16_t crc_iterator(int32_t seed, int32_t val) {
    int32_t k = (((seed >> 8) ^ val) & 255) << 8;
    int32_t crc = 0;
    for (int i = 0; i < 8; i++) {
        if ((crc ^ k) & 0x8000)
            crc = (crc << 1) ^ 0x1021;
        else
            crc = crc << 1;
        k = k << 1;
    }
    return (uint16_t)((seed << 8) ^ crc) & 0xFFFF;
}

uint16_t calc_crc16(uint8_t *buff, int length) {
    uint16_t crc = 0;
    for (int i = 0; i < length; i++)
        crc = crc_iterator(crc, buff[i]);
    return crc;
}
```

CRC bytes are appended big-endian: `[crc >> 8, crc & 0xff]`.

---

## 4. Scope Byte

The scope byte at offset 3 encodes request type (high nibble) and target (low nibble):

```
Bit 5-4  Request type
  0x20   COMMAND_REQ          — G2 sends a response
  0x30   COMMAND_WRITE_NO_RESP — no response (used for SET_PARAM)

Bit 3-0  Target
  0x0C   COMMAND_SYS          — system / global
  0x08   COMMAND_SLOT         — slot specific (OR with slot 0-3 for A-D)
```

Combined scope values:

| Scope | Hex | Meaning |
|-------|-----|---------|
| System request | `0x2C` (`0x20\|0x0C`) | System command, expects reply |
| Slot A request | `0x28` (`0x20\|0x08\|0`) | Slot A command, expects reply |
| Slot B request | `0x29` | Slot B |
| Slot C request | `0x2A` | Slot C |
| Slot D request | `0x2B` | Slot D |
| Slot A write | `0x38` (`0x30\|0x08\|0`) | Slot A, no reply (SET_PARAM) |
| Slot B write | `0x39` | Slot B |
| Slot C write | `0x3A` | Slot C |
| Slot D write | `0x3B` | Slot D |

---

## 5. Initialization Sequence

On first connect the startup sequence is:

### Step 1 — CMD_INIT (`0x80`)

Resets the G2's patch version counters. Does not use the standard `0x01` header.

```
Packet:  00 05  80  CRC_HI CRC_LO
```

Response: Extended message. Bulk data starts with `0x80` (RESPONSE_TYPE_INIT).

### Step 2 — STOP_NOTIFICATIONS

Disarm any leftover streaming state from a previous session.

```
Packet:  00 09  01 2C 41 7D 01  CRC_HI CRC_LO
                         ↑  ↑
                         │  └── STOP_COMM = 0x01
                         └───── SUB_COMMAND_START_STOP = 0x7D
```

Response: Embedded ACK.

### Step 3 — GET_SYNTH_SETTINGS

Query device configuration (see §10 for response layout).

```
Packet:  00 08  01 2C 41 02  CRC_HI CRC_LO
```

Response: Extended bulk containing synth/MIDI/tuning settings.

### Step 4 — START_NOTIFICATIONS

Arm the G2 to send unsolicited watch events.

```
Packet:  00 09  01 2C 41 7D 00  CRC_HI CRC_LO
                               ↑
                               START_COMM = 0x00
```

Response: Embedded ACK.

### Minimal cold-connect (daemon flow)

The full 4-step sequence above mirrors the Delphi editor. The `g2-cli` daemon uses a simpler cold-connect that **skips CMD_INIT entirely**:

```
1. drain pending interrupts (consume any stale stream from a prior session)
2. send START_NOTIFICATIONS (0x7D 0x00)
3. read the embedded ACK
```

This works because every subsequent query goes through the daemon's disarm → body → rearm wrapper (`g2_watch_disarm()` / `g2_watch_rearm()`), which sends STOP_COMM before the query and START_COMM after. GET_PATCH_VERSION inside each query syncs the version counter on demand, so the patch-version reset that CMD_INIT performs is not needed.

**Critical:** this flow only works if `libusb_clear_halt` is **not** called between attach and START_COMM (see §1 gotcha). The reconnect-after-cable-pull path uses the same minimal sequence.

---

## 6. System Commands

Most system commands use `0x41` as the cmd_id byte:

```
[01][2C][41][sub_cmd][...extra][CRC]
```

However, some commands that need to be version-matched use the **performance version** in place of `0x41` — notably SELECT_SLOT and all performance-level commands (see §6b).

### 6a. System Commands (cmd_id = `0x41`)

| Sub-cmd | Name | Extra bytes | Response |
|---------|------|-------------|----------|
| `0x02` | GET_SYNTH_SETTINGS | — | Extended bulk (§10) |
| `0x03` | SET_SYNTH_SETTINGS | synth settings payload (§10) | Embedded ACK |
| `0x04` | GET_ASSIGNED_VOICES | — | Embedded; 4 voice counts at `[5..8]` |
| `0x0A ss bb ll` | RETRIEVE (bank→slot) | slot (0-3), bank (0-based), location (0-based) | Embedded ACK |
| `0x0B ss bb ll` | STORE (slot→bank) | slot (0-3), bank (0-based), location (0-based) | Embedded ACK |
| `0x0C tt bb ll 00` | CLEAR | file_type (0=patch,1=perf), bank, location, `0x00` | Embedded ACK |
| `0x0E tt bb ff tt 00` | CLEAR_BANK | file_type, bank, from_loc, bank, to_loc, `0x00` | Embedded ACK |
| `0x14 mm bb ll` | LIST_PATCHES | mode (0=patches,1=perfs), bank, patch start | Embedded or bulk (§11) |
| `0x17 tt bb ll` | PATCH_BANK_UPLOAD | file_type, bank, location | Extended bulk (`R_PATCH_BANK_UPLOAD`) |
| `0x19 tt bb ll` | PATCH_BANK_DATA (download) *(not in CLI)* | file_type, bank, location, name\0, size_hi, size_lo, 0x17, patch_data | Embedded ACK |
| `0x28 ss` | GET_PATCH_NAME (sys) | `ss`=slot (0-3) | Embedded; name at `response[5+]` |
| `0x35 ss` | GET_PATCH_VERSION | `ss`=slot (0-3) | Embedded; version at `response[6]` |
| `0x3B` | GET_MASTER_CLOCK | — | Embedded (`R_EXT_MASTER_CLOCK`) |
| `0x3D` | MIDI_DUMP | — | None |
| `0x3E mm 00` | SET_PERF_MODE | `mm`=mode (0=performance, 1=patch) | Embedded ACK |
| `0x56 oo nn` | PLAY_NOTE | `oo`=on/off (0=on,1=off), `nn`=MIDI note | None |
| `0x7D 0x00` | START_NOTIFICATIONS | — | Embedded ACK |
| `0x7D 0x01` | STOP_NOTIFICATIONS | — | Embedded ACK |
| `0x81` | UNKNOWN_1 (init query) | — | Extended bulk |

### 6b. Performance-Version System Commands (cmd_id = perf_version)

These use the same scope (`0x2C`) but put the **performance version** at the cmd_id position instead of `0x41`. Obtain the perf version from GET_PATCH_VERSION with slot=4 or from the init response.

```
[01][2C][perf_version][sub_cmd][...extra][CRC]
```

| Sub-cmd | Name | Extra bytes | Response |
|---------|------|-------------|----------|
| `0x09 ss` | SELECT_SLOT | `ss`=slot (0-3) | Embedded ACK |
| `0x10` | GET_PERF_SETTINGS | — | Extended bulk (performance settings) |
| `0x29` | SET_PERF_NAME | perf_name (null-terminated) | Embedded ACK |
| `0x3F FF 01 bpm` | SET_MASTER_CLOCK_BPM | `FF` unknown, `01`=BPM mode, `bpm`=value | None |
| `0x3F FF 00 run` | SET_MASTER_CLOCK_RUN | `FF` unknown, `00`=run mode, `run`=0/1 | None |
| `0x59` | UNKNOWN_2 (perf init query) | — | Embedded ACK |
| `0x5E` | GET_GLOBAL_KNOBS | — | Extended bulk |

### SELECT_SLOT full sequence

Selecting a slot requires two system commands plus one slot command. The `version` byte for steps 1 and 2 comes from byte [3] of the START_COMM (`0x7D 0x00`) response — **not** from GET_PATCH_VERSION:

```
Step 1 (sys):   [01][2C][version][07][mask][0F][mask][CRC]
                mask = 0x08 >> slot   (A=0x08, B=0x04, C=0x02, D=0x01)

Step 2 (sys):   [01][2C][version][09][slot][CRC]

Step 3 (slot):  [01][28+slot][0x0a][70][CRC]
                version for step 3 is constant 0x0a (per g2ctl.py)
```

After all three commands, drain any pending notifications (`g2_drain_pending`).

> **CLI note:** `g2_select_slot` implements all three steps. Steps 1+2 use the performance version obtained via GET_PATCH_VERSION with slot=4.

---

## 7. Slot Commands

Slot commands include the patch version byte at offset 4 (instead of a fixed `0x41`):

```
[01][scope][version][sub_cmd][...extra][CRC]
     ↑
     0x28-0x2B for slots A-D (COMMAND_REQ | COMMAND_SLOT | slot)
     0x38-0x3B for write-only (COMMAND_WRITE_NO_RESP | COMMAND_SLOT | slot)
```

The `version` byte is obtained by GET_PATCH_VERSION before each slot command.

| Sub-cmd | Name | Extra bytes | Response |
|---------|------|-------------|----------|
| `0x28` | GET_PATCH_NAME | — | Embedded; name at `response[5+]` or bulk at `bulkData[4+]` |
| `0x2A` | SET_UPRATE_MODE *(not in CLI)* | `loc mod uprate` | Embedded ACK |
| `0x2B` | SET_MODULE_MODE | `loc mod param val` | Embedded ACK |
| `0x2E` | GET_SELECTED_PARAM | — | Embedded; area/module/param at `[5..7]` |
| `0x2F` | SEL_PARAM | `00 loc mod param` | No response (`WRITE_NO_RESP`) |
| `0x30` | ADD_MODULE | `type loc id col row colour uprate isled [modes...] name\0` | Embedded ACK |
| `0x31` | SET_MODULE_COLOR | `loc mod color` | Embedded ACK |
| `0x32` | DEL_MODULE | `loc mod_id` | Embedded ACK |
| `0x33` | SET_MODULE_LABEL | `loc mod name\0` | Embedded ACK |
| `0x34` | MOVE_MODULE | `loc mod_id col row` | Embedded ACK |
| `0x35 ss` | GET_PATCH_VERSION | `ss`=slot | Embedded; version at `response[6]` |
| `0x37` | SET_PATCH (upload) | see §9 | Embedded ACK |
| `0x3C` | GET_PATCH | — | Extended bulk (patch binary, §9) |
| `0x40` | SET_PARAM | `loc mod par val var` | No response (`WRITE_NO_RESP`) |
| `0x43` | SET_MORPH_RANGE | `loc mod param morph val neg var` | No response (`WRITE_NO_RESP`) |
| `0x44` | COPY_VARIATION | `from to` | Embedded ACK |
| `0x4C` | GET_PARAMS | `location` | Extended bulk |
| `0x4F` | GET_PARAM_NAMES | `location` | Extended bulk |
| `0x50` | ADD_CABLE | `flags from_mod from_con to_mod to_con` | Embedded ACK |
| `0x51` | DEL_CABLE | `flags from_mod from_con to_mod to_con` | Embedded ACK |
| `0x54` | SET_CABLE_COLOR | `flags from_mod from_con to_mod to_con color` | Embedded ACK |
| `0x55` | CTRL_SNAPSHOT | — | Embedded ACK |
| `0x68` | GET_CURRENT_NOTE | — | Embedded; note/velocity at `[5..6]` |
| `0x6A vv` | SELECT_VARIATION | `vv`=variation index (0-7) | Embedded ACK |
| `0x6E` | GET_PATCH_NOTES *(not in CLI)* | — | Extended bulk (patch notes text) |
| `0x6F` | SET_PATCH_NOTES | patch notes chunk | Embedded ACK |
| `0x70` | UNKNOWN_6 | — | Embedded ACK |
| `0x71` | GET_RESOURCES_USED | `location` | Extended bulk |

### Knob & MIDI Assignment Sub-Commands

These are combined into slot-command messages. Each message can contain multiple sub-operations via `AddXxxMessage` calls:

| Sub-cmd | Name | Payload bytes | Response |
|---------|------|---------------|----------|
| `0x1C` | ASSIGN_GLOBAL_KNOB | `mod param loc 00 knob_index` | via parent message |
| `0x1D` | DEASSIGN_GLOBAL_KNOB | `00 knob_index` | via parent message |
| `0x1E` | SEL_GLOBAL_PAGE | `page` | via parent message |
| `0x22` | ASSIGN_MIDICC | `loc mod param cc` | via parent message |
| `0x23` | DEASSIGN_MIDICC | `cc` | via parent message |
| `0x25` | ASSIGN_KNOB | `mod param loc 00 knob_index` | via parent message |
| `0x26` | DEASSIGN_KNOB | `00 knob_index` | via parent message |
| `0x2D` | SEL_PARAM_PAGE | `page` | via parent message |

---

## 8. Cable & Connector Encoding

### ADD_CABLE flags byte

```
(1 << 4) | ((location & 1) << 3) | (color & 7)

Bit 4  : always 1
Bit 3  : location  0=FX, 1=VA
Bits 2-0: color    0-6
```

### DEL_CABLE flags byte

```
(1 << 1) | (location & 1)

Bit 1  : always 1
Bit 0  : location  0=FX, 1=VA
```

### Connector byte (from_con / to_con)

```
((con_type & 3) << 6) | (con_id & 0x3F)

Bits 7-6: connector type  0=input, 1=output
Bits 5-0: connector id    0-63
```

The CLI enforces **output → input** direction: if `from_con_type == 0` (input), the from/to pair is swapped before sending.

---

## 9. Patch Retrieval & Upload

### Retrieve sequence

1. **GET_PATCH_VERSION** (system cmd `0x41 0x35 slot`) → version from `response[6]`
2. **GET_PATCH** (slot cmd `0x3C`, scope `0x28+slot`, version) → Extended bulk → raw USB binary
3. **GET_PATCH_NAME** (slot cmd `0x28`) → name string

### USB binary → PCH2 conversion

The raw USB bulk data is not identical to the `.pch2` file format. Conversion (`patch_usb_to_pch2`):

```
pch2 = usb[0x03 .. 0x14]   (18 bytes, indices 3-20 inclusive)
     + usb[0x17 .. end-3]  (remaining bytes, excluding last 2 CRC bytes)
```

In C:
```c
first_part  = 0x15 - 0x03;              // 18 bytes
second_part = usb_len - 0x17 - 2;
memcpy(pch2, usb + 0x03, first_part);
memcpy(pch2 + first_part, usb + 0x17, second_part);
```

### Upload (SET_PATCH)

Uses a fixed version byte `0x53` (not the dynamic patch version). Packet layout:

```
[01][scope][0x53][0x37][00 00 00][name\0][section_data][CRC_HI][CRC_LO]
            ↑     ↑    └─ 3 pad ─┘
            │     └── SUB_COMMAND_SET
            └── fixed version for SET_PATCH
```

`scope` = `COMMAND_REQ | COMMAND_SLOT | slot` (`0x28-0x2B`).

`section_data` = file bytes starting at `name_end + 3` (skip NUL + `0x17` + `0x00`), excluding the trailing 2-byte PCH2 CRC.

After sending, wait `5 × 10 ms = 50 ms` then read one interrupt response + drain pending.

### Patch Binary Chunk Types

The patch binary (from GET_PATCH / SET_PATCH) is composed of typed sections. Each section starts with a 1-byte type identifier:

| Code | Name | Content |
|------|------|---------|
| `0x4A` | ModuleList | List of modules with positions and parameters |
| `0x4D` | ParameterList | Module parameter values |
| `0x52` | CableList | Cable connections |
| `0x5A` | ModuleNames | Module name strings |
| `0x5B` | ParameterNames | Parameter name strings |
| `0x60` | Controllers | MIDI CC assignments |
| `0x62` | Knobs | Knob assignments |
| `0x65` | MorphParameters | Morph range settings |
| `0x69` | CurrentNote | Current note info |

---

## 10. Synth Settings Response

The bulk data from GET_SYNTH_SETTINGS (`0x02`) is parsed at fixed byte offsets:

| Offset | Field | Notes |
|--------|-------|-------|
| 4–13 | Synth name | Up to 10 bytes, null-terminated |
| 13 | Mode | Bit 7: 0=Patch, 1=Performance |
| 14 | Perf Bank | — |
| 15 | Perf Location | — |
| 17 | MIDI Slot A channel | Stored 0-indexed; CLI outputs +1 (= channel 1-16) |
| 18 | MIDI Slot B channel | |
| 19 | MIDI Slot C channel | |
| 20 | MIDI Slot D channel | |
| 21 | MIDI global channel | |
| 22 | Sysex ID | CLI adds 1 when reporting |
| 23 | Local On | Bit 7 |
| 24 | Prog Change | Bit 0=recv, Bit 1=send |
| 25 | Clock | Bit 0=recv (1=on); Bit 1=send (inverted: 0=on, 1=off) |
| 28 | Tune cents | Raw byte |
| 30 | Tune semitones | Raw byte |
| 32 | Pedal polarity | Bit 0 |
| 34 | Control pedal gain | `gain = 1.0 + 0.5 * val / 32.0` |

### Performance settings (second query)

After GET_SYNTH_SETTINGS the CLI issues two more system commands to get performance/slot data:

1. `send_system(0x41, 0x81)` → extended bulk → `selsData`
2. `send_system(selsData[2], 0x10)` → extended bulk → `perfData`

`perfData` layout (parsed starting at `perfData[4]`):
- Null-terminated performance name
- At offset +4 relative to remaining: focus slot (2 bits at bit position 36 of a 32-bit word)
- `remaining[5]` = rangeEnable
- `remaining[6]` = BPM
- `remaining[7]` bit 0 = keyboard split
- `remaining[8]` bit 0 = clock running
- `remaining + 11`: 4 × slot blocks, each: null-terminated name + 7 bytes (active, key, hold, bank, patch, MIDI low, MIDI high) + 3 padding bytes

---

## 11. Patch List Response

Command: system cmd `0x41 0x14 mode bank patch`
- `mode`: 0=patches, 1=performances

Response data starting at `response[9]` contains a sequence of control codes:

| Code | Name | Meaning | Following bytes |
|------|------|---------|-----------------|
| `> 5` | Name | Patch/perf name | null-terminated string; for patches: next byte is category index (0-15) |
| `0x01` | LIST_JUMP | Jump to patch number | `[1]`=patch location |
| `0x02` | LIST_SKIP | Skip one slot | — |
| `0x03` | LIST_BANK | Switch bank | `[1]`=new bank, `[2]`=new patch location |
| `0x04` | LIST_MODE | Switch mode (patches↔perfs) | — |
| `0x05` | LIST_CONTINUE | Continue current bank | — |

**Categories** (index 0-15):

`no_cat`, `acoustic`, `sequencer`, `bass`, `classic`, `drum`, `fantasy`, `fx`, `lead`, `organ`, `pad`, `piano`, `synth`, `audio_in`, `user_1`, `user_2`

---

## 12. Response Messages

All incoming messages arrive first as a 16-byte interrupt packet on EP `0x81`:

```
Byte [0] low nibble = message type:
  0x01  RESPONSE_TYPE_EXTENDED  — bulk data follows on EP 0x82
  0x02  RESPONSE_TYPE_EMBEDDED  — data is inline in the 16-byte packet
  0x80  RESPONSE_TYPE_INIT      — init response (bulk data follows)
```

### Extended response

```
[0]  (size_hi << 4) | 0x01
[1]  size_hi   ─┐ big-endian uint16: number of bytes to read from EP 0x82
[2]  size_lo   ─┘
[3..15]  unused
```

Read exactly `size` bytes from EP `0x82` (bulk in).

### Embedded response

```
[0]  (len << 4) | 0x02   len = number of bytes in [1..len] (last 2 are CRC)
[1]  routing byte         always 0x01
[2]  aCmd                 command source (see notification layout)
[3]  version              patch/perf version (or 0x40 for version-update msgs)
[4]  subCmd               response sub-command
[5+] data
[last-1, last]  CRC-16
```

---

## 13. Watch / Notification Events

### Arming and disarming

Start: system cmd `0x41 0x7D 0x00` (START_COMM)
Stop:  system cmd `0x41 0x7D 0x01` (STOP_COMM)

After a complete performance switch the G2 sends a `version_update` (all_slots) bulk event and **stops streaming**. The CLI automatically re-arms by sending START_COMM again.

### Embedded notification layout

```
response[0]  = (len << 4) | 0x02
response[1]  = 0x01  (routing)
response[2]  = aCmd
               0x00/0x08 = slot A
               0x01/0x09 = slot B
               0x02/0x0A = slot C
               0x03/0x0B = slot D
               0x04      = performance
               0x0C      = system
response[3]  = version   (0x40 = version-update class message)
response[4]  = subCmd
response[5+] = data
```

### Extended (bulk) notification layout

```
bulk[0] = 0x01       type marker
bulk[1] = aCmd       (same values as embedded)
bulk[2] = version
bulk[3] = subCmd
bulk[4 .. end-3] = data
bulk[end-2..end-1] = CRC-16  (already stripped before CLI emits JSON)
```

---

## 14. All Watch Events (JSON output)

### System messages (`aCmd == 0x0C`)

| `version` | `subCmd` | JSON type | Extra fields |
|-----------|----------|-----------|--------------|
| `0x40` | `0x1F` | `version_update` | `perf_version` = response[5] |
| `0x40` | `0x36` or `0x38` | `patch_version` | `slot`, `version` = response[5], [6] |
| other | `0x7F` | `ok` | — |
| other | `0x7E` | `error` | `code` = response[5] |

### Performance messages (`aCmd == 0x04`)

| `subCmd` | JSON type | Extra fields |
|----------|-----------|--------------|
| `0x05` | `assigned_voices` | `voices`: [r[5], r[6], r[7], r[8]] |
| `0x09` | `slot_change` | `slot` = response[5] |
| `0x10` or `0x11` | `perf_settings_update` | — |
| `0x29` | `perf_name` | `name` (null-terminated from response[5]) |
| `0x3F` | `master_clock_run` or `master_clock_bpm` | `run`/`bpm` = response[7]; type determined by response[6] (`0x00`=run, else bpm) |
| `0x5D` | `ext_master_clock` | `value` = (response[6]<<8)\|response[7] |
| `0x7E` | `error` | `code` = response[5] |
| `0x7F` | `ok` | — |
| `0x80` | `midi_cc` | `cc` = response[6] |

### Slot messages (`aCmd 0x00-0x03` or `0x08-0x0B`, `slot = aCmd & 0x03`)

When `version == 0x40`:

| `subCmd` | JSON type | Extra fields |
|----------|-----------|--------------|
| `0x36` or `0x38` | `patch_version` | `slot`, `version` = response[5], [6] |

When `version != 0x40`:

| `subCmd` | JSON type | Extra fields |
|----------|-----------|--------------|
| `0x21` or `0x3C` | `patch_update` | `slot` |
| `0x27` | `patch_name` | `slot`, `name` |
| `0x2F` | `selected_param` | `slot`, `area` ("fx"/"va"/"patch"), `module`=r[7], `param`=r[8] |
| `0x40` (location==2) | `patch_param` | `slot`, `module`=r[6], `param`=r[7], `value`=r[8], `variation`=r[9] |
| `0x40` (location 0/1) | `param_change` | `slot`, `area` ("fx"/"va"), `module`=r[6], `param`=r[7], `value`=r[8], `variation`=r[9] |
| `0x43` | `morph_change` | `slot`, `area` ("fx"/"va"), `module`=r[6], `param`=r[7], `morph`=r[8], `value`=r[9], `negative`=r[10], `variation`=r[11] |
| `0x44` | `copy_variation` | `slot`, `from`=r[5], `to`=r[6] |
| `0x59` or `0x70` or `0x7F` | `ok` | `slot` |
| `0x69` | `current_note` | `slot`, `note`=r[5], `velocity`=r[6] |
| `0x6A` | `variation_change` | `slot`, `variation`=r[5] |
| `0x72` | `resources_used` | `slot`, `location`=r[5] |
| `0x7E` | `error` | `slot`, `code`=r[5] |

### Bulk notification sub-commands (`aCmd 0x00-0x03`)

| `subCmd` | JSON type | Data |
|----------|-----------|------|
| `0x39` | `led_data` | `slot`, `data[]` — raw bytes, see §15 |
| `0x3A` | `volume_data` | `slot`, `data[]` — raw bytes, see §16 |
| `0x72` | `resources_used` | `slot`, `data[]` — raw bytes |

### Performance bulk sub-commands (`aCmd 0x04`)

| `version` | `subCmd` | JSON type | Notes |
|-----------|----------|-----------|-------|
| `0x40` | `0x1F` | `version_update` | `scope`="all_slots"; triggers re-arm |
| any | `0x11` | `perf_settings` | — |
| any | `0x29` | `perf_name` | `name` from bulk[4..] |

### Connection events

| JSON type | Trigger |
|-----------|---------|
| `device_disconnected` | `LIBUSB_ERROR_NO_DEVICE` during poll |
| `device_reconnected` | Successful reconnect after disconnect |

### Debug-only events

| JSON type | Fields | When emitted |
|-----------|--------|-------------|
| `raw_interrupt` | `hex` | Any interrupt packet (debug mode only) |
| `raw_bulk` | `size`, `hex` | Any bulk packet (debug mode only) |

---

## 15. LED Data Parsing (`led_data.data[]`)

Source: Delphi `TG2Patch.ReadLedData` in `BVE.NMG2Patch.pas`

```
data[0]      — unknown prefix byte (skip)
data[1..N]   — 4 LEDs packed per byte, 2 bits each:
               bits 7-6 = LED 0
               bits 5-4 = LED 1
               bits 3-2 = LED 2
               bits 1-0 = LED 3

LED values: 0=off, 1=on, 2=unknown
Order: FX LedList entries first, then VA LedList entries
```

Pseudocode to unpack:

```js
for (let i = 1; i < data.length; i++) {
  const byte = data[i];
  leds.push((byte >> 6) & 3);
  leds.push((byte >> 4) & 3);
  leds.push((byte >> 2) & 3);
  leds.push( byte       & 3);
}
```

---

## 16. Volume Data Parsing (`volume_data.data[]`)

Source: Delphi `TG2Patch.ReadVolumeData` in `BVE.NMG2Patch.pas`

```
data comes in 2-byte pairs: (unknown_byte, value_byte) per LedStrip entry
Order: FX LedStripList entries first, then VA LedStripList entries
value_byte = level/volume to display on that strip
```

Pseudocode:

```js
for (let i = 0; i < data.length; i += 2) {
  // data[i]     = unknown (skip)
  // data[i + 1] = volume level for strip (i / 2)
  strips.push(data[i + 1]);
}
```

---

## 17. Response Sub-Command Codes

Codes carried in `subCmd` (response[4] in embedded messages) that identify what a response is answering:

| Code | Name | Source command | Meaning |
|------|------|----------------|---------|
| `0x03` | R_SYNTH_SETTINGS | GET_SYNTH_SETTINGS | Synth settings data |
| `0x05` | R_ASSIGNED_VOICES | GET_ASSIGNED_VOICES | 4 voice counts (one per slot) |
| `0x0D` | R_STORE | STORE / PATCH_BANK_DATA | Bank store confirmed |
| `0x12` | R_CLEAR_BANK | CLEAR_BANK | Bank range cleared |
| `0x13` | R_LIST_NAMES | LIST_PATCHES | Patch/perf name list entry |
| `0x15` | R_CLEAR | CLEAR | Single entry cleared |
| `0x16` | R_ADD_NAMES | LIST_PATCHES | Additional name list data |
| `0x18` | R_PATCH_BANK_UPLOAD | PATCH_BANK_UPLOAD | Bank upload data |
| `0x21` | C_PATCH_DESCR | SET_PATCH | Patch description received |
| `0x27` | S_PATCH_NAME | — | Patch name notification |
| `0x29` | C_PERF_NAME | — | Performance name notification |
| `0x36` | R_PATCH_VERSION | GET_PATCH_VERSION | Patch version value |
| `0x38` | R_PATCH_VERSION_CHANGE | — | Patch version changed (watch) |
| `0x39` | R_LED_DATA | — | LED states (bulk, watch only) |
| `0x3A` | R_VOLUME_DATA | — | Volume/level data (bulk, watch only) |
| `0x5F` | C_KNOBS_GLOBAL | GET_GLOBAL_KNOBS | Global knob assignments |
| `0x6F` | C_PATCH_NOTES | — | Patch text notes |
| `0x72` | R_RESOURCES_USED | GET_RESOURCES_USED | DSP resource usage |
| `0x7E` | R_ERROR | any | Error response; code at `[5]` |
| `0x7F` | R_OK | any | Generic ACK |
| `0x80` | R_MIDI_CC | — | MIDI CC event (watch) |

---

## 18. Error Codes

| Code | Name | Meaning |
|------|------|---------|
| `0` | `G2_OK` | Success |
| `-1` | `G2_ERR` | Generic error |
| `-2` | `G2_ERR_NOT_FOUND` | Device not found |
| `-3` | `G2_ERR_CONNECT` | Connection failed |
| `-4` | `G2_ERR_RESET` | Reset failed |
| `-5` | `G2_ERR_CLAIM_INTERFACE` | Failed to claim USB interface |
| `-6` | `G2_ERR_SEND` | USB bulk write failed |
| `-7` | `G2_ERR_RECV` | USB read failed |
| `-8` | `G2_ERR_TIMEOUT` | USB timeout |
| `-9` | `G2_ERR_PARSE` | Parse error |
| `-10` | `G2_ERR_INVALID_PARAM` / `G2_ERR_FILE_OPEN` | Invalid parameter or file open failed |
| `-11` | `G2_ERR_FILE_WRITE` | File write failed |
| `-12` | `G2_ERR_NO_MEMORY` | Memory allocation failed |
