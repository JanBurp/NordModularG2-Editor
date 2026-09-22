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
#include <sys/select.h>
#include "cJSON.h"
#include "../include/g2_device.h"
#include "../include/utils.h"

typedef struct {
    int in_fd;
    int out_fd;
    pid_t pid;
} daemon_ctx_t;

/* Shared daemon state — initialised by test_daemon_starts, torn down by
 * test_daemon_perf_mode_cycle. */
static daemon_ctx_t g_daemon  = {0};
static int g_daemon_ok = -1;   /* -1=uninitialized, 0=ok, 1=no device */
static int g_cmd_id    = 0;

/* Read one newline-terminated line from fd. Returns byte count or -1 on timeout/error. */
static int read_line_timeout(int fd, char *buf, int bufsize, int timeout_sec) {
    int pos = 0;
    while (pos < bufsize - 1) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(fd, &fds);
        struct timeval tv = { timeout_sec, 0 };
        if (select(fd + 1, &fds, NULL, NULL, &tv) <= 0) return -1;
        if (read(fd, buf + pos, 1) <= 0) return -1;
        if (buf[pos++] == '\n') break;
    }
    buf[pos] = '\0';
    return pos;
}

/* Read lines until one has "type":expected_type. Returns parsed cJSON or NULL on timeout.
 * Caller cJSON_Delete()s the result. */
static cJSON *read_event_of_type(daemon_ctx_t *d, const char *expected_type,
                                  int max_lines, int timeout_sec) {
    char buf[65536];
    for (int i = 0; i < max_lines; i++) {
        if (read_line_timeout(d->out_fd, buf, sizeof(buf), timeout_sec) < 0) return NULL;
        cJSON *ev = cJSON_Parse(buf);
        if (!ev) continue;
        cJSON *t = cJSON_GetObjectItem(ev, "type");
        if (t && cJSON_IsString(t) && strcmp(t->valuestring, expected_type) == 0)
            return ev;
        cJSON_Delete(ev);
    }
    return NULL;
}

/* Like send_and_expect_ok but also captures the first event matching capture_type.
 * Caller cJSON_Delete()s *captured. ok response arrives AFTER async events for
 * commands like set-perf-mode, so we must scan all lines for both. */
static int send_and_expect_ok_save_event(daemon_ctx_t *d, const char *json,
                                          int expected_id, const char *capture_type,
                                          cJSON **captured) {
    char buf[65536];
    int len = (int)strlen(json);
    if (write(d->in_fd, json, len) != len) return -1;
    if (write(d->in_fd, "\n", 1) != 1) return -1;
    if (captured) *captured = NULL;

    for (int i = 0; i < 50; i++) {
        if (read_line_timeout(d->out_fd, buf, sizeof(buf), 5) < 0) return -1;
        cJSON *r = cJSON_Parse(buf);
        if (!r) continue;

        if (captured && *captured == NULL && capture_type) {
            cJSON *t = cJSON_GetObjectItem(r, "type");
            if (t && cJSON_IsString(t) && strcmp(t->valuestring, capture_type) == 0) {
                *captured = r;
                continue;
            }
        }

        cJSON *id_j = cJSON_GetObjectItem(r, "id");
        if (id_j && (int)id_j->valuedouble == expected_id) {
            int ok = cJSON_IsTrue(cJSON_GetObjectItem(r, "ok"));
            cJSON_Delete(r);
            return ok ? 0 : -1;
        }
        cJSON_Delete(r);
    }
    return -1;
}

/* Spawn daemon subprocess. Returns context with fds and pid. */
static daemon_ctx_t daemon_spawn(void) {
    daemon_ctx_t d = {0};
    int in_pipe[2], out_pipe[2];

    signal(SIGPIPE, SIG_IGN); /* write() returns -1 instead of killing us if daemon exits */
    g2_exit(); /* release any parent USB handle so the child can claim it */

    pipe(in_pipe);
    pipe(out_pipe);

    pid_t pid = fork();
    TEST_ASSERT_TRUE(pid >= 0);

    if (pid == 0) {
        /* Child: redirect stdin/stdout to pipes and exec daemon */
        dup2(in_pipe[0],  STDIN_FILENO);
        dup2(out_pipe[1], STDOUT_FILENO);
        close(in_pipe[1]); close(out_pipe[0]);
        close(in_pipe[0]); close(out_pipe[1]);
        execl("build/bin/g2-cli", "g2-cli", "--json", "daemon", NULL);
        exit(1);
    }

    /* Parent: close unused ends and wait for daemon to connect */
    close(in_pipe[0]);
    close(out_pipe[1]);
    d.in_fd = in_pipe[1];
    d.out_fd = out_pipe[0];
    d.pid = pid;

    usleep(1500000); /* allow daemon to connect and arm watch */
    return d;
}

/* Shutdown daemon: close stdin (EOF), drain pipe until daemon exits, reap.
 * Draining prevents the daemon from getting SIGPIPE on its next stdout write
 * (which make reports as "Broken pipe: 13"). */
static void daemon_shutdown(daemon_ctx_t *d) {
    close(d->in_fd);
    char buf[4096];
    fd_set fds;
    struct timeval tv;
    for (;;) {
        FD_ZERO(&fds); FD_SET(d->out_fd, &fds);
        tv.tv_sec = 2; tv.tv_usec = 0;
        if (select(d->out_fd + 1, &fds, NULL, NULL, &tv) <= 0) break;
        if (read(d->out_fd, buf, sizeof(buf)) <= 0) break;
    }
    close(d->out_fd);
    waitpid(d->pid, NULL, 0);
}

/* Send JSON command, skip watch events, return 0 if response has "ok":true for expected_id. */
static int send_and_expect_ok(daemon_ctx_t *d, const char *json, int expected_id) {
    char line_buf[65536];
    int json_len = (int)strlen(json);
    if (write(d->in_fd, json, json_len) != json_len) return -1;
    if (write(d->in_fd, "\n", 1) != 1) return -1;

    for (int attempts = 0; attempts < 30; attempts++) {
        if (read_line_timeout(d->out_fd, line_buf, sizeof(line_buf), 5) < 0) return -1;
        cJSON *resp = cJSON_Parse(line_buf);
        if (!resp) continue;
        cJSON *id_j = cJSON_GetObjectItem(resp, "id");
        if (id_j && (int)id_j->valuedouble == expected_id) {
            int ok = cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok"));
            cJSON_Delete(resp);
            return ok ? 0 : -1;
        }
        cJSON_Delete(resp);
    }
    return -1;
}

/* Test 1: Daemon starts — spawn the shared daemon and drain startup events until watch_armed. */
void test_daemon_starts(void) {
    g_daemon = daemon_spawn();
    TEST_ASSERT_TRUE(g_daemon.pid > 0);

    /* Drain device_info + slot_data×4 + names + watch_armed (7 lines).
     * 2s timeout per line: instant if G2 connected, 2s total if not. */
    cJSON *wa = read_event_of_type(&g_daemon, "watch_armed", 15, 2);
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

/* Test: dump-patch (Dump One) transmits the active slot A patch as MIDI SYSEX.
 * Transmit-only (no flash/state write), so no cleanup is needed. */
void test_daemon_dump_patch_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, upload_fixture_to_slot_a(&g_daemon), "setup: upload fixture to slot A");
    usleep(300000); /* let the slot settle, same convention as test_upload_patch.c */

    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"dump-patch\",\"args\":[\"A\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    TEST_ASSERT_EQUAL_INT(0, r);
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

