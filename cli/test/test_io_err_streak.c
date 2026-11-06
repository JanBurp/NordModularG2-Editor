/*
 * g2_io_err_streak: when a run of USB IO/PIPE errors on the interrupt endpoint counts as a lost G2.
 * A healthy G2 on macOS gives short runs now and then; reconnecting on the first one wedged the G2
 * (2026-11-02), so only a long, uninterrupted run may trigger a reconnect.
 */

#include "unity.h"
#include "unity_internals.h"
#include <libusb.h>
#include "../include/g2_io.h"

void test_io_err_streak_needs_count_and_time(void) {
    g2_io_err_streak_t s = {0};
    long long t = 1000;
    /* Many errors in no time: count alone is not enough. */
    for (int i = 0; i < G2_IO_ERR_MIN_COUNT + 5; i++) TEST_ASSERT_EQUAL_INT(0, g2_io_err_streak(&s, LIBUSB_ERROR_IO, t));
    /* Long enough, and the count is already there: lost. */
    TEST_ASSERT_EQUAL_INT(1, g2_io_err_streak(&s, LIBUSB_ERROR_PIPE, t + G2_IO_ERR_MIN_MS));

    /* Long in time but few errors: not lost. */
    g2_io_err_streak_t s2 = {0};
    TEST_ASSERT_EQUAL_INT(0, g2_io_err_streak(&s2, LIBUSB_ERROR_IO, t));
    TEST_ASSERT_EQUAL_INT(0, g2_io_err_streak(&s2, LIBUSB_ERROR_IO, t + 10 * (long long)G2_IO_ERR_MIN_MS));
}

void test_io_err_streak_reset_by_read_or_timeout(void) {
    g2_io_err_streak_t s = {0};
    long long t = 0;
    for (int i = 0; i < G2_IO_ERR_MIN_COUNT - 1; i++) g2_io_err_streak(&s, LIBUSB_ERROR_IO, t);
    TEST_ASSERT_EQUAL_INT(0, g2_io_err_streak(&s, 16, t + 1));                    /* a read */
    TEST_ASSERT_EQUAL_INT(0, s.count);
    for (int i = 0; i < G2_IO_ERR_MIN_COUNT - 1; i++) g2_io_err_streak(&s, LIBUSB_ERROR_IO, t + 2);
    TEST_ASSERT_EQUAL_INT(0, g2_io_err_streak(&s, LIBUSB_ERROR_TIMEOUT, t + 3));  /* endpoint answered */
    TEST_ASSERT_EQUAL_INT(0, s.count);
    /* Other errors (e.g. OVERFLOW) are not part of a run either. */
    g2_io_err_streak(&s, LIBUSB_ERROR_IO, t + 4);
    TEST_ASSERT_EQUAL_INT(0, g2_io_err_streak(&s, LIBUSB_ERROR_OVERFLOW, t + 5));
    TEST_ASSERT_EQUAL_INT(0, s.count);
}
