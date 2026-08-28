/*
 * Unit tests for g2_assign_knob / g2_deassign_knob / g2_select_param_page parameter validation
 * (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_assign_knob_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(-1, 0, 1, 1, 0));
}

void test_assign_knob_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(4, 0, 1, 1, 0));
}

void test_assign_knob_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 2, 1, 1, 0));
}

void test_assign_knob_invalid_module_id_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, -1, 1, 0));
}

void test_assign_knob_invalid_module_id_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 256, 1, 0));
}

void test_assign_knob_invalid_param_idx_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, -1, 0));
}

void test_assign_knob_invalid_param_idx_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, 256, 0));
}

void test_assign_knob_invalid_slot_index_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, 1, -1));
}

void test_assign_knob_invalid_slot_index_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_assign_knob(0, 0, 1, 1, 120));
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
