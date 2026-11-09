/*
 * Test for parse_slot and parse_name utilities
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/utils.h"
#include <string.h>

void test_parse_slot_A(void) {
    TEST_ASSERT_EQUAL_INT(0, parse_slot("A"));
    TEST_ASSERT_EQUAL_INT(0, parse_slot("a"));
}

void test_parse_slot_B(void) {
    TEST_ASSERT_EQUAL_INT(1, parse_slot("B"));
    TEST_ASSERT_EQUAL_INT(1, parse_slot("b"));
}

void test_parse_slot_C(void) {
    TEST_ASSERT_EQUAL_INT(2, parse_slot("C"));
    TEST_ASSERT_EQUAL_INT(2, parse_slot("c"));
}

void test_parse_slot_D(void) {
    TEST_ASSERT_EQUAL_INT(3, parse_slot("D"));
    TEST_ASSERT_EQUAL_INT(3, parse_slot("d"));
}

void test_parse_slot_null_returns_current(void) {
    TEST_ASSERT_EQUAL_INT(-1, parse_slot(NULL));
}

void test_parse_slot_invalid_returns_current(void) {
    TEST_ASSERT_EQUAL_INT(-2, parse_slot("X"));
    TEST_ASSERT_EQUAL_INT(-2, parse_slot(""));
}

void test_parse_name_simple(void) {
    uint8_t data[5] = {'T', 'e', 's', 't', 0};
    char buf[32] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("Test", buf);
    TEST_ASSERT_EQUAL_INT(5, len);  /* includes null terminator */
}

void test_parse_name_with_null(void) {
    uint8_t data[] = "Test\0More";
    char buf[32] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("Test", buf);
    TEST_ASSERT_EQUAL_INT(5, len);  /* returns name length (4) + 1 for null if present */
}

void test_parse_name_truncates_long(void) {
    uint8_t data[] = "ThisIsAVeryLongNameThatShouldBeTruncated";
    char buf[16] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    TEST_ASSERT_EQUAL_INT(15, len);
}

void test_parse_name_keeps_non_printable(void) {
    uint8_t data[] = "Test\xffMore";
    char buf[32] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("Test?More", buf);
    TEST_ASSERT_EQUAL_INT(10, len);  /* consumed up to and including the NUL */
}

void test_parse_name_empty(void) {
    uint8_t data[] = "";
    char buf[32] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("", buf);
    TEST_ASSERT_EQUAL_INT(1, len);  /* null terminator counts as 1 */
}

void test_parse_name_only_null(void) {
    uint8_t data[] = "\0";
    char buf[32] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("", buf);
    TEST_ASSERT_EQUAL_INT(1, len);
}

/* 0x16 list reply: performances carry a category byte too (CMFlashDataDump::ReadStream). A perf
 * with category 1 used to have that byte read as LIST_JUMP, eating the next entry. */
void test_parse_list_entry_perf_category(void) {
    uint8_t data[] = {'P', 'e', 'r', 'f', 0, 0x01, 'N', 'e', 'x', 't', 0, 0x00};
    char buf[32] = {0};
    int category = -1;
    int used = parse_list_entry(data, sizeof(data), buf, sizeof(buf), &category);
    TEST_ASSERT_EQUAL_INT(6, used);
    TEST_ASSERT_EQUAL_STRING("Perf", buf);
    TEST_ASSERT_EQUAL_INT(1, category);
    used = parse_list_entry(data + 6, (int)sizeof(data) - 6, buf, sizeof(buf), &category);
    TEST_ASSERT_EQUAL_INT(6, used);
    TEST_ASSERT_EQUAL_STRING("Next", buf);
    TEST_ASSERT_EQUAL_INT(0, category);
}

void test_parse_list_entry_16_chars_and_truncated(void) {
    uint8_t data[] = "185stepsequencer\x0c";
    char buf[32] = {0};
    int category = -1;
    TEST_ASSERT_EQUAL_INT(17, parse_list_entry(data, 17, buf, sizeof(buf), &category));
    TEST_ASSERT_EQUAL_STRING("185stepsequencer", buf);
    TEST_ASSERT_EQUAL_INT(12, category);
    TEST_ASSERT_EQUAL_INT(-1, parse_list_entry(data, 16, buf, sizeof(buf), &category)); /* category byte missing */
}

/* Upload and other name fields: 16 characters go out with no NUL (official PutString, max 16); the
 * uploads used to cut names to 15 and always add a NUL. parse_name reads the field back. */
void test_put_name_field_16_char_rule(void) {
    uint8_t out[20];
    char back[32];
    memset(out, 0xAA, sizeof(out));
    TEST_ASSERT_EQUAL_INT(16, (int)put_name_field(out, "SixteenCharName1", 16));
    TEST_ASSERT_EQUAL_HEX8(0xAA, out[16]);  /* nothing written after the 16 characters */
    TEST_ASSERT_EQUAL_INT(16, parse_name(out, back, sizeof(back)));
    TEST_ASSERT_EQUAL_STRING("SixteenCharName1", back);
    memset(out, 0xAA, sizeof(out));
    TEST_ASSERT_EQUAL_INT(6, (int)put_name_field(out, "Short", 5));
    TEST_ASSERT_EQUAL_HEX8(0x00, out[5]);
    TEST_ASSERT_EQUAL_INT(6, parse_name(out, back, sizeof(back)));
    TEST_ASSERT_EQUAL_STRING("Short", back);
    TEST_ASSERT_EQUAL_INT(16, (int)put_name_field(out, "SeventeenCharName", 17));  /* clamped */
}
