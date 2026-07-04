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
	g2_rearm();
}

/* ── seq: compound-frame batch execution ───────────────────────────────── */

#define SEQ_MAX_OPS   128
#define SEQ_OP_BUFSZ 1024  /* large enough for set-param-label worst case */

typedef struct { int loc, mod, param, val, var; } SetParamEntry;

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
            g2_build_add_module_op(op, p, s_loc,
                arg_i(sub,3), arg_i(sub,4), arg_i(sub,5), arg_i(sub,6), arg_i(sub,7),
                num_modes, mode_vals, arg_s(sub, j));
            n_ops++;

        } else if (strcmp(scmd, "set-module-color") == 0 && sn >= 5) {
            g2_build_set_module_color_op(op, p, s_loc, arg_i(sub,3), arg_i(sub,4));
            n_ops++;

        } else if (strcmp(scmd, "set-module-name") == 0 && sn >= 5) {
            g2_build_set_module_label_op(op, p, s_loc, arg_i(sub,3), arg_s(sub,4));
            n_ops++;

        } else if (strcmp(scmd, "set-param-label") == 0 && sn >= 6) {
            int num_labels = sn - 5;
            const char *labels[128];
            for (int li = 0; li < num_labels && li < 128; li++) labels[li] = arg_s(sub, 5 + li);
            g2_build_set_param_label_op(op, p, s_loc,
                arg_i(sub, 3), arg_i(sub, 4), num_labels < 128 ? num_labels : 128, labels);
            n_ops++;

        } else if (strcmp(scmd, "set-param") == 0 && sn >= 7) {
            /* CMD_NO_RESP — cannot go in the compound frame; queued for after */
            if (n_sp < SEQ_MAX_OPS)
                sp_entries[n_sp++] = (SetParamEntry){ s_loc, arg_i(sub,3), arg_i(sub,4), arg_i(sub,5), arg_i(sub,6) };

        } else {
            ret = G2_ERR_INVALID_PARAM;
        }
    }

    if (ret == G2_OK && n_ops > 0)
        ret = g2_batch_ops(batch_slot, ops, n_ops);

    for (int i = 0; i < n_sp && ret == G2_OK; i++)
        ret = g2_set_param(batch_slot, sp_entries[i].loc, sp_entries[i].mod,
                           sp_entries[i].param, sp_entries[i].val, sp_entries[i].var);

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
		if ((num_modes < 0 || num_modes > 16) || (name && strlen(name) > 16)) {
			ret = G2_ERR_INVALID_PARAM;
		} else {
			ret = g2_add_module(slot, loc, type_id, module_id, col, row, color,
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

	} else if (strcmp(cmd, "set-module-name") == 0 && n >= 4) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_module_label(slot, loc, arg_i(args, 2), arg_s(args, 3));

	} else if (strcmp(cmd, "set-param-label") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else {
			int num_labels = n - 4;
			const char *labels[128];
			for (int li = 0; li < num_labels && li < 128; li++) labels[li] = arg_s(args, 4 + li);
			ret = g2_set_param_label(slot, loc, arg_i(args, 2), arg_i(args, 3), num_labels < 128 ? num_labels : 128, labels);
		}

	} else if (strcmp(cmd, "set-param") == 0 && n >= 6) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_set_param(slot, loc, arg_i(args, 2), arg_i(args, 3),
		                   arg_i(args, 4), arg_i(args, 5));

	} else if (strcmp(cmd, "assign-midicc") == 0 && n >= 5) {
		int slot = parse_slot(arg_s(args, 0));
		int loc  = parse_location(args, 1);
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_assign_midicc(slot, loc, arg_i(args, 2), arg_i(args, 3), arg_i(args, 4));

	} else if (strcmp(cmd, "deassign-midicc") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_deassign_midicc(slot, arg_i(args, 1));

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
		g2_listener_stop();
		emit_event("names", g2_list(LIST_FILTER_ALL, 0));
		g2_listener_start();
		ret = G2_OK;

	} else if (strcmp(cmd, "upload-patch") == 0 && n >= 2) {
		int slot = parse_slot(arg_s(args, 0));
		if (slot == SLOT_INVALID) ret = G2_ERR_INVALID_PARAM;
		else ret = g2_upload_patch(slot, arg_s(args, 1));

	} else if (strcmp(cmd, "upload-perf") == 0 && n >= 1) {
		ret = g2_upload_perf(arg_s(args, 0));

	} else if (strcmp(cmd, "get-perf-file") == 0) {
		data = g2_get_perf_file(n >= 1 ? arg_s(args, 0) : NULL);
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
			ret = g2_set_perf_mode(mode);
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
		cJSON *synth = query_synth_settings(NULL);
		int mode = 0;
		if (synth) {
			cJSON *m = cJSON_GetObjectItem(synth, "mode");
			mode = m && strcmp(m->valuestring, "Performance") == 0;
			cJSON_Delete(synth);
		}
		data = query_perf_settings(mode, NULL);
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

static void do_reconnect(void) {
	g2_listener_stop();
	g2_disconnect();
	printf("{\"type\":\"device_disconnected\"}\n");
	fflush(stdout);

	while (daemon_running && g2_connect_silent() < 0)
		usleep(100000);
	if (!daemon_running) return;

	/* Reset G2 firmware state — same as startup init sequence (Delphi InitSeq steps 1-2). */
	g2_send_init();
	g2_stop_comm();

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

int g2_daemon_run(output_format_t format, int debug) {
	(void)format;
	g2_debug = debug;
	g2_set_error_callback(daemon_error_cb, NULL);

	signal(SIGINT, daemon_stop);
	signal(SIGTERM, daemon_stop);

	pthread_t reader;
	pthread_create(&reader, NULL, stdin_reader, NULL);

	/* Enumerate USB devices before connecting and emit the list as an event. */
	emit_event("usb_devices", g2_list_devices_json());

	/* Connect with retry. */
	debug_status("connect_wait");
	{
		int conn_err;
		while (daemon_running && (conn_err = g2_connect_silent()) < 0) {
			if (conn_err == G2_ERR_CLAIM_INTERFACE) {
				cJSON *ev = cJSON_CreateObject();
				cJSON_AddStringToObject(ev, "type", "usb_driver_error");
				cJSON_AddStringToObject(ev, "code", libusb_error_name(g2_get_last_claim_error()));
				emit(ev);
				cJSON_Delete(ev);
				pthread_detach(reader);
				return 1;
			}
			usleep(100000);
		}
	}
	if (!daemon_running) { pthread_detach(reader); return 0; }
	debug_status("connected");

	/* Reset G2 state and stop streaming (Delphi InitSeq steps 1-2). */
	g2_send_init();
	debug_status("send_init");
	g2_stop_comm();
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

	debug_status("startup_list");
	emit_event("names", g2_list(LIST_FILTER_ALL, 0));

	debug_status("startup_synth_settings");
	cJSON *startup_synth = query_synth_settings("synth_settings_update");
	if (startup_synth) {
		emit(startup_synth);
		cJSON_Delete(startup_synth);
	}

	/* All startup queries done. Start listener and arm streaming. */
	debug_status("listener_start");
	g2_listener_start();
	debug_status("rearm");
	g2_rearm();   /* sends START_COMM; ACK consumed below */

	/* Wait for START_COMM ACK before declaring the daemon ready. */
	g2_msg_t ack;
	if (g2_msg_recv(&ack, USB_TIMEOUT_STANDARD_MS) == 0) {
		debug_status("ack_received");
		g2_msg_free(&ack);
	}

	printf("{\"type\":\"watch_armed\"}\n");
	fflush(stdout);

	while (daemon_running) {
		/* Drain stdin commands first. */
		char *line = daemon_dequeue();
		if (line) {
			execute_cmd(line);
			free(line);
			/* If a command handler's recv_interrupt() saw a BULK_REARM (sentinel=2)
			 * while waiting for a command response, it set g2_pending_rearm instead
			 * of discarding it silently.  Re-arm streaming now. */
			if (g2_pending_rearm) {
				g2_pending_rearm = 0;
				rearm_with_version_update();
				/* ACK will arrive via listener and be emitted as {"type":"ok"} next iter. */
			}
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
			/* BULK_REARM: G2 stopped streaming (select-patch or select-perf).
			 * Always rearm — if recv_interrupt() already consumed a sentinel=2
			 * and set g2_pending_rearm=1, it removes the message from the queue
			 * so the main loop never sees it here (no double-rearm risk). */
			debug_timing("main_loop_bulk_rearm_detected");
			g2_emit_event(&msg);
			g2_msg_free(&msg);
			g2_pending_rearm = 0;
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
				rearm_with_version_update();
				/* ACK will arrive via listener and be emitted as {"type":"ok"} next iter. */
			}
		}
	}

	g2_listener_stop();
	pthread_detach(reader);
	return 0;
}
