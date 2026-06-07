/*
 * Test for g2_parse_settings with mocked G2 responses
 */

#include "unity.h"
#include "unity_internals.h"
#include "test_parse_settings.h"
#include <string.h>

static int json_has_string(cJSON *obj, const char *key, const char *expected) {
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (!item) return 0;
    if (!cJSON_IsString(item)) return 0;
    return strcmp(item->valuestring, expected) == 0;
}

static int json_has_number(cJSON *obj, const char *key, int expected) {
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (!item) return 0;
    if (!cJSON_IsNumber(item)) return 0;
    return item->valueint == expected;
}

static int json_has_bool(cJSON *obj, const char *key, int expected) {
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (!item) return 0;
    if (!cJSON_IsBool(item)) return 0;
    return cJSON_IsTrue(item) == expected;
}

void test_parse_synth_name(void) {
    /* Mock bulk data with synth name "TestSynth" */
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;  /* size = 64 */
    strcpy((char *)&bulkData[4], "TestSynth");
    bulkData[13] = 0x00;  /* mode = Patch (bit 7 = 0) */
    
    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *name = cJSON_GetObjectItem(result, "synthName");
    TEST_ASSERT_NOT_NULL(name);
    TEST_ASSERT_EQUAL_STRING("TestSynth", name->valuestring);
    
    cJSON_Delete(result);
}

void test_parse_mode_patch(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    bulkData[13] = 0x00;  /* mode = Patch (bit 7 = 0) */
    
    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *mode = cJSON_GetObjectItem(result, "mode");
    TEST_ASSERT_NOT_NULL(mode);
    TEST_ASSERT_EQUAL_STRING("Patch", mode->valuestring);
    
    cJSON_Delete(result);
}

void test_parse_mode_performance(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* "Test"\0 = 5 bytes → nameLen=5, base=9; mode at base+0 = bulk[9] */
    bulkData[9] = 0x80;   /* mode = Performance (bit 7) */
    
    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *mode = cJSON_GetObjectItem(result, "mode");
    TEST_ASSERT_NOT_NULL(mode);
    TEST_ASSERT_EQUAL_STRING("Performance", mode->valuestring);
    
    cJSON_Delete(result);
}

void test_parse_midi_channels(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* nameLen=5, base=9; MIDI slots at base+5..9 = bulk[14..18] */
    bulkData[14] = 0x09;  /* MIDI A stored 9 (0-indexed) → output 10 */
    bulkData[15] = 0x0A;  /* MIDI B stored 10 → output 11 */
    bulkData[16] = 0x0B;  /* MIDI C stored 11 → output 12 */
    bulkData[17] = 0x0C;  /* MIDI D stored 12 → output 13 */
    bulkData[18] = 0x0E;  /* MIDI global stored 14 → output 15 */
    
    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *midi = cJSON_GetObjectItem(result, "midi");
    TEST_ASSERT_NOT_NULL(midi);
    
    cJSON *slots = cJSON_GetObjectItem(midi, "slots");
    TEST_ASSERT_NOT_NULL(slots);
    
    TEST_ASSERT(json_has_number(slots, "a", 10));
    TEST_ASSERT(json_has_number(slots, "b", 11));
    TEST_ASSERT(json_has_number(slots, "c", 12));
    TEST_ASSERT(json_has_number(slots, "d", 13));
    TEST_ASSERT(json_has_number(slots, "global", 15));  /* stored 0-indexed + 1 */
    
    cJSON_Delete(result);
}

void test_parse_performance_focus_slot(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    bulkData[13] = 0x00;
    
    uint8_t perfData[256] = {0};
    perfData[0] = 0x01;
    strcpy((char *)&perfData[4], "TestPerf");
    /* Focus slot is in bits 4-5 of byte at position after name + 4 */
    /* "TestPerf" is 8 chars + null = 9 bytes, so remaining starts at offset 13 */
    /* perfSettings = remaining + 4 = perfData[17] */
    /* For focusSlot = 2 (slot C), perfSettings[0] needs bits 2-3 = 0b10 */
    perfData[17] = 0x08;  /* Focus = slot C (bits 2-3 = 0b10 = 2) */
    perfData[18] = 0x01;  /* rangeEnable */
    perfData[19] = 0x78;  /* bpm = 120 */
    perfData[20] = 0x01;  /* split = 1 */
    perfData[21] = 0x01;  /* clockRun = 1 */
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 256);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *perf = cJSON_GetObjectItem(result, "patches");
    TEST_ASSERT_NOT_NULL(perf);
    
    cJSON *focus = cJSON_GetObjectItem(perf, "focus");
    TEST_ASSERT_NOT_NULL(focus);
    TEST_ASSERT_EQUAL_STRING("C", focus->valuestring);
    
    cJSON_Delete(result);
}

void test_parse_slots_data(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    bulkData[13] = 0x00;
    
    uint8_t perfData[256] = {0};
    perfData[0] = 0x01;
    strcpy((char *)&perfData[4], "TestPerf");
    /* "TestPerf" is 8 chars + null = 9 bytes, so remaining starts at offset 13 */
    /* perfSettings at remaining + 4 = perfData[17] */
    perfData[17] = 0x00;  /* Focus = slot A */
    perfData[18] = 0x00;  /* rangeEnable */
    perfData[19] = 0x78;  /* bpm = 120 */
    perfData[20] = 0x00;  /* split = 0 */
    perfData[21] = 0x00;  /* clockRun = 0 */
    
    /* Slot data starts at remaining + 11 = perfData[13 + 11] = perfData[24] */
    uint8_t *slotA = &perfData[24];
    strcpy((char *)slotA, "SlotA");
    slotA[6] = 0x01;   /* active */
    slotA[7] = 0x01;   /* key */
    slotA[8] = 0x00;   /* hold */
    slotA[9] = 0x00;   /* bank */
    slotA[10] = 0x05;  /* patch */
    slotA[11] = 0x00;  /* low */
    slotA[12] = 0x3C;  /* high = 60 */
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 256);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *slots = cJSON_GetObjectItem(result, "slots");
    TEST_ASSERT_NOT_NULL(slots);
    TEST_ASSERT_EQUAL_INT(4, cJSON_GetArraySize(slots));
    
    cJSON *slot0 = cJSON_GetArrayItem(slots, 0);
    TEST_ASSERT_NOT_NULL(slot0);
    
    TEST_ASSERT(json_has_string(slot0, "slot", "A"));
    TEST_ASSERT(json_has_number(slot0, "bank", 0));
    TEST_ASSERT(json_has_number(slot0, "patch", 5));
    TEST_ASSERT(json_has_string(slot0, "name", "SlotA"));
    TEST_ASSERT(json_has_bool(slot0, "active", 1));
    TEST_ASSERT(json_has_bool(slot0, "key", 1));
    
    cJSON_Delete(result);
}

void test_parse_local_on(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    bulkData[13] = 0x00;
    /* nameLen=5, base=9; local at base+11 = bulk[20] */
    bulkData[20] = 0x80;  /* local = on (bit 7) */
    
    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *midi = cJSON_GetObjectItem(result, "midi");
    TEST_ASSERT_NOT_NULL(midi);
    
    cJSON *local = cJSON_GetObjectItem(midi, "local");
    TEST_ASSERT_NOT_NULL(local);
    TEST_ASSERT_EQUAL_INT(1, cJSON_IsTrue(local));
    
    cJSON_Delete(result);
}

void test_parse_prgch_values(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    bulkData[13] = 0x00;
    /* nameLen=5, base=9; prgch at base+12 = bulk[21] */
    bulkData[21] = 0x02;  /* prgch = recv (bit 1 = 1, bit 0 = 0) => value 2 */
    
    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;
    
    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);
    
    cJSON *midi = cJSON_GetObjectItem(result, "midi");
    TEST_ASSERT_NOT_NULL(midi);
    
    cJSON *prgch = cJSON_GetObjectItem(midi, "prgch");
    TEST_ASSERT_NOT_NULL(prgch);
    TEST_ASSERT(json_has_number(midi, "prgch", 2));  /* 0x02 = bit1=recv, bit0=send → value 2 */
    
    cJSON_Delete(result);
}

void test_parse_clock_settings(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* nameLen=5, base=9; clock at base+14 = bulk[23]
     * 0x40 = bit6=1 → clkSend=1; bit5=0 → IgnoreExtClock=0 → clkRecv=1 */
    bulkData[23] = 0x40;

    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;

    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);

    cJSON *midi = cJSON_GetObjectItem(result, "midi");
    TEST_ASSERT_NOT_NULL(midi);

    TEST_ASSERT(json_has_bool(midi, "clkse", 1));
    TEST_ASSERT(json_has_bool(midi, "clkre", 1));

    cJSON_Delete(result);
}

void test_parse_controllers(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* nameLen=5, base=9; controllers at base+13 = bulk[22] */
    bulkData[22] = 0x03;  /* bit1=ctrlsRecv=1, bit0=ctrlsSend=1 */

    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;

    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);

    cJSON *midi = cJSON_GetObjectItem(result, "midi");
    TEST_ASSERT_NOT_NULL(midi);

    TEST_ASSERT(json_has_bool(midi, "ctrlsRecv", 1));
    TEST_ASSERT(json_has_bool(midi, "ctrlsSend", 1));

    cJSON_Delete(result);
}

void test_parse_tuning_cent(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* nameLen=5, base=9; tuneCent at base+15 = bulk[24] */
    bulkData[24] = (uint8_t)(int8_t)-50;  /* -50 cents */

    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;

    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);

    cJSON *tuning = cJSON_GetObjectItem(result, "tuning");
    TEST_ASSERT_NOT_NULL(tuning);
    TEST_ASSERT(json_has_number(tuning, "cent", -50));

    cJSON_Delete(result);
}

void test_parse_global_octave_shift(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* nameLen=5, base=9; gOctActive at base+16 = bulk[25], gOctShift at base+17 = bulk[26] */
    bulkData[25] = 0x80;                    /* active = 1 (bit 7) */
    bulkData[26] = (uint8_t)(int8_t)-2;     /* shift = -2 */

    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;

    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT(json_has_bool(result, "globalOctaveShiftActive", 1));
    TEST_ASSERT(json_has_number(result, "globalOctaveShift", -2));

    cJSON_Delete(result);
}

void test_parse_pedal(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* nameLen=5, base=9; pedalPol at base+20 = bulk[29], pedalGain at base+21 = bulk[30] */
    bulkData[29] = 0x80;  /* polarity = 1 (bit 7) */
    bulkData[30] = 24;    /* gain = 24 */

    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;

    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);

    cJSON *pedal = cJSON_GetObjectItem(result, "pedal");
    TEST_ASSERT_NOT_NULL(pedal);
    TEST_ASSERT(json_has_bool(pedal, "polarity", 1));
    TEST_ASSERT(json_has_number(pedal, "gain", 24));

    cJSON_Delete(result);
}

void test_parse_mem_protect(void) {
    uint8_t bulkData[64] = {0};
    bulkData[0] = 0x00;
    bulkData[1] = 0x40;
    strcpy((char *)&bulkData[4], "Test");
    /* nameLen=5, base=9; memProtect at base+4 = bulk[13] */
    bulkData[13] = 0x80;

    uint8_t perfData[64] = {0};
    perfData[0] = 0x01;

    cJSON *result = g2_parse_settings(bulkData, 64, perfData, 64);
    TEST_ASSERT_NOT_NULL(result);

    TEST_ASSERT(json_has_bool(result, "memProtect", 1));

    cJSON_Delete(result);
}
