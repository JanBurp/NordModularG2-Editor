/*
 * Test for get-patch name parsing
 * Tests name extraction from EMBEDDED and EXTENDED USB responses
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/utils.h"
#include "../include/cJSON.h"
#include <string.h>

/*
 * EMBEDDED response format (slots B, C, D):
 * Raw interrupt response: [length_hi:4 | type:4, data..., crc_hi, crc_lo]
 * Type 0x02 = EMBEDDED
 * Name starts at offset 5
 * 
 * Example from slot B: e2 01 09 04 27 4f 2d 43 6f 61 73 54 00 dd ae 00
 * - type = 0x02 (EMBEDDED)
 * - name = "O-CoasT" starting at index 5
 */

/*
 * EXTENDED response format (slot A):
 * Interrupt response: [length_hi:4 | type:4, size:2, ...]
 * Type 0x01 = EXTENDED, requires recv_bulk to get data
 * 
 * Bulk data: 01 08 04 27 50 69 61 6e 6f 26 4d 69 63 00 3a 17
 * - name = "Piano&Mic" starting at index 4
 */

void test_parse_name_from_embedded_response_slot_b(void) {
    /* Slot B embedded response: e2 01 09 04 27 4f 2d 43 6f 61 73 54 00 dd ae 00 */
    uint8_t embedded_resp[16] = {
        0xe2, 0x01, 0x09, 0x04, 0x27,  /* header */
        0x4f, 0x2d, 0x43, 0x6f, 0x61, 0x73, 0x54, 0x00,  /* name "O-CoasT" */
        0xdd, 0xae, 0x00  /* CRC + padding */
    };
    
    char name[32] = {0};
    parse_name(embedded_resp + 5, name, sizeof(name));
    
    TEST_ASSERT_EQUAL_STRING("O-CoasT", name);
}

void test_parse_name_from_embedded_response_slot_c(void) {
    /* Slot C embedded response: c2 01 0a 04 27 4c 79 72 61 34 00 e6 1c 00 00 00 */
    uint8_t embedded_resp[16] = {
        0xc2, 0x01, 0x0a, 0x04, 0x27,  /* header */
        0x4c, 0x79, 0x72, 0x61, 0x34, 0x00,  /* name "Lyra4" */
        0xe6, 0x1c, 0x00, 0x00, 0x00  /* CRC + padding */
    };
    
    char name[32] = {0};
    parse_name(embedded_resp + 5, name, sizeof(name));
    
    TEST_ASSERT_EQUAL_STRING("Lyra4", name);
}

void test_parse_name_from_embedded_response_slot_d(void) {
    /* Slot D embedded response: b2 01 0b 04 27 45 52 20 31 00 1b 0d 00 00 00 00 */
    uint8_t embedded_resp[16] = {
        0xb2, 0x01, 0x0b, 0x04, 0x27,  /* header */
        0x45, 0x52, 0x20, 0x31, 0x00,  /* name "ER 1" */
        0x1b, 0x0d, 0x00, 0x00, 0x00, 0x00  /* CRC + padding */
    };
    
    char name[32] = {0};
    parse_name(embedded_resp + 5, name, sizeof(name));
    
    TEST_ASSERT_EQUAL_STRING("ER 1", name);
}

void test_parse_name_from_extended_response_slot_a(void) {
    /* Slot A extended response bulk data: 01 08 04 27 50 69 61 6e 6f 26 4d 69 63 00 3a 17 */
    uint8_t bulk_data[16] = {
        0x01, 0x08, 0x04, 0x27,  /* header */
        0x50, 0x69, 0x61, 0x6e, 0x6f, 0x26, 0x4d, 0x69, 0x63, 0x00,  /* name "Piano&Mic" */
        0x3a, 0x17  /* CRC */
    };
    
    char name[32] = {0};
    parse_name(bulk_data + 4, name, sizeof(name));
    
    TEST_ASSERT_EQUAL_STRING("Piano&Mic", name);
}

void test_parse_name_with_ampersand(void) {
    /* Test name with & character */
    uint8_t data[16] = {
        0x50, 0x69, 0x61, 0x6e, 0x6f, 0x26, 0x4d, 0x69, 0x63, 0x00  /* "Piano&Mic" */
    };
    
    char name[32] = {0};
    parse_name(data, name, sizeof(name));
    
    TEST_ASSERT_EQUAL_STRING("Piano&Mic", name);
}

void test_parse_name_with_special_chars(void) {
    /* Test name with hyphen and space */
    uint8_t data[16] = {
        0x4f, 0x2d, 0x43, 0x6f, 0x61, 0x73, 0x54, 0x00  /* "O-CoasT" */
    };
    
    char name[32] = {0};
    parse_name(data, name, sizeof(name));
    
    TEST_ASSERT_EQUAL_STRING("O-CoasT", name);
}

void test_parse_name_truncation_at_buffer_size(void) {
    /* Test that parsing respects buffer size */
    uint8_t data[32] = {
        0x54, 0x68, 0x69, 0x73, 0x49, 0x73, 0x41, 0x4c, 0x6f, 0x6e, 0x67, 0x4e, 0x61, 0x6d, 0x65, 0x00
    }; /* "ThisIsALongName" */
    
    char buf[10] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    
    /* Buffer is 10 bytes, loop runs i = 0 to bufsize-2 = 8 (9 iterations)
     * Copies 9 chars: T h i s I s A L o
     * Then buf[9] = '\0'
     * Returns 9 (number of chars copied before hitting buffer limit) */
    TEST_ASSERT_EQUAL_INT(9, len);
    TEST_ASSERT_EQUAL_STRING("ThisIsALo", buf);
}

void test_parse_name_returns_correct_length(void) {
    /* Test that parse_name returns correct length including null */
    uint8_t data[16] = {
        0x4c, 0x79, 0x72, 0x61, 0x34, 0x00  /* "Lyra4" */
    };
    
    char name[32] = {0};
    int len = parse_name(data, name, sizeof(name));
    
    TEST_ASSERT_EQUAL_INT(6, len);  /* "Lyra4" (5 chars) + null */
    TEST_ASSERT_EQUAL_STRING("Lyra4", name);
}

void test_response_type_parsing_embedded(void) {
    /* Test that we correctly identify EMBEDDED response type */
    uint8_t resp[16] = {0xe2, 0x01, 0x09, 0x04, 0x27, 0x4f};  /* type = 0x02 */
    uint8_t msg_type = resp[0] & 0x0f;
    
    TEST_ASSERT_EQUAL_INT(0x02, msg_type);  /* EMBEDDED */
}

void test_response_type_parsing_extended(void) {
    /* Test that we correctly identify EXTENDED response type */
    uint8_t resp[16] = {0x01, 0x00, 0x10, 0x00, 0x00};  /* type = 0x01 */
    uint8_t msg_type = resp[0] & 0x0f;
    
    TEST_ASSERT_EQUAL_INT(0x01, msg_type);  /* EXTENDED */
}