/*
 * G2 CLI - Unit Test Runner
 * Run with: make test-unit
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

extern void test_parse_synth_name(void);
extern void test_parse_mode_patch(void);
extern void test_parse_mode_performance(void);
extern void test_parse_midi_channels(void);
extern void test_parse_performance_focus_slot(void);
extern void test_parse_slots_data(void);
extern void test_parse_local_on(void);
extern void test_parse_prgch_values(void);
extern void test_parse_clock_settings(void);
extern void test_parse_controllers(void);
extern void test_parse_tuning_cent(void);
extern void test_parse_global_octave_shift(void);
extern void test_parse_pedal(void);
extern void test_parse_mem_protect(void);

extern void test_patch_focus_c(void);
extern void test_perf_focus_c(void);
extern void test_patch_focus_a(void);
extern void test_patch_focus_d(void);
extern void test_factory_patch(void);
extern void test_perf_focus_a(void);

extern void test_patch_usb_to_pch2_strips_header(void);
extern void test_patch_usb_to_pch2_strips_trailer(void);
extern void test_patch_pch2_to_usb_adds_header_and_trailer(void);
extern void test_patch_roundtrip_conversion(void);
extern void test_perf_roundtrip_conversion(void);
extern void test_patch_usb_to_pch2_buffer_too_small(void);
extern void test_patch_pch2_to_usb_buffer_too_small(void);
extern void test_patch_usb_to_pch2_null_inputs(void);
extern void test_patch_pch2_to_usb_null_inputs(void);
extern void test_patch_usb_to_pch2_data_too_short(void);
extern void test_patch_usb_to_pch2_exact_size(void);
extern void test_slot_sections_canonical_reorders_hardware_train(void);
extern void test_slot_sections_canonical_preserves_repeated_id_order(void);
extern void test_slot_sections_canonical_keeps_existing_current_note(void);
extern void test_slot_sections_canonical_copies_malformed_train_verbatim(void);
extern void test_perf_settings_normalize_slots_rewrites_device_numbering(void);
extern void test_perf_settings_normalize_slots_handles_unterminated_16_char_name(void);
extern void test_perf_settings_normalize_slots_ignores_truncated_payload(void);

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

extern void test_set_cable_color_invalid_slot_low(void);
extern void test_set_cable_color_invalid_slot_high(void);
extern void test_set_cable_color_invalid_location(void);
extern void test_set_cable_color_invalid_color_high(void);
extern void test_set_cable_color_invalid_from_con_type(void);
extern void test_set_cable_color_invalid_to_con_type(void);

extern void test_set_morph_range_invalid_slot_low(void);
extern void test_set_morph_range_invalid_slot_high(void);
extern void test_set_morph_range_invalid_location(void);
extern void test_set_morph_range_invalid_morph_group_low(void);
extern void test_set_morph_range_invalid_morph_group_high(void);
extern void test_set_morph_range_invalid_range_low(void);
extern void test_set_morph_range_invalid_range_high(void);
extern void test_set_morph_range_invalid_variation(void);

extern void test_assign_knob_invalid_slot_low(void);
extern void test_assign_knob_invalid_slot_high(void);
extern void test_assign_knob_invalid_location(void);
extern void test_assign_knob_invalid_module_id_low(void);
extern void test_assign_knob_invalid_module_id_high(void);
extern void test_assign_knob_invalid_param_idx_low(void);
extern void test_assign_knob_invalid_param_idx_high(void);
extern void test_assign_knob_invalid_slot_index_low(void);
extern void test_assign_knob_invalid_slot_index_high(void);
extern void test_deassign_knob_invalid_slot_low(void);
extern void test_deassign_knob_invalid_slot_high(void);
extern void test_deassign_knob_invalid_slot_index_low(void);
extern void test_deassign_knob_invalid_slot_index_high(void);
extern void test_select_param_page_invalid_slot_low(void);
extern void test_select_param_page_invalid_slot_high(void);
extern void test_select_param_page_invalid_page_low(void);
extern void test_select_param_page_invalid_page_high(void);

extern void test_assign_global_knob_invalid_slot_low(void);
extern void test_assign_global_knob_invalid_slot_high(void);
extern void test_assign_global_knob_invalid_target_slot_low(void);
extern void test_assign_global_knob_invalid_target_slot_high(void);
extern void test_assign_global_knob_invalid_location(void);
extern void test_assign_global_knob_invalid_module_id_low(void);
extern void test_assign_global_knob_invalid_module_id_high(void);
extern void test_assign_global_knob_invalid_param_idx_low(void);
extern void test_assign_global_knob_invalid_param_idx_high(void);
extern void test_assign_global_knob_invalid_slot_index_low(void);
extern void test_assign_global_knob_invalid_slot_index_high(void);
extern void test_deassign_global_knob_invalid_slot_low(void);
extern void test_deassign_global_knob_invalid_slot_high(void);
extern void test_deassign_global_knob_invalid_slot_index_low(void);
extern void test_deassign_global_knob_invalid_slot_index_high(void);
extern void test_select_global_page_invalid_slot_low(void);
extern void test_select_global_page_invalid_slot_high(void);
extern void test_select_global_page_invalid_page_low(void);
extern void test_select_global_page_invalid_page_high(void);

extern void test_select_param_invalid_slot_low(void);
extern void test_select_param_invalid_slot_high(void);
extern void test_select_param_invalid_location_low(void);
extern void test_select_param_invalid_location_high(void);
extern void test_select_param_invalid_module_id_low(void);
extern void test_select_param_invalid_module_id_high(void);
extern void test_select_param_invalid_param_idx_low(void);
extern void test_select_param_invalid_param_idx_high(void);

extern void test_upload_patch_buf_invalid_slot_low(void);
extern void test_upload_patch_buf_invalid_slot_high(void);

extern void test_build_set_module_labels_four_buttons(void);
extern void test_set_module_labels_invalid_location(void);
extern void test_set_module_labels_malformed_groups(void);
extern void test_build_set_module_labels_rejects_malformed(void);
extern void test_set_module_labels_invalid_slot(void);
extern void test_build_set_module_labels_null_tokens_do_not_crash(void);
extern void test_sanitize_filename_replaces_path_separators(void);
extern void test_sanitize_filename_neutralises_dot_dot(void);
extern void test_sanitize_filename_keeps_plain_name_and_truncates(void);

extern void test_set_module_label_invalid_slot_low(void);
extern void test_set_module_label_invalid_slot_high(void);
extern void test_set_module_label_invalid_location(void);
extern void test_set_module_label_null_label(void);
extern void test_set_module_label_empty_label(void);

extern void test_set_perf_mode_invalid_mode_low(void);
extern void test_set_perf_mode_invalid_mode_high(void);
extern void test_set_perf_name_null_name(void);
extern void test_set_perf_name_empty_name(void);

extern void test_parse_pchlist_well_formed_returns_entries(void);
extern void test_parse_pchlist_skips_out_of_range_location(void);
extern void test_parse_pchlist_skips_missing_sibling_file(void);
extern void test_parse_pchlist_missing_file_returns_negative_one(void);
extern void test_parse_pchlist_resolves_name_with_extension_and_no_prefix(void);
extern void test_scan_bank_folder_assigns_sequential_locations_alphabetically(void);
extern void test_scan_bank_folder_ignores_other_type_extension(void);
extern void test_scan_bank_folder_missing_folder_returns_negative_one(void);
extern void test_build_flash_dump_raw_frame_byte_layout(void);
extern void test_build_flash_dump_raw_frame_16_char_name_has_no_terminator(void);
extern void test_build_flash_dump_raw_frame_long_name_is_nul_terminated(void);
extern void test_build_flash_dump_raw_frame_buffer_too_small(void);

extern void test_tokenize_del_cable(void);
extern void test_tokenize_del_module(void);
extern void test_tokenize_empty_string(void);
extern void test_tokenize_single_token(void);
extern void test_tokenize_extra_spaces(void);
extern void test_tokenize_set_module_color(void);
extern void test_tokenize_respects_max_argc(void);

extern void test_g2_set_target_updates_globals(void);
extern void test_g2_set_target_by_index_out_of_range(void);
extern void test_g2_connect_target_set_not_found_is_distinguishable(void);

/* Daemon is tested via integration tests (test_daemon.c), not unit tests */
// extern void test_daemon_parse_valid_json(void);
// extern void test_daemon_parse_bad_json(void);
// extern void test_daemon_parse_null_input(void);
// extern void test_daemon_parse_missing_cmd(void);
// extern void test_daemon_parse_missing_id(void);
// extern void test_daemon_make_ok_with_id(void);
// extern void test_daemon_make_ok_without_id(void);
// extern void test_daemon_make_error_with_id(void);
// extern void test_daemon_make_error_without_id(void);
// extern void test_daemon_queue_empty(void);
// extern void test_daemon_queue_enqueue_dequeue(void);

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

    RUN_TEST(test_parse_synth_name);
    RUN_TEST(test_parse_mode_patch);
    RUN_TEST(test_parse_mode_performance);
    RUN_TEST(test_parse_midi_channels);
    RUN_TEST(test_parse_performance_focus_slot);
    RUN_TEST(test_parse_slots_data);
    RUN_TEST(test_parse_local_on);
    RUN_TEST(test_parse_prgch_values);
    RUN_TEST(test_parse_clock_settings);
    RUN_TEST(test_parse_controllers);
    RUN_TEST(test_parse_tuning_cent);
    RUN_TEST(test_parse_global_octave_shift);
    RUN_TEST(test_parse_pedal);
    RUN_TEST(test_parse_mem_protect);

    /* Real G2 data tests - require mock files in test/mocks/ */
    RUN_TEST(test_patch_focus_c);
    RUN_TEST(test_perf_focus_c);
    RUN_TEST(test_patch_focus_a);
    RUN_TEST(test_patch_focus_d);
    RUN_TEST(test_factory_patch);
    RUN_TEST(test_perf_focus_a);

    /* Patch format conversion tests */
    RUN_TEST(test_patch_usb_to_pch2_strips_header);
    RUN_TEST(test_patch_usb_to_pch2_strips_trailer);
    RUN_TEST(test_patch_pch2_to_usb_adds_header_and_trailer);
    RUN_TEST(test_patch_roundtrip_conversion);
    RUN_TEST(test_perf_roundtrip_conversion);
    RUN_TEST(test_patch_usb_to_pch2_buffer_too_small);
    RUN_TEST(test_patch_pch2_to_usb_buffer_too_small);
    RUN_TEST(test_patch_usb_to_pch2_null_inputs);
    RUN_TEST(test_patch_pch2_to_usb_null_inputs);
    RUN_TEST(test_patch_usb_to_pch2_data_too_short);
    RUN_TEST(test_patch_usb_to_pch2_exact_size);
    RUN_TEST(test_slot_sections_canonical_reorders_hardware_train);
    RUN_TEST(test_slot_sections_canonical_preserves_repeated_id_order);
    RUN_TEST(test_slot_sections_canonical_keeps_existing_current_note);
    RUN_TEST(test_slot_sections_canonical_copies_malformed_train_verbatim);
    RUN_TEST(test_perf_settings_normalize_slots_rewrites_device_numbering);
    RUN_TEST(test_perf_settings_normalize_slots_handles_unterminated_16_char_name);
    RUN_TEST(test_perf_settings_normalize_slots_ignores_truncated_payload);

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

    /* set-cable-color validation tests */
    RUN_TEST(test_set_cable_color_invalid_slot_low);
    RUN_TEST(test_set_cable_color_invalid_slot_high);
    RUN_TEST(test_set_cable_color_invalid_location);
    RUN_TEST(test_set_cable_color_invalid_color_high);
    RUN_TEST(test_set_cable_color_invalid_from_con_type);
    RUN_TEST(test_set_cable_color_invalid_to_con_type);

    RUN_TEST(test_set_morph_range_invalid_slot_low);
    RUN_TEST(test_set_morph_range_invalid_slot_high);
    RUN_TEST(test_set_morph_range_invalid_location);
    RUN_TEST(test_set_morph_range_invalid_morph_group_low);
    RUN_TEST(test_set_morph_range_invalid_morph_group_high);
    RUN_TEST(test_set_morph_range_invalid_range_low);
    RUN_TEST(test_set_morph_range_invalid_range_high);
    RUN_TEST(test_set_morph_range_invalid_variation);

    RUN_TEST(test_assign_knob_invalid_slot_low);
    RUN_TEST(test_assign_knob_invalid_slot_high);
    RUN_TEST(test_assign_knob_invalid_location);
    RUN_TEST(test_assign_knob_invalid_module_id_low);
    RUN_TEST(test_assign_knob_invalid_module_id_high);
    RUN_TEST(test_assign_knob_invalid_param_idx_low);
    RUN_TEST(test_assign_knob_invalid_param_idx_high);
    RUN_TEST(test_assign_knob_invalid_slot_index_low);
    RUN_TEST(test_assign_knob_invalid_slot_index_high);
    RUN_TEST(test_deassign_knob_invalid_slot_low);
    RUN_TEST(test_deassign_knob_invalid_slot_high);
    RUN_TEST(test_deassign_knob_invalid_slot_index_low);
    RUN_TEST(test_deassign_knob_invalid_slot_index_high);
    RUN_TEST(test_select_param_page_invalid_slot_low);
    RUN_TEST(test_select_param_page_invalid_slot_high);
    RUN_TEST(test_select_param_page_invalid_page_low);
    RUN_TEST(test_select_param_page_invalid_page_high);

    RUN_TEST(test_assign_global_knob_invalid_slot_low);
    RUN_TEST(test_assign_global_knob_invalid_slot_high);
    RUN_TEST(test_assign_global_knob_invalid_target_slot_low);
    RUN_TEST(test_assign_global_knob_invalid_target_slot_high);
    RUN_TEST(test_assign_global_knob_invalid_location);
    RUN_TEST(test_assign_global_knob_invalid_module_id_low);
    RUN_TEST(test_assign_global_knob_invalid_module_id_high);
    RUN_TEST(test_assign_global_knob_invalid_param_idx_low);
    RUN_TEST(test_assign_global_knob_invalid_param_idx_high);
    RUN_TEST(test_assign_global_knob_invalid_slot_index_low);
    RUN_TEST(test_assign_global_knob_invalid_slot_index_high);
    RUN_TEST(test_deassign_global_knob_invalid_slot_low);
    RUN_TEST(test_deassign_global_knob_invalid_slot_high);
    RUN_TEST(test_deassign_global_knob_invalid_slot_index_low);
    RUN_TEST(test_deassign_global_knob_invalid_slot_index_high);
    RUN_TEST(test_select_global_page_invalid_slot_low);
    RUN_TEST(test_select_global_page_invalid_slot_high);
    RUN_TEST(test_select_global_page_invalid_page_low);
    RUN_TEST(test_select_global_page_invalid_page_high);

    RUN_TEST(test_select_param_invalid_slot_low);
    RUN_TEST(test_select_param_invalid_slot_high);
    RUN_TEST(test_select_param_invalid_location_low);
    RUN_TEST(test_select_param_invalid_location_high);
    RUN_TEST(test_select_param_invalid_module_id_low);
    RUN_TEST(test_select_param_invalid_module_id_high);
    RUN_TEST(test_select_param_invalid_param_idx_low);
    RUN_TEST(test_select_param_invalid_param_idx_high);

    RUN_TEST(test_upload_patch_buf_invalid_slot_low);
    RUN_TEST(test_upload_patch_buf_invalid_slot_high);

    /* set-module-labels tests */
    RUN_TEST(test_build_set_module_labels_four_buttons);
    RUN_TEST(test_set_module_labels_invalid_location);
    RUN_TEST(test_set_module_labels_malformed_groups);
    RUN_TEST(test_build_set_module_labels_rejects_malformed);
    RUN_TEST(test_set_module_labels_invalid_slot);
    RUN_TEST(test_build_set_module_labels_null_tokens_do_not_crash);
    RUN_TEST(test_sanitize_filename_replaces_path_separators);
    RUN_TEST(test_sanitize_filename_neutralises_dot_dot);
    RUN_TEST(test_sanitize_filename_keeps_plain_name_and_truncates);

    /* set-module-name validation tests */
    RUN_TEST(test_set_module_label_invalid_slot_low);
    RUN_TEST(test_set_module_label_invalid_slot_high);
    RUN_TEST(test_set_module_label_invalid_location);
    RUN_TEST(test_set_module_label_null_label);
    RUN_TEST(test_set_module_label_empty_label);

    /* set-perf-mode and set-perf-name parameter validation tests */
    RUN_TEST(test_set_perf_mode_invalid_mode_low);
    RUN_TEST(test_set_perf_mode_invalid_mode_high);
    RUN_TEST(test_set_perf_name_null_name);
    RUN_TEST(test_set_perf_name_empty_name);

    /* send-bank source parsing + write-frame layout tests */
    RUN_TEST(test_parse_pchlist_well_formed_returns_entries);
    RUN_TEST(test_parse_pchlist_skips_out_of_range_location);
    RUN_TEST(test_parse_pchlist_skips_missing_sibling_file);
    RUN_TEST(test_parse_pchlist_missing_file_returns_negative_one);
    RUN_TEST(test_parse_pchlist_resolves_name_with_extension_and_no_prefix);
    RUN_TEST(test_scan_bank_folder_assigns_sequential_locations_alphabetically);
    RUN_TEST(test_scan_bank_folder_ignores_other_type_extension);
    RUN_TEST(test_scan_bank_folder_missing_folder_returns_negative_one);
    RUN_TEST(test_build_flash_dump_raw_frame_byte_layout);
    RUN_TEST(test_build_flash_dump_raw_frame_16_char_name_has_no_terminator);
    RUN_TEST(test_build_flash_dump_raw_frame_long_name_is_nul_terminated);
    RUN_TEST(test_build_flash_dump_raw_frame_buffer_too_small);

    /* seq tokenize tests */
    RUN_TEST(test_tokenize_del_cable);
    RUN_TEST(test_tokenize_del_module);
    RUN_TEST(test_tokenize_empty_string);
    RUN_TEST(test_tokenize_single_token);
    RUN_TEST(test_tokenize_extra_spaces);
    RUN_TEST(test_tokenize_set_module_color);
    RUN_TEST(test_tokenize_respects_max_argc);

    /* multi-device targeting */
    RUN_TEST(test_g2_set_target_updates_globals);
    RUN_TEST(test_g2_set_target_by_index_out_of_range);
    RUN_TEST(test_g2_connect_target_set_not_found_is_distinguishable);

    /* daemon JSON/queue tests — commented out, tested via integration tests instead
    RUN_TEST(test_daemon_parse_valid_json);
    RUN_TEST(test_daemon_parse_bad_json);
    RUN_TEST(test_daemon_parse_null_input);
    RUN_TEST(test_daemon_parse_missing_cmd);
    RUN_TEST(test_daemon_parse_missing_id);
    RUN_TEST(test_daemon_make_ok_with_id);
    RUN_TEST(test_daemon_make_ok_without_id);
    RUN_TEST(test_daemon_make_error_with_id);
    RUN_TEST(test_daemon_make_error_without_id);
    RUN_TEST(test_daemon_queue_empty);
    RUN_TEST(test_daemon_queue_enqueue_dequeue);
    */

    return UNITY_END();
}