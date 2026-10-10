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
 * by design.
 *
 * get-bank/send-bank no longer stop the G2's live stream during a transfer (the
 * g2_lock_stream()/g2_unlock_stream() precaution was removed from both, see g2_device.c)
 * so front-panel parameter changes aren't silently lost mid-transfer - which means the
 * flash-dump/live-stream interleaving risk that precaution used to guard against is back
 * in play for chained bank ops. human_pause() stays as the defensive default regardless:
 * it models realistic user pacing (one bank operation at a time through the UI), not a
 * technical workaround for that risk.
 */

#include "unity.h"
#include "cJSON.h"
#include "daemon_harness.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <time.h>

#define TMP_DIR   "/tmp/g2-bank-transfer-test"
#define SRC_DIR   TMP_DIR "/src"
#define EMPTY_DIR TMP_DIR "/empty"
#define DUMP_DIR  TMP_DIR "/dump"

/* ---- Configuration: designated scratch/reference banks -------------------
 * Confirm these on YOUR hardware before relying on them.
 *  - *_WRITE_TEST_BANK is DESTRUCTIVE: do_bank_roundtrip overwrites whatever is
 *    in it and leaves it EMPTY afterwards. Pick a scratch bank you don't need.
 *  - *_FETCH_TEST_BANK can be ANY existing bank, occupied or not - the fetch
 *    test only ever reads, it never writes.
 */
 #define PATCH_FETCH_TEST_BANK 1 /* known-existing patch bank, 2026-09-21 */
#define PATCH_WRITE_TEST_BANK 32 /* scratch bank: overwritten and cleared by the test */
#define PERF_FETCH_TEST_BANK  1 /* known-existing performance bank, 2026-09-21 */
#define PERF_WRITE_TEST_BANK  8 /* scratch bank: overwritten and cleared by the test */

/* Injected by run_tests_integration_slow.c's main() via test_bank_transfer_set_daemon,
 * which owns spawn/shutdown (see that file for why: it has early-return points on
 * mid-run disconnect, so the daemon lifecycle can't be tied to a single Unity test
 * the way test_daemon.c's test_daemon_starts/test_daemon_perf_mode_cycle do it). */
static daemon_ctx_t *g_daemon = NULL;
static int g_cmd_id = 0;
/* Set by bank_cmd() when the daemon fails to answer a command in time - the daemon-
 * based equivalent of "device unplugged mid-call". Checked by every test entry point
 * so a disconnect mid-suite reads as "G2 device not connected" (same message/substring
 * test_daemon.c's tests use) instead of cascading unrelated assertion failures through
 * the rest of do_bank_roundtrip. */
static int g_device_lost = 0;

void test_bank_transfer_set_daemon(daemon_ctx_t *d) {
    g_daemon = d;
}

/* Wraps send_and_capture_response so every bank command in this file goes through the
 * daemon (matching how a real client like the Electron app calls get-bank/send-bank),
 * and centralizes device-lost detection. */
static cJSON *bank_cmd(const char *json, int id) {
    cJSON *resp = send_and_capture_response(g_daemon, json, id);
    if (!resp) g_device_lost = 1;
    return resp;
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
 * instead of a short technical settle. See this file's top comment for why
 * this stays in place even after the g2_lock_stream()/g2_unlock_stream()
 * fix landed. */
static void human_pause(void) {
    sleep(5);
}

/* get-bank/send-bank via the shared daemon, mirroring test_daemon.c's
 * bank_chain_one_type argument order (confirmed against daemon.c's dispatch). */
static cJSON *do_get_bank_cmd(const char *type_str, int bank, const char *dir, const char *label) {
    char cmd[512];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-bank\",\"args\":[\"%s\",\"%d\",\"%s\",\"%s\"]}",
              id, type_str, bank, dir, label);
    return bank_cmd(cmd, id);
}

static cJSON *do_send_bank_cmd(const char *type_str, const char *source_path, int bank) {
    char cmd[600];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"send-bank\",\"args\":[\"%s\",\"folder\",\"%s\",\"%d\"]}",
              id, type_str, source_path, bank);
    return bank_cmd(cmd, id);
}

/* Read-only sanity check: fetches a known bank and confirms get-bank itself
 * works end to end. Any bank works here - it never writes, so there is
 * nothing to verify empty and nothing to clean up. */
static void do_bank_fetch(int type, int bank) {
    if (!g_daemon || g_device_lost) TEST_IGNORE_MESSAGE("G2 device not connected");
    daemon_wait_ready(g_daemon);
    mkdir(TMP_DIR, 0755);
    mkdir(DUMP_DIR, 0755);

    const char *type_str = (type == 0) ? "patch" : "performance";
    cJSON *resp = do_get_bank_cmd(type_str, bank, DUMP_DIR, "BankFetchTest");
    TEST_ASSERT_NOT_NULL_MESSAGE(resp, "get-bank returned no response");
    TEST_ASSERT_TRUE_MESSAGE(cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok")), "get-bank not ok");
    cJSON_Delete(resp);
}

/* send-bank mutates real hardware flash, so this must never let a failed check
 * skip cleanup - confirmed the hard way (2026-09-21): an earlier version of
 * this test asserted immediately on the write result, which longjmp'd out on
 * a (as it turned out, transient/false) failure and skipped the clear-back-
 * to-empty step entirely, leaving a real test patch sitting in the bank until
 * it was found and cleared by hand. Every check from here on only records a
 * message; nothing calls TEST_ASSERT until cleanup has run. */
static void do_bank_roundtrip(int type, int bank) {
    if (!g_daemon || g_device_lost) TEST_IGNORE_MESSAGE("G2 device not connected");
    daemon_wait_ready(g_daemon);
    mkdir(TMP_DIR, 0755);
    mkdir(SRC_DIR, 0755);
    mkdir(EMPTY_DIR, 0755);
    mkdir(DUMP_DIR, 0755);

    const char *type_str = (type == 0) ? "patch" : "performance";

    /* Sanity check that get-bank works on the scratch bank before writing. Existing
     * content is not a reason to skip: the write below overwrites it and the
     * cleanup step clears the whole bank. */
    cJSON *precheck = do_get_bank_cmd(type_str, bank, DUMP_DIR, "BankTransferPrecheck");
    if (!precheck || !cJSON_IsTrue(cJSON_GetObjectItem(precheck, "ok"))) {
        if (precheck) cJSON_Delete(precheck);
        TEST_FAIL_MESSAGE("get-bank of the configured write-test bank failed - device is present but get-bank is broken");
    }
    cJSON_Delete(precheck);

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

    const char *failMsg = NULL;

    /* --- Write the 2-entry scratch bank into the scratch bank --- */
    human_pause();
    cJSON *sendResp = do_send_bank_cmd(type_str, SRC_DIR, bank);
    if (!sendResp || !cJSON_IsTrue(cJSON_GetObjectItem(sendResp, "ok"))) {
        failMsg = "send-bank (write) returned no ok response";
    } else {
        cJSON *data = cJSON_GetObjectItem(sendResp, "data");
        cJSON *written = data ? cJSON_GetObjectItem(data, "written") : NULL;
        cJSON *failed  = data ? cJSON_GetObjectItem(data, "failed") : NULL;
        cJSON *aborted = data ? cJSON_GetObjectItem(data, "aborted") : NULL;
        if (!written || (int)written->valuedouble != 2) failMsg = "send-bank (write): expected 2 written";
        else if (!failed || (int)failed->valuedouble != 0) failMsg = "send-bank (write): expected 0 failed";
        else if (cJSON_IsTrue(aborted)) failMsg = "send-bank (write) aborted";
    }
    if (sendResp) cJSON_Delete(sendResp);

    /* --- Verify via get-bank that the 2 entries actually landed --- */
    if (!failMsg) {
        human_pause();
        cJSON *dumpResp = do_get_bank_cmd(type_str, bank, DUMP_DIR, "BankTransferTest");
        if (!dumpResp || !cJSON_IsTrue(cJSON_GetObjectItem(dumpResp, "ok"))) {
            failMsg = "get-bank (verify write) returned no ok response";
        } else {
            cJSON *data = cJSON_GetObjectItem(dumpResp, "data");
            cJSON *dumpWritten = data ? cJSON_GetObjectItem(data, "written") : NULL;
            if (!dumpWritten || (int)dumpWritten->valuedouble != 2) failMsg = "get-bank (verify write): expected 2 patches present after write";
        }
        if (dumpResp) cJSON_Delete(dumpResp);
    }

    /* --- Cleanup: clear the bank back to empty (an empty source clears every
     * location that has no matching entry, i.e. all 128 - see g2_send_bank).
     * Runs unconditionally, regardless of failMsg above. --- */
    const char *cleanupFailMsg = NULL;
    human_pause();
    cJSON *clearResp = do_send_bank_cmd(type_str, EMPTY_DIR, bank);
    if (!clearResp || !cJSON_IsTrue(cJSON_GetObjectItem(clearResp, "ok"))) {
        cleanupFailMsg = "send-bank (clear) returned no ok response - bank may still hold test data, check by hand";
    } else {
        cJSON *data = cJSON_GetObjectItem(clearResp, "data");
        cJSON *cleared = data ? cJSON_GetObjectItem(data, "cleared") : NULL;
        if (!cleared || (int)cleared->valuedouble != 128)
            cleanupFailMsg = "send-bank (clear): expected all 128 locations cleared - bank may still hold test data, check by hand";
    }
    if (clearResp) cJSON_Delete(clearResp);

    /* --- Verify cleanup actually left the bank empty again --- */
    human_pause();
    cJSON *finalResp = do_get_bank_cmd(type_str, bank, DUMP_DIR, "BankTransferTest");
    if (!finalResp || !cJSON_IsTrue(cJSON_GetObjectItem(finalResp, "ok"))) {
        if (!cleanupFailMsg) cleanupFailMsg = "get-bank (verify cleanup) returned no ok response - check bank by hand";
    } else {
        cJSON *data = cJSON_GetObjectItem(finalResp, "data");
        cJSON *finalWritten = data ? cJSON_GetObjectItem(data, "written") : NULL;
        if (!finalWritten || (int)finalWritten->valuedouble != 0) {
            if (!cleanupFailMsg) cleanupFailMsg = "bank not empty after cleanup - check bank by hand";
        }
    }
    if (finalResp) cJSON_Delete(finalResp);

    /* Report cleanup problems first - those mean real leftover data - then the
     * original write/verify outcome. */
    TEST_ASSERT_NULL_MESSAGE(cleanupFailMsg, cleanupFailMsg);
    TEST_ASSERT_NULL_MESSAGE(failMsg, failMsg);
}

void test_bank_transfer_patch_fetch(void) {
    do_bank_fetch(0, PATCH_FETCH_TEST_BANK);
}

void test_bank_transfer_patch_write_roundtrip(void) {
    do_bank_roundtrip(0, PATCH_WRITE_TEST_BANK);
}

void test_bank_transfer_performance_fetch(void) {
    do_bank_fetch(1, PERF_FETCH_TEST_BANK);
}

void test_bank_transfer_performance_write_roundtrip(void) {
    do_bank_roundtrip(1, PERF_WRITE_TEST_BANK);
}

/* Send reload-names and read events until its response. Returns the final "names" event's
 * data (caller cJSON_Delete()s), or NULL if none arrived. */
static cJSON *reload_names_collect(void) {
    char cmd[96];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"reload-names\",\"args\":[]}", id);
    TEST_ASSERT_TRUE(write(g_daemon->in_fd, cmd, strlen(cmd)) == (ssize_t)strlen(cmd));
    TEST_ASSERT_TRUE(write(g_daemon->in_fd, "\n", 1) == 1);

    cJSON *names = NULL;
    static char buf[1 << 20]; /* the complete "names" line is large */
    /* Deadline, not a line count: led_data backlog from the previous tests plus the
     * per-bank names_progress lines exceed any fixed count (see send_and_capture_response). */
    time_t deadline = time(NULL) + 120;
    while (time(NULL) < deadline) {
        if (read_line_timeout(g_daemon->out_fd, buf, sizeof(buf), 30) < 0) { g_device_lost = 1; break; }
        cJSON *r = cJSON_Parse(buf);
        if (!r) continue;
        cJSON *t = cJSON_GetObjectItem(r, "type");
        cJSON *rid = cJSON_GetObjectItem(r, "id");
        if (t && strcmp(t->valuestring, "names") == 0) {
            names = cJSON_DetachItemFromObject(r, "data");
        } else if (rid && rid->valueint == id) {
            cJSON_Delete(r);
            return names;
        }
        cJSON_Delete(r);
    }
    TEST_FAIL_MESSAGE("no response to reload-names");
    return names;
}

/* Test: reload-names returns one complete "names" event. */
void test_daemon_reload_names_complete(void) {
    if (!g_daemon || g_device_lost) TEST_IGNORE_MESSAGE("G2 device not connected");
    cJSON *names = reload_names_collect();
    TEST_ASSERT_NOT_NULL_MESSAGE(names, "complete names event");
    cJSON_Delete(names);
}
