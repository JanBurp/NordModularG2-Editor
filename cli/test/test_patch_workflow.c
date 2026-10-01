/*
 * G2 CLI - Patch-editing workflow integration test (shared daemon)
 *
 * Builds a real patch from scratch in slot A (add modules, add cables, duplicate
 * a module, delete a cable, recolor, tweak params), then verifies a save/reload
 * roundtrip preserves it byte-for-byte, then restores slot A and confirms the
 * device's Patch/Performance mode and other-slot contents are unchanged. This is
 * the hardware/daemon-level analog of the offline Playwright suite in
 * g2-editor/e2e/patch-editing.spec.ts (same 6-module/5-cable layout).
 *
 * Runs on the same shared daemon connection as test_daemon.c, reached via that
 * file's accessor functions, so it doesn't pay for a second USB connection.
 */

#include "unity.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <unistd.h>
#include "cJSON.h"
#include "../include/utils.h"
#include "daemon_harness.h"

extern daemon_ctx_t *test_daemon_shared_ctx(void);
extern int test_daemon_shared_ok(void);
extern void test_daemon_mark_disconnected(void);

/* Own command-id counter, offset well clear of test_daemon.c's g_cmd_id so the
 * shared daemon never sees a collision within one test run. */
static int g_wf_cmd_id = 500000;

/* Sends {"id":<id>,"cmd":"<cmd_name>","args":[...]} built from argc trailing
 * const char* args, all as JSON strings (matches the wire protocol - every arg
 * is a string regardless of its logical type). Returns 0 on ok, -1 otherwise. */
static int wf_cmd(daemon_ctx_t *d, const char *cmd_name, int argc, ...) {
    int id = g_wf_cmd_id++;
    char buf[512];
    int pos = snprintf(buf, sizeof(buf), "{\"id\":%d,\"cmd\":\"%s\",\"args\":[", id, cmd_name);

    va_list ap;
    va_start(ap, argc);
    for (int i = 0; i < argc && pos < (int)sizeof(buf); i++) {
        const char *arg = va_arg(ap, const char *);
        pos += snprintf(buf + pos, sizeof(buf) - (size_t)pos, "%s\"%s\"", i ? "," : "", arg);
    }
    va_end(ap);
    snprintf(buf + pos, sizeof(buf) - (size_t)pos, "]}");

    return send_and_expect_ok(d, buf, id);
}

/* Fetches get-perf-settings and returns just the "data" object (mode + performance
 * + slots), detached from its {"id":..,"ok":..} wrapper so two snapshots can be
 * compared without the differing "id" fields getting in the way. Caller cJSON_Delete()s. */
static cJSON *wf_get_perf_settings_data(daemon_ctx_t *d) {
    int id = g_wf_cmd_id++;
    char cmd[64];
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-perf-settings\",\"args\":[]}", id);
    cJSON *resp = send_and_capture_response(d, cmd, id);
    if (!resp) return NULL;
    cJSON *data = cJSON_DetachItemFromObject(resp, "data");
    cJSON_Delete(resp);
    return data;
}

/* Uploads a fixture file to slot A via upload-patch-data (in-memory, matches
 * test_daemon.c's upload_fixture_to_slot_a but parameterized on fixture path). */
static int wf_upload_fixture_to_slot_a(daemon_ctx_t *d, const char *fixture_path) {
    FILE *f = fopen(fixture_path, "rb");
    if (!f) return -1;
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);
    uint8_t *data = malloc((size_t)fsize);
    if (!data) { fclose(f); return -1; }
    if (fread(data, 1, (size_t)fsize, f) != (size_t)fsize) { fclose(f); free(data); return -1; }
    fclose(f);

    char *b64 = base64_encode(data, (size_t)fsize);
    free(data);
    if (!b64) return -1;

    size_t cmdCap = strlen(b64) + 128;
    char *cmd = malloc(cmdCap);
    if (!cmd) { free(b64); return -1; }
    int id = g_wf_cmd_id++;
    snprintf(cmd, cmdCap, "{\"id\":%d,\"cmd\":\"upload-patch-data\",\"args\":[\"A\",\"%s\"]}", id, b64);
    free(b64);

    int r = send_and_expect_ok(d, cmd, id);
    free(cmd);
    return r;
}

/* Same base64-buffer upload, but for a buffer already in memory (used for the
 * roundtrip re-upload and for restoring the originally-captured patch). */
static int wf_upload_patch_data(daemon_ctx_t *d, const uint8_t *buf, size_t len) {
    char *b64 = base64_encode(buf, len);
    if (!b64) return -1;

    size_t cmdCap = strlen(b64) + 128;
    char *cmd = malloc(cmdCap);
    if (!cmd) { free(b64); return -1; }
    int id = g_wf_cmd_id++;
    snprintf(cmd, cmdCap, "{\"id\":%d,\"cmd\":\"upload-patch-data\",\"args\":[\"A\",\"%s\"]}", id, b64);
    free(b64);

    int r = send_and_expect_ok(d, cmd, id);
    free(cmd);
    return r;
}

/* Captures slot A's current patch as a fully-framed, re-uploadable pch2 buffer -
 * identical technique to test_daemon.c's capture_slot_a_patch (duplicated locally
 * per this file's own helper set rather than sharing statics across two large
 * test files; see daemon_harness.h for the shared send/receive primitives reused
 * either way). */
static int wf_capture_slot_a_patch(daemon_ctx_t *d, uint8_t **out_buf, size_t *out_len) {
    int id = g_wf_cmd_id++;
    char cmd[64];
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-patch\",\"args\":[\"A\"]}", id);
    cJSON *resp = send_and_capture_response(d, cmd, id);
    if (!resp) return -1;

    cJSON *data = cJSON_GetObjectItem(resp, "data");
    cJSON *name_item = data ? cJSON_GetObjectItem(data, "name") : NULL;
    cJSON *hex_item  = data ? cJSON_GetObjectItem(data, "data") : NULL;
    const char *name = name_item ? cJSON_GetStringValue(name_item) : NULL;
    const char *hex  = hex_item  ? cJSON_GetStringValue(hex_item)  : NULL;
    if (!name || !hex) { cJSON_Delete(resp); return -1; }

    uint8_t *sections = NULL;
    int sections_len = hex_to_bytes(hex, &sections);
    if (sections_len <= 0) { cJSON_Delete(resp); return -1; }

    size_t canon_cap = (size_t)sections_len + PCH2_CANONICAL_GROWTH;
    uint8_t *canon = malloc(canon_cap);
    size_t canon_len = 0;
    if (!canon) { free(sections); cJSON_Delete(resp); return -1; }
    patch_slot_sections_canonical(sections, (size_t)sections_len, canon, &canon_len);
    free(sections);

    size_t name_len = strlen(name);
    size_t buf_len = name_len + 3 + canon_len + 2;
    uint8_t *buf = malloc(buf_len);
    if (!buf) { free(canon); cJSON_Delete(resp); return -1; }

    size_t pos = 0;
    memcpy(buf + pos, name, name_len); pos += name_len;
    buf[pos++] = 0x00;
    buf[pos++] = 0x17;
    buf[pos++] = 0x00;  /* file type: patch */
    size_t crc_start = pos - 2;
    memcpy(buf + pos, canon, canon_len); pos += canon_len;
    free(canon);
    uint16_t crc = calc_crc16(buf + crc_start, (int)(pos - crc_start));
    buf[pos++] = (uint8_t)((crc >> 8) & 0xff);
    buf[pos++] = (uint8_t)(crc & 0xff);

    cJSON_Delete(resp);
    *out_buf = buf;
    *out_len = pos;
    return 0;
}

/* Full workflow: empty patch -> add modules -> add cables -> duplicate ("paste")
 * a module -> delete a cable -> recolor module+cable -> tweak a param -> save/
 * reload roundtrip compare -> restore slot A -> verify perf mode & other slots
 * unchanged. Mutates real slot A, so cleanup runs unconditionally regardless of
 * any failure recorded along the way (same defensive pattern as
 * test_bank_transfer.c's do_bank_roundtrip, adopted there after a real incident
 * where a skipped cleanup left test data on real hardware). */
void test_patch_workflow_full_cycle(void) {
    if (test_daemon_shared_ok() != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    daemon_ctx_t *d = test_daemon_shared_ctx();

    cJSON *perfBefore = wf_get_perf_settings_data(d);

    /* Tracks whether a wf_* call itself failed (real command/comm failure) as
     * opposed to a comparison-only mismatch (e.g. the roundtrip byte-compare or
     * the final perf-settings diff) - only the former should mark the shared
     * daemon as suspect for the perf-mode test that runs right after this one. */
    int commFailed = 0;

    const char *setupFail = NULL;
    uint8_t *original = NULL;
    size_t originalLen = 0;
    if (wf_cmd(d, "slot", 1, "A") != 0) {
        setupFail = "setup: select slot A failed";
        commFailed = 1;
    }
    if (!setupFail && wf_capture_slot_a_patch(d, &original, &originalLen) != 0) {
        setupFail = "setup: capture original slot A patch failed";
        commFailed = 1;
    }
    if (!setupFail && wf_upload_fixture_to_slot_a(d, "../test-patches/EmptyPatch.pch2") != 0) {
        setupFail = "setup: upload empty-patch fixture failed";
        commFailed = 1;
    }

    const char *bodyFail = NULL;
    uint8_t *canonBefore = NULL, *canonAfter = NULL;
    size_t canonBeforeLen = 0;

    /* Runs one workflow step: skips once bodyFail is already set, and marks
     * commFailed (real command failure, distinct from a comparison mismatch). */
    #define WF_STEP(callexpr, msg) \
        do { if (!bodyFail && (callexpr) != 0) { bodyFail = (msg); commFailed = 1; } } while (0)

    if (!setupFail) {
        /* -- add modules (num_modes=0, num_params=0 for all - G2 initialises params
         * to defaults regardless; see g2_add_module's documented (void)param_vals) -- */
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","97","1","0","0","2","0","0","OscA1"), "add-module OscA1 failed");
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","97","2","0","3","2","0","0","OscA2"), "add-module OscA2 failed");
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","92","3","1","0","3","0","0","FltClsc"), "add-module FltClsc failed");
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","20","4","1","4","4","0","0","EnvADSR"), "add-module EnvADSR failed");
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","194","5","2","0","5","0","0","Mix21A"), "add-module Mix21A failed");
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","4","6","2","4","6","0","0","Out2"), "add-module Out2 failed");

        /* -- add cables (color 0-6; con_type 1=out,0=in) -- */
        WF_STEP(wf_cmd(d, "add-cable", 9, "A","va","1","1","1","0","5","0","0"), "add-cable OscA1->Mix21A failed");
        WF_STEP(wf_cmd(d, "add-cable", 9, "A","va","1","2","1","0","5","0","1"), "add-cable OscA2->Mix21A failed");
        WF_STEP(wf_cmd(d, "add-cable", 9, "A","va","1","5","1","0","3","0","0"), "add-cable Mix21A->FltClsc failed");
        WF_STEP(wf_cmd(d, "add-cable", 9, "A","va","3","4","1","0","3","0","1"), "add-cable EnvADSR->FltClsc failed");
        WF_STEP(wf_cmd(d, "add-cable", 9, "A","va","1","3","1","0","6","0","0"), "add-cable FltClsc->Out2 failed");

        /* -- "copy/paste" a module: duplicate OscA1 as module 7, mirroring the real
         * frontend paste() composition (add-module, then set-param to copy the
         * source's value onto the new module, then a SEPARATE add-cable batch -
         * the firmware can't reference a brand-new module in the same frame as a
         * cable to it) -- */
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","97","7","3","0","2","0","0","OscA1cp"), "add-module OscA1cp (paste) failed");
        WF_STEP(wf_cmd(d, "set-param", 6, "A","va","1","0","64","0"), "set-param source OscA1 FreqCoarse failed");
        WF_STEP(wf_cmd(d, "set-param", 6, "A","va","7","0","64","0"), "set-param pasted OscA1cp FreqCoarse failed");
        WF_STEP(wf_cmd(d, "add-cable", 9, "A","va","1","7","1","0","3","0","2"), "add-cable OscA1cp->FltClsc failed");

        /* -- remove a cable -- */
        WF_STEP(wf_cmd(d, "del-cable", 8, "A","va","4","1","0","3","0","1"), "del-cable EnvADSR->FltClsc failed");

        /* -- change colors -- */
        WF_STEP(wf_cmd(d, "set-module-color", 4, "A","va","3","10"), "set-module-color FltClsc failed");
        WF_STEP(wf_cmd(d, "set-cable-color", 9, "A","va","6","1","1","0","5","0","0"), "set-cable-color OscA1->Mix21A failed");

        /* -- change a param on an untouched module -- */
        WF_STEP(wf_cmd(d, "set-param", 6, "A","va","5","0","80","0"), "set-param Mix21A Lev1 failed");

        /* -- save/reload roundtrip --
         * Hardware-confirmed: uploading a patch reverses the element order of at
         * least one list-type section (CABLE_LIST, 0x52) every time the G2 ingests
         * it, so two captures either side of a SINGLE re-upload never byte-match
         * (the list is reversed each pass, so it flips between two forms). What IS
         * stable is comparing two captures the same number of uploads apart -
         * three uploads after the live-edited state, captures #1 and #3 (both an
         * odd number of reversals from the original) must match. */
        uint8_t *snap1 = NULL, *snap2 = NULL, *snap3 = NULL;
        size_t snap1Len = 0, snap2Len = 0, snap3Len = 0;

        WF_STEP(wf_capture_slot_a_patch(d, &canonBefore, &canonBeforeLen), "roundtrip: capture after live edits failed");
        WF_STEP(wf_upload_patch_data(d, canonBefore, canonBeforeLen), "roundtrip: upload #1 failed");
        if (!bodyFail) daemon_wait_ready(d);
        WF_STEP(wf_capture_slot_a_patch(d, &snap1, &snap1Len), "roundtrip: capture #1 failed");

        WF_STEP(wf_upload_patch_data(d, snap1, snap1Len), "roundtrip: upload #2 failed");
        if (!bodyFail) daemon_wait_ready(d);
        WF_STEP(wf_capture_slot_a_patch(d, &snap2, &snap2Len), "roundtrip: capture #2 failed");

        WF_STEP(wf_upload_patch_data(d, snap2, snap2Len), "roundtrip: upload #3 failed");
        if (!bodyFail) daemon_wait_ready(d);
        WF_STEP(wf_capture_slot_a_patch(d, &snap3, &snap3Len), "roundtrip: capture #3 failed");

        /* Comparison-only check - NOT a command failure, so doesn't set commFailed. */
        if (!bodyFail && (snap1Len != snap3Len || memcmp(snap1, snap3, snap1Len) != 0))
            bodyFail = "roundtrip: byte compare mismatch (capture #1 vs #3)";

        canonAfter = snap3; /* keep for the free() below */
        free(snap1);
        free(snap2);
    }
    #undef WF_STEP

    /* --- Cleanup: restore slot A and re-check global state. Runs unconditionally,
     * regardless of setupFail/bodyFail above. --- */
    const char *cleanupFail = NULL;
    if (original && wf_upload_patch_data(d, original, originalLen) != 0) {
        cleanupFail = "cleanup: restore original slot A patch failed";
        commFailed = 1;
    }
    free(original);
    free(canonBefore);
    free(canonAfter);
    daemon_wait_ready(d);

    cJSON *perfAfter = wf_get_perf_settings_data(d);
    if (!cleanupFail && !(perfBefore && perfAfter && cJSON_Compare(perfBefore, perfAfter, 1)))
        cleanupFail = "cleanup: perf-settings snapshot changed across test (mode/slots drifted)";
    cJSON_Delete(perfBefore);
    cJSON_Delete(perfAfter);

    if (commFailed)
        test_daemon_mark_disconnected();

    /* Only now, after cleanup has definitely run: report outcomes. Cleanup
     * failures first - they mean real leftover/corrupted hardware state. */
    TEST_ASSERT_NULL_MESSAGE(cleanupFail, cleanupFail);
    TEST_ASSERT_NULL_MESSAGE(setupFail, setupFail);
    TEST_ASSERT_NULL_MESSAGE(bodyFail, bodyFail);
}

/* Naive binary substring search (memmem isn't portable across our build targets). */
static int wf_buf_contains(const uint8_t *buf, size_t len, const char *needle) {
    size_t n = strlen(needle);
    if (n == 0 || len < n) return 0;
    for (size_t i = 0; i + n <= len; i++)
        if (memcmp(buf + i, needle, n) == 0) return 1;
    return 0;
}

/* Sends one raw "seq" frame (args are nested arrays, which wf_cmd can't express). */
static int wf_seq(daemon_ctx_t *d, const char *ops_json) {
    int id = g_wf_cmd_id++;
    char buf[1024];
    snprintf(buf, sizeof(buf), "{\"id\":%d,\"cmd\":\"seq\",\"args\":[%s]}", id, ops_json);
    return send_and_expect_ok(d, buf, id);
}

/* Replace-module regression: the editor's "replace" (triangle menu) has no device command of its
 * own - like the official editor (G2Editor.c CPatchData::GetReplaceModuleMolecules) it is
 * composed of del-cable(s), del-module, add-module, add-cable. Sending del-module without first
 * deleting the module's cables, then re-adding the same module index with add-module+add-cable in
 * one frame, left the G2 in a bad state and dropped the USB connection. This replays the
 * editor's exact sequence (OscPM -> OscB, same index) twice and checks the device still answers
 * get-patch and holds the new module. Restores slot A afterwards, like the full-cycle test. */
void test_patch_workflow_replace_module(void) {
    if (test_daemon_shared_ok() != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    daemon_ctx_t *d = test_daemon_shared_ctx();

    cJSON *perfBefore = wf_get_perf_settings_data(d);
    int commFailed = 0;
    const char *setupFail = NULL;
    uint8_t *original = NULL;
    size_t originalLen = 0;
    if (wf_cmd(d, "slot", 1, "A") != 0) { setupFail = "setup: select slot A failed"; commFailed = 1; }
    if (!setupFail && wf_capture_slot_a_patch(d, &original, &originalLen) != 0) { setupFail = "setup: capture original slot A patch failed"; commFailed = 1; }
    if (!setupFail && wf_upload_fixture_to_slot_a(d, "../test-patches/EmptyPatch.pch2") != 0) { setupFail = "setup: upload empty-patch fixture failed"; commFailed = 1; }

    const char *bodyFail = NULL;
    #define WF_STEP(callexpr, msg) \
        do { if (!bodyFail && (callexpr) != 0) { bodyFail = (msg); commFailed = 1; } } while (0)

    if (!setupFail) {
        /* OscPM (183) id 1 -> Out2 (4) id 2 */
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","183","1","0","0","2","0","0","OscPM1"), "add-module OscPM failed");
        WF_STEP(wf_cmd(d, "add-module", 10, "A","va","4","2","1","0","6","0","0","Out2"), "add-module Out2 failed");
        WF_STEP(wf_cmd(d, "add-cable", 9, "A","va","1","1","1","0","2","0","0"), "add-cable OscPM->Out2 failed");

        /* Replace OscPM with OscB (7), then replace that again: the same index is reused both times. */
        const char *newNames[2] = { "OscB1", "OscB2" };
        for (int i = 0; i < 2 && !bodyFail; i++) {
            char ops[256];
            /* editor batch 1: delete cables, then the module */
            WF_STEP(wf_cmd(d, "del-cable", 8, "A","va","1","1","0","2","0","0"), "replace: del-cable failed");
            WF_STEP(wf_cmd(d, "del-module", 3, "A","va","1"), "replace: del-module failed");
            /* editor batch 2: add-module (same index/position); batch 3: add-cable */
            snprintf(ops, sizeof(ops), "[\"add-module\",\"A\",\"va\",\"7\",\"1\",\"0\",\"0\",\"2\",\"0\",\"0\",\"%s\"]", newNames[i]);
            WF_STEP(wf_seq(d, ops), "replace: seq add-module failed");
            WF_STEP(wf_seq(d, "[\"add-cable\",\"A\",\"va\",\"1\",\"1\",\"1\",\"0\",\"2\",\"0\",\"0\"]"), "replace: seq add-cable failed");
            if (!bodyFail) daemon_wait_ready(d);

            /* The real failure mode: the device stops answering. A get-patch must still work
             * and must contain the replacement module's name. */
            uint8_t *snap = NULL;
            size_t snapLen = 0;
            WF_STEP(wf_capture_slot_a_patch(d, &snap, &snapLen), "replace: get-patch after replace failed (device lost?)");
            if (!bodyFail && !wf_buf_contains(snap, snapLen, newNames[i])) bodyFail = "replace: replacement module name not found in patch";
            free(snap);
        }
    }
    #undef WF_STEP

    const char *cleanupFail = NULL;
    if (original && wf_upload_patch_data(d, original, originalLen) != 0) {
        cleanupFail = "cleanup: restore original slot A patch failed";
        commFailed = 1;
    }
    free(original);
    daemon_wait_ready(d);

    cJSON *perfAfter = wf_get_perf_settings_data(d);
    if (!cleanupFail && !(perfBefore && perfAfter && cJSON_Compare(perfBefore, perfAfter, 1)))
        cleanupFail = "cleanup: perf-settings snapshot changed across test (mode/slots drifted)";
    cJSON_Delete(perfBefore);
    cJSON_Delete(perfAfter);

    if (commFailed) test_daemon_mark_disconnected();

    TEST_ASSERT_NULL_MESSAGE(cleanupFail, cleanupFail);
    TEST_ASSERT_NULL_MESSAGE(setupFail, setupFail);
    TEST_ASSERT_NULL_MESSAGE(bodyFail, bodyFail);
}
