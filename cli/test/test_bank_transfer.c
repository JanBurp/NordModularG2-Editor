/*
 * Integration tests for get-bank / send-bank (Bank Upload / Bank Download).
 *
 * These are deliberately NOT part of test-integration: every get-bank/send-bank
 * call walks all 128 locations of a bank with one request/response round trip
 * each (there is no cheaper "give me a summary" command - see g2_get_bank's own
 * comment), so even a single call is much louder than anything else this CLI
 * does. Run via make test-integration-slow.
 *
 * Bank numbers are fixed config below instead of scanned for, so the traffic
 * cost per run is fixed and known: 1 bank operation for the fetch test, 5 for
 * the write roundtrip (precheck + write + verify + clear + verify), per type.
 *
 * Each of those operations is separated by human_pause() rather than a short
 * technical delay - real usage never chains several full-bank operations
 * within seconds of each other (see human_pause's own comment for why that
 * matters here), so neither does this test. That makes the whole suite slow
 * (several minutes) by design.
 */

#include "unity.h"
#include "../include/g2_device.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>

#define TMP_DIR   "/tmp/g2-bank-transfer-test"
#define SRC_DIR   TMP_DIR "/src"
#define EMPTY_DIR TMP_DIR "/empty"
#define DUMP_DIR  TMP_DIR "/dump"

/* ---- Configuration: designated scratch/reference banks -------------------
 * Confirm these on YOUR hardware before relying on them.
 *  - *_WRITE_TEST_BANK must actually be EMPTY - do_bank_roundtrip verifies
 *    this once and skips (never writes) if it isn't, but pick a bank you
 *    don't mind being briefly written to and cleared back to empty anyway.
 *  - *_FETCH_TEST_BANK can be ANY existing bank, occupied or not - the fetch
 *    test only ever reads, it never writes.
 */
#define PATCH_WRITE_TEST_BANK 6 /* confirmed empty on hardware, 2026-09-21 */
#define PATCH_FETCH_TEST_BANK 6 /* TODO: point at a bank number you know exists on your hardware */
#define PERF_WRITE_TEST_BANK  1 /* TODO: confirm this performance bank is actually empty on your hardware */
#define PERF_FETCH_TEST_BANK  1 /* TODO: point at a bank number you know exists on your hardware */

static int suite_initialized = 0;

/* Unlike test_upload_patch.c's ensure_g2 (whose tests are never registered in
 * run_tests_integration.c), these tests ARE registered and run by default, so
 * a missing device must self-skip via TEST_IGNORE_MESSAGE rather than hard-fail
 * the whole suite - same convention as test_daemon.c's g_daemon_ok checks. */
static int ensure_g2(void) {
    if (!suite_initialized) {
        g2_init();
        suite_initialized = 1;
    }
    if (!g2_is_connected() && g2_connect_silent() < 0) return -1;
    return 0;
}

static int copy_file(const char *src, const char *dst) {
    FILE *in = fopen(src, "rb");
    if (!in) return -1;
    FILE *out = fopen(dst, "wb");
    if (!out) { fclose(in); return -1; }
    char buf[4096];
    size_t n;
    while ((n = fread(buf, 1, sizeof(buf), in)) > 0) fwrite(buf, 1, n, out);
    fclose(in);
    fclose(out);
    return 0;
}

/* Confirmed on real hardware (2026-09-21) that chaining full 128-location bank
 * operations back to back with only a couple of seconds between them is
 * unreliable - a following get-bank/send-bank can report a false "no reply"
 * and abort, even though the preceding operation completed successfully. The
 * reference editor's CFlashDumper (other-approaches/G2-ReverseEngineered/
 * G2Editor.c:186001+) has no per-location timeout at all - it just waits,
 * however long that takes, for CFlashDumper::HandleDumpDownOK before sending
 * the next file. It gets away with that because a real user drives one bank
 * operation at a time through the UI (open a dialog, pick a folder, click
 * confirm) with natural pauses in between, not several chained in a couple of
 * minutes like an earlier version of this test did. This models that pacing
 * instead of a short technical settle. */
static void human_pause(void) {
    sleep(15);
}

/* Read-only sanity check: fetches a known bank and confirms get-bank itself
 * works end to end. Any bank works here - it never writes, so there is
 * nothing to verify empty and nothing to clean up. */
static void do_bank_fetch(int type, int bank) {
    if (ensure_g2() < 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    usleep(300000); /* let G2 settle, same convention as test_upload_patch.c */
    mkdir(TMP_DIR, 0755);
    mkdir(DUMP_DIR, 0755);

    cJSON *result = g2_get_bank(type, bank, DUMP_DIR, "BankFetchTest");
    TEST_ASSERT_NOT_NULL_MESSAGE(result, "g2_get_bank returned NULL");
    cJSON_Delete(result);
}

/* send-bank mutates real hardware flash, so this must never let a failed check
 * skip cleanup - confirmed the hard way (2026-09-21): an earlier version of
 * this test asserted immediately on the write result, which longjmp'd out on
 * a (as it turned out, transient/false) failure and skipped the clear-back-
 * to-empty step entirely, leaving a real test patch sitting in the bank until
 * it was found and cleared by hand. Every check from here on only records a
 * message; nothing calls TEST_ASSERT until cleanup has run. */
static void do_bank_roundtrip(int type, int bank, const char *label) {
    if (ensure_g2() < 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    usleep(300000); /* let G2 settle, same convention as test_upload_patch.c */
    mkdir(TMP_DIR, 0755);
    mkdir(SRC_DIR, 0755);
    mkdir(EMPTY_DIR, 0755);
    mkdir(DUMP_DIR, 0755);

    /* Confirm the configured bank is actually empty before writing anything -
     * a config mismatch (wrong bank number, or a patch saved there since this
     * was set up) is a reason to skip, not to silently overwrite real data. */
    cJSON *precheck = g2_get_bank(type, bank, DUMP_DIR, "BankTransferPrecheck");
    if (!precheck) TEST_IGNORE_MESSAGE("could not read the configured write-test bank - device not responding?");
    cJSON *precheckWritten = cJSON_GetObjectItem(precheck, "written");
    int precheckW = precheckWritten ? (int)precheckWritten->valuedouble : -1;
    cJSON_Delete(precheck);
    if (precheckW != 0) {
        char msg[192];
        snprintf(msg, sizeof(msg), "configured %s write-test bank %d is not empty (written=%d) - update *_WRITE_TEST_BANK in test_bank_transfer.c", label, bank, precheckW);
        TEST_IGNORE_MESSAGE(msg);
    }

    /* Build a 2-entry scratch source folder and an empty folder for cleanup,
     * from an existing tiny fixture (content doesn't matter - only that it's a
     * valid, small file - so the same fixture is copied under two names). */
    const char *fixture = (type == 0) ? "../test-patches/EmptyPatch.pch2" : "../test-patches/EmptyPerf.prf2";
    const char *ext = (type == 0) ? "pch2" : "prf2";
    char pathA[512], pathB[512];
    snprintf(pathA, sizeof(pathA), "%s/BankTestA.%s", SRC_DIR, ext);
    snprintf(pathB, sizeof(pathB), "%s/BankTestB.%s", SRC_DIR, ext);
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, copy_file(fixture, pathA), "copy fixture A into scratch source folder");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, copy_file(fixture, pathB), "copy fixture B into scratch source folder");

    const char *type_str = (type == 0) ? "patch" : "performance";
    const char *failMsg = NULL;

    /* --- Write the 2-entry scratch bank into the empty bank --- */
    human_pause();
    cJSON *sendResult = g2_send_bank(type_str, "folder", SRC_DIR, bank);
    if (!sendResult) {
        failMsg = "g2_send_bank (write) returned NULL";
    } else {
        cJSON *written = cJSON_GetObjectItem(sendResult, "written");
        cJSON *failed  = cJSON_GetObjectItem(sendResult, "failed");
        cJSON *aborted = cJSON_GetObjectItem(sendResult, "aborted");
        if (!written || (int)written->valuedouble != 2) failMsg = "send-bank (write): expected 2 written";
        else if (!failed || (int)failed->valuedouble != 0) failMsg = "send-bank (write): expected 0 failed";
        else if (cJSON_IsTrue(aborted)) failMsg = "send-bank (write) aborted";
        cJSON_Delete(sendResult);
    }

    /* --- Verify via get-bank that the 2 entries actually landed --- */
    if (!failMsg) {
        human_pause();
        cJSON *dumpResult = g2_get_bank(type, bank, DUMP_DIR, "BankTransferTest");
        if (!dumpResult) {
            failMsg = "g2_get_bank (verify write) returned NULL";
        } else {
            cJSON *dumpWritten = cJSON_GetObjectItem(dumpResult, "written");
            if (!dumpWritten || (int)dumpWritten->valuedouble != 2) failMsg = "get-bank (verify write): expected 2 patches present after write";
            cJSON_Delete(dumpResult);
        }
    }

    /* --- Cleanup: clear the bank back to empty (an empty source clears every
     * location that has no matching entry, i.e. all 128 - see g2_send_bank).
     * Runs unconditionally, regardless of failMsg above. --- */
    const char *cleanupFailMsg = NULL;
    human_pause();
    cJSON *clearResult = g2_send_bank(type_str, "folder", EMPTY_DIR, bank);
    if (!clearResult) {
        cleanupFailMsg = "g2_send_bank (clear) returned NULL - bank may still hold test data, check by hand";
    } else {
        cJSON *cleared = cJSON_GetObjectItem(clearResult, "cleared");
        if (!cleared || (int)cleared->valuedouble != 128)
            cleanupFailMsg = "send-bank (clear): expected all 128 locations cleared - bank may still hold test data, check by hand";
        cJSON_Delete(clearResult);
    }

    /* --- Verify cleanup actually left the bank empty again --- */
    human_pause();
    cJSON *finalResult = g2_get_bank(type, bank, DUMP_DIR, "BankTransferTest");
    if (!finalResult) {
        if (!cleanupFailMsg) cleanupFailMsg = "g2_get_bank (verify cleanup) returned NULL - check bank by hand";
    } else {
        cJSON *finalWritten = cJSON_GetObjectItem(finalResult, "written");
        if (!finalWritten || (int)finalWritten->valuedouble != 0) {
            if (!cleanupFailMsg) cleanupFailMsg = "bank not empty after cleanup - check bank by hand";
        }
        cJSON_Delete(finalResult);
    }

    /* Report cleanup problems first - those mean real leftover data - then the
     * original write/verify outcome. */
    TEST_ASSERT_NULL_MESSAGE(cleanupFailMsg, cleanupFailMsg);
    TEST_ASSERT_NULL_MESSAGE(failMsg, failMsg);
}

void test_bank_transfer_patch_fetch(void) {
    do_bank_fetch(0, PATCH_FETCH_TEST_BANK);
}

void test_bank_transfer_patch_write_roundtrip(void) {
    do_bank_roundtrip(0, PATCH_WRITE_TEST_BANK, "patch");
}

void test_bank_transfer_performance_fetch(void) {
    do_bank_fetch(1, PERF_FETCH_TEST_BANK);
}

void test_bank_transfer_performance_write_roundtrip(void) {
    do_bank_roundtrip(1, PERF_WRITE_TEST_BANK, "performance");
}
