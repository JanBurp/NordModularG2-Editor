/*
 * Unit tests for the add-module message builder (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/defs.h"
#include "../include/g2_device.h"

/* Index 128 is NACKed by the G2 and a follow-up add/cable on it wedges the device, so the
 * builder must refuse it before anything is sent. */
void test_build_add_module_rejects_out_of_range_index(void) {
    uint8_t buf[512]; G2Op op;
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_build_add_module_op(&op, buf, 1, 97, 0, 0, 0, 0, 0, NULL, "OscA1"));
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_build_add_module_op(&op, buf, 1, 97, G2_MAX_MODULE_INDEX + 1, 0, 0, 0, 0, NULL, "OscA1"));
    TEST_ASSERT_TRUE(g2_build_add_module_op(&op, buf, 1, 97, G2_MAX_MODULE_INDEX, 0, 0, 0, 0, NULL, "OscA1") > 0);
    TEST_ASSERT_EQUAL_UINT8(G2_MAX_MODULE_INDEX, buf[2]);
}

void test_build_add_module_allows_fx_in_only_in_fx(void) {
    uint8_t buf[512]; G2Op op;
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_build_add_module_op(&op, buf, 1, G2_MODULE_TYPE_FX_IN, 1, 0, 0, 0, 0, NULL, "Fx-In1"));
    TEST_ASSERT_TRUE(g2_build_add_module_op(&op, buf, 0, G2_MODULE_TYPE_FX_IN, 1, 0, 0, 0, 0, NULL, "Fx-In1") > 0);
}

void test_add_module_rejects_index_128_without_usb(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_add_module(0, 1, 97, 128, 0, 0, 0, 0, NULL, 0, NULL, "OscA1"));
}
