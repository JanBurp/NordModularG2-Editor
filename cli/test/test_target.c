/*
 * G2 CLI - g2_set_target unit test
 *
 * No hardware needed: just verifies the bus/device target state g2_connect()/
 * g2_connect_silent() consult is stored and reset correctly.
 */

#include "unity.h"
#include "../include/g2_io.h"
#include "../include/g2_device.h"
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

/* Bus 250 / device 250 is as implausible for a real attached USB device as
 * index 99 is above — same "no environment plausibly has this" reasoning, so
 * this is deterministic without hardware. Proves g2_connect_silent() can tell
 * "a specific target was set but not found" (G2_ERR_TARGET_NOT_FOUND) apart
 * from the generic "nothing attached at all" (G2_ERR_NOT_FOUND, untested here
 * since that path depends on no G2 being attached to the test machine at
 * all — not an assumption any other unit test in this suite makes). The
 * TOCTOU race itself (a device present at enumeration but gone by open time)
 * is not exercised: g2_open_target() is static and this codebase has no
 * libusb mock/injection seam to simulate it. */
void test_g2_connect_target_set_not_found_is_distinguishable(void) {
    TEST_ASSERT_EQUAL_INT(0, libusb_init(&g2.ctx));
    g2_set_target(250, 250);
    TEST_ASSERT_EQUAL_INT(G2_ERR_TARGET_NOT_FOUND, g2_connect_silent());
    TEST_ASSERT_EQUAL_INT(0, g2_target_last_seen);
    g2_set_target(0, 0);
    libusb_exit(g2.ctx);
    g2.ctx = NULL;
}
