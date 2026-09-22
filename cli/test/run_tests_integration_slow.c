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
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>

void setUp(void) {}
void tearDown(void) {}

extern void test_bank_transfer_patch_fetch(void);
extern void test_bank_transfer_patch_write_roundtrip(void);
extern void test_bank_transfer_performance_fetch(void);
extern void test_bank_transfer_performance_write_roundtrip(void);

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
    int ignored = !failed && Unity.TestIgnores > before_ignore;
    const char *color = failed ? "\033[31m" : ignored ? "\033[33m" : "\033[32m";
    const char *status = failed ? "FAIL" : ignored ? "SKIP (no hardware / config mismatch)" : "PASS";
    fprintf(stderr, "%s%s\033[0m\n", color, status);
    fflush(stderr);
}

int main(void) {
    fprintf(stderr, "Running slow integration tests (bank transfer)...\n");
    fflush(stderr);
    UNITY_BEGIN();

    /* A real user never runs these four actions back to back in under a
     * minute - same reasoning as human_pause() in test_bank_transfer.c, just
     * applied between whole test functions instead of within one. */
    run_test_silently("test_bank_transfer_patch_fetch",                 test_bank_transfer_patch_fetch);
    sleep(15);
    run_test_silently("test_bank_transfer_patch_write_roundtrip",       test_bank_transfer_patch_write_roundtrip);
    sleep(15);
    run_test_silently("test_bank_transfer_performance_fetch",           test_bank_transfer_performance_fetch);
    sleep(15);
    run_test_silently("test_bank_transfer_performance_write_roundtrip", test_bank_transfer_performance_write_roundtrip);

    return UNITY_END();
}
