/*
 * Unit tests for send-bank's source parsing (.pchList / folder scan) and
 * the flash-dump-raw-data write frame layout. No hardware required.
 */

#include "unity.h"
#include "../include/g2_device.h"
#include "../include/utils.h"
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#define TMP_DIR "/tmp/g2-bank-source-test"

static void write_file(const char *path, const char *contents) {
    FILE *f = fopen(path, "wb");
    TEST_ASSERT_NOT_NULL(f);
    if (contents) fwrite(contents, 1, strlen(contents), f);
    fclose(f);
}

static void make_dir(const char *path) {
    mkdir(path, 0755); /* ignore EEXIST */
}

/* ---- parse_pchlist ---------------------------------------------------- */

void test_parse_pchlist_well_formed_returns_entries(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/list1");
    write_file(TMP_DIR "/list1/001_Alpha.pch2", "x");
    write_file(TMP_DIR "/list1/002_Beta.pch2", "x");
    write_file(TMP_DIR "/list1/list1.pchList",
               "Version=Nord Modular G2 Bank Dump\n"
               "7:1: Alpha\n"
               "7:2: Beta\n");

    bank_entry_t entries[128];
    int n = parse_pchlist(TMP_DIR "/list1/list1.pchList", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(2, n);
    TEST_ASSERT_EQUAL_INT(1, entries[0].location);
    TEST_ASSERT_EQUAL_STRING(TMP_DIR "/list1/001_Alpha.pch2", entries[0].filepath);
    TEST_ASSERT_EQUAL_INT(2, entries[1].location);
    TEST_ASSERT_EQUAL_STRING(TMP_DIR "/list1/002_Beta.pch2", entries[1].filepath);
}

void test_parse_pchlist_skips_out_of_range_location(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/list2");
    write_file(TMP_DIR "/list2/001_Alpha.pch2", "x");
    write_file(TMP_DIR "/list2/list2.pchList",
               "Version=Nord Modular G2 Bank Dump\n"
               "7:1: Alpha\n"
               "7:200: OutOfRange\n");

    bank_entry_t entries[128];
    int n = parse_pchlist(TMP_DIR "/list2/list2.pchList", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(1, n);
    TEST_ASSERT_EQUAL_INT(1, entries[0].location);
}

void test_parse_pchlist_skips_missing_sibling_file(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/list3");
    write_file(TMP_DIR "/list3/list3.pchList",
               "Version=Nord Modular G2 Bank Dump\n"
               "7:1: NeverWritten\n");

    bank_entry_t entries[128];
    int n = parse_pchlist(TMP_DIR "/list3/list3.pchList", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(0, n);
}

void test_parse_pchlist_missing_file_returns_negative_one(void) {
    bank_entry_t entries[128];
    int n = parse_pchlist(TMP_DIR "/does-not-exist.pchList", 0, entries, 128);
    TEST_ASSERT_EQUAL_INT(-1, n);
}

/* Not every .pchList producer follows get-bank's own "%03d_<name>.<ext>"
 * sibling-file convention - a real Nord Modular G2 bank dump (confirmed
 * against a real fixture 2026-09-14) writes the name WITH its extension
 * already, no location prefix at all. This must resolve too. */
void test_parse_pchlist_resolves_name_with_extension_and_no_prefix(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/list4");
    write_file(TMP_DIR "/list4/O-CoasT.pch2", "x");
    write_file(TMP_DIR "/list4/list4.pchList",
               "Version=Nord Modular G2 Bank Dump\n"
               "1:1: O-CoasT.pch2\n");

    bank_entry_t entries[128];
    int n = parse_pchlist(TMP_DIR "/list4/list4.pchList", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(1, n);
    TEST_ASSERT_EQUAL_INT(1, entries[0].location);
    TEST_ASSERT_EQUAL_STRING(TMP_DIR "/list4/O-CoasT.pch2", entries[0].filepath);
}

/* ---- scan_bank_folder --------------------------------------------------- */

void test_scan_bank_folder_accepts_nnn_prefix(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/folder1");
    write_file(TMP_DIR "/folder1/001_Alpha.pch2", "x");
    write_file(TMP_DIR "/folder1/042_Beta.pch2", "x");

    bank_entry_t entries[128];
    int n = scan_bank_folder(TMP_DIR "/folder1", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(2, n);
}

void test_scan_bank_folder_rejects_missing_prefix(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/folder2");
    write_file(TMP_DIR "/folder2/001_Alpha.pch2", "x");
    write_file(TMP_DIR "/folder2/NoPrefix.pch2", "x");

    bank_entry_t entries[128];
    int n = scan_bank_folder(TMP_DIR "/folder2", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(1, n);
    TEST_ASSERT_EQUAL_STRING(TMP_DIR "/folder2/001_Alpha.pch2", entries[0].filepath);
}

void test_scan_bank_folder_ignores_other_type_extension(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/folder3");
    write_file(TMP_DIR "/folder3/001_Alpha.pch2", "x");
    write_file(TMP_DIR "/folder3/002_Beta.prf2", "x");

    bank_entry_t entries[128];
    int n = scan_bank_folder(TMP_DIR "/folder3", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(1, n);
}

void test_scan_bank_folder_rejects_duplicate_location(void) {
    make_dir(TMP_DIR);
    make_dir(TMP_DIR "/folder4");
    write_file(TMP_DIR "/folder4/001_Alpha.pch2", "x");
    write_file(TMP_DIR "/folder4/001_AlphaAgain.pch2", "x");

    bank_entry_t entries[128];
    int n = scan_bank_folder(TMP_DIR "/folder4", 0, entries, 128);

    TEST_ASSERT_EQUAL_INT(-1, n);
}

void test_scan_bank_folder_missing_folder_returns_negative_one(void) {
    bank_entry_t entries[128];
    int n = scan_bank_folder(TMP_DIR "/does-not-exist", 0, entries, 128);
    TEST_ASSERT_EQUAL_INT(-1, n);
}

/* ---- build_flash_dump_raw_frame ----------------------------------------- */

void test_build_flash_dump_raw_frame_byte_layout(void) {
    /* file_data is a .pch2/.prf2 body: [0x00][version][type][sections][file CRC].
     * Layout below is the real one, captured from a G2 sending the same message
     * back for bank 1 location 1 (see build_flash_dump_raw_frame's comment). */
    uint8_t file_data[6] = { 0x00, 0x17, 0x00, 0xAA, 0x47, 0x21 };
    uint8_t out[64] = {0};

    int len = build_flash_dump_raw_frame(0, 6, 2, "Foo", file_data, sizeof(file_data), out, sizeof(out));

    TEST_ASSERT_EQUAL_INT(2 + 4 + 3 + 4 + 2 + 1 + 6 + 2, len);   /* 24 */
    TEST_ASSERT_EQUAL_UINT8(0x00, out[0]);
    TEST_ASSERT_EQUAL_UINT8(24, out[1]);               /* length field (self-inclusive) */
    TEST_ASSERT_EQUAL_UINT8(0x01, out[2]);
    TEST_ASSERT_EQUAL_UINT8(0x2c, out[3]);             /* COMMAND_REQ | COMMAND_SYS */
    TEST_ASSERT_EQUAL_UINT8(0x41, out[4]);
    TEST_ASSERT_EQUAL_UINT8(0x19, out[5]);
    TEST_ASSERT_EQUAL_UINT8(0, out[6]);                /* type */
    TEST_ASSERT_EQUAL_UINT8(6, out[7]);                /* bank0 */
    TEST_ASSERT_EQUAL_UINT8(2, out[8]);                /* location0 */
    TEST_ASSERT_EQUAL_UINT8('F', out[9]);
    TEST_ASSERT_EQUAL_UINT8('o', out[10]);
    TEST_ASSERT_EQUAL_UINT8('o', out[11]);
    TEST_ASSERT_EQUAL_UINT8(0x00, out[12]);            /* name terminator, NOT 16-byte padding */
    TEST_ASSERT_EQUAL_UINT8(0x00, out[13]);            /* size hi */
    TEST_ASSERT_EQUAL_UINT8(0x06, out[14]);            /* size lo = whole file body */
    TEST_ASSERT_EQUAL_UINT8(0x17, out[15]);            /* version, taken from file_data[1] */
    TEST_ASSERT_EQUAL_UINT8(0x00, out[16]);            /* file body copied verbatim */
    TEST_ASSERT_EQUAL_UINT8(0x17, out[17]);
    TEST_ASSERT_EQUAL_UINT8(0x00, out[18]);
    TEST_ASSERT_EQUAL_UINT8(0xAA, out[19]);
    TEST_ASSERT_EQUAL_UINT8(0x47, out[20]);
    TEST_ASSERT_EQUAL_UINT8(0x21, out[21]);

    /* The CRC covers exactly the bytes it was computed over inside the
     * function - re-derive it from the returned buffer and confirm it
     * matches what was appended, without hand-computing CRC-16/CCITT. */
    uint16_t expected_crc = calc_crc16(&out[2], 20);
    TEST_ASSERT_EQUAL_UINT8((expected_crc >> 8) & 0xff, out[22]);
    TEST_ASSERT_EQUAL_UINT8(expected_crc & 0xff, out[23]);
}

/* A 16-char name fills the whole field with NO terminator - captured from real
 * hardware (bank 2 location 12, "MonsterLeads NL2"), and the same convention
 * parse_name/perf_settings_normalize_slots already read. Getting this wrong
 * shifts every field after the name by one byte. */
void test_build_flash_dump_raw_frame_16_char_name_has_no_terminator(void) {
    uint8_t file_data[4] = { 0x00, 0x13, 0x00, 0xAA };
    uint8_t out[64] = {0};

    int len = build_flash_dump_raw_frame(0, 1, 11, "MonsterLeads NL2", file_data, sizeof(file_data), out, sizeof(out));

    TEST_ASSERT_EQUAL_INT(2 + 4 + 3 + 16 + 2 + 1 + 4 + 2, len);
    TEST_ASSERT_EQUAL_UINT8('2', out[24]);             /* last name char, no NUL after it */
    TEST_ASSERT_EQUAL_UINT8(0x00, out[25]);            /* size hi */
    TEST_ASSERT_EQUAL_UINT8(0x04, out[26]);            /* size lo */
    TEST_ASSERT_EQUAL_UINT8(0x13, out[27]);            /* version, from file_data[1] */
    TEST_ASSERT_EQUAL_UINT8(0x00, out[28]);            /* body starts here */
}

/* A 15-char name (one short of the field) still gets its NUL terminator, so
 * the size/version/data fields stay where the device expects them. */
void test_build_flash_dump_raw_frame_long_name_is_nul_terminated(void) {
    uint8_t file_data[4] = { 0x00, 0x17, 0x00, 0xAA };
    uint8_t out[64] = {0};

    int len = build_flash_dump_raw_frame(0, 0, 0, "185stepsequence", file_data, sizeof(file_data), out, sizeof(out));

    TEST_ASSERT_EQUAL_INT(2 + 4 + 3 + 16 + 2 + 1 + 4 + 2, len);
    TEST_ASSERT_EQUAL_UINT8('e', out[23]);             /* last name char */
    TEST_ASSERT_EQUAL_UINT8(0x00, out[24]);            /* terminator */
    TEST_ASSERT_EQUAL_UINT8(0x00, out[25]);            /* size hi */
    TEST_ASSERT_EQUAL_UINT8(0x04, out[26]);            /* size lo */
    TEST_ASSERT_EQUAL_UINT8(0x17, out[27]);            /* version */
}

void test_build_flash_dump_raw_frame_buffer_too_small(void) {
    uint8_t file_data[6] = { 0x00, 0x17, 0x00, 0xAA, 0x47, 0x21 };
    uint8_t out[23] = {0}; /* needs 24 */

    int len = build_flash_dump_raw_frame(0, 6, 2, "Foo", file_data, sizeof(file_data), out, sizeof(out));

    TEST_ASSERT_EQUAL_INT(-1, len);
}
