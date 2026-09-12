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
