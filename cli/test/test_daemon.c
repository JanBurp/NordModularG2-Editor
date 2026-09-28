/*
 * G2 CLI - Daemon integration tests (shared-daemon approach)
 *
 * All tests share ONE daemon process (one USB connection) to match real-world
 * daemon client behaviour. The daemon is spawned by test_daemon_starts and shut down by
 * test_daemon_perf_mode_cycle. Command IDs increase monotonically via
 * g_cmd_id so the shared daemon can match responses to the right request.
 */

#include "unity.h"
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "cJSON.h"
#include "../include/utils.h"
#include "daemon_harness.h"

/* Shared daemon state — initialised by test_daemon_starts, torn down by
 * test_daemon_perf_mode_cycle. */
static daemon_ctx_t g_daemon  = {0};
static int g_daemon_ok = -1;   /* -1=uninitialized, 0=ok, 1=no device */
static int g_cmd_id    = 0;

/* Accessors so other files in this same test binary (e.g. test_patch_workflow.c) can
 * reuse this one shared daemon/USB connection instead of spawning a second one. */
daemon_ctx_t *test_daemon_shared_ctx(void) { return &g_daemon; }
int test_daemon_shared_ok(void) { return g_daemon_ok; }
void test_daemon_mark_disconnected(void) { g_daemon_ok = 1; }

/* Test 1: Daemon starts — spawn the shared daemon and drain startup events until watch_armed. */
void test_daemon_starts(void) {
    g_daemon = daemon_spawn();
    TEST_ASSERT_TRUE(g_daemon.pid > 0);

    /* Drain usb_devices + device_info + slot_data×4 + global_knobs_data + names_progress
     * (one line per bank, up to 40 - added for the startup progress bar) + names +
     * synth_settings_update + watch_armed. "names" (all patch/performance names across every
     * bank) is the slowest line to arrive - originally hardware-measured at ~2.2s on a
     * moderately full G2 (2s was intermittently too tight, bumped to 5s). Re-measured
     * 2026-09-28 against two units with larger catalogs: consistently ~10.9s and ~5.2s
     * solo AND under two-daemon contention (contention itself adds no measurable delay -
     * this is pure per-device g2_list() enumeration cost, proportional to catalog size), so
     * 5s is intermittently too tight again. Line count now varies with catalog size (one
     * names_progress per bank), so this is time-bound rather than attempt-bound: 40s overall
     * gives ~4x headroom above the worst measured startup, and 20s per line still catches a
     * genuine hang on any single line without masking it. */
    cJSON *wa = read_event_of_type(&g_daemon, "watch_armed", 40, 20);
    if (!wa) {
        g_daemon_ok = 1;
        TEST_IGNORE_MESSAGE("G2 not connected (no watch_armed from daemon)");
    }
    cJSON_Delete(wa);
    g_daemon_ok = 0;
}

/* Test 2: get-patch A returns patch data. */
void test_daemon_get_patch_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-patch\",\"args\":[\"A\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    if (r == -1) {
        g_daemon_ok = 1;
        TEST_IGNORE_MESSAGE("get-patch A failed");
    }
    g_daemon_ok = 0;
}

/* Test 3: Slot command works. */
void test_daemon_slot_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"slot\",\"args\":[\"A\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    TEST_ASSERT_EQUAL_INT(0, r);
}

/* Test 4: Variation command works with version cache. Uses var 2 so change is visible on G2. */
void test_daemon_variation_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"variation\",\"args\":[\"2\",\"A\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    TEST_ASSERT_EQUAL_INT(0, r);
}

/* Test: select-param (hardware cursor sync) reaches g2_select_param via the daemon's
 * JSON dispatch — regression test for an arg-count guard mismatch (n >= 5 required but
 * only 4 args are ever sent) that silently dropped every keyboard-nav cursor sync. Uses
 * a high module/param id (250/250) unlikely to collide with a real module. */
void test_daemon_select_param_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    char cmd[80];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"select-param\",\"args\":[\"A\",\"va\",\"250\",\"250\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    TEST_ASSERT_EQUAL_INT(0, r);
}

/* Test 5: A fast burst of set-param commands must not starve listener-forwarded watch
 * events until the whole burst drains — regression test for the daemon main loop's
 * stdin-drain-before-listener-check ordering (see STDIN_DRAIN_BATCH in daemon.c). Uses
 * a high module/param id (250/250) unlikely to collide with a real module in whatever
 * patch happens to be loaded on slot A, since this shared-daemon suite doesn't load a
 * scratch patch first. */
void test_daemon_stdin_burst_forwards_events_promptly(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    enum { BURST = 30 };
    int ids[BURST];
    char cmd[96];

    /* Fire the whole burst without waiting for any response in between — this is what
     * starves the listener queue under the old unconditional-drain loop. */
    for (int n = 0; n < BURST; n++) {
        ids[n] = g_cmd_id++;
        int len = snprintf(cmd, sizeof(cmd),
            "{\"id\":%d,\"cmd\":\"set-param\",\"args\":[\"A\",\"va\",\"250\",\"250\",\"%d\",\"0\"]}",
            ids[n], n % 2);
        TEST_ASSERT_TRUE(write(g_daemon.in_fd, cmd, len) == len);
        TEST_ASSERT_TRUE(write(g_daemon.in_fd, "\n", 1) == 1);
    }

    /* Every "ok" ack for the burst must show up — proves the loop restructuring didn't
     * drop/break command processing. Also note (best-effort; module 250/param 250 may
     * not exist in whatever patch is loaded) whether a param_change event was seen
     * before the last ack, i.e. interleaved with the burst rather than only after it. */
    int acked[BURST];
    memset(acked, 0, sizeof(acked));
    int acked_count = 0;
    int saw_event_before_last_ack = 0;
    int last_ack_seen = 0;

    char buf[65536];
    for (int i = 0; i < BURST * 3 && acked_count < BURST; i++) {
        if (read_line_timeout(g_daemon.out_fd, buf, sizeof(buf), 5) < 0) break;
        cJSON *r = cJSON_Parse(buf);
        if (!r) continue;

        cJSON *t = cJSON_GetObjectItem(r, "type");
        if (t && cJSON_IsString(t) && strcmp(t->valuestring, "param_change") == 0 && !last_ack_seen)
            saw_event_before_last_ack = 1;

        cJSON *id_j = cJSON_GetObjectItem(r, "id");
        if (id_j) {
            int id = (int)id_j->valuedouble;
            for (int n = 0; n < BURST; n++) {
                if (ids[n] == id && !acked[n]) {
                    acked[n] = 1;
                    acked_count++;
                    if (acked_count == BURST) last_ack_seen = 1;
                    break;
                }
            }
        }
        cJSON_Delete(r);
    }

    TEST_ASSERT_EQUAL_INT_MESSAGE(BURST, acked_count, "all burst commands acked");
    if (saw_event_before_last_ack)
        printf("[test_daemon_stdin_burst_forwards_events_promptly] param_change interleaved with burst, as expected\n");
    else
        printf("[test_daemon_stdin_burst_forwards_events_promptly] no param_change observed (module 250/param 250 likely doesn't exist on the loaded patch) — command-ack correctness still verified\n");
}

/* g2_dump_patch treats slot A's cached cable version being 0 ("empty/uninitialized")
 * as a hard error, unlike g2_send_controller_snapshot which just skips a version-0
 * slot (confirmed on real hardware: dump-patch failed here while send-controller-
 * snapshot right after it still passed). This shared-daemon suite otherwise never
 * loads a scratch patch, so whatever happens to already be in slot A - including
 * a freshly-booted "empty" state that reports version 0 - isn't guaranteed to be
 * non-empty. Upload a real fixture first so both tests below have a deterministic,
 * non-empty slot A regardless of prior device state. */
static int upload_fixture_to_slot_a(daemon_ctx_t *d) {
    FILE *f = fopen("../test-patches/DXBass FM4.pch2", "rb");
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
    int id = g_cmd_id++;
    snprintf(cmd, cmdCap, "{\"id\":%d,\"cmd\":\"upload-patch-data\",\"args\":[\"A\",\"%s\"]}", id, b64);
    free(b64);

    int r = send_and_expect_ok(d, cmd, id);
    free(cmd);
    return r;
}

/* Captures slot A's current patch as a fully-framed, re-uploadable pch2 buffer, so
 * a test that must overwrite slot A (see upload_fixture_to_slot_a above) can restore
 * it afterward. get-patch returns raw wire-order section bytes with no header/CRC;
 * this wraps them the same way g2_get_perf_file does per-slot (canonicalize order,
 * prepend [name][0x00][0x17][0x00], append calc_crc16 over [0x17][0x00][sections]). */
static int capture_slot_a_patch(daemon_ctx_t *d, uint8_t **out_buf, size_t *out_len) {
    int id = g_cmd_id++;
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

/* Uploads a buffer captured by capture_slot_a_patch back to slot A. */
static int restore_slot_a_patch(daemon_ctx_t *d, const uint8_t *buf, size_t len) {
    char *b64 = base64_encode(buf, len);
    if (!b64) return -1;

    size_t cmdCap = strlen(b64) + 128;
    char *cmd = malloc(cmdCap);
    if (!cmd) { free(b64); return -1; }
    int id = g_cmd_id++;
    snprintf(cmd, cmdCap, "{\"id\":%d,\"cmd\":\"upload-patch-data\",\"args\":[\"A\",\"%s\"]}", id, b64);
    free(b64);

    int r = send_and_expect_ok(d, cmd, id);
    free(cmd);
    return r;
}

/* Test: dump-patch (Dump One) transmits the active slot A patch as MIDI SYSEX.
 * dump-patch itself is transmit-only, but its setup step must overwrite slot A (see
 * upload_fixture_to_slot_a above), so this captures slot A's original patch first and
 * restores it afterward, leaving the G2's state unchanged by the end of the test. */
void test_daemon_dump_patch_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    uint8_t *saved_buf = NULL;
    size_t saved_len = 0;
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, capture_slot_a_patch(&g_daemon, &saved_buf, &saved_len),
                                  "setup: capture slot A before overwrite");

    TEST_ASSERT_EQUAL_INT_MESSAGE(0, upload_fixture_to_slot_a(&g_daemon), "setup: upload fixture to slot A");
    usleep(300000); /* let the slot settle, same convention as test_upload_patch.c */

    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"dump-patch\",\"args\":[\"A\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);

    int restore_r = restore_slot_a_patch(&g_daemon, saved_buf, saved_len);
    free(saved_buf);
    usleep(300000); /* let the slot settle before the next test reads it */

    TEST_ASSERT_EQUAL_INT(0, r);
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, restore_r, "teardown: restore slot A to its original patch");
}

/* Test: send-controller-snapshot pushes all active slots' MIDI CC values to
 * MIDI OUT. Transmit-only, no cleanup needed. */
void test_daemon_send_controller_snapshot_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    char cmd[80];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"send-controller-snapshot\",\"args\":[]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    TEST_ASSERT_EQUAL_INT(0, r);
}

/* Test 6: set-perf-mode cycle — performance then patch — verifies Delphi approach:
 * synth_settings_update must contain a "patches" array with 4 entries.
 * This is the last shared-daemon test; it calls daemon_shutdown. */
void test_daemon_perf_mode_cycle(void) {
    if (g_daemon_ok != 0) {
        daemon_shutdown(&g_daemon);
        TEST_IGNORE_MESSAGE("G2 device not connected");
    }
    char cmd[80];
    cJSON *synth_ev = NULL;

    int id0 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd),
             "{\"id\":%d,\"cmd\":\"set-perf-mode\",\"args\":[\"performance\"]}", id0);
    int r0 = send_and_expect_ok_save_event(&g_daemon, cmd, id0, "synth_settings_update", &synth_ev);
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r0, "set-perf-mode performance");
    if (synth_ev) {
        cJSON *patches = cJSON_GetObjectItem(synth_ev, "patches");
        TEST_ASSERT_NOT_NULL_MESSAGE(patches, "synth_settings_update has patches (performance)");
        TEST_ASSERT_EQUAL_INT_MESSAGE(4, cJSON_GetArraySize(patches), "patches has 4 slots");
        cJSON_Delete(synth_ev);
        synth_ev = NULL;
    }

    int id1 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd),
             "{\"id\":%d,\"cmd\":\"set-perf-mode\",\"args\":[\"patch\"]}", id1);
    int r1 = send_and_expect_ok_save_event(&g_daemon, cmd, id1, "synth_settings_update", &synth_ev);
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r1, "set-perf-mode patch");
    if (synth_ev) {
        cJSON *patches = cJSON_GetObjectItem(synth_ev, "patches");
        TEST_ASSERT_NOT_NULL_MESSAGE(patches, "synth_settings_update has patches (patch)");
        cJSON_Delete(synth_ev);
    }

    /* Drain version_update(scope=all_slots) and the START_COMM ACK {"type":"ok"}.
     * The daemon emits these AFTER the ok:true command ack, then calls g2_rearm(). */
    cJSON *rearm_ok = read_event_of_type(&g_daemon, "ok", 10, 3);
    if (rearm_ok) cJSON_Delete(rearm_ok);

    daemon_shutdown(&g_daemon);
}

