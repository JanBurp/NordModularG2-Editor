/*
 * Unit tests for g2_upload_patch_buf/g2_upload_perf_buf parameter validation
 * and buffer parsing (no USB required).
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"
#include <string.h>

void test_upload_patch_buf_invalid_slot_low(void) {
    uint8_t data[] = { 'A', 0x00, 0x17, 0x00, 1, 2, 3, 0, 0 };
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_upload_patch_buf(-1, data, sizeof(data)));
}

void test_upload_patch_buf_invalid_slot_high(void) {
    uint8_t data[] = { 'A', 0x00, 0x17, 0x00, 1, 2, 3, 0, 0 };
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_upload_patch_buf(4, data, sizeof(data)));
}
