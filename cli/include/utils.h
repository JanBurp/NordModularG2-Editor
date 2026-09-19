/*
 * G2 CLI - Utility functions
 */

#ifndef __G2_UTILS_H__
#define __G2_UTILS_H__

#include <stdint.h>
#include <stddef.h>
#include "defs.h"

uint16_t crc_iterator(int32_t seed, int32_t val);
uint16_t calc_crc16(uint8_t *buff, int length);
int parse_name(const uint8_t *data, char *buf, size_t bufsize);
slot_t parse_slot(const char *slot_str);
int parse_location_str(const char *s);
int hex_to_bytes(const char *hex, uint8_t **out);

/* Base64 encode/decode, used for byte-array command args and file buffers passed
 * over the daemon's JSON stdin/stdout protocol (much smaller on the wire than a
 * JSON array of decimal numbers). decode returns the decoded length or -1 on a
 * malformed input; caller frees *out on success. encode returns a malloc'd,
 * NUL-terminated string, or NULL on allocation failure. */
int base64_decode(const char *b64, uint8_t **out);
char *base64_encode(const uint8_t *data, size_t len);

/* Extra bytes patch_slot_sections_canonical may add (an inserted C_CURRENT_NOTE_2 chunk) —
 * size the output buffer as in_len + this. */
#define PCH2_CANONICAL_GROWTH 12

/* Rewrites one slot's section train into the canonical chunk order a .prf2/.pch2 uses, which is
 * NOT the order GET_PATCH answers in. Required before a captured slot can go into a file that is
 * meant to be uploadable again — the G2 rejects a performance whose slots deviate. */
void patch_slot_sections_canonical(const uint8_t *in, size_t in_len,
                                   uint8_t *out, size_t *out_len);

/* Rewrites the slot index inside a captured C_PERF_SETTINGS (0x11) payload to the 0-3 a file
 * uses. The device reports its own unit-specific numbering instead, which a .prf2 must not
 * carry. Edits in place. */
void perf_settings_normalize_slots(uint8_t *data, size_t len);

/* Patch format conversion (USB <-> PCH2) */
int patch_usb_to_pch2(const uint8_t *usb_data, size_t usb_len,
                      uint8_t *pch2_data, size_t *pch2_len);
int patch_pch2_to_usb(const uint8_t *pch2_data, size_t pch2_len,
                      uint8_t *usb_data, size_t *usb_len);

/* Performance format conversion (PRF2 file <-> section data) */
int perf_prf2_to_sections(const uint8_t *prf2, size_t prf2_len,
                           uint8_t *sections_out, size_t *sections_len);
int perf_sections_to_prf2(const char *name, const uint8_t *sections, size_t sections_len,
                           uint8_t *prf2_out, size_t *prf2_len);

/*
 * Split a whitespace-delimited command string into tokens in-place.
 * Writes pointers into argv_out and NUL-terminates each token in buf.
 * Returns the number of tokens found (capped at max_argc).
 */
int tokenize_command(char *buf, char **argv_out, int max_argc);

#endif /* __G2_UTILS_H__ */
