/*
 * G2 CLI - Output formatting
 */

#ifndef __G2_OUTPUT_H__
#define __G2_OUTPUT_H__

#include <stdint.h>
#include "cJSON.h"

typedef enum {
    OUTPUT_DEFAULT,
    OUTPUT_JSON,
    OUTPUT_PRETTY,
    OUTPUT_TREE
} output_format_t;

/* Output JSON in the specified format */
void output_json(const cJSON *json, int format);

/* Output error as JSON */
void output_error_json(const char *error, int format);

#endif /* __G2_OUTPUT_H__ */
