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

    return UNITY_END();
}