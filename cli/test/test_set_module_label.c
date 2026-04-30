/*
 * Unit tests for g2_set_module_label parameter validation (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_set_module_label_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_label(-1, 0, 5, "Test"));
}

void test_set_module_label_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_label(4, 0, 5, "Test"));
}

void test_set_module_label_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_label(0, 2, 5, "Test"));
}

void test_set_module_label_null_label(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_label(0, 0, 5, NULL));
}

void test_set_module_label_empty_label(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_label(0, 0, 5, ""));
}
