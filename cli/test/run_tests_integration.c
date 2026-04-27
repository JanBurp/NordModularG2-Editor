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
extern void test_fullstack_with_watch(void);
extern void test_watch_then_slot_then_watch(void);
extern void test_slot_cycle_interspersed_watch(void);
extern void test_stress_slot_variation_watch(void);
extern void test_stress_editor_mimic(void);

extern void test_upload_empty_patch(void);
extern void test_upload_burp(void);
extern void test_upload_lyra4(void);
extern void test_upload_fmritm(void);
extern void test_upload_ocoast(void);

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
    fprintf(stderr, "%s\n", Unity.TestFailures > before ? "FAIL" : "PASS");
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
    run_test_with_output("test_upload_empty_patch", test_upload_empty_patch);
    run_test_with_output("test_upload_burp",        test_upload_burp);
    run_test_with_output("test_upload_lyra4",       test_upload_lyra4);
    run_test_with_output("test_upload_fmritm",      test_upload_fmritm);
    run_test_with_output("test_upload_ocoast",      test_upload_ocoast);

    run_test_silently("test_integration_get_patch_slot_a", test_integration_get_patch_slot_a);
    run_test_silently("test_integration_list_all", test_integration_list_all);
    run_test_silently("test_integration_select_slot_a", test_integration_select_slot_a);

    run_test_silently("test_slot_then_get_patch_no_delay", test_slot_then_get_patch_no_delay);
    run_test_silently("test_slot_cycle_with_get_patch", test_slot_cycle_with_get_patch);
    run_test_silently("test_variation_cycle_slot_a", test_variation_cycle_slot_a);
    run_test_silently("test_repeated_slot_cycle", test_repeated_slot_cycle);
    run_test_silently("test_interleaved_slot_variation", test_interleaved_slot_variation);
    run_test_silently("test_drain_count_logged", test_drain_count_logged);

    /* Startup sequence last: CMD_INIT resets the G2, disrupting any shared
     * connection state — running it last prevents it from affecting other tests. */
    run_test_silently("test_startup_sequence", test_startup_sequence);

    /* Full real-life scenario: startup sequence + 30 s of live JSON watch output. */
    run_test_with_output("test_fullstack_with_watch", test_fullstack_with_watch);

    /* Slot switch between two watch sessions (10 s each). */
    run_test_with_output("test_watch_then_slot_then_watch", test_watch_then_slot_then_watch);

    /* A/B/C/D slot cycle with variation changes and short watches. */
    run_test_with_output("test_slot_cycle_interspersed_watch", test_slot_cycle_interspersed_watch);

    /* Stress: 10 slot changes + 20 variation changes, 200–300 ms watches. */
    run_test_with_output("test_stress_slot_variation_watch", test_stress_slot_variation_watch);

    /* Stress: editor-accurate behaviour — fresh connect/disconnect per command. */
    run_test_with_output("test_stress_editor_mimic", test_stress_editor_mimic);

    return UNITY_END();
}