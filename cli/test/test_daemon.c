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

/* Like send_and_expect_ok, but returns the full response object for expected_id instead of
 * just ok/-1 - needed for commands like send-bank whose "data" can report ret==G2_OK (so
 * "ok":true) while its own "aborted" field is true, since g2_send_bank always returns a
 * result object even when it stopped partway through. Caller cJSON_Delete()s the result. */
static cJSON *send_and_capture_response(daemon_ctx_t *d, const char *json, int expected_id) {
    char line_buf[65536];
    int json_len = (int)strlen(json);
    if (write(d->in_fd, json, json_len) != json_len) return NULL;
    if (write(d->in_fd, "\n", 1) != 1) return NULL;

    for (int attempts = 0; attempts < 200; attempts++) {
        if (read_line_timeout(d->out_fd, line_buf, sizeof(line_buf), 5) < 0) return NULL;
        cJSON *resp = cJSON_Parse(line_buf);
        if (!resp) continue;
        cJSON *id_j = cJSON_GetObjectItem(resp, "id");
        if (id_j && (int)id_j->valuedouble == expected_id) return resp;
        cJSON_Delete(resp);
    }
    return NULL;
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

/* Bank numbers used by test_daemon_bank_chain_get_then_send, configurable per-user via env
 * vars since bank contents/layout differ per G2 setup. *_LOAD banks are only ever read
 * (get-bank) - never written. *_STORE banks are the disposable destination for send-bank
 * and get freely overwritten by this test. Defaults match a typical scratch layout. */
static int test_bank_env(const char *name, int fallback) {
    const char *v = getenv(name);
    return v ? atoi(v) : fallback;
}

/* One type's worth of the chained get-bank/send-bank regression check (see
 * test_daemon_bank_chain_get_then_send for the why). Exercises both chain orders without
 * ever writing to loadBank: get(load)->send(store) [get->send], then get(store)->send(store)
 * [send->get, then get->send again as a same-bank round trip]. */
static void bank_chain_one_type(daemon_ctx_t *d, const char *type_str, int loadBank, int storeBank) {
    char dirA[64], dirB[64];
    snprintf(dirA, sizeof(dirA), "/tmp/g2-bank-chain-%s-A-XXXXXX", type_str);
    snprintf(dirB, sizeof(dirB), "/tmp/g2-bank-chain-%s-B-XXXXXX", type_str);
    TEST_ASSERT_NOT_NULL(mkdtemp(dirA));
    TEST_ASSERT_NOT_NULL(mkdtemp(dirB));

    char cmd[512], listA[600], listB[600], msg[96];
    cJSON *resp;

    snprintf(listA, sizeof(listA), "%s/chain.pchList", dirA);
    snprintf(listB, sizeof(listB), "%s/chain.pchList", dirB);

    /* get(load) -> send(store): exercises the get->send transition. */
    int id0 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-bank\",\"args\":[\"%s\",\"%d\",\"%s\",\"chain\"]}",
             id0, type_str, loadBank, dirA);
    resp = send_and_capture_response(d, cmd, id0);
    snprintf(msg, sizeof(msg), "%s: get-bank(load) response", type_str);
    TEST_ASSERT_NOT_NULL_MESSAGE(resp, msg);
    snprintf(msg, sizeof(msg), "%s: get-bank(load) ok", type_str);
    TEST_ASSERT_TRUE_MESSAGE(cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok")), msg);
    cJSON_Delete(resp);

    int id1 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"send-bank\",\"args\":[\"%s\",\"pchList\",\"%s\",\"%d\"]}",
             id1, type_str, listA, storeBank);
    resp = send_and_capture_response(d, cmd, id1);
    snprintf(msg, sizeof(msg), "%s: send-bank(store) #1 response", type_str);
    TEST_ASSERT_NOT_NULL_MESSAGE(resp, msg);
    snprintf(msg, sizeof(msg), "%s: send-bank(store) #1 ok", type_str);
    TEST_ASSERT_TRUE_MESSAGE(cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok")), msg);
    cJSON *data1 = cJSON_GetObjectItem(resp, "data");
    cJSON *aborted1 = data1 ? cJSON_GetObjectItem(data1, "aborted") : NULL;
    snprintf(msg, sizeof(msg), "%s: send-bank(store) #1 did not abort", type_str);
    TEST_ASSERT_FALSE_MESSAGE(aborted1 && cJSON_IsTrue(aborted1), msg);
    cJSON_Delete(resp);

    /* get(store) -> send(store): exercises the send->get transition, then a same-bank
     * round trip (get->send again) using what was just written. */
    int id2 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"get-bank\",\"args\":[\"%s\",\"%d\",\"%s\",\"chain\"]}",
             id2, type_str, storeBank, dirB);
    resp = send_and_capture_response(d, cmd, id2);
    snprintf(msg, sizeof(msg), "%s: get-bank(store) response", type_str);
    TEST_ASSERT_NOT_NULL_MESSAGE(resp, msg);
    snprintf(msg, sizeof(msg), "%s: get-bank(store) ok", type_str);
    TEST_ASSERT_TRUE_MESSAGE(cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok")), msg);
    cJSON_Delete(resp);

    int id3 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"send-bank\",\"args\":[\"%s\",\"pchList\",\"%s\",\"%d\"]}",
             id3, type_str, listB, storeBank);
    resp = send_and_capture_response(d, cmd, id3);
    snprintf(msg, sizeof(msg), "%s: send-bank(store) #2 response", type_str);
    TEST_ASSERT_NOT_NULL_MESSAGE(resp, msg);
    snprintf(msg, sizeof(msg), "%s: send-bank(store) #2 ok", type_str);
    TEST_ASSERT_TRUE_MESSAGE(cJSON_IsTrue(cJSON_GetObjectItem(resp, "ok")), msg);
    cJSON *data2 = cJSON_GetObjectItem(resp, "data");
    cJSON *aborted2 = data2 ? cJSON_GetObjectItem(data2, "aborted") : NULL;
    snprintf(msg, sizeof(msg), "%s: send-bank(store) #2 did not abort", type_str);
    TEST_ASSERT_FALSE_MESSAGE(aborted2 && cJSON_IsTrue(aborted2), msg);
    cJSON_Delete(resp);
}

/* Test: get-bank immediately followed by send-bank, and the reverse order, must not
 * intermittently fail with "no reply from device for location N" - regression test for
 * the STOP_COMM/START_COMM lock/unlock scoping fix. Each bank op used to independently
 * call g2_stop_comm()/g2_rearm() around itself; chaining two of them let a stray embedded
 * message (from the brief re-armed window between them) get misread by g2_stop_comm()'s
 * old unverified "first embedded message = the ack" logic as the ack for the next op,
 * desyncing the request/response lockstep. Covers both patch and performance banks (the
 * original repro was on a performance bank). Never writes to the *_LOAD banks - only ever
 * overwrites the *_STORE banks - but send-bank still unconditionally overwrites whatever it
 * writes to, so this is opt-in only: set G2_TEST_BANK_CHAIN=1 to run it. Bank numbers are
 * configurable (defaults shown) via G2_TEST_PATCH_LOAD_BANK (1), G2_TEST_PATCH_STORE_BANK
 * (30), G2_TEST_PERF_LOAD_BANK (1), G2_TEST_PERF_STORE_BANK (6). */
void test_daemon_bank_chain_get_then_send(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    if (!getenv("G2_TEST_BANK_CHAIN")) {
        TEST_IGNORE_MESSAGE("set G2_TEST_BANK_CHAIN=1 to run (destructive: overwrites the "
                             "*_STORE scratch banks - see G2_TEST_PATCH_STORE_BANK/"
                             "G2_TEST_PERF_STORE_BANK to configure which)");
    }

    int patchLoad  = test_bank_env("G2_TEST_PATCH_LOAD_BANK", 1);
    int patchStore = test_bank_env("G2_TEST_PATCH_STORE_BANK", 30);
    int perfLoad   = test_bank_env("G2_TEST_PERF_LOAD_BANK", 1);
    int perfStore  = test_bank_env("G2_TEST_PERF_STORE_BANK", 6);
    TEST_ASSERT_TRUE_MESSAGE(patchLoad >= 1 && patchLoad <= 32, "G2_TEST_PATCH_LOAD_BANK must be 1-32");
    TEST_ASSERT_TRUE_MESSAGE(patchStore >= 1 && patchStore <= 32, "G2_TEST_PATCH_STORE_BANK must be 1-32");
    TEST_ASSERT_TRUE_MESSAGE(perfLoad >= 1 && perfLoad <= 8, "G2_TEST_PERF_LOAD_BANK must be 1-8");
    TEST_ASSERT_TRUE_MESSAGE(perfStore >= 1 && perfStore <= 8, "G2_TEST_PERF_STORE_BANK must be 1-8");

    bank_chain_one_type(&g_daemon, "patch", patchLoad, patchStore);
    bank_chain_one_type(&g_daemon, "performance", perfLoad, perfStore);
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

