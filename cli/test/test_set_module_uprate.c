/*
 * Unit tests for g2_set_module_uprate parameter validation and payload layout (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_set_module_uprate_invalid_slot(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_uprate(4, 1, 5, 1));
}

void test_set_module_uprate_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_uprate(0, 2, 5, 1));
}

void test_set_module_uprate_invalid_value(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_uprate(0, 1, 5, 2));
}

/* Byte layout of S_SET_MODULE_UPRATE (0x2A), as the reference CMModuleABCode::WriteStream writes it:
 * location, module index, bandwidth (1 = audio rate). */
void test_set_module_uprate_payload_layout(void) {
    uint8_t buf[4] = {0}; G2Op op;
    g2_build_set_module_uprate_op(&op, buf, 1, 5, 1);
    const uint8_t want[3] = {1, 5, 1};
    TEST_ASSERT_EQUAL_HEX8(0x2a, op.cmd);
    TEST_ASSERT_EQUAL_INT(3, op.len);
    TEST_ASSERT_EQUAL_HEX8_ARRAY(want, op.payload, 3);
}
