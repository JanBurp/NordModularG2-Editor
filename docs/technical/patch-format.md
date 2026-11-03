---
title: Patch File Format
parent: Technical Reference
nav_order: 4
---

# Nord G2 Patch File Format (PCH2 / PRF2)

Reference derived from `g2-editor/src/parser/nmg2PatchParser.ts`, `nmg2PatchSerializer.ts`, `constants.ts`, and `src/types/patch.ts`.

---

## 1. File Types

| Extension | Name | Contents |
|-----------|------|----------|
| `.pch2` | Patch | One patch: FX area + Voice area |
| `.prf2` | Performance | Four slots (A–D), each a patch (FX + Voice), plus a performance header |

Both formats use the same section grammar. Each patch ends with a `SEPARATOR` (`0x6f`) section. A prf2 has a leading `PERF_DATA` section, four patches (so four `SEPARATOR`s, one closing each slot) and a trailing `KNOBS_GLOBAL` (`0x5f`) section.

---

## 2. File Wrapper

```
[Text header — "Version=Nord Modular G2 File Format 1\r\nType=Patch\r\n…", then 0x00]
[Format version — 1 byte, 0x17 = 23 for current files]
[File type — 1 byte, 0x00 = patch, 0x01 = performance]
[Section data]
[CRC-16/CCITT — 2 bytes, big-endian]
```

- The prefix is the official text header, not the patch name: our saved files carry
  `PCH2_TEXT_HEADER` / `PRF2_TEXT_HEADER`, and the patch name is the file name. (The in-memory
  upload buffer leads with the patch name instead; `upload-patch-data` takes the wire name from it.)
- The CRC covers `[version][file type][section data]`, everything after the header's NUL up to the
  CRC. It is the same CRC-16/CCITT as the USB protocol (polynomial `0x1021`, seed `0x0000`). So a
  current `.prf2`'s CRC covers `17 01 …`.
- On load the CRC is checked (`fileCrcOk`); a mismatch only warns, the file still loads.
- Older format versions exist (19 and 22 in `test-patches/`). Like the official editor, the parser
  converts versions 19–22 on load, one step at a time (`parser/fileVersion.ts`). A version below 19
  is read without conversion (with a console error).
  - **19→20:** FltHP frequency rescaled.
  - **20→21:** Morph groups 5 and 6 swap. Morphs and controllers are removed from parameters that
    can't have them any more. FreqShift, Mix4-1S, RandomB and RndClkB change their parameters,
    jacks and modes.
  - **21→22:** type 77 is dropped with its cables. LfoA, LfoC and Glide rates are rescaled, with
    their morphs. ClkDiv gets a second mode.
  - **22→23:** every module's mutation lock is set to its type's default.
- A converted file is uploaded to the G2 as converted data, not as the file (the G2 doesn't
  convert). The first save writes version 23 and shows a toast that says so.
- The result equals what the official editor v1.62 saves for all 9 old fixtures
  (`test-patches/converted/`, compared after parsing).

---

## 3. Section Framing

Every section:

```
Offset  Bytes  Description
──────  ─────  ────────────────────────
0       1      Section type
1       2      Data length (big-endian)
3+      N      Section data
```

The parser walks sections sequentially until the end of the section data (excluding the trailing 2-byte CRC).

---

## 4. Section Types

| Hex | Constant | Name | Scope |
|-----|----------|------|-------|
| `0x11` | `PERF_DATA` | Performance header | prf2 only, first section |
| `0x21` | `PATCH_DESC` | Patch description | per patch |
| `0x4A` | `MODULE_LIST` | Module list | per area |
| `0x4D` | `PARAMETERS` | Parameter values | per area + global |
| `0x52` | `CABLE_LIST` | Cable list | per area |
| `0x5A` | `MODULE_NAMES` | Module labels | per area |
| `0x5B` | `PARAM_NAMES` | Parameter value labels | per area |
| `0x5F` | `KNOBS_GLOBAL` | Global Parameter Pages assignments | prf2 only, last section |
| `0x60` | `CONTROLLERS` | MIDI CC assignments | per patch |
| `0x62` | `KNOBS` | Parameter Pages knob assignments | per patch |
| `0x65` | `MORPH_PARAMS` | Morph Group assignments per parameter | per patch |
| `0x69` | — | Current note (`C_CURRENT_NOTE_2`), idle default | per patch |
| `0x6F` | `SEPARATOR` | Text pad (patch notes), closes the patch | per patch |

---

## 5. Bit Encoding

Most sections use MSB-first bit packing: fields are written consecutively with no byte alignment between them. Bit 0 is the MSB of the first byte.

- **7-bit fields** → unsigned, range 0–127 (used for parameter values, positions, colours)
- **8-bit fields** → unsigned, range 0–255 (used for indices, counts, mode values)

`getBits(n)` in the parser, `BitWriter.write(n, v)` in the serializer implement this scheme.

Exception: `MODULE_NAMES` (§6.6) is byte-encoded, not bit-packed.

---

## 6. Section Details

### 6.1 PERF_DATA (`0x11`) — prf2 only

Byte-encoded. Appears once at the start of a prf2 file. Mirrors the USB `GET_PERF_SETTINGS` response (see usb-protocol §10). Layout per the official `CPerformanceHeader_11`.

```
[8-byte header — performance settings]
[Slot A: name + 10 bytes]
[Slot B: name + 10 bytes]
[Slot C: name + 10 bytes]
[Slot D: name + 10 bytes]
```

A slot name is up to 16 characters, NUL-terminated only when shorter than 16.

Slot block (10 bytes):

| Offset | Field | Notes |
|--------|-------|-------|
| 0 | `active` | 0 or 1 |
| 1 | `key` | 0 or 1 |
| 2 | `hold` | 0 or 1 |
| 3 | `bank` | bank index |
| 4 | `patch` | patch location |
| 5 | `rangeLow` | MIDI note low |
| 6 | `rangeHigh` | MIDI note high |
| 7 | `midiChannel` | the slot's MIDI channel (official `SetMidiChannel`), 0-based, 16 = off. The G2 reports its synth-settings channel here and ignores the byte on upload (hardware, 2026-11-02) |
| 8–9 | padding | 0 |

Header (8 bytes), as `writePerfSettings` writes it and `parsePrfData` reads it into `settings`:

| Offset | Field | Notes |
|--------|-------|-------|
| 0 | `category` | 0–15, same table as patch categories |
| 1 | `focus << 2 \| knobSource` | `focus` = selected slot 0–3 (bits 2–3); `knobSourceGlobal` = low 2 bits ≠ 0 |
| 2 | `rangeEnable` | KB Split on/off |
| 3 | `bpm` | master clock BPM |
| 4 | `clockKbdTrig` | a bool in the official reader; the name is G2Alike's |
| 5 | `clockRunning` | bit 0 |
| 6–7 | 0 | |

Parser: `parsePrfData` (`nmg2PatchParser.ts`), exposed as `settings` on the parsed performance.

---

### 6.2 PATCH_DESC (`0x21`)

Bit-packed. Section data is 15 bytes (120 bits; bits 108–119 are trailing zeros). Field layout per the official `CPatchHeaderData_11::ReadStream`.

The first **61 bits** are unknown/reserved and are preserved verbatim during serialization — they are never decoded.

Decoded fields (bit positions 0-based from start of section data):

| Bits | Field | Width | Notes |
|------|-------|-------|-------|
| 0–60 | *(reserved)* | 61 | Preserved as-is |
| 61–65 | `voices` | 5 | **0-based**: 0 = 1 voice, 31 = 32 voices |
| 66–79 | `height` | 14 | Splitter position (official `SetSplitterPos`) |
| 80–82 | `octaveShift` | 3 | Patch octave shift + 2 (stored 0–4 = −2..+2; above 4 reads as 0) |
| 83 | `red` | 1 | Cable colour visibility |
| 84 | `blue` | 1 | |
| 85 | `yellow` | 1 | |
| 86 | `orange` | 1 | |
| 87 | `green` | 1 | |
| 88 | `purple` | 1 | |
| 89 | `white` | 1 | |
| 90–91 | `monopoly` | 2 | 0=Poly, 1=Mono, 2=Legato, 3=Slgt |
| 92–99 | `variation` | 8 | Active variation (0–8) |
| 100–107 | `category` | 8 | Category index (0–15) |

> **Note on voices:** `description.voices` is 0-based; the USB `assigned_voices` event is 1-based. Formula: `description.voices = assigned − 1` when poly. See usb-protocol §9.

Parser: `parsePatchDesc`.

---

### 6.3 MODULE_LIST (`0x4A`)

Bit-packed. One section per area (areaIdx 0 = FX, 1 = Voice).

**Header:**

| Bits | Field | Width |
|------|-------|-------|
| 0–1 | `areaIdx` | 2 |
| 2–9 | `moduleCount` | 8 |

**Per module:**

| Bits | Field | Width | Notes |
|------|-------|-------|-------|
| +0–7 | `type` | 8 | Module type ID (maps to module definition database) |
| +8–15 | `index` | 8 | Unique ID within area, **1..127** (128+ is NACKed by the G2 — see usb-protocol §7, Module constraints) |
| +16–22 | `horiz` | 7 | Column position (0–19) |
| +23–29 | `vert` | 7 | Row position |
| +30–37 | `colour` | 8 | Module colour |
| +38 | `uprate` | 1 | High-rate processing flag |
| +39 | `mutaLock` | 1 | Exclude From Mutation (Patch Mutator). Set with `set-mutation-lock` (`0x90`). Fixtures from the official editor have it set on default-locked types (CompLev, NoteRcv, LevConv…). The parser used to call this field `leds` |
| +40–45 | *(padding)* | 6 | Discarded |
| +46–49 | `nmodes` | 4 | Number of mode values |
| +50… | `modes[i]` | 6×nmodes | Mode values |

Parser: `parseModuleList`.

---

### 6.4 PARAMETERS (`0x4D`)

Two distinct layouts depending on `areaIdx`.

#### areaIdx 0 or 1 — Module parameters (FX / Voice)

**Header:**

| Bits | Field | Width | Notes |
|------|-------|-------|-------|
| 0–1 | `areaIdx` | 2 | 0=FX, 1=Voice |
| 2–9 | `moduleCount` | 8 | |
| 10–17 | `variationCount` | 8 | 9, or 0 for an area with no modules (EmptyPatch.pch2) |

**Per module:**

| Field | Width | Notes |
|-------|-------|-------|
| `index` | 8 | Module index |
| `paramCount` | 7 | Number of parameters |
| 9× variation blocks | — | One block per variation (0–8) |

**Per variation block:**

| Field | Width |
|-------|-------|
| variation index | 8 |
| paramCount × value | 7 each |

Storage in `ModuleInstance`: `lv[variation × pcnt + paramIdx]`.

#### areaIdx 2 — Global patch parameters

**Header:**

| Bits | Field | Width | Notes |
|------|-------|-------|-------|
| 0–1 | `areaIdx` | 2 | = 2 |
| 2–9 | *(entry count)* | 8 | 7 in every file seen |
| 10–17 | `variationCount` | 8 | 9 |

Then the entries, in the same generic layout as the module areas (official `R_ModuleParamData`
reads all areas alike). The entry index names the group, and the parser reads the counts from the
file, so an extra or unknown entry or value can't misalign the rest. Each entry:

| Field | Width | Notes |
|-------|-------|-------|
| entry index | 8 | 1–7, see below |
| field count | 7 | fields per variation |
| 9× variation blocks | — | |

**Per variation block:** 8-bit variation index + fieldCount × 7-bit values.

Entries (as written; the parser accepts any order):

| ID | Fields | `PatchParamVariation` keys |
|----|--------|--------------------------|
| 1 | 16 | `morphDials[0..7]`, `morphModes[0..7]` |
| 2 | 2 | `patchVol`, `activeMuted` |
| 3 | 2 | `glide`, `glideTime` |
| 4 | 2 | `bend`, `semi` |
| 5 | 3 | `vibrato`, `cents`, `rate` |
| 6 | 4 | `arpeggiator`, `arpTime`, `arpType`, `octaves` |
| 7 | 2 | `octaveShift`, `sustain` |

The 8 morph names are: `Wheel`, `Vel`, `Keyb`, `Aft.Tch`, `Sust.Pd`, `Ctrl.Pd`, `P.Stick`, `G.Wh 2` (defined in `MORPH_NAMES` in `patch.ts`).

Parser: `parseModuleParameters`.

---

### 6.5 CABLE_LIST (`0x52`)

Bit-packed. One section per area.

**Header:**

| Bits | Field | Width |
|------|-------|-------|
| 0–1 | `areaIdx` | 2 |
| 2–7 | *(padding)* | 6 |
| 8–23 | `cableCount` | 16 |

**Per cable:**

| Field | Width | Notes |
|-------|-------|-------|
| `colour` | 3 | 0–7 |
| `smod` | 8 | Source module index |
| `scon` | 6 | Source connector index (0–63) |
| `dir` | 1 | Direction flag |
| `dmod` | 8 | Destination module index |
| `dcon` | 6 | Destination connector index |

Parser: `parseCableList`.

---

### 6.6 MODULE_NAMES (`0x5A`)

Byte-encoded (not bit-packed). One section per area.

**Header:**

| Offset | Field | Notes |
|--------|-------|-------|
| 0 | areaIdx (bits 7–6) | Top 2 bits of byte |
| 1 | `moduleCount` | |

**Per entry:**

| Field | Notes |
|-------|-------|
| 1-byte module index | |
| Name bytes | Max 16 characters |
| `0x00` null terminator | Omitted when name is exactly 16 chars |

Parser: `parseModuleNames`.

---

### 6.7 PARAM_NAMES (`0x5B`)

Bit-packed. One section per area. Stores user-defined text labels for parameter value slots (e.g. labelling an integer knob's positions).

**Header:**

| Bits | Field | Width |
|------|-------|-------|
| 0–1 | `areaIdx` | 2 |
| 2–9 | `moduleCount` | 8 |

**Per module:**

| Field | Width | Notes |
|-------|-------|-------|
| `modIdx` | 8 | Module index |
| `moduleLen` | 8 | Total bytes consumed by following label entries |
| label entries | — | Repeated until `moduleLen` bytes consumed |

**Per label entry:**

| Field | Width | Notes |
|-------|-------|-------|
| `isString` | 8 | 1 if text labels, 0 otherwise |
| `paramLen` | 8 | `1 + labelCount × 7` |
| `paramIndex` | 8 | Which parameter these labels belong to |
| label slots | 7×8 each | `floor((paramLen − 1) / 7)` slots; each is exactly 7 bytes, null-padded |

Each label slot is 7 characters, null-padded. `paramLen − 1` must be a multiple of 7.

A module's block holds one entry for **every** label param of its type, so the block size is fixed per module type. A block with fewer entries corrupts the device copy; see [USB protocol §8b](usb-protocol.md#8b-set_param_label-wire-format).

**areaIdx 2 — Morph Group labels.** One module entry, module index 1 (`PATCH_MORPH_MODULE_ID`),
with `isString = 1` entries on params 8–15: the label of Morph Group i is param 8+i. A hardware
get-patch carries this section too (5b:2 5b:1 5b:0, captured 2026-11-02).

**SeqNote view entries.** SeqNote stores its Magnifier (zoom) and octave-offset widgets as two
entries with `isString = 0`, `paramLen = 1`: zoom first, then octave offset, in `paramIndex`.

An entry with `paramLen = 0` is 2 bytes (no `paramIndex`): the official reader takes `type`,
`len`, then exactly `len` more bytes (`CModuleCustomData_11`). Our writer always writes 3.

> This mirrors the USB `SET_PARAM_LABEL` wire format described in [USB protocol §8b](usb-protocol.md#8b-set_param_label-wire-format).

Parser: `parseParamNames`.

---

### 6.8 SEPARATOR (`0x6F`)

Raw bytes. Contains the patch notes text for the preceding patch. Length varies; may be 0. The
official editor writes at most 1024 bytes (`CTextpadData_11::WriteStream`); so do we for slot
patches, while library files keep their full notes.

In the parser, encountering a `SEPARATOR` increments `aof` (area offset) by 2, so subsequent sections are assigned to the next slot's FX and Voice areas. This is the mechanism that divides a prf2 into 4 independent patches.

---

## 7. Section Order

The official editor writes one fixed order per patch, and its reader rejects any other
(`CPatchFile_13::WriteMolecules`):

```
21  4a:1 4a:0  69  52:1 52:0  4d:2 4d:1 4d:0  65  62  60  5b:2 5b:1 5b:0  5a:1 5a:0  6f
```

`:n` is the area: 0 = FX, 1 = VA, 2 = patch settings. A repeated id goes by descending area.

A `.pch2` is one such patch. A `.prf2` is `11`, four such patches, then `5f`.

A hardware GET_PATCH answers in another order (0x5a before 0x5b) and has no 0x69 and no 0x6f.
`serializePatch` and the CLI's `get-patch-file`/`get-perf-file` rewrite it into the official
order, insert an idle 0x69 and close each patch with a 0x6f (`canonicalSlotOrder` /
`patch_slot_sections_canonical`). The G2 rejects a performance upload whose slots deviate from it.
The parser itself dispatches by type and accepts any order.

---

## 8. Variation System

- 9 variations, indexed 0–8 (hardware labels them A–I; UI shows 1–9)
- All 9 are always stored, even if not all are used
- `PatchDescription.variation` — the active variation when the patch was saved
- Module parameter storage: `lv[variation × pcnt + paramIdx]` (`ModuleInstance.lv`)
- Global patch parameter storage: `patchParams[variation]` (array of `PatchParamVariation`)
- Constant `NUM_VARIATIONS = 9` defined in `patch.ts`
- The G2 also has a hidden 10th variation, **index 9**. The Patch Mutator uses it to audition results live. After it has been written, `get-patch` dumps 10 variations (see usb-protocol §7, Patch Mutator)

---

## 9. Serialization Strategy

`serializePatch` and `serializePerformance` (in `nmg2PatchSerializer.ts`) use **section replacement**, not full reconstruction:

- **Regenerated** from the in-memory `Patch` object: MODULE_LIST, CABLE_LIST, PARAMETERS, MODULE_NAMES, PARAM_NAMES, CONTROLLERS, KNOBS, MORPH_PARAMS, SEPARATOR (from `patch.text`) and PATCH_DESC (decoded fields only).
- **Copied verbatim** from the template: unknown sections, and PERF_DATA unless new perf settings are passed (`writePerfSettings` rebuilds it then).
- The first 61 bits of PATCH_DESC are also preserved verbatim (they are never decoded during parsing).
- **Append if missing:** a section the template lacks is still written when the patch has content for it (controllers, knobs, morph assignments, Morph Group labels, area labels). `serializePatch` then puts everything in the official order (§7).

This ensures unknown bits survive round-trips without data loss.

```typescript
serializePatch(name, patch, templateRawHex, variations): string
serializePerformance(patches, templateRawHex, variationsArray): string
```

`templateRawHex` must be the last valid rawHex from a hardware GET_PATCH or file load — it supplies the preserved sections.

For prf2, `serializePerformance` resets the written-section tracking at each SEPARATOR boundary so all 4 slots' sections are independently updated.

Both drop the Patch Mutator's live-only variation 9 (only `NUM_VARIATIONS` are written), and PATCH_DESC never stores variation 9 as the active variation (it is written as 0).

Other serializer entry points:

- `serializeVariationDump(patch, state, variation)` builds the Patch Mutator audition dump (`CMMutaParamDump`): PARAMETERS for the patch-settings, VA and FX contexts plus MORPH_PARAMS, each holding only `variation` (`numvar = 1`). Sent with `send-sections` (see usb-protocol §7).
- `setFileDescription(file, desc)` returns a whole `.pch2` with only PATCH_DESC replaced (e.g. a new category). The header and all other sections stay byte for byte; the CRC is recomputed from the file's own version byte on.

---

## 10. USB Binary vs PCH2

The raw binary returned by the USB `GET_PATCH` command is not identical to the `.pch2` file format. The conversion (`patch_usb_to_pch2`) slices two ranges from the USB bulk data:

```
pch2 = usb[0x03..0x14]   (18 bytes)
     + usb[0x17..end-2]  (remaining, excluding 2-byte USB CRC)
```

See usb-protocol §9 for the exact formula and the upload (`SET_PATCH`) wire format.
