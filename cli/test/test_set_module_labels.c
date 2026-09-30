/*
 * Unit tests for g2_set_module_labels / its message builder (no USB required)
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

/* set-module-labels: one 0x42 message carrying every labelled param of the module, because the
 * device replaces the module's whole label list. Mixer 4-1 C has four On buttons (params 4-7). */
void test_build_set_module_labels_four_buttons(void) {
    const char *tok[] = {"4", "1", "Mic", "5", "1", "Piano", "6", "1", "Bass", "7", "1", "Drums"};
    uint8_t buf[G2_MODULE_LABELS_BUFSZ]; G2Op op;
    TEST_ASSERT_EQUAL_INT(G2_OK, g2_build_set_module_labels_op(&op, buf, 1, 90, 12, tok));
    TEST_ASSERT_EQUAL_HEX8(0x42, op.cmd);
    TEST_ASSERT_EQUAL_INT(3 + 4 * 10, op.len);
    TEST_ASSERT_EQUAL_HEX8(1, buf[0]);   /* location */
    TEST_ASSERT_EQUAL_HEX8(90, buf[1]);  /* module */
    TEST_ASSERT_EQUAL_HEX8(40, buf[2]);  /* module_len = 4 entries * (3 + 7) */
    for (int e = 0; e < 4; e++) {
        const uint8_t *p = buf + 3 + e * 10;
        TEST_ASSERT_EQUAL_HEX8(1, p[0]);         /* is_string */
        TEST_ASSERT_EQUAL_HEX8(8, p[1]);         /* param_len = 1 + 7 */
        TEST_ASSERT_EQUAL_HEX8(4 + e, p[2]);     /* param_idx */
        TEST_ASSERT_EQUAL_STRING(tok[e * 3 + 2], (const char *)(p + 3));
    }
}

void test_build_set_module_labels_rejects_malformed(void) {
    const char *short_group[] = {"4", "2", "Mic"};   /* count 2 but only one label */
    const char *no_count[] = {"4"};
    uint8_t buf[G2_MODULE_LABELS_BUFSZ]; G2Op op;
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_build_set_module_labels_op(&op, buf, 1, 1, 3, short_group));
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_build_set_module_labels_op(&op, buf, 1, 1, 1, no_count));
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_build_set_module_labels_op(&op, buf, 1, 1, 0, NULL));
}

void test_set_module_labels_invalid_slot(void) {
    const char *tok[] = {"4", "1", "Mic"};
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_labels(4, 1, 1, 3, tok));
}

void test_set_module_labels_invalid_location(void) {
    const char *tok[] = {"4", "1", "Mic"};
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_labels(0, 3, 1, 3, tok));
}

void test_set_module_labels_malformed_groups(void) {
    const char *tok[] = {"4", "2", "Mic"};
    TEST_ASSERT_EQUAL_INT(G2_ERR_INVALID_PARAM, g2_set_module_labels(0, 1, 1, 3, tok));
}
