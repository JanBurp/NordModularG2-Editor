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
#include <signal.h>
#include <sys/wait.h>
#include <time.h>
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
    daemon_wait_ready(&g_daemon);

    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"dump-patch\",\"args\":[\"A\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);

    int restore_r = restore_slot_a_patch(&g_daemon, saved_buf, saved_len);
    free(saved_buf);
    daemon_wait_ready(&g_daemon);

    TEST_ASSERT_EQUAL_INT(0, r);
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, restore_r, "teardown: restore slot A to its original patch");
}

/* Reads one bit-field of `n` bits (MSB-first) at *bitpos from `buf`. */
static unsigned knob_bits(const uint8_t *buf, size_t *bitpos, int n) {
    unsigned v = 0;
    for (int i = 0; i < n; i++, (*bitpos)++)
        v = (v << 1) | ((buf[*bitpos >> 3] >> (7 - (*bitpos & 7))) & 1);
    return v;
}

/* Decodes knob `knob` from a knob-list payload: 16-bit count, then per knob a presence bit and
 * (when set) location(2) module(8) led(2) param(7) [+ target-slot(2) when `has_slot_field`, the
 * Global variant], same as the editor's readKnobSlotRecord. Returns 1 if assigned (fills the out
 * params; `tslot` may be NULL), 0 if empty, -1 if the list is shorter than `knob`. */
static int decode_knob(const uint8_t *p, int knob, int has_slot_field, int *loc, int *mod, int *par, int *tslot) {
    size_t bit = 0;
    unsigned count = knob_bits(p, &bit, 16);
    if ((unsigned)knob >= count) return -1;
    int result = 0;
    for (int k = 0; k <= knob; k++) {
        if (!knob_bits(p, &bit, 1)) continue;
        unsigned l = knob_bits(p, &bit, 2), m = knob_bits(p, &bit, 8);
        knob_bits(p, &bit, 2);
        unsigned pr = knob_bits(p, &bit, 7);
        unsigned ts = has_slot_field ? knob_bits(p, &bit, 2) : 0;
        if (k == knob) { *loc = (int)l; *mod = (int)m; *par = (int)pr; if (tslot) *tslot = (int)ts; result = 1; }
    }
    return result;
}

/* get-patch A, then decodes knob `knob` from its C_KNOBS (0x62) section. */
static int read_slot_a_knob(daemon_ctx_t *d, int knob, int *loc, int *mod, int *par) {
    int id = g_cmd_id++;
    char cmd[64];
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-patch\",\"args\":[\"A\"]}", id);
    cJSON *resp = send_and_capture_response(d, cmd, id);
    if (!resp) return -1;
    cJSON *data = cJSON_GetObjectItem(resp, "data");
    cJSON *hex_item = data ? cJSON_GetObjectItem(data, "data") : NULL;
    const char *hex = hex_item ? cJSON_GetStringValue(hex_item) : NULL;
    uint8_t *sec = NULL;
    int len = hex ? hex_to_bytes(hex, &sec) : -1;
    int result = -1;
    for (int o = 0; len > 0 && o + 3 <= len; ) {
        int n = (sec[o + 1] << 8) | sec[o + 2];
        if (sec[o] == 0x62 && o + 3 + n <= len) {
            result = decode_knob(sec + o + 3, knob, 0, loc, mod, par, NULL);
            break;
        }
        o += 3 + n;
    }
    free(sec);
    cJSON_Delete(resp);
    return result;
}

/* get-global-knobs, then decodes knob `knob` from the C_KNOBS_GLOBAL payload (same layout plus a
 * target-slot field). Same return convention as read_slot_a_knob. */
static int read_global_knob(daemon_ctx_t *d, int knob, int *loc, int *mod, int *par, int *tslot) {
    int id = g_cmd_id++;
    char cmd[64];
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-global-knobs\",\"args\":[]}", id);
    cJSON *resp = send_and_capture_response(d, cmd, id);
    if (!resp) return -1;
    cJSON *data = cJSON_GetObjectItem(resp, "data");
    cJSON *hex_item = data ? cJSON_GetObjectItem(data, "data") : NULL;
    const char *hex = hex_item ? cJSON_GetStringValue(hex_item) : NULL;
    uint8_t *raw = NULL;
    int len = hex ? hex_to_bytes(hex, &raw) : -1;
    int result = len >= 2 ? decode_knob(raw, knob, 1, loc, mod, par, tslot) : -1;
    free(raw);
    cJSON_Delete(resp);
    return result;
}

/* Test: assign-knob lands on the intended module/param/location. ok:true from the daemon only
 * means the USB write succeeded (the G2 never NACKs a bad field), and a wrong location byte
 * (bare `1` instead of `1<<6` for VA) once left the G2 in a bad state — so read the knob back via
 * get-patch. Same seq the editor sends when a param is moved to another knob: deassign the old
 * knob, then assign the new one (seq once rejected both ops with "invalid parameter"). Uses the DXBass FM4 fixture: knob 0 holds
 * VA module 1 param 0, knob 6 is free. Restores slot A afterwards. */
void test_daemon_assign_knob_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    uint8_t *saved_buf = NULL;
    size_t saved_len = 0;
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, capture_slot_a_patch(&g_daemon, &saved_buf, &saved_len),
                                  "setup: capture slot A before overwrite");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, upload_fixture_to_slot_a(&g_daemon), "setup: upload fixture to slot A");
    daemon_wait_ready(&g_daemon);

    int loc = -1, mod = -1, par = -1;
    int before0 = read_slot_a_knob(&g_daemon, 0, &loc, &mod, &par);
    int before6 = read_slot_a_knob(&g_daemon, 6, &loc, &mod, &par);
    int r_seq = -1, after0 = -1, after6 = -1;
    if (before0 == 1 && before6 == 0) {
        /* One compound "seq" frame, exactly as the editor's runBatch sends it. */
        char cmd[160];
        int id = g_cmd_id++;
        snprintf(cmd, sizeof(cmd),
                 "{\"id\":%d,\"cmd\":\"seq\",\"args\":[[\"deassign-knob\",\"A\",\"0\"],[\"assign-knob\",\"A\",\"va\",\"1\",\"0\",\"6\"]]}", id);
        r_seq = send_and_expect_ok(&g_daemon, cmd, id);
        daemon_wait_ready(&g_daemon);
        int l0, m0, p0;
        after0 = read_slot_a_knob(&g_daemon, 0, &l0, &m0, &p0);
        after6 = read_slot_a_knob(&g_daemon, 6, &loc, &mod, &par);
    }

    int restore_r = restore_slot_a_patch(&g_daemon, saved_buf, saved_len);
    free(saved_buf);
    daemon_wait_ready(&g_daemon);

    TEST_ASSERT_EQUAL_INT_MESSAGE(1, before0, "fixture: knob 0 should be assigned");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, before6, "fixture: knob 6 should be free");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_seq, "seq [deassign-knob, assign-knob] should be accepted");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, after0, "old knob 0 should be empty after deassign");
    TEST_ASSERT_EQUAL_INT_MESSAGE(1, after6, "knob 6 should be assigned (G2 still answers get-patch)");
    TEST_ASSERT_EQUAL_INT_MESSAGE(1, loc, "knob 6 location should be VA (1)");
    TEST_ASSERT_EQUAL_INT_MESSAGE(1, mod, "knob 6 module");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, par, "knob 6 param");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, restore_r, "teardown: restore slot A to its original patch");
}

/* Collects the labels of `mod` (VA area) param `param` from get-patch A's PARAM_NAMES (0x5B)
 * sections — bit-packed: area(2) modcount(8), then per module modIdx(8) moduleLen(8) and entries
 * isString(8) paramLen(8) paramIdx(8) + 7-byte labels (same layout as the editor's parseParamNames).
 * Returns the label count (0 = no entry for that param), -1 on get-patch failure. */
static int read_slot_a_param_labels(daemon_ctx_t *d, int mod, int param, char out[][8], int max) {
    int id = g_cmd_id++;
    char cmd[64];
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-patch\",\"args\":[\"A\"]}", id);
    cJSON *resp = send_and_capture_response(d, cmd, id);
    if (!resp) return -1;
    cJSON *data = cJSON_GetObjectItem(resp, "data");
    cJSON *hex_item = data ? cJSON_GetObjectItem(data, "data") : NULL;
    const char *hex = hex_item ? cJSON_GetStringValue(hex_item) : NULL;
    uint8_t *sec = NULL;
    int len = hex ? hex_to_bytes(hex, &sec) : -1;
    int found = -1;
    for (int o = 0; len > 0 && o + 3 <= len; ) {
        int n = (sec[o + 1] << 8) | sec[o + 2];
        if (sec[o] == 0x5B && o + 3 + n <= len) {
            const uint8_t *p = sec + o + 3;
            size_t bit = 0;
            unsigned area = knob_bits(p, &bit, 2), nummod = knob_bits(p, &bit, 8);
            for (unsigned i = 0; i < nummod; i++) {
                unsigned m = knob_bits(p, &bit, 8);
                int remaining = (int)knob_bits(p, &bit, 8);
                while (remaining > 0) {
                    knob_bits(p, &bit, 8);
                    unsigned plen = knob_bits(p, &bit, 8);
                    unsigned pidx = plen > 0 ? knob_bits(p, &bit, 8) : 0;
                    remaining -= plen > 0 ? 3 : 2;
                    int count = plen > 1 ? (int)((plen - 1) / 7) : 0;
                    for (int j = 0; j < count; j++) {
                        char lbl[8] = {0};
                        for (int k = 0; k < 7; k++) lbl[k] = (char)knob_bits(p, &bit, 8);
                        remaining -= 7;
                        if (area == 1 && (int)m == mod && (int)pidx == param && j < max) memcpy(out[j], lbl, 8);
                    }
                    if (area == 1 && (int)m == mod && (int)pidx == param) found = count;
                }
            }
        }
        o += 3 + n;
    }
    free(sec);
    cJSON_Delete(resp);
    return found < 0 ? 0 : found;
}

/* Sends set-module-labels for params first_param..first_param+n-1 of `mod` (one label each) — the
 * whole label list in one message, as the editor does, since the device replaces the module's list. */
static int set_slot_a_module_labels(daemon_ctx_t *d, int mod, int first_param, int n, const char *const *labels) {
    char cmd[512];
    int id = g_cmd_id++;
    int len = snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"set-module-labels\",\"args\":[\"A\",\"va\",\"%d\"", id, mod);
    for (int i = 0; i < n; i++)
        len += snprintf(cmd + len, sizeof(cmd) - (size_t)len, ",\"%d\",\"1\",\"%s\"", first_param + i, labels[i]);
    snprintf(cmd + len, sizeof(cmd) - (size_t)len, "]}");
    int r = send_and_expect_ok(d, cmd, id);
    daemon_wait_ready(d);
    return r;
}

/* Test: renaming buttons of a 4-button switch (set-module-labels) keeps every other button's label. Mixer 4-1 C
 * (type 123) has four OffOn buttons On1..On4 (params 4-7), each with its own label entry. The
 * daemon's ok:true only means the USB write went out, so each label is read back via get-patch
 * after every rename: all four must be present, and renaming one again must leave the other three
 * untouched. Restores slot A afterwards. */
void test_daemon_set_param_label_four_button_switch(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    static const char *names[4] = {"Mic", "Piano", "Bass", "Drums"};
    const int MIX = 90, FIRST_BTN = 4;
    char lbl[4][1][8];
    int cnt[4];
    int r_add = -1, r_set[4] = {-1, -1, -1, -1}, r_again = -1;
    int step1_ok = 1, step2_ok = 1;

    uint8_t *saved_buf = NULL;
    size_t saved_len = 0;
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, capture_slot_a_patch(&g_daemon, &saved_buf, &saved_len),
                                  "setup: capture slot A before overwrite");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, upload_fixture_to_slot_a(&g_daemon), "setup: upload fixture to slot A");
    daemon_wait_ready(&g_daemon);

    char cmd[160];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"add-module\",\"args\":[\"A\",\"va\",\"123\",\"%d\",\"0\",\"60\",\"0\",\"0\",\"0\",\"Mix\"]}", id, MIX);
    r_add = send_and_expect_ok(&g_daemon, cmd, id);
    daemon_wait_ready(&g_daemon);

    /* Step 1: rename all four buttons one after another; after each rename every button set so
     * far must still read back with its own name. */
    for (int b = 0; b < 4 && r_add == 0; b++) {
        r_set[b] = set_slot_a_module_labels(&g_daemon, MIX, FIRST_BTN, b + 1, names);
        for (int k = 0; k <= b; k++) {
            memset(lbl, 0, sizeof(lbl));
            cnt[k] = read_slot_a_param_labels(&g_daemon, MIX, FIRST_BTN + k, lbl[k], 1);
            if (cnt[k] < 1 || strcmp(lbl[k][0], names[k]) != 0) step1_ok = 0;
        }
    }

    /* Step 2: rename button 0 again; buttons 1-3 must keep their names. */
    const char *renamed[4] = {"Line", names[1], names[2], names[3]};
    r_again = set_slot_a_module_labels(&g_daemon, MIX, FIRST_BTN, 4, renamed);
    memset(lbl, 0, sizeof(lbl));
    for (int k = 0; k < 4; k++) cnt[k] = read_slot_a_param_labels(&g_daemon, MIX, FIRST_BTN + k, lbl[k], 1);
    if (cnt[0] < 1 || strcmp(lbl[0][0], "Line") != 0) step2_ok = 0;
    for (int k = 1; k < 4; k++)
        if (cnt[k] < 1 || strcmp(lbl[k][0], names[k]) != 0) step2_ok = 0;

    int restore_r = restore_slot_a_patch(&g_daemon, saved_buf, saved_len);
    free(saved_buf);
    daemon_wait_ready(&g_daemon);

    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_add, "add-module Mixer 4-1 C should be accepted");
    for (int b = 0; b < 4; b++) TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_set[b], "set-module-labels should be accepted");
    TEST_ASSERT_TRUE_MESSAGE(step1_ok, "after renaming On1..On4, every button must read back with its own label");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_again, "second set-module-labels should be accepted");
    TEST_ASSERT_TRUE_MESSAGE(step2_ok, "renaming On1 again must keep the labels of On2..On4");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, restore_r, "teardown: restore slot A to its original patch");
}

/* Test: a get-patch right after two add-modules must succeed. The G2 answers the version query
 * late (~555 ms seen in the 2026-10-04 duration test) while it is still applying the adds; the old
 * 500 ms wait failed and the real reply then surfaced as a stray patch_version event. Uses module
 * indices 126/127 (the highest valid ones). Restores slot A afterwards. */
void test_daemon_get_patch_right_after_add_modules(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    uint8_t *saved_buf = NULL;
    size_t saved_len = 0;
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, capture_slot_a_patch(&g_daemon, &saved_buf, &saved_len),
                                  "setup: capture slot A before overwrite");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, upload_fixture_to_slot_a(&g_daemon), "setup: upload fixture to slot A");
    daemon_wait_ready(&g_daemon);

    char cmd[200];
    int r_add[2];
    for (int i = 0; i < 2; i++) {
        int id = g_cmd_id++;
        snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"add-module\",\"args\":[\"A\",\"va\",\"%d\",\"%d\",\"%d\",\"0\",\"0\",\"0\",\"0\",\"M%d\"]}",
                 id, i ? 92 : 97, 126 + i, 10 + i, i);
        r_add[i] = send_and_expect_ok(&g_daemon, cmd, id);
    }
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-patch\",\"args\":[\"B\"]}", id);
    int r_get = send_and_expect_ok(&g_daemon, cmd, id);
    int stray = 0;
    for (cJSON *ev; (ev = read_event_of_type(&g_daemon, "patch_version", 2, 1)) != NULL; cJSON_Delete(ev)) {
        cJSON *slot = cJSON_GetObjectItem(ev, "slot");
        if (cJSON_IsString(slot) && strcmp(slot->valuestring, "B") == 0) stray = 1;
    }

    int restore_r = restore_slot_a_patch(&g_daemon, saved_buf, saved_len);
    free(saved_buf);
    daemon_wait_ready(&g_daemon);

    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_add[0], "add-module 126 should be accepted");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_add[1], "add-module 127 should be accepted");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_get, "get-patch B right after the adds must succeed");
    TEST_ASSERT_FALSE_MESSAGE(stray, "the version reply must not surface later as a stray patch_version event");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, restore_r, "teardown: restore slot A to its original patch");
}

/* Reads the four slots' key flags from get-perf-settings; 0 = ok, -1 = no/odd answer. */
static int read_slot_keys(daemon_ctx_t *d, int keys[4]) {
    int id = g_cmd_id++;
    char cmd[64];
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-perf-settings\",\"args\":[]}", id);
    cJSON *resp = send_and_capture_response(d, cmd, id);
    cJSON *slots = resp ? cJSON_GetObjectItem(cJSON_GetObjectItem(resp, "data"), "slots") : NULL;
    int ok = cJSON_GetArraySize(slots) == 4 ? 0 : -1;
    for (int i = 0; ok == 0 && i < 4; i++) keys[i] = cJSON_IsTrue(cJSON_GetObjectItem(cJSON_GetArrayItem(slots, i), "key"));
    cJSON_Delete(resp);
    return ok;
}

/* Test: rapid set-slot-key writes right after a get-patch (which triggers a stream rearm burst).
 * Each set-slot-key is a read-modify-write of the whole performance settings; it used to take the
 * first extended message as its reply and not wait for the write's ack, so a burst of them wedged the
 * G2 (duration test 2026-10-05). Afterwards the G2 must still answer and the key flags must read back
 * exactly as last written. Restores the original key flags. */
void test_daemon_set_slot_key_burst(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    int orig[4], after[4];
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, read_slot_keys(&g_daemon, orig), "setup: read key flags");

    char cmd[128];
    int failures = 0;
    int want[4] = {orig[0], orig[1], orig[2], orig[3]};
    for (int round = 0; round < 10; round++) {
        if (round % 3 == 0) {
            int id = g_cmd_id++;
            snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-patch\",\"args\":[\"A\"]}", id);
            if (send_and_expect_ok(&g_daemon, cmd, id) != 0) failures++;
        }
        int slot = round % 4;
        want[slot] = !want[slot];
        int id = g_cmd_id++;
        snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"set-slot-key\",\"args\":[\"%c\",\"%d\"]}", id, "ABCD"[slot], want[slot]);
        if (send_and_expect_ok(&g_daemon, cmd, id) != 0) failures++;
    }
    int read_ok = read_slot_keys(&g_daemon, after);

    for (int i = 0; i < 4; i++) {
        if (want[i] == orig[i]) continue;
        int id = g_cmd_id++;
        snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"set-slot-key\",\"args\":[\"%c\",\"%d\"]}", id, "ABCD"[i], orig[i]);
        send_and_expect_ok(&g_daemon, cmd, id);
    }
    daemon_wait_ready(&g_daemon);

    TEST_ASSERT_EQUAL_INT_MESSAGE(0, failures, "every get-patch / set-slot-key in the burst must answer ok");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, read_ok, "the G2 must still answer get-perf-settings after the burst");
    TEST_ASSERT_EQUAL_INT_ARRAY_MESSAGE(want, after, 4, "key flags must read back exactly as last written");
}


/* Test: assign-global-knob / deassign-global-knob through "seq" (the editor's runBatch path) land
 * on the intended target slot/module/param/location, read back via get-global-knobs. Picks the
 * highest free global knob, assigns VA module 1 param 0 of slot B to it, checks it, then deassigns
 * and checks it's empty again — leaving the performance's global knobs as found. */
void test_daemon_assign_global_knob_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    int loc, mod, par, ts, knob = -1;
    for (int k = 119; k >= 0; k--) {
        int r = read_global_knob(&g_daemon, k, &loc, &mod, &par, &ts);
        TEST_ASSERT_TRUE_MESSAGE(r >= 0, "setup: get-global-knobs failed");
        if (r == 0) { knob = k; break; }
    }
    TEST_ASSERT_TRUE_MESSAGE(knob >= 0, "setup: no free global knob");

    char cmd[192];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd),
             "{\"id\":%d,\"cmd\":\"seq\",\"args\":[[\"assign-global-knob\",\"A\",\"B\",\"va\",\"1\",\"0\",\"%d\"]]}", id, knob);
    int r_assign = send_and_expect_ok(&g_daemon, cmd, id);
    daemon_wait_ready(&g_daemon);
    loc = mod = par = ts = -1;
    int after_assign = read_global_knob(&g_daemon, knob, &loc, &mod, &par, &ts);

    id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd),
             "{\"id\":%d,\"cmd\":\"seq\",\"args\":[[\"deassign-global-knob\",\"A\",\"%d\"]]}", id, knob);
    int r_deassign = send_and_expect_ok(&g_daemon, cmd, id);
    daemon_wait_ready(&g_daemon);
    int l2, m2, p2, t2;
    int after_deassign = read_global_knob(&g_daemon, knob, &l2, &m2, &p2, &t2);

    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_assign, "seq [assign-global-knob] should be accepted");
    TEST_ASSERT_EQUAL_INT_MESSAGE(1, after_assign, "global knob should be assigned");
    TEST_ASSERT_EQUAL_INT_MESSAGE(1, ts, "global knob target slot should be B (1)");
    TEST_ASSERT_EQUAL_INT_MESSAGE(1, loc, "global knob location should be VA (1)");
    TEST_ASSERT_EQUAL_INT_MESSAGE(1, mod, "global knob module");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, par, "global knob param");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r_deassign, "seq [deassign-global-knob] should be accepted");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, after_deassign, "global knob should be empty after deassign");
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

/* Runs a one-shot `g2-cli --json <args>` and returns its parsed stdout (caller deletes), or NULL. */
static cJSON *run_oneshot(const char *args) {
    char cmd[128];
    snprintf(cmd, sizeof(cmd), "build/bin/g2-cli --json %s 2>/dev/null", args);
    FILE *f = popen(cmd, "r");
    if (!f) return NULL;
    size_t cap = 1 << 16, len = 0;
    char *buf = malloc(cap);
    for (size_t n; buf && (n = fread(buf + len, 1, cap - len - 1, f)) > 0; ) {
        len += n;
        if (len + 1 == cap) buf = realloc(buf, cap *= 2);
    }
    pclose(f);
    if (!buf) return NULL;
    buf[len] = '\0';
    cJSON *json = cJSON_Parse(buf);
    free(buf);
    return json;
}

/* 1 if every bank of `group` ("patches"/"performances") lists each location once. */
static int locations_unique(cJSON *names, const char *group) {
    cJSON *bank;
    cJSON_ArrayForEach(bank, cJSON_GetObjectItem(names, group)) {
        uint8_t seen[256] = {0};
        cJSON *e;
        cJSON_ArrayForEach(e, bank) {
            if (seen[cJSON_GetObjectItem(e, "location")->valueint & 0xff]++) return 0;
        }
    }
    return 1;
}

/* Test: one-shot get-patch and list while the G2 is still streaming (a daemon killed without
 * STOP_COMM leaves it so). Both used to take the first extended message as their reply: get-patch
 * returned LED/VU payloads as patch data (8 of 8 calls), list read every page one request late -
 * pages listed twice, performances under patch banks. Seen in the duration test of 2026-10-06
 * (44 of 704 get-patch replies, 3 of 4 bank snapshots) and reproduced exactly this way. Runs after
 * the shared daemon is gone; leaves the G2 streaming, which a daemon start handles. */
void test_oneshot_queries_with_stream_left_on(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");

    daemon_ctx_t d = daemon_spawn();
    TEST_ASSERT_TRUE_MESSAGE(d.pid > 0, "setup: spawn daemon");
    /* Kill it idle, after startup has armed the stream: killing it mid-transfer leaves a payload
     * unread and wedges the G2. Its output is drained meanwhile - a full pipe blocks the daemon
     * mid-operation, which wedged the G2 too. */
    char line[4096];
    for (time_t end = time(NULL) + 8; time(NULL) < end; ) read_line_timeout(d.out_fd, line, sizeof(line), 1);
    kill(d.pid, SIGKILL);
    waitpid(d.pid, NULL, 0);
    close(d.in_fd);
    close(d.out_fd);

    char args[32], msg[64];
    for (int i = 0; i < 4; i++) {
        snprintf(args, sizeof(args), "get-patch %c", "ABCD"[i]);
        cJSON *p = run_oneshot(args);
        cJSON *data = cJSON_GetObjectItem(p, "data");
        int ok = cJSON_IsString(data) && strncmp(data->valuestring, "21", 2) == 0;
        cJSON_Delete(p);
        snprintf(msg, sizeof(msg), "slot %c: patch data must start with 0x21", "ABCD"[i]);
        TEST_ASSERT_TRUE_MESSAGE(ok, msg);
    }

    cJSON *a = run_oneshot("list");
    cJSON *b = run_oneshot("list");
    int same = a && b && cJSON_Compare(a, b, 1);
    int uniq = a && locations_unique(a, "patches") && locations_unique(a, "performances");
    cJSON_Delete(a);
    cJSON_Delete(b);
    TEST_ASSERT_TRUE_MESSAGE(same, "two listings must be identical");
    TEST_ASSERT_TRUE_MESSAGE(uniq, "no bank may list a location twice");
}
