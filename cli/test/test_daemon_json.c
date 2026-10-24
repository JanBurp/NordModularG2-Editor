/*
 * Unit tests for the daemon's JSON request/response helpers and utils.c parsers (no USB required).
 */

#include "unity.h"
#include "unity_internals.h"
#include "cJSON.h"
#include "../include/daemon.h"
#include "../include/utils.h"
#include "../include/g2_device.h"
#include <stdlib.h>
#include <string.h>

void test_daemon_parse_valid_json(void) {
    cJSON *r = daemon_parse_request("{\"id\":7,\"cmd\":\"slot\",\"args\":[\"A\"]}");
    TEST_ASSERT_NOT_NULL(r);
    TEST_ASSERT_EQUAL_INT(7, cJSON_GetObjectItem(r, "id")->valueint);
    TEST_ASSERT_EQUAL_STRING("slot", cJSON_GetObjectItem(r, "cmd")->valuestring);
    cJSON_Delete(r);
}

void test_daemon_parse_bad_json(void) {
    TEST_ASSERT_NULL(daemon_parse_request("{\"id\":7,"));
}

void test_daemon_parse_null_input(void) {
    TEST_ASSERT_NULL(daemon_parse_request(NULL));
}

void test_daemon_make_ok_with_id(void) {
    cJSON *id = cJSON_CreateNumber(7);
    cJSON *r = daemon_make_ok(id);
    TEST_ASSERT_EQUAL_INT(7, cJSON_GetObjectItem(r, "id")->valueint);
    TEST_ASSERT_TRUE(cJSON_IsTrue(cJSON_GetObjectItem(r, "ok")));
    cJSON_Delete(r);
    cJSON_Delete(id);
}

void test_daemon_make_ok_without_id(void) {
    cJSON *r = daemon_make_ok(NULL);
    TEST_ASSERT_NULL(cJSON_GetObjectItem(r, "id"));
    TEST_ASSERT_TRUE(cJSON_IsTrue(cJSON_GetObjectItem(r, "ok")));
    cJSON_Delete(r);
}

void test_daemon_make_error_with_id(void) {
    cJSON *id = cJSON_CreateString("x1");
    cJSON *r = daemon_make_error(id, G2_ERR_INVALID_PARAM);
    TEST_ASSERT_EQUAL_STRING("x1", cJSON_GetObjectItem(r, "id")->valuestring);
    TEST_ASSERT_TRUE(cJSON_IsFalse(cJSON_GetObjectItem(r, "ok")));
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, cJSON_GetObjectItem(r, "code")->valueint);
    TEST_ASSERT_EQUAL_STRING(g2_error_string(G2_ERR_INVALID_PARAM), cJSON_GetObjectItem(r, "error")->valuestring);
    cJSON_Delete(r);
    cJSON_Delete(id);
}

void test_daemon_make_error_without_id(void) {
    cJSON *r = daemon_make_error(NULL, G2_ERR_INVALID_PARAM);
    TEST_ASSERT_NULL(cJSON_GetObjectItem(r, "id"));
    TEST_ASSERT_TRUE(cJSON_IsFalse(cJSON_GetObjectItem(r, "ok")));
    cJSON_Delete(r);
}

/* "va" = 1, "patch" = 2, anything else (incl. "fx" and NULL) = 0. */
void test_parse_location_str(void) {
    TEST_ASSERT_EQUAL_INT(0, parse_location_str("fx"));
    TEST_ASSERT_EQUAL_INT(1, parse_location_str("va"));
    TEST_ASSERT_EQUAL_INT(2, parse_location_str("patch"));
    TEST_ASSERT_EQUAL_INT(0, parse_location_str(NULL));
}

/* Lengths 0..5 cover no padding, one '=' and two '='. */
void test_base64_roundtrip(void) {
    const uint8_t data[] = {0x00, 0xff, 0x21, 0x80, 0x7f};
    for (size_t n = 0; n <= sizeof(data); n++) {
        char *enc = base64_encode(data, n);
        TEST_ASSERT_NOT_NULL(enc);
        uint8_t *dec = NULL;
        TEST_ASSERT_EQUAL_INT((int)n, base64_decode(enc, &dec));
        if (n) TEST_ASSERT_EQUAL_HEX8_ARRAY(data, dec, n);
        free(enc);
        free(dec);
    }
}

void test_base64_known_value(void) {
    char *enc = base64_encode((const uint8_t *)"G2!", 3);
    TEST_ASSERT_EQUAL_STRING("RzIh", enc);
    free(enc);
}

void test_base64_decode_rejects_bad_input(void) {
    uint8_t *dec = NULL;
    TEST_ASSERT_EQUAL_INT(-1, base64_decode("abc", &dec));   /* not a multiple of 4 */
    TEST_ASSERT_EQUAL_INT(-1, base64_decode("ab!d", &dec));  /* invalid character */
    TEST_ASSERT_EQUAL_INT(-1, base64_decode(NULL, &dec));
}
