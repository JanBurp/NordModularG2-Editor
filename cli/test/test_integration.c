/*
 * G2 CLI - Integration tests requiring real G2 device
 * These tests assume the G2 is connected via USB
 *
 * Note: Tests run sequentially with delay between each.
 *       Only 3-4 tests to stay within G2 hardware timing limits (~10 commands).
 *
 * Usage: make test-integration
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"
#include "../include/defs.h"
#include "../include/output.h"
#include <string.h>
#include <unistd.h>
#include <signal.h>

static int suite_initialized = 0;

static void ensure_connected(void) {
    if (!suite_initialized) {
        g2_init();
        suite_initialized = 1;
    }
    if (!g2_is_connected()) {
        TEST_ASSERT_TRUE(g2_connect_silent() >= 0);
    }
    TEST_ASSERT_TRUE(g2_is_connected());
}

static void delay_between_tests(void) {
    usleep(500000);
}

void test_integration_connect(void) {
    ensure_connected();
    delay_between_tests();
}

void test_integration_get_patch_slot_a(void) {
    ensure_connected();
    cJSON *result = g2_get_patch("A");
    TEST_ASSERT_TRUE(result != NULL);
    cJSON_Delete(result);
    delay_between_tests();
}

void test_integration_list_all(void) {
    ensure_connected();
    cJSON *result = g2_list(LIST_FILTER_ALL, 0);
    TEST_ASSERT_TRUE(result != NULL);
    cJSON_Delete(result);
    delay_between_tests();
}

void test_integration_select_slot_a(void) {
    ensure_connected();
    TEST_ASSERT_TRUE(g2_select_slot("A") >= 0);
}

/*
 * Startup sequence as documented in "G2 USB Messages.html":
 *   1. CMD_INIT (0x80)        — resets version counters, get G2 type info
 *   2. STOP_COMM              — silence G2→Host notifications (done inside slot/get-patch)
 *   3. GET_SYNTH_SETTINGS     — global settings
 *   4. GET_PATCH per slot     — slot state
 *   5. GET_NAMES (list)       — patch/performance names
 *
 * This test verifies the full sequence completes without errors and that
 * each step returns a non-NULL result.
 */
void test_startup_sequence(void) {
    ensure_connected();

    /* Step 1: CMD_INIT */
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_send_init());

    /* Step 2+3: synth settings (g2_device_info drains stale messages first) */
    cJSON *info = g2_device_info(0);
    TEST_ASSERT_NOT_NULL(info);
    cJSON_Delete(info);

    /* Step 4: patch data for each slot */
    const char *slots[] = {"A", "B", "C", "D"};
    for (int i = 0; i < 4; i++) {
        cJSON *patch = g2_get_patch(slots[i]);
        TEST_ASSERT_NOT_NULL_MESSAGE(patch, slots[i]);
        cJSON_Delete(patch);
    }

    /* Step 5: patch/performance names */
    cJSON *names = g2_list(LIST_FILTER_ALL, 0);
    TEST_ASSERT_NOT_NULL(names);
    cJSON_Delete(names);

    /* CMD_INIT resets G2 state — disconnect so subsequent tests get a clean connection. */
    g2_disconnect();
}

/*
 * Full real-life scenario with JSON output to stdout:
 *   Same startup sequence as test_startup_sequence, but each step's result
 *   is printed as JSON, followed by 30 seconds of START_COMM watch output
 *   (LED data, volume data, param changes, etc.) so the stream can be
 *   observed exactly as the editor would see it.
 */
void test_fullstack_with_watch(void) {
    ensure_connected();

    /* Step 1: CMD_INIT */
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_send_init());

    /* Step 2+3: synth settings */
    cJSON *info = g2_device_info(0);
    TEST_ASSERT_NOT_NULL(info);
    output_json(info, OUTPUT_DEFAULT);
    cJSON_Delete(info);

    /* Step 4: patch data for each slot */
    const char *slots[] = {"A", "B", "C", "D"};
    for (int i = 0; i < 4; i++) {
        cJSON *patch = g2_get_patch(slots[i]);
        TEST_ASSERT_NOT_NULL_MESSAGE(patch, slots[i]);
        output_json(patch, OUTPUT_DEFAULT);
        cJSON_Delete(patch);
    }

    /* Step 5: patch/performance names */
    cJSON *names = g2_list(LIST_FILTER_ALL, 0);
    TEST_ASSERT_NOT_NULL(names);
    output_json(names, OUTPUT_DEFAULT);
    cJSON_Delete(names);

    /* Step 6: START_COMM — watch for 30 seconds, then auto-stop */
    g2_watch_running = 1;
    signal(SIGALRM, g2_watch_stop);
    alarm(30);
    g2_watch(OUTPUT_DEFAULT, 0);
    alarm(0);

    g2_disconnect();
}