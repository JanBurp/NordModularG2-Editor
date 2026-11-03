/*
 * Test for patch format conversion (USB <-> PCH2)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/utils.h"
#include <string.h>

/* Old .pch2/.prf2 files (v19, v22 in test-patches/) are sent unconverted, with a warning. */
void test_pch2_old_file_version(void) {
    const uint8_t v19[] = {'X', 0x00, 19, 0x00, 0x21};
    const uint8_t v23[] = {'X', 0x00, 0x17, 0x01, 0x21};
    const uint8_t noVersion[] = {'X', 'Y', 0x00};
    TEST_ASSERT_EQUAL_INT(19, pch2_old_file_version(v19, sizeof(v19)));
    TEST_ASSERT_EQUAL_INT(0, pch2_old_file_version(v23, sizeof(v23)));
    TEST_ASSERT_EQUAL_INT(0, pch2_old_file_version(noVersion, sizeof(noVersion)));
}

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

void test_patch_usb_to_pch2_skips_gap(void) {
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

void test_patch_usb_to_pch2_data_too_short(void) {
    uint8_t usb_data[] = {0x01, 0x02};  /* Less than minimum 5 bytes */
    uint8_t pch2_data[16] = {0};
    size_t pch2_len = 16;
    
    int result = patch_usb_to_pch2(usb_data, sizeof(usb_data), pch2_data, &pch2_len);
    
    TEST_ASSERT_EQUAL_INT(-1, result);  /* Should fail due to usb_len < 5 */
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
/* ---- patch_slot_sections_canonical ---------------------------------------
 * GET_PATCH answers with 0x5a before 0x5b and no 0x69 at all, but a .prf2/.pch2
 * must carry the canonical order or the G2 rejects the performance on upload. */

/* Builds a [id][hi][lo][payload...] section into buf, returns bytes written. */
static size_t put_section(uint8_t *buf, uint8_t id, uint8_t fill, size_t payload_len) {
    buf[0] = id;
    buf[1] = (uint8_t)((payload_len >> 8) & 0xff);
    buf[2] = (uint8_t)(payload_len & 0xff);
    memset(buf + 3, fill, payload_len);
    return 3 + payload_len;
}

/* Collects the section ids of a train into ids[], returns the count. */
static int section_ids(const uint8_t *b, size_t len, uint8_t *ids, int max) {
    int n = 0;
    size_t ofs = 0;
    while (ofs + 3 <= len && n < max) {
        size_t siz = ((size_t)b[ofs + 1] << 8) | b[ofs + 2];
        if (ofs + 3 + siz > len) break;
        ids[n++] = b[ofs];
        ofs += 3 + siz;
    }
    return n;
}

void test_slot_sections_canonical_reorders_hardware_train(void) {
    /* Exactly what GET_PATCH returns: 0x5a pair before the 0x5b trio, no 0x69. */
    uint8_t in[256];
    size_t n = 0;
    const uint8_t hw[] = {0x21, 0x4a, 0x4a, 0x52, 0x52, 0x4d, 0x4d, 0x4d,
                          0x65, 0x62, 0x60, 0x5a, 0x5a, 0x5b, 0x5b, 0x5b};
    for (size_t i = 0; i < sizeof(hw); i++) n += put_section(in + n, hw[i], (uint8_t)i, 2);

    uint8_t out[256 + PCH2_CANONICAL_GROWTH] = {0};
    size_t out_len = 0;
    patch_slot_sections_canonical(in, n, out, &out_len);

    /* A 0x69 is inserted, so the train grows by exactly one chunk. */
    TEST_ASSERT_EQUAL_INT(n + PCH2_CANONICAL_GROWTH, out_len);

    uint8_t ids[64];
    int count = section_ids(out, out_len, ids, 64);
    const uint8_t want[] = {0x21, 0x4a, 0x4a, 0x69, 0x52, 0x52, 0x4d, 0x4d, 0x4d,
                            0x65, 0x62, 0x60, 0x5b, 0x5b, 0x5b, 0x5a, 0x5a};
    TEST_ASSERT_EQUAL_INT((int)sizeof(want), count);
    TEST_ASSERT_EQUAL_UINT8_ARRAY(want, ids, (int)sizeof(want));
}

void test_slot_sections_canonical_preserves_repeated_id_order(void) {
    /* The three 0x5b must keep their relative order (morph-first), not be shuffled. */
    uint8_t in[256];
    size_t n = 0;
    n += put_section(in + n, 0x21, 0x11, 2);
    n += put_section(in + n, 0x5b, 0xAA, 2);   /* first 0x5b  */
    n += put_section(in + n, 0x5b, 0xBB, 2);   /* second 0x5b */
    n += put_section(in + n, 0x5b, 0xCC, 2);   /* third 0x5b  */

    uint8_t out[256 + PCH2_CANONICAL_GROWTH] = {0};
    size_t out_len = 0;
    patch_slot_sections_canonical(in, n, out, &out_len);

    /* 0x21, then the inserted 0x69, then the three 0x5b in their original order. */
    TEST_ASSERT_EQUAL_UINT8(0x21, out[0]);
    TEST_ASSERT_EQUAL_UINT8(0x69, out[5]);
    TEST_ASSERT_EQUAL_UINT8(0xAA, out[5 + PCH2_CANONICAL_GROWTH + 3]);
    TEST_ASSERT_EQUAL_UINT8(0xBB, out[5 + PCH2_CANONICAL_GROWTH + 8]);
    TEST_ASSERT_EQUAL_UINT8(0xCC, out[5 + PCH2_CANONICAL_GROWTH + 13]);
}

void test_slot_sections_canonical_keeps_existing_current_note(void) {
    /* An input that already has a 0x69 must not gain a second one. */
    uint8_t in[256];
    size_t n = 0;
    n += put_section(in + n, 0x21, 0x11, 2);
    n += put_section(in + n, 0x69, 0x77, 4);

    uint8_t out[256 + PCH2_CANONICAL_GROWTH] = {0};
    size_t out_len = 0;
    patch_slot_sections_canonical(in, n, out, &out_len);

    TEST_ASSERT_EQUAL_INT(n, out_len);            /* nothing inserted */
    TEST_ASSERT_EQUAL_UINT8(0x69, out[5]);
    TEST_ASSERT_EQUAL_UINT8(0x77, out[8]);        /* the original payload survived */
}

void test_slot_sections_canonical_copies_malformed_train_verbatim(void) {
    /* A section whose length runs past the buffer must not be reshuffled. */
    uint8_t in[8] = {0x21, 0xff, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05};
    uint8_t out[8 + PCH2_CANONICAL_GROWTH] = {0};
    size_t out_len = 0;

    patch_slot_sections_canonical(in, sizeof(in), out, &out_len);

    TEST_ASSERT_EQUAL_INT(sizeof(in), out_len);
    TEST_ASSERT_EQUAL_UINT8_ARRAY(in, out, sizeof(in));
}

void test_pch2_file_from_sections_header_and_crc(void) {
    const uint8_t sections[] = { 0x21, 0x00, 0x03, 1, 2, 3, 0x6f, 0x00, 0x01, 'x' };
    uint8_t out[256] = {0};
    size_t out_len = sizeof(out);
    TEST_ASSERT_EQUAL_INT(0, pch2_file_from_sections(sections, sizeof(sections), out, &out_len));

    /* 0x69 is filled in after 0x21; the existing 0x6f closes the slot, no second one. */
    size_t hl = strlen(PCH2_TEXT_HEADER);
    size_t body = sizeof(sections) + PCH2_CANONICAL_GROWTH;
    TEST_ASSERT_EQUAL_INT(hl + 3 + body + 2, out_len);
    TEST_ASSERT_EQUAL_MEMORY(PCH2_TEXT_HEADER, out, hl);
    TEST_ASSERT_EQUAL_UINT8(0x00, out[hl]);
    TEST_ASSERT_EQUAL_UINT8(0x17, out[hl + 1]);
    TEST_ASSERT_EQUAL_UINT8(0x00, out[hl + 2]);
    TEST_ASSERT_EQUAL_MEMORY(sections, out + hl + 3, 6);
    TEST_ASSERT_EQUAL_UINT8(0x69, out[hl + 3 + 6]);
    TEST_ASSERT_EQUAL_MEMORY(sections + 6, out + hl + 3 + 6 + PCH2_CANONICAL_GROWTH, 4);

    /* CRC covers [0x17][0x00][sections] and is the last 2 bytes, big-endian. */
    uint16_t crc = calc_crc16(out + hl + 1, (int)(body + 2));
    TEST_ASSERT_EQUAL_UINT8(crc >> 8,   out[out_len - 2]);
    TEST_ASSERT_EQUAL_UINT8(crc & 0xff, out[out_len - 1]);
}

void test_pch2_file_from_sections_buffer_too_small(void) {
    const uint8_t sections[] = { 0x21, 0x00, 0x01, 7 };
    uint8_t out[8] = {0};
    size_t out_len = sizeof(out);
    TEST_ASSERT_EQUAL_INT(-1, pch2_file_from_sections(sections, sizeof(sections), out, &out_len));
    /* On failure out_len reports the required size: + the inserted 0x69 and closing 0x6f. */
    TEST_ASSERT_EQUAL_INT(strlen(PCH2_TEXT_HEADER) + 3 + sizeof(sections) + PCH2_CANONICAL_GROWTH + 3 + 2, out_len);
}

/* get-patch-file: GET_PATCH order (0x5a before 0x5b, no 0x69, no 0x6f) is written in the official
 * order 21 4a 4a 69 52 52 4d 4d 4d 65 62 60 5b 5b 5b 5a 5a 6f (CPatchFile_13::WriteMolecules). */
void test_pch2_file_from_sections_official_order(void) {
    static const uint8_t ids[] = { 0x21, 0x4a, 0x4a, 0x52, 0x52, 0x4d, 0x4d, 0x4d, 0x65, 0x62, 0x60,
                                   0x5a, 0x5a, 0x5b, 0x5b, 0x5b };
    static const uint8_t expected[] = { 0x21, 0x4a, 0x4a, 0x69, 0x52, 0x52, 0x4d, 0x4d, 0x4d, 0x65,
                                        0x62, 0x60, 0x5b, 0x5b, 0x5b, 0x5a, 0x5a, 0x6f };
    uint8_t sections[sizeof(ids) * 4];
    for (size_t i = 0; i < sizeof(ids); i++) {
        sections[i * 4] = ids[i]; sections[i * 4 + 1] = 0; sections[i * 4 + 2] = 1; sections[i * 4 + 3] = (uint8_t)i;
    }
    uint8_t out[512] = {0};
    size_t out_len = sizeof(out);
    TEST_ASSERT_EQUAL_INT(0, pch2_file_from_sections(sections, sizeof(sections), out, &out_len));

    size_t ofs = strlen(PCH2_TEXT_HEADER) + 3;
    for (size_t k = 0; k < sizeof(expected); k++) {
        TEST_ASSERT_TRUE(ofs + 3 <= out_len - 2);
        TEST_ASSERT_EQUAL_HEX8(expected[k], out[ofs]);
        ofs += 3 + (((size_t)out[ofs + 1] << 8) | out[ofs + 2]);
    }
    TEST_ASSERT_EQUAL_INT(out_len - 2, ofs);  /* nothing after the 0x6f but the CRC */
}
