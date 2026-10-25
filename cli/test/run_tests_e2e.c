/*
 * G2 CLI - Daemon end-to-end test runner
 * Run with: make test-e2e
 * Requires G2 device connected via USB.
 */

#include "unity.h"
#include "unity_internals.h"
#include "runner_common.h"

extern void test_daemon_starts(void);
extern void test_daemon_get_patch_cmd(void);
extern void test_daemon_slot_cmd(void);
extern void test_daemon_variation_cmd(void);
extern void test_daemon_select_param_cmd(void);
extern void test_daemon_stdin_burst_forwards_events_promptly(void);
extern void test_daemon_dump_patch_cmd(void);
extern void test_daemon_assign_knob_cmd(void);
extern void test_daemon_assign_global_knob_cmd(void);
extern void test_daemon_set_param_label_four_button_switch(void);
extern void test_daemon_send_controller_snapshot_cmd(void);
extern void test_daemon_get_patch_right_after_add_modules(void);
extern void test_daemon_seq_set_module_mode(void);
extern void test_daemon_set_slot_key_burst(void);
extern void test_daemon_patch_edits_read_back(void);
extern void test_daemon_perf_edits_read_back(void);
extern void test_daemon_select_param_page_read_back(void);
extern void test_patch_workflow_full_cycle(void);
extern void test_patch_workflow_replace_module(void);
extern void test_daemon_slot_flags_after_patch_to_perf(void);
extern void test_daemon_perf_mode_cycle(void);

extern void test_daemon_multi_starts(void);
extern void test_daemon_multi_commands_independent(void);
extern void test_daemon_multi_no_cross_talk(void);
extern void test_daemon_multi_kill_one_other_unaffected(void);

int main(void) {
    int rc = g2_preflight("E2E TESTS");
    if (rc >= 0) return rc;

    fprintf(stderr, "Running daemon e2e tests...\n");
    fflush(stderr);
    UNITY_BEGIN();

    /* Shared-daemon tests — slot/variation before perf mode so mode-change residual
     * USB state cannot affect slot commands. Perf mode is last and owns shutdown. */
    run_test_silently("test_daemon_starts",                  test_daemon_starts);
    run_test_silently("test_daemon_get_patch_cmd",           test_daemon_get_patch_cmd);
    run_test_silently("test_daemon_slot_cmd",                test_daemon_slot_cmd);
    run_test_silently("test_daemon_variation_cmd",           test_daemon_variation_cmd);
    run_test_silently("test_daemon_select_param_cmd",        test_daemon_select_param_cmd);
    run_test_silently("test_daemon_stdin_burst_forwards_events_promptly", test_daemon_stdin_burst_forwards_events_promptly);
    run_test_silently("test_daemon_dump_patch_cmd",          test_daemon_dump_patch_cmd);
    run_test_silently("test_daemon_assign_knob_cmd",         test_daemon_assign_knob_cmd);
    run_test_silently("test_daemon_assign_global_knob_cmd",  test_daemon_assign_global_knob_cmd);
    run_test_silently("test_daemon_set_param_label_four_button_switch", test_daemon_set_param_label_four_button_switch);
    run_test_silently("test_daemon_send_controller_snapshot_cmd", test_daemon_send_controller_snapshot_cmd);
    run_test_silently("test_daemon_get_patch_right_after_add_modules", test_daemon_get_patch_right_after_add_modules);
    run_test_silently("test_daemon_seq_set_module_mode",     test_daemon_seq_set_module_mode);
    run_test_silently("test_daemon_set_slot_key_burst",      test_daemon_set_slot_key_burst);
    run_test_silently("test_daemon_patch_edits_read_back",   test_daemon_patch_edits_read_back);
    run_test_silently("test_daemon_perf_edits_read_back",    test_daemon_perf_edits_read_back);
    run_test_silently("test_daemon_select_param_page_read_back", test_daemon_select_param_page_read_back);
    run_test_silently("test_patch_workflow_full_cycle",      test_patch_workflow_full_cycle);
    run_test_silently("test_patch_workflow_replace_module",  test_patch_workflow_replace_module);
    run_test_silently("test_daemon_slot_flags_after_patch_to_perf", test_daemon_slot_flags_after_patch_to_perf);
    run_test_silently("test_daemon_perf_mode_cycle",         test_daemon_perf_mode_cycle);

    /* Multi-device: needs 2 real G2 units attached, self-skips otherwise. Runs after
     * the single-daemon shared-daemon suite above releases its own USB connection. */
    run_test_silently("test_daemon_multi_starts",                    test_daemon_multi_starts);
    run_test_silently("test_daemon_multi_commands_independent",      test_daemon_multi_commands_independent);
    run_test_silently("test_daemon_multi_no_cross_talk",             test_daemon_multi_no_cross_talk);
    run_test_silently("test_daemon_multi_kill_one_other_unaffected", test_daemon_multi_kill_one_other_unaffected);

    return UNITY_END();
}
