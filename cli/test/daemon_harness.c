/*
 * G2 CLI - shared daemon test harness (implementation)
 * See daemon_harness.h.
 */

#include "daemon_harness.h"
#include "unity.h"
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/select.h>
#include <time.h>
#include "../include/g2_device.h"

int read_line_timeout(int fd, char *buf, int bufsize, int timeout_sec) {
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

cJSON *read_event_of_type(daemon_ctx_t *d, const char *expected_type,
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

int send_and_expect_ok_save_event(daemon_ctx_t *d, const char *json,
                                   int expected_id, const char *capture_type,
                                   cJSON **captured) {
    char buf[65536];
    int len = (int)strlen(json);
    if (write(d->in_fd, json, len) != len) return -1;
    if (write(d->in_fd, "\n", 1) != 1) return -1;
    if (captured) *captured = NULL;

    /* Time-bound, not attempt-bound: see send_and_expect_ok(). */
    time_t deadline = time(NULL) + 20;
    while (time(NULL) < deadline) {
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

/* Shared by daemon_spawn()/daemon_spawn_bus_device(): fork+exec g2-cli with the
 * given argv, wiring its stdin/stdout to pipes. argv[0] and the trailing NULL
 * are the caller's responsibility. */
static daemon_ctx_t daemon_spawn_argv(char *const argv[]) {
    daemon_ctx_t d = {0};
    int in_pipe[2], out_pipe[2];

    signal(SIGPIPE, SIG_IGN); /* write() returns -1 instead of killing us if daemon exits */
    g2_exit(); /* release any parent USB handle so the child can claim it */

    pipe(in_pipe);
    pipe(out_pipe);
    /* CLOEXEC every fd: without this, spawning a SECOND daemon while this one's
     * pipe fds are still open in the parent leaks copies of them into that second
     * daemon's process via fork() (dup2's targets 0/1 clear CLOEXEC regardless, so
     * the child's own stdin/stdout still work). Otherwise the first daemon's stdin
     * write-end never drops to a zero refcount when the parent closes its own copy
     * (daemon_shutdown), so it never sees EOF and daemon_shutdown blocks forever. */
    fcntl(in_pipe[0],  F_SETFD, FD_CLOEXEC);
    fcntl(in_pipe[1],  F_SETFD, FD_CLOEXEC);
    fcntl(out_pipe[0], F_SETFD, FD_CLOEXEC);
    fcntl(out_pipe[1], F_SETFD, FD_CLOEXEC);

    pid_t pid = fork();
    TEST_ASSERT_TRUE(pid >= 0);

    if (pid == 0) {
        /* Child: redirect stdin/stdout to pipes and exec daemon */
        dup2(in_pipe[0],  STDIN_FILENO);
        dup2(out_pipe[1], STDOUT_FILENO);
        close(in_pipe[1]); close(out_pipe[0]);
        close(in_pipe[0]); close(out_pipe[1]);
        execv("build/bin/g2-cli", argv);
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

daemon_ctx_t daemon_spawn(void) {
    char *argv[] = {"g2-cli", "--json", "daemon", NULL};
    return daemon_spawn_argv(argv);
}

daemon_ctx_t daemon_spawn_bus_device(int bus, int device) {
    char bus_s[16], dev_s[16];
    snprintf(bus_s, sizeof(bus_s), "%d", bus);
    snprintf(dev_s, sizeof(dev_s), "%d", device);
    char *argv[] = {"g2-cli", "--json", "daemon", bus_s, dev_s, NULL};
    return daemon_spawn_argv(argv);
}

/* Draining prevents the daemon from getting SIGPIPE on its next stdout write
 * (which make reports as "Broken pipe: 13"). */
void daemon_shutdown(daemon_ctx_t *d) {
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

int send_and_expect_ok(daemon_ctx_t *d, const char *json, int expected_id) {
    char line_buf[65536];
    int json_len = (int)strlen(json);
    if (write(d->in_fd, json, json_len) != json_len) return -1;
    if (write(d->in_fd, "\n", 1) != 1) return -1;

    /* Time-bound, not attempt-bound: a daemon that's been streaming LED/VU telemetry
     * unread for several seconds (e.g. right after test_daemon_multi_starts, which
     * drains the slower of two daemons first - see that test's comment) can have an
     * arbitrarily large backlog of unrelated events ahead of this command's actual
     * response in the pipe. A fixed attempt count gives up before reaching it; a
     * deadline survives any backlog that clears within a reasonable time. */
    time_t deadline = time(NULL) + 20;
    while (time(NULL) < deadline) {
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

/* Needed for commands like send-bank whose "data" can report ret==G2_OK (so "ok":true)
 * while its own "aborted" field is true, since g2_send_bank always returns a result
 * object even when it stopped partway through. */
cJSON *send_and_capture_response(daemon_ctx_t *d, const char *json, int expected_id) {
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
