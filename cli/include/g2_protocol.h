/*
 * G2 CLI - Protocol parsing layer (internal header)
 * Include only within src/ — not part of the public API.
 */

#ifndef G2_PROTOCOL_H
#define G2_PROTOCOL_H

#include <stdint.h>
#include <stddef.h>
#include "cJSON.h"

/* Build a settings JSON object from a raw synth-settings bulk payload.
 * If type is non-NULL it is added as the first field (for watch events). */
cJSON *build_synth_bulk_json(const uint8_t *bulkData, const char *type);

/* Append "performance"/"patches" + "slots" sub-objects to an existing root.
 * mode=1 → performance, mode=0 → patch. */
void perf_parse_and_add(const uint8_t *perfData, size_t perfSize,
                        int mode, cJSON *root);

/* Parse combined synth+perf bulk data into a settings JSON object */
cJSON *g2_parse_settings(const uint8_t *bulkData, size_t bulkSize,
                         const uint8_t *perfData, size_t perfSize);

/* Build a 56-byte SET payload from a JSON params object.
 * Returns 0 on success, -1 if required fields are missing. */
int g2_build_synth_set_msg(cJSON *params, uint8_t *out, size_t *out_len);

#endif /* G2_PROTOCOL_H */
