/*
 * G2 CLI - Test header for parsing functions
 * This header can be used in tests without requiring libusb
 */

#ifndef __G2_PARSE_TEST_H__
#define __G2_PARSE_TEST_H__

#include <stdint.h>
#include <stddef.h>
#include "../include/cJSON.h"
#include "../include/defs.h"

cJSON* g2_parse_settings(const uint8_t *bulkData, size_t bulkSize,
                         const uint8_t *perfData, size_t perfSize);

#endif /* __G2_PARSE_TEST_H__ */
