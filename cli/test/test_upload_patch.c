/*
 * Integration tests for upload-patch and get-patch-file roundtrip.
 * Tests load each file from test-patches/, upload to slot A,
 * then download back and compare section structure.
 *
 * Usage: make test-integration
 */

#include "unity.h"
#include "../include/g2_device.h"
#include "../include/utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>

/* Path relative to the cli/ build directory (where tests run from) */
#define TEST_PATCHES_DIR "../test-patches"
#define TMP_OUT_DIR      "/tmp/g2-upload-test"

static int suite_initialized = 0;

static void ensure_g2(void) {
    if (!suite_initialized) {
        g2_init();
        suite_initialized = 1;
    }
    if (!g2_is_connected()) {
        TEST_ASSERT_TRUE_MESSAGE(g2_connect_silent() >= 0, "G2 not found");
    }
}

/* Return offset of first null byte in file, -1 if not found */
static int find_null_offset(const uint8_t *data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        if (data[i] == 0x00) return (int)i;
    }
    return -1;
}

/*
 * Read pch2 sections from a file into buf.
 * Skips the text header + NUL + 2 bytes, strips trailing 2-byte CRC.
 * Returns number of bytes written, or -1 on error.
 */
static int read_pch2_sections(const char *path, uint8_t *buf, size_t bufsz) {
    FILE *f = fopen(path, "rb");
    if (!f) return -1;
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);
    uint8_t *raw = malloc((size_t)fsize);
    if (!raw) { fclose(f); return -1; }
    fread(raw, 1, (size_t)fsize, f);
    fclose(f);

    int null_ofs = find_null_offset(raw, (size_t)fsize);
    if (null_ofs < 0) { free(raw); return -1; }

    int data_ofs = null_ofs + 3;   /* skip NUL + 0x17 + 0x00 */
    int data_len = (int)fsize - data_ofs - 2;  /* strip trailing CRC */
    if (data_len <= 0 || (size_t)data_len > bufsz) { free(raw); return -1; }

    memcpy(buf, raw + data_ofs, (size_t)data_len);
    free(raw);
    return data_len;
}

/* Read raw section data from a file written by g2_get_patch_file (no text header, no CRC).
 * Returns number of bytes read, or -1 on error. */
static int read_raw_sections(const char *path, uint8_t *buf, size_t bufsz) {
    FILE *f = fopen(path, "rb");
    if (!f) return -1;
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);
    if (fsize <= 0 || (size_t)fsize > bufsz) { fclose(f); return -1; }
    fread(buf, 1, (size_t)fsize, f);
    fclose(f);
    return (int)fsize;
}

/* Collect section type IDs from a section byte stream into out[]. Returns count. */
static int collect_section_ids(const uint8_t *sections, int len, uint8_t *out, int maxout) {
    int pos = 0, count = 0;
    while (pos + 3 <= len && count < maxout) {
        uint8_t id = sections[pos];
        int sz = ((int)sections[pos + 1] << 8) | sections[pos + 2];
        out[count++] = id;
        pos += 3 + sz;
    }
    return count;
}

static int cmp_u8(const void *a, const void *b) {
    return (int)*(const uint8_t *)a - (int)*(const uint8_t *)b;
}

/* Filter out section IDs the G2 firmware doesn't preserve on round-trip, then sort.
 * 0x69 and 0x6f are file-only metadata sections the hardware ignores. */
static int filter_and_sort(const uint8_t *ids, int count, uint8_t *out) {
    static const uint8_t dropped[] = { 0x69, 0x6f };
    int n = 0;
    for (int i = 0; i < count; i++) {
        int skip = 0;
        for (size_t k = 0; k < sizeof(dropped); k++)
            if (ids[i] == dropped[k]) { skip = 1; break; }
        if (!skip) out[n++] = ids[i];
    }
    qsort(out, (size_t)n, 1, cmp_u8);
    return n;
}

/* ------------------------------------------------------------------ */

static void do_upload_roundtrip(const char *label, const char *filepath) {
    ensure_g2();
    usleep(300000);  /* let G2 settle */

    /* --- Upload --- */
    fprintf(stderr, "  upload: %s\n", filepath);
    int ret = g2_upload_patch(SLOT_A, filepath);
    TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, ret, "g2_upload_patch failed");

    /* g2_upload_patch's g2_drain_pending() may call g2_rearm(), leaving the G2 streaming.
     * g2_stop_comm() drains all pending packets and sends STOP_COMM, guaranteeing the
     * G2 is quiescent before the get-patch query (mirrors what a fresh process does). */
    usleep(600000);
    g2_stop_comm();

    /* --- Verify name via get-patch --- */
    cJSON *patch = g2_get_patch("A");
    TEST_ASSERT_NOT_NULL_MESSAGE(patch, "g2_get_patch returned NULL after upload");

    cJSON *name_item = cJSON_GetObjectItem(patch, "name");
    TEST_ASSERT_NOT_NULL_MESSAGE(name_item, "no 'name' field in get-patch result");
    const char *got_name = cJSON_GetStringValue(name_item);
    fprintf(stderr, "  G2 patch name after upload: '%s'\n", got_name ? got_name : "(null)");
    cJSON_Delete(patch);

    /* --- Download back --- */
    mkdir(TMP_OUT_DIR, 0755);
    char out_path[256];
    snprintf(out_path, sizeof(out_path), "%s/%s_roundtrip.pch2", TMP_OUT_DIR, label);
    cJSON *file_result = g2_get_patch_file("A", out_path);
    TEST_ASSERT_NOT_NULL_MESSAGE(file_result, "g2_get_patch_file returned NULL");
    cJSON_Delete(file_result);
    fprintf(stderr, "  saved: %s\n", out_path);

    /* --- Compare section IDs of original vs roundtrip --- */
    uint8_t orig_sections[32768], rt_sections[32768];
    int orig_len = read_pch2_sections(filepath, orig_sections, sizeof(orig_sections));
    int rt_len   = read_raw_sections(out_path,  rt_sections,  sizeof(rt_sections));

    TEST_ASSERT_TRUE_MESSAGE(orig_len > 0, "could not read original pch2 sections");
    TEST_ASSERT_TRUE_MESSAGE(rt_len   > 0, "could not read roundtrip pch2 sections");

    uint8_t orig_ids[32], rt_ids[32];
    int orig_count = collect_section_ids(orig_sections, orig_len, orig_ids, 32);
    int rt_count   = collect_section_ids(rt_sections,   rt_len,   rt_ids,   32);

    fprintf(stderr, "  orig sections (%d bytes, %d chunks):", orig_len, orig_count);
    for (int i = 0; i < orig_count; i++) fprintf(stderr, " %02x", orig_ids[i]);
    fprintf(stderr, "\n");
    fprintf(stderr, "  rt   sections (%d bytes, %d chunks):", rt_len, rt_count);
    for (int i = 0; i < rt_count; i++) fprintf(stderr, " %02x", rt_ids[i]);
    fprintf(stderr, "\n");

    /* Compare section IDs after filtering file-only sections and sorting.
     * The G2 drops 0x69/0x6f on round-trip and may reorder remaining sections. */
    uint8_t orig_filt[32], rt_filt[32];
    int orig_filt_count = filter_and_sort(orig_ids, orig_count, orig_filt);
    int rt_filt_count   = filter_and_sort(rt_ids,   rt_count,   rt_filt);

    TEST_ASSERT_EQUAL_INT_MESSAGE(orig_filt_count, rt_filt_count, "section count differs after filtering");
    TEST_ASSERT_EQUAL_UINT8_ARRAY_MESSAGE(orig_filt, rt_filt, orig_filt_count, "section IDs differ");

    usleep(300000);
}

/* ------------------------------------------------------------------ */

void test_upload_empty_patch(void) {
    do_upload_roundtrip("EmptyPatch", TEST_PATCHES_DIR "/EmptyPatch.pch2");
}

void test_upload_nl2(void) {
    do_upload_roundtrip("Analogue", TEST_PATCHES_DIR "/Analogue NL2.pch2");
}

void test_upload_dxbass(void) {
    do_upload_roundtrip("DXBass", TEST_PATCHES_DIR "/DXBass FM4.pch2");
}

void test_upload_mixt(void) {
    do_upload_roundtrip("Mixturtrautonium", TEST_PATCHES_DIR "/Mixturtrautonium.pch2");
}

/* ------------------------------------------------------------------ */

static void do_upload_perf_roundtrip(const char *label, const char *filepath) {
    ensure_g2();
    usleep(300000);

    fprintf(stderr, "  upload perf: %s\n", filepath);
    int ret = g2_upload_perf(filepath);
    TEST_ASSERT_EQUAL_INT_MESSAGE(G2_OK, ret, "g2_upload_perf failed");

    mkdir(TMP_OUT_DIR, 0755);
    char out_path[256];
    snprintf(out_path, sizeof(out_path), "%s/%s_roundtrip.prf2", TMP_OUT_DIR, label);

    cJSON *file_result = g2_get_perf_file(out_path);
    TEST_ASSERT_NOT_NULL_MESSAGE(file_result, "g2_get_perf_file returned NULL");

    cJSON *name_item = cJSON_GetObjectItem(file_result, "name");
    const char *got_name = name_item ? cJSON_GetStringValue(name_item) : NULL;
    fprintf(stderr, "  G2 perf name after upload: '%s'\n", got_name ? got_name : "(null)");
    cJSON_Delete(file_result);
    fprintf(stderr, "  saved: %s\n", out_path);

    /* Both original and roundtrip are prf2 files with text-header+NUL format */
    uint8_t orig_sections[65536], rt_sections[65536];
    int orig_len = read_pch2_sections(filepath, orig_sections, sizeof(orig_sections));
    int rt_len   = read_pch2_sections(out_path,  rt_sections,  sizeof(rt_sections));

    TEST_ASSERT_TRUE_MESSAGE(orig_len > 0, "could not read original prf2 sections");
    TEST_ASSERT_TRUE_MESSAGE(rt_len   > 0, "could not read roundtrip prf2 sections");

    uint8_t orig_ids[128], rt_ids[128];
    int orig_count = collect_section_ids(orig_sections, orig_len, orig_ids, 128);
    int rt_count   = collect_section_ids(rt_sections,   rt_len,   rt_ids,   128);

    fprintf(stderr, "  orig sections (%d bytes, %d chunks):", orig_len, orig_count);
    for (int i = 0; i < orig_count; i++) fprintf(stderr, " %02x", orig_ids[i]);
    fprintf(stderr, "\n");
    fprintf(stderr, "  rt   sections (%d bytes, %d chunks):", rt_len, rt_count);
    for (int i = 0; i < rt_count; i++) fprintf(stderr, " %02x", rt_ids[i]);
    fprintf(stderr, "\n");

    /* Drop file-only / structural sections before comparing:
     *   0x21 = C_PATCH_DESCR: file wrapper around each slot's patch — absent in USB roundtrip
     *   0x69 = file metadata: not sent over USB
     *   0x5f = C_KNOBS_GLOBAL: not included in g2_get_perf_file output
     *   0x6f = slot separator: g2_get_perf_file omits it after the last slot */
    uint8_t orig_filt[128], rt_filt[128];
    int orig_filt_count = 0, rt_filt_count = 0;
    for (int i = 0; i < orig_count; i++) {
        uint8_t id = orig_ids[i];
        if (id != 0x21 && id != 0x69 && id != 0x5f && id != 0x6f)
            orig_filt[orig_filt_count++] = id;
    }
    for (int i = 0; i < rt_count; i++) {
        uint8_t id = rt_ids[i];
        if (id != 0x21 && id != 0x69 && id != 0x5f && id != 0x6f)
            rt_filt[rt_filt_count++] = id;
    }
    qsort(orig_filt, (size_t)orig_filt_count, 1, cmp_u8);
    qsort(rt_filt,   (size_t)rt_filt_count,   1, cmp_u8);

    TEST_ASSERT_EQUAL_INT_MESSAGE(orig_filt_count, rt_filt_count, "perf section count differs");
    TEST_ASSERT_EQUAL_UINT8_ARRAY_MESSAGE(orig_filt, rt_filt, orig_filt_count, "perf section IDs differ");

    usleep(300000);
}

void test_upload_empty_perf(void) {
    do_upload_perf_roundtrip("EmptyPerf", TEST_PATCHES_DIR "/EmptyPerf.prf2");
}

void test_upload_morphing_drum(void) {
    do_upload_perf_roundtrip("MorphingDrumDemo", TEST_PATCHES_DIR "/MorphingDrumDemo.prf2");
}
