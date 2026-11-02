/*
 * Test for CRC calculation
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/utils.h"
#include <stdio.h>

void test_crc16_single_byte(void) {
    uint8_t data[] = { 0x01 };
    uint16_t crc = calc_crc16(data, 1);
    TEST_ASSERT_TRUE(crc != 0);
}

void test_crc16_two_bytes(void) {
    uint8_t data[] = { 0x01, 0x02 };
    uint16_t crc = calc_crc16(data, 2);
    TEST_ASSERT_TRUE(crc != 0);
}

void test_crc16_two_bytes_different_from_single(void) {
    uint8_t one[] = { 0x01 };
    uint8_t two[] = { 0x01, 0x02 };
    uint16_t crc1 = calc_crc16(one, 1);
    uint16_t crc2 = calc_crc16(two, 2);
    TEST_ASSERT_TRUE(crc1 != crc2);
}

void test_crc16_command_format(void) {
    uint8_t data[] = { 0x01, 0x2c, 0x41, 0x02 };
    uint16_t crc = calc_crc16(data, 4);
    TEST_ASSERT_TRUE(crc != 0);
}

void test_crc16_empty(void) {
    uint8_t data[] = { };
    uint16_t crc = calc_crc16(data, 0);
    TEST_ASSERT_EQUAL_UINT16(0, crc);
}

void test_crc_iterator_known_value(void) {
    uint16_t crc = crc_iterator(0, 0x01);
    TEST_ASSERT_UINT16_WITHIN(100, 0x1021, crc);
}

void test_crc_iterator_seed_propagation(void) {
    uint16_t crc1 = crc_iterator(0, 0x01);
    uint16_t crc2 = crc_iterator(crc1, 0x02);
    TEST_ASSERT_TRUE(crc2 != crc1);
}

/* Inbound check (g2_crc_ok, official IsUSBCheckSumOK) on messages captured from a G2 2026-11-02:
 * the embedded patch-name reply 72|01 08 01 27 00|87 d3 (data after the type byte, length nibble 7)
 * and the 0x16 list and synth-settings bulks. Any flipped bit must fail. */
static int hex_bytes(const char *hex, uint8_t *out) {
    int n = 0;
    for (; hex[0] && hex[1]; hex += 2) { unsigned v; sscanf(hex, "%2x", &v); out[n++] = (uint8_t)v; }
    return n;
}

void test_g2_crc_ok_captured_messages(void) {
    static const char *msgs[] = {
        "010801270087d3",
        "010c0313770116010103070063617431746573740000044701",
        "010c0003426c756520456e67696e650081020000000001020304108002030064000000284020000000000000000000000000000000005488",
    };
    uint8_t buf[128];
    for (size_t m = 0; m < sizeof(msgs) / sizeof(msgs[0]); m++) {
        int n = hex_bytes(msgs[m], buf);
        TEST_ASSERT_TRUE_MESSAGE(g2_crc_ok(buf, n), msgs[m]);
        for (int i = 0; i < n; i++) {
            buf[i] ^= 0x01;
            TEST_ASSERT_FALSE(g2_crc_ok(buf, n));
            buf[i] ^= 0x01;
        }
    }
    TEST_ASSERT_FALSE(g2_crc_ok(buf, 1));
}
