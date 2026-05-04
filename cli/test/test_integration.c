/*
 * G2 CLI - Integration tests requiring real G2 device
 * These tests assume the G2 is connected via USB
 *
 * Note: Tests run sequentially with delay between each.
 *       Only 3-4 tests to stay within G2 hardware timing limits (~10 commands).
 *
 * Usage: make test-integration
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"
#include "../include/defs.h"
#include "../include/output.h"
#include "../include/cJSON.h"
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <sys/select.h>

static int suite_initialized = 0;

static void ensure_connected(void) {
    if (!suite_initialized) {
        g2_init();
        suite_initialized = 1;
    }
    if (!g2_is_connected()) {
        TEST_ASSERT_TRUE(g2_connect_silent() >= 0);
    }
    TEST_ASSERT_TRUE(g2_is_connected());
}

static void delay_between_tests(void) {
    usleep(500000);
}

void test_integration_connect(void) {
    ensure_connected();
    delay_between_tests();
}

void test_integration_get_patch_slot_a(void) {
    ensure_connected();
    cJSON *result = g2_get_patch("A");
    TEST_ASSERT_TRUE(result != NULL);
    cJSON_Delete(result);
    delay_between_tests();
}

void test_integration_list_all(void) {
    ensure_connected();
    cJSON *result = g2_list(LIST_FILTER_ALL, 0);
    TEST_ASSERT_TRUE(result != NULL);
    cJSON_Delete(result);
    delay_between_tests();
}

void test_integration_select_slot_a(void) {
    ensure_connected();
    TEST_ASSERT_TRUE(g2_select_slot("A") >= 0);
}

/*
 * Startup sequence as documented in "G2 USB Messages.html":
 *   1. CMD_INIT (0x80)        — resets version counters, get G2 type info
 *   2. STOP_COMM              — silence G2→Host notifications (done inside slot/get-patch)
 *   3. GET_SYNTH_SETTINGS     — global settings
 *   4. GET_PATCH per slot     — slot state
 *   5. GET_NAMES (list)       — patch/performance names
 *
 * This test verifies the full sequence completes without errors and that
 * each step returns a non-NULL result.
 */
void test_startup_sequence(void) {
    ensure_connected();

    /* Step 1: CMD_INIT */
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_send_init());

    /* Step 2+3: synth settings (g2_device_info drains stale messages first) */
    cJSON *info = g2_device_info(0);
    TEST_ASSERT_NOT_NULL(info);
    cJSON_Delete(info);

    /* Step 4: patch data for each slot */
    const char *slots[] = {"A", "B", "C", "D"};
    for (int i = 0; i < 4; i++) {
        cJSON *patch = g2_get_patch(slots[i]);
        TEST_ASSERT_NOT_NULL_MESSAGE(patch, slots[i]);
        cJSON_Delete(patch);
    }

    /* Step 5: patch/performance names */
    cJSON *names = g2_list(LIST_FILTER_ALL, 0);
    TEST_ASSERT_NOT_NULL(names);
    cJSON_Delete(names);

    /* CMD_INIT resets G2 state — disconnect so subsequent tests get a clean connection. */
    g2_disconnect();
}

static void watch_for_ms(int ms) {
    struct itimerval t = { {0,0}, {ms/1000, (ms%1000)*1000} };
    g2_watch_running = 1;
    signal(SIGALRM, g2_watch_stop);
    setitimer(ITIMER_REAL, &t, NULL);
    g2_watch(OUTPUT_DEFAULT, 0);
    t.it_value.tv_sec = 0; t.it_value.tv_usec = 0;
    setitimer(ITIMER_REAL, &t, NULL);
}

/*
 * Startup → 10 s watch on slot A → switch to slot B → 10 s watch on slot B.
 * Verifies that g2_watch (which ends with STOP_COMM) leaves the G2 in a
 * state where normal commands still work and watch can be restarted.
 */
void test_watch_then_slot_then_watch(void) {
    ensure_connected();
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_send_init());

    cJSON *info = g2_device_info(0);
    TEST_ASSERT_NOT_NULL(info);
    output_json(info, OUTPUT_DEFAULT);
    cJSON_Delete(info);

    fprintf(stderr, "watch: slot A, 4 s\n");
    watch_for_ms(4000);

    fprintf(stderr, "switching to slot B\n");
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_select_slot("B"));

    fprintf(stderr, "watch: slot B, 4 s\n");
    watch_for_ms(4000);

    g2_disconnect();
}

/*
 * Cycle A→B→C→D with a variation change after each slot switch, then a short
 * watch. Uses varied sub-second to 2 s watch durations to keep total time ~10 s.
 */
void test_slot_cycle_interspersed_watch(void) {
    ensure_connected();
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_send_init());

    static const struct { const char *slot; int slot_idx; int variation; int watch_ms; } steps[] = {
        { "A", 0, 1, 2000 },
        { "B", 1, 3, 1000 },
        { "C", 2, 5, 2000 },
        { "D", 3, 2, 1000 },
        { "A", 0, 4,  500 },
    };
    for (int i = 0; i < 5; i++) {
        fprintf(stderr, "slot → %s  var %d  watch %d ms\n",
                steps[i].slot, steps[i].variation, steps[i].watch_ms);
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, g2_select_slot(steps[i].slot), steps[i].slot);
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK,
            g2_select_variation(steps[i].variation, steps[i].slot_idx), steps[i].slot);
        watch_for_ms(steps[i].watch_ms);
    }

    g2_disconnect();
}

/*
 * Stress test: 10 slot changes and 20 variation changes with short watches
 * (~200–300 ms) to maximise command throughput. Slot changes on even steps,
 * variation changes on every step. Total ~4.5 s.
 */
void test_stress_slot_variation_watch(void) {
    ensure_connected();
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_send_init());

    /* slot==NULL means keep current slot; slot_idx always reflects current slot */
    static const struct { const char *slot; int slot_idx; int variation; int watch_ms; } steps[] = {
        {"A", 0, 1, 300}, {NULL, 0, 2, 200},
        {"B", 1, 3, 250}, {NULL, 1, 4, 150},
        {"C", 2, 5, 300}, {NULL, 2, 6, 200},
        {"D", 3, 7, 250}, {NULL, 3, 8, 150},
        {"A", 0, 1, 300}, {NULL, 0, 2, 200},
        {"B", 1, 3, 250}, {NULL, 1, 4, 150},
        {"C", 2, 5, 300}, {NULL, 2, 6, 200},
        {"D", 3, 7, 250}, {NULL, 3, 8, 150},
        {"A", 0, 1, 300}, {NULL, 0, 2, 200},
        {"B", 1, 3, 250}, {NULL, 1, 4, 150},
    };
    for (int i = 0; i < 20; i++) {
        if (steps[i].slot) {
            fprintf(stderr, "slot → %s  ", steps[i].slot);
            TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, g2_select_slot(steps[i].slot), steps[i].slot);
        }
        fprintf(stderr, "var %d  watch %d ms\n", steps[i].variation, steps[i].watch_ms);
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK,
            g2_select_variation(steps[i].variation, steps[i].slot_idx), steps[i].slot);
        watch_for_ms(steps[i].watch_ms);
    }

    g2_disconnect();
}

/*
 * Mimics the exact Electron editor behaviour for each user action:
 *
 *   startup process  : g2_startup() → g2_disconnect()
 *   watch process    : g2_connect() → watch_for_ms() → STOP_COMM → g2_disconnect()
 *   command process  : g2_connect() → g2_select_slot/variation() → g2_disconnect()
 *   watch restarted  : g2_connect() → (next iteration)
 *
 * Each step performs one slot change and one variation change as separate
 * connect/command/disconnect cycles, matching the two IPC calls the editor
 * would issue. 5 steps × 2 commands = 10 slot + 5 variation changes,
 * 10 watch sessions, ~30 USB connect/disconnect cycles total.
 */
void test_stress_editor_mimic(void) {
    /* mimic startup command process */
    ensure_connected();
    cJSON *init_result = g2_startup();
    TEST_ASSERT_NOT_NULL(init_result);
    cJSON_Delete(init_result);
    g2_disconnect();

    static const struct { const char *slot; int slot_idx; int variation; int watch_ms; } steps[] = {
        {"A", 0, 1, 300},
        {"B", 1, 3, 250},
        {"C", 2, 5, 300},
        {"D", 3, 2, 250},
        {"A", 0, 4, 300},
    };

    for (int i = 0; i < 5; i++) {
        /* watch process */
        TEST_ASSERT_TRUE(g2_connect_silent() >= 0);
        fprintf(stderr, "watch %d ms\n", steps[i].watch_ms);
        watch_for_ms(steps[i].watch_ms);
        g2_disconnect();

        /* slot command process */
        TEST_ASSERT_TRUE(g2_connect_silent() >= 0);
        fprintf(stderr, "slot → %s\n", steps[i].slot);
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, g2_select_slot(steps[i].slot), steps[i].slot);
        g2_disconnect();

        /* variation command process */
        TEST_ASSERT_TRUE(g2_connect_silent() >= 0);
        fprintf(stderr, "var %d\n", steps[i].variation);
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK,
            g2_select_variation(steps[i].variation, steps[i].slot_idx), steps[i].slot);
        g2_disconnect();
    }

    /* final watch process */
    TEST_ASSERT_TRUE(g2_connect_silent() >= 0);
    watch_for_ms(500);
    g2_disconnect();
}

/* ── daemon integration test ─────────────────────────────────────────── */

/* Read one newline-terminated line from fd. Returns byte count or -1 on timeout/error. */
static int read_line_timeout(int fd, char *buf, int bufsize, int timeout_sec) {
    int pos = 0;
    while (pos < bufsize - 1) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(fd, &fds);
        struct timeval tv = { timeout_sec, 0 };
        if (select(fd + 1, &fds, NULL, NULL, &tv) <= 0) return -1;
        if (read(fd, buf + pos, 1) <= 0) return -1;
        if (buf[pos++] == '\n') break;
    }
    buf[pos] = '\0';
    return pos;
}

/* Send a JSON command line, skip watch events, return 0 if response has "ok":true for expected_id. */
static int send_and_expect_ok(int wfd, int rfd, const char *json, int expected_id) {
    char line_buf[4096];
    int json_len = (int)strlen(json);
    if (write(wfd, json, json_len) != json_len) return -1;
    if (write(wfd, "\n", 1) != 1) return -1;
    for (int attempts = 0; attempts < 30; attempts++) {
        if (read_line_timeout(rfd, line_buf, sizeof(line_buf), 5) < 0) return -1;
        cJSON *resp = cJSON_Parse(line_buf);
        if (!resp) continue;
        cJSON *id_j = cJSON_GetObjectItem(resp, "id");
        if (id_j && (int)id_j->valuedouble == expected_id) {
            int ok = cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok"));
            cJSON_Delete(resp);
            return ok ? 0 : -1;
        }
        cJSON_Delete(resp);
    }
    return -1;
}

/*
 * Spawn the daemon as a child process, send slot and variation switch commands
 * via stdin, and verify each responds with {"ok":true}.
 */
void test_daemon_slot_variation_commands(void) {
    int in_pipe[2], out_pipe[2];
    TEST_ASSERT_EQUAL_INT(0, pipe(in_pipe));
    TEST_ASSERT_EQUAL_INT(0, pipe(out_pipe));

    pid_t pid = fork();
    TEST_ASSERT_TRUE(pid >= 0);

    if (pid == 0) {
        dup2(in_pipe[0],  STDIN_FILENO);
        dup2(out_pipe[1], STDOUT_FILENO);
        close(in_pipe[1]); close(out_pipe[0]);
        close(in_pipe[0]); close(out_pipe[1]);
        execl("build/bin/g2-cli", "g2-cli", "--json", "daemon", NULL);
        exit(1);
    }
    close(in_pipe[0]);
    close(out_pipe[1]);

    usleep(1500000); /* allow daemon to connect and arm watch */

    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":1,\"cmd\":\"slot\",\"args\":[\"A\"]}", 1), "slot A");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":2,\"cmd\":\"variation\",\"args\":[\"1\",\"0\"]}", 2), "var 1 slot 0");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":3,\"cmd\":\"slot\",\"args\":[\"B\"]}", 3), "slot B");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":4,\"cmd\":\"variation\",\"args\":[\"3\",\"1\"]}", 4), "var 3 slot 1");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":5,\"cmd\":\"slot\",\"args\":[\"C\"]}", 5), "slot C");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":6,\"cmd\":\"variation\",\"args\":[\"5\",\"2\"]}", 6), "var 5 slot 2");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":7,\"cmd\":\"slot\",\"args\":[\"D\"]}", 7), "slot D");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":8,\"cmd\":\"variation\",\"args\":[\"2\",\"3\"]}", 8), "var 2 slot 3");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, send_and_expect_ok(in_pipe[1], out_pipe[0], "{\"id\":9,\"cmd\":\"slot\",\"args\":[\"A\"]}", 9), "slot A");

    close(in_pipe[1]);  /* EOF triggers daemon shutdown */
    waitpid(pid, NULL, 0);
}

/* ── watch-based tests (kept for reference, not run in normal suite) ──── */

/*
 * Full real-life scenario with JSON output to stdout:
 *   Same startup sequence as test_startup_sequence, but each step's result
 *   is printed as JSON, followed by 10 seconds of START_COMM watch output
 *   (LED data, volume data, param changes, etc.) so the stream can be
 *   observed exactly as the editor would see it.
 */
void test_fullstack_with_watch(void) {
    ensure_connected();

    /* Step 1: CMD_INIT */
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_send_init());

    /* Step 2+3: synth settings */
    cJSON *info = g2_device_info(0);
    TEST_ASSERT_NOT_NULL(info);
    output_json(info, OUTPUT_DEFAULT);
    cJSON_Delete(info);

    /* Step 4: patch data for each slot */
    const char *slots[] = {"A", "B", "C", "D"};
    for (int i = 0; i < 4; i++) {
        cJSON *patch = g2_get_patch(slots[i]);
        TEST_ASSERT_NOT_NULL_MESSAGE(patch, slots[i]);
        output_json(patch, OUTPUT_DEFAULT);
        cJSON_Delete(patch);
    }

    /* Step 5: patch/performance names */
    cJSON *names = g2_list(LIST_FILTER_ALL, 0);
    TEST_ASSERT_NOT_NULL(names);
    output_json(names, OUTPUT_DEFAULT);
    cJSON_Delete(names);

    /* Step 6: START_COMM — watch for 10 seconds, then auto-stop */
    watch_for_ms(10000);

    g2_disconnect();
}