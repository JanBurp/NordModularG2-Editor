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

Both formats use the same section grammar. The prf2 adds a leading `PERF_DATA` section and three `SEPARATOR` sections to delimit slots.

---

## 2. File Wrapper

```
[Patch name — variable length, null-terminated]
[0x17 0x00   — magic bytes]
[Section data]
[CRC-16/CCITT — 2 bytes, big-endian]
```

The name header is stripped on load and re-prepended on save. CRC is computed over `[0x17, 0x00, section data]` — the same CRC-16/CCITT algorithm as the USB protocol (polynomial `0x1021`, seed `0x0000`). The 2-byte CRC itself is excluded from the CRC input.

Parser: `nmg2PatchParser.ts:56–84`.

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
| `0x6F` | `SEPARATOR` | Text pad (patch notes) | per patch |

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

Byte-encoded. Appears once at the start of a prf2 file. Mirrors the USB `GET_PERF_SETTINGS` response (see `usb.md §10`).

```
[8-byte header — unknown / settings]
[Slot A: name\0 + 10 bytes]
[Slot B: name\0 + 10 bytes]
[Slot C: name\0 + 10 bytes]
[Slot D: name\0 + 10 bytes]
```

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
| 7–9 | padding | ignored |

Parser: `parsePrfData` (`nmg2PatchParser.ts:382–408`).

---

### 6.2 PATCH_DESC (`0x21`)

Bit-packed. Section data is 14 bytes (112 bits; bits 108–111 are trailing zeros).

The first **61 bits** are unknown/reserved and are preserved verbatim during serialization — they are never decoded.

Decoded fields (bit positions 0-based from start of section data):

| Bits | Field | Width | Notes |
|------|-------|-------|-------|
| 0–60 | *(reserved)* | 61 | Preserved as-is |
| 61–65 | `voices` | 5 | **0-based**: 0 = 1 voice, 31 = 32 voices |
| 66–79 | `height` | 14 | — |
| 80–82 | `unk2` | 3 | Unknown |
| 83 | `red` | 1 | Cable colour visibility |
| 84 | `blue` | 1 | |
| 85 | `yellow` | 1 | |
| 86 | `orange` | 1 | |
| 87 | `green` | 1 | |
| 88 | `purple` | 1 | |
| 89 | `white` | 1 | |
| 90–91 | `monopoly` | 2 | 0=Poly, 1=Mono, 2=Legato |
| 92–99 | `variation` | 8 | Active variation (0–8) |
| 100–107 | `category` | 8 | Category index (0–15) |

> **Note on voices:** `description.voices` is 0-based; the USB `assigned_voices` event is 1-based. Formula: `description.voices = assigned − 1` when poly. See `usb.md §9`.

Parser: `parsePatchDesc` (`nmg2PatchParser.ts:412–431`).

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
| +8–15 | `index` | 8 | Unique ID within area |
| +16–22 | `horiz` | 7 | Column position (0–19) |
| +23–29 | `vert` | 7 | Row position |
| +30–37 | `colour` | 8 | Module colour |
| +38 | `uprate` | 1 | High-rate processing flag |
| +39 | `leds` | 1 | Has LED outputs |
| +40–45 | *(padding)* | 6 | Discarded |
| +46–49 | `nmodes` | 4 | Number of mode values |
| +50… | `modes[i]` | 6×nmodes | Mode values |

Parser: `parseModuleList` (`nmg2PatchParser.ts:267–294`).

---

### 6.4 PARAMETERS (`0x4D`)

Two distinct layouts depending on `areaIdx`.

#### areaIdx 0 or 1 — Module parameters (FX / Voice)

**Header:**

| Bits | Field | Width | Notes |
|------|-------|-------|-------|
| 0–1 | `areaIdx` | 2 | 0=FX, 1=Voice |
| 2–9 | `moduleCount` | 8 | |
| 10–17 | `variationCount` | 8 | Always 9 |

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
| 2–9 | *(sub-section count)* | 8 | Always 7 |
| 10–17 | `variationCount` | 8 | Always 9 |

Followed by 7 sub-sections. Each sub-section:

| Field | Width | Notes |
|-------|-------|-------|
| sub-section ID | 8 | 1–7 |
| field count | 7 | fields per variation |
| 9× variation blocks | — | |

**Per variation block:** 8-bit variation index + fieldCount × 7-bit values.

Sub-sections in order:

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

Parser: `parseModuleParameters` (`nmg2PatchParser.ts:301–358`).

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

Parser: `parseCableList` (`nmg2PatchParser.ts:360–379`).

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

Parser: `parseModuleNames` (`nmg2PatchParser.ts:204–223`).

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

> This mirrors the USB `SET_PARAM_LABEL` wire format described in `usb.md §8b`.

Parser: `parseParamNames` (`nmg2PatchParser.ts:225–265`).

---

### 6.8 SEPARATOR (`0x6F`)

Raw bytes. Contains the patch notes text for the preceding patch. Length varies; may be 0.

In the parser, encountering a `SEPARATOR` increments `aof` (area offset) by 2, so subsequent sections are assigned to the next slot's FX and Voice areas. This is the mechanism that divides a prf2 into 4 independent patches.

---

## 7. PRF2 Full Layout

```
[PERF_DATA (0x11)]        ← performance header: slot names & settings
[PATCH_DESC (0x21)]       ← slot 0 description
[MODULE_LIST (0x4A) FX]   ┐
[MODULE_LIST (0x4A) VA]   │
[PARAMETERS (0x4D) FX]    │ slot 0
[PARAMETERS (0x4D) VA]    │
[PARAMETERS (0x4D) global]│
[CABLE_LIST (0x52) FX]    │
[CABLE_LIST (0x52) VA]    │
[MODULE_NAMES (0x5A) ...]  │ (optional)
[PARAM_NAMES (0x5B) ...]   ┘ (optional)
[SEPARATOR (0x6F)]         ← text pad + slot boundary: aof += 2

[PATCH_DESC (0x21)]        ← slot 1
...
[SEPARATOR (0x6F)]

[PATCH_DESC (0x21)]        ← slot 2
...
[SEPARATOR (0x6F)]

[PATCH_DESC (0x21)]        ← slot 3
...

[CRC-16 (2 bytes)]
```

Section order within each slot is not strictly mandated; the parser dispatches by type. The above order matches the Delphi reference editor's write order and is what the serializer produces.

---

## 8. Variation System

- 9 variations, indexed 0–8 (hardware labels them A–I; UI shows 1–9)
- All 9 are always stored, even if not all are used
- `PatchDescription.variation` — the active variation when the patch was saved
- Module parameter storage: `lv[variation × pcnt + paramIdx]` (`ModuleInstance.lv`)
- Global patch parameter storage: `patchParams[variation]` (array of `PatchParamVariation`)
- Constant `NUM_VARIATIONS = 9` defined in `patch.ts`

---

## 9. Serialization Strategy

`serializePatch` and `serializePerformance` (in `nmg2PatchSerializer.ts`) use **section replacement**, not full reconstruction:

- **Mutable sections** (MODULE_LIST, CABLE_LIST, PARAMETERS, MODULE_NAMES, PARAM_NAMES, PATCH_DESC) are regenerated from the in-memory `Patch` object.
- **Immutable sections** (SEPARATOR text, PERF_DATA) are copied verbatim from the template.
- The first 61 bits of PATCH_DESC are also preserved verbatim (they are never decoded during parsing).

This ensures unknown bits survive round-trips without data loss.

```typescript
serializePatch(name, patch, templateRawHex, variations): string
serializePerformance(patches, templateRawHex, variationsArray): string
```

`templateRawHex` must be the last valid rawHex from a hardware GET_PATCH or file load — it supplies the preserved sections.

For prf2, `serializePerformance` resets the written-section tracking at each SEPARATOR boundary so all 4 slots' sections are independently updated.

---

## 10. USB Binary vs PCH2

The raw binary returned by the USB `GET_PATCH` command is not identical to the `.pch2` file format. The conversion (`patch_usb_to_pch2`) slices two ranges from the USB bulk data:

```
pch2 = usb[0x03..0x14]   (18 bytes)
     + usb[0x17..end-2]  (remaining, excluding 2-byte USB CRC)
```

See `usb.md §9` for the exact formula and the upload (`SET_PATCH`) wire format.
