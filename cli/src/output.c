/*
 * G2 CLI - Output formatting implementation
 */

#include <stdio.h>
#include <stdlib.h>
#include "cJSON.h"
#include "output.h"

void output_json(const cJSON *json, int format) {
    (void)format;
    char *s = cJSON_PrintUnformatted(json);
    if (!s) return;
    printf("%s\n", s);
    free(s);
}

void output_error_json(const char *error, int format) {
    (void)format;
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddStringToObject(obj, "error", error);
    char *s = cJSON_PrintUnformatted(obj);
    if (s) { printf("%s\n", s); free(s); }
    cJSON_Delete(obj);
}
