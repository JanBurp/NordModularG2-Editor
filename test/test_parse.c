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
    TEST_ASSERT_EQUAL_INT(-1, parse_slot("X"));
    TEST_ASSERT_EQUAL_INT(-1, parse_slot(""));
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

void test_parse_name_stops_at_non_printable(void) {
    uint8_t data[] = "Test\xffMore";
    char buf[32] = {0};
    int len = parse_name(data, buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("Test", buf);
    TEST_ASSERT_EQUAL_INT(4, len);
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
