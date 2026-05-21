/*
 * Test for patch format conversion (USB <-> PCH2)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/utils.h"
#include <string.h>

void test_patch_usb_to_pch2_strips_header(void) {
    /* USB frame layout: [3-byte header][payload chunk 1: 0x03..0x15)[2-byte gap][payload chunk 2: 0x17..end-2)[2-byte CRC]
     * patch_usb_to_pch2 extracts: bytes[0x03:0x15) + bytes[0x17:end-2)
     *
     * USB structure for 28-byte test data:
     * - Indices 0-2: header (3 bytes)
     * - Indices 3-20: first part (18 bytes)
     * - Indices 21-22: gap (2 bytes - skipped)
     * - Indices 23-25: second part (3 bytes: second_part = 28 - 0x17 - 2 = 3)
     * - Indices 26-27: trailer (2 bytes)
     *
     * Total expected: 18 + 3 = 21 bytes
     */
    uint8_t usb_data[28] = {
        /* 0-2: header (3 bytes) */
        0x01, 0x08, 0x04,
        /* 3-20: first part - 18 bytes */
        0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00, 0x3a, 0x17,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
        /* 21-22: gap (2 bytes - skipped in extraction) */
        0x99, 0x9a,
        /* 23-25: second part - 3 bytes */
        0xa5, 0xb6, 0xc7,
        /* 26-27: trailer (2 bytes) */
        0xff, 0xfe
    };
    size_t usb_len = sizeof(usb_data);  /* 28 bytes */
    
    uint8_t pch2_data[32] = {0};
    size_t pch2_len = sizeof(pch2_data);
    
    int result = patch_usb_to_pch2(usb_data, usb_len, pch2_data, &pch2_len);
    
    /* Expected: 18 bytes (indices 3-20) + 3 bytes (indices 23-25) = 21 bytes */
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(21, pch2_len);
    /* First part: indices 3-20 */
    TEST_ASSERT_EQUAL_UINT8(0x50, pch2_data[0]);
    TEST_ASSERT_EQUAL_UINT8(0x69, pch2_data[1]);
    TEST_ASSERT_EQUAL_UINT8(0x61, pch2_data[2]);
    TEST_ASSERT_EQUAL_UINT8(0x6e, pch2_data[3]);
    TEST_ASSERT_EQUAL_UINT8(0x6f, pch2_data[4]);
    TEST_ASSERT_EQUAL_UINT8(0x00, pch2_data[5]);
    TEST_ASSERT_EQUAL_UINT8(0x3a, pch2_data[6]);
    TEST_ASSERT_EQUAL_UINT8(0x17, pch2_data[7]);
    /* Second part: indices 23-25 */
    TEST_ASSERT_EQUAL_UINT8(0xa5, pch2_data[18]);
    TEST_ASSERT_EQUAL_UINT8(0xb6, pch2_data[19]);
    TEST_ASSERT_EQUAL_UINT8(0xc7, pch2_data[20]);
}

void test_patch_usb_to_pch2_strips_trailer(void) {
    /* USB frame layout: [3-byte header][payload chunk 1: 0x03..0x15)[2-byte gap][payload chunk 2: 0x17..end-2)[2-byte CRC]
     * patch_usb_to_pch2 extracts: bytes[0x03:0x15) + bytes[0x17:end-2)
     *
     * USB structure for 30-byte example:
     * - Indices 0-2: header (3 bytes)
     * - Indices 3-20: first part (18 bytes)  
     * - Indices 21-22: gap (2 bytes - skipped by using 0x17 start)
     * - Indices 23-27: second part (5 bytes)
     * - Indices 28-29: trailer (2 bytes)
     *
     * Extraction: bytes[0x03:0x15) + bytes[0x17:end-2)
     * = indices 3-20 (18 bytes) + indices 23-27 (5 bytes)
     * = 23 bytes total
     */
    uint8_t usb_data[30] = {
        /* 0-2: header (3 bytes) */
        0x01, 0x02, 0x03,
        /* 3-20: first part - 18 bytes */
        0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
        0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21,
        /* 21-22: gap (2 bytes - skipped) */
        0x99, 0x9a,
        /* 23-27: second part - 5 bytes */
        0xa0, 0xa1, 0xa2, 0xa3, 0xa4,
        /* 28-29: trailer (2 bytes) */
        0xff, 0xfe
    };
    size_t usb_len = sizeof(usb_data);
    
    uint8_t pch2_data[32] = {0};
    size_t pch2_len = sizeof(pch2_data);
    
    int result = patch_usb_to_pch2(usb_data, usb_len, pch2_data, &pch2_len);
    
    /* Expected: 18 bytes (3-20) + 5 bytes (23-27) = 23 bytes */
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(23, pch2_len);
    /* First part: indices 3-20 = 0x10, 0x11, ..., 0x21 */
    TEST_ASSERT_EQUAL_UINT8(0x10, pch2_data[0]);
    TEST_ASSERT_EQUAL_UINT8(0x11, pch2_data[1]);
    TEST_ASSERT_EQUAL_UINT8(0x21, pch2_data[17]);
    /* Second part: indices 23-27 = 0xa0, 0xa1, 0xa2, 0xa3, 0xa4 */
    TEST_ASSERT_EQUAL_UINT8(0xa0, pch2_data[18]);
    TEST_ASSERT_EQUAL_UINT8(0xa1, pch2_data[19]);
    TEST_ASSERT_EQUAL_UINT8(0xa2, pch2_data[20]);
    TEST_ASSERT_EQUAL_UINT8(0xa3, pch2_data[21]);
    TEST_ASSERT_EQUAL_UINT8(0xa4, pch2_data[22]);
}

void test_patch_pch2_to_usb_adds_header_and_trailer(void) {
    uint8_t pch2_data[] = {0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00};  /* "Piano\0" */
    size_t pch2_len = 6;
    uint8_t usb_data[16] = {0};
    size_t usb_len = sizeof(usb_data);
    
    int result = patch_pch2_to_usb(pch2_data, pch2_len, usb_data, &usb_len);
    
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(11, usb_len);  /* 6 + 5 = 11 */
    TEST_ASSERT_EQUAL_UINT8(0x01, usb_data[0]);  /* Header */
    TEST_ASSERT_EQUAL_UINT8(0x00, usb_data[1]);  /* Length high */
    TEST_ASSERT_EQUAL_UINT8(0x06, usb_data[2]);  /* Length low = 6 */
    TEST_ASSERT_EQUAL_UINT8(0x50, usb_data[3]);  /* Data start */
    TEST_ASSERT_EQUAL_UINT8(0x69, usb_data[4]);
    /* Last 2 bytes are CRC */
}

void test_patch_roundtrip_conversion(void) {
    /* Full USB data format for receiving from G2 uses the two-part extraction:
     * data[0x03:0x15] + data[0x17:-2]
     * 
     * USB structure (28 bytes for this test):
     * - Indices 0-2: header (3 bytes)
     * - Indices 3-20: first part of patch data (18 bytes)
     * - Indices 21-22: gap (2 bytes - skipped)
     * - Indices 23-25: second part of patch data (3 bytes)
     * - Indices 26-27: trailer/CRC (2 bytes)
     */
    uint8_t original[28] = {
        /* 0-2: header (3 bytes) */
        0x01, 0x08, 0x04,
        /* 3-20: first part - 18 bytes */
        0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00, 0x3a, 0x17,
        0x26, 0x4d, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
        /* 21-22: gap (2 bytes - skipped in extraction) */
        0x99, 0x9a,
        /* 23-25: second part - 3 bytes */
        0xa5, 0xb6, 0xc7,
        /* 26-27: trailer (2 bytes) */
        0xff, 0xfe
    };
    size_t original_len = sizeof(original);
    
    /* Convert USB -> PCH2 */
    uint8_t pch2_data[32] = {0};
    size_t pch2_len = sizeof(pch2_data);
    int result = patch_usb_to_pch2(original, original_len, pch2_data, &pch2_len);
    
    /* Expected: 18 bytes (3-20) + 3 bytes (23-25) = 21 bytes */
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(21, pch2_len);
    
    /* Verify PCH2 data: first part */
    TEST_ASSERT_EQUAL_UINT8(0x50, pch2_data[0]);
    TEST_ASSERT_EQUAL_UINT8(0x69, pch2_data[1]);
    TEST_ASSERT_EQUAL_UINT8(0x61, pch2_data[2]);
    TEST_ASSERT_EQUAL_UINT8(0x6e, pch2_data[3]);
    TEST_ASSERT_EQUAL_UINT8(0x6f, pch2_data[4]);
    
    /* Verify PCH2 data: second part */
    TEST_ASSERT_EQUAL_UINT8(0xa5, pch2_data[18]);
    TEST_ASSERT_EQUAL_UINT8(0xb6, pch2_data[19]);
    TEST_ASSERT_EQUAL_UINT8(0xc7, pch2_data[20]);
    
    /* Convert PCH2 -> USB */
    uint8_t usb_data[32] = {0};
    size_t usb_len = sizeof(usb_data);
    result = patch_pch2_to_usb(pch2_data, pch2_len, usb_data, &usb_len);
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(26, usb_len);  /* 3 + 21 + 2 = 26 */
    
    /* Verify USB structure is correct */
    TEST_ASSERT_EQUAL_UINT8(0x01, usb_data[0]);  /* Header marker */
    TEST_ASSERT_EQUAL_UINT8(0x00, usb_data[1]);  /* Length high */
    TEST_ASSERT_EQUAL_UINT8(0x15, usb_data[2]);  /* Length low = 21 */
    TEST_ASSERT_EQUAL_UINT8(0x50, usb_data[3]);  /* Data start */
    TEST_ASSERT_EQUAL_UINT8(0x69, usb_data[4]);
}

void test_patch_usb_to_pch2_buffer_too_small(void) {
    /* Full USB format with 28 bytes:
     * - Indices 0-2: header (3 bytes)
     * - Indices 3-20: first part (18 bytes)
     * - Indices 21-22: gap (2 bytes - skipped in extraction)
     * - Indices 23-25: second part (3 bytes: second_part = 28 - 0x17 - 2 = 3)
     * - Indices 26-27: trailer (2 bytes)
     */
    uint8_t usb_data[28] = {
        /* 0-2: header */
        0x01, 0x00, 0x10,
        /* 3-20: first part - 18 bytes */
        0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00, 0x3a, 0x17,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
        /* 21-22: gap */
        0x99, 0x9a,
        /* 23-25: second part - 3 bytes */
        0xa5, 0xb6, 0xc7,
        /* 26-27: trailer */
        0xff, 0xfe
    };
    uint8_t pch2_data[4] = {0};  /* Too small - need 21 bytes but only 4 */
    size_t pch2_len = sizeof(pch2_data);
    
    int result = patch_usb_to_pch2(usb_data, sizeof(usb_data), pch2_data, &pch2_len);
    
    TEST_ASSERT_EQUAL_INT(-1, result);
    TEST_ASSERT_EQUAL_INT(21, pch2_len);  /* Should report required size: 18 + 3 */
}

void test_patch_pch2_to_usb_buffer_too_small(void) {
    uint8_t pch2_data[] = {0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00};
    size_t pch2_len = 6;
    uint8_t usb_data[8] = {0};  /* Need 11 bytes but only 8 */
    size_t usb_len = sizeof(usb_data);
    
    int result = patch_pch2_to_usb(pch2_data, pch2_len, usb_data, &usb_len);
    
    TEST_ASSERT_EQUAL_INT(-1, result);
    TEST_ASSERT_EQUAL_INT(11, usb_len);  /* Should report required size */
}

void test_patch_usb_to_pch2_null_inputs(void) {
    uint8_t usb_data[28] = {
        0x01, 0x00, 0x10,
        0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00, 0x3a, 0x17,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
        0x99, 0x9a,
        0xa5, 0xb6, 0xc7,
        0xff, 0xfe
    };
    uint8_t pch2_data[16] = {0};
    size_t pch2_len = 16;
    
    TEST_ASSERT_EQUAL_INT(-1, patch_usb_to_pch2(NULL, 28, pch2_data, &pch2_len));
    TEST_ASSERT_EQUAL_INT(-1, patch_usb_to_pch2(usb_data, 28, NULL, &pch2_len));
    TEST_ASSERT_EQUAL_INT(-1, patch_usb_to_pch2(usb_data, 28, pch2_data, NULL));
}

void test_patch_pch2_to_usb_null_inputs(void) {
    uint8_t pch2_data[] = {0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00};
    uint8_t usb_data[16] = {0};
    size_t usb_len = 16;
    
    TEST_ASSERT_EQUAL_INT(-1, patch_pch2_to_usb(NULL, 6, usb_data, &usb_len));
    TEST_ASSERT_EQUAL_INT(-1, patch_pch2_to_usb(pch2_data, 6, NULL, &usb_len));
    TEST_ASSERT_EQUAL_INT(-1, patch_pch2_to_usb(pch2_data, 6, usb_data, NULL));
}

void test_patch_usb_to_pch2_data_too_short(void) {
    uint8_t usb_data[] = {0x01, 0x02};  /* Less than minimum 5 bytes */
    uint8_t pch2_data[16] = {0};
    size_t pch2_len = 16;
    
    int result = patch_usb_to_pch2(usb_data, sizeof(usb_data), pch2_data, &pch2_len);
    
    TEST_ASSERT_EQUAL_INT(-1, result);  /* Should fail due to usb_len < 5 */
}

void test_perf_roundtrip_conversion(void) {
    const char *perf_name = "TestPerf";
    uint8_t sections[] = { 0x11, 0x00, 0x03, 0xAA, 0xBB, 0xCC };
    size_t sections_len = sizeof(sections);

    /* Step 1: assemble prf2 */
    uint8_t prf2_buf[64] = {0};
    size_t prf2_len = sizeof(prf2_buf);
    int result = perf_sections_to_prf2(perf_name, sections, sections_len, prf2_buf, &prf2_len);
    TEST_ASSERT_EQUAL_INT(0, result);
    /* "TestPerf"(8) + NUL(1) + 0x17(1) + 0x00(1) + 6 sections + 2 CRC = 19 */
    TEST_ASSERT_EQUAL_INT(19, prf2_len);
    TEST_ASSERT_EQUAL_UINT8('T',  prf2_buf[0]);
    TEST_ASSERT_EQUAL_UINT8(0x00, prf2_buf[8]);   /* NUL terminator */
    TEST_ASSERT_EQUAL_UINT8(0x17, prf2_buf[9]);   /* magic marker */
    TEST_ASSERT_EQUAL_UINT8(0x00, prf2_buf[10]);  /* padding */
    TEST_ASSERT_EQUAL_UINT8(0x11, prf2_buf[11]);  /* first section byte */

    /* Step 2: extract sections */
    uint8_t extracted[32] = {0};
    size_t extracted_len = sizeof(extracted);
    result = perf_prf2_to_sections(prf2_buf, prf2_len, extracted, &extracted_len);
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(sections_len, extracted_len);
    TEST_ASSERT_EQUAL_MEMORY(sections, extracted, sections_len);

    /* Step 3: reassemble and verify exact match with original prf2 */
    uint8_t reassembled[64] = {0};
    size_t reassembled_len = sizeof(reassembled);
    result = perf_sections_to_prf2(perf_name, extracted, extracted_len, reassembled, &reassembled_len);
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(prf2_len, reassembled_len);
    TEST_ASSERT_EQUAL_MEMORY(prf2_buf, reassembled, prf2_len);
}

void test_patch_usb_to_pch2_exact_size(void) {
    /* USB data with 28 bytes - extraction gives 21 bytes (18 + 3)
     * This test verifies exact buffer size works
     */
    uint8_t usb_data[28] = {
        /* 0-2: header */
        0x01, 0x00, 0x01,
        /* 3-20: first part - 18 bytes */
        0x50, 0x69, 0x61, 0x6e, 0x6f, 0x00, 0x3a, 0x17,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
        /* 21-22: gap */
        0x99, 0x9a,
        /* 23-25: second part - 3 bytes */
        0xa5, 0xb6, 0xc7,
        /* 26-27: trailer */
        0xff, 0xfe
    };
    uint8_t pch2_data[21] = {0};  /* Exact size needed: 18 + 3 = 21 */
    size_t pch2_len = sizeof(pch2_data);
    
    int result = patch_usb_to_pch2(usb_data, sizeof(usb_data), pch2_data, &pch2_len);
    
    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(21, pch2_len);
    TEST_ASSERT_EQUAL_UINT8(0x50, pch2_data[0]);
    TEST_ASSERT_EQUAL_UINT8(0xa5, pch2_data[18]);
}