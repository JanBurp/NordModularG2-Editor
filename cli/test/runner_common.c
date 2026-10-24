/*
 * G2 CLI - shared helpers for the hardware test runners, see runner_common.h.
 */

#include "runner_common.h"
#include "unity.h"
#include "unity_internals.h"
#include "cJSON.h"
#include "../include/g2_device.h"
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

void setUp(void) {}
void tearDown(void) {}

int g2_preflight(const char *suite) {
    /* Don't even start if no G2 is attached - every test would self-skip anyway, but only
     * after paying its own connect-attempt cost. g2_init() is required before
     * g2_list_devices_json() can enumerate (it reads g2.ctx); g2_exit() releases that
     * context again immediately so daemon_spawn()/ensure_g2() start from a clean slate,
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
    if (g2_count > 0) return -1;

    fprintf(stderr, "\033[33mNo Nord G2 detected on USB. Please connect/reset "
                     "(power-cycle or replug) the device, then re-run.\033[0m\n");
    /* Not silently green: nothing ran. Only an explicit opt-in (make test, CI,
     * hardware-free checkouts) turns this into exit 0. */
    if (getenv("G2_ALLOW_NO_DEVICE")) {
        fprintf(stderr, "\033[33m%s NOT RUN (G2_ALLOW_NO_DEVICE set)\033[0m\n", suite);
        return 0;
    }
    fprintf(stderr, "\033[31m%s NOT RUN - set G2_ALLOW_NO_DEVICE=1 to accept this\033[0m\n", suite);
    return 1;
}

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

int run_test_silently(const char *name, void (*test_func)(void)) {
    fprintf(stderr, "%s ", name);
    fflush(stderr);
    unsigned short before_fail = Unity.TestFailures;
    unsigned short before_ignore = Unity.TestIgnores;
    /* G2_TEST_VERBOSE=1 skips the stdout suppression below so Unity's actual
     * TEST_ASSERT_*_MESSAGE failure text (printed to stdout) is visible instead
     * of only the bare PASS/FAIL/SKIP line. */
    int verbose = getenv("G2_TEST_VERBOSE") != NULL;
    stdout_capture_t cap = {0};
    if (!verbose) cap = suppress_stdout();
    RUN_TEST(test_func);
    if (!verbose) restore_stdout(cap);
    int failed = Unity.TestFailures > before_fail;
    /* TEST_IGNORE_MESSAGE means the test never actually ran to completion - call that out
     * distinctly, with the real reason (e.g. "G2 device not connected" vs. "set
     * G2_TEST_BANK_CHAIN=1 to run...") so it isn't misread as a real PASS or conflated
     * with an unrelated skip reason. */
    int ignored = !failed && Unity.TestIgnores > before_ignore;
    const char *reason = (!verbose && ignored) ? extract_ignore_message(cap.capture) : NULL;
    if (failed) {
        fprintf(stderr, "\033[31mFAIL\033[0m\n");
    } else if (ignored) {
        if (reason) fprintf(stderr, "\033[33mSKIP: %s\033[0m\n", reason);
        else fprintf(stderr, "\033[33mSKIP (no hardware / config mismatch)\033[0m\n");
    } else {
        fprintf(stderr, "\033[32mPASS\033[0m\n");
    }
    fflush(stderr);
    if (!verbose && cap.capture) fclose(cap.capture);
    return ignored && reason && strstr(reason, "not connected") != NULL;
}
