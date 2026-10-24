/*
 * G2 CLI - Slow daemon e2e test runner (bank transfer)
 * Run with: make test-e2e-slow
 * Requires G2 device connected via USB.
 *
 * Kept separate from run_tests_e2e.c: every get-bank/send-bank call
 * walks a whole hardware bank (128 request/response round trips, see
 * g2_get_bank), so even the cheapest test here can run well past 2 seconds.
 * `make test`/`make test-e2e` stay fast; run this target separately
 * when you want the bank-transfer coverage too.
 */

#include "unity.h"
#include "unity_internals.h"
#include "cJSON.h"
#include "../include/g2_device.h"
#include "daemon_harness.h"
#include "runner_common.h"
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern void test_bank_transfer_set_daemon(daemon_ctx_t *d);
extern void test_bank_transfer_patch_fetch(void);
extern void test_bank_transfer_patch_write_roundtrip(void);
extern void test_bank_transfer_performance_fetch(void);
extern void test_bank_transfer_performance_write_roundtrip(void);
extern void test_daemon_reload_names_complete(void);
extern void test_bank_transfer_location_roundtrip(void);

int main(void) {
    /* Pre-flight: without it, all four tests plus their sleep(5) gaps (15s+) would run
     * to completion just to report SKIP. */
    int rc = g2_preflight("SLOW E2E TESTS");
    if (rc >= 0) return rc;

    /* Same daemon setup as make test-e2e (test_daemon.c's test_daemon_starts):
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

    fprintf(stderr, "Running slow e2e tests (bank transfer)...\n");
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
    if (run_test_silently("test_bank_transfer_performance_write_roundtrip", test_bank_transfer_performance_write_roundtrip)) {
        fprintf(stderr, "\033[33mG2 disconnected mid-run - stopping here.\033[0m\n");
        daemon_shutdown(&daemon);
        return UNITY_END();
    }
    sleep(5);
    if (run_test_silently("test_bank_transfer_location_roundtrip", test_bank_transfer_location_roundtrip)) {
        fprintf(stderr, "\033[33mG2 disconnected mid-run - stopping here.\033[0m\n");
        daemon_shutdown(&daemon);
        return UNITY_END();
    }
    sleep(5);
    run_test_silently("test_daemon_reload_names_complete", test_daemon_reload_names_complete);

    daemon_shutdown(&daemon);
    return UNITY_END();
}
