/*
 * Unit tests for daemon.c helpers (no hardware required)
 */

#include <stdlib.h>
#include <string.h>
#include "unity.h"
#include "unity_internals.h"
#include "../include/daemon.h"

/* ── daemon_parse_request ────────────────────────────────────────────── */

void test_daemon_parse_valid_json(void) {
	const char *line = "{\"id\":1,\"cmd\":\"add-module\",\"args\":[\"A\",\"va\",\"2\"]}";
	cJSON *req = daemon_parse_request(line);
	TEST_ASSERT_NOT_NULL(req);
	cJSON *id = cJSON_GetObjectItem(req, "id");
	TEST_ASSERT_NOT_NULL(id);
	TEST_ASSERT_EQUAL_INT(1, (int)id->valuedouble);
	cJSON *cmd = cJSON_GetObjectItem(req, "cmd");
	TEST_ASSERT_NOT_NULL(cmd);
	TEST_ASSERT_EQUAL_STRING("add-module", cmd->valuestring);
	cJSON *args = cJSON_GetObjectItem(req, "args");
	TEST_ASSERT_NOT_NULL(args);
	TEST_ASSERT_EQUAL_INT(3, cJSON_GetArraySize(args));
	cJSON_Delete(req);
}

void test_daemon_parse_bad_json(void) {
	cJSON *req = daemon_parse_request("not json at all }{");
	TEST_ASSERT_NULL(req);
}

void test_daemon_parse_null_input(void) {
	cJSON *req = daemon_parse_request(NULL);
	TEST_ASSERT_NULL(req);
}

void test_daemon_parse_missing_cmd(void) {
	const char *line = "{\"id\":1,\"args\":[\"A\"]}";
	cJSON *req = daemon_parse_request(line);
	TEST_ASSERT_NOT_NULL(req);
	cJSON *cmd = cJSON_GetObjectItem(req, "cmd");
	TEST_ASSERT_NULL(cmd);
	cJSON_Delete(req);
}

void test_daemon_parse_missing_id(void) {
	const char *line = "{\"cmd\":\"slot\",\"args\":[\"A\"]}";
	cJSON *req = daemon_parse_request(line);
	TEST_ASSERT_NOT_NULL(req);
	TEST_ASSERT_NULL(cJSON_GetObjectItem(req, "id"));
	TEST_ASSERT_NOT_NULL(cJSON_GetObjectItem(req, "cmd"));
	cJSON_Delete(req);
}

/* ── daemon_make_ok ──────────────────────────────────────────────────── */

void test_daemon_make_ok_with_id(void) {
	cJSON *id = cJSON_CreateNumber(42);
	cJSON *resp = daemon_make_ok(id);
	TEST_ASSERT_NOT_NULL(resp);
	cJSON *ok = cJSON_GetObjectItem(resp, "ok");
	TEST_ASSERT_NOT_NULL(ok);
	TEST_ASSERT_TRUE(cJSON_IsTrue(ok));
	cJSON *id_out = cJSON_GetObjectItem(resp, "id");
	TEST_ASSERT_NOT_NULL(id_out);
	TEST_ASSERT_EQUAL_INT(42, (int)id_out->valuedouble);
	cJSON_Delete(id);
	cJSON_Delete(resp);
}

void test_daemon_make_ok_without_id(void) {
	cJSON *resp = daemon_make_ok(NULL);
	TEST_ASSERT_NOT_NULL(resp);
	TEST_ASSERT_TRUE(cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok")));
	TEST_ASSERT_NULL(cJSON_GetObjectItem(resp, "id"));
	cJSON_Delete(resp);
}

/* ── daemon_make_error ───────────────────────────────────────────────── */

void test_daemon_make_error_with_id(void) {
	cJSON *id = cJSON_CreateNumber(7);
	cJSON *resp = daemon_make_error(id, -3);
	TEST_ASSERT_NOT_NULL(resp);
	cJSON *ok = cJSON_GetObjectItem(resp, "ok");
	TEST_ASSERT_NOT_NULL(ok);
	TEST_ASSERT_FALSE(cJSON_IsTrue(ok));
	cJSON *code = cJSON_GetObjectItem(resp, "code");
	TEST_ASSERT_NOT_NULL(code);
	TEST_ASSERT_EQUAL_INT(-3, (int)code->valuedouble);
	cJSON *id_out = cJSON_GetObjectItem(resp, "id");
	TEST_ASSERT_NOT_NULL(id_out);
	TEST_ASSERT_EQUAL_INT(7, (int)id_out->valuedouble);
	cJSON_Delete(id);
	cJSON_Delete(resp);
}

void test_daemon_make_error_without_id(void) {
	cJSON *resp = daemon_make_error(NULL, -6);
	TEST_ASSERT_NOT_NULL(resp);
	TEST_ASSERT_FALSE(cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok")));
	TEST_ASSERT_EQUAL_INT(-6, (int)cJSON_GetObjectItem(resp, "code")->valuedouble);
	TEST_ASSERT_NULL(cJSON_GetObjectItem(resp, "id"));
	cJSON_Delete(resp);
}

/* ── daemon_enqueue / daemon_dequeue ────────────────────────────────── */

void test_daemon_queue_empty(void) {
	/* Drain any residual items from earlier tests */
	char *line;
	while ((line = daemon_dequeue()) != NULL) free(line);
	TEST_ASSERT_NULL(daemon_dequeue());
}

void test_daemon_queue_enqueue_dequeue(void) {
	/* Drain first */
	char *line;
	while ((line = daemon_dequeue()) != NULL) free(line);

	daemon_enqueue("{\"id\":1,\"cmd\":\"slot\"}");
	daemon_enqueue("{\"id\":2,\"cmd\":\"device\"}");

	char *first = daemon_dequeue();
	TEST_ASSERT_NOT_NULL(first);
	TEST_ASSERT_NOT_NULL(strstr(first, "\"id\":1"));
	free(first);

	char *second = daemon_dequeue();
	TEST_ASSERT_NOT_NULL(second);
	TEST_ASSERT_NOT_NULL(strstr(second, "\"id\":2"));
	free(second);

	TEST_ASSERT_NULL(daemon_dequeue());
}
