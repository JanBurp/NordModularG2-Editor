/*
 * Unit tests for g2_set_param_label parameter validation (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_set_param_label_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(-1, 0, 1, 0, 0, "Gate"));
}

void test_set_param_label_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(4, 0, 1, 0, 0, "Gate"));
}

void test_set_param_label_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 2, 1, 0, 0, "Gate"));
}

void test_set_param_label_invalid_label_idx(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 0, 1, 0, 128, "Gate"));
}

void test_set_param_label_null_label(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 0, 1, 0, 0, NULL));
}

void test_set_param_label_empty_label(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 0, 1, 0, 0, ""));
}
