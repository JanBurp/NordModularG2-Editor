/*
 * Unit tests for g2_assign_knob / g2_deassign_knob / g2_select_param_page parameter validation
 * (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_assign_knob_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(-1, 0, 1, 1, 0, 0));
}

void test_assign_knob_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(4, 0, 1, 1, 0, 0));
}

void test_assign_knob_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 2, 1, 1, 0, 0));
}

void test_assign_knob_invalid_module_id_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, -1, 1, 0, 0));
}

void test_assign_knob_invalid_module_id_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 256, 1, 0, 0));
}

void test_assign_knob_invalid_param_idx_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, -1, 0, 0));
}

void test_assign_knob_invalid_param_idx_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, 256, 0, 0));
}

void test_assign_knob_invalid_slot_index_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, 1, -1, 0));
}

void test_assign_knob_invalid_slot_index_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, 1, 120, 0));
}

void test_assign_knob_invalid_is_led(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, 1, 0, 2));
}

void test_assign_knob_op_led_bit(void) {
    uint8_t buf[5]; G2Op op;
    g2_build_assign_knob_op(&op, buf, 1, 7, 3, 9, 0);
    TEST_ASSERT_EQUAL_UINT8(0x40, buf[2]);
    g2_build_assign_knob_op(&op, buf, 1, 7, 3, 9, 1);
    TEST_ASSERT_EQUAL_UINT8(0x50, buf[2]);
    TEST_ASSERT_EQUAL_UINT8(7, buf[0]); TEST_ASSERT_EQUAL_UINT8(3, buf[1]); TEST_ASSERT_EQUAL_UINT8(9, buf[4]);
}

void test_deassign_knob_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_knob(-1, 0));
}

void test_deassign_knob_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_knob(4, 0));
}

void test_deassign_knob_invalid_slot_index_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_knob(0, -1));
}

void test_deassign_knob_invalid_slot_index_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_knob(0, 120));
}

void test_select_param_page_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param_page(-1, 0));
}

void test_select_param_page_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param_page(4, 0));
}

void test_select_param_page_invalid_page_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param_page(0, -1));
}

/* 15 = page 5 / bank 0, one past page E — the device's own decoder drops it silently */
void test_select_param_page_invalid_page_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_param_page(0, 15));
}

/*
 * Global Parameter Pages siblings — g2_assign_global_knob / g2_deassign_global_knob /
 * g2_select_global_page. Mirrors the per-patch tests above, plus target_slot validation.
 */

void test_assign_global_knob_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(-1, 0, 0, 1, 1, 0));
}

void test_assign_global_knob_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(4, 0, 0, 1, 1, 0));
}

void test_assign_global_knob_invalid_target_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, -1, 0, 1, 1, 0));
}

void test_assign_global_knob_invalid_target_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 4, 0, 1, 1, 0));
}

void test_assign_global_knob_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 0, 2, 1, 1, 0));
}

void test_assign_global_knob_invalid_module_id_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 0, 0, -1, 1, 0));
}

void test_assign_global_knob_invalid_module_id_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 0, 0, 256, 1, 0));
}

void test_assign_global_knob_invalid_param_idx_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 0, 0, 1, -1, 0));
}

void test_assign_global_knob_invalid_param_idx_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 0, 0, 1, 256, 0));
}

void test_assign_global_knob_invalid_slot_index_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 0, 0, 1, 1, -1));
}

void test_assign_global_knob_invalid_slot_index_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_global_knob(0, 0, 0, 1, 1, 120));
}

void test_deassign_global_knob_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_global_knob(-1, 0));
}

void test_deassign_global_knob_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_global_knob(4, 0));
}

void test_deassign_global_knob_invalid_slot_index_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_global_knob(0, -1));
}

void test_deassign_global_knob_invalid_slot_index_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_deassign_global_knob(0, 120));
}

void test_select_global_page_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_global_page(-1, 0));
}

void test_select_global_page_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_global_page(4, 0));
}

void test_select_global_page_invalid_page_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_global_page(0, -1));
}

void test_select_global_page_invalid_page_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_select_global_page(0, 15));
}

/* g2_get_global_knobs() is now niladic (system-wide, no slot — see g2_device.c) and requires a
 * live USB connection to exercise meaningfully, so there's no param-validation path left to unit
 * test offline, unlike the slot-scoped functions above. */
