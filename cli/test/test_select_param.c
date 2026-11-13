/*
 * Unit tests for g2_select_param / g2_select_patch / g2_select_perf parameter validation (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_select_param_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(-1, 0, 1, 1));
}

void test_select_param_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(4, 0, 1, 1));
}

void test_select_param_invalid_location_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(0, -1, 1, 1));
}

void test_select_param_invalid_location_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(0, 3, 1, 1));
}

void test_select_param_invalid_module_id_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(0, 0, -1, 1));
}

void test_select_param_invalid_module_id_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(0, 0, 256, 1));
}

void test_select_param_invalid_param_idx_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(0, 0, 1, -1));
}

void test_select_param_invalid_param_idx_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param(0, 0, 1, 256));
}

/* Bank locations run 1..128 (location 128 = byte 0x7f); the 128 case itself needs a G2, see
 * test_daemon_select_patch_location_128. */
void test_select_patch_perf_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_patch(0, 1, 0));
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_patch(0, 1, 129));
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_perf(1, 0));
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_perf(1, 129));
}
