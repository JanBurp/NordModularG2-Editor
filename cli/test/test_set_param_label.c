/*
 * Unit tests for g2_set_param_label parameter validation (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

static const char *one_label[] = {"Gate"};

void test_set_param_label_invalid_slot_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(-1, 0, 1, 0, 1, one_label));
}

void test_set_param_label_invalid_slot_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(4, 0, 1, 0, 1, one_label));
}

void test_set_param_label_invalid_location(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 2, 1, 0, 1, one_label));
}

void test_set_param_label_invalid_label_idx(void) {
    /* num_labels > 128 is out of range */
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 0, 1, 0, 129, one_label));
}

void test_set_param_label_null_label(void) {
    /* num_labels == 0 is invalid */
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 0, 1, 0, 0, one_label));
}

void test_set_param_label_empty_label(void) {
    /* negative num_labels is invalid */
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_param_label(0, 0, 1, 0, -1, one_label));
}
