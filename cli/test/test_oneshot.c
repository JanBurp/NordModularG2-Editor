/*
 * One-shot CLI tests (`g2-cli --json <cmd>` subprocesses, no daemon). Each test restores what it changes.
 * Usage: make test-cli
 */

#include "unity.h"
#include "cJSON.h"
#include "daemon_harness.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>

/* Exit status of a one-shot command whose --json output carries nothing to check. */
static int run_oneshot_status(const char *args) {
    char cmd[512];
    snprintf(cmd, sizeof(cmd), "build/bin/g2-cli %s >/dev/null 2>&1", args);
    int st = system(cmd);
    return WIFEXITED(st) ? WEXITSTATUS(st) : -1;
}

/* Field `key` of get-patch A as a malloc'd string, or NULL. */
static char *patch_a_field(const char *key) {
    cJSON *p = run_oneshot("get-patch A");
    cJSON *v = cJSON_GetObjectItem(p, key);
    char *s = cJSON_IsString(v) ? strdup(v->valuestring) : NULL;
    cJSON_Delete(p);
    return s;
}

/* Performance name as a malloc'd string, or NULL; *perf_mode = 1 in performance mode. */
static char *perf_name(int *perf_mode) {
    cJSON *p = run_oneshot("get-perf-settings");
    cJSON *v = cJSON_GetObjectItem(cJSON_GetObjectItem(p, "performance"), "name");
    cJSON *m = cJSON_GetObjectItem(p, "mode");
    if (perf_mode) *perf_mode = cJSON_IsString(m) && strcmp(m->valuestring, "performance") == 0;
    char *s = cJSON_IsString(v) ? strdup(v->valuestring) : NULL;
    cJSON_Delete(p);
    return s;
}

/* set-patch-name, read back via get-patch; "" is a valid name (see the empty-patch-name note). */
void test_oneshot_set_patch_name(void) {
    char *orig = patch_a_field("name");
    TEST_ASSERT_NOT_NULL_MESSAGE(orig, "get-patch A: no name");
    char args[64];

    TEST_ASSERT_EQUAL_INT(0, run_oneshot_status("set-patch-name A CliTest"));
    char *got = patch_a_field("name");
    int named = got && strcmp(got, "CliTest") == 0;
    free(got);

    TEST_ASSERT_EQUAL_INT(0, run_oneshot_status("set-patch-name A ''"));
    got = patch_a_field("name");
    int blank = got && *got == '\0';
    free(got);

    snprintf(args, sizeof(args), "set-patch-name A '%s'", orig);
    int restored = run_oneshot_status(args) == 0;
    free(orig);
    TEST_ASSERT_TRUE_MESSAGE(named, "name not read back after set-patch-name");
    TEST_ASSERT_TRUE_MESSAGE(blank, "empty name not read back");
    TEST_ASSERT_TRUE_MESSAGE(restored, "restoring the patch name failed");
}

/* Performance mode only: in patch mode get-perf-settings reports slot A's patch name instead. */
void test_oneshot_set_perf_name(void) {
    int perf_mode = 0;
    char *orig = perf_name(&perf_mode);
    TEST_ASSERT_NOT_NULL_MESSAGE(orig, "get-perf-settings: no performance name");
    if (!perf_mode) { free(orig); TEST_IGNORE_MESSAGE("G2 in patch mode: the performance name can't be read back"); }
    char args[64];

    TEST_ASSERT_EQUAL_INT(0, run_oneshot_status("set-perf-name CliPerf"));
    char *got = perf_name(NULL);
    int named = got && strcmp(got, "CliPerf") == 0;
    free(got);

    snprintf(args, sizeof(args), "set-perf-name '%s'", orig);
    int restored = run_oneshot_status(args) == 0;
    free(orig);
    TEST_ASSERT_TRUE_MESSAGE(named, "name not read back after set-perf-name");
    TEST_ASSERT_TRUE_MESSAGE(restored, "restoring the performance name failed");
}

/* One get-patch-file -> upload-patch round trip of slot A; 0 = ok. */
static int patch_file_roundtrip(const char *rename_args) {
    return run_oneshot_status("get-patch-file A /tmp/g2-cli-roundtrip.pch2") == 0
        && run_oneshot_status("upload-patch A /tmp/g2-cli-roundtrip.pch2") == 0
        && run_oneshot_status(rename_args) == 0 /* upload-patch names the patch after the file */
        ? 0 : -1;
}

/* get-patch-file -> upload-patch -> get-patch must give back the same bytes: guards the CRC
 * handling of saved files (upload strips a CRC only when one is really there). Two quirks of the
 * G2 (observed 2026-10-24) shape the test:
 * - after an upload it returns the cable list (0x52) in a different order and the next upload
 *   flips it back, so round trips come in pairs;
 * - edits leave stale bits in the padding of bit-packed sections, which an upload resets, so the
 *   reference bytes are taken after a first pair of round trips. */
void test_oneshot_patch_file_roundtrip(void) {
    char *name = patch_a_field("name");
    TEST_ASSERT_NOT_NULL_MESSAGE(name, "get-patch A: no name");
    char args[128];
    snprintf(args, sizeof(args), "set-patch-name A '%s'", name);
    free(name);

    int ok = patch_file_roundtrip(args) == 0 && patch_file_roundtrip(args) == 0;
    char *before = ok ? patch_a_field("data") : NULL;
    ok = ok && before && patch_file_roundtrip(args) == 0 && patch_file_roundtrip(args) == 0;
    char *after = ok ? patch_a_field("data") : NULL;

    int same = before && after && strcmp(before, after) == 0;
    free(before);
    free(after);
    TEST_ASSERT_TRUE_MESSAGE(ok, "get-patch-file / upload-patch / set-patch-name failed");
    TEST_ASSERT_TRUE_MESSAGE(same, "patch data differs after two get-patch-file -> upload-patch round trips");
}
