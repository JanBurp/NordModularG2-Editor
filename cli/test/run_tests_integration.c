/*
 * G2 CLI - Integration Test Runner
 * Run with: make test-integration
 * Requires G2 device connected via USB
 */

#include "unity.h"
#include "unity_internals.h"
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>
#include <stdio.h>

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
extern void test_daemon_perf_mode_cycle(void);
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

static int suppress_stdout(void) {
    fflush(stdout);
    int fd = dup(STDOUT_FILENO);
    int nullfd = open("/dev/null", O_WRONLY);
    dup2(nullfd, STDOUT_FILENO);
    close(nullfd);
    return fd;
}

static void restore_stdout(int fd) {
    fflush(stdout);
    dup2(fd, STDOUT_FILENO);
    close(fd);
}

static void run_test_silently(const char *name, void (*test_func)(void)) {
    fprintf(stderr, "%s ", name);
    fflush(stderr);
    unsigned short before_fail = Unity.TestFailures;
    unsigned short before_ignore = Unity.TestIgnores;
    int fd = suppress_stdout();
    RUN_TEST(test_func);
    restore_stdout(fd);
    int failed = Unity.TestFailures > before_fail;
    /* TEST_IGNORE_MESSAGE("G2 device not connected"/"G2 not connected...") means the test
     * never actually ran against hardware — call that out distinctly so it isn't misread as
     * a real PASS when the CLI daemon/USB device wasn't available. */
    int ignored = !failed && Unity.TestIgnores > before_ignore;
    const char *color = failed ? "\033[31m" : ignored ? "\033[33m" : "\033[32m";
    const char *status = failed ? "FAIL" : ignored ? "SKIP (no hardware/daemon)" : "PASS";
    fprintf(stderr, "%s%s\033[0m\n", color, status);
    fflush(stderr);
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
    fprintf(stderr, "Running integration tests...\n");
    fflush(stderr);
    UNITY_BEGIN();

    run_test_silently("test_integration_connect", test_integration_connect);

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
    run_test_silently("test_daemon_perf_mode_cycle",         test_daemon_perf_mode_cycle);

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
