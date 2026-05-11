#pragma once
#include "output.h"
#include "cJSON.h"

int g2_daemon_run(output_format_t format);

/* Exposed for unit testing */
int    daemon_enqueue(const char *line);
char  *daemon_dequeue(void);
cJSON *daemon_parse_request(const char *line);
cJSON *daemon_make_ok(cJSON *id);
cJSON *daemon_make_error(cJSON *id, int code);
