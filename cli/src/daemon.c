/*
 * G2 CLI - Daemon subcommand
 *
 * Runs the watch loop in the main thread while a background thread reads
 * newline-delimited JSON commands from stdin and queues them for execution.
 * Commands are dispatched between watch poll iterations (at most 100 ms delay).
 *
 * Protocol:
 *   Input:  {"id":1,"cmd":"add-module","args":["A","va","2","1","1"]}\n
 *   Output: {"id":1,"ok":true}\n          (action)
 *           {"id":1,"ok":true,"data":{}} \n  (query)
 *           {"id":1,"ok":false,"code":-3}\n  (error)
 *   Watch events flow to stdout unchanged (no "id" field).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include "g2_device.h"
#include "utils.h"
#include "cJSON.h"
#include "daemon.h"

/* ── command queue ─────────────────────────────────────────────────────── */

typedef struct cmd_entry {
	char line[4096];
	struct cmd_entry *next;
} cmd_entry_t;

static pthread_mutex_t q_mutex = PTHREAD_MUTEX_INITIALIZER;
static cmd_entry_t *q_head = NULL;
static cmd_entry_t *q_tail = NULL;

int daemon_enqueue(const char *line) {
	cmd_entry_t *e = malloc(sizeof(*e));
	if (!e) return -1;
	strncpy(e->line, line, sizeof(e->line) - 1);
	e->line[sizeof(e->line) - 1] = '\0';
	e->next = NULL;
	pthread_mutex_lock(&q_mutex);
	if (q_tail) q_tail->next = e;
	else q_head = e;
	q_tail = e;
	pthread_mutex_unlock(&q_mutex);
	return 0;
}

/* Returns malloc'd copy of dequeued line, or NULL if empty. Caller frees. */
char *daemon_dequeue(void) {
	pthread_mutex_lock(&q_mutex);
	cmd_entry_t *e = q_head;
	if (e) {
		q_head = e->next;
		if (!q_head) q_tail = NULL;
	}
	pthread_mutex_unlock(&q_mutex);
	if (!e) return NULL;
	char *line = malloc(sizeof(e->line));
	if (line) memcpy(line, e->line, sizeof(e->line));
	free(e);
	return line;
}

/* ── JSON helpers ──────────────────────────────────────────────────────── */

/* Parse a JSON line. Returns parsed object or NULL on error. Caller cJSON_Deletes. */
cJSON *daemon_parse_request(const char *line) {
	if (!line) return NULL;
	return cJSON_Parse(line);
}

/* Build {"id":<id>,"ok":true}. id may be NULL. Caller cJSON_Deletes. */
cJSON *daemon_make_ok(cJSON *id) {
	cJSON *r = cJSON_CreateObject();
	if (id) cJSON_AddItemToObject(r, "id", cJSON_Duplicate(id, 0));
	cJSON_AddTrueToObject(r, "ok");
	return r;
}

/* Build {"id":<id>,"ok":false,"code":<code>}. id may be NULL. Caller cJSON_Deletes. */
cJSON *daemon_make_error(cJSON *id, int code) {
	cJSON *r = cJSON_CreateObject();
	if (id) cJSON_AddItemToObject(r, "id", cJSON_Duplicate(id, 0));
	cJSON_AddFalseToObject(r, "ok");
	cJSON_AddNumberToObject(r, "code", code);
	return r;
}

static void emit(cJSON *resp) {
	char *s = cJSON_PrintUnformatted(resp);
	if (s) { printf("%s\n", s); fflush(stdout); free(s); }
}

/* ── argument helpers ──────────────────────────────────────────────────── */

static const char *arg_s(cJSON *args, int idx) {
	if (!args) return NULL;
	cJSON *item = cJSON_GetArrayItem(args, idx);
	return (item && cJSON_IsString(item)) ? item->valuestring : NULL;
}

static int arg_i(cJSON *args, int idx) {
	const char *s = arg_s(args, idx);
	return s ? atoi(s) : 0;
}

static int arg_count(cJSON *args) {
	return args ? cJSON_GetArraySize(args) : 0;
}

static int parse_location(cJSON *args, int idx) {
	const char *s = arg_s(args, idx);
	return (s && strcmp(s, "va") == 0) ? 1 : 0;
}

/* ── command execution (runs on USB thread via daemon_tick) ────────────── */

static void execute_cmd(const char *line) {
	cJSON *req = daemon_parse_request(line);
	if (!req) {
		printf("{\"ok\":false,\"code\":-1,\"error\":\"invalid json\"}\n");
		fflush(stdout);
		return;
	}

	cJSON *id    = cJSON_GetObjectItem(req, "id");
	cJSON *cmd_j = cJSON_GetObjectItem(req, "cmd");
	cJSON *args  = cJSON_GetObjectItem(req, "args");

	if (!cmd_j || !cJSON_IsString(cmd_j)) {
		cJSON *r = daemon_make_error(id, G2_ERR_INVALID_PARAM);
		cJSON_AddStringToObject(r, "error", "missing cmd");
		emit(r); cJSON_Delete(r); cJSON_Delete(req);
		return;
	}

	const char *cmd = cmd_j->valuestring;
	int n = arg_count(args);
	int ret = G2_ERR_INVALID_PARAM;
	cJSON *data = NULL;

	/* Non-USB commands: handle before disarm/rearm. */
	if (strcmp(cmd, "verbose") == 0 && n >= 1) {
		const char *val = arg_s(args, 0);
		if (strcmp(val, "on") == 0)       g2_watch_verbose = 1;
		else if (strcmp(val, "off") == 0) g2_watch_verbose = 0;
		else {
			cJSON *r = daemon_make_error(id, G2_ERR_INVALID_PARAM);
			emit(r); cJSON_Delete(r); cJSON_Delete(req);
			return;
		}
		cJSON *r = daemon_make_ok(id);
		emit(r); cJSON_Delete(r); cJSON_Delete(req);
		return;
	}

	/* Stop streaming so the G2 accepts normal commands, then re-arm after. */
	g2_watch_disarm();

	if (strcmp(cmd, "slot") == 0 && n >= 1) {
		ret = g2_select_slot(arg_s(args, 0));

	} else if (strcmp(cmd, "variation") == 0 && n >= 2) {
		ret = g2_select_variation(arg_i(args, 0), arg_i(args, 1));

	} else if (strcmp(cmd, "add-cable") == 0 && n >= 9) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		ret = g2_add_cable(slot, loc,
		                   arg_i(args, 2),
		                   arg_i(args, 3), arg_i(args, 4), arg_i(args, 5),
		                   arg_i(args, 6), arg_i(args, 7), arg_i(args, 8));

	} else if (strcmp(cmd, "del-cable") == 0 && n >= 8) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		ret = g2_del_cable(slot, loc,
		                   arg_i(args, 2), arg_i(args, 3), arg_i(args, 4),
		                   arg_i(args, 5), arg_i(args, 6), arg_i(args, 7));

	} else if (strcmp(cmd, "del-module") == 0 && n >= 3) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		ret = g2_del_module(slot, loc, arg_i(args, 2));

	} else if (strcmp(cmd, "move-module") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		ret = g2_move_module(slot, loc, arg_i(args, 2), arg_i(args, 3), arg_i(args, 4));

	} else if (strcmp(cmd, "add-module") == 0 && n >= 8) {
		int slot      = parse_slot(arg_s(args, 0));
		int loc       = parse_location(args, 1);
		int type_id   = arg_i(args, 2);
		int module_id = arg_i(args, 3);
		int col       = arg_i(args, 4);
		int row       = arg_i(args, 5);
		int color     = arg_i(args, 6);
		int j = 7;
		int num_modes = arg_i(args, j++);
		int mode_vals[64] = {0};
		for (int m = 0; m < num_modes && m < 64; m++) mode_vals[m] = arg_i(args, j++);
		int num_params = arg_i(args, j++);
		int param_vals[256] = {0};
		for (int p = 0; p < num_params && p < 256; p++) param_vals[p] = arg_i(args, j++);
		const char *name = arg_s(args, j);
		ret = g2_add_module(slot, loc, type_id, module_id, col, row, color,
		                    num_modes, mode_vals, num_params, param_vals,
		                    name ? name : "Module");

	} else if (strcmp(cmd, "set-module-color") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		ret = g2_set_module_color(slot, loc, arg_i(args, 2), arg_i(args, 3));

	} else if (strcmp(cmd, "set-module-name") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		ret = g2_set_module_label(slot, loc, arg_i(args, 2), arg_s(args, 3));

	} else if (strcmp(cmd, "set-param") == 0 && n >= 6) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		ret = g2_set_param(slot, loc, arg_i(args, 2), arg_i(args, 3),
		                   arg_i(args, 4), arg_i(args, 5));

	} else if (strcmp(cmd, "select-patch") == 0 && n >= 3) {
		int slot = parse_slot(arg_s(args, 0));
		ret = g2_select_patch(slot, arg_i(args, 1), arg_i(args, 2));

	} else if (strcmp(cmd, "upload-patch") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		ret = g2_upload_patch(slot, arg_s(args, 1));

	} else if (strcmp(cmd, "get-patch") == 0 && n >= 1) {
		data = g2_get_patch(arg_s(args, 0));
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "device") == 0) {
		data = g2_device_info(0);
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "startup") == 0) {
		data = g2_startup();
		ret = data ? G2_OK : G2_ERR;
	}

	g2_watch_rearm();

	if (ret == G2_ERR_SEND || ret == G2_ERR_CONNECT) {
		printf("{\"type\":\"device_disconnected\"}\n");
		fflush(stdout);
	}

	cJSON *resp;
	if (ret == G2_OK) {
		resp = daemon_make_ok(id);
		if (data) cJSON_AddItemToObject(resp, "data", data);
	} else {
		resp = daemon_make_error(id, ret);
		cJSON_Delete(data);
	}
	emit(resp);
	cJSON_Delete(resp);
	cJSON_Delete(req);
}

/* ── tick hook — called by g2_watch on each loop iteration ────────────── */

static void daemon_tick(void) {
	char *line = daemon_dequeue();
	if (!line) return;
	execute_cmd(line);
	free(line);
}

/* ── stdin reader thread ───────────────────────────────────────────────── */

static void *stdin_reader(void *arg) {
	(void)arg;
	char line[4096];
	while (fgets(line, sizeof(line), stdin))
		daemon_enqueue(line);
	g2_watch_running = 0;
	return NULL;
}

/* ── entry point ───────────────────────────────────────────────────────── */

int g2_daemon_run(output_format_t format) {
	pthread_t tid;
	pthread_create(&tid, NULL, stdin_reader, NULL);
	g2_watch_tick_hook = daemon_tick;
	int ret = g2_watch(format, 0);
	g2_watch_tick_hook = NULL;
	pthread_detach(tid);
	return ret;
}
