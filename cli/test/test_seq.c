/*
 * Tests for tokenize_command (used by the seq command in main.c)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/utils.h"
#include <string.h>

void test_tokenize_del_cable(void) {
    char buf[] = "del-cable A va 3 1 0 46 0 2";
    char *argv[16];
    int argc = tokenize_command(buf, argv, 16);
    TEST_ASSERT_EQUAL_INT(9, argc);
    TEST_ASSERT_EQUAL_STRING("del-cable", argv[0]);
    TEST_ASSERT_EQUAL_STRING("A", argv[1]);
    TEST_ASSERT_EQUAL_STRING("va", argv[2]);
    TEST_ASSERT_EQUAL_STRING("3", argv[3]);
    TEST_ASSERT_EQUAL_STRING("1", argv[4]);
    TEST_ASSERT_EQUAL_STRING("0", argv[5]);
    TEST_ASSERT_EQUAL_STRING("46", argv[6]);
    TEST_ASSERT_EQUAL_STRING("0", argv[7]);
    TEST_ASSERT_EQUAL_STRING("2", argv[8]);
}

void test_tokenize_del_module(void) {
    char buf[] = "del-module A va 3";
    char *argv[8];
    int argc = tokenize_command(buf, argv, 8);
    TEST_ASSERT_EQUAL_INT(4, argc);
    TEST_ASSERT_EQUAL_STRING("del-module", argv[0]);
    TEST_ASSERT_EQUAL_STRING("A", argv[1]);
    TEST_ASSERT_EQUAL_STRING("va", argv[2]);
    TEST_ASSERT_EQUAL_STRING("3", argv[3]);
}

void test_tokenize_empty_string(void) {
    char buf[] = "";
    char *argv[8];
    int argc = tokenize_command(buf, argv, 8);
    TEST_ASSERT_EQUAL_INT(0, argc);
}

void test_tokenize_single_token(void) {
    char buf[] = "connect";
    char *argv[8];
    int argc = tokenize_command(buf, argv, 8);
    TEST_ASSERT_EQUAL_INT(1, argc);
    TEST_ASSERT_EQUAL_STRING("connect", argv[0]);
}

void test_tokenize_extra_spaces(void) {
    char buf[] = "  del-module   A   va   3  ";
    char *argv[8];
    int argc = tokenize_command(buf, argv, 8);
    TEST_ASSERT_EQUAL_INT(4, argc);
    TEST_ASSERT_EQUAL_STRING("del-module", argv[0]);
    TEST_ASSERT_EQUAL_STRING("A", argv[1]);
    TEST_ASSERT_EQUAL_STRING("va", argv[2]);
    TEST_ASSERT_EQUAL_STRING("3", argv[3]);
}

void test_tokenize_respects_max_argc(void) {
    char buf[] = "a b c d e f";
    char *argv[3];
    int argc = tokenize_command(buf, argv, 3);
    TEST_ASSERT_EQUAL_INT(3, argc);
    TEST_ASSERT_EQUAL_STRING("a", argv[0]);
    TEST_ASSERT_EQUAL_STRING("b", argv[1]);
    TEST_ASSERT_EQUAL_STRING("c", argv[2]);
}
