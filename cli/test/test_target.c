/*
 * G2 CLI - g2_set_target unit test
 *
 * No hardware needed: just verifies the bus/device target state g2_connect()/
 * g2_connect_silent() consult is stored and reset correctly.
 */

#include "unity.h"
#include "../include/g2_io.h"
#include <libusb.h>

void test_g2_set_target_updates_globals(void) {
    g2_set_target(5, 7);
    TEST_ASSERT_EQUAL_INT(5, g2_target_bus);
    TEST_ASSERT_EQUAL_INT(7, g2_target_device);

    /* 0/0 restores "first G2 found" (today's default single-device behavior). */
    g2_set_target(0, 0);
    TEST_ASSERT_EQUAL_INT(0, g2_target_bus);
    TEST_ASSERT_EQUAL_INT(0, g2_target_device);
}

/* No environment plausibly has 100 attached G2 units, so this is deterministic
 * without any hardware. g2_set_target_by_index() enumerates real USB devices,
 * so it needs a real libusb context (normally owned by g2_init() in main()). */
void test_g2_set_target_by_index_out_of_range(void) {
    TEST_ASSERT_EQUAL_INT(0, libusb_init(&g2.ctx));
    TEST_ASSERT_EQUAL_INT(-1, g2_set_target_by_index(99));
    libusb_exit(g2.ctx);
    g2.ctx = NULL;
}
