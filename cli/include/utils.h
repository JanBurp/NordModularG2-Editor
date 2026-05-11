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

/* Patch format conversion (USB <-> PCH2) */
int patch_usb_to_pch2(const uint8_t *usb_data, size_t usb_len,
                      uint8_t *pch2_data, size_t *pch2_len);
int patch_pch2_to_usb(const uint8_t *pch2_data, size_t pch2_len,
                      uint8_t *usb_data, size_t *usb_len);

/*
 * Split a whitespace-delimited command string into tokens in-place.
 * Writes pointers into argv_out and NUL-terminates each token in buf.
 * Returns the number of tokens found (capped at max_argc).
 */
int tokenize_command(char *buf, char **argv_out, int max_argc);

#endif /* __G2_UTILS_H__ */
