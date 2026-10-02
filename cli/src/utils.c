/*
 * G2 CLI - Utility functions
 *
 * CRC-16/CCITT calculation, name-field parsing, slot-string conversion,
 * patch format conversion (USB frame <-> PCH2 file), and command tokenizer.
 */

#include "utils.h"
#include "defs.h"
#include <string.h>
#include <stdlib.h>

/* CRC-16/CCITT one-byte step: polynomial 0x1021, MSB-first. */
uint16_t crc_iterator(int32_t seed, int32_t val) {
    int32_t k = (((seed >> 8) ^ val) & 255) << 8;
    int32_t crc = 0;
    for (int i = 0; i < 8; i++) {
        if ((crc ^ k) & 0x8000) {
            crc = (crc << 1) ^ 0x1021;
        } else {
            crc = crc << 1;
        }
        k = k << 1;
    }
    return (uint16_t)((seed << 8) ^ crc) & 0xFFFF;
}

uint16_t calc_crc16(uint8_t *buff, int length) {
    uint16_t crc = 0;
    for (int i = 0; i < length; i++) {
        crc = crc_iterator(crc, buff[i]);
    }
    return crc;
}

/* Extract a printable ASCII name from a G2 name field.
 * Stops at the first non-printable byte (NUL or control char).
 * Returns the number of bytes consumed including the terminating NUL (if present). */
int parse_name(const uint8_t *data, char *buf, size_t bufsize) {
    size_t i;
    for (i = 0; i < 16 && i < bufsize - 1; i++) {
        if (data[i] >= 0x20 && data[i] <= 0x7f) {
            buf[i] = data[i];
        } else {
            break;
        }
    }
    buf[i] = '\0';
    if (i < 16 && data[i] == 0) {
        return (int)(i + 1);
    }
    return (int)i;
}

slot_t parse_slot(const char *slot_str) {
    if (slot_str == NULL) {
        return SLOT_CURRENT;
    }
    if (strcmp(slot_str, "A") == 0 || strcmp(slot_str, "a") == 0) return SLOT_A;
    if (strcmp(slot_str, "B") == 0 || strcmp(slot_str, "b") == 0) return SLOT_B;
    if (strcmp(slot_str, "C") == 0 || strcmp(slot_str, "c") == 0) return SLOT_C;
    if (strcmp(slot_str, "D") == 0 || strcmp(slot_str, "d") == 0) return SLOT_D;
    return SLOT_INVALID;
}

/* Strip the USB frame header and CRC to extract the two PCH2 payload sections:
 *   bytes [0x03:0x15) + bytes [0x17:end-2)
 * The 2-byte gap at 0x15-0x16 and the 2-byte trailing CRC are discarded. */
int patch_usb_to_pch2(const uint8_t *usb_data, size_t usb_len,
                      uint8_t *pch2_data, size_t *pch2_len) {
    if (usb_data == NULL || pch2_data == NULL || pch2_len == NULL) {
        return -1;
    }

    if (usb_len < PCH2_USB_CHUNK2_START + PCH2_USB_TAIL_SIZE) {
        return -1;
    }

    size_t first_part  = PCH2_USB_CHUNK1_END - PCH2_USB_DATA_OFFSET;
    size_t second_part = usb_len - PCH2_USB_CHUNK2_START - PCH2_USB_TAIL_SIZE;
    size_t required    = first_part + second_part;
    if (*pch2_len < required) {
        *pch2_len = required;
        return -1;
    }

    memcpy(pch2_data,             usb_data + PCH2_USB_DATA_OFFSET,   first_part);
    memcpy(pch2_data + first_part, usb_data + PCH2_USB_CHUNK2_START, second_part);
    *pch2_len = required;
    return 0;
}

/* Wrap section data in a .pch2 file: [PCH2_TEXT_HEADER][NUL][0x17][0x00][sections][CRC16 BE].
 * CRC covers [0x17][0x00][sections] (the range G2Editor.c's CPatchFile_*::Write checksums
 * and every real .pch2 carries); without it a reader (including our own upload-patch)
 * takes the last 2 section bytes for the CRC and truncates the patch. */
int pch2_file_from_sections(const uint8_t *sections, size_t sections_len,
                            uint8_t *out, size_t *out_len) {
    if (!sections || !out || !out_len) return -1;

    size_t header_len = strlen(PCH2_TEXT_HEADER);
    size_t total = header_len + 3 + sections_len + 2;
    if (*out_len < total) {
        *out_len = total;
        return -1;
    }

    memcpy(out, PCH2_TEXT_HEADER, header_len);
    out[header_len]     = 0x00;
    out[header_len + 1] = 0x17;
    out[header_len + 2] = 0x00;
    memcpy(out + header_len + 3, sections, sections_len);

    uint16_t crc = calc_crc16(out + header_len + 1, (int)(sections_len + 2));
    out[total - 2] = (crc >> 8) & 0xff;
    out[total - 1] = crc & 0xff;

    *out_len = total;
    return 0;
}

/* Canonical per-slot chunk order inside a .prf2/.pch2, as written by both reference editors
 * (Delphi TG2FilePatch.Write, G2Editor.c CPatchFile_13::WriteMolecules) and as both .prf2
 * fixtures carry it. The G2 rejects a performance upload whose slots deviate from it —
 * confirmed on hardware, where an out-of-order slot comes back as an error event with every
 * patch renamed "Error". GET_PATCH answers in a *different* order (0x5a before 0x5b) and omits
 * 0x69 entirely, so a slot captured from the wire has to be rewritten into this order before it
 * can go into a file that is meant to be uploadable again. */
static const uint8_t kSlotChunkOrder[] = {
    0x21, 0x4a, 0x4a, 0x69, 0x52, 0x52, 0x4d, 0x4d, 0x4d,
    0x65, 0x62, 0x60, 0x5b, 0x5b, 0x5b, 0x5a, 0x5a
};

/* A neutral C_CURRENT_NOTE_2 (0x69) chunk: the "nothing playing" value Clavia's own files use
 * for an idle patch — byte-for-byte what both EmptyPerf.prf2 slots and three of the four
 * MorphingDrumDemo.prf2 slots contain. GET_PATCH never returns this chunk, but the G2 requires
 * it on upload (a slot train without it is rejected exactly like an out-of-order one, verified
 * on hardware), and its contents are live voice state that is not worth round-tripping anyway. */
static const uint8_t kCurrentNoteDefault[] = {
    0x69, 0x00, 0x09, 0x80, 0x00, 0x00, 0x60, 0x00, 0x01, 0x00, 0x00, 0x00
};
_Static_assert(sizeof(kCurrentNoteDefault) == PCH2_CANONICAL_GROWTH,
               "PCH2_CANONICAL_GROWTH (utils.h) must equal sizeof(kCurrentNoteDefault)");

/* Rewrites one slot's section train into kSlotChunkOrder, preserving each section's bytes and
 * the relative order of repeated ids (the three 0x5b keep their morph-first ordering). A missing
 * 0x69 is filled in from kCurrentNoteDefault; every other absent section is simply skipped, and
 * anything unrecognised is kept at the end rather than dropped. `out` must have room for
 * in_len + sizeof(kCurrentNoteDefault). On a malformed train the input is copied verbatim. */
#define SLOT_MAX_SECTIONS 64
void patch_slot_sections_canonical(const uint8_t *in, size_t in_len, uint8_t *out, size_t *out_len) {
    struct { uint8_t id; size_t ofs, len; int used; } sec[SLOT_MAX_SECTIONS];
    int n = 0;
    size_t ofs = 0;
    while (ofs + 3 <= in_len && n < SLOT_MAX_SECTIONS) {
        size_t siz = ((size_t)in[ofs + 1] << 8) | in[ofs + 2];
        if (ofs + 3 + siz > in_len) break;
        sec[n].id = in[ofs];
        sec[n].ofs = ofs;
        sec[n].len = 3 + siz;
        sec[n].used = 0;
        n++;
        ofs += 3 + siz;
    }
    if (ofs != in_len) {  /* didn't parse cleanly — don't risk reshuffling it */
        memcpy(out, in, in_len);
        *out_len = in_len;
        return;
    }

    size_t pos = 0;
    for (size_t k = 0; k < sizeof(kSlotChunkOrder); k++) {
        int found = 0;
        for (int i = 0; i < n; i++) {
            if (!sec[i].used && sec[i].id == kSlotChunkOrder[k]) {
                memcpy(out + pos, in + sec[i].ofs, sec[i].len);
                pos += sec[i].len;
                sec[i].used = 1;
                found = 1;
                break;
            }
        }
        if (!found && kSlotChunkOrder[k] == 0x69) {
            memcpy(out + pos, kCurrentNoteDefault, sizeof(kCurrentNoteDefault));
            pos += sizeof(kCurrentNoteDefault);
        }
    }
    for (int i = 0; i < n; i++) {
        if (!sec[i].used) {
            memcpy(out + pos, in + sec[i].ofs, sec[i].len);
            pos += sec[i].len;
        }
    }
    *out_len = pos;
}

/* A C_PERF_SETTINGS (0x11) payload is an 8-byte header followed by four blocks of
 * [name][NUL][10 bytes], the 10 being active, key, hold, bank, patch, rangeLow, rangeHigh,
 * slot, and two unused (same layout the TS parser reads in parsePrfData). The G2 fills that
 * slot byte with its own unit-specific numbering — 0a 0b 0c 0d on the unit this was captured
 * from — where every .prf2 on disk holds 00 01 02 03. Delphi refuses to write the field at all
 * for that reason (BVE.NMG2File.pas:11779, "First G2 gives 1..4, second G2 gives 5..8..?").
 * A payload that runs out before four blocks are seen is left as-is. */
void perf_settings_normalize_slots(uint8_t *data, size_t len) {
    size_t ofs = 8;
    for (uint8_t slot = 0; slot < 4; slot++) {
        /* The name field holds at most 16 characters and is NUL-terminated only when it is
         * shorter than that — the same convention parse_name above reads. A 16-character name
         * (seen on real hardware: "185stepsequencer") is followed immediately by the 10 bytes,
         * so scanning for a NUL swallows the first of them and shifts the rest of the payload. */
        size_t n = 0;
        while (n < 16 && ofs + n < len && data[ofs + n]) n++;
        ofs += n;
        if (n < 16) ofs++;  /* skip the terminator */
        if (ofs + 10 > len) return;
        data[ofs + 7] = slot;
        ofs += 10;
    }
}

int parse_location_str(const char *s) {
    if (s && strcmp(s, "va") == 0)    return 1;
    if (s && strcmp(s, "patch") == 0) return 2;
    return 0;
}

/* Decode a hex string into a newly-allocated byte array.
 * Returns the number of bytes, or -1 on allocation failure. Caller must free *out. */
int hex_to_bytes(const char *hex, uint8_t **out) {
    *out = NULL;
    if (!hex) return -1;
    int nbytes = (int)(strlen(hex) / 2);
    *out = malloc(nbytes);
    if (!*out) return -1;
    for (int i = 0; i < nbytes; i++) {
        char buf[3] = { hex[i*2], hex[i*2+1], 0 };
        (*out)[i] = (uint8_t)strtol(buf, NULL, 16);
    }
    return nbytes;
}

static const char b64_alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static int b64_val(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

char *base64_encode(const uint8_t *data, size_t len) {
    if (!data && len > 0) return NULL;
    size_t out_len = 4 * ((len + 2) / 3);
    char *out = malloc(out_len + 1);
    if (!out) return NULL;
    size_t i = 0, j = 0;
    while (i < len) {
        uint32_t a = data[i++];
        uint32_t b = i < len ? data[i++] : 0;
        uint32_t c = i < len ? data[i++] : 0;
        uint32_t triple = (a << 16) | (b << 8) | c;
        out[j++] = b64_alphabet[(triple >> 18) & 0x3F];
        out[j++] = b64_alphabet[(triple >> 12) & 0x3F];
        out[j++] = b64_alphabet[(triple >> 6) & 0x3F];
        out[j++] = b64_alphabet[triple & 0x3F];
    }
    size_t mod = len % 3;
    if (mod == 1) { out[out_len - 1] = '='; out[out_len - 2] = '='; }
    else if (mod == 2) { out[out_len - 1] = '='; }
    out[out_len] = '\0';
    return out;
}

int base64_decode(const char *b64, uint8_t **out) {
    *out = NULL;
    if (!b64) return -1;
    size_t len = strlen(b64);
    if (len == 0) { *out = malloc(1); return *out ? 0 : -1; }
    if (len % 4 != 0) return -1;
    size_t pad = 0;
    if (b64[len - 1] == '=') pad++;
    if (len >= 2 && b64[len - 2] == '=') pad++;
    size_t out_len = (len / 4) * 3 - pad;
    uint8_t *buf = malloc(out_len > 0 ? out_len : 1);
    if (!buf) return -1;
    size_t oi = 0;
    for (size_t i = 0; i < len; i += 4) {
        int v0 = b64_val(b64[i]);
        int v1 = b64_val(b64[i + 1]);
        int v2 = (b64[i + 2] == '=') ? 0 : b64_val(b64[i + 2]);
        int v3 = (b64[i + 3] == '=') ? 0 : b64_val(b64[i + 3]);
        if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) { free(buf); return -1; }
        uint32_t triple = ((uint32_t)v0 << 18) | ((uint32_t)v1 << 12) | ((uint32_t)v2 << 6) | (uint32_t)v3;
        if (oi < out_len) buf[oi++] = (uint8_t)((triple >> 16) & 0xFF);
        if (oi < out_len) buf[oi++] = (uint8_t)((triple >> 8) & 0xFF);
        if (oi < out_len) buf[oi++] = (uint8_t)(triple & 0xFF);
    }
    *out = buf;
    return (int)out_len;
}

int tokenize_command(char *buf, char **argv_out, int max_argc) {
    int argc = 0;
    char *p = buf;
    while (*p && argc < max_argc) {
        while (*p == ' ' || *p == '\t') p++;
        if (*p == '\0') break;
        argv_out[argc++] = p;
        while (*p && *p != ' ' && *p != '\t') p++;
        if (*p) *p++ = '\0';
    }
    return argc;
}

/* Strip the PRF2 file header (name + NUL + 0x17 + 0x00) and 2-byte CRC trailer
 * to extract the raw section data. Mirrors the logic in g2_upload_performance. */
int perf_prf2_to_sections(const uint8_t *prf2, size_t prf2_len,
                           uint8_t *sections_out, size_t *sections_len) {
    if (!prf2 || !sections_out || !sections_len) return -1;

    size_t name_end = 0;
    while (name_end < prf2_len && prf2[name_end]) name_end++;

    size_t data_offset = name_end + 3;  /* skip NUL + 0x17 + 0x00 */
    if (data_offset + 2 > prf2_len) return -1;

    size_t data_len = prf2_len - data_offset - 2;  /* exclude 2-byte CRC */
    if (*sections_len < data_len) {
        *sections_len = data_len;
        return -1;
    }

    memcpy(sections_out, prf2 + data_offset, data_len);
    *sections_len = data_len;
    return 0;
}

/* Wrap section data in a PRF2 file: [name][NUL][0x17][0x00][sections][CRC].
 * CRC covers the section bytes only. Mirrors the logic in g2_get_perf_file. */
int perf_sections_to_prf2(const char *name, const uint8_t *sections, size_t sections_len,
                           uint8_t *prf2_out, size_t *prf2_len) {
    if (!name || !sections || !prf2_out || !prf2_len) return -1;

    size_t name_len = strlen(name);
    size_t total = name_len + 3 + sections_len + 2;  /* name + NUL + 0x17 + 0x00 + data + CRC */
    if (*prf2_len < total) {
        *prf2_len = total;
        return -1;
    }

    size_t pos = 0;
    memcpy(prf2_out + pos, name, name_len); pos += name_len;
    prf2_out[pos++] = 0x00;
    prf2_out[pos++] = 0x17;
    prf2_out[pos++] = 0x00;
    memcpy(prf2_out + pos, sections, sections_len); pos += sections_len;

    uint16_t crc = calc_crc16(prf2_out + name_len + 3, (int)sections_len);
    prf2_out[pos++] = (crc >> 8) & 0xff;
    prf2_out[pos++] = crc & 0xff;

    *prf2_len = pos;
    return 0;
}

/* Wrap a PCH2 payload in a USB frame: prepend [0x01][size_hi][size_lo],
 * then append a 2-byte CRC-16/CCITT over the payload. */
int patch_pch2_to_usb(const uint8_t *pch2_data, size_t pch2_len,
                      uint8_t *usb_data, size_t *usb_len) {
    if (pch2_data == NULL || usb_data == NULL || usb_len == NULL) {
        return -1;
    }
    
    size_t required = PCH2_USB_DATA_OFFSET + pch2_len + PCH2_USB_TAIL_SIZE;
    if (*usb_len < required) {
        *usb_len = required;
        return -1;
    }

    usb_data[0] = 0x01;
    usb_data[1] = (pch2_len >> 8) & 0xff;
    usb_data[2] = pch2_len & 0xff;
    memcpy(usb_data + PCH2_USB_DATA_OFFSET, pch2_data, pch2_len);

    uint16_t crc = calc_crc16(usb_data + PCH2_USB_DATA_OFFSET, pch2_len);
    usb_data[PCH2_USB_DATA_OFFSET + pch2_len]     = (crc >> 8) & 0xff;
    usb_data[PCH2_USB_DATA_OFFSET + pch2_len + 1] = crc & 0xff;
    
    *usb_len = required;
    return 0;
}
