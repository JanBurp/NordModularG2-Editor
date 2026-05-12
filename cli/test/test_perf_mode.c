/*
 * Unit tests for g2_set_perf_mode and g2_set_perf_name parameter validation
 * These test only parameter validation; USB/connection tests are in integration tests.
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

void test_set_perf_mode_invalid_mode_low(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_perf_mode(-1));
}

void test_set_perf_mode_invalid_mode_high(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_perf_mode(2));
}

void test_set_perf_name_null_name(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_perf_name(NULL));
}

void test_set_perf_name_empty_name(void) {
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_perf_name(""));
}
