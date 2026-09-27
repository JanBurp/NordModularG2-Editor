/*
 * G2 CLI - shared daemon test harness
 *
 * Spawn/teardown and JSON send/receive helpers for driving a `g2-cli --json
 * daemon` subprocess from a test. Shared by test_daemon.c (fast suite) and
 * test_bank_transfer.c (slow suite) so both talk to the daemon the same way
 * a real client (the Electron app) does, instead of a test-only direct-USB
 * shortcut.
 */

#ifndef DAEMON_HARNESS_H
#define DAEMON_HARNESS_H

#include <sys/types.h>
#include "cJSON.h"

typedef struct {
    int in_fd;
    int out_fd;
    pid_t pid;
} daemon_ctx_t;

/* Read one newline-terminated line from fd. Returns byte count or -1 on timeout/error. */
int read_line_timeout(int fd, char *buf, int bufsize, int timeout_sec);

/* Read lines until one has "type":expected_type. Returns parsed cJSON or NULL on timeout.
 * Caller cJSON_Delete()s the result. */
cJSON *read_event_of_type(daemon_ctx_t *d, const char *expected_type,
                           int max_lines, int timeout_sec);

/* Spawn daemon subprocess. Returns context with fds and pid. */
daemon_ctx_t daemon_spawn(void);

/* Shutdown daemon: close stdin (EOF), drain pipe until daemon exits, reap. */
void daemon_shutdown(daemon_ctx_t *d);

/* Send JSON command, skip watch events, return 0 if response has "ok":true for expected_id. */
int send_and_expect_ok(daemon_ctx_t *d, const char *json, int expected_id);

/* Like send_and_expect_ok, but returns the full response object for expected_id instead of
 * just ok/-1. Caller cJSON_Delete()s the result. */
cJSON *send_and_capture_response(daemon_ctx_t *d, const char *json, int expected_id);

/* Like send_and_expect_ok but also captures the first event matching capture_type.
 * Caller cJSON_Delete()s *captured. */
int send_and_expect_ok_save_event(daemon_ctx_t *d, const char *json,
                                   int expected_id, const char *capture_type,
                                   cJSON **captured);

#endif
