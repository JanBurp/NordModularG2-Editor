/*
 * G2 CLI - CLI test runner (one-shot commands and in-process g2_* calls, no daemon)
 * Run with: make test-cli
 * Requires G2 device connected via USB.
 */

#include "unity.h"
#include "unity_internals.h"
#include "cJSON.h"
#include "../include/g2_device.h"
#include "runner_common.h"
#include <stdio.h>
#include <string.h>

extern void test_oneshot_queries_with_stream_left_on(void);

extern void test_oneshot_set_patch_name(void);
extern void test_oneshot_set_perf_name(void);
extern void test_oneshot_patch_file_roundtrip(void);

extern void test_integration_get_patch_slot_a(void);
extern void test_integration_list_all(void);
extern void test_integration_select_slot_a(void);

extern void test_slot_then_get_patch_no_delay(void);
extern void test_slot_cycle_with_get_patch(void);
extern void test_variation_cycle_slot_a(void);
extern void test_repeated_slot_cycle(void);
extern void test_interleaved_slot_variation(void);
extern void test_drain_count_logged(void);

extern void test_set_perf_mode_cycle(void);
extern void test_set_perf_name(void);

extern void test_upload_empty_patch(void);
extern void test_upload_nl2(void);
extern void test_upload_dxbass(void);
extern void test_upload_dxbass_buf(void);
extern void test_upload_mixt(void);
extern void test_upload_empty_perf(void);
extern void test_upload_morphing_drum(void);

#define BACKUP_PATH "/tmp/g2-cli-tests-backup.prf2"

/* The slot/variation, upload and perf tests below change the G2's edit buffer (all four slots, perf name, mode,
 * focused slot); nothing is stored to a bank. Saved first and put back at the end. */
static int backup_mode = -1;
static char backup_focus[2] = "A";
static char backup_name[17] = "";

static void backup_g2(void) {
    g2_init();
    cJSON *s = g2_get_perf_settings();
    cJSON *m = s ? cJSON_GetObjectItem(s, "mode") : NULL;
    if (cJSON_IsString(m)) backup_mode = strcmp(m->valuestring, "performance") == 0;
    cJSON *focus = s ? cJSON_GetObjectItem(cJSON_GetObjectItem(s, "performance"), "focus") : NULL;
    if (cJSON_IsString(focus)) snprintf(backup_focus, sizeof(backup_focus), "%s", focus->valuestring);
    cJSON_Delete(s);
    cJSON *f = g2_get_perf_file(BACKUP_PATH, 0);
    /* from the file, not get-perf-settings: in patch mode that reports slot A's patch name */
    cJSON *name = f ? cJSON_GetObjectItem(f, "name") : NULL;
    if (cJSON_IsString(name)) snprintf(backup_name, sizeof(backup_name), "%s", name->valuestring);
    if (!f || backup_mode < 0) {
        fprintf(stderr, "\033[31mcould not back up the G2's state - not running the tests that change it\033[0m\n");
        backup_mode = -1;
    }
    cJSON_Delete(f);
    /* release the USB interface for the one-shot subprocesses that follow */
    g2_disconnect();
    g2_exit();
}

static void restore_g2(void) {
    int ok = g2_upload_perf(BACKUP_PATH) == G2_OK && g2_set_perf_mode(backup_mode, 0) == G2_OK
          && g2_select_slot(backup_focus) == G2_OK
          && g2_set_perf_name(backup_name) == G2_OK; /* upload-perf names the performance after the file */
    fprintf(stderr, ok ? "restored the G2's performance, name, mode and focused slot from %s\n"
                       : "\033[31mrestoring the G2 from %s failed - upload it by hand\033[0m\n", BACKUP_PATH);
}

int main(void) {
    int rc = g2_preflight("CLI TESTS");
    if (rc >= 0) return rc;

    fprintf(stderr, "Running CLI tests...\n");
    fflush(stderr);
    UNITY_BEGIN();

    /* First: spawns and gracefully quits a daemon (leaves the G2 streaming), then runs one-shot
     * queries; the last one-shot leaves the G2 quiet (STOP_COMM at exit). Everything below
     * connects in this process, so no daemon may be forked after it (fork-from-connected-parent
     * hang, see project notes on daemon connect). */
    run_test_silently("test_oneshot_queries_with_stream_left_on", test_oneshot_queries_with_stream_left_on);

    /* Everything below changes the edit buffer or the focused slot: backed up first, restored after */
    backup_g2();
    if (backup_mode >= 0) {
        run_test_silently("test_oneshot_set_patch_name",       test_oneshot_set_patch_name);
        run_test_silently("test_oneshot_set_perf_name",        test_oneshot_set_perf_name);
        run_test_silently("test_oneshot_patch_file_roundtrip", test_oneshot_patch_file_roundtrip);

        /* In-process from here on: no one-shot subprocess can claim the G2 any more */
        run_test_silently("test_integration_get_patch_slot_a", test_integration_get_patch_slot_a);
        run_test_silently("test_integration_list_all",         test_integration_list_all);
        run_test_silently("test_integration_select_slot_a",    test_integration_select_slot_a);
        run_test_silently("test_slot_then_get_patch_no_delay", test_slot_then_get_patch_no_delay);
        run_test_silently("test_slot_cycle_with_get_patch",    test_slot_cycle_with_get_patch);
        run_test_silently("test_variation_cycle_slot_a",       test_variation_cycle_slot_a);
        run_test_silently("test_repeated_slot_cycle",          test_repeated_slot_cycle);
        run_test_silently("test_interleaved_slot_variation",   test_interleaved_slot_variation);
        run_test_silently("test_drain_count_logged",           test_drain_count_logged);
        run_test_silently("test_set_perf_mode_cycle",  test_set_perf_mode_cycle);
        run_test_silently("test_set_perf_name",        test_set_perf_name);
        run_test_silently("test_upload_empty_patch",   test_upload_empty_patch);
        run_test_silently("test_upload_nl2",           test_upload_nl2);
        run_test_silently("test_upload_dxbass",        test_upload_dxbass);
        run_test_silently("test_upload_dxbass_buf",    test_upload_dxbass_buf);
        run_test_silently("test_upload_mixt",          test_upload_mixt);
        run_test_silently("test_upload_empty_perf",    test_upload_empty_perf);
        run_test_silently("test_upload_morphing_drum", test_upload_morphing_drum);
        restore_g2();
    }

    g2_disconnect();
    return UNITY_END();
}
