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
