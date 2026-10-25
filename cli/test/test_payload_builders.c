/*
 * Unit tests for the g2_build_*_op payload builders (no USB required).
 * Expected bytes follow the official editor's WriteStream methods (G2Editor.c:
 * CMCableDelete/CMCableConnect, CMModuleMove/Delete/Recolor/Name, CMMutaLock,
 * CMKnobDeassign, CMGlobalKnobDeassign).
 */

#include "unity.h"
#include "unity_internals.h"
#include "../include/g2_device.h"

#define ASSERT_OP(cmd_, want_)                                         \
    do {                                                               \
        TEST_ASSERT_EQUAL_HEX8((cmd_), op.cmd);                        \
        TEST_ASSERT_EQUAL_INT((int)sizeof(want_), op.len);             \
        TEST_ASSERT_EQUAL_HEX8_ARRAY((want_), op.payload, op.len);     \
    } while (0)

/* CMCableDelete: 6 pad bits, 1, loc bit; then output connector first (kind 1 -> +0x40). */
void test_build_del_cable_payload(void) {
    uint8_t buf[8] = {0}; G2Op op;
    g2_build_del_cable_op(&op, buf, 1, 30, 1, 0, 32, 0, 1); /* va, out 0 of #30 -> in 1 of #32 */
    const uint8_t want[] = {(1 << 1) | 1, 30, 0x40 | 0, 32, 0x00 | 1};
    ASSERT_OP(0x51, want);
}

/* An input given first is swapped so the output connector still comes first. */
void test_build_del_cable_swaps_input_first(void) {
    uint8_t buf[8] = {0}; G2Op op;
    g2_build_del_cable_op(&op, buf, 0, 32, 0, 1, 30, 1, 0); /* fx, in 1 of #32 <- out 0 of #30 */
    const uint8_t want[] = {(1 << 1) | 0, 30, 0x40 | 0, 32, 0x00 | 1};
    ASSERT_OP(0x51, want);
}

/* CMCableConnect: 3 pad bits, 1, loc bit, 3 color bits; connectors as del-cable. */
void test_build_add_cable_payload(void) {
    uint8_t buf[8] = {0}; G2Op op;
    g2_build_add_cable_op(&op, buf, 1, 5, 32, 0, 2, 30, 1, 3); /* va, color 5, in 2 of #32 <- out 3 of #30 */
    const uint8_t want[] = {(1 << 4) | (1 << 3) | 5, 30, 0x40 | 3, 32, 0x00 | 2};
    ASSERT_OP(0x50, want);
}

/* An input-to-input cable keeps its order (no output to put first). */
void test_build_add_cable_in_to_in_keeps_order(void) {
    uint8_t buf[8] = {0}; G2Op op;
    g2_build_add_cable_op(&op, buf, 0, 0, 7, 0, 1, 8, 0, 2);
    const uint8_t want[] = {(1 << 4) | 0, 8, 0x00 | 2, 7, 0x00 | 1};
    ASSERT_OP(0x50, want);
}

void test_build_del_module_payload(void) {
    uint8_t buf[4] = {0}; G2Op op;
    g2_build_del_module_op(&op, buf, 1, 12);
    const uint8_t want[] = {1, 12};
    ASSERT_OP(0x32, want);
}

void test_build_move_module_payload(void) {
    uint8_t buf[4] = {0}; G2Op op;
    g2_build_move_module_op(&op, buf, 0, 7, 3, 25);
    const uint8_t want[] = {0, 7, 3, 25};
    ASSERT_OP(0x34, want);
}

void test_build_set_module_color_payload(void) {
    uint8_t buf[4] = {0}; G2Op op;
    g2_build_set_module_color_op(&op, buf, 1, 9, 22);
    const uint8_t want[] = {1, 9, 22};
    ASSERT_OP(0x31, want);
}

/* Any non-zero "locked" is sent as 1. */
void test_build_set_mutation_lock_payload(void) {
    uint8_t buf[4] = {0}; G2Op op;
    g2_build_set_mutation_lock_op(&op, buf, 1, 9, 5);
    const uint8_t want[] = {1, 9, 1};
    ASSERT_OP(0x90, want);
    g2_build_set_mutation_lock_op(&op, buf, 0, 4, 0);
    const uint8_t want_off[] = {0, 4, 0};
    ASSERT_OP(0x90, want_off);
}

/* CMModuleName: loc, module, then the name - NUL-terminated below 16 chars. */
void test_build_set_module_label_payload(void) {
    uint8_t buf[20] = {0}; G2Op op;
    g2_build_set_module_label_op(&op, buf, 1, 9, "Osc");
    const uint8_t want[] = {1, 9, 'O', 's', 'c', 0};
    ASSERT_OP(0x33, want);
}

/* A full 16-char name has no terminator; longer names are cut to 16. */
void test_build_set_module_label_truncates_at_16(void) {
    uint8_t buf[20] = {0}; G2Op op;
    g2_build_set_module_label_op(&op, buf, 0, 3, "ABCDEFGHIJKLMNOPQR");
    const uint8_t want[] = {0, 3, 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'};
    ASSERT_OP(0x33, want);
}

void test_build_set_module_label_empty(void) {
    uint8_t buf[20] = {0}; G2Op op;
    g2_build_set_module_label_op(&op, buf, 1, 9, "");
    const uint8_t want[] = {1, 9, 0};
    ASSERT_OP(0x33, want);
}

/* CMKnobDeassign / CMGlobalKnobDeassign: knob index as a big-endian UWord. */
void test_build_deassign_knob_payload(void) {
    uint8_t buf[4] = {0}; G2Op op;
    g2_build_deassign_knob_op(&op, buf, 119);
    const uint8_t want[] = {0, 119};
    ASSERT_OP(0x26, want);
}

void test_build_deassign_global_knob_payload(void) {
    uint8_t buf[4] = {0}; G2Op op;
    g2_build_deassign_global_knob_op(&op, buf, 42);
    const uint8_t want[] = {0, 42};
    ASSERT_OP(0x1d, want);
}
