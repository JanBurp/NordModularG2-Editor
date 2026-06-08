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

This works because GET_PATCH_VERSION inside each query syncs the version counter on demand, so the patch-version reset that CMD_INIT performs is not needed. For paths where G2 may still be streaming (e.g. editor-initiated `set-perf-mode`), the daemon calls `g2_stop_comm()` explicitly before issuing queries (see §14).

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
| `0x03` | SET_SYNTH_SETTINGS | synth settings payload (§10a) | Embedded ACK |
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
| `0x3E mm 00` | SET_PERF_MODE | `mm`=mode (0=patch, 1=performance) | Bulk `0x0C/0x1F` version_update (see §13) |
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
| `0x11` | SET_PERF_SETTINGS | `[0x11][sizeHi][sizeLo][80 bytes settings]` | Embedded ACK |
| `0x29` | SET_PERF_NAME | perf_name (null-terminated) | Embedded ACK |
| `0x3F FF 01 bpm` | SET_MASTER_CLOCK_BPM | `FF` unknown, `01`=BPM mode, `bpm`=value | None |
| `0x3F FF 00 run` | SET_MASTER_CLOCK_RUN | `FF` unknown, `00`=run mode, `run`=0/1 | None |
| `0x59` | UNKNOWN_2 (perf init query) | — | Embedded ACK |
| `0x5E` | GET_GLOBAL_KNOBS | — | Extended bulk |

### SELECT_SLOT command

There are two distinct slot-selection paths depending on whether the target slot is already active:

#### Simple focus — `g2_select_slot` (target slot already active)

1. GET_PATCH_VERSION with slot=4 → `perf_version`
2. Send `[01][2C][perf_version][09][slot][CRC]`
3. Drain pending notifications (`g2_drain_pending`) to consume `slot_change` / `assigned_voices`

#### Full activate-then-focus — `g2_switch_slot` (target slot inactive)

Use this when the target slot needs to be activated before focusing. Steps:

1. **UNKNOWN_1** (`send_system(0x41, 0x81)`) → extended bulk → `perf_version = selsData[2]`
2. **GET_PERF_SETTINGS** (`send_system(perf_version, 0x10)`) → extended bulk (`perfData`) containing current slot active/key/focus state
3. **Parse perfData** to find per-slot active/key offsets and the currently-focused slot:
   ```
   perfData+4  → perf name (null-terminated)  → remaining
   remaining[0]  = 0x11 (C_PERF_SETTINGS chunk type)
   remaining[4] >> 2 & 0x3  = focused_slot_index
   remaining+11 → slot 0: name(variable) + 10 bytes
     [+0] active  (0/1)
     [+1] key     (0/1)
     [+2..9] hold, bank, patch, rangeLow, rangeHigh, padding
   Subsequent slots follow immediately
   ```
4. **Modify perfData in-memory:**
   - `target_slot.active = 1`, `target_slot.key = 1`
   - `focused_slot.active = 0`, `focused_slot.key = 0` (if focused ≠ target)
5. **SET_PERF_SETTINGS** — send the chunk starting at the `0x11` byte using `perf_version` as cmd_id: `[0x11][sizeHi][sizeLo][80 bytes]`; drain ACK
6. **SELECT_SLOT** — `[01][2C][0x41][09][slot][CRC]` — **use `0x41`, NOT `perf_version`** (see gotcha below)

> **Gotcha — SELECT_SLOT cmd_id after SET_PERF_SETTINGS in daemon mode:** In daemon mode, a `perf_settings_update` message sits in the listener queue immediately after the SET_PERF_SETTINGS ACK. If you query GET_PATCH_VERSION before SELECT_SLOT, `recv_interrupt()` pops `perf_settings_update` instead of the version response, leaving the version response orphaned as a spurious event. The Delphi reference editor never queries GET_PATCH_VERSION before SELECT_SLOT — `0x41` is accepted unconditionally by the G2 for this command.

> **g2ctl.py three-step sequence (do not use):** g2ctl.py sends a sub-cmd `0x07` bitmask step, then `0x09`, then a slot-scoped `0x0a/0x70` commit. The `0x07` step resets all slots' active/key state as a side effect. The Delphi reference editor (`PerfSelectSlot`) sends only the `0x09` command, which is the correct approach.

#### Single-field slot updates — `set-slot-enabled` / `set-slot-key` / `set-slot-hold`

Setting only the `active`, `key`, or `hold` field for one slot uses the same full GET_PERF_SETTINGS → modify one byte → SET_PERF_SETTINGS read-modify-write pattern, without the final SELECT_SLOT step. Field offsets in the slot block: `active`=0, `key`=1, `hold`=2.

#### Two-field slot update — `set-slot-range`

`g2_set_slot_range` patches both the range-lower (field offset 5) and range-upper (field offset 6) bytes in **one** read-modify-write round-trip. Do not call `g2_set_slot_perf_field` twice in sequence: the first SET_PERF_SETTINGS write causes the G2 to emit a `perf_settings_update` event and briefly stop responding; a second immediate round-trip hits `G2_ERR_RECV` (-7).

#### Performance header field update — `set-range-enable`

`g2_set_rangeEnable(value)` modifies the `rangeEnable` (KB Split on/off) byte at **perf header offset 5** — the 8-byte block that immediately follows the C_PERF_SETTINGS chunk header (`remaining[5]` after the `0x11` type byte). This is a different byte from the slot block's `rangeLow`/`rangeHigh` fields. Uses the same GET_PERF_SETTINGS → modify one byte → SET_PERF_SETTINGS pattern. No SELECT_SLOT step.

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
| `0x27` | SET_PATCH_NAME | `name\0` (null-terminated, max 16 chars) | Embedded ACK |
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
| `0x42` | SET_PARAM_LABEL | `loc mod_id param_idx label_idx label` | Embedded ACK |
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

## 8b. SET_PARAM_LABEL Wire Format

Slot command `0x42` sets a text label for a parameter's value slot(s).

**Payload structure (passed to `send_slot`):**

```
[0]  location            (0=FX, 1=VA)
[1]  module_id
[2]  module_len          = 3 + 7 * (label_idx + 1)
[3]  is_string           = 1
[4]  param_len           = 1 + 7 * (label_idx + 1)
[5]  param_idx
[6 .. 6+7*label_idx-1]   empty label slots (zeros), one per position 0..label_idx-1
[6+7*label_idx .. +6]    target label text, null-padded to exactly 7 bytes
```

**Key points:**
- Labels are **null-padded** (not space-padded) to 7 bytes each
- `label_idx` (0–127) determines which slot within the parameter to set
- Empty slots before the target are sent as all zeros
- Label text longer than 7 chars is truncated
- Sending `label_idx=0` with one label is the simplest case: `module_len=10`, `param_len=8`, payload_len=13

**Example:** Set parameter 2's label at index 0 to "Gate":
```
module_len = 3 + 7*1 = 10
param_len  = 1 + 7*1 = 8
payload = [location, module_id, 10, 1, 8, param_idx, 'G', 'a', 't', 'e', 0, 0, 0]
```

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
| `0x21` | PatchDescription | Voice count, monopoly mode, variation settings (see below) |
| `0x4A` | ModuleList | List of modules with positions and parameters |
| `0x4D` | ParameterList | Module parameter values |
| `0x52` | CableList | Cable connections |
| `0x5A` | ModuleNames | Module name strings |
| `0x5B` | ParameterNames | Parameter name strings |
| `0x60` | Controllers | MIDI CC assignments |
| `0x62` | Knobs | Knob assignments |
| `0x65` | MorphParameters | Morph range settings |
| `0x69` | CurrentNote | Current note info |

### PatchDescription (0x21) bit layout

Body is 14 bytes. Relevant fields (bit numbers are 0-based from the start of the body):

| Bit range | Field | Encoding |
|-----------|-------|----------|
| 61–65 | `voices` | 5-bit raw value, **0-based**: 0 = 1 voice, 15 = 16 voices, 31 = 32 voices |
| 90–91 | `monopoly` | 2-bit: 0=Poly, 1=Mono, 2=Legato, 3=Slgt |

`voices` byte layout (body bytes 7–8):
```
body[7] bits 2-0 = voices >> 2   (high 3 bits)
body[8] bits 7-6 = voices & 0x03 (low 2 bits)
```
`monopoly` byte layout (body byte 11):
```
body[11] bits 5-4 = monopoly & 0x03
```

To set via USB, use `SET_PATCH_DESCRIPTION` (subCmd `0x21`) with the full 14-byte body.

**Note on assigned_voices vs description.voices:** The `assigned_voices` watch event carries **1-based** counts (G2 allocates 16 voices → value 16), while `description.voices` is the **0-based** raw bitfield (16 voices → 15). Formula: `description.voices = assigned - 1` when poly. `assigned = 0` means non-poly (Mono/Legato/Slgt) — the exact mode is only in the description bitfield, not derivable from `assigned_voices` alone.

---

## 10. Synth Settings Response

The bulk data from GET_SYNTH_SETTINGS (`0x02`) is parsed at fixed byte offsets:

| Offset | Field | Notes |
|--------|-------|-------|
| 4+ | Synth name | Variable length, null-terminated (up to 16 chars); use `parse_name(bulkData + 4, name, size)` to extract |
| 4 + nameLen | Mode | Bit 7: 0=Patch, 1=Performance; where `nameLen` is the return value from `parse_name()` |
| 4 + nameLen + 1 | Perf Bank | — |
| 4 + nameLen + 2 | Perf Location | — |
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

`perfData` bulk response layout (95 bytes typical):
- `[0..3]` 4-byte outer header
- `[4..]` null-terminated performance name
- `[name_end]` = `0x11` (C_PERF_SETTINGS chunk type)
- `[name_end+1..2]` = inner_size (big-endian, typically `0x00 0x50` = 80)
- `[name_end+3..10]` = 8 bytes perf settings: [3]=unknown2, [4]=selectedSlot(packed), [5]=rangeEnable (KB Split), [6]=BPM, [7]=unknown5, [8]=clockRun, [9-10]=unknown
- `[name_end+11..]` = 4 × slot blocks, each: null-terminated name + 10 bytes (active, key, hold, bank, patch, rangeLow, rangeHigh, 3 padding)
- `[last 2]` 2-byte bulk trailer

For SET_PERF_SETTINGS, send only the chunk: `[0x11][sizeHi][sizeLo][80 bytes]` (83 bytes total). Do **not** include the outer 4-byte header, perf name, or 2-byte trailer.

---

## 10a. SET_SYNTH_SETTINGS Request Format

Sent as the variable-length payload for system command `0x03` (after the `[01][2C][41][03]` header).

```
[0]          = 0x03  (sub-command byte, part of payload)
[1..nameLen] = synthName  (up to 16 chars, NOT null-terminated if nameLen == 16)
[1+nameLen]  = 0x00  (null terminator, omitted when nameLen == 16)

base = 1 + nameLen + (nameLen < 16 ? 1 : 0)

base+0   bit 7: mode (1=Performance, 0=Patch) — read from current mode, G2 stays in that mode
base+1   0x00
base+2   PerfBank      (preserved from last GET response)
base+3   PerfLocation  (preserved from last GET response)
base+4   MemoryProtect (bit 7)
base+5   MIDI slot A channel (0-indexed; 1-indexed in JSON)
base+6   MIDI slot B channel
base+7   MIDI slot C channel
base+8   MIDI slot D channel
base+9   MIDI global channel
base+10  SysEx ID (0-indexed; 1-indexed in JSON)
base+11  LocalOn (bit 7)
base+12  PrgChange (bit 0=send, bit 1=recv)
base+13  Controllers (bit 0=send, bit 1=recv)
base+14  Clock (bit 6=send; bit 5=NOT recv — 0 means recv-on)
base+15  TuneCent (signed int8)
base+16  GlobalOctaveShiftActive (bit 7)
base+17  GlobalOctaveShift (signed int8)
base+18  TuneSemi (signed int8)
base+19  0x00
base+20  PedalPolarity (bit 7) | 0x40
base+21  ControlPedalGain (0–32)
base+22..37  0x00 (16 trailing zeros)

Total payload length = base + 38 bytes.
```

This is the ClaviaString encoding used throughout the protocol: name chars, null terminator only if the name is shorter than 16 chars.

> **Note:** The Delphi editor hardcodes `base+0 = 0x80` (always Performance). The CLI reads the current mode from params so the G2 stays in its current mode.

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
| `0x05` | `assigned_voices` | `voices`: [r[5], r[6], r[7], r[8]] — **1-based** counts; 0 = non-poly slot |
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
| any | `0x03` | `synth_settings_update` | `mode`="Patch"\|"Performance". Two variants: (1) **hardware** — G2 PERF button or unsolicited mode change: no `patches` field; (2) **daemon rearm** — emitted by `g2_emit_rearm_data()` after BULK_REARM: includes `"patches":[…]` array (4 entries, one per slot) so the frontend can apply all slots without separate `get-patch` commands. |
| any | `0x11` | `perf_settings` | — |
| any | `0x29` | `perf_name` + `perf_settings` | Compound message: null-terminated name at bulk[4..], followed by a full C_PERF_SETTINGS (0x11) chunk. Emitted by G2 when Hold or KB Split changes on hardware. Also emitted as embedded when only the name changes (no settings chunk). |

**C_PERF_NAME compound bulk layout:**

```
bulk[0..3]  = standard bulk header (0x01, aCmd=0x04, version, subCmd=0x29)
bulk[4..]   = null-terminated performance name (up to 16 chars)
bulk[4+nameLen]   = 0x11  (C_PERF_SETTINGS chunk type)
bulk[4+nameLen+1..2] = inner size (big-endian, typically 0x00 0x50 = 80)
bulk[4+nameLen+3] = unknown
bulk[4+nameLen+4] = selectedSlot (packed)
bulk[4+nameLen+5] = rangeEnable (KB Split)
bulk[4+nameLen+6] = BPM
bulk[4+nameLen+7] = unknown5
bulk[4+nameLen+8] = clockRun (bit 0)
bulk[4+nameLen+9..10] = unknown
bulk[4+nameLen+11..] = 4 × slot blocks (same layout as GET_PERF_SETTINGS response)
```

The inline settings block is byte-for-byte identical to the `GET_PERF_SETTINGS` query response (§10), so `perf_parse_and_add(bulk, bret, mode, root)` works on it unchanged. The Delphi editor's `C_PERF_NAME, C_PERF_SETTINGS:` combined case reflects this — both chunk types arrive in the same stream and are parsed together. Delphi never called `DoPerfSettingsUpdate()` after parsing, so Hold/KB Split never synced to its UI (unfinished feature in the original editor).

### Bulk sub-commands (`aCmd 0x0C`)

Sent as the response to `SET_PERF_MODE` (editor-initiated) and unsolicited after hardware PERF button press.

| `version` | `subCmd` | JSON type | Data format |
|-----------|----------|-----------|-------------|
| `0x40` | `0x1F` | `version_update` | `bulk[4]`=`perf_version`; then 4×`[0x36, slot, version]` — one entry per slot |
| `0x05` | `0x80` | `unknown_bulk` | 4 slot entries: `[slot_idx, 255, 128, ...]` repeated — not yet parsed |
| `0x05` | `0x29` | `unknown_bulk` | Patch names + metadata — not yet parsed |

**Important:** unlike the hardware path (`aCmd 0x04/0x40/0x1F`), when 0x0C/0x1F arrives the G2 is still streaming. The daemon calls `g2_stop_comm()` before querying synth/perf settings and patches, then sets `g2_pending_rearm=1` so the main loop calls `g2_rearm()` after returning.

**`version_update` payload layout (version=0x40, sub=0x1F):**
```
bulk[4]      = perf_version
bulk[5..7]   = [0x36, slot=0, version]
bulk[8..10]  = [0x36, slot=1, version]
bulk[11..13] = [0x36, slot=2, version]
bulk[14..16] = [0x36, slot=3, version]
```
Emitted JSON: `{"type":"version_update","perf_version":N,"slot_versions":[{"slot":0,"version":N},...]}`. After this the daemon queries synth/perf settings and all 4 slot patches, emitting `synth_settings_update` with an embedded `"patches"` array (Delphi approach: all data before START_COMM). Sets `g2_pending_rearm=1` to trigger `g2_rearm()` after the event handler returns.

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
| `-10` | `G2_ERR_INVALID_PARAM` | Invalid parameter |
| `-11` | `G2_ERR_FILE_OPEN` | File open failed |
| `-12` | `G2_ERR_FILE_WRITE` | File write failed |
| `-13` | `G2_ERR_NO_MEMORY` | Memory allocation failed |

---

## 14. Daemon Thread Architecture

The daemon (`g2-cli daemon`) uses a listener-thread model matching the Delphi editor's `TListeningThread` pattern.

### Components

**`listener_thread` (background, in `g2_io.c`)**
- Sole reader of EP 0x81 (interrupt) and EP 0x82 (bulk)
- Tight loop: `recv_interrupt_with_retry(200 ms)` → on EXTENDED: `listener_recv_bulk()`
- Pushes every message to a 64-entry mutex+condvar queue (`mq`)
- Detects BULK_REARM (`bulk[1]==0x04, bulk[2]==0x40, bulk[3]==0x1F`): zeroes `g2_slot_version[]`, pushes `sentinel=2`
- Detects disconnect (`LIBUSB_ERROR_NO_DEVICE`): pushes `sentinel=1`, exits
- Updates `g2_slot_version[slot]` for embedded patch_version messages

**Main thread (in `daemon.c`)**
- Dequeues stdin commands; executes them via `execute_cmd()` → device functions
- Device functions call `recv_interrupt()` which is shimmed: when `g2_listener_active==1`, pulls from the listener queue (skipping LED/vol bulk messages) instead of calling libusb directly
- Between commands: pulls events from queue via `g2_msg_recv(100ms)`, routes by sentinel value

### Message Flow

```
EP 0x81/0x82                listener_thread                    msg_queue
  ←────────────────────────── recv_interrupt_with_retry()
  ←────────────────────────── listener_recv_bulk() (if EXTENDED)
                              push msg ──────────────────────────→  [msg]
                                                                     [msg]
                                                                     [msg]

msg_queue                    Main thread (event loop)
  [msg] ──────────────────→  sentinel==1?  → do_reconnect()
  [msg] ──────────────────→  sentinel==2?  → emit version_update + g2_rearm()
  [msg] ──────────────────→  normal msg   → g2_emit_event()

msg_queue                    Main thread (inside execute_cmd)
  [LED] ──────────────────→  recv_interrupt() shim: skip (LED/vol)
  [LED] ──────────────────→  recv_interrupt() shim: skip
  [resp] ─────────────────→  recv_interrupt() shim: return to device function
```

### Command Transaction (e.g. "slot B")

```
Electron       Main thread               listener_thread        G2
   │           dequeue "slot B"               │                  │
   │           g2_select_slot():              │                  │
   │             send EP 0x03 ───────────────────────────────────→│
   │                                     ←── EP 0x81 LED ────────┤
   │                                     push msg (LED)           │
   │             recv_interrupt() shim                            │
   │               pull LED → skip                                │
   │                                     ←── EP 0x81 resp ───────┤
   │                                     push msg (resp)          │
   │               pull resp → return                             │
   │           emit {"id":1,"ok":true} ─────────────────────────→│
```

### BULK_REARM Flow — hardware path (G2 PERF button)

```
G2               listener_thread          Main thread
 │                     │                       │
 ├─ EP 0x81 EXTENDED ─→│                       │
 ├─ EP 0x82 bulk ──────│                       │
 │               detect BULK_REARM (0x04/0x40/0x1F)
 │               zero g2_slot_version[]        │
 │               push sentinel=2               │
 │                     │    pull sentinel=2:   │
 │                     │    emit_bulk_event():  │
 │                     │      version_update    │
 │                     │      query synth/perf  │
 │                     │      g2_get_patch ×4   │
 │                     │      synth_settings_update {patches:[...]}
 │                     │      perf_settings     │
 │                     │    g2_pending_rearm=1  │
 │                     │    g2_rearm() ─────────────── EP 0x03
 ├─ EP 0x81 ACK ───────→│                      │
 │               push ACK                      │
 │                     │    pull ACK → emit {"type":"ok"}
```

### BULK_REARM Flow — editor path (set-perf-mode command)

```
Electron       Main thread                    G2
   │            send set-perf-mode (0x3E)  ──→│
   │                                    ←─────┤ EP 0x81 EXTENDED
   │                                    ←─────┤ EP 0x82 bulk (0x0C/0x1F)
   │            listener push sentinel=0       │ ← G2 still streaming!
   │            pull: emit_bulk_event():        │
   │              version_update                │
   │              g2_stop_comm() ─────────────→│
   │                       ←── streaming events draining
   │                       ←── STOP_COMM ACK   │ ← G2 stopped
   │              query synth/perf settings     │
   │              g2_get_patch ×4               │
   │              synth_settings_update {patches:[...]}
   │              perf_settings                 │
   │            g2_pending_rearm=1              │
   │            g2_rearm() ───────────────────→│
   │                       ←── START_COMM ACK  │
```

The key difference: hardware path receives 0x04/0x40/0x1F (sentinel=2, G2 already stopped streaming); editor path receives 0x0C/0x1F (sentinel=0, G2 still streaming → requires explicit `g2_stop_comm()`).

### `seq` — Batch slot mutations in one USB frame

The daemon `seq` command packs up to 128 slot mutations into a single `g2_batch_ops()` call, which builds one USB frame containing all sub-commands. All operations must target the **same slot**; mixing slots returns `G2_ERR_INVALID_PARAM (-10)`.

```json
{"id": 1, "cmd": "seq", "args": [
  ["del-cable",        "<slot>", "<loc>", fm, fcon_t, fcon_id, tm, tcon_t, tcon_id],
  ["add-cable",        "<slot>", "<loc>", color, fm, fcon_t, fcon_id, tm, tcon_t, tcon_id],
  ["set-cable-color",  "<slot>", "<loc>", color, fm, fcon_t, fcon_id, tm, tcon_t, tcon_id],
  ["del-module",       "<slot>", "<loc>", module_id],
  ["move-module",      "<slot>", "<loc>", module_id, col, row],
  ["add-module",       "<slot>", "<loc>", type, id, col, row, colour, n_modes, mode0..., n_params, param0..., "name"],
  ["set-module-color", "<slot>", "<loc>", module_id, color],
  ["set-module-name",  "<slot>", "<loc>", module_id, "name"],
  ["set-param-label",  "<slot>", "<loc>", module_id, param_idx, label_idx, "label"]
]}
```

Arg layout per sub-command is identical to the individual daemon commands (positional args with `slot` and `location` as args 0 and 1 of each sub-array). Max 128 ops per `seq` call.

### Key Properties

- No STOP_COMM / START_COMM per command (matches Delphi) — except when explicitly required before direct queries (see editor path above)
- `g2_listener_active` flag switches `recv_interrupt()` / `recv_bulk()` / `g2_drain_pending()` / `g2_rearm()` between direct libusb and queue-based modes; `g2_stop_comm()` is safe to call from main thread in either mode
- Queue cap: 64 entries; oldest dropped when full (LED/vol dominate, losing one frame is imperceptible)
- `g2_slot_version[4]` maintained by listener; device functions use cached value instead of extra GET_PATCH_VERSION round-trips
- **Startup**: daemon queries all 4 slots before `g2_rearm()` and emits them as `slot_data` events; frontend applies them directly via `_applyPatchOutput` in the `slot_data` watch handler

### recv_interrupt() skip list and follow-up race

`recv_interrupt()` in listener mode only skips LED (`0x39`) and volume (`0x3A`) bulk messages. All other message types — including `patch_version_change` (`0x38`), `assigned_voices` (`0x05`), and `resources_used` (`0x72`) — are returned to the caller as-is.

This creates a race: when the G2 changes voice mode/count it emits three events in sequence:

```
patch_version_change (0x38) → assigned_voices (0x05) → resources_used (0x72)
```

If the frontend reacts to `patch_version_change` by immediately issuing a `get-patch` command, the `0x05`/`0x72` messages may still be sitting in `g2_msg_queue`. `g2_get_patch()` calls `recv_interrupt()` which returns the wrong message, `patchSize` is misread, and the parser crashes.

**Safe pattern:** delay `get-patch` until the last event in the sequence (`resources_used`) has been received by the frontend. The IPC channel is ordered — by the time the frontend receives `resources_used`, the daemon has fully dequeued all three messages and the queue is empty. See `useG2.ts` (`pendingSlotReload` set) for implementation.
