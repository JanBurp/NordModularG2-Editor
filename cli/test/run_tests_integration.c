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
extern void test_daemon_slot_variation_commands(void);
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
extern void test_upload_mixt(void);

extern void test_slot_then_get_patch_no_delay(void);
extern void test_slot_cycle_with_get_patch(void);
extern void test_variation_cycle_slot_a(void);
extern void test_repeated_slot_cycle(void);
extern void test_interleaved_slot_variation(void);
extern void test_drain_count_logged(void);

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
    unsigned short before = Unity.TestFailures;
    int fd = suppress_stdout();
    RUN_TEST(test_func);
    restore_stdout(fd);
    int failed = Unity.TestFailures > before;
    fprintf(stderr, "%s%s\033[0m\n", failed ? "\033[31m" : "\033[32m", failed ? "FAIL" : "PASS");
    fflush(stderr);
}

static void run_test_with_output(const char *name, void (*test_func)(void)) {
    fprintf(stderr, "%s\n", name);
    fflush(stderr);
    RUN_TEST(test_func);
    fflush(stdout);
    fprintf(stderr, "-------------------\n");
    fflush(stderr);
}

int main(void) {
    fprintf(stderr, "Running integration tests...\n");
    fflush(stderr);
    UNITY_BEGIN();

    run_test_silently("test_integration_connect", test_integration_connect);

    /* Upload / roundtrip tests — run with output so section diffs are visible */
    // run_test_with_output("test_upload_empty_patch", test_upload_empty_patch);
    // run_test_with_output("test_upload_nl2",        test_upload_nl2);
    // run_test_with_output("test_upload_dxbass",       test_upload_dxbass);
    // run_test_with_output("test_upload_mixt",      test_upload_mixt);

    // run_test_silently("test_integration_get_patch_slot_a", test_integration_get_patch_slot_a);
    // run_test_silently("test_integration_list_all", test_integration_list_all);
    run_test_silently("test_integration_select_slot_a", test_integration_select_slot_a);

    // run_test_silently("test_slot_then_get_patch_no_delay", test_slot_then_get_patch_no_delay);
    // run_test_silently("test_slot_cycle_with_get_patch", test_slot_cycle_with_get_patch);
    run_test_silently("test_variation_cycle_slot_a", test_variation_cycle_slot_a);
    // run_test_silently("test_repeated_slot_cycle", test_repeated_slot_cycle);
    // run_test_silently("test_interleaved_slot_variation", test_interleaved_slot_variation);
    // run_test_silently("test_drain_count_logged", test_drain_count_logged);

    /* Daemon: spawn g2-cli daemon subprocess, verify slot + variation commands over stdin/stdout. */
    run_test_silently("test_daemon_slot_variation_commands", test_daemon_slot_variation_commands);

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
