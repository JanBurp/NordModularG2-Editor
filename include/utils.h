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

#endif /* __G2_UTILS_H__ */
