/*
 * G2 CLI - Integration tests requiring real G2 device
 * These tests assume the G2 is connected via USB
 *
 * Note: Tests run sequentially with delay between each.
 *       Only 3-4 tests to stay within G2 hardware timing limits (~10 commands).
 *
 * Usage: make test-integration
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"
#include "../include/defs.h"
#include <string.h>
#include <unistd.h>

static int suite_initialized = 0;

static void ensure_connected(void) {
    if (!suite_initialized) {
        g2_init();
        suite_initialized = 1;
    }
    if (!g2_is_connected()) {
        TEST_ASSERT_TRUE(g2_connect_silent() >= 0);
    }
    TEST_ASSERT_TRUE(g2_is_connected());
}

static void delay_between_tests(void) {
    usleep(300000);
}

void test_integration_connect(void) {
    ensure_connected();
    delay_between_tests();
}

void test_integration_get_patch_slot_a(void) {
    ensure_connected();
    TEST_ASSERT_TRUE(g2_get_patch("A", OUTPUT_JSON) >= 0);
    delay_between_tests();
}

void test_integration_list_all(void) {
    ensure_connected();
    TEST_ASSERT_TRUE(g2_list(OUTPUT_JSON, LIST_FILTER_ALL, 0) >= 0);
    delay_between_tests();
}

void test_integration_select_slot_a(void) {
    ensure_connected();
    TEST_ASSERT_TRUE(g2_select_slot("A") >= 0);
}