/*
 * G2 CLI - Slow Integration Test Runner
 * Run with: make test-integration-slow
 * Requires G2 device connected via USB.
 *
 * Kept separate from run_tests_integration.c: every get-bank/send-bank call
 * walks a whole hardware bank (128 request/response round trips, see
 * g2_get_bank), so even the cheapest test here can run well past 2 seconds.
 * `make test`/`make test-integration` stay fast; run this target separately
 * when you want the bank-transfer coverage too.
 */

#include "unity.h"
#include "unity_internals.h"
#include "cJSON.h"
#include "../include/g2_device.h"
#include "daemon_harness.h"
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>

void setUp(void) {}
void tearDown(void) {}

extern void test_bank_transfer_set_daemon(daemon_ctx_t *d);
extern void test_bank_transfer_patch_fetch(void);
extern void test_bank_transfer_patch_write_roundtrip(void);
extern void test_bank_transfer_performance_fetch(void);
extern void test_bank_transfer_performance_write_roundtrip(void);

typedef struct { int saved_fd; FILE *capture; } stdout_capture_t;

static stdout_capture_t suppress_stdout(void) {
    fflush(stdout);
    stdout_capture_t c;
    c.saved_fd = dup(STDOUT_FILENO);
    c.capture = tmpfile();
    dup2(fileno(c.capture), STDOUT_FILENO);
    return c;
}

static void restore_stdout(stdout_capture_t c) {
    fflush(stdout);
    dup2(c.saved_fd, STDOUT_FILENO);
    close(c.saved_fd);
}

/* Unity's TEST_IGNORE_MESSAGE text is only ever printed (format "<file>:<line>:<test>:
 * IGNORE: <message>", with "IGNORE" itself wrapped in ANSI color codes since this build
 * defines UNITY_OUTPUT_COLOR), never stored in a queryable Unity field - so the only way
 * to recover *why* a test was skipped is to scan the stdout we just captured for it.
 * Returns NULL if no IGNORE line is found. */
static const char *extract_ignore_message(FILE *capture) {
    static char buf[512];
    rewind(capture);
    char line[512];
    while (fgets(line, sizeof(line), capture)) {
        char *p = strstr(line, "IGNORE");
        if (!p) continue;
        p += strlen("IGNORE");
        while (*p == '\033') { while (*p && *p != 'm') p++; if (*p) p++; }
        if (*p == ':') p++;
        while (*p == ' ') p++;
        snprintf(buf, sizeof(buf), "%s", p);
        size_t len = strlen(buf);
        while (len && (buf[len - 1] == '\n' || buf[len - 1] == '\r')) buf[--len] = '\0';
        return buf;
    }
    return NULL;
}

/* Returns 1 if this test skipped because the G2 disconnected mid-run (as opposed to the
 * pre-flight's start-of-run absence check) - main() uses this to stop immediately rather
 * than run the remaining tests, and their sleep(5) gaps, only to skip those too. */
static int run_test_silently(const char *name, void (*test_func)(void)) {
    fprintf(stderr, "%s ", name);
    fflush(stderr);
    unsigned short before_fail = Unity.TestFailures;
    unsigned short before_ignore = Unity.TestIgnores;
    stdout_capture_t cap = suppress_stdout();
    RUN_TEST(test_func);
    restore_stdout(cap);
    int failed = Unity.TestFailures > before_fail;
    int ignored = !failed && Unity.TestIgnores > before_ignore;
    const char *reason = ignored ? extract_ignore_message(cap.capture) : NULL;
    int disconnected = ignored && reason && strstr(reason, "not connected") != NULL;
    if (failed) {
        fprintf(stderr, "\033[31mFAIL\033[0m\n");
    } else if (ignored) {
        if (reason) fprintf(stderr, "\033[33mSKIP: %s\033[0m\n", reason);
        else fprintf(stderr, "\033[33mSKIP (no hardware / config mismatch)\033[0m\n");
    } else {
        fprintf(stderr, "\033[32mPASS\033[0m\n");
    }
    fflush(stderr);
    fclose(cap.capture);
    return disconnected;
}

int main(void) {
    /* Pre-flight: don't even start if no G2 is attached - without this, all four tests
     * plus their three interleaved sleep(5) calls (15s+) would run to completion just to
     * report SKIP. g2_init() is required before g2_list_devices_json() can enumerate (it
     * reads g2.ctx); g2_exit() releases that context again immediately so daemon_spawn()
     * (which itself calls g2_exit() defensively before forking) starts from a clean slate,
     * same as if this check had never run. */
    g2_init();
    cJSON *devices = g2_list_devices_json();
    int g2_count = 0;
    if (devices) {
        cJSON *c = cJSON_GetObjectItem(devices, "g2_count");
        if (c) g2_count = c->valueint;
        cJSON_Delete(devices);
    }
    g2_exit();
    if (g2_count == 0) {
        fprintf(stderr, "\033[33mNo Nord G2 detected on USB. Please connect/reset "
                         "(power-cycle or replug) the device, then re-run.\033[0m\n");
        return 0;
    }

    /* Same daemon setup as make test-integration (test_daemon.c's test_daemon_starts):
     * spawn `g2-cli --json daemon` and wait for watch_armed. Owned here rather than by
     * a Unity test because this runner has multiple early-return points below (mid-run
     * disconnect bail-out) that must all still reach daemon_shutdown(). */
    daemon_ctx_t daemon = daemon_spawn();
    cJSON *wa = read_event_of_type(&daemon, "watch_armed", 40, 20);
    if (!wa) {
        fprintf(stderr, "\033[33mG2 not connected (no watch_armed from daemon). Please "
                         "connect/reset (power-cycle or replug) the device, then re-run.\033[0m\n");
        daemon_shutdown(&daemon);
        return 0;
    }
    cJSON_Delete(wa);
    test_bank_transfer_set_daemon(&daemon);

    fprintf(stderr, "Running slow integration tests (bank transfer)...\n");
    fflush(stderr);
    UNITY_BEGIN();

    /* A real user never runs these four actions back to back in under a
     * minute - same reasoning as human_pause() in test_bank_transfer.c, just
     * applied between whole test functions instead of within one. */
    if (run_test_silently("test_bank_transfer_patch_fetch", test_bank_transfer_patch_fetch)) {
        fprintf(stderr, "\033[33mG2 disconnected mid-run - stopping here.\033[0m\n");
        daemon_shutdown(&daemon);
        return UNITY_END();
    }
    sleep(5);
    if (run_test_silently("test_bank_transfer_patch_write_roundtrip", test_bank_transfer_patch_write_roundtrip)) {
        fprintf(stderr, "\033[33mG2 disconnected mid-run - stopping here.\033[0m\n");
        daemon_shutdown(&daemon);
        return UNITY_END();
    }
    sleep(5);
    if (run_test_silently("test_bank_transfer_performance_fetch", test_bank_transfer_performance_fetch)) {
        fprintf(stderr, "\033[33mG2 disconnected mid-run - stopping here.\033[0m\n");
        daemon_shutdown(&daemon);
        return UNITY_END();
    }
    sleep(5);
    run_test_silently("test_bank_transfer_performance_write_roundtrip", test_bank_transfer_performance_write_roundtrip);

    daemon_shutdown(&daemon);
    return UNITY_END();
}
