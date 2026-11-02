/*
 * Test for g2_parse_settings using real captured G2 data
 * Reads mock files from test/mocks/ directory
 */

#include "unity.h"
#include "unity_internals.h"
#include "test_parse_settings.h"
#include "../include/g2_protocol.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

static void hex_to_bytes(const char *hex, uint8_t *bytes, size_t *out_len) {
    size_t len = strlen(hex);
    *out_len = 0;
    for (size_t i = 0; i < len && i < 8192; i += 2) {
        if (hex[i] == '\n' || hex[i] == '\0') break;
        char byte_str[3] = { hex[i], hex[i+1], '\0' };
        bytes[*out_len] = (uint8_t)strtol(byte_str, NULL, 16);
        (*out_len)++;
    }
}

static void parse_mock_file(const char *filepath, uint8_t *synth_bytes, size_t *synth_len, uint8_t *perf_bytes, size_t *perf_len) {
    FILE *f = fopen(filepath, "r");
    if (!f) {
        fprintf(stderr, "Cannot open %s\n", filepath);
        return;
    }

    char line[16384] = {0};

    if (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "SYNTH:", 6) == 0) {
            char *hex = line + 6;
            char *colon = strchr(hex, ':');
            if (colon) {
                *synth_len = atoi(hex);
                hex = colon + 1;
                size_t hex_len = strlen(hex);
                if (hex[hex_len-1] == '\n') hex[hex_len-1] = '\0';
                hex_to_bytes(hex, synth_bytes, synth_len);
            }
        }
    }

    if (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "PERF:", 5) == 0) {
            char *hex = line + 5;
            char *colon = strchr(hex, ':');
            if (colon) {
                *perf_len = atoi(hex);
                hex = colon + 1;
                size_t hex_len = strlen(hex);
                if (hex[hex_len-1] == '\n') hex[hex_len-1] = '\0';
                hex_to_bytes(hex, perf_bytes, perf_len);
            }
        }
    }

    fclose(f);
}

static int get_focus_slot(cJSON *result) {
    cJSON *perf = cJSON_GetObjectItem(result, "patches");
    if (!perf) perf = cJSON_GetObjectItem(result, "performance");
    if (!perf) return -1;
    cJSON *focus = cJSON_GetObjectItem(perf, "focus");
    if (!focus || !focus->valuestring) return -1;
    if (strcmp(focus->valuestring, "A") == 0) return 0;
    if (strcmp(focus->valuestring, "B") == 0) return 1;
    if (strcmp(focus->valuestring, "C") == 0) return 2;
    if (strcmp(focus->valuestring, "D") == 0) return 3;
    return -1;
}

static int get_mode(cJSON *result) {
    cJSON *mode = cJSON_GetObjectItem(result, "mode");
    if (!mode || !mode->valuestring) return -1;
    return strcmp(mode->valuestring, "Performance") == 0 ? 1 : 0;
}

// static int get_bpm(cJSON *result) {
//     cJSON *perf = cJSON_GetObjectItem(result, "patches");
//     if (!perf) perf = cJSON_GetObjectItem(result, "performance");
//     if (!perf) return -1;
//     cJSON *bpm = cJSON_GetObjectItem(perf, "bpm");
//     if (!bpm) return -1;
//     return bpm->valueint;
// }

// static int get_clock_running(cJSON *result) {
//     cJSON *perf = cJSON_GetObjectItem(result, "patches");
//     if (!perf) perf = cJSON_GetObjectItem(result, "performance");
//     if (!perf) return -1;
//     cJSON *clock = cJSON_GetObjectItem(perf, "clockRunning");
//     if (!clock) return -1;
//     return cJSON_IsTrue(clock);
// }

// static int get_kb_split(cJSON *result) {
//     cJSON *perf = cJSON_GetObjectItem(result, "patches");
//     if (!perf) perf = cJSON_GetObjectItem(result, "performance");
//     if (!perf) return -1;
//     cJSON *split = cJSON_GetObjectItem(perf, "kbSplit");
//     if (!split) return -1;
//     return cJSON_IsTrue(split);
// }

// static int get_range_enable(cJSON *result) {
//     cJSON *perf = cJSON_GetObjectItem(result, "patches");
//     if (!perf) perf = cJSON_GetObjectItem(result, "performance");
//     if (!perf) return -1;
//     cJSON *range = cJSON_GetObjectItem(perf, "rangeEnable");
//     if (!range) return -1;
//     return cJSON_IsTrue(range);
// }

void test_patch_focus_c(void) {
    uint8_t synth_bytes[8192] = {0};
    uint8_t perf_bytes[8192] = {0};
    size_t synth_len = 0, perf_len = 0;

    parse_mock_file("test/mocks/patch-focus-c.txt", synth_bytes, &synth_len, perf_bytes, &perf_len);

    TEST_ASSERT_TRUE(synth_len > 0);
    TEST_ASSERT_TRUE(perf_len > 0);

    cJSON *result = g2_parse_settings(synth_bytes, synth_len, perf_bytes, perf_len);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT_EQUAL_INT(0, get_mode(result));  /* Patch mode */
    TEST_ASSERT_EQUAL_INT(2, get_focus_slot(result));  /* Focus C */

    cJSON_Delete(result);
}

void test_perf_focus_c(void) {
    uint8_t synth_bytes[8192] = {0};
    uint8_t perf_bytes[8192] = {0};
    size_t synth_len = 0, perf_len = 0;

    parse_mock_file("test/mocks/perf-focus-c.txt", synth_bytes, &synth_len, perf_bytes, &perf_len);

    TEST_ASSERT_TRUE(synth_len > 0);
    TEST_ASSERT_TRUE(perf_len > 0);

    cJSON *result = g2_parse_settings(synth_bytes, synth_len, perf_bytes, perf_len);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT_EQUAL_INT(1, get_mode(result));  /* Performance mode */
    TEST_ASSERT_EQUAL_INT(2, get_focus_slot(result));  /* Focus C */

    cJSON_Delete(result);
}

void test_patch_focus_a(void) {
    uint8_t synth_bytes[8192] = {0};
    uint8_t perf_bytes[8192] = {0};
    size_t synth_len = 0, perf_len = 0;

    parse_mock_file("test/mocks/patch-focus-a.txt", synth_bytes, &synth_len, perf_bytes, &perf_len);

    TEST_ASSERT_TRUE(synth_len > 0);
    TEST_ASSERT_TRUE(perf_len > 0);

    cJSON *result = g2_parse_settings(synth_bytes, synth_len, perf_bytes, perf_len);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT_EQUAL_INT(0, get_mode(result));  /* Patch mode */
    TEST_ASSERT_EQUAL_INT(0, get_focus_slot(result));  /* Focus A */

    cJSON_Delete(result);
}

void test_patch_focus_d(void) {
    uint8_t synth_bytes[8192] = {0};
    uint8_t perf_bytes[8192] = {0};
    size_t synth_len = 0, perf_len = 0;

    parse_mock_file("test/mocks/patch-focus-d.txt", synth_bytes, &synth_len, perf_bytes, &perf_len);

    TEST_ASSERT_TRUE(synth_len > 0);
    TEST_ASSERT_TRUE(perf_len > 0);

    cJSON *result = g2_parse_settings(synth_bytes, synth_len, perf_bytes, perf_len);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT_EQUAL_INT(0, get_mode(result));  /* Patch mode */
    TEST_ASSERT_EQUAL_INT(3, get_focus_slot(result));  /* Focus D */

    cJSON_Delete(result);
}

void test_factory_patch(void) {
    uint8_t synth_bytes[8192] = {0};
    uint8_t perf_bytes[8192] = {0};
    size_t synth_len = 0, perf_len = 0;

    parse_mock_file("test/mocks/factory-patch.txt", synth_bytes, &synth_len, perf_bytes, &perf_len);

    TEST_ASSERT_TRUE(synth_len > 0);
    TEST_ASSERT_TRUE(perf_len > 0);

    cJSON *result = g2_parse_settings(synth_bytes, synth_len, perf_bytes, perf_len);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT_EQUAL_INT(0, get_mode(result));  /* Patch mode */
    TEST_ASSERT_EQUAL_INT(0, get_focus_slot(result));  /* Focus A */

    cJSON_Delete(result);
}

void test_perf_focus_a(void) {
    uint8_t synth_bytes[8192] = {0};
    uint8_t perf_bytes[8192] = {0};
    size_t synth_len = 0, perf_len = 0;

    parse_mock_file("test/mocks/perf-focus-a.txt", synth_bytes, &synth_len, perf_bytes, &perf_len);

    TEST_ASSERT_TRUE(synth_len > 0);
    TEST_ASSERT_TRUE(perf_len > 0);

    cJSON *result = g2_parse_settings(synth_bytes, synth_len, perf_bytes, perf_len);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT_EQUAL_INT(1, get_mode(result));  /* Performance mode */
    TEST_ASSERT_EQUAL_INT(0, get_focus_slot(result));  /* Focus A */

    /* 0x11 slot byte 7 is the slot's MIDI channel (official SetMidiChannel): this unit's
     * 0a-0d, the same values as its synth-settings MIDI channels A-D in the SYNTH line. */
    cJSON *slots = cJSON_GetObjectItem(result, "slots");
    for (int i = 0; i < 4; i++)
        TEST_ASSERT_EQUAL_INT(0x0a + i, cJSON_GetObjectItem(cJSON_GetArrayItem(slots, i), "midiChannel")->valueint);
    TEST_ASSERT_EQUAL_INT(0, cJSON_GetObjectItem(cJSON_GetObjectItem(result, "performance"), "category")->valueint);

    cJSON_Delete(result);
}

/* set-synth-settings sends every field back as read (CSynthMap::WriteStream): patchSortMode,
 * perfSortMode, MIDI SendArp and VibratoRate used to go out as 0. The captured unit really has
 * patchSortMode 1 (base+0 = 0x81); the other three are set here. */
void test_synth_settings_set_msg_roundtrips_get_payload(void) {
    uint8_t synth_bytes[8192] = {0};
    uint8_t perf_bytes[8192] = {0};
    size_t synth_len = 0, perf_len = 0;
    parse_mock_file("test/mocks/perf-focus-a.txt", synth_bytes, &synth_len, perf_bytes, &perf_len);
    int base = 4 + (int)strlen((const char *)synth_bytes + 4) + 1;  /* "The Burp" + NUL */
    TEST_ASSERT_EQUAL_HEX8(0x81, synth_bytes[base + 0]);
    synth_bytes[base + 1]  = 3 << 1;
    synth_bytes[base + 14] |= 0x80;
    synth_bytes[base + 19] = 0x2a;

    cJSON *json = build_synth_bulk_json(synth_bytes, NULL);
    TEST_ASSERT_EQUAL_INT(1, cJSON_GetObjectItem(json, "patchSortMode")->valueint);
    TEST_ASSERT_EQUAL_INT(3, cJSON_GetObjectItem(json, "perfSortMode")->valueint);
    TEST_ASSERT_TRUE(cJSON_IsTrue(cJSON_GetObjectItem(json, "midiSendArp")));
    TEST_ASSERT_EQUAL_INT(0x2a, cJSON_GetObjectItem(json, "vibratoRate")->valueint);

    uint8_t out[64] = {0};
    size_t out_len = 0;
    TEST_ASSERT_EQUAL_INT(0, g2_build_synth_set_msg(json, out, &out_len));
    cJSON_Delete(json);
    /* SET = [0x03][name][fields]; GET = [4 header bytes][name][fields]: same bytes after the header. */
    TEST_ASSERT_EQUAL_HEX8_ARRAY(synth_bytes + 4, out + 1, (size_t)(base - 4 + 22));
}
