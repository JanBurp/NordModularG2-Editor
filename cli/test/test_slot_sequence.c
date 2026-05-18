/*
 * G2 CLI - Slot/variation sequence integration tests
 * Reproduces the "G2 becomes unresponsive after repeated slot/variation switches" failure.
 * NO delays between operations — timing must be tight to expose the stale-FIFO bug.
 *
 * Usage: make test-integration
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"
#include "../include/defs.h"
#include <string.h>
#include <stdio.h>

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

/* slot B → immediate get-patch B */
void test_slot_then_get_patch_no_delay(void) {
    ensure_connected();
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_select_slot("B"));
    cJSON *p = g2_get_patch("B");
    TEST_ASSERT_NOT_NULL(p);
    cJSON_Delete(p);
}

/* A→B→C→D, get-patch after each switch without pauses */
void test_slot_cycle_with_get_patch(void) {
    const char *slots[] = {"A", "B", "C", "D"};
    ensure_connected();
    for (int i = 0; i < 4; i++) {
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, g2_select_slot(slots[i]), slots[i]);
        cJSON *p = g2_get_patch(slots[i]);
        TEST_ASSERT_NOT_NULL_MESSAGE(p, slots[i]);
        cJSON_Delete(p);
    }
}

/* variations 1–8 on slot A without pauses */
void test_variation_cycle_slot_a(void) {
    ensure_connected();
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_select_slot("A"));
    for (int v = 1; v <= 8; v++) {
        char msg[16];
        snprintf(msg, sizeof(msg), "var=%d", v);
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, g2_select_variation(v, 0), msg);
    }
}

/* 3 full A→B→C→D cycles — detects degradation over repeated switches */
void test_repeated_slot_cycle(void) {
    const char *slots[] = {"A", "B", "C", "D"};
    ensure_connected();
    for (int rep = 0; rep < 3; rep++) {
        for (int i = 0; i < 4; i++) {
            char msg[32];
            snprintf(msg, sizeof(msg), "rep=%d slot=%s", rep, slots[i]);
            TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, g2_select_slot(slots[i]), msg);
            cJSON *p = g2_get_patch(slots[i]);
            TEST_ASSERT_NOT_NULL_MESSAGE(p, msg);
            cJSON_Delete(p);
        }
    }
}

/* simulate client: slot B → var 3 → get-patch B → slot C → var 1 → get-patch C */
void test_interleaved_slot_variation(void) {
    ensure_connected();
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_select_slot("B"));
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_select_variation(3, 1));
    cJSON *p = g2_get_patch("B");
    TEST_ASSERT_NOT_NULL(p);
    cJSON_Delete(p);
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_select_slot("C"));
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_select_variation(1, 2));
    p = g2_get_patch("C");
    TEST_ASSERT_NOT_NULL(p);
    cJSON_Delete(p);
}

/* switch D→A→B→C→D — observe drain counts in stderr */
void test_drain_count_logged(void) {
    const char *slots[] = {"D", "A", "B", "C", "D"};
    ensure_connected();
    for (int i = 0; i < 5; i++) {
        char msg[16];
        snprintf(msg, sizeof(msg), "slot=%s", slots[i]);
        TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, g2_select_slot(slots[i]), msg);
    }
}
