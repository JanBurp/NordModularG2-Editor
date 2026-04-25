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

int main(void) {
    fprintf(stderr, "Running integration tests...\n");
    fflush(stderr);
    UNITY_BEGIN();

    run_test_silently("test_integration_connect", test_integration_connect);
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

    return UNITY_END();
}