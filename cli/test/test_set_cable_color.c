/*
 * Unit tests for g2_set_cable_color parameter validation (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_set_cable_color_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_cable_color(-1, 0, 0, 1, 1, 0, 2, 0, 0));
}

void test_set_cable_color_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_cable_color(4, 0, 0, 1, 1, 0, 2, 0, 0));
}

void test_set_cable_color_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_cable_color(0, 2, 0, 1, 1, 0, 2, 0, 0));
}

void test_set_cable_color_invalid_color_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_cable_color(0, 0, 7, 1, 1, 0, 2, 0, 0));
}

void test_set_cable_color_invalid_from_con_type(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_cable_color(0, 0, 0, 1, -1, 0, 2, 0, 0));
}

void test_set_cable_color_invalid_to_con_type(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_cable_color(0, 0, 0, 1, 1, 0, 2, -1, 0));
}
