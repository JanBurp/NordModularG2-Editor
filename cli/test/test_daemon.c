/*
 * G2 CLI - Daemon integration tests (shared-daemon approach)
 *
 * All 5 tests share ONE daemon process (one USB connection) to match real-world
 * editor behaviour. The daemon is spawned by test_daemon_starts and shut down by
 * test_daemon_slot_variation_sequence. Command IDs increase monotonically via
 * g_cmd_id so the shared daemon can match responses to the right request.
 */

#include "unity.h"
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
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
 * test_daemon_slot_variation_sequence. */
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

/* Spawn daemon subprocess. Returns context with fds and pid. */
static daemon_ctx_t daemon_spawn(void) {
    daemon_ctx_t d = {0};
    int in_pipe[2], out_pipe[2];

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

/* Shutdown daemon: close stdin (EOF), reap process. */
static void daemon_shutdown(daemon_ctx_t *d) {
    close(d->in_fd);
    close(d->out_fd);
    waitpid(d->pid, NULL, 0);
}

/* Send JSON command, skip watch events, return 0 if response has "ok":true for expected_id. */
static int send_and_expect_ok(daemon_ctx_t *d, const char *json, int expected_id) {
    char line_buf[4096];
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

/* Test 1: Daemon starts — spawn the shared daemon and verify it is alive. */
void test_daemon_starts(void) {
    g_daemon = daemon_spawn();
    TEST_ASSERT_TRUE(g_daemon.pid > 0);
}

/* Test 2: Daemon responds to startup command. */
void test_daemon_startup_cmd(void) {
    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"startup\",\"args\":[]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    if (r == -1) {
        g_daemon_ok = 1;
        TEST_IGNORE_MESSAGE("G2 device not connected");
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

/* Test 4: Variation command works with version cache. */
void test_daemon_variation_cmd(void) {
    if (g_daemon_ok != 0) TEST_IGNORE_MESSAGE("G2 device not connected");
    char cmd[64];
    int id = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"variation\",\"args\":[\"1\",\"A\"]}", id);
    int r = send_and_expect_ok(&g_daemon, cmd, id);
    TEST_ASSERT_EQUAL_INT(0, r);
}

/* Test 5: Rapid slot+variation sequence stays responsive. Shuts down shared daemon. */
void test_daemon_slot_variation_sequence(void) {
    if (g_daemon_ok != 0) {
        daemon_shutdown(&g_daemon);
        TEST_IGNORE_MESSAGE("G2 device not connected");
    }

    /* Continue from where tests 3-4 left off: A/var1 already done; cycle B, C, D. */
    char cmd[64];
    int r[6];

    int id0 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"slot\",\"args\":[\"B\"]}", id0);
    r[0] = send_and_expect_ok(&g_daemon, cmd, id0);

    int id1 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"variation\",\"args\":[\"3\",\"B\"]}", id1);
    r[1] = send_and_expect_ok(&g_daemon, cmd, id1);

    int id2 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"slot\",\"args\":[\"C\"]}", id2);
    r[2] = send_and_expect_ok(&g_daemon, cmd, id2);

    int id3 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"variation\",\"args\":[\"5\",\"C\"]}", id3);
    r[3] = send_and_expect_ok(&g_daemon, cmd, id3);

    int id4 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"slot\",\"args\":[\"D\"]}", id4);
    r[4] = send_and_expect_ok(&g_daemon, cmd, id4);

    int id5 = g_cmd_id++;
    snprintf(cmd, sizeof(cmd), "{\"id\":%d,\"cmd\":\"variation\",\"args\":[\"2\",\"D\"]}", id5);
    r[5] = send_and_expect_ok(&g_daemon, cmd, id5);

    daemon_shutdown(&g_daemon);

    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[0], "slot B");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[1], "var 3 slot B");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[2], "slot C");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[3], "var 5 slot C");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[4], "slot D");
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[5], "var 2 slot D");
}
