/*
 * G2 CLI - Integration Test Runner
 * Run with: make test-integration
 * Requires G2 device connected via USB
 */

#include "unity.h"
#include "unity_internals.h"
#include "cJSON.h"
#include "../include/g2_device.h"
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

void setUp(void) {}
void tearDown(void) {}

extern void test_integration_connect(void);
extern void test_integration_get_patch_slot_a(void);
extern void test_integration_list_all(void);
extern void test_integration_select_slot_a(void);
extern void test_startup_sequence(void);

extern void test_daemon_starts(void);
extern void test_daemon_get_patch_cmd(void);
extern void test_daemon_slot_cmd(void);
extern void test_daemon_variation_cmd(void);
extern void test_daemon_select_param_cmd(void);
extern void test_daemon_stdin_burst_forwards_events_promptly(void);
extern void test_daemon_dump_patch_cmd(void);
extern void test_daemon_assign_knob_cmd(void);
extern void test_daemon_assign_global_knob_cmd(void);
extern void test_daemon_set_param_label_four_button_switch(void);
extern void test_daemon_send_controller_snapshot_cmd(void);
extern void test_patch_workflow_full_cycle(void);
extern void test_patch_workflow_replace_module(void);
extern void test_daemon_perf_mode_cycle(void);

extern void test_daemon_multi_starts(void);
extern void test_daemon_multi_commands_independent(void);
extern void test_daemon_multi_no_cross_talk(void);
extern void test_daemon_multi_kill_one_other_unaffected(void);
/* watch-based tests — commented out; use test_daemon_slot_variation_commands instead
extern void test_fullstack_with_watch(void);
extern void test_watch_then_slot_then_watch(void);
extern void test_slot_cycle_interspersed_watch(void);
extern void test_stress_slot_variation_watch(void);
extern void test_stress_editor_mimic(void);
*/

extern void test_upload_empty_patch(void);
extern void test_upload_nl2(void);
extern void test_upload_dxbass(void);
extern void test_upload_dxbass_buf(void);
extern void test_upload_mixt(void);
extern void test_upload_empty_perf(void);
extern void test_upload_morphing_drum(void);

extern void test_slot_then_get_patch_no_delay(void);
extern void test_slot_cycle_with_get_patch(void);
extern void test_variation_cycle_slot_a(void);
extern void test_repeated_slot_cycle(void);
extern void test_interleaved_slot_variation(void);
extern void test_drain_count_logged(void);

extern void test_set_perf_mode_cycle(void);
extern void test_set_perf_name(void);

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

static void run_test_silently(const char *name, void (*test_func)(void)) {
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
        else fprintf(stderr, "\033[33mSKIP (no hardware/daemon)\033[0m\n");
    } else {
        fprintf(stderr, "\033[32mPASS\033[0m\n");
    }
    fflush(stderr);
    if (!verbose && cap.capture) fclose(cap.capture);
}

/* run_test_with_output — unused while all its call sites below are disabled;
 * preserved for when upload/roundtrip or watch-based tests are re-enabled.
static void run_test_with_output(const char *name, void (*test_func)(void)) {
    fprintf(stderr, "%s\n", name);
    fflush(stderr);
    RUN_TEST(test_func);
    fflush(stdout);
    fprintf(stderr, "-------------------\n");
    fflush(stderr);
}
*/

int main(void) {
    /* Pre-flight: don't even start if no G2 is attached - every test here self-skips
     * anyway, but only after paying its own connect-attempt cost. g2_init() is required
     * before g2_list_devices_json() can enumerate (it reads g2.ctx); g2_exit() releases
     * that context again immediately so daemon_spawn()/ensure_g2() start from a clean
     * slate, same as if this check had never run. */
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

    fprintf(stderr, "Running integration tests...\n");
    fflush(stderr);
    UNITY_BEGIN();

    /* test_integration_connect is NOT run here: connecting in this parent process
     * before daemon_spawn()'s fork() (test_daemon.c) causes a fork-from-already-
     * connected-parent hang on some machines, distinct from the general daemon
     * connect hang fixed in daemon.c. The daemon subprocess always connects
     * independently after exec, so this parent-side connect was redundant anyway. */
    // run_test_silently("test_integration_connect", test_integration_connect);

    /* Performance mode and naming tests */
    // run_test_silently("test_set_perf_mode_cycle", test_set_perf_mode_cycle);
    // run_test_silently("test_set_perf_name", test_set_perf_name);

    /* Upload / roundtrip tests — run with output so section diffs are visible */
    // run_test_with_output("test_upload_empty_patch", test_upload_empty_patch);
    // run_test_with_output("test_upload_nl2",        test_upload_nl2);
    // run_test_with_output("test_upload_dxbass",       test_upload_dxbass);
    // run_test_with_output("test_upload_dxbass_buf",   test_upload_dxbass_buf);
    // run_test_with_output("test_upload_mixt",      test_upload_mixt);
    // run_test_with_output("test_upload_empty_perf",    test_upload_empty_perf);
    // run_test_with_output("test_upload_morphing_drum", test_upload_morphing_drum);

    // run_test_silently("test_integration_get_patch_slot_a", test_integration_get_patch_slot_a);
    // run_test_silently("test_integration_list_all", test_integration_list_all);
    // run_test_silently("test_integration_select_slot_a", test_integration_select_slot_a);

    // run_test_silently("test_slot_then_get_patch_no_delay", test_slot_then_get_patch_no_delay);
    // run_test_silently("test_slot_cycle_with_get_patch", test_slot_cycle_with_get_patch);
    // run_test_silently("test_variation_cycle_slot_a", test_variation_cycle_slot_a);
    // run_test_silently("test_repeated_slot_cycle", test_repeated_slot_cycle);
    // run_test_silently("test_interleaved_slot_variation", test_interleaved_slot_variation);
    // run_test_silently("test_drain_count_logged", test_drain_count_logged);

    /* Daemon: shared-daemon tests — slot/variation before perf mode so mode-change
     * residual USB state cannot affect slot commands. Perf mode is last and owns shutdown. */
    run_test_silently("test_daemon_starts",                  test_daemon_starts);
    run_test_silently("test_daemon_get_patch_cmd",           test_daemon_get_patch_cmd);
    run_test_silently("test_daemon_slot_cmd",                test_daemon_slot_cmd);
    run_test_silently("test_daemon_variation_cmd",           test_daemon_variation_cmd);
    run_test_silently("test_daemon_select_param_cmd",        test_daemon_select_param_cmd);
    run_test_silently("test_daemon_stdin_burst_forwards_events_promptly", test_daemon_stdin_burst_forwards_events_promptly);
    run_test_silently("test_daemon_dump_patch_cmd",          test_daemon_dump_patch_cmd);
    run_test_silently("test_daemon_assign_knob_cmd",         test_daemon_assign_knob_cmd);
    run_test_silently("test_daemon_assign_global_knob_cmd",  test_daemon_assign_global_knob_cmd);
    run_test_silently("test_daemon_set_param_label_four_button_switch", test_daemon_set_param_label_four_button_switch);
    run_test_silently("test_daemon_send_controller_snapshot_cmd", test_daemon_send_controller_snapshot_cmd);
    run_test_silently("test_patch_workflow_full_cycle",      test_patch_workflow_full_cycle);
    run_test_silently("test_patch_workflow_replace_module",  test_patch_workflow_replace_module);
    run_test_silently("test_daemon_perf_mode_cycle",         test_daemon_perf_mode_cycle);

    /* Multi-device: needs 2 real G2 units attached, self-skips otherwise. Runs after
     * the single-daemon shared-daemon suite above releases its own USB connection. */
    run_test_silently("test_daemon_multi_starts",                    test_daemon_multi_starts);
    run_test_silently("test_daemon_multi_commands_independent",      test_daemon_multi_commands_independent);
    run_test_silently("test_daemon_multi_no_cross_talk",              test_daemon_multi_no_cross_talk);
    run_test_silently("test_daemon_multi_kill_one_other_unaffected",  test_daemon_multi_kill_one_other_unaffected);

    /* Watch-based tests — disabled; preserved in test_integration.c for reference.
    run_test_with_output("test_fullstack_with_watch", test_fullstack_with_watch);
    run_test_with_output("test_watch_then_slot_then_watch", test_watch_then_slot_then_watch);
    run_test_with_output("test_slot_cycle_interspersed_watch", test_slot_cycle_interspersed_watch);
    run_test_with_output("test_stress_slot_variation_watch", test_stress_slot_variation_watch);
    run_test_with_output("test_stress_editor_mimic", test_stress_editor_mimic);
    */

    /* Startup sequence last: CMD_INIT resets the G2, disrupting any shared
     * connection state — running it last prevents it from affecting other tests. */
    // run_test_silently("test_startup_sequence", test_startup_sequence);

    return UNITY_END();
}
