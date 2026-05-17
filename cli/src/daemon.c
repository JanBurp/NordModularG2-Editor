/*
 * G2 CLI - Daemon subcommand
 *
 * Listener thread (g2_io.c) is the sole reader of EP 0x81/0x82 and pushes all
 * messages to a queue.  Main thread dequeues commands from stdin and events from
 * the listener, routing them appropriately.  Device functions call recv_interrupt()
 * which transparently pulls from the same queue, so no STOP/START per command.
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
#include <signal.h>
#include <unistd.h>
#include <pthread.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "g2_events.h"
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

static void daemon_error_cb(const char *msg, void *ctx) {
	(void)ctx;
	printf("{\"type\":\"error\",\"error\":\"%s\"}\n", msg);
	fflush(stdout);
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

static cJSON *g_startup_cache = NULL;

/* ── command execution ─────────────────────────────────────────────────── */

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

	if (strcmp(cmd, "slot") == 0 && n >= 1) {
		ret = g2_select_slot(arg_s(args, 0));

	} else if (strcmp(cmd, "variation") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 1));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_select_variation(arg_i(args, 0), slot);

	} else if (strcmp(cmd, "add-cable") == 0 && n >= 9) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_add_cable(slot, loc,
		                   arg_i(args, 2),
		                   arg_i(args, 3), arg_i(args, 4), arg_i(args, 5),
		                   arg_i(args, 6), arg_i(args, 7), arg_i(args, 8));

	} else if (strcmp(cmd, "del-cable") == 0 && n >= 8) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_del_cable(slot, loc,
		                   arg_i(args, 2), arg_i(args, 3), arg_i(args, 4),
		                   arg_i(args, 5), arg_i(args, 6), arg_i(args, 7));

	} else if (strcmp(cmd, "set-cable-color") == 0 && n >= 9) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_cable_color(slot, loc,
		                         arg_i(args, 2),
		                         arg_i(args, 3), arg_i(args, 4), arg_i(args, 5),
		                         arg_i(args, 6), arg_i(args, 7), arg_i(args, 8));

	} else if (strcmp(cmd, "del-module") == 0 && n >= 3) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_del_module(slot, loc, arg_i(args, 2));

	} else if (strcmp(cmd, "move-module") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_move_module(slot, loc, arg_i(args, 2), arg_i(args, 3), arg_i(args, 4));

	} else if (strcmp(cmd, "add-module") == 0 && n >= 8) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) {
			ret = G2_ERR_INVALID_PARAM;
		} else {
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
		}

	} else if (strcmp(cmd, "set-module-mode") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_module_mode(slot, loc, arg_i(args, 2), arg_i(args, 3), arg_i(args, 4));

	} else if (strcmp(cmd, "set-module-color") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_module_color(slot, loc, arg_i(args, 2), arg_i(args, 3));

	} else if (strcmp(cmd, "set-module-name") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_module_label(slot, loc, arg_i(args, 2), arg_s(args, 3));

	} else if (strcmp(cmd, "set-param-label") == 0 && n >= 6) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_param_label(slot, loc, arg_i(args, 2), arg_i(args, 3), arg_i(args, 4), arg_s(args, 5));

	} else if (strcmp(cmd, "set-param") == 0 && n >= 6) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_param(slot, loc, arg_i(args, 2), arg_i(args, 3),
		                   arg_i(args, 4), arg_i(args, 5));

	} else if (strcmp(cmd, "select-patch") == 0 && n >= 3) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_select_patch(slot, arg_i(args, 1), arg_i(args, 2));

	} else if (strcmp(cmd, "upload-patch") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_upload_patch(slot, arg_s(args, 1));

	} else if (strcmp(cmd, "set-perf-mode") == 0 && n >= 1) {
		const char *m = arg_s(args, 0);
		int mode = (m && strcmp(m, "performance") == 0) ? 1
		         : (m && strcmp(m, "patch") == 0)       ? 0 : -1;
		if (mode < 0) {
			ret = G2_ERR_INVALID_PARAM;
		} else {
			g2_send_init();
			ret = g2_set_perf_mode(mode);
		}

	} else if (strcmp(cmd, "set-perf-name") == 0 && n >= 1) {
		ret = g2_set_perf_name(arg_s(args, 0));

	} else if (strcmp(cmd, "get-patch") == 0 && n >= 1) {
		data = g2_get_patch(arg_s(args, 0));
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "list") == 0) {
		int filter = LIST_FILTER_ALL;
		int bank_filter = 0;
		for (int j = 0; j < n; j++) {
			const char *a = arg_s(args, j);
			if (!a) continue;
			if (strcmp(a, "patches") == 0)            filter = LIST_FILTER_PATCHES;
			else if (strcmp(a, "performances") == 0)  filter = LIST_FILTER_PERFORMANCES;
			else if (strcmp(a, "bank") == 0 && j + 1 < n) bank_filter = arg_i(args, ++j);
		}
		data = g2_list(filter, bank_filter);
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "device") == 0) {
		data = g2_device_info(0);
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "startup") == 0) {
		data = g_startup_cache;
		g_startup_cache = NULL;
		if (!data) data = g2_startup();
		ret = data ? G2_OK : G2_ERR;
	}

	if (ret == G2_ERR_SEND || ret == G2_ERR_RECV || ret == G2_ERR_TIMEOUT ||
	    ret == G2_ERR_CONNECT || ret == G2_ERR_RESET) {
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

/* ── stdin reader thread ───────────────────────────────────────────────── */

static volatile int daemon_running = 1;

static void daemon_stop(int sig) {
	(void)sig;
	daemon_running = 0;
}

static void *stdin_reader(void *arg) {
	(void)arg;
	char line[4096];
	while (fgets(line, sizeof(line), stdin))
		daemon_enqueue(line);
	daemon_running = 0;
	return NULL;
}

/* ── reconnect helper ──────────────────────────────────────────────────── */

static void do_reconnect(void) {
	g2_listener_stop();
	g2_disconnect();
	printf("{\"type\":\"device_disconnected\"}\n");
	fflush(stdout);

	while (daemon_running && g2_connect_silent() < 0)
		usleep(100000);
	if (!daemon_running) return;

	g2_listener_start();
	g2_rearm();
	/* Consume START_COMM ACK from listener queue. */
	g2_msg_t ack;
	if (g2_msg_recv(&ack, USB_TIMEOUT_STANDARD_MS) == 0)
		g2_msg_free(&ack);

	printf("{\"type\":\"device_reconnected\"}\n");
	fflush(stdout);
}

/* ── entry point ───────────────────────────────────────────────────────── */

int g2_daemon_run(output_format_t format) {
	(void)format;
	g2_set_error_callback(daemon_error_cb, NULL);

	signal(SIGINT, daemon_stop);
	signal(SIGTERM, daemon_stop);

	pthread_t reader;
	pthread_create(&reader, NULL, stdin_reader, NULL);

	/* Connect with retry. */
	while (daemon_running && g2_connect_silent() < 0)
		usleep(100000);
	if (!daemon_running) { pthread_detach(reader); return 0; }

	/* Run startup queries before COMM is armed — no unsolicited events yet. */
	g_startup_cache = g2_startup();

	g2_listener_start();
	g2_rearm();   /* sends START_COMM; ACK consumed below */

	/* Wait for START_COMM ACK before declaring the daemon ready. */
	g2_msg_t ack;
	if (g2_msg_recv(&ack, USB_TIMEOUT_STANDARD_MS) == 0)
		g2_msg_free(&ack);

	printf("{\"type\":\"watch_armed\"}\n");
	fflush(stdout);

	while (daemon_running) {
		/* Drain stdin commands first. */
		char *line = daemon_dequeue();
		if (line) {
			execute_cmd(line);
			free(line);
			continue;
		}

		/* Wait for next event from the listener. */
		g2_msg_t msg;
		if (g2_msg_recv(&msg, 100) != 0) continue;

		if (msg.sentinel == 1) {
			/* Device disconnected. */
			g2_msg_free(&msg);
			if (daemon_running) do_reconnect();
		} else if (msg.sentinel == 2) {
			/* BULK_REARM: G2 stopped streaming after full performance switch. */
			g2_msg_free(&msg);
			printf("{\"type\":\"version_update\",\"scope\":\"all_slots\"}\n");
			fflush(stdout);
			g2_rearm();
			/* ACK will arrive via listener and be emitted as {"type":"ok"} next iter. */
		} else {
			g2_emit_event(&msg);
			g2_msg_free(&msg);
		}
	}

	g2_listener_stop();
	pthread_detach(reader);
	return 0;
}
