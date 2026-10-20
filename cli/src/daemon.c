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
#include <time.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "g2_events.h"
#include "utils.h"
#include "cJSON.h"
#include "daemon.h"

/* ── command queue ─────────────────────────────────────────────────────── */

typedef struct cmd_entry {
	char *line;
	struct cmd_entry *next;
} cmd_entry_t;

static pthread_mutex_t q_mutex = PTHREAD_MUTEX_INITIALIZER;
static cmd_entry_t *q_head = NULL;
static cmd_entry_t *q_tail = NULL;

int daemon_enqueue(const char *line) {
	cmd_entry_t *e = malloc(sizeof(*e));
	if (!e) return -1;
	e->line = strdup(line);
	if (!e->line) { free(e); return -1; }
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
	char *line = e->line;  /* transfer ownership to caller */
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

/* Build {"id":<id>,"ok":false,"code":<code>,"error":"<text>"}. id may be NULL.
 * The text is what the editor shows the user; the code stays for callers that
 * branch on it. Caller cJSON_Deletes. */
cJSON *daemon_make_error(cJSON *id, int code) {
	cJSON *r = cJSON_CreateObject();
	if (id) cJSON_AddItemToObject(r, "id", cJSON_Duplicate(id, 0));
	cJSON_AddFalseToObject(r, "ok");
	cJSON_AddNumberToObject(r, "code", code);
	cJSON_AddStringToObject(r, "error", g2_error_string(code));
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

/* Notify the frontend that patch memory changed so it refreshes the list. */
/* Emit a typed event: {"type":<type>,"data":<data>}. Takes ownership of data. */
static void emit_event(const char *type, cJSON *data) {
	cJSON *ev = cJSON_CreateObject();
	cJSON_AddStringToObject(ev, "type", type);
	cJSON_AddItemToObject(ev, "data", data ? data : cJSON_CreateNull());
	emit(ev);
	cJSON_Delete(ev);
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

/* Reads a byte-array arg at `idx` into a malloc'd byte buffer, either as a JSON
 * array of numbers (0-255) or a base64-encoded string (much smaller on the wire -
 * see main.ts's sendCmd). Returns NULL (with *out_len untouched) if the arg is
 * neither. Caller frees. */
static uint8_t *arg_bytes(cJSON *args, int idx, size_t *out_len) {
	if (!args) return NULL;
	cJSON *item = cJSON_GetArrayItem(args, idx);
	if (!item) return NULL;
	if (cJSON_IsString(item)) {
		uint8_t *buf = NULL;
		int len = base64_decode(item->valuestring, &buf);
		if (len < 0) return NULL;
		*out_len = (size_t)len;
		return buf;
	}
	if (cJSON_IsArray(item)) {
		int count = cJSON_GetArraySize(item);
		uint8_t *buf = (uint8_t *)malloc((size_t)count > 0 ? (size_t)count : 1);
		if (!buf) return NULL;
		for (int i = 0; i < count; i++) buf[i] = (uint8_t)cJSON_GetArrayItem(item, i)->valueint;
		*out_len = (size_t)count;
		return buf;
	}
	return NULL;
}

static int parse_location(cJSON *args, int idx) {
	return parse_location_str(arg_s(args, idx));
}

/* ── debug helpers ─────────────────────────────────────────────────────── */

static void debug_status(const char *msg) {
	if (!g2_debug) return;
	printf("{\"debug\":\"status\",\"msg\":\"%s\"}\n", msg);
	fflush(stdout);
}

/* Elapsed milliseconds since an arbitrary monotonic epoch (process start). */
long long now_ms(void) {
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

/* Disconnect diagnostic: command timestamps (ring) so a drop can be correlated
 * with a burst of commands. Logged to stderr only. */
#define DIAG_RING 256
static long long diag_ts[DIAG_RING];
static unsigned  diag_n;
static char      diag_last_cmd[32];

static void diag_record_cmd(const char *cmd) {
	diag_ts[diag_n++ % DIAG_RING] = now_ms();
	snprintf(diag_last_cmd, sizeof(diag_last_cmd), "%s", cmd);
}

static void diag_log_disconnect(const char *why, int ret) {
	long long now = now_ms();
	unsigned in_1s = 0, total = diag_n < DIAG_RING ? diag_n : DIAG_RING;
	for (unsigned i = 0; i < total; i++)
		if (now - diag_ts[i] <= 1000) in_1s++;
	long long since_last = diag_n ? now - diag_ts[(diag_n - 1) % DIAG_RING] : -1;
	fprintf(stderr, "[diag] disconnect (%s, ret=%d): %u cmds in last 1s%s, last cmd '%s' %lld ms ago, msg_drops=%lu\n",
	        why, ret, in_1s, in_1s == DIAG_RING ? "+" : "", diag_last_cmd, since_last, g2_msg_drops);
	g2_trace_dump();
}

void debug_timing(const char *label) {
	if (!g2_debug) return;
	printf("{\"debug\":\"timing\",\"label\":\"%s\",\"ms\":%lld}\n", label, now_ms());
	fflush(stdout);
}

static void rearm_with_version_update(void) {
	printf("{\"type\":\"version_update\",\"scope\":\"all_slots\"}\n");
	fflush(stdout);
	debug_timing("rearm_data_start");
	g2_emit_rearm_data();
	debug_timing("rearm_data_end");
	g2_unlock_stream();
}

/* ── seq: compound-frame batch execution ───────────────────────────────── */

#define SEQ_MAX_OPS   128
#define SEQ_OP_BUFSZ 1024  /* large enough for set-module-labels worst case */

/* Sent one by one after the compound frame: set-param (CMD_NO_RESP) or, with mode set, set-module-mode. */
typedef struct { int mode, loc, mod, param, val, var; } SetParamEntry;

static int execute_seq(cJSON *args) {
    int n_subs = cJSON_GetArraySize(args);
    if (n_subs == 0) return G2_OK;
    int limit = n_subs < SEQ_MAX_OPS ? n_subs : SEQ_MAX_OPS;

    G2Op    *ops  = calloc((size_t)limit, sizeof(G2Op));
    uint8_t *pool = malloc((size_t)limit * SEQ_OP_BUFSZ);
    if (!ops || !pool) { free(ops); free(pool); return G2_ERR_NO_MEMORY; }

    SetParamEntry sp_entries[SEQ_MAX_OPS];
    int n_ops = 0, n_sp = 0, batch_slot = -1, ret = G2_OK;

    for (int si = 0; si < limit && ret == G2_OK; si++) {
        cJSON *sub = cJSON_GetArrayItem(args, si);
        if (!cJSON_IsArray(sub) || cJSON_GetArraySize(sub) < 3) {
            ret = G2_ERR_INVALID_PARAM; break;
        }

        const char *scmd = arg_s(sub, 0);
        int s_slot = parse_slot(arg_s(sub, 1));
        if (s_slot == SLOT_INVALID || !scmd) { ret = G2_ERR_INVALID_PARAM; break; }
        if (batch_slot == -1) batch_slot = s_slot;
        else if (batch_slot != s_slot) { ret = G2_ERR_INVALID_PARAM; break; }

        int s_loc = parse_location_str(arg_s(sub, 2));
        int sn    = cJSON_GetArraySize(sub);

        G2Op    *op = &ops[n_ops];
        uint8_t *p  = pool + n_ops * SEQ_OP_BUFSZ;

        if (strcmp(scmd, "del-cable") == 0 && sn >= 9) {
            g2_build_del_cable_op(op, p, s_loc,
                arg_i(sub,3), arg_i(sub,4), arg_i(sub,5),
                arg_i(sub,6), arg_i(sub,7), arg_i(sub,8));
            n_ops++;

        } else if (strcmp(scmd, "add-cable") == 0 && sn >= 10) {
            g2_build_add_cable_op(op, p, s_loc, arg_i(sub,3),
                arg_i(sub,4), arg_i(sub,5), arg_i(sub,6),
                arg_i(sub,7), arg_i(sub,8), arg_i(sub,9));
            n_ops++;

        } else if (strcmp(scmd, "set-cable-color") == 0 && sn >= 10) {
            g2_build_set_cable_color_op(op, p, s_loc, arg_i(sub,3),
                arg_i(sub,4), arg_i(sub,5), arg_i(sub,6),
                arg_i(sub,7), arg_i(sub,8), arg_i(sub,9));
            n_ops++;

        } else if (strcmp(scmd, "del-module") == 0 && sn >= 4) {
            g2_build_del_module_op(op, p, s_loc, arg_i(sub, 3));
            n_ops++;

        } else if (strcmp(scmd, "move-module") == 0 && sn >= 6) {
            g2_build_move_module_op(op, p, s_loc,
                arg_i(sub,3), arg_i(sub,4), arg_i(sub,5));
            n_ops++;

        } else if (strcmp(scmd, "add-module") == 0 && sn >= 9) {
            int j = 8, num_modes = arg_i(sub, j++);
            if (num_modes < 0 || num_modes > 16) { ret = G2_ERR_INVALID_PARAM; break; }
            int mode_vals[64] = {0};
            for (int m = 0; m < num_modes && m < 64; m++) mode_vals[m] = arg_i(sub, j++);
            int num_params = arg_i(sub, j++);
            j += num_params;  /* skip param_vals — G2 initialises to defaults */
            int muta_lock = (j + 1 < sn) ? arg_i(sub, j + 1) : 0;
            if (g2_build_add_module_op(op, p, s_loc,
                    arg_i(sub,3), arg_i(sub,4), arg_i(sub,5), arg_i(sub,6), arg_i(sub,7), muta_lock,
                    num_modes, mode_vals, arg_s(sub, j)) < 0) { ret = G2_ERR_INVALID_PARAM; break; }
            n_ops++;

        } else if (strcmp(scmd, "set-module-color") == 0 && sn >= 5) {
            g2_build_set_module_color_op(op, p, s_loc, arg_i(sub,3), arg_i(sub,4));
            n_ops++;

        } else if (strcmp(scmd, "set-mutation-lock") == 0 && sn >= 5) {
            g2_build_set_mutation_lock_op(op, p, s_loc, arg_i(sub,3), arg_i(sub,4));
        } else if (strcmp(scmd, "set-module-uprate") == 0 && sn >= 5) {
            g2_build_set_module_uprate_op(op, p, s_loc, arg_i(sub,3), arg_i(sub,4));
            n_ops++;

        } else if (strcmp(scmd, "set-module-name") == 0 && sn >= 5) {
            g2_build_set_module_label_op(op, p, s_loc, arg_i(sub,3), arg_s(sub,4));
            n_ops++;

        } else if (strcmp(scmd, "set-module-labels") == 0 && sn >= 6) {
            const char *tok[SEQ_OP_BUFSZ];
            int ntok = sn - 4 < SEQ_OP_BUFSZ ? sn - 4 : SEQ_OP_BUFSZ;
            for (int ti = 0; ti < ntok; ti++) tok[ti] = arg_s(sub, 4 + ti);
            ret = g2_build_set_module_labels_op(op, p, s_loc, arg_i(sub, 3), ntok, tok);
            if (ret == G2_OK) n_ops++;

        } else if (strcmp(scmd, "assign-knob") == 0 && sn >= 6) {
            if (s_loc < 0 || s_loc > 1 || arg_i(sub,5) < 0 || arg_i(sub,5) > 119 || (sn >= 7 && (arg_i(sub,6) < 0 || arg_i(sub,6) > 1))) { ret = G2_ERR_INVALID_PARAM; break; }
            g2_build_assign_knob_op(op, p, s_loc, arg_i(sub,3), arg_i(sub,4), arg_i(sub,5), sn >= 7 ? arg_i(sub,6) : 0);
            n_ops++;

        } else if (strcmp(scmd, "deassign-knob") == 0 && sn >= 3) {
            /* [cmd, slot, knob] — no location arg, so sub[2] is the knob index */
            if (arg_i(sub,2) < 0 || arg_i(sub,2) > 119) { ret = G2_ERR_INVALID_PARAM; break; }
            g2_build_deassign_knob_op(op, p, arg_i(sub,2));
            n_ops++;

        } else if (strcmp(scmd, "assign-global-knob") == 0 && sn >= 7) {
            /* [cmd, transportSlot, targetSlot, loc, mod, param, knob] — sub[2] is the target slot, not a location */
            int target = parse_slot(arg_s(sub, 2)), gloc = parse_location_str(arg_s(sub, 3));
            if (target == SLOT_INVALID || gloc < 0 || gloc > 1 || arg_i(sub,6) < 0 || arg_i(sub,6) > 119) { ret = G2_ERR_INVALID_PARAM; break; }
            g2_build_assign_global_knob_op(op, p, target, gloc, arg_i(sub,4), arg_i(sub,5), arg_i(sub,6));
            n_ops++;

        } else if (strcmp(scmd, "deassign-global-knob") == 0 && sn >= 3) {
            if (arg_i(sub,2) < 0 || arg_i(sub,2) > 119) { ret = G2_ERR_INVALID_PARAM; break; }
            g2_build_deassign_global_knob_op(op, p, arg_i(sub,2));
            n_ops++;

        } else if (strcmp(scmd, "set-param") == 0 && sn >= 7) {
            /* CMD_NO_RESP — cannot go in the compound frame; queued for after */
            if (n_sp < SEQ_MAX_OPS)
                sp_entries[n_sp++] = (SetParamEntry){ 0, s_loc, arg_i(sub,3), arg_i(sub,4), arg_i(sub,5), arg_i(sub,6) };

        } else if (strcmp(scmd, "set-module-mode") == 0 && sn >= 6) {
            /* queued with the set-params so the paste order holds; not tried inside a compound frame */
            if (n_sp < SEQ_MAX_OPS)
                sp_entries[n_sp++] = (SetParamEntry){ 1, s_loc, arg_i(sub,3), arg_i(sub,4), arg_i(sub,5), 0 };

        } else {
            ret = G2_ERR_INVALID_PARAM;
        }
    }

    if (ret == G2_OK && n_ops > 0)
        ret = g2_batch_ops(batch_slot, ops, n_ops);

    for (int i = 0; i < n_sp && ret == G2_OK; i++) {
        SetParamEntry *e = &sp_entries[i];
        ret = e->mode ? g2_set_module_mode(batch_slot, e->loc, e->mod, e->param, e->val)
                      : g2_set_param(batch_slot, e->loc, e->mod, e->param, e->val, e->var);
    }

    free(ops);
    free(pool);
    return ret;
}

/* ── command execution ─────────────────────────────────────────────────── */

/* Set by select-patch to trigger a rearm after the immediately-following
 * get-patch completes.  select-patch silently stops G2 streaming (no
 * sentinel-2/BULK_REARM is emitted), so we must rearm manually.  We defer
 * the rearm until after get-patch because g2_rearm() puts a START_COMM ack
 * in the listener queue that would otherwise pollute g2_get_patch's
 * recv_interrupt calls. */
static int rearm_after_get_patch = 0;

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
	diag_record_cmd(cmd_j->valuestring);

	const char *cmd = cmd_j->valuestring;
	int n = arg_count(args);
	int ret = G2_ERR_INVALID_PARAM;
	cJSON *data = NULL;

	if (strcmp(cmd, "verbose") == 0 && n >= 1) {
		const char *val = arg_s(args, 0);
		if (val && strcmp(val, "on") == 0)       g2_watch_verbose = 1;
		else if (val && strcmp(val, "off") == 0) g2_watch_verbose = 0;
		else {
			cJSON *r = daemon_make_error(id, G2_ERR_INVALID_PARAM);
			emit(r); cJSON_Delete(r); cJSON_Delete(req);
			return;
		}
		cJSON *r = daemon_make_ok(id);
		emit(r); cJSON_Delete(r); cJSON_Delete(req);
		return;
	}

	if (strcmp(cmd, "debug") == 0 && n >= 1) {
		const char *val = arg_s(args, 0);
		if (val && strcmp(val, "on") == 0)       g2_debug = 1;
		else if (val && strcmp(val, "off") == 0) g2_debug = 0;
		else {
			cJSON *r = daemon_make_error(id, G2_ERR_INVALID_PARAM);
			emit(r); cJSON_Delete(r); cJSON_Delete(req);
			return;
		}
		cJSON *r = daemon_make_ok(id);
		cJSON_AddBoolToObject(r, "debugOn", g2_debug);
		emit(r); cJSON_Delete(r); cJSON_Delete(req);
		return;
	}

	if (strcmp(cmd, "slot") == 0 && n >= 1) {
		ret = g2_switch_slot(arg_s(args, 0));
		/* Inactive target: sends SET_PERF_SETTINGS then SELECT_SLOT (0x09).
		 * Active target: sends SELECT_SLOT only. G2 emits perf_settings_update
		 * and/or slot_change; listener queues them and watch loop emits them. */

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
		int muta_lock = (j + 1 < n) ? arg_i(args, j + 1) : 0;
		if ((num_modes < 0 || num_modes > 16) || (name && strlen(name) > 16)) {
			ret = G2_ERR_INVALID_PARAM;
		} else {
			ret = g2_add_module(slot, loc, type_id, module_id, col, row, color, muta_lock,
			                    num_modes, mode_vals, num_params, param_vals,
			                    name ? name : "Module");
		}
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

	} else if (strcmp(cmd, "set-mutation-lock") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_mutation_lock(slot, loc, arg_i(args, 2), arg_i(args, 3));
	} else if (strcmp(cmd, "set-module-uprate") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_module_uprate(slot, loc, arg_i(args, 2), arg_i(args, 3));

	} else if (strcmp(cmd, "set-module-name") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_module_label(slot, loc, arg_i(args, 2), arg_s(args, 3));

	} else if (strcmp(cmd, "set-module-labels") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else {
			const char *tok[G2_MODULE_LABELS_BUFSZ];
			int ntok = n - 3 < G2_MODULE_LABELS_BUFSZ ? n - 3 : G2_MODULE_LABELS_BUFSZ;
			for (int ti = 0; ti < ntok; ti++) tok[ti] = arg_s(args, 3 + ti);
			ret = g2_set_module_labels(slot, loc, arg_i(args, 2), ntok, tok);
		}

	} else if (strcmp(cmd, "set-param") == 0 && n >= 6) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_param(slot, loc, arg_i(args, 2), arg_i(args, 3),
		                   arg_i(args, 4), arg_i(args, 5));

	} else if (strcmp(cmd, "select-param") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_select_param(slot, loc, arg_i(args, 2), arg_i(args, 3));

	} else if (strcmp(cmd, "select-param-page") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_select_param_page(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "get-param-page") == 0 && n >= 1) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_request_param_page(slot);

	} else if (strcmp(cmd, "get-global-page") == 0 && n >= 1) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_request_global_page(slot);

	} else if (strcmp(cmd, "assign-midicc") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_assign_midicc(slot, loc, arg_i(args, 2), arg_i(args, 3), arg_i(args, 4));

	} else if (strcmp(cmd, "deassign-midicc") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_deassign_midicc(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "assign-knob") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_assign_knob(slot, loc, arg_i(args, 2), arg_i(args, 3), arg_i(args, 4), n >= 6 ? arg_i(args, 5) : 0);

	} else if (strcmp(cmd, "deassign-knob") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_deassign_knob(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "select-global-page") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_select_global_page(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "assign-global-knob") == 0 && n >= 6) {
		int slot = parse_slot(arg_s(args, 0));
		int targetSlot = parse_slot(arg_s(args, 1));
		int loc = parse_location(args, 2);
		if (slot == SLOT_INVALID || targetSlot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_assign_global_knob(slot, targetSlot, loc, arg_i(args, 3), arg_i(args, 4), arg_i(args, 5));

	} else if (strcmp(cmd, "deassign-global-knob") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_deassign_global_knob(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "get-global-knobs") == 0) {
		data = g2_get_global_knobs();
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "assign-midicc-batch") == 0 && n >= 5 && (n - 1) % 4 == 0) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) { ret = G2_ERR_INVALID_PARAM; } else {
			int count = (n - 1) / 4;
			G2MidiCCEntry *entries = malloc((size_t)count * sizeof(G2MidiCCEntry));
			if (!entries) { ret = G2_ERR_NO_MEMORY; } else {
				for (int j = 0; j < count; j++) {
					int base = 1 + j * 4;
					entries[j].location  = parse_location(args, base);
					entries[j].module_id = arg_i(args, base + 1);
					entries[j].param_idx = arg_i(args, base + 2);
					entries[j].cc_num    = arg_i(args, base + 3);
				}
				ret = g2_assign_midicc_batch(slot, entries, count);
				free(entries);
			}
		}

	} else if (strcmp(cmd, "deassign-midicc-batch") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) { ret = G2_ERR_INVALID_PARAM; } else {
			int count = n - 1;
			int *cc_nums = malloc((size_t)count * sizeof(int));
			if (!cc_nums) { ret = G2_ERR_NO_MEMORY; } else {
				for (int j = 0; j < count; j++) cc_nums[j] = arg_i(args, 1 + j);
				ret = g2_deassign_midicc_batch(slot, cc_nums, count);
				free(cc_nums);
			}
		}

	} else if (strcmp(cmd, "set-morph-range") == 0 && n >= 7) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		int range = arg_i(args, 4);
		int group = arg_i(args, 5);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_morph_range(slot, loc, arg_i(args, 2), arg_i(args, 3),
		                          group, range, arg_i(args, 6));

	} else if (strcmp(cmd, "set-morph-range-batch") == 0 && n >= 7 && (n - 1) % 6 == 0) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) { ret = G2_ERR_INVALID_PARAM; } else {
			int count = (n - 1) / 6;
			G2MorphEntry *entries = malloc((size_t)count * sizeof(G2MorphEntry));
			if (!entries) { ret = G2_ERR_NO_MEMORY; } else {
				for (int j = 0; j < count; j++) {
					int base = 1 + j * 6;
					entries[j].location    = parse_location(args, base);
					entries[j].module_id   = arg_i(args, base + 1);
					entries[j].param_idx   = arg_i(args, base + 2);
					entries[j].range       = arg_i(args, base + 3);
					entries[j].morph_group = arg_i(args, base + 4);
					entries[j].variation   = arg_i(args, base + 5);
				}
				ret = g2_set_morph_range_batch(slot, entries, count);
				free(entries);
			}
		}

	} else if (strcmp(cmd, "copy-variation") == 0 && n >= 3) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_copy_variation(slot, arg_i(args, 1), arg_i(args, 2));

	} else if (strcmp(cmd, "select-patch") == 0 && n >= 3) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_select_patch(slot, arg_i(args, 1), arg_i(args, 2));
		/* select-patch silently stops G2 streaming (no BULK_REARM is emitted).
		 * Set the flag so the next get-patch triggers a rearm after it returns. */
		if (ret == G2_OK) rearm_after_get_patch = 1;

	} else if (strcmp(cmd, "select-perf") == 0 && n >= 2) {
		debug_timing("select_perf_start");
		ret = g2_select_perf(arg_i(args, 0), arg_i(args, 1));
		debug_timing("select_perf_returned");
		if (ret == G2_OK) {
			/* The G2 stops streaming while loading the performance.
			 * Drain the listener queue until BULK_REARM so the G2 is fully
			 * ready before we respond ok to the frontend. */
			int deadline_ms = 3000;
			while (deadline_ms > 0) {
				g2_msg_t msg;
				if (g2_msg_recv(&msg, 50) == 0) {
					int rearm = (msg.sentinel == 2);
					int disc  = (msg.sentinel == 1);
					g2_emit_event(&msg);
					g2_msg_free(&msg);
					if (rearm) {
						debug_timing("select_perf_bulk_rearm_detected");
						g2_pending_rearm = 0;
						g2_stream_locked = 1;   /* G2 stopped itself; we never called g2_lock_stream() */
						rearm_with_version_update();
						debug_timing("select_perf_rearm_done");
						break;
					}
					if (disc) { ret = G2_ERR_CONNECT; break; }
					/* Some replies (e.g. a version-bump while G2 is still streaming, see
					 * g2_events.c's aCmd=0x0C/0x1F case) signal readiness via g2_pending_rearm
					 * instead of a literal BULK_REARM sentinel in the queue. Without this check
					 * the loop would otherwise burn its full deadline waiting for a sentinel
					 * that never arrives. */
					if (g2_pending_rearm) {
						debug_timing("select_perf_pending_rearm_detected");
						g2_pending_rearm = 0;
						g2_stream_locked = 1;   /* defensive: idempotent even if already set */
						rearm_with_version_update();
						debug_timing("select_perf_rearm_done");
						break;
					}
				}
				deadline_ms -= 50;
			}
		}

	} else if (strcmp(cmd, "store-patch") == 0 && n >= 3) {
		ret = g2_store_patch(arg_i(args, 0), arg_i(args, 1), arg_i(args, 2));

	} else if (strcmp(cmd, "clear-patch") == 0 && n >= 3) {
		const char *kind = arg_s(args, 0);
		int type = (kind && strcmp(kind, "performance") == 0) ? 1 : 0;
		ret = g2_clear_patch(type, arg_i(args, 1), arg_i(args, 2));

	} else if (strcmp(cmd, "clear-bank") == 0 && n >= 2) {
		const char *kind = arg_s(args, 0);
		int type = (kind && strcmp(kind, "performance") == 0) ? 1 : 0;
		ret = g2_clear_bank(type, arg_i(args, 1), 1, 128);

	} else if (strcmp(cmd, "reload-names") == 0) {
		/* g2_list needs a quiet wire: with the stream running, live LED/VU pushes interleave
		 * with the list replies and the bank loop stalls (seen when this ran right after
		 * watch_armed). Same stop / restart / consume-ACK dance as the reconnect path. */
		g2_listener_stop();
		g2_lock_stream();
		emit_event("names", g2_list(LIST_FILTER_ALL, 0));
		g2_listener_start();
		g2_unlock_stream();
		{
			g2_msg_t ack;
			if (g2_msg_recv(&ack, USB_TIMEOUT_STANDARD_MS) == 0) g2_msg_free(&ack);
		}
		ret = G2_OK;

	} else if (strcmp(cmd, "upload-patch") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_upload_patch(slot, arg_s(args, 1));

	} else if (strcmp(cmd, "send-sections") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		size_t buf_len = 0;
		uint8_t *buf = arg_bytes(args, 1, &buf_len);
		if (slot == SLOT_INVALID || !buf) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_send_sections(slot, buf, buf_len);
		free(buf);

	} else if (strcmp(cmd, "upload-patch-data") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		size_t buf_len = 0;
		uint8_t *buf = arg_bytes(args, 1, &buf_len);
		if (slot == SLOT_INVALID || !buf) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_upload_patch_buf(slot, buf, buf_len);
		free(buf);

	} else if (strcmp(cmd, "upload-perf") == 0 && n >= 1) {
		ret = g2_upload_perf(arg_s(args, 0));
		if (ret == G2_OK) rearm_after_get_patch = 1;

	} else if (strcmp(cmd, "upload-perf-data") == 0 && n >= 1) {
		size_t buf_len = 0;
		uint8_t *buf = arg_bytes(args, 0, &buf_len);
		if (!buf) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_upload_perf_buf(buf, buf_len);
		free(buf);
		/* A performance upload stops G2 streaming the same way select-patch does, and emits no
		 * BULK_REARM either — without this the watch stays dead after Performance → Download
		 * until the user happens to edit something. Deferred to the following get-patch for the
		 * same reason as select-patch: an immediate g2_rearm() would leave a START_COMM ack in
		 * the listener queue for g2_get_patch's recv_interrupt to trip over. */
		if (ret == G2_OK) rearm_after_get_patch = 1;

	} else if (strcmp(cmd, "get-perf-file") == 0) {
		data = g2_get_perf_file(n >= 1 ? arg_s(args, 0) : NULL, 0);
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "get-perf-file-buf") == 0) {
		/* Same capture as get-perf-file, but returns the assembled .prf2 bytes as a
		 * hex "data" string instead of writing to disk - lets the renderer convert
		 * and save in one shot rather than reading its own just-written file back. */
		data = g2_get_perf_file(NULL, 1);
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "set-synth-settings") == 0 && n >= 1) {
		cJSON *params = cJSON_Parse(arg_s(args, 0));
		if (!params) { ret = G2_ERR_INVALID_PARAM; }
		else {
			ret = g2_set_synth_settings(params);
			cJSON_Delete(params);
		}

	} else if (strcmp(cmd, "set-perf-mode") == 0 && n >= 1) {
		const char *m = arg_s(args, 0);
		int mode = (m && strcmp(m, "performance") == 0) ? 1
		         : (m && strcmp(m, "patch") == 0)       ? 0 : -1;
		if (mode < 0) {
			ret = G2_ERR_INVALID_PARAM;
		} else {
			ret = g2_set_perf_mode(mode, n >= 2 && strcmp(arg_s(args, 1), "shift") == 0);
		}

	} else if (strcmp(cmd, "set-perf-name") == 0 && n >= 1) {
		ret = g2_set_perf_name(arg_s(args, 0));

	} else if (strcmp(cmd, "set-patch-name") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_patch_name(slot, arg_s(args, 1));

	} else if (strcmp(cmd, "set-master-clock-run") == 0 && n >= 1) {
		ret = g2_set_master_clock_run(arg_i(args, 0));

	} else if (strcmp(cmd, "set-master-clock-bpm") == 0 && n >= 1) {
		ret = g2_set_master_clock_bpm(arg_i(args, 0));

	} else if (strcmp(cmd, "set-knob-source") == 0 && n >= 1) {
		ret = g2_set_knob_source(arg_i(args, 0));

	} else if (strcmp(cmd, "play-note") == 0 && n >= 2) {
		ret = g2_play_note(arg_i(args, 0), arg_i(args, 1));

	} else if (strcmp(cmd, "set-patch-description") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) { ret = G2_ERR_INVALID_PARAM; }
		else {
			uint8_t *descdata;
			int nbytes = hex_to_bytes(arg_s(args, 1), &descdata);
			if (nbytes >= 0) {
				ret = g2_set_patch_description(slot, descdata, nbytes);
				free(descdata);
			} else {
				ret = G2_ERR_NO_MEMORY;
			}
		}

	} else if (strcmp(cmd, "get-patch") == 0 && n >= 1) {
		data = g2_get_patch(arg_s(args, 0));
		ret = data ? G2_OK : G2_ERR;
		if (rearm_after_get_patch) {
			rearm_after_get_patch = 0;
			/* The device already stopped itself (no g2_stop_comm() of ours sent);
			 * just record that fact so g2_unlock_stream() (via g2_pending_rearm
			 * below) knows a rearm is actually owed. */
			g2_stream_locked = 1;
			g2_pending_rearm = 1;
		}

	} else if (strcmp(cmd, "get-resources") == 0 && n >= 1) {
		data = g2_get_resources(arg_s(args, 0));
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "voice-mode") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) { ret = G2_ERR_INVALID_PARAM; }
		else { ret = g2_set_voice_mode(slot, arg_i(args, 1)); }

	} else if (strcmp(cmd, "voice-count") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) { ret = G2_ERR_INVALID_PARAM; }
		else { ret = g2_set_voice_count(slot, arg_i(args, 1)); }

	} else if (strcmp(cmd, "get-perf-settings") == 0) {
		data = g2_get_perf_settings();
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "set-slot-enabled") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_slot_enabled(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "set-slot-key") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_slot_key(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "set-slot-hold") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_slot_hold(slot, arg_i(args, 1));

	} else if (strcmp(cmd, "set-slot-range") == 0 && n >= 3) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_slot_range(slot, arg_i(args, 1), arg_i(args, 2));

	} else if (strcmp(cmd, "set-range-enable") == 0 && n >= 1) {
		ret = g2_set_rangeEnable(arg_i(args, 0));

	} else if (strcmp(cmd, "seq") == 0) {
		ret = execute_seq(args);

	} else if (strcmp(cmd, "send-controller-snapshot") == 0) {
		ret = g2_send_controller_snapshot();

	} else if (strcmp(cmd, "dump-patch") == 0 && n >= 1) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_dump_patch(slot);

	} else if (strcmp(cmd, "get-bank") == 0 && n >= 3) {
		const char *type_str = arg_s(args, 0);
		int type = (type_str && strcmp(type_str, "performance") == 0) ? 1 : 0;
		int bank = arg_i(args, 1);
		const char *folder = arg_s(args, 2);
		const char *name = (n >= 4) ? arg_s(args, 3) : NULL;
		data = g2_get_bank(type, bank, folder, name);
		ret = data ? G2_OK : G2_ERR;

	} else if (strcmp(cmd, "send-bank") == 0 && n >= 4) {
		const char *type_str = arg_s(args, 0);
		const char *source_type = arg_s(args, 1);
		const char *source_path = arg_s(args, 2);
		int bank = arg_i(args, 3);
		data = g2_send_bank(type_str, source_type, source_path, bank);
		ret = data ? G2_OK : G2_ERR;

	}

	if (ret == G2_ERR_SEND || ret == G2_ERR_RECV || ret == G2_ERR_TIMEOUT ||
	    ret == G2_ERR_CONNECT || ret == G2_ERR_RESET) {
		diag_log_disconnect("command error", ret);
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

#ifdef __MINGW32__
/* MinGW-w64's <stdio.h> does not declare POSIX getline(); provide a minimal replacement. */
static long g2_getline(char **lineptr, size_t *n, FILE *stream) {
	if (*lineptr == NULL || *n == 0) {
		*n = 128;
		*lineptr = malloc(*n);
		if (*lineptr == NULL)
			return -1;
	}
	size_t len = 0;
	int c;
	while ((c = fgetc(stream)) != EOF) {
		if (len + 1 >= *n) {
			size_t new_cap = *n * 2;
			char *new_ptr = realloc(*lineptr, new_cap);
			if (new_ptr == NULL)
				return -1;
			*lineptr = new_ptr;
			*n = new_cap;
		}
		(*lineptr)[len++] = (char)c;
		if (c == '\n')
			break;
	}
	if (len == 0 && c == EOF)
		return -1;
	(*lineptr)[len] = '\0';
	return (long)len;
}
#define getline g2_getline
#endif

static volatile sig_atomic_t daemon_running = 1;

static void daemon_stop(int sig) {
	(void)sig;
	daemon_running = 0;
}

static void *stdin_reader(void *arg) {
	(void)arg;
	char *line = NULL;
	size_t cap = 0;
	while (getline(&line, &cap, stdin) != -1)
		daemon_enqueue(line);
	free(line);
	daemon_running = 0;
	return NULL;
}

/* ── reconnect helper ──────────────────────────────────────────────────── */

/* Throttled diagnostic for a connect-retry loop stuck on G2_ERR_TARGET_NOT_FOUND
 * (a specific bus/device target was set but not found — see g2_io.c). Without
 * this, that state is silent: the loop just spins on usleep(100000), which
 * looks identical to "still booting" from the Electron side. *iterations is
 * the caller's own loop counter, reused here purely to throttle. */
#define TARGET_WAIT_LOG_EVERY 20  /* ~2s at the loops' 100ms usleep cadence */

static void report_target_wait(int *iterations) {
	if ((*iterations)++ % TARGET_WAIT_LOG_EVERY != 0) return;
	cJSON *ev = cJSON_CreateObject();
	cJSON_AddStringToObject(ev, "type", "target_wait");
	cJSON_AddNumberToObject(ev, "bus", g2_target_bus);
	cJSON_AddNumberToObject(ev, "device", g2_target_device);
	cJSON_AddBoolToObject(ev, "seen_last_attempt", g2_target_last_seen);
	emit(ev);
	cJSON_Delete(ev);
}

static void do_reconnect(void) {
	/* Any g2_stream_locked/g2_pending_rearm state from before the disconnect is
	 * stale — nothing backs it on the other side of a fresh connect. */
	g2_stream_locked = 0;
	g2_pending_rearm = 0;

	diag_log_disconnect("listener/no device", 0);
	g2_listener_stop();
	g2_disconnect();
	printf("{\"type\":\"device_disconnected\"}\n");
	fflush(stdout);

	int reconnect_wait_iters = 0;
	int conn_err;
	while (daemon_running && (conn_err = g2_connect_silent()) < 0) {
		if (conn_err == G2_ERR_TARGET_NOT_FOUND) report_target_wait(&reconnect_wait_iters);
		usleep(100000);
	}
	if (!daemon_running) return;

	/* Reset G2 firmware state — same as startup init sequence (Delphi InitSeq steps 1-2). */
	g2_send_init();
	g2_lock_stream();

	g2_listener_start();
	g2_unlock_stream();
	/* Consume START_COMM ACK from listener queue. */
	g2_msg_t ack;
	if (g2_msg_recv(&ack, USB_TIMEOUT_STANDARD_MS) == 0)
		g2_msg_free(&ack);

	printf("{\"type\":\"device_reconnected\"}\n");
	fflush(stdout);
}

/* ── entry point ───────────────────────────────────────────────────────── */

/* Max consecutive stdin commands drained before the main loop is forced to give the
 * listener queue a (non-blocking) check. Without this cap, a fast command burst (e.g. a
 * knob/morph-range drag) can starve param_change/morph_change forwarding for the whole
 * burst, since daemon_dequeue() keeps returning non-NULL. */
#define STDIN_DRAIN_BATCH 8

int g2_daemon_run(output_format_t format, int debug) {
	(void)format;
	g2_daemon_mode = 1;
	g2_debug = debug;
	g2_set_error_callback(daemon_error_cb, NULL);

	signal(SIGINT, daemon_stop);
	signal(SIGTERM, daemon_stop);

	/* The stdin-reader thread is created after connect succeeds (below), not here.
	 * Creating it before the first libusb device-open/claim call let daemon mode hang
	 * indefinitely inside g2_connect_silent() on some machines, even though every
	 * single-shot command (which never creates this thread) connects instantly in the
	 * same environment - a libusb/pthread interaction, not anything specific to this
	 * codebase's connect logic. */

	/* Enumerate USB devices before connecting and emit the list as an event. */
	emit_event("usb_devices", g2_list_devices_json());

	/* Connect with retry. */
	debug_status("connect_wait");
	{
		int conn_err;
		int wait_iters = 0;
		while (daemon_running && (conn_err = g2_connect_silent()) < 0) {
			if (conn_err == G2_ERR_CLAIM_INTERFACE) {
				cJSON *ev = cJSON_CreateObject();
				cJSON_AddStringToObject(ev, "type", "usb_driver_error");
				cJSON_AddStringToObject(ev, "code", libusb_error_name(g2_get_last_claim_error()));
				emit(ev);
				cJSON_Delete(ev);
				return 1;
			}
			if (conn_err == G2_ERR_TARGET_NOT_FOUND) report_target_wait(&wait_iters);
			usleep(100000);
		}
	}
	if (!daemon_running) return 0;
	debug_status("connected");

	pthread_t reader;
	pthread_create(&reader, NULL, stdin_reader, NULL);

	/* Reset G2 state and stop streaming (Delphi InitSeq steps 1-2). */
	g2_send_init();
	debug_status("send_init");
	g2_lock_stream();
	debug_status("stop_comm");

	/* Run all startup queries in direct mode (no listener yet) so that
	 * g2_list() can do full-size reads from EP 0x81. Each result is emitted
	 * immediately as a typed event so the client sees progress. */

	debug_status("startup_device_info");
	emit_event("device_info", g2_device_info(0));

	const char *slotNames[] = {"A", "B", "C", "D"};
	for (int i = 0; i < 4; i++) {
		char sbuf[32];
		snprintf(sbuf, sizeof(sbuf), "startup_slot_%s", slotNames[i]);
		debug_status(sbuf);
		cJSON *patch = g2_get_patch(slotNames[i]);
		cJSON *ev = cJSON_CreateObject();
		cJSON_AddStringToObject(ev, "type", "slot_data");
		cJSON_AddStringToObject(ev, "slot", slotNames[i]);
		cJSON_AddItemToObject(ev, "data", patch ? patch : cJSON_CreateNull());
		emit(ev);
		cJSON_Delete(ev);
	}

	/* Global Parameter Pages: fetched once, after all 4 slots are loaded (an entry's
	 * module/param indices are only meaningful once those are known) — mirrors the Delphi
	 * reference's USBInitSeq ordering (patches, then global knobs, then MIDI-CC). Transport
	 * slot A; failure is non-fatal (omit the field, editor falls back to an empty list). */
	debug_status("startup_global_knobs");
	{
		cJSON *gk = g2_get_global_knobs();
		if (gk) {
			cJSON_AddStringToObject(gk, "type", "global_knobs_data");
			emit(gk);
			cJSON_Delete(gk);
		}
	}

	/* Patch/performance bank names, last before START_COMM — same as the reference editor
	 * (CSynth::CleanDirtyData: slots, global knobs, flash name lists, then START_COMM).
	 * g2_list() emits names_progress per bank, which also keeps the editor's startup
	 * inactivity timer alive. */
	debug_status("startup_names");
	emit_event("names", g2_list(LIST_FILTER_ALL, 0));

	/* All startup queries done. Start listener and arm streaming. */
	debug_status("listener_start");
	g2_listener_start();
	debug_status("rearm");
	g2_unlock_stream();   /* sends START_COMM; ACK consumed below */

	/* Wait for START_COMM ACK before declaring the daemon ready. */
	g2_msg_t ack;
	if (g2_msg_recv(&ack, USB_TIMEOUT_STANDARD_MS) == 0) {
		debug_status("ack_received");
		g2_msg_free(&ack);
	}

	printf("{\"type\":\"watch_armed\"}\n");
	fflush(stdout);

	int cmds_since_listener_check = 0;

	while (daemon_running) {
		/* If a recv_interrupt() (inside a command handler, or any other caller
		 * outside the main loop's own queue poll) saw the device disconnect
		 * (sentinel=1), it set g2_pending_disconnect instead of the main loop ever
		 * seeing the sentinel.  Reconnect now, same as the normal disconnect path
		 * below - checked at the top so the idle path covers it too. */
		if (g2_pending_disconnect) {
			g2_pending_disconnect = 0;
			g2_pending_rearm = 0;   /* moot once do_reconnect() re-arms itself */
			if (daemon_running) do_reconnect();
			cmds_since_listener_check = 0;
			continue;
		}
		/* Drain stdin commands, but yield to the listener queue every STDIN_DRAIN_BATCH
		 * commands even if more are still queued (see STDIN_DRAIN_BATCH doc comment). */
		char *line = daemon_dequeue();
		int had_line = (line != NULL);
		if (had_line) {
			execute_cmd(line);
			free(line);
			/* If a command handler's recv_interrupt() saw a BULK_REARM (sentinel=2)
			 * while waiting for a command response, it set g2_pending_rearm instead
			 * of discarding it silently.  Re-arm streaming now. */
			if (g2_pending_rearm && !g2_pending_disconnect) {
				g2_pending_rearm = 0;
				g2_stream_locked = 1;   /* covers a G2-initiated stop consumed mid-command */
				rearm_with_version_update();
				/* ACK will arrive via listener and be emitted as {"type":"ok"} next iter. */
			}
			if (++cmds_since_listener_check < STDIN_DRAIN_BATCH) continue;
		}
		cmds_since_listener_check = 0;

		/* Nothing left queued: unlock any stream a command left locked (select-patch/
		 * select-perf/set-perf-mode/upload-perf) now that we're
		 * genuinely idle, mirroring the reference editor's unlock-on-idle-tick
		 * behavior. A plain unlock, not rearm_with_version_update(): nothing
		 * that reaches this path touches the live slots. */
		if (!had_line && g2_stream_locked) g2_unlock_stream();

		/* Wait for next event from the listener. A batch of stdin commands likely means
		 * more are still queued, so peek non-blockingly rather than stalling on them;
		 * an empty stdin queue keeps the original 100ms idle wait. */
		g2_msg_t msg;
		if (g2_msg_recv(&msg, had_line ? 0 : 100) != 0) continue;

		if (msg.sentinel == 1) {
			/* Device disconnected. */
			g2_msg_free(&msg);
			if (daemon_running) do_reconnect();
		} else if (msg.sentinel == 2) {
			/* BULK_REARM: G2 stopped streaming (select-patch or select-perf).
			 * Always rearm — if recv_interrupt() already consumed a sentinel=2
			 * and set g2_pending_rearm=1, it removes the message from the queue
			 * so the main loop never sees it here (no double-rearm risk). */
			debug_timing("main_loop_bulk_rearm_detected");
			g2_emit_event(&msg);
			g2_msg_free(&msg);
			g2_pending_rearm = 0;
			g2_stream_locked = 1;   /* G2 stopped itself; we never called g2_lock_stream() */
			rearm_with_version_update();
		} else {
			/* patch_version_change arrives while streaming is active.  The following
			 * get-patch command will issue GET_PATCH_SLOT (0x36), which silently stops
			 * G2 streaming just like select-patch.  Arm the deferred rearm now so the
			 * main loop restarts streaming after get-patch returns. */
			if ((msg.interrupt[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED
				? (msg.interrupt[2] == 0x04 && msg.interrupt[4] == 0x38)
				: (msg.bulk && msg.bulk_size > 3 && msg.bulk[1] == 0x01 && msg.bulk[3] == 0x21))
				rearm_after_get_patch = 1;
			g2_emit_event(&msg);
			g2_msg_free(&msg);
			if (g2_pending_rearm) {
				g2_pending_rearm = 0;
				g2_stream_locked = 1;   /* defensive: idempotent even if already set */
				rearm_with_version_update();
				/* ACK will arrive via listener and be emitted as {"type":"ok"} next iter. */
			}
		}
	}

	g2_listener_stop();
	pthread_detach(reader);
	return 0;
}
