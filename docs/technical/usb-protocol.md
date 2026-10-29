---
title: USB Protocol
parent: Technical Reference
nav_order: 3
---

# Nord G2 USB Protocol

Reference derived from the CLI source in `cli/src/g2_device.c`, `cli/include/defs.h`, `cli/src/utils.c`, confirmed against the Delphi editor and cross-checked with the g2ools Python tool.

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

**Timeouts** (`cli/include/defs.h`):
- Stale interrupt drain: 20 ms (`USB_TIMEOUT_STALE_MS`)
- Pending-notification drain: 50 ms (`USB_TIMEOUT_DRAIN_MS`)
- Drain upper bound: 1000 ms (`USB_DRAIN_MAX_MS`). A streaming G2 is never quiet, so a drain stops here (see §19)
- Standard command/response: 500 ms (`USB_TIMEOUT_STANDARD_MS`). It used to be 100 ms, which was too tight under LED/VU telemetry load.
- Long (patch name, slow ops): 2000 ms (`USB_TIMEOUT_LONG_MS`)
- Bulk-OUT write: 5000 ms (`USB_TIMEOUT_SEND_MS`). A whole `.prf2` is ~34 KB. A partial write resumes at the offset already sent.
- Send delay (after every bulk write): 10 ms (`USB_SEND_DELAY_US`)

> Note: the interrupt endpoint (`0x81`) is polled with `libusb_bulk_transfer`, not `libusb_interrupt_transfer`. On macOS, interrupt_transfer can ignore timeouts after rapid transfers and hang the watch loop.

> **`libusb_clear_halt` gotcha:** Do NOT call on a freshly cold-reset G2. Without a prior halt, it puts the device in a broken state: streaming events still flow but direct queries time out and BULK_OUT eventually stalls. Only issue after a verified halt condition (e.g. a prior bulk transfer returned `LIBUSB_ERROR_PIPE`).

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
| `0x04` | GET_ASSIGNED_VOICES *(not implemented yet)* | — | Embedded; 4 voice counts at `[5..8]` |
| `0x0A ss bb ll` | RETRIEVE (bank→slot) | slot (0-3), bank (0-based), location (0-based) | Embedded ACK |
| `0x0B ss bb ll` | STORE (slot→bank) | slot (0-3), bank (0-based), location (0-based) | Embedded ACK |
| `0x0C tt bb ll 00` | CLEAR | file_type (0=patch,1=perf), bank, location, `0x00` | Embedded ACK |
| `0x0E tt bb ff tt 00` | CLEAR_BANK | file_type, bank, from_loc, bank, to_loc, `0x00` | Embedded ACK |
| `0x14 mm bb ll` | LIST_PATCHES | mode (0=patches,1=perfs), bank, patch start | Embedded or bulk (§11) |
| `0x17 tt bb ll` | PATCH_BANK_UPLOAD | file_type (0=patch,1=perf), bank (0-based), location (0-based) | Embedded `0x18` marker (empty/corrupt/protected/full) or extended bulk `0x19` (patch present) |
| `0x19` | PATCH_BANK_DATA (download) *(not implemented yet — this is only implemented as a response to `0x17` above)* | file_type, bank, location, name\[16\], size (big-endian u16), version, patch_data | Embedded `0x18` marker ack |
| `0x28 ss` | GET_PATCH_NAME (sys) | `ss`=slot (0-3) | Embedded; name at `response[5+]` |
| `0x35 ss` | GET_PATCH_VERSION | `ss`=slot (0-3) | Embedded; version at `response[6]` |
| `0x3B` | GET_MASTER_CLOCK *(not implemented yet)* | — | Embedded (`R_EXT_MASTER_CLOCK`) |
| `0x3D` | MIDI_DUMP *(not implemented yet)* | — | None |
| `0x3E mm ss` | SET_PERF_MODE | `mm`=mode (0=patch, 1=performance), `ss`=SHIFT state (0=plain PERF, 1=SHIFT+PERF: patch→perf creates a new performance from the slot patches, perf→patch keeps its patches in the slots; hardware-verified) | Bulk `0x0C/0x1F` version_update (see §13) |
| `0x56 oo nn` | PLAY_NOTE *(not implemented yet)* | `oo`=on/off (0=on,1=off), `nn`=MIDI note | None |
| `0x7D 0x00` | START_NOTIFICATIONS | — | Embedded ACK |
| `0x7D 0x01` | STOP_NOTIFICATIONS | — | Embedded ACK |
| `0x81` | UNKNOWN_1 (init query) | — | Extended bulk |

**Daemon commands:**

```
set-synth-settings   <...>                    (0x03)
set-perf-mode        <mode> [shift]           (0x3E)
select-patch         <slot> <bank> <loc>      (0x0A)
select-perf          <bank> <loc>             (0x0A, slot byte=4)
store-patch          <slot> <bank> <loc>      (0x0B)
clear-patch          <type> <bank> <loc>      (0x0C)
clear-bank           <type> <bank> <from> <to> (0x0E)
reload-names         <mode> [bank]            (0x14)
get-bank             <type> <bank> <folder> [name] (0x17, looped over all 128 locations)
get-perf-settings                              (0x02, then falls through to §6b's 0x10)
```

**`get-bank`** reads flash storage directly (type+bank+location addressed) and
never touches slots A-D, unlike `select-patch`/`select-perf` (RETRIEVE,
`0x0A`) which load a bank entry into a live edit slot. The daemon sends one
`0x17` request per location (1-128 for a patch bank) and waits for either the
`0x18` marker (entry empty/corrupt, or memory protected/full — abort) or the
`0x19` extended-bulk patch data before moving to the next location; there is
no "bank complete" sentinel from the hardware, the host just stops after
location 128. Confirmed against the official editor's decompiled source
(`other-approaches/G2-ReverseEngineered/G2Editor.c`, `CFlashDumper` /
`CMFlashDumpRequest` / `CMFlashDumpMarker` / `CMFlashDumpRawData`) — see
`g2_get_bank()` in `cli/src/g2_device.c` for the implementation.

**Store / clear result.** `store-patch`, `clear-patch` and `clear-bank` wait for the G2's answer
(`await_flash_result()` / `check_flash_result()` in `g2_device.c`). The answer is either a
`CMFlashCommandResult` (`0x0D`: `[flag][bank][location][fileType][result]`) or a `0x18` marker.
It comes as its own embedded message or inside one bulk message (hardware-captured 2026-10-24/26):

```
clear:      01 0c 00 | 15 type bank loc | 13 lo hi | 0d .. .. .. .. 05 | crc
store ack:  [13 lo hi][16 names entry][0d result]
clear-bank: [12 type bank from bank to][13 lo hi][0d result]
```

Result codes, as in `CFlashData::HandleFlashCommandResult`: `0`, `2`, `5` = done (a clear answers 5),
`1` = can't load, `3` = memory full, `4` = memory protect on. With memory protect on, a
clear-bank gets only the `0x0D` result (status 4). Before 2026-10-26 a blind single read reported
success while nothing reached the flash. Like the official editor, the next flash command must
not go out before this answer, or it takes other commands' replies. The `13 lo hi` part is the
flash usage (§11). The acks are also relayed to the watch stream (§14).

Almost every other command in §6b/§7 also sends `0x35` (GET_PATCH_VERSION) or `0x81` (UNKNOWN_1) first, as an internal version-fetch step — this is noted where relevant rather than repeated for each command.

`verbose` and `debug` are local daemon flags with no wire traffic — not every JSON command touches the USB layer.

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
| `0x29` | SET_PERF_NAME | perf_name (null-terminated; empty `""` is accepted) | Embedded ACK |
| `0x3F FF 01 bpm` | SET_MASTER_CLOCK_BPM | `FF` unknown, `01`=BPM mode, `bpm`=value | None |
| `0x3F FF 00 run` | SET_MASTER_CLOCK_RUN | `FF` unknown, `00`=run mode, `run`=0/1 | None |
| `0x3F FF 02 global` | SET_KNOB_SOURCE (`g2_set_knob_source`) | `FF` unknown, `02`=knob-source mode, `global`=1(Global)/0(Patch) | None (confirmed 2026-08-28 via 4 consecutive real SHIFT+GLOBAL front-panel presses, echoing `ff0201`/`ff0200` in lockstep on the same channel as the two rows above — this is the actual Patch/Global Parameter Pages source toggle, not the page-select opcodes `0x2D`/`0x1E`, which only choose a page *within* whichever source this sets) |
| `0x59` | UNKNOWN_2 (perf init query) *(not implemented yet)* | — | Embedded ACK |
| `0x5E` | GET_GLOBAL_KNOBS (`g2_get_global_knobs`) | — | Extended bulk; response chunk `C_KNOBS_GLOBAL` (`0x5F`, see §17) |

**Daemon commands:**

```
slot                  <slot>                    (0x10 + 0x11 + 0x09, or just 0x09 — see below)
get-perf-settings                                (0x10)
get-perf-file                                    (0x10, then per-slot 0x3C — see §7)
set-perf-name         <name>                     (0x29)
set-master-clock-run  <0|1>                      (0x3F)
set-master-clock-bpm  <bpm>                      (0x3F)
```

`set-slot-enabled`, `set-slot-key`, `set-slot-hold`, `set-slot-range`, and `set-range-enable` also live here (all use `0x10` read + `0x11` write) — see the dedicated subsections below for their exact field offsets.

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

> **Gotcha — SELECT_SLOT after SET_PERF_SETTINGS:** A `perf_settings_update` message sits in the listener queue after the ACK. Querying GET_PATCH_VERSION before SELECT_SLOT causes `recv_interrupt()` to dequeue that update instead. Use `0x41` directly — accepted unconditionally by the G2.

> **g2ctl.py three-step sequence (do not use):** Uses `0x07` → `0x09` → `0x0a/0x70`; the `0x07` step resets all slots' active/key state as a side effect. Use only `0x09`.

#### Single-field slot updates — `set-slot-enabled` / `set-slot-key` / `set-slot-hold`

Setting only the `active`, `key`, or `hold` field for one slot uses the same full GET_PERF_SETTINGS → modify one byte → SET_PERF_SETTINGS read-modify-write pattern, without the final SELECT_SLOT step. Field offsets in the slot block: `active`=0, `key`=1, `hold`=2.

> **Every perf-settings read-modify-write must use `perf_settings_read()` / `perf_settings_write()`** (`cli/src/g2_device.c`). The read waits for the tagged `0x29` reply via `await_reply` (§12), and the write waits for the G2's `0x0C` ack. All per-slot flags, `set-slot-range`, `set-range-enable` and `switch-slot` go through these helpers.
>
> Before 2026-10-05 the four RMW copies took the first extended message as the reply: no tag check, buffer not zeroed, length ignored. They also never waited for the write's ack, and the editor fired two or more of them on every slot switch. During bursts, rearms, or right after a get-patch this wrote garbage settings back. The G2 wedged (RECV timeout / USB drop) and afterwards reported "Perf. Corrupt" on loads until it was power cycled.
>
> Like the official editor, a slot click in the editor is now **focus-only** (`0x09`). Do not add per-switch key moves back. Regression test: `test_daemon_set_slot_key_burst`.

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
| `0x21` | SET_PATCH_DESCRIPTION (aka C_PATCH_DESCR) | `[size_hi][size_lo][data]` (data max 62 bytes, see §9's PatchDescription body layout) | Embedded ACK |
| `0x27` | SET_PATCH_NAME | `name\0` (null-terminated, max 16 chars; empty `""` is accepted) | Embedded ACK |
| `0x28` | GET_PATCH_NAME | — | Embedded; name at `response[5+]` or bulk at `bulkData[4+]` |
| `0x2A` | SET_MODULE_UPRATE | `loc mod uprate` | Embedded ACK |
| `0x2B` | SET_MODULE_MODE | `loc mod param val` | Embedded ACK |
| `0x2E` | GET_SELECTED_PARAM *(not implemented yet)* | — | Embedded; area/module/param at `[5..7]` |
| `0x2F` | SEL_PARAM *(not implemented yet)* | `00 loc mod param` | No response (`WRITE_NO_RESP`) |
| `0x30` | ADD_MODULE | `type loc id col row colour uprate isled [modes...] name\0` | Embedded ACK |
| `0x31` | SET_MODULE_COLOR | `loc mod color` | Embedded ACK |
| `0x32` | DEL_MODULE | `loc mod_id` | Embedded ACK |
| `0x33` | SET_MODULE_LABEL | `loc mod name\0` | Embedded ACK |
| `0x34` | MOVE_MODULE | `loc mod_id col row` | Embedded ACK |
| `0x35 ss` | GET_PATCH_VERSION | `ss`=slot | Embedded; version at `response[6]` |
| `0x37` | SET_PATCH (upload) | see §9 | Embedded ACK |
| `0x3C` | GET_PATCH | — | Extended bulk (patch binary, §9) |
| `0x40` | SET_PARAM | `loc mod par val var` | No response (`WRITE_NO_RESP`) |
| `0x42` | SET_PARAM_LABEL | `loc mod_id module_len (is_string param_len param_idx labels...)*` | Embedded ACK |
| `0x43` | SET_MORPH_RANGE | `loc mod param morph val neg var` | No response (`WRITE_NO_RESP`) |
| `0x44` | COPY_VARIATION | `from to` | Embedded ACK (also broadcast as `copy_variation` watch event to all listeners) |
| `0x4C` | GET_PARAMS *(not implemented yet)* | `location` | Extended bulk |
| `0x4F` | GET_PARAM_NAMES *(not implemented yet)* | `location` | Extended bulk |
| `0x50` | ADD_CABLE | `flags from_mod from_con to_mod to_con` | Embedded ACK |
| `0x51` | DEL_CABLE | `flags from_mod from_con to_mod to_con` | Embedded ACK |
| `0x54` | SET_CABLE_COLOR | `flags from_mod from_con to_mod to_con` — 5 bytes, colour is inside `flags` (§8) | Embedded ACK |
| `0x55` | CTRL_SNAPSHOT *(not implemented yet)* | — | Embedded ACK |
| `0x68` | GET_CURRENT_NOTE *(not implemented yet)* | — | Extended bulk `0x69` voice table, see Current note below |
| `0x6A vv` | SELECT_VARIATION | `vv`=variation index (0-8, 9 = Patch Mutator audition, see below) | Embedded ACK |
| `0x6E` | GET_PATCH_NOTES | — | Extended bulk (patch notes text); sent as step 4 of `g2_get_patch()`, result reported as `text` alongside `name` |
| `0x6F` | *(no live SET exists — see note below)* | — | — |
| `0x70` | UNKNOWN_6 *(not implemented yet)* | — | Embedded ACK |
| `0x71` | GET_RESOURCES_USED | `location` | Extended bulk |
| `0x90` | SET_MUTATION_LOCK | `loc mod locked` | Embedded ACK |
| `0x4D`… | *(section dump, `send-sections`)* | whole `.pch2` sections `[type][len16][data]…` as one edit | Embedded ACK |

> **Patch notes (`0x6E`/`0x6F`) — there is no live SET.** `0x6F` is the chunk ID for the text-pad
> section *inside the full patch file/bulk format* (used by `set-patch-description`-style whole-
> patch writes, `.pch2` save/load, and `upload-patch`) — it is not a standalone live USB command.
> Confirmed against the official Nord editor's decompiled message set: only a `CMTextpadRequest`
> (GET, `0x6E`) exists; there is no write/dump class for notes at all, unlike patch name which has
> a real `CMPatchNameDump` (`0x27`) write path. An earlier implementation here speculatively sent
> `0x6F` standalone as if it were SET_PATCH_NOTES — confirmed on real hardware to hang the G2's USB
> comms (required a power cycle to recover). Don't reintroduce it; notes only reach the device
> embedded in a full patch write.

> **SET_PATCH_DESCRIPTION (`0x21`) gotcha:** the daemon's `voice-mode` and `voice-count` commands wrap this in a read-modify-write via `g2_get_patch()` — do not call them from an editor that already has the patch loaded in memory (it will race with the editor's own copy). Use `set-patch-description` directly with the full 14-byte body instead (`cli/src/g2_device.c:1481-1504`).

> **SET_PATCH (`0x37`) scope caveat:** `upload-perf` reuses this same sub-cmd byte but at **system/performance scope** (`COMMAND_REQ|COMMAND_SYS`, fixed version `0x42`) with a different payload shape — it embeds an inline `0x1A 0x29` performance-name header before the section data. This is distinct from the per-slot `upload-patch` usage documented above.

**Daemon commands:**

```
set-patch-name          <slot> <name>                              (0x27)
get-patch               <slot>                                     (0x28 name, 0x35 version, 0x3C binary, 0x6E notes)
set-module-uprate       <slot> <loc> <mod> <0|1>                   (0x2A)
set-module-mode         <slot> <loc> <mod> <param> <val>            (0x2B)
add-module               <slot> <loc> ...                          (0x30)
set-module-color        <slot> <loc> <mod> <color>                 (0x31)
del-module               <slot> <loc> <mod>                        (0x32)
set-module-name         <slot> <loc> <mod> <name>                  (0x33)
move-module              <slot> <loc> <mod> <col> <row>             (0x34)
upload-patch             <slot> <file>                              (0x37, slot scope)
upload-perf              <file>                                    (0x37, system scope — see caveat above)
set-param                <slot> <loc> <mod> <param> <val> <var>    (0x40)
set-module-labels        <slot> <loc> <mod> <param> <n> <label>... (0x42, all params of the module)
copy-variation           <slot> <from> <to>                        (0x44)
set-morph-range          <slot> <loc> <mod> <param> <range> <group> <var>  (0x43)
set-mutation-lock        <slot> <loc> <mod> <0|1>                  (0x90)
send-sections            <slot> <hex>                              (first section type is the sub-cmd)
add-cable                <slot> <loc> ...                          (0x50)
del-cable                <slot> <loc> ...                          (0x51)
set-cable-color          <slot> <loc> ... <color>                  (0x54)
variation                <slot> <variation>                        (0x35 then 0x6A)
select-param-page        <slot> <page-id>                          (0x2D, page-id = page*3 + bank)
get-param-page           <slot>                                    (0x58, reply arrives as a 0x2D event)
get-global-page          <slot>                                    (0x59, reply arrives as a slot-tagged 0x1E event)
set-patch-description    <slot> <14-byte body>                     (0x21)
voice-mode / voice-count <slot> <value>                            (0x21, via read-modify-write — see caveat above)
get-resources            <slot>                                    (0x71, queried for loc 0 and 1)
```

Nearly every command above also sends `0x35` (GET_PATCH_VERSION) first to fetch/cache the patch version — this happens transparently via `cable_get_version()` and isn't repeated in the list above.

### Edit acknowledgement (`send_slot_edit`)

Every structural slot edit goes through `send_slot_edit()` (`cli/src/g2_device.c`): send the frame, then wait for the G2's answer. This covers add/del cable, set-cable-color, add/del/move module, module colour/name/labels/mode, patch name/description, and `seq` frames. Before 2026-10-08 edits were fire-and-forget. A NACKed add-module still returned `ok`, the editor then cabled the module the G2 had refused, and the G2 wedged.

| Answer | Wire (embedded) | Result |
|--------|-----------------|--------|
| ok | `62 01 08+slot <ver> 7f` | `G2_OK` |
| NACK | sub-cmd `0x7E`, error code at `[5]` | `G2_ERR_REJECTED` (-17), no disconnect |
| nothing within 2 s (`USB_TIMEOUT_LONG_MS`) | — | `G2_ERR_RECV` (-7); the daemon emits `device_disconnected` |

- **The slot tag on a NACK is unreliable.** A slot-D add-module NACK arrived tagged slot A, so any NACK counts while waiting.
- The G2 answers every edit, typically in 50–450 ms and up to ~750 ms when edits are queued. Only one edit is in flight at a time, like the reference editor's `CBubblePort`.
- **Late acks:** if an edit timed out, `edit_ack_owed_slot` makes the next `send_slot_edit` first wait for and discard that late answer. Otherwise it would be credited to the new edit. Not hardware-verified, because a timeout is hard to force.
- `SET_PARAM` (`0x40`, `COMMAND_WRITE_NO_RESP`) is never acked. Do not wait for it.
- New slot-edit commands must use `send_slot_edit`, not `send_slot` + drain.

### Module constraints

These rules are enforced by both the CLI and the editor. Breaking any of them has wedged or corrupted a real G2.

- **Module index is 1..127 per area** (`G2_MAX_MODULE_INDEX`, guarded in `g2_build_add_module_op`). Index 128 is NACKed with code 3, and a follow-up add/cable to it wedged the G2 until it was power cycled. Allocate the lowest free index the way the official `CPatchData::GetUniqueID` does (`freeModuleIds()` in `slotHelpers.ts`); never use `max + 1`.
- **Fx-In (type 127) is FX-area only.** Source: the official Mac v1.62 editor binary, which still has its symbols. In it, the `IsValidContext` mask (`SModuleInfo+0x20`) is `0b111` (all areas) for 171 of 172 module types. Fx-In's mask is `0b001` (context 0 = FX). This is strongly supported but not hardware-confirmed. It is guarded by `G2_MODULE_TYPE_FX_IN` and `isValidInArea()` in `nmg2mods.ts`.
- **ADD_MODULE parameter values are ignored.** The G2 sets a new module's params to its own defaults. These defaults were measured on hardware for all 166 addable types (`src/renderer/__tests__/g2ModuleDefaults.json`). Delphi `ModuleDef.xml` agrees on 793 of 794 params; the exception is Fx-In Pad (G2 = 1).
- **Zero a module's morph ranges before DEL_MODULE.** If a module that still has a morph assignment is deleted, the G2 stays corrupted until power-off. From then on, every add of types 58–61 (DrumSynth, CompLev, Mux8-1X, Clip) gets NACK code 3 and the slot is renamed "Error". The official editor zeroes morphs (and deassigns knobs/controllers) before `CMModuleDelete` (`CMorphMap::GetDeleteModuleMolecules`). Dangling knob or MIDI-CC assignments alone do not trigger it. Editor: `_clearModuleMorphOnDevice` in `slots.ts`.
- A slot named **"Error"** after an edit means the G2 NACKed it (code 3, "Error in synth.") and wiped the slot. The name persists through re-uploads until another patch is loaded over it.

### Patch Mutator: variation 9, section dump, mutation lock

Hardware-verified 2026-10-12. Implemented on the `feat/mutator` branch.

- **Variation 9 is a live, hidden audition variation.** `SELECT_VARIATION 9` (`variation 10 <slot>` in the CLI) and `SET_PARAM` / `SET_MORPH_RANGE` with variation 9 all work. `get-patch` then dumps 10 variations, and the patch description reports variation 9. The official editor auditions mutator results exactly this way. The claim in G2-Edit that the firmware only understands 0-7 is wrong.
- **Bursts of `SET_PARAM` lose values.** `SET_PARAM` is never acked. A burst of 100+ through `seq` silently dropped 14 of 173 values on the G2. Whole-variation writes therefore use the official `CMMutaParamDump`: one slot edit carrying `.pch2`-style sections `[0x4D patch-ctx][0x4D VA][0x4D FX][0x65 morph]` with `numvar = 1` and the variation index set to the target (`send-sections`, `serializeVariationDump`). It is acked, exact and fast (158 params ≈ 0.2 s). A dump **replaces** that variation's morph list and leaves the other variations alone.
- **`0x90` SET_MUTATION_LOCK** (`CMMutaLock`, `loc mod locked`) flips the module-record bit after `uprate` ("Exclude From Mutation", see patch-format §6.3).

### Current note (`0x68` / `0x69`)

Hardware-verified 2026-10-15. Not implemented in the CLI yet.

`0x69` (`CMCurrentNotesDump`) is **only** sent as the reply to a `0x68` request. The G2 never pushes it when keys are played (160 replies, 0 unsolicited). Payload: a 16-bit byte count (46), then bits MSB-first:

```
note:7 attack:7 release:7 count:5          most recent key event
(count+1 = 16) × { note:7 attack:7 release:7 }   one entry per voice
```

Voices are assigned round-robin. A key press overwrites `note` + `attack` (note-on velocity), and a key release overwrites `release` (note-off velocity). There is no held/gate flag, so "held" can only be inferred by diffing polls (~300 ms works). A release with an unchanged value is invisible.

### Knob & MIDI Assignment Sub-Commands

These are combined into slot-command messages. Each message can contain multiple sub-operations via `AddXxxMessage` calls:

| Sub-cmd | Name | Payload bytes | Response |
|---------|------|---------------|----------|
| `0x1C` | ASSIGN_GLOBAL_KNOB (`g2_assign_global_knob`, UNVERIFIED against real hardware) | `(target_slot<<4 \| location<<2) mod param 00 knob_index` — target_slot (0-3=A-D) folds into the first byte's high nibble alongside location, per BVE.NMG2Mess.pas | via parent message |
| `0x1D` | DEASSIGN_GLOBAL_KNOB (`g2_deassign_global_knob`, UNVERIFIED against real hardware) | `00 knob_index` | via parent message |
| `0x1E` | SEL_GLOBAL_PAGE (`g2_select_global_page`, confirmed 2026-08-28: editor→hardware page-select works) | `page` | via parent message; the hardware's own echo of this arrives system-wide as `global_page_change` (see the Performance messages / `aCmd==0x04` table below), not slot-scoped like this send side |
| `0x22` | ASSIGN_MIDICC | `loc mod param cc` | Embedded ACK |
| `0x23` | DEASSIGN_MIDICC | `cc` | Embedded ACK |
| `0x25` | ASSIGN_KNOB | `mod param (loc<<6) 00 knob_index` — location is a 2-bit field + 6 pad bits, MSB-first (Delphi `AddAssignKnobMessage`), unlike MIDI CC's bare location byte; sending bare `loc` made VA assigns land as FX and left the G2 in a bad state | Embedded ACK — the hardware accepts any value without error (no NACK for a nonexistent module), and the front panel never echoes 0x25 itself for its own knob assigns (see `0x74` below), so verify via get-patch |
| `0x26` | DEASSIGN_KNOB | `00 knob_index` | Embedded ACK — same caveat; also, deassign has no front-panel gesture at all (editor-only) |
| `0x2D` | SEL_PARAM_PAGE | `page_id` | Embedded ACK |
| `0x58` | GET_PARAM_PAGE (`g2_request_param_page`) | none (slot-scoped request, `send_slot`) | The G2 answers with an ordinary `0x2D` message (`param_page_change` event). Confirmed on hardware 2026-09-30; the editor sends it at connect and on every slot change. Always the *Patch* page, even while the front panel is in Global source |
| `0x59` | GET_GLOBAL_PAGE (`g2_request_global_page`) | none (slot-scoped, `send_slot`) | Reply is `0x1E` + page byte, tagged with the slot (unlike the system-wide `0x1E` echo). Always the Global page. Confirmed on hardware 2026-09-30. The Patch/Global source itself is the low 2 bits of perf-header byte `remaining[4]` (`0`=Patch, `1`=Global), reported as `knobSourceGlobal` |

### SEL_PARAM_PAGE (`0x2D`) — front-panel Parameter Page

One payload byte packs **both** front-panel selectors:

```
[0] page_id   0-14
      page_id / 3  ->  Parameter Page  A=0 B=1 C=2 D=3 E=4
      page_id % 3  ->  Bank            1=0 2=1 3=2
```

There is no separate Bank sub-command — changing only the Bank means re-sending the whole
`page_id` with the current Page. Values >= 15 are silently ignored by the device, so
`g2_select_param_page()` rejects them locally instead of sending a no-op.

The same sub-command travels **both ways**: the G2 emits it unsolicited when the page is changed
from the front panel, decoded as the `param_page_change` watch event (§14). Sending it from the
editor also produces an echo carrying the value we just set, which is idempotent for the UI.

This packing is the same one the knob address uses: knob slot index `= page_id * 8 + knob`, i.e.
`page*24 + bank*8 + knob` (see `g2-editor/src/renderer/paramPages.ts`). Confirmed against the
decompiled Clavia editor (`CMParameterPageFocus::WriteStream`, `GetPageId`,
`CParameterPages::SetFocusedParameterPage`).

### Knob map change notification (`0x74`) — front-panel Parameter Page knob assign

Confirmed by a real hardware capture (2026-08-28): assigning a knob to a Parameter Page slot from
the physical front panel does **not** echo `ASSIGN_KNOB` (`0x25`). It instead sends this unrelated
sub-command, with **zero payload bytes** — nothing beyond the standard 5-byte response header.

In the decompiled reference editor this is `CMBarbMapChangeNotify` ("Barb" is that source's
internal name for a knob/controller assignment, shared with `CBarbTargetSpec` inside `CMKnobAssign`
itself). Its `ReadStream` only consumes the header, and `UseOnPatch` just clears the editor's
cached knob map and marks it dirty — a stateless "the knob map changed, go re-fetch" ping, carrying
no `module`/`param`/`location`/`slot_index` fields at all. Decoded as `knob_map_changed` (§14); the
frontend responds with a full slot reload (`loadSlot(slot, true)`), the only way to recover the new
assignment since the notification itself carries none of the details.

**Follow-up (2026-08-28): not reproducible, and not a decode gap.** After the initial capture, a
raw-USB-level debug pass (unconditional logging of every interrupt read, no filtering at all)
showed the G2 sends *nothing* on the wire for a front-panel knob assign — repeated several times in
a row, with the assignment reliably taking effect on the device each time — while ordinary
parameter changes kept notifying normally in the same session. Clavia's own official editor was
then checked directly against the same hardware and shows the identical gap: it does not reflect a
front-panel knob assignment live either. So `0x74` firing at all appears to be rare/inconsistent
rather than a normal per-assign echo, and no editor — official or otherwise — achieves live sync
for this specific action. The decode above is kept as correct-if-it-ever-fires, but front-panel
knob assignment should be treated as a confirmed, accepted gap (workaround: manual slot reload),
not a bug to keep chasing.

There is no front-panel gesture to deassign a knob (confirmed on real hardware) — deassign is
editor-only, so no companion "deassign" notify exists. A performance-wide sibling, `0x75`
(`CMPerfBarbMapChangeNotify`, the Global Parameter Pages front-panel-assign echo), is now decoded
as `global_knob_map_changed` (same stateless "go re-fetch" shape and the same UNVERIFIED-whether-
it-ever-fires caveat as `0x74` above) — see `g2_events.c`. `0x1E`'s echo (`CMGlobalParameterPageFocus`,
decoded as `global_page_change`) is likewise decoded defensively; the Delphi reference source never
implements either opcode's receive side, so whether the G2 actually sends them is unconfirmed.

### MIDI CC Commands

**ASSIGN_MIDICC (`0x22`)** — 4-byte payload:

```
[0] location   (0=FX, 1=VA, 2=Patch)
[1] module_id
[2] param_idx
[3] cc_num     (0–119)
```

**DEASSIGN_MIDICC (`0x23`)** — 1-byte payload:

```
[0] cc_num     (0–119)
```

Both commands use the standard versioned slot-scoped frame (scope = `COMMAND_REQ | COMMAND_SLOT | slot`, version = cached `g2_slot_version[slot]`). Batch variants pack multiple `[cmd + payload]` entries into one USB frame via `send_slot_batch()`.

**Daemon commands:**

```
assign-midicc         <slot> <va|fx|patch> <module_id> <param_idx> <cc_num>
deassign-midicc       <slot> <cc_num>
assign-midicc-batch   <slot> <loc> <mod> <param> <cc> [<loc> <mod> <param> <cc> ...]
deassign-midicc-batch <slot> <cc> [<cc> ...]
```

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

### SET_CABLE_COLOR flags byte

```
((location & 1) << 3) | (color & 7)

Bit 3  : location  0=FX, 1=VA
Bits 2-0: color    0-6
```

The full payload is 5 bytes: `[flags][from_mod][from_con][to_mod][to_con]` (reference: `BVE.NMG2Mess.pas` `AddSetCableColorMessage` and its parser). Before 2026-10-07 the CLI sent DEL_CABLE's flags byte plus a trailing colour byte (6 bytes). The G2 answered with NACK code 3, renamed the slot "Error" and wiped its cable lists. Unit test `test_set_cable_color_payload_layout` pins the bytes.

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

**The message replaces the module's whole label list.** Confirmed on hardware and in the original editor (`CMCustomData::WriteStream` sends the module's entire custom data): a message carrying one param's entry blanks every other labelled param of that module. To rename one button of a multi-param switch (e.g. Mixer On1..On4), send all labelled params in one message — `module_len` then covers every entry, each `[is_string, param_len, param_idx, labels...]`. The only CLI command for it is `set-module-labels <slot> <loc> <mod> <param> <count> <label>... [<param> <count> <label>...]` (also usable in `seq`) builds it (the old single-param `set-param-label` was removed because it blanked the module's other params); Morph Group labels use it too, with location `patch`. `module_len` is one byte, so the combined entries are limited to 255 bytes.

**The block size is fixed per module type.** The official editor always sends one entry for every label control of the module (decompiled `HandleModuleCustomDataDump` size check, `CustomDataItemRequestChange`). For example, Mix4-1C is always 40 bytes for params 4–7. If fewer entries are sent, the device keeps the old block size and leaves a zero/garbage tail. This crashed parsing of a "RhytmGen" patch (2026-10-03). Always send the module's full label set with default texts for the untouched params. The label params and their defaults are the `label: string[]` field in `nmg2mods.ts` (34 params on 20 modules, taken from the official PANL resources). The editor builds the block with `fullLabelBlock()` in `slots.ts`. Morph Group labels always send all 8 entries (params 8–15).

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
2. **GET_PATCH** (slot cmd `0x3C`, scope `0x28+slot`, version) → Extended bulk → raw USB binary (tag-checked with `is_patch_data_reply`, see §12)
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

### ~32 KB outbound message ceiling

The G2 firmware cannot receive an outbound message larger than ~32 KB. This applies to `upload-perf` (`0x37`) and to bank downloads (flash dump) alike. A 34 KB performance gets `{"type":"error","code":3}`, the live slots are renamed "Error", and the device may stop answering until it is power cycled. The official Clavia editor fails on the same file at the same bank location, so no editor can work around it. Inbound transfers (get-bank) of the same size work. The CLI refuses such messages up front: `G2_MAX_MESSAGE_LEN` (32768) → `G2_ERR_TOO_LARGE` (-15), and bank transfers skip the entry and continue. Patches (1.5–7 KB) never come close to the limit; only large performances do.

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

The bulk data from GET_SYNTH_SETTINGS (`0x02`) starts with the synth name at `bulk[4]`. Every other field sits at a fixed offset from `base = 4 + nameLen` (`build_synth_bulk_json` in `cli/src/g2_protocol.c`). This is the same layout as the SET request in §10a:

| Offset | Field | Notes |
|--------|-------|-------|
| 4 | Synth name | ClaviaString: up to 16 chars, NUL-terminated only when shorter than 16. `nameLen = parse_name(bulk + 4, …)` = name chars + NUL if present |
| base+0 | Mode | Bit 7: 0=Patch, 1=Performance |
| base+1 | `0x00` | — |
| base+2 | Perf Bank | Cached for the SET message |
| base+3 | Perf Location | Cached for the SET message |
| base+4 | Memory protect | Bit 7 |
| base+5..9 | MIDI channels A, B, C, D, global | Stored 0-indexed; CLI outputs +1 (= channel 1-16) |
| base+10 | Sysex ID | 0-indexed (16 = All); CLI adds 1 when reporting |
| base+11 | Local On | Bit 7 |
| base+12 | Prog Change | Bit 1=recv, bit 0=send |
| base+13 | Controllers | Bit 1=recv, bit 0=send |
| base+14 | Clock | Bit 6=send; bit 5=ignore external clock (0 = recv on) |
| base+15 | Tune cents | `int8` |
| base+16 | Global octave shift active | Bit 7 |
| base+17 | Global octave shift | `int8` |
| base+18 | Tune semitones | `int8` |
| base+20 | Pedal polarity | Bit 7 (our writer always ORs `0x40` into this byte) |
| base+21 | Control pedal gain | 0–32 |

> **Name parsing rule (Delphi `ReadClaviaString`):** read bytes up to a NUL or 16 bytes, whichever comes first. Do not stop at non-printable bytes; they are shown as `?`. On 2026-10-06 a G2 Engine had the stored name `"\x01"`. The old `parse_name` stopped at that byte without consuming it, so every following field was read 2 bytes early: Performance mode showed as Patch, and the mode byte `0x81` showed up as perfBank 129. A settings write after such a misread (e.g. a rename) stores the shifted values back. One sanity check is that the pedal byte (base+20) has `0x40` set. If a single unit reports strange synth settings, capture the raw bytes with `g2-cli --debug daemon` (it logs bulk payloads as `listener_bulk`; one-shot commands log `direct` / `direct_bulk`) before touching the parser.

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

Every list reply (and the store/clear acks) opens with the `0x13` molecule, the official editor's
`CMFlashUsageDump`: bulk `[4]` lo, `[5]` hi, 7 bits each, gives flash used in per mille (clamped
to 1000, `G2_FLASH_USAGE` in `defs.h`). `list` reports it as `flashUsage` when unfiltered.

The last page (only the end marker) fits an **embedded** message:
`c2 | 01 0c 00 13 lo hi 16 01 01 04 | crc` (hardware-captured 2026-10-26). Until that was
handled, every full list ended with a 2 s timeout.

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

### Reading replies: never trust the first packet

The G2 sends notifications (LED/VU, version changes, resources, …) at any time, so a reply is not guaranteed to be the next message. Two rules came out of the hang investigations:

**1. Never drop a header that arrives together with a timeout.** An interrupt read on EP `0x81` that times out just as a header arrives returns `LIBUSB_ERROR_TIMEOUT` **with `transferred = 16`**. The old code discarded it because `ret != 0`. The bulk payload announced by that header then stayed unread on EP `0x82`, so every later bulk read was one message behind. G2 output stalled and OUT writes started to time out. Only a power cycle (or USB reset + resync) recovered. This was the root cause of the "G2 stops answering" hangs. LED streaming only gave the race more chances to happen. Fix in `g2_io.c`:
- accept the data on a timeout when `transferred > 0`;
- cap interrupt reads at 16 bytes, because a larger request swallows the following headers;
- count the bytes that came with a timeout in the bulk loops.

A reliable desync detector: every bulk payload ends in a CRC-16, so `calc_crc16` over the whole payload must be 0.

**2. Match the reply by its tag.** Every request/response read goes through `await_reply()` (`cli/src/g2_device.c`) with a predicate. Anything else that arrives meanwhile is relayed as an event after the wait. Examples:

| Request | Predicate | Match |
|---------|-----------|-------|
| GET_PATCH data | `is_patch_data_reply` | `bulk[1] == 0x08\|slot`, `bulk[3] == 0x21` (C_PATCH_DESCR), and the module list (`0x4A`) at the second chunk. A bare `0x21` change notification does not match |
| LIST_PATCHES | `is_list_reply` | `bulk[1] == 0x0C`, `bulk[3] == 0x13` (R_LIST_NAMES) |
| GET_SYNTH_SETTINGS | — | `bulk[3] == 0x03` (`SUB_RESPONSE_SYNTH_SETTINGS`) |
| GET_PERF_SETTINGS | — | tagged `0x29` reply (`perf_settings_read`, §6b) |
| slot edits | `is_edit_ack` | §7, Edit acknowledgement |

Before 2026-10-07 the patch-data step and `g2_list` took the first extended message as the reply. In a 4 h duration run, 44 of 704 get-patch replies were really `resources_used` (`0x72`) or other payloads, and one stray LED/VU message taken as a list reply shifted every later list request by one answer. **Deterministic repro:** start a daemon, let it idle ~8 s (stream armed), then SIGKILL it so no STOP_COMM is sent. The G2 keeps streaming, and a one-shot `get-patch` / `list` then sees LED/VU data first. Test: `test_oneshot_queries_with_stream_left_on` (`cli/test/test_daemon.c`).

The perf-settings readers followed on 2026-10-20. `startup` (`g2_device_info`), `get-perf-settings` and `get-perf-file` now all read through `perf_settings_bytes()` → `perf_settings_read()` and fail with an error instead of parsing zeros. Before that, they now and then reported every slot inactive/unkeyed. `get-perf-file` fetches each slot with `fetch_patch()` (same tagged read as `get-patch`); before that it sometimes failed with "Failed to convert patch for slot X".

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
| any | `0x0D` | `patch_stored` | `slot`=response[5], `bank`=response[6]+1, `location`=response[7]+1 (checked before the `version==0x40` branch) |
| any | `0x15` | `patch_cleared` | `kind`="performance" if response[5]==1 else "patch"; `bank`=response[6]+1, `location`=response[7]+1 (checked before the `version==0x40` branch). From a bulk clear ack it also carries `flashUsage` |
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
| `0x1E` | `global_page_change` | `page`=r[5] (packed: `page/3` = Page A-E, `page%3` = Bank 1-3) — Global Parameter Pages sibling of the slot-scoped `0x2D` below; confirmed 2026-08-28 to arrive here (system-wide, no slot tag) rather than per-slot, since Global page state isn't slot-scoped, same as `0x3F` below |
| `0x29` | `perf_name` | `name` (null-terminated from response[5]) |
| `0x3F` | `master_clock_run` / `master_clock_bpm` / `knob_source_change` | response[6] selects the sub-type: `0x00`=run (`run`=r[7]), `0x01`=bpm (`bpm`=r[7]), `0x02`=knob-assign source toggle confirmed 2026-08-28 via the SHIFT+GLOBAL front-panel combo (`global`=r[7], 1=Global/0=Patch) |
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
| `0x2D` | `param_page_change` | `slot`, `page`=r[5] (packed: `page/3` = Page A-E, `page%3` = Bank 1-3) |
| `0x2F` | `selected_param` | `slot`, `area` ("fx"/"va"/"patch"), `module`=r[7], `param`=r[8] |
| `0x40` (location==2) | `patch_param` | `slot`, `module`=r[6], `param`=r[7], `value`=r[8], `variation`=r[9] |
| `0x40` (location 0/1) | `param_change` | `slot`, `area` ("fx"/"va"), `module`=r[6], `param`=r[7], `value`=r[8], `variation`=r[9] |
| `0x43` | `morph_change` | `slot`, `area` ("fx"/"va"), `module`=r[6], `param`=r[7], `morph`=r[8], `value`=r[9], `negative`=r[10], `variation`=r[11] |
| `0x44` | `copy_variation` | `slot`, `from`=r[5], `to`=r[6] |
| `0x59` or `0x70` or `0x7F` | `ok` | `slot` |
| `0x69` | `current_note` | `slot`, `note`=r[5], `velocity`=r[6]. **This decoding is a wrong guess:** `0x69` is a bit-packed voice table and only ever arrives as the reply to `0x68` (§7, Current note) |
| `0x6A` | `variation_change` | `slot`, `variation`=r[5] |
| `0x72` | `resources_used` | `slot`, `location`=r[5] |
| `0x74` | `knob_map_changed` | `slot` — no other fields (CMBarbMapChangeNotify, zero payload bytes; not reproducible on demand, see §7 note above) |
| `0x75` | `global_knob_map_changed` | no fields — Global Parameter Pages sibling of `0x74` (CMPerfBarbMapChangeNotify); same reproducibility caveat |
| `0x7E` | `error` | `slot`, `code`=r[5] |

### Bulk notification sub-commands (`aCmd 0x00-0x03`)

| `subCmd` | JSON type | Data |
|----------|-----------|------|
| `0x21` | `patch_version_change` | `slot`, `version`:0 — bulk-level hardware notification ("patch description changed"); distinct from the embedded `0x21`/`0x3C` `patch_update` above, and always reports `version:0` since none accompanies this variant |
| `0x39` | `led_data` | `slot`, `data[]` — raw bytes, see §15 |
| `0x3A` | `volume_data` | `slot`, `data[]` — raw bytes, see §16 |
| `0x4D` | `param_list` | `slot`, `data[]` — raw bytes (response-side decode only; GET_PARAMS itself remains *(not implemented yet)* as a sender) |
| `0x5B` | `param_names` | `slot`, `data[]` — raw bytes (response-side decode only; GET_PARAM_NAMES remains *(not implemented yet)* as a sender) |
| `0x6F` | `patch_notes` | `slot`, `data[]` — raw bytes; spontaneous broadcast decode only, unrelated to `g2_get_patch()`'s direct `0x6E` request/response round-trip (see §7 note on patch notes) |
| `0x72` | `resources_used` | `slot`, `data[]` — raw bytes |

### Performance bulk sub-commands (`aCmd 0x04`)

| `version` | `subCmd` | JSON type | Notes |
|-----------|----------|-----------|-------|
| `0x40` | `0x1F` | `version_update` | `scope`="all_slots"; triggers re-arm |
| any | `0x03` | `synth_settings_update` | `mode`="Patch"\|"Performance". Two variants: (1) **hardware** — G2 PERF button or unsolicited mode change: no `patches` field; (2) **daemon rearm** — emitted by `g2_emit_rearm_data()` after BULK_REARM: includes `"patches":[…]` array (4 entries, one per slot) so the frontend can apply all slots without separate `get-patch` commands. |
| any | `0x11` | `perf_settings` | — |
| any | `0x13` | `patch_names_updated` | Decodes an embedded R_ADD_NAMES (`0x16`) list-name update emitted after a hardware store/rename: `kind` ("patch"/"performance"), `bank`, `location`, `name`, `category`. Falls back to `{"type":"patch_names_updated"}` with no fields if parsing fails. |
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
| `0x05` | `0x80` | `unknown_bulk` | 4 slot entries: `[slot_idx, 255, 128, ...]` repeated *(not implemented)* |
| `0x05` | `0x29` | `unknown_bulk` | Patch names + metadata *(not implemented)* |
| any | `0x13` | `patch_names_updated` | Store ack `[13 lo hi][16 names entry][0D result]`: `kind`, `bank`, `location`, `name`, `category`, `flashUsage` |
| any | `0x15` | `patch_cleared` | Clear ack `[15 type bank loc][13 lo hi][0D result]`: `kind`, `bank`, `location`, `flashUsage` |
| any | `0x12` | `bank_cleared` | Clear-bank ack `[12 type bank from bank to][13 lo hi][0D result]`: `kind`, `bank`, `from`, `to`, `flashUsage` |

The store/clear acks are relayed even when they answer the daemon's own command, so the editor
can update its names list and flash meter.

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
| `device_retargeted` | `bus`, `device`: the target G2 was opened at a new address on the same port path. A G2 self-reboot re-enumerates it at a new address (seen 0:4 → 0:5, 2026-10-22). The daemon follows it by port path, as the official editor does with the IOKit locationID |

### Daemon Lifecycle Events

Emitted once at daemon startup, before any watch events:

| JSON type | Trigger |
|-----------|---------|
| `usb_devices` | List of detected USB devices (`daemon.c:772`) |
| `device_info` | Details of the connected device (`daemon.c:805`) |
| `usb_driver_error` | Failed to claim the USB interface / driver error (`daemon.c:781`) |
| `watch_armed` | START_NOTIFICATIONS succeeded; the daemon is now listening for watch events (`daemon.c:844`) |

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
| `0x18` | R_FLASH_DUMP_MARKER | PATCH_BANK_UPLOAD (`0x17`) | Per-location status: `[5]`=status (0=ok/ack, 4=entry empty, 5=entry corrupt, other=memory protected/full); `[6]`=bank, `[7]`=location |
| `0x19` | R_FLASH_DUMP_RAW_DATA | PATCH_BANK_UPLOAD (`0x17`) | Extended bulk; occupied-location patch data (see §6a) |
| `0x21` | C_PATCH_DESCR | SET_PATCH | Patch description received |
| `0x27` | S_PATCH_NAME | — | Patch name notification |
| `0x29` | C_PERF_NAME | — | Performance name notification |
| `0x2D` | S_SEL_PARAM_PAGE | SEL_PARAM_PAGE | Front-panel Parameter Page changed (watch + echo); byte packs `page*3 + bank` |
| `0x36` | R_PATCH_VERSION | GET_PATCH_VERSION | Patch version value |
| `0x38` | R_PATCH_VERSION_CHANGE | — | Patch version changed (watch) |
| `0x39` | R_LED_DATA | — | LED states (bulk, watch only) |
| `0x3A` | R_VOLUME_DATA | — | Volume/level data (bulk, watch only) |
| `0x5F` | C_KNOBS_GLOBAL | GET_GLOBAL_KNOBS | Global knob assignments |
| `0x6F` | C_PATCH_NOTES | — | Patch text notes chunk ID (full patch file/bulk format only — see §7 note, no standalone live SET) |
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
| `-14` | `G2_ERR_NOT_IMPLEMENTED` | Not implemented |
| `-15` | `G2_ERR_TOO_LARGE` | Message larger than `G2_MAX_MESSAGE_LEN` (see §9) |
| `-16` | `G2_ERR_TARGET_NOT_FOUND` | A specific USB bus/device target was set (`g2_set_target()`) but that G2 is not attached |
| `-17` | `G2_ERR_REJECTED` | The G2 NACKed an edit (§7, Edit acknowledgement); the connection stays up |

---

## 19. Daemon Thread Architecture

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

> **One-shot `set-perf-mode` (no daemon):** the `0x0C/0x1F` mode-change reply arrives ~650 ms after `0x3E`, which is after the 200 ms sleep and the STOP_COMM drain. Before 2026-10-20, `g2_rearm()` in `g2_disconnect()` read that header as its START_COMM ack and left the 19-byte bulk unread. The orphaned payload wedged the G2 ("No response from G2" until a power cycle), the same family as the timeout header drop in §12. `g2_rearm()` now reads the bulk of any extended header (`discard_bulk()`, exported from `g2_io.c`). Found by the hardware suite `npm run test:g2`.

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
  ["set-module-labels", "<slot>", "<loc>", module_id, param_idx, count, "label0", ..., param_idx2, count2, ...],
  ["set-param",        "<slot>", "<loc>", module_id, param_idx, value, variation]
]}
```

Arg layout per sub-command is identical to the individual daemon commands (positional args with `slot` and `location` as args 0 and 1 of each sub-array). Max 128 ops per `seq` call.


> **`add-module` in `seq` — `param_vals` silently skipped:** `execute_seq()` parses and skips over the `param0...` values without passing them through (`daemon.c:238-239`) — the G2 initializes them to defaults. Only `mode_vals` and the structural fields (position, color, name) are actually sent. The G2 ignores parameter values in ADD_MODULE anyway (§7, Module constraints), so non-default values must always be sent afterwards as `set-param` (e.g. pasting a module with non-default variation values).

> **`seq` waits for the edit ack:** the compound frame goes through `send_slot_edit` (§7). A NACK fails the whole `seq` call with `G2_ERR_REJECTED` (-17), and the deferred `set-param` entries are then not sent.

> **`set-param` in `seq` — deferred execution:** `set-param` uses `COMMAND_WRITE_NO_RESP` and cannot be packed into the compound USB frame. The daemon queues all `set-param` entries into a `SetParamEntry[]` array and executes them sequentially via `g2_set_param()` **after** `g2_batch_ops()` returns. This keeps structural mutations (add/del/move module, add/del cable) atomic in one frame while still allowing parameter values in the same `seq` call — essential for copy/paste of modules with non-default variation values.

### Key Properties

- No STOP_COMM / START_COMM per command (matches Delphi) — except when explicitly required before direct queries (see editor path above)
- `g2_listener_active` flag switches `recv_interrupt()` / `recv_bulk()` / `g2_drain_pending()` / `g2_rearm()` between direct libusb and queue-based modes; `g2_stop_comm()` is safe to call from main thread in either mode
- Drains are bounded: `g2_drain_quiet(quiet_ms, &needs_rearm)` reads until nothing arrives for `quiet_ms`, at most `USB_DRAIN_MAX_MS` (1 s). The unbounded loop it replaced spun forever on a streaming G2. `g2_drain_pending()` is `g2_drain_quiet(USB_TIMEOUT_DRAIN_MS)` plus `g2_rearm()` if the stream stopped meanwhile
- Exit state: a one-shot command sends STOP_COMM in `g2_disconnect()`, so the G2 is left quiet. Nobody reads its stream after exit, and the next one-shot would have had to drain it. The daemon leaves the stream on (the official editor's idle state) and re-arms at startup. One-shot `set-perf-mode` waits for the `0x0C/0x1F` reply (up to `USB_TIMEOUT_LONG_MS`) instead of a fixed 200 ms sleep
- Error replies carry the last `g2_err()` message of the command (e.g. "store-patch: device refused 1-3 (Memory protect on)") instead of the generic error text
- Queue cap: 64 entries; oldest dropped when full (LED/vol dominate, losing one frame is imperceptible)
- `g2_slot_version[4]` maintained by listener; device functions use cached value instead of extra GET_PATCH_VERSION round-trips
- **Startup**: daemon queries all 4 slots before `g2_rearm()` and emits them as `slot_data` events; frontend applies them directly via `_applyPatchOutput` in the `slot_data` watch handler

### recv_interrupt() skip list and follow-up race

`recv_interrupt()` in listener mode skips only LED (`0x39`) and volume (`0x3A`) bulk messages; all other types are returned to the caller.

After a voice-count change the G2 emits: `patch_version_change (0x38)` → `assigned_voices (0x05)` → `resources_used (0x72)`. Issuing `get-patch` on `patch_version_change` causes `g2_get_patch()` to pop `0x05`/`0x72` instead of its expected response, crashing the parser.

**Safe pattern:** wait for `resources_used` before issuing `get-patch` (see `useG2.ts`, `pendingSlotReload`).
