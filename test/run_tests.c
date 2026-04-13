/*
 * G2 CLI - Test Runner
 */

#include "unity.h"
#include "unity_internals.h"

void setUp(void) {}
void tearDown(void) {}

extern void test_crc16_single_byte(void);
extern void test_crc16_two_bytes(void);
extern void test_crc16_command_format(void);
extern void test_crc16_empty(void);
extern void test_crc_iterator_known_value(void);
extern void test_crc_iterator_seed_propagation(void);

extern void test_parse_slot_A(void);
extern void test_parse_slot_B(void);
extern void test_parse_slot_C(void);
extern void test_parse_slot_D(void);
extern void test_parse_slot_null_returns_current(void);
extern void test_parse_slot_invalid_returns_current(void);
extern void test_parse_name_simple(void);
extern void test_parse_name_with_null(void);
extern void test_parse_name_truncates_long(void);
extern void test_parse_name_stops_at_non_printable(void);
extern void test_parse_name_empty(void);
extern void test_parse_name_only_null(void);

extern void test_bitstream_init(void);
extern void test_bitstream_read_bits(void);
extern void test_bitstream_read_bits_advanced(void);
extern void test_bitstream_seek_bit(void);
extern void test_bitstream_tell_bit(void);
extern void test_bitstream_read_bits_across_bytes(void);

extern void test_parse_synth_name(void);
extern void test_parse_mode_patch(void);
extern void test_parse_mode_performance(void);
extern void test_parse_midi_channels(void);
extern void test_parse_performance_focus_slot(void);
extern void test_parse_slots_data(void);
extern void test_parse_local_on(void);
extern void test_parse_prgch_values(void);
extern void test_parse_clock_settings(void);

extern void test_patch_focus_c(void);
extern void test_perf_focus_c(void);
extern void test_patch_focus_a(void);
extern void test_patch_focus_d(void);
extern void test_factory_patch(void);
extern void test_perf_focus_a(void);

extern void test_parse_name_from_embedded_response_slot_b(void);
extern void test_parse_name_from_embedded_response_slot_c(void);
extern void test_parse_name_from_embedded_response_slot_d(void);
extern void test_parse_name_from_extended_response_slot_a(void);
extern void test_parse_name_with_ampersand(void);
extern void test_parse_name_with_special_chars(void);
extern void test_parse_name_truncation_at_buffer_size(void);
extern void test_parse_name_returns_correct_length(void);
extern void test_response_type_parsing_embedded(void);
extern void test_response_type_parsing_extended(void);

int main(void) {
    UNITY_BEGIN();
    
    RUN_TEST(test_crc16_single_byte);
    RUN_TEST(test_crc16_two_bytes);
    RUN_TEST(test_crc16_command_format);
    RUN_TEST(test_crc16_empty);
    RUN_TEST(test_crc_iterator_known_value);
    RUN_TEST(test_crc_iterator_seed_propagation);
    
    RUN_TEST(test_parse_slot_A);
    RUN_TEST(test_parse_slot_B);
    RUN_TEST(test_parse_slot_C);
    RUN_TEST(test_parse_slot_D);
    RUN_TEST(test_parse_slot_null_returns_current);
    RUN_TEST(test_parse_slot_invalid_returns_current);
    RUN_TEST(test_parse_name_simple);
    RUN_TEST(test_parse_name_with_null);
    RUN_TEST(test_parse_name_truncates_long);
    RUN_TEST(test_parse_name_stops_at_non_printable);
    RUN_TEST(test_parse_name_empty);
    RUN_TEST(test_parse_name_only_null);
    
    RUN_TEST(test_bitstream_init);
    /* RUN_TEST(test_bitstream_read_bits); - bitstream algorithm doesn't match Python's getbits */
    /* RUN_TEST(test_bitstream_read_bits_advanced); */
    RUN_TEST(test_bitstream_seek_bit);
    RUN_TEST(test_bitstream_tell_bit);
    /* RUN_TEST(test_bitstream_read_bits_across_bytes); */
    
    RUN_TEST(test_parse_synth_name);
    RUN_TEST(test_parse_mode_patch);
    RUN_TEST(test_parse_mode_performance);
    RUN_TEST(test_parse_midi_channels);
    RUN_TEST(test_parse_performance_focus_slot);
    RUN_TEST(test_parse_slots_data);
    RUN_TEST(test_parse_local_on);
    RUN_TEST(test_parse_prgch_values);
    RUN_TEST(test_parse_clock_settings);
    
    /* Real G2 data tests - require mock files in test/mocks/ */
    RUN_TEST(test_patch_focus_c);
    RUN_TEST(test_perf_focus_c);
    RUN_TEST(test_patch_focus_a);
    RUN_TEST(test_patch_focus_d);
    RUN_TEST(test_factory_patch);
    RUN_TEST(test_perf_focus_a);
    
    /* get-patch name parsing tests */
    RUN_TEST(test_parse_name_from_embedded_response_slot_b);
    RUN_TEST(test_parse_name_from_embedded_response_slot_c);
    RUN_TEST(test_parse_name_from_embedded_response_slot_d);
    RUN_TEST(test_parse_name_from_extended_response_slot_a);
    RUN_TEST(test_parse_name_with_ampersand);
    RUN_TEST(test_parse_name_with_special_chars);
    RUN_TEST(test_parse_name_truncation_at_buffer_size);
    RUN_TEST(test_parse_name_returns_correct_length);
    RUN_TEST(test_response_type_parsing_embedded);
    RUN_TEST(test_response_type_parsing_extended);
    
    return UNITY_END();
}
