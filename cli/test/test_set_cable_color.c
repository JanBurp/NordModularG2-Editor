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

/* Byte layout of S_CABLE_COLOR (0x54), as the reference editor writes it: 5 bytes, location and
 * color packed in the first. Output connector first (an in->out cable gets swapped). */
void test_set_cable_color_payload_layout(void) {
    uint8_t buf[8] = {0}; G2Op op;
    g2_build_set_cable_color_op(&op, buf, 1, 3, 32, 0, 1, 30, 1, 0); /* va, orange, in 1 of #32 <- out 0 of #30 */
    const uint8_t want[5] = {(1 << 3) | 3, 30, (1 << 6) | 0, 32, (0 << 6) | 1};
    TEST_ASSERT_EQUAL_HEX8(0x54, op.cmd);
    TEST_ASSERT_EQUAL_INT(5, op.len);
    TEST_ASSERT_EQUAL_HEX8_ARRAY(want, op.payload, 5);
}
