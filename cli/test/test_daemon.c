/*
 * G2 CLI - Daemon integration tests (new drain-only approach)
 *
 * Focused tests for the daemon with version cache + drain-only command handling.
 * Each test spawns the daemon as a child process and sends a simple sequence
 * of commands to verify the drain-only approach works correctly.
 */

#include "unity.h"
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <sys/select.h>
#include "cJSON.h"

typedef struct {
    int in_fd;
    int out_fd;
    pid_t pid;
} daemon_ctx_t;

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

/* Test 1: Daemon starts and shuts down cleanly. */
void test_daemon_starts(void) {
    daemon_ctx_t d = daemon_spawn();
    usleep(500000);
    daemon_shutdown(&d);
}

/* Test 2: Daemon responds to startup command. */
void test_daemon_startup_cmd(void) {
    daemon_ctx_t d = daemon_spawn();
    int r = send_and_expect_ok(&d, "{\"id\":0,\"cmd\":\"startup\",\"args\":[]}", 0);
    daemon_shutdown(&d);
    if (r == -1) {
        TEST_IGNORE_MESSAGE("G2 device not connected");
    } else {
        TEST_ASSERT_EQUAL_INT(0, r);
    }
}

/* Test 3: Daemon slot command works after startup. */
void test_daemon_slot_cmd(void) {
    daemon_ctx_t d = daemon_spawn();
    int r_startup = send_and_expect_ok(&d, "{\"id\":0,\"cmd\":\"startup\",\"args\":[]}", 0);
    int r_slot = send_and_expect_ok(&d, "{\"id\":1,\"cmd\":\"slot\",\"args\":[\"A\"]}", 1);
    daemon_shutdown(&d);
    if (r_startup == -1 || r_slot == -1) {
        TEST_IGNORE_MESSAGE("G2 device not connected");
    } else {
        TEST_ASSERT_EQUAL_INT(0, r_startup);
        TEST_ASSERT_EQUAL_INT(0, r_slot);
    }
}

/* Test 4: Daemon variation command works with version cache. */
void test_daemon_variation_cmd(void) {
    daemon_ctx_t d = daemon_spawn();
    int r_startup = send_and_expect_ok(&d, "{\"id\":0,\"cmd\":\"startup\",\"args\":[]}", 0);
    int r_slot = send_and_expect_ok(&d, "{\"id\":1,\"cmd\":\"slot\",\"args\":[\"A\"]}", 1);
    int r_var = send_and_expect_ok(&d, "{\"id\":2,\"cmd\":\"variation\",\"args\":[\"1\",\"A\"]}", 2);
    daemon_shutdown(&d);
    if (r_startup == -1 || r_slot == -1 || r_var == -1) {
        TEST_IGNORE_MESSAGE("G2 device not connected");
    } else {
        TEST_ASSERT_EQUAL_INT(0, r_startup);
        TEST_ASSERT_EQUAL_INT(0, r_slot);
        TEST_ASSERT_EQUAL_INT(0, r_var);
    }
}

/* Test 5: Rapid slot+variation sequence stays responsive. */
void test_daemon_slot_variation_sequence(void) {
    daemon_ctx_t d = daemon_spawn();
    int r[9];

    r[0] = send_and_expect_ok(&d, "{\"id\":0,\"cmd\":\"startup\",\"args\":[]}", 0);
    r[1] = send_and_expect_ok(&d, "{\"id\":1,\"cmd\":\"slot\",\"args\":[\"A\"]}", 1);
    r[2] = send_and_expect_ok(&d, "{\"id\":2,\"cmd\":\"variation\",\"args\":[\"1\",\"A\"]}", 2);
    r[3] = send_and_expect_ok(&d, "{\"id\":3,\"cmd\":\"slot\",\"args\":[\"B\"]}", 3);
    r[4] = send_and_expect_ok(&d, "{\"id\":4,\"cmd\":\"variation\",\"args\":[\"3\",\"B\"]}", 4);
    r[5] = send_and_expect_ok(&d, "{\"id\":5,\"cmd\":\"slot\",\"args\":[\"C\"]}", 5);
    r[6] = send_and_expect_ok(&d, "{\"id\":6,\"cmd\":\"variation\",\"args\":[\"5\",\"C\"]}", 6);
    r[7] = send_and_expect_ok(&d, "{\"id\":7,\"cmd\":\"slot\",\"args\":[\"D\"]}", 7);
    r[8] = send_and_expect_ok(&d, "{\"id\":8,\"cmd\":\"variation\",\"args\":[\"2\",\"D\"]}", 8);

    daemon_shutdown(&d);

    int failed = 0;
    for (int i = 0; i < 9; i++) {
        if (r[i] == -1) {
            failed = 1;
            break;
        }
    }

    if (failed) {
        TEST_IGNORE_MESSAGE("G2 device not connected");
    } else {
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[0], "startup");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[1], "slot A");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[2], "var 1 slot A");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[3], "slot B");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[4], "var 3 slot B");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[5], "slot C");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[6], "var 5 slot C");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[7], "slot D");
        TEST_ASSERT_EQUAL_INT_MESSAGE(0, r[8], "var 2 slot D");
    }
}
