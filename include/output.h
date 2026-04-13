/*
 * G2 CLI - Output formatting
 */

#ifndef __G2_OUTPUT_H__
#define __G2_OUTPUT_H__

#include <stdint.h>
#include "g2_device.h"
#include "cJSON.h"

/* Output JSON in the specified format */
void output_json(const cJSON *json, int format);

/* Output error as JSON */
void output_error_json(const char *error, int format);

#endif /* __G2_OUTPUT_H__ */
