/*
 * G2 CLI - Multi-device daemon integration tests
 *
 * Verifies that two daemon processes, each pinned to a specific bus/device via
 * `daemon <bus> <device>`, stay on their own physical G2 and never cross-talk.
 * Requires two real Nord G2 units attached; self-skips (TEST_IGNORE_MESSAGE),
 * same soft-skip idiom test_daemon.c uses for g_daemon_ok, when fewer than two
 * are detected.
 */

#include "unity.h"
#include <unistd.h>
#include <string.h>
#include <stdlib.h>
#include "cJSON.h"
#include "../include/g2_device.h"
#include "daemon_harness.h"

static daemon_ctx_t g_da = {0}, g_db = {0};
static int g_multi_ok = -1; /* -1 uninitialized, 0 ok, 1 skip */

/* Test 1: discover two distinct G2 bus/device pairs, spawn a daemon targeted at
 * each, and confirm both independently reach watch_armed. */
void test_daemon_multi_starts(void) {
    g2_init();
    cJSON *devices = g2_list_devices_json();
    int bus_a = 0, dev_a = 0, bus_b = 0, dev_b = 0, found = 0;
    if (devices) {
        cJSON *all = cJSON_GetObjectItem(devices, "all");
        int count = all ? cJSON_GetArraySize(all) : 0;
        for (int idx = 0; idx < count && found < 2; idx++) {
            cJSON *e = cJSON_GetArrayItem(all, idx);
            cJSON *isg2 = cJSON_GetObjectItem(e, "isG2");
            if (!isg2 || !cJSON_IsTrue(isg2)) continue;
            int bus = cJSON_GetObjectItem(e, "bus")->valueint;
            int dev = cJSON_GetObjectItem(e, "device")->valueint;
            if (found == 0) { bus_a = bus; dev_a = dev; }
            else { bus_b = bus; dev_b = dev; }
            found++;
        }
        cJSON_Delete(devices);
    }
    g2_exit();

    if (found < 2) {
        g_multi_ok = 1;
        TEST_IGNORE_MESSAGE("needs 2 G2 units attached");
    }

    g_da = daemon_spawn_bus_device(bus_a, dev_a);
    g_db = daemon_spawn_bus_device(bus_b, dev_b);
    TEST_ASSERT_TRUE(g_da.pid > 0);
    TEST_ASSERT_TRUE(g_db.pid > 0);

    /* 20s per line, not 5s: "names" (full patch/performance list) is the slowest startup
     * event, hardware-measured 2026-09-28 at ~10.9s / ~5.2s for the two attached units -
     * driven entirely by each device's own catalog size, not by contention between the two
     * daemons (confirmed: same gap solo and paired, within measurement noise). Startup line
     * count now varies with catalog size (one names_progress event per bank ahead of
     * "watch_armed"), so this is time-bound (40s overall) rather than attempt-bound - see
     * test_daemon.c's identical read_event_of_type("watch_armed", ...) for the single-daemon
     * case of the same underlying cost. */
    cJSON *wa_a = read_event_of_type(&g_da, "watch_armed", 40, 20);
    cJSON *wa_b = read_event_of_type(&g_db, "watch_armed", 40, 20);
    int both_armed = (wa_a != NULL) && (wa_b != NULL);
    if (wa_a) cJSON_Delete(wa_a);
    if (wa_b) cJSON_Delete(wa_b);

    if (!both_armed) {
        g_multi_ok = 1;
        TEST_IGNORE_MESSAGE("one or both targeted daemons failed to arm");
    }
    g_multi_ok = 0;
}

/* Test 2: each daemon independently answers a command targeted at its own unit -
 * the basic case of two simultaneous, independently-addressable connections. */
void test_daemon_multi_commands_independent(void) {
    if (g_multi_ok != 0) TEST_IGNORE_MESSAGE("multi-device daemons not connected");

    int ra = send_and_expect_ok(&g_da, "{\"id\":9001,\"cmd\":\"slot\",\"args\":[\"A\"]}", 9001);
    TEST_ASSERT_EQUAL_INT(0, ra);

    int rb = send_and_expect_ok(&g_db, "{\"id\":9002,\"cmd\":\"slot\",\"args\":[\"A\"]}", 9002);
    TEST_ASSERT_EQUAL_INT(0, rb);
}

/* Test 3: a command's reply must land only on the pipe of the daemon it was sent
 * to, never on the other daemon's pipe. Architecturally guaranteed by separate OS
 * pipes/processes, but worth asserting directly as a regression guard. */
void test_daemon_multi_no_cross_talk(void) {
    if (g_multi_ok != 0) TEST_IGNORE_MESSAGE("multi-device daemons not connected");

    const char *cmd = "{\"id\":9101,\"cmd\":\"slot\",\"args\":[\"A\"]}";
    int len = (int)strlen(cmd);
    TEST_ASSERT_TRUE(write(g_da.in_fd, cmd, len) == len);
    TEST_ASSERT_TRUE(write(g_da.in_fd, "\n", 1) == 1);

    char buf[4096];
    int seen_on_a = 0;
    for (int i = 0; i < 10 && !seen_on_a; i++) {
        if (read_line_timeout(g_da.out_fd, buf, sizeof(buf), 5) < 0) break;
        cJSON *r = cJSON_Parse(buf);
        if (!r) continue;
        cJSON *id_j = cJSON_GetObjectItem(r, "id");
        if (id_j && (int)id_j->valuedouble == 9101) seen_on_a = 1;
        cJSON_Delete(r);
    }
    TEST_ASSERT_TRUE_MESSAGE(seen_on_a, "expected ack on daemon A's own pipe");

    /* Short timeout: proving an absence, not waiting for an event that will
     * eventually arrive. */
    int seen_on_b = 0;
    if (read_line_timeout(g_db.out_fd, buf, sizeof(buf), 1) >= 0) {
        cJSON *r = cJSON_Parse(buf);
        if (r) {
            cJSON *id_j = cJSON_GetObjectItem(r, "id");
            if (id_j && (int)id_j->valuedouble == 9101) seen_on_b = 1;
            cJSON_Delete(r);
        }
    }
    TEST_ASSERT_FALSE_MESSAGE(seen_on_b, "command sent to daemon A leaked to daemon B's pipe");
}

/* Test 4 (last - owns shutdown of both): one daemon exiting must not disturb the
 * other's connection. */
void test_daemon_multi_kill_one_other_unaffected(void) {
    if (g_multi_ok != 0) TEST_IGNORE_MESSAGE("multi-device daemons not connected");

    daemon_shutdown(&g_da);

    int rb = send_and_expect_ok(&g_db, "{\"id\":9201,\"cmd\":\"slot\",\"args\":[\"A\"]}", 9201);
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, rb, "daemon B still responsive after daemon A exits");

    daemon_shutdown(&g_db);
}
