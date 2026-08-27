/*
 * Unit tests for g2_set_morph_range parameter validation (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_set_morph_range_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(-1, 0, 1, 1, 0, 50, 0));
}

void test_set_morph_range_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(4, 0, 1, 1, 0, 50, 0));
}

void test_set_morph_range_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(0, 2, 1, 1, 0, 50, 0));
}

void test_set_morph_range_invalid_morph_group_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(0, 0, 1, 1, -1, 50, 0));
}

void test_set_morph_range_invalid_morph_group_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(0, 0, 1, 1, 8, 50, 0));
}

void test_set_morph_range_invalid_range_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(0, 0, 1, 1, 0, -128, 0));
}

void test_set_morph_range_invalid_range_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(0, 0, 1, 1, 0, 128, 0));
}

void test_set_morph_range_invalid_variation(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_morph_range(0, 0, 1, 1, 0, 50, 9));
}
