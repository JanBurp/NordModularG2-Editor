/*
 * Test for bitstream functions
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/bitstream.h"
#include <string.h>

void test_bitstream_init(void) {
    uint8_t data[] = { 0x01, 0x02, 0x03, 0x04 };
    bitstream_t bs;
    bitstream_init(&bs, data, 4);
    TEST_ASSERT_EQUAL_INT(0, bitstream_tell_bit(&bs));
}

void test_bitstream_read_bits(void) {
    uint8_t data[] = { 0xAB };  /* 0b10101011 */
    bitstream_t bs;
    bitstream_init(&bs, data, 1);
    
    uint32_t val = bitstream_read_bits(&bs, 4);
    TEST_ASSERT_EQUAL_UINT32(0x0A, val);  /* First 4 bits */
}

void test_bitstream_read_bits_advanced(void) {
    uint8_t data[] = { 0xAB, 0xCD };  /* 0b10101011 11001101 */
    bitstream_t bs;
    bitstream_init(&bs, data, 2);
    
    bitstream_read_bits(&bs, 4);  /* Skip first 4 bits */
    uint32_t val = bitstream_read_bits(&bs, 8);  /* Next 8 bits */
    TEST_ASSERT_EQUAL_UINT32(0xBC, val);  /* 0b10111100 */
}

void test_bitstream_seek_bit(void) {
    uint8_t data[] = { 0xFF, 0x00 };
    bitstream_t bs;
    bitstream_init(&bs, data, 2);
    
    bitstream_seek_bit(&bs, 8);
    TEST_ASSERT_EQUAL_INT(8, bitstream_tell_bit(&bs));
}

void test_bitstream_tell_bit(void) {
    uint8_t data[] = { 0x01, 0x02 };
    bitstream_t bs;
    bitstream_init(&bs, data, 2);
    
    bitstream_read_bits(&bs, 5);
    TEST_ASSERT_EQUAL_INT(5, bitstream_tell_bit(&bs));
}

void test_bitstream_read_bits_across_bytes(void) {
    uint8_t data[] = { 0x0F, 0xF0 };  /* 0b00001111 11110000 */
    bitstream_t bs;
    bitstream_init(&bs, data, 2);
    
    uint32_t val = bitstream_read_bits(&bs, 12);  /* First 12 bits */
    TEST_ASSERT_EQUAL_UINT32(0x0FF, val);  /* 0b000011111111 */
}
