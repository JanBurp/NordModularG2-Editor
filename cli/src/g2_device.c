/*
 * G2 CLI - Device API
 *
 * High-level commands for the Nord G2: connect/disconnect, patch retrieval,
 * module and cable editing, parameter control, patch upload, and performance
 * mode. Builds on the low-level transport in g2_io.c.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <unistd.h>
#include <ctype.h>
#include <dirent.h>
#include <libusb.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "g2_protocol.h"
#include "utils.h"
#include "cJSON.h"
#include "daemon.h"
#include "g2_events.h"

static g2_error_cb_t g2_error_cb = NULL;
static void *g2_error_cb_ctx = NULL;

/* Patch version cache per slot (0-3 = A-D), 0 = unknown */
uint8_t g2_slot_version[4] = {0};
uint8_t g2_slot_version_zero[4] = {0};   /* G2 replied version 0: a real value, don't re-query */
uint8_t g2_perf_version_cache = 0;   /* 0 = unknown; cleared by version_update events */

void g2_set_error_callback(g2_error_cb_t cb, void *ctx) {
    g2_error_cb = cb;
    g2_error_cb_ctx = ctx;
}

static void g2_err(const char *fmt, ...) {
    char msg[256];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(msg, sizeof(msg), fmt, ap);
    va_end(ap);
    size_t len = strlen(msg);
    if (len > 0 && msg[len - 1] == '\n') msg[--len] = '\0';
    if (g2_error_cb) {
        g2_error_cb(msg, g2_error_cb_ctx);
    } else {
        fprintf(stderr, "%s\n", msg);
    }
}
const char *g2_error_string(int code) {
    switch (code) {
        case G2_OK:                   return "ok";
        case G2_ERR_NOT_FOUND:        return "no G2 found";
        case G2_ERR_CONNECT:          return "could not connect to the G2";
        case G2_ERR_RESET:            return "USB reset failed";
        case G2_ERR_CLAIM_INTERFACE:  return "could not claim the G2's USB interface - another program may be using it";
        case G2_ERR_SEND:             return "failed to send data to the G2";
        case G2_ERR_RECV:             return "no response from the G2";
        case G2_ERR_TIMEOUT:          return "the G2 did not respond in time";
        case G2_ERR_PARSE:            return "could not parse the G2's response";
        case G2_ERR_INVALID_PARAM:    return "invalid parameter";
        case G2_ERR_FILE_OPEN:        return "could not open the file";
        case G2_ERR_FILE_WRITE:       return "could not write the file";
        case G2_ERR_NO_MEMORY:        return "out of memory";
        case G2_ERR_NOT_IMPLEMENTED:  return "not implemented";
        case G2_ERR_TOO_LARGE:        return "too large for the G2 - it cannot receive more than 32 KB in one message";
        case G2_ERR_TARGET_NOT_FOUND: return "the targeted G2 was not found - it may have been unplugged";
        case G2_ERR_REJECTED:         return "the G2 rejected the edit";
        case G2_ERR:                  return "unspecified error";
        default:                      return "unknown error";
    }
}

static int ensure_connected(int silent) {
    if (g2_is_connected()) {
        return 0;
    }
    return silent ? g2_connect_silent() : g2_connect();
}

/* Accepts the reply a caller waits for: the 16-byte interrupt header, plus the bulk of an extended message. */
typedef int (*reply_match_fn)(const uint8_t *intr, const uint8_t *bulk, uint16_t bulk_size, int arg);

/* Waits up to USB_TIMEOUT_LONG_MS for the message `match` accepts and hands it back in *reply (free
 * with g2_msg_free). Anything else that arrives meanwhile is relayed as an event once the wait is
 * over; relaying earlier could start a nested query (e.g. synth_settings_update ->
 * query_perf_settings) that swallows our reply. An extended message's bulk is always read, so it
 * can't be taken for a later reply. keep_acks: also see generic ok/error acks (a write's ack). */
#define STRAY_MAX 16
static int await_reply(reply_match_fn match, int arg, int keep_acks, g2_msg_t *reply) {
    g2_msg_t strays[STRAY_MAX];
    int n_strays = 0, ret = G2_ERR_RECV;
    long long left, deadline = now_ms() + USB_TIMEOUT_LONG_MS;
    while ((left = deadline - now_ms()) > 0) {
        g2_msg_t m = {0};
        int n = keep_acks ? recv_interrupt_acks(m.interrupt, 16, (int)left) : recv_interrupt(m.interrupt, 16, (int)left);
        if (n <= 0) break;
        if ((m.interrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)m.interrupt[1] << 8) | m.interrupt[2];
            m.bulk = sz ? calloc(1, sz) : NULL;
            if (m.bulk) {
                int got = recv_bulk(m.bulk, sz);
                m.bulk_size = got > 0 ? (uint16_t)got : 0;
            } else {
                discard_bulk(sz);
            }
        }
        if (match(m.interrupt, m.bulk, m.bulk_size, arg)) {
            *reply = m;
            ret = G2_OK;
            break;
        }
        if (n_strays < STRAY_MAX) { strays[n_strays++] = m; continue; }
        g2_emit_event(&m);
        g2_msg_free(&m);
    }
    for (int i = 0; i < n_strays; i++) { g2_emit_event(&strays[i]); g2_msg_free(&strays[i]); }
    return ret;
}

static int is_version_reply(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int slot) {
    (void)bulk; (void)n;
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED && intr[4] == SUB_RESPONSE_PATCH_VERSION && intr[5] == slot;
}

/* GET_PATCH_VERSION for slot 0-3, or 4 for the performance.
 * The G2 queues this query behind edits it is still applying: right after two add-modules it
 * answered after ~555 ms (duration test 2026-10-04), just past a 500 ms wait. */
static int query_version(int slot, uint8_t *out) {
    uint8_t cmd[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)slot};
    if (send_system_data(0x41, cmd, sizeof(cmd)) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    g2_msg_t r;
    int ret = await_reply(is_version_reply, slot, 0, &r);
    if (ret == G2_OK) { *out = r.interrupt[6]; g2_msg_free(&r); }
    return ret;
}

/* Patch data reply (bulk: [0]0x01 [1]0x08|slot [2]version [3]C_PATCH_DESCR ... module list at
 * PCH2_USB_CHUNK2_START, the layout patch_usb_to_pch2 relies on). The tag matters: a resources_used
 * (0x72) message has the same shape and was taken for the patch 44 times in a 4 h duration test
 * (2026-10-06), giving the editor an empty patch built from garbage. The module-list check keeps a
 * bare C_PATCH_DESCR change notification (g2_events.c) from passing as the reply. */
static int is_patch_data_reply(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int slot) {
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EXTENDED && bulk && n > PCH2_USB_CHUNK2_START + PCH2_USB_TAIL_SIZE &&
           bulk[1] == (0x08 | slot) && bulk[3] == C_PATCH_DESCR && bulk[PCH2_USB_CHUNK2_START] == SUB_RESPONSE_MODULE_LIST;
}

/* Patch name reply: embedded (tag at [4]) or extended (tag at bulk[3]). */
static int is_patch_name_reply(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int arg) {
    (void)arg;
    if ((intr[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) return intr[4] == SUB_RESPONSE_PATCH_NAME;
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EXTENDED && bulk && n > 4 && bulk[3] == SUB_RESPONSE_PATCH_NAME;
}

/* Version, patch data (USB format, caller frees *data) and name of `slot`; only tagged replies are
 * accepted (see await_reply). A missing name is not an error: name stays "". */
static int fetch_patch(int slot, uint8_t *version, uint8_t **data, uint16_t *size, char *name, size_t name_size) {
    g2_msg_t r;
    *data = NULL;
    name[0] = '\0';

    /* Flush stale G2 data from a previous command (direct mode only;
     * listener thread drains EP 0x81 continuously, so no flush needed). */
    if (!g2_listener_active) g2_drain_quiet(USB_TIMEOUT_STALE_MS, NULL);

    debug_timing("get_patch_version_start");
    int ret = query_version(slot, version);
    debug_timing("get_patch_version_end");
    if (ret == G2_ERR_SEND) { g2_err("Failed to send get patch version command\n"); return ret; }
    if (ret != G2_OK) { g2_err("No response from G2 for patch version\n"); return ret; }
    if (*version) g2_slot_version[slot] = *version;

    debug_timing("get_patch_slot_start");
    if (send_slot(slot, *version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
        g2_err("Failed to send get patch command\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    if (await_reply(is_patch_data_reply, slot, 0, &r) != G2_OK) {
        g2_err("No patch data from G2\n");
        return G2_ERR_RECV;
    }
    debug_timing("get_patch_slot_end");
    *data = r.bulk;
    *size = r.bulk_size;

    debug_timing("get_patch_name_start");
    if (send_slot(slot, *version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        g2_err("Failed to send get patch name command\n");
        free(*data);
        *data = NULL;
        return G2_ERR_SEND;
    }
    if (await_reply(is_patch_name_reply, 0, 0, &r) == G2_OK) {
        if (r.bulk) parse_name(r.bulk + 4, name, name_size);
        else parse_name(r.interrupt + 5, name, name_size);
        g2_msg_free(&r);
    }
    debug_timing("get_patch_name_end");
    return G2_OK;
}

/* The performance settings as one read-modify-write unit (see perf_settings_read). */
typedef struct {
    g2_msg_t msg;       /* the GET_PERF_SETTINGS reply; msg.bulk holds the data */
    uint8_t version;    /* performance version the write is addressed with */
    uint8_t *chunk;     /* the C_PERF_SETTINGS chunk in msg.bulk: [0x11][size hi][size lo][settings...] */
    uint8_t *slot[4];   /* each slot's fields after its name: +0 active, +1 key, +2 hold, +5/+6 range */
} perf_settings_t;

static int is_perf_settings(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int arg) {
    (void)arg;
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EXTENDED && bulk && n > 4 && bulk[3] == 0x29;
}

static int is_system_ack(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int arg) {
    (void)bulk; (void)n; (void)arg;
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED && intr[2] == 0x0C && (intr[4] == 0x7F || intr[4] == 0x7E);
}

/* Reads the performance settings: perf name (0x29), then the 0x11 chunk with the 4 slots.
 * Only the tagged reply is accepted. Writing back whatever message arrived first (a rearm burst, or
 * the update our own previous write caused) sent garbage settings to the G2 and wedged it
 * (duration test 2026-10-05, set-slot-key fired on every slot switch). */
static int perf_settings_read(perf_settings_t *ps) {
    memset(ps, 0, sizeof(*ps));
    if (query_version(4, &ps->version) != G2_OK) return G2_ERR_RECV;
    if (send_system(ps->version, 0x10) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    int ret = await_reply(is_perf_settings, 0, 0, &ps->msg);
    if (ret != G2_OK) return ret;

    uint8_t *end = ps->msg.bulk + ps->msg.bulk_size;
    char name[32];
    uint8_t *p = ps->msg.bulk + 4;
    p += parse_name(p, name, (size_t)(end - p < 17 ? end - p : 17));
    if (p + 3 > end || p[0] != 0x11 || p + 3 + (((uint16_t)p[1] << 8) | p[2]) > end) goto bad;
    ps->chunk = p;
    uint8_t *s = p + 11;
    for (int i = 0; i < 4; i++) {
        if (s >= end) goto bad;
        int nl = parse_name(s, name, (size_t)(end - s < 17 ? end - s : 17));
        if (s + nl + 7 > end) goto bad;
        ps->slot[i] = s + nl;
        s += nl + 10;
    }
    return G2_OK;
bad:
    g2_err("perf settings: malformed reply (%u bytes)\n", ps->msg.bulk_size);
    g2_msg_free(&ps->msg);
    return G2_ERR_PARSE;
}

/* Writes the (edited) chunk back and waits for the G2's ack, so the next command can't overtake it
 * (the reference editor keeps one message in flight, CBubblePort::SendMessages). Frees ps. */
static int perf_settings_write(perf_settings_t *ps) {
    uint16_t inner = ((uint16_t)ps->chunk[1] << 8) | ps->chunk[2];
    int sent = send_system_data(ps->version, ps->chunk, (size_t)3 + inner);
    g2_msg_free(&ps->msg);
    if (sent < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    g2_msg_t ack;
    if (await_reply(is_system_ack, 0, 1, &ack) != G2_OK) { g2_err("perf settings: no ack from G2\n"); return G2_ERR_RECV; }
    int nack = ack.interrupt[4] == 0x7E;
    g2_msg_free(&ack);
    if (nack) { g2_err("perf settings: G2 rejected the write\n"); return G2_ERR; }
    return G2_OK;
}

int g2_send_init(void) {
    uint8_t response[16] = {0};

    if (ensure_connected(1) < 0) return G2_ERR_CONNECT;

    /* Send CMD_INIT without draining first, so a streaming G2 can't delay it.
     * CMD_INIT does NOT stop the stream (hardware, 2026-10-22: a G2 left streaming
     * kept streaming after it); the read loop below skips stream messages until
     * the init reply. */
    if (send_init_msg() < 0) {
        g2_err("Failed to send init message\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    /* Read responses until RESPONSE_TYPE_INIT is found. Streaming events
     * may arrive before the init response if the G2 was streaming. */
    for (int tries = 0; tries < 10; tries++) {
        int ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
        if (ret <= 0) {
            g2_err("No response to init message\n");
            return G2_ERR_RECV;
        }

        if ((response[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) continue;

        uint16_t size = ((uint16_t)response[1] << 8) | response[2];
        if (size == 0) continue;

        uint8_t *data = malloc(size);
        if (!data) return G2_ERR_NO_MEMORY;
        recv_bulk(data, size);
        uint8_t first = data[0];
        free(data);

        if (first == RESPONSE_TYPE_INIT) return G2_OK;
        /* else: stale streaming bulk — discard and keep reading */
    }

    g2_err("Did not receive init response after retries\n");
    return G2_ERR_RECV;
}

static int is_synth_settings(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int arg) {
    (void)arg;
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EXTENDED && bulk && n > 3 && bulk[3] == SUB_RESPONSE_SYNTH_SETTINGS;
}

/* Tagged (await_reply): taking the first extended message as the reply could parse a stray as the settings. */
cJSON *query_synth_settings(const char *type) {
    if (send_system(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) return NULL;
    usleep(USB_SEND_DELAY_US);
    g2_msg_t r;
    if (await_reply(is_synth_settings, 0, 0, &r) != G2_OK) return NULL;
    cJSON *json = build_synth_bulk_json(r.bulk, type);
    g2_msg_free(&r);
    return json;
}

/* The GET_PERF_SETTINGS reply (perf name 0x29 + the 0x11 chunk; caller frees), or NULL. Tagged read
 * (perf_settings_read): the old untagged read took whatever arrived first, its version from the 0x81
 * reply (CMMidiLearnRequest in the reference editor), and then reported all slots inactive and
 * unkeyed (seen 2026-10-20). */
static uint8_t *perf_settings_bytes(size_t *size) {
    perf_settings_t ps;
    *size = 0;
    if (perf_settings_read(&ps) != G2_OK) { g2_err("perf settings: no valid reply from G2\n"); return NULL; }
    uint8_t *bytes = ps.msg.bulk;
    *size = ps.msg.bulk_size;
    ps.msg.bulk = NULL;
    g2_msg_free(&ps.msg);
    return bytes;
}

cJSON *query_perf_settings(int mode, const char *type) {
    size_t size;
    uint8_t *bytes = perf_settings_bytes(&size);
    if (!bytes) return NULL;
    cJSON *root = cJSON_CreateObject();
    if (type) cJSON_AddStringToObject(root, "type", type);
    perf_parse_and_add(bytes, size, mode, root);
    free(bytes);
    return root;
}

cJSON *g2_get_perf_settings(void) {
    if (ensure_connected(1) < 0) return NULL;
    cJSON *synth = query_synth_settings(NULL);
    int mode = 0;
    if (synth) {
        cJSON *m = cJSON_GetObjectItem(synth, "mode");
        mode = m && cJSON_IsString(m) && strcmp(m->valuestring, "Performance") == 0;
        cJSON_Delete(synth);
    }
    cJSON *data = query_perf_settings(mode, NULL);
    if (data) cJSON_AddStringToObject(data, "mode", mode ? "performance" : "patch");
    return data;
}

cJSON *g2_device_info(int debug) {
    uint8_t *bulkData = NULL;
    uint8_t *perfData = NULL;
    size_t bulkSize = 0;
    size_t perfSize = 0;
    cJSON *root = NULL;

    if (ensure_connected(1) < 0) {
        g2_err("Failed to connect to G2\n");
        goto cleanup;
    }

    /* Flush stale data before querying (direct mode only; same pattern as g2_get_patch).
     * Avoids g2_drain_pending() which can accidentally call g2_rearm() and start
     * streaming without a listener, contaminating subsequent query responses. */
    if (!g2_listener_active) g2_drain_quiet(USB_TIMEOUT_STALE_MS, NULL);

    /* Step 1: Send GET_SYNTH_SETTINGS (0x02) */
    if (send_system(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) {
        g2_err("Failed to send synth settings command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    /* Tagged like query_synth_settings: a stray (e.g. a late reply to the previous one-shot) is
     * relayed instead of failing the read with "Unexpected response type" (test:g2 2026-10-22). */
    g2_msg_t ss;
    if (await_reply(is_synth_settings, 0, 0, &ss) != G2_OK) {
        g2_err("No response from G2\n");
        goto cleanup;
    }
    bulkData = ss.bulk;
    bulkSize = ss.bulk_size;

    if (debug) {
        fprintf(stderr, "SYNTH:%zu:", bulkSize);
        for (size_t j = 0; j < bulkSize; j++) {
            fprintf(stderr, "%02x", bulkData[j]);
        }
        fprintf(stderr, "\n");
    }

    /* Step 2: performance settings */
    perfData = perf_settings_bytes(&perfSize);
    if (!perfData) goto cleanup;

    if (debug) {
        fprintf(stderr, "PERF:%zu:", perfSize);
        for (size_t j = 0; j < perfSize; j++) {
            fprintf(stderr, "%02x", perfData[j]);
        }
        fprintf(stderr, "\n");
    }

    /* Parse settings data and build JSON */
    root = g2_parse_settings(bulkData, bulkSize, perfData, perfSize);
    if (!root) {
        g2_err("Failed to parse settings\n");
    }

cleanup:
    free(bulkData);
    free(perfData);
    return root;
}

cJSON *g2_get_patch(const char *slot_str) {
    int slot;
    int actual_slot;
    uint8_t version;
    uint8_t interruptResp[16] = {0};
    uint8_t *patchData = NULL;
    uint16_t patchSize = 0;
    int ret;

    if (ensure_connected(1) < 0) {
            g2_err("Failed to connect to G2\n");
            return NULL;
        }

    /* Parse slot parameter - required */
    if (slot_str == NULL) {
        g2_err("Slot required (A, B, C, or D)\n");
        goto cleanup;
    }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        goto cleanup;
    }
    actual_slot = slot;

    char patchName[32];
    if (fetch_patch(slot, &version, &patchData, &patchSize, patchName, sizeof(patchName)) != G2_OK) goto cleanup;

    /* Step 4: Get patch notes ("Text Pad") — read-only; see g2_device.h for why there's no
     * live SET. Non-fatal on failure; an empty text field just means notes didn't come back
     * this time. */
    debug_timing("get_patch_text_start");
    char *patchText = NULL;
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_TEXT, NULL, 0) == 0) {
        /* A straggler notification from a preceding operation (e.g. an upload) can still be
         * in flight when our request's answer arrives. Rather than trust whatever packet
         * shows up first, loop discarding anything that isn't tagged as a notes response
         * (0x6f) — mirrors the reference editor's single-outstanding-command lockstep
         * (FWaitForCmd in BVE.NMG2USB.pas), bounded here since this fetch is best-effort. */
        for (int attempt = 0; attempt < 5; attempt++) {
            ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_LONG_MS);
            if (ret <= 0) break;
            if ((interruptResp[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) {
                if (interruptResp[4] != SUB_RESPONSE_PATCH_NOTES) continue;
                /* Self-contained: [0]type [1..2]slot echo [3]0 [4]0x6f(tag) [5..6]size
                 * (big-endian) [7..7+size)]text [after that]CRC. CRC follows the data, it
                 * doesn't precede it — confirmed via the extended branch below, whose bulk
                 * payload has the identical tag+2-byte-length shape one byte earlier. Only
                 * covers very short text (~7 bytes fit before the CRC); anything longer
                 * arrives via the extended-bulk branch below instead. */
                uint16_t size = (interruptResp[5] << 8) | interruptResp[6];
                if (size > 0 && size <= 16 - 7 - 2) {
                    patchText = malloc((size_t)size + 1);
                    if (patchText) {
                        memcpy(patchText, interruptResp + 7, size);
                        patchText[size] = '\0';
                    }
                }
                break;
            } else if ((interruptResp[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
                uint16_t size = (interruptResp[1] << 8) | interruptResp[2];
                uint8_t *textData = malloc(size);
                if (!textData) break;
                int bulkLen = recv_bulk(textData, size);
                /* Bulk payload: [0..2] header, [3]=response tag (0x6f for notes; confirmed
                 * name responses carry 0x27 there — this is what filters out a stale
                 * straggler bulk transfer left over from the preceding name-fetch step, same
                 * shape otherwise), [4..5]=text length (big-endian), then the text itself.
                 * Confirmed against real hardware: a 97-byte capture had tag=0x6f, length=89
                 * at [4..5], and the text starting exactly at offset 6. */
                if (bulkLen > 6 && textData[3] == SUB_RESPONSE_PATCH_NOTES) {
                    uint16_t textLen = ((uint16_t)textData[4] << 8) | textData[5];
                    if (textLen > (uint16_t)(bulkLen - 6)) textLen = (uint16_t)(bulkLen - 6);
                    patchText = malloc((size_t)textLen + 1);
                    if (patchText) {
                        memcpy(patchText, textData + 6, textLen);
                        patchText[textLen] = '\0';
                    }
                    free(textData);
                    break;
                }
                free(textData);
                continue;
            }
            /* Unrecognized packet type — keep waiting for the real answer. */
        }
        debug_timing("get_patch_text_end");
    }

    /* Convert USB bulk format to pch2 format before returning */
    uint8_t *pch2Data = malloc(patchSize);
    size_t pch2Size = patchSize;
    if (pch2Data && patch_usb_to_pch2(patchData, patchSize, pch2Data, &pch2Size) == 0) {
        free(patchData);
        patchData = pch2Data;
        patchSize = (uint16_t)pch2Size;
    } else {
        free(pch2Data);
    }

    /* Build JSON output */
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "slot", (char*[]){ "A", "B", "C", "D" }[slot]);
    cJSON_AddStringToObject(root, "name", patchName);
    cJSON_AddStringToObject(root, "text", patchText ? patchText : "");
    cJSON_AddNumberToObject(root, "size", patchSize);
    free(patchText);

    char *hexStr = malloc(patchSize * 2 + 1);
    if (hexStr) {
        for (size_t i = 0; i < patchSize; i++) {
            snprintf(hexStr + i * 2, 3, "%02x", patchData[i]);
        }
        hexStr[patchSize * 2] = '\0';
        cJSON_AddStringToObject(root, "data", hexStr);
        free(hexStr);
    }

    free(patchData);
    return root;

cleanup:
    free(patchData);
    return NULL;
}

cJSON *g2_get_patch_file(const char *slot_str, const char *filename) {
    int slot;
    uint8_t version;
    uint8_t *patchData = NULL;
    uint16_t patchSize = 0;
    if (ensure_connected(1) < 0) {
        g2_err("Failed to connect to G2\n");
        return NULL;
    }

    if (slot_str == NULL) {
        g2_err("Slot required (A, B, C, or D)\n");
        goto cleanup;
    }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        goto cleanup;
    }
    g2_err("Fetching patch from slot %c...\n", "ABCD"[slot]);

    char patchName[32];
    if (fetch_patch(slot, &version, &patchData, &patchSize, patchName, sizeof(patchName)) != G2_OK) goto cleanup;

    char defaultFilename[64];
    if (filename == NULL) {
        if (strlen(patchName) == 0) {
            snprintf(defaultFilename, sizeof(defaultFilename), "slot_%c.pch2", "ABCD"[slot]);
        } else {
            snprintf(defaultFilename, sizeof(defaultFilename), "%s.pch2", patchName);
        }
        filename = defaultFilename;
    }

    uint8_t *pch2Data = malloc(patchSize);
    size_t pch2Size = patchSize;
    if (!pch2Data) {
        g2_err("Memory allocation failed for PCH2 conversion\n");
        goto cleanup;
    }

    if (patch_usb_to_pch2(patchData, patchSize, pch2Data, &pch2Size) < 0) {
        g2_err("Failed to convert patch to PCH2 format\n");
        free(pch2Data);
        goto cleanup;
    }

    /* patch_usb_to_pch2 yields bare sections; a loadable .pch2 also needs the text header
     * and the trailing CRC (see pch2_file_from_sections). */
    size_t fileSize = strlen(PCH2_TEXT_HEADER) + 3 + pch2Size + 2;
    uint8_t *fileData = malloc(fileSize);
    if (!fileData || pch2_file_from_sections(pch2Data, pch2Size, fileData, &fileSize) < 0) {
        g2_err("Failed to build PCH2 file\n");
        free(fileData);
        free(pch2Data);
        goto cleanup;
    }
    free(pch2Data);

    FILE *f = fopen(filename, "wb");
    if (!f) {
        g2_err("Failed to open file '%s' for writing\n", filename);
        free(fileData);
        goto cleanup;
    }

    size_t written = fwrite(fileData, 1, fileSize, f);
    fclose(f);
    free(fileData);
    pch2Size = fileSize;

    if (written != pch2Size) {
        g2_err("Failed to write complete file\n");
        goto cleanup;
    }

    cJSON *result = cJSON_CreateObject();
    cJSON_AddStringToObject(result, "file", filename);
    cJSON_AddStringToObject(result, "slot", (char*[]){ "A", "B", "C", "D" }[slot]);
    cJSON_AddStringToObject(result, "name", patchName);
    cJSON_AddNumberToObject(result, "size", (int)pch2Size);

    free(patchData);
    return result;

cleanup:
    free(patchData);
    return NULL;
}

cJSON *g2_startup(void) {
    if (ensure_connected(1) < 0) return NULL;

    cJSON *device = g2_device_info(0);
    if (!device) return NULL;

    const char *slotNames[] = {"A", "B", "C", "D"};
    cJSON *slots = cJSON_CreateArray();
    for (int i = 0; i < 4; i++) {
        cJSON *patch = g2_get_patch(slotNames[i]);
        cJSON_AddItemToArray(slots, patch ? patch : cJSON_CreateNull());
    }

    cJSON *names = g2_list(LIST_FILTER_ALL, 0);

    cJSON *root = cJSON_CreateObject();
    cJSON_AddItemToObject(root, "device", device);
    cJSON_AddItemToObject(root, "slots", slots);
    cJSON_AddItemToObject(root, "names", names ? names : cJSON_CreateNull());
    return root;
}

int g2_select_slot(const char *slot_str) {
    int slot;
    uint8_t version;
    uint8_t data[2] = {0};

    if (ensure_connected(0) < 0) {
        g2_err("Failed to connect to G2\n");
        return G2_ERR_CONNECT;
    }

    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        return G2_ERR_INVALID_PARAM;
    }

    g2_drain_pending();

    /* SELECT_SLOT uses the performance version (slot=4), not the patch slot version.
     * Per doc/usb.md §6: SELECT_SLOT is a performance-level command.
     * Send only sub-cmd 0x09 (Delphi PerfSelectSlot). The g2ctl.py 0x07 bitmask
     * step resets all slots' active/key state as a side effect and must not be used. */
    if (query_version(4, &version) != G2_OK || !version) version = 0x41;

    data[0] = 0x09;
    data[1] = slot;
    if (send_system_data(version, data, 2) < 0) {
        g2_err("Failed to send slot select command\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();

    return G2_OK;
}

/* G2 patch category names, indices 0-15 */
static const char* g2categories[16] = {
    "no_cat",   /* 0: no_cat */
    "acoustic", /* 1: acoustic */
    "sequencer",/* 2: sequencer */
    "bass",     /* 3: bass */
    "classic",  /* 4: classic */
    "drum",     /* 5: drum */
    "fantasy",  /* 6: fantasy */
    "fx",       /* 7: fx */
    "lead",     /* 8: lead */
    "organ",    /* 9: organ */
    "pad",      /* 10: pad */
    "piano",    /* 11: piano */
    "synth",    /* 12: synth */
    "audio_in", /* 13: audio_in */
    "user_1",   /* 14: user_1 */
    "user_2"    /* 15: user_2 */
};

/* List command control codes */
#define LIST_JUMP      1
#define LIST_SKIP      2
#define LIST_BANK      3
#define LIST_MODE      4
#define LIST_CONTINUE  5
#define LIST_LAST      LIST_CONTINUE

/* Reply to the 0x14 list request (bulk: [0]0x01 [1]0x0c [2]0x00 [3]R_LIST_NAMES ...). */
static int is_list_reply(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int arg) {
    (void)arg;
    /* The last page (just the end marker) fits an embedded message: c2 | 01 0c 00 13 lo hi 16 01 01 04 | crc
     * (hardware-captured 2026-10-26). Missing it cost every full list a 2 s timeout. */
    if ((intr[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) return intr[2] == COMMAND_SYS && intr[4] == R_LIST_NAMES;
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EXTENDED && bulk && n > 4 && bulk[1] == COMMAND_SYS && bulk[3] == R_LIST_NAMES;
}

cJSON *g2_list(int filter, int bank_filter) {
    uint8_t response[1024] = {0};
    uint8_t cmdData[4] = {0};
    cJSON *root = NULL;
    cJSON *result = NULL;
    int ret;
    int mode;
    int bank = 0;
    int patch = 0;
    int PATCH_MODE = 0;
    int PERFORMANCE_MODE = 1;
    int END_MODE = 2;
    int start_mode, end_mode;
    int done = 0;
    int bank_filter_active = (bank_filter > 0);
    int initial_bank = bank_filter > 0 ? bank_filter - 1 : 0;
    int flash_usage = -1;

    if (ensure_connected(1) < 0) {
            g2_err("Not connected to G2\n");
            return NULL;
        }

    /* reload-names (daemon.c) calls this with the listener stopped, same direct-
     * mode window get_patch/get_synth_settings already flush before querying (see
     * their identical stale-drain loops) - a bank upload's R_LIST_NAMES push can
     * still be in flight, and with nothing dispatching it via g2_events.c the raw
     * read below would otherwise absorb it as this command's own 0x14 LIST reply,
     * misaligning the state machine's byte offsets. Confirmed on hardware
     * (2026-09-17): a maximal 16-char name has no NUL to resync on, so it's the
     * one most likely to show a corrupted trailing character. */
    if (!g2_listener_active) g2_drain_quiet(USB_TIMEOUT_STALE_MS, NULL);

    if (filter == LIST_FILTER_ALL) {
        root = cJSON_CreateObject();
        cJSON *patches = cJSON_CreateObject();
        cJSON *performances = cJSON_CreateObject();
        cJSON_AddItemToObject(root, "patches", patches);
        cJSON_AddItemToObject(root, "performances", performances);
        result = root;
    } else {
        result = cJSON_CreateObject();
        root = result;
    }

    if (filter == LIST_FILTER_ALL) {
        start_mode = PATCH_MODE;
        end_mode = END_MODE;
    } else if (filter == LIST_FILTER_PATCHES) {
        start_mode = PATCH_MODE;
        end_mode = PATCH_MODE + 1;
    } else {
        start_mode = PERFORMANCE_MODE;
        end_mode = PERFORMANCE_MODE + 1;
    }

    for (mode = start_mode; mode < end_mode && !done; mode++) {
        bank = initial_bank;
        patch = 0;

        while (mode < END_MODE && !done) {
            cmdData[0] = 0x14;
            cmdData[1] = (uint8_t)mode;
            cmdData[2] = (uint8_t)bank;
            cmdData[3] = (uint8_t)patch;

            if (send_system_data(0x41, cmdData, 4) < 0) {
                g2_err("Failed to send list command\n");
                if (root) cJSON_Delete(root);
                return NULL;
            }

            /* Only the tagged reply counts: taking a stray LED/meter message (0x39/0x3a) for it
             * left every later request reading the previous request's answer - duplicated
             * pages, performances listed under patch banks (duration test 2026-10-06). */
            g2_msg_t r;
            ret = 0;
            if (await_reply(is_list_reply, 0, 0, &r) == G2_OK) {
                if (r.bulk) {
                    ret = r.bulk_size < sizeof(response) ? r.bulk_size : (int)sizeof(response);
                    memcpy(response, r.bulk, ret);
                } else {   /* embedded: the same layout as a bulk, after the length/type byte */
                    ret = r.interrupt[0] >> 4;
                    memcpy(response, r.interrupt + 1, ret);
                }
                g2_msg_free(&r);
            }

            if (ret > 5) flash_usage = G2_FLASH_USAGE(response);

            if (ret <= 9) {
                break;
            }

            int data_len = ret - 9 - 2;
            if (data_len <= 0) {
                break;
            }

            if (g2_daemon_mode) {
                /* Patches: banks 1-32, performances: banks 1-8 (same bounds enforced
                 * for send-bank/get-bank elsewhere in this file) - gives a real,
                 * non-guessed total for a determinate progress bar. */
                int total_banks = (filter == LIST_FILTER_PATCHES) ? 32 : (filter == LIST_FILTER_PERFORMANCES) ? 8 : 32 + 8;
                int banks_done = (filter == LIST_FILTER_ALL && mode == PERFORMANCE_MODE) ? 32 + bank : bank;
                printf("{\"type\":\"names_progress\",\"location\":%d,\"total\":%d}\n", banks_done + 1, total_banks);
                fflush(stdout);
            }

            uint8_t *data = response + 9;
            int pos = 0;

            while (pos < data_len) {
                uint8_t c = data[pos];

                if (c > LIST_LAST) {
                    char name[32] = {0};
                    int nameLen = parse_name(data + pos, name, sizeof(name));

                        int extra = (mode == PATCH_MODE) ? 1 : 0; /* patches have category byte, perfs don't */
                    if (nameLen <= 0 || pos + nameLen + extra > data_len) {
                        break;
                    }

                    cJSON *item = cJSON_CreateObject();
                    cJSON_AddNumberToObject(item, "location", patch + 1);
                    cJSON_AddStringToObject(item, "name", name);

                    if (mode == PATCH_MODE) {
                        int categoryIdx = data[pos + nameLen];
                        if (categoryIdx > 15) categoryIdx = 0;
                        cJSON_AddStringToObject(item, "category", g2categories[categoryIdx]);
                    }

                    char bankKey[8];
                    snprintf(bankKey, sizeof(bankKey), "%d", bank + 1);
                    cJSON *bankArray;

                    if (filter == LIST_FILTER_ALL) {
                        if (mode == PATCH_MODE) {
                            bankArray = cJSON_GetObjectItem(cJSON_GetObjectItem(root, "patches"), bankKey);
                            if (!bankArray) {
                                bankArray = cJSON_CreateArray();
                                cJSON_AddItemToObject(cJSON_GetObjectItem(root, "patches"), bankKey, bankArray);
                            }
                        } else {
                            bankArray = cJSON_GetObjectItem(cJSON_GetObjectItem(root, "performances"), bankKey);
                            if (!bankArray) {
                                bankArray = cJSON_CreateArray();
                                cJSON_AddItemToObject(cJSON_GetObjectItem(root, "performances"), bankKey, bankArray);
                            }
                        }
                    } else {
                        bankArray = cJSON_GetObjectItem(result, bankKey);
                        if (!bankArray) {
                            bankArray = cJSON_CreateArray();
                            cJSON_AddItemToObject(result, bankKey, bankArray);
                        }
                    }

                    cJSON_AddItemToArray(bankArray, item);

                    patch++;
                    pos += nameLen + extra;
                } else if (c == LIST_CONTINUE) {
                    pos++;
                } else if (c == LIST_BANK) {
                    if (pos + 3 <= data_len) {
                        int new_bank = data[pos + 1];
                        patch = data[pos + 2];

                        if (bank_filter_active && new_bank != bank) {
                            done = 1;
                            break;
                        }

                        bank = new_bank;
                        pos += 3;
                    } else {
                        break;
                    }
                } else if (c == LIST_JUMP) {
                    if (pos + 2 <= data_len) {
                        patch = data[pos + 1];
                        pos += 2;
                    } else {
                        break;
                    }
                } else if (c == LIST_SKIP) {
                    patch++;
                    pos++;
                } else if (c == LIST_MODE) {
                    mode++;
                    bank = 0;
                    patch = 0;
                    pos++;
                    if (filter != LIST_FILTER_ALL) {
                        done = 1;
                    }
                    break;
                } else {
                    pos++;
                }
            }
        }
    }

    if (filter == LIST_FILTER_ALL && flash_usage >= 0) cJSON_AddNumberToObject(root, "flashUsage", flash_usage);
    return result;
}

int g2_select_variation(int variation, int slot) {
    int ret;
    uint8_t extraData[1] = {0};

    if (variation < 1 || variation > 10) {
        g2_err("Invalid variation: %d (must be 1-10; 10 = Patch Mutator audition)\n", variation);
        return G2_ERR_INVALID_PARAM;
    }

    if (ensure_connected(0) < 0) {
            g2_err("Failed to connect to G2\n");
            return G2_ERR_CONNECT;
        }

    if (slot < 0 || slot > 3) {
        g2_err("Slot required (A, B, C, or D)\n");
        return G2_ERR_INVALID_PARAM;
    }

    g2_drain_pending();

    /* Step 1: get the slot's patch version */
    uint8_t version;
    ret = query_version(slot, &version);
    if (ret != G2_OK) {
        g2_err(ret == G2_ERR_SEND ? "Failed to send variation command 1\n" : "No response from G2 for variation command 1\n");
        return ret;
    }
    if (version) g2_slot_version[slot] = version;

    /* Step 2: Send [CMD_A + slot, version, 0x6a, variation - 1] */
    extraData[0] = variation - 1;
    if (send_slot(slot, version, 0x6a, extraData, 1) < 0) {
        g2_err("Failed to send variation command 2\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    /* Consume any EXTENDED response (bulk data) — leaving it unread blocks the endpoint */
    {
        uint8_t response[16] = {0};
        int n = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);
        if (n > 0 && (response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)response[1] << 8) | response[2];
            if (sz > 0) {
                uint8_t *bulk = malloc(sz);
                if (bulk) { recv_bulk(bulk, sz); free(bulk); }
            }
            g2_rearm();
        }
    }

    g2_drain_pending();

    return G2_OK;
}

/* ── Payload builders ───────────────────────────────────────────────────
 * Each builder encodes one USB sub-command into op->cmd/payload/len using
 * the caller-supplied buf.  These are the single source of truth for byte
 * layout; both the single-op functions and execute_seq call them. */

static void swap_connectors(int *fm, int *fct, int *fci, int *tm, int *tct, int *tci) {
    int t; t=*fm; *fm=*tm; *tm=t; t=*fct; *fct=*tct; *tct=t; t=*fci; *fci=*tci; *tci=t;
}

void g2_build_del_cable_op(G2Op *op, uint8_t *buf, int loc,
                            int fm, int fct, int fci, int tm, int tct, int tci) {
    if (fct == 0) swap_connectors(&fm, &fct, &fci, &tm, &tct, &tci);
    buf[0]=(uint8_t)((1<<1)|(loc&1)); buf[1]=(uint8_t)fm;
    buf[2]=(uint8_t)(((fct&3)<<6)|(fci&0x3f));
    buf[3]=(uint8_t)tm; buf[4]=(uint8_t)(((tct&3)<<6)|(tci&0x3f));
    op->cmd=0x51; op->payload=buf; op->len=5;
}

void g2_build_add_cable_op(G2Op *op, uint8_t *buf, int loc, int color,
                            int fm, int fct, int fci, int tm, int tct, int tci) {
    if (fct == 0) swap_connectors(&fm, &fct, &fci, &tm, &tct, &tci);
    buf[0]=(uint8_t)((1<<4)|((loc&1)<<3)|(color&7)); buf[1]=(uint8_t)fm;
    buf[2]=(uint8_t)(((fct&3)<<6)|(fci&0x3f));
    buf[3]=(uint8_t)tm; buf[4]=(uint8_t)(((tct&3)<<6)|(tci&0x3f));
    op->cmd=0x50; op->payload=buf; op->len=5;
}

/* S_CABLE_COLOR: [loc<<3 | color][from mod][kind<<6 | idx][to mod][kind<<6 | idx], as
 * BVE.NMG2Mess.pas writes (AddSetCableColorMessage) and parses it. This used to send del-cable's
 * first byte plus a trailing color byte: the G2 took the extra byte for a further command, NACKed
 * it (code 3) and renamed the slot "Error" (duration tests 2026-10-06/07). */
void g2_build_set_cable_color_op(G2Op *op, uint8_t *buf, int loc, int color,
                                  int fm, int fct, int fci, int tm, int tct, int tci) {
    if (fct == 0) swap_connectors(&fm, &fct, &fci, &tm, &tct, &tci);
    buf[0]=(uint8_t)(((loc&1)<<3)|(color&7)); buf[1]=(uint8_t)fm;
    buf[2]=(uint8_t)(((fct&3)<<6)|(fci&0x3f));
    buf[3]=(uint8_t)tm; buf[4]=(uint8_t)(((tct&3)<<6)|(tci&0x3f));
    op->cmd=0x54; op->payload=buf; op->len=5;
}

void g2_build_del_module_op(G2Op *op, uint8_t *buf, int loc, int module_id) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id;
    op->cmd=0x32; op->payload=buf; op->len=2;
}

void g2_build_move_module_op(G2Op *op, uint8_t *buf, int loc,
                              int module_id, int col, int row) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id;
    buf[2]=(uint8_t)col; buf[3]=(uint8_t)row;
    op->cmd=0x34; op->payload=buf; op->len=4;
}

int g2_build_add_module_op(G2Op *op, uint8_t *buf, int loc,
                            int type_id, int module_id, int col, int row, int color, int muta_lock,
                            int num_modes, const int *mode_vals, const char *name) {
    if (module_id < 1 || module_id > G2_MAX_MODULE_INDEX) {
        g2_err("add-module: module-id must be 1-%d\n", G2_MAX_MODULE_INDEX);
        return G2_ERR_INVALID_PARAM;
    }
    if (type_id == G2_MODULE_TYPE_FX_IN && loc != 0) {
        g2_err("add-module: Fx-In (type %d) only works in the fx area\n", G2_MODULE_TYPE_FX_IN);
        return G2_ERR_INVALID_PARAM;
    }
    int pos = 0;
    buf[pos++]=(uint8_t)type_id; buf[pos++]=(uint8_t)loc;
    buf[pos++]=(uint8_t)module_id; buf[pos++]=(uint8_t)col;
    buf[pos++]=(uint8_t)row; buf[pos++]=(uint8_t)(color&0xff);
    buf[pos++]=0x00; buf[pos++]=(uint8_t)(muta_lock ? 1 : 0); /* upRate, Exclude From Mutation (see set-mutation-lock) */
    if (num_modes < 0) num_modes = 0;
    if (num_modes > 16) num_modes = 16;  /* bound: caller buffers hold at most this many */
    for (int m=0; m<num_modes; m++)
        buf[pos++]=(uint8_t)(mode_vals ? mode_vals[m] : 0);
    if (name && *name) {
        size_t nlen=strlen(name); if (nlen>16) nlen=16;
        memcpy(buf+pos, name, nlen+1); pos+=(int)nlen+1;
    } else { buf[pos++]=0x00; }
    op->cmd=0x30; op->payload=buf; op->len=pos;
    return pos;
}

void g2_build_set_module_color_op(G2Op *op, uint8_t *buf,
                                   int loc, int module_id, int color) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id; buf[2]=(uint8_t)color;
    op->cmd=0x31; op->payload=buf; op->len=3;
}

/* Patch Mutator "Exclude From Mutation" (official CMMutaLock::WriteStream, tag 0x90): same
 * loc/module/value layout as set-module-color. Stored as the module record bit after upRate. */
void g2_build_set_mutation_lock_op(G2Op *op, uint8_t *buf,
                                   int loc, int module_id, int locked) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id; buf[2]=(uint8_t)(locked ? 1 : 0);
    op->cmd=0x90; op->payload=buf; op->len=3;
}

/* S_SET_MODULE_UPRATE (0x2A): reference CMModuleABCode::WriteStream, sent by the official editor
 * whenever a cable change promotes/demotes a module to/from audio rate. add-module always sends
 * upRate=0, so without this the G2 keeps running the module at control rate (degraded audio). */
void g2_build_set_module_uprate_op(G2Op *op, uint8_t *buf,
                                    int loc, int module_id, int uprate) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id; buf[2]=(uint8_t)(uprate&1);
    op->cmd=0x2a; op->payload=buf; op->len=3;
}

void g2_build_set_module_label_op(G2Op *op, uint8_t *buf,
                                   int loc, int module_id, const char *label) {
    size_t nlen = label ? strlen(label) : 0; if (nlen > 16) nlen = 16;
    buf[0] = (uint8_t)loc; buf[1] = (uint8_t)module_id;
    if (label && nlen > 0) memcpy(buf+2, label, nlen);
    if (nlen < 16) buf[2+nlen] = 0x00;
    op->cmd = 0x33; op->payload = buf; op->len = (int)(2 + nlen + (nlen < 16 ? 1 : 0));
}

/* SET_PARAM_LABEL (0x42) replaces the module's WHOLE label list (the original editor's
 * CMCustomData::WriteStream sends the module's entire custom data), so every labelled param of the
 * module must be in one message. tok = groups of "<param-idx> <count> <label>*count". Returns 0, or
 * G2_ERR_INVALID_PARAM on a malformed group or a list over the 255-byte module_len field. */
int g2_build_set_module_labels_op(G2Op *op, uint8_t *buf, int loc, int module_id, int ntok, const char **tok) {
    int idx = 3;
    for (int i = 0; i < ntok; ) {
        int param = atoi(tok[i] ? tok[i] : ""); i++;
        int count = i < ntok ? atoi(tok[i] ? tok[i] : "") : 0; i++;
        if (count < 1 || i + count > ntok || idx - 3 + 3 + 7 * count > 255) return G2_ERR_INVALID_PARAM;
        buf[idx++] = 1; buf[idx++] = (uint8_t)(1 + 7 * count); buf[idx++] = (uint8_t)param;
        for (int k = 0; k < count; k++, i++) {
            const char *label = tok[i] ? tok[i] : "";   /* NULL = non-string JSON arg */
            size_t llen = strlen(label); if (llen > 7) llen = 7;
            memset(buf + idx, 0, 7); memcpy(buf + idx, label, llen); idx += 7;
        }
    }
    if (idx == 3) return G2_ERR_INVALID_PARAM;
    buf[0] = (uint8_t)loc; buf[1] = (uint8_t)module_id; buf[2] = (uint8_t)(idx - 3);
    op->cmd = 0x42; op->payload = buf; op->len = idx;
    return G2_OK;
}

/* ── Helper: get version for slot using GET_PATCH_VERSION (with cache) */
static uint8_t cable_get_version(int slot) {
    if (g2_slot_version[slot] || g2_slot_version_zero[slot]) return g2_slot_version[slot];
    /* cache miss — ask G2 (fallback for first use before get-patch) */
    uint8_t version;
    if (query_version(slot, &version) != G2_OK) return 0;
    if (version) g2_slot_version[slot] = version;
    else g2_slot_version_zero[slot] = 1;   /* a real version 0, don't re-query */
    return version;
}

/* An edit's answer: ok (0x7F, aCmd 0x08+slot) or a NACK (0x7E). A NACK's slot tag can't be trusted:
 * a slot-D add-module NACK arrived tagged slot A (duration test 2026-10-07), so any slot's counts. */
static int is_edit_ack(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int slot) {
    (void)bulk; (void)n;
    if ((intr[0] & 0x0f) != RESPONSE_TYPE_EMBEDDED || intr[2] == 0x04 || intr[2] == 0x0C) return 0;
    return intr[4] == 0x7E || (intr[4] == 0x7F && intr[2] == 0x08 + slot);
}

/* Sends ops as one slot edit frame and waits for the G2's ok/NACK. Edits used to be fire-and-forget,
 * so a NACKed add-module still returned ok and the editor kept cabling a module the G2 had refused
 * until it wedged (duration test 2026-10-07). Waiting also keeps one edit in flight, like the
 * reference editor. Every edit is answered, ~50-450 ms (same run). */
/* Slot of an edit that got no answer in time, -1 if none. The G2 answers every edit, so its ack may still
 * come; only one edit is ever in flight, so an edit ack before the next send is that late one and must not
 * be taken as the next edit's answer (a late NACK would fail a good edit, a late ok pass a refused one). */
static int edit_ack_owed_slot = -1;

static int send_slot_edit(int slot, const char *what, const G2Op *ops, int n_ops) {
    if (edit_ack_owed_slot >= 0) {
        g2_msg_t late;
        if (await_reply(is_edit_ack, edit_ack_owed_slot, 1, &late) == G2_OK) g2_msg_free(&late);
        edit_ack_owed_slot = -1;
    }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    if (send_slot_batch((uint8_t)slot, version, ops, n_ops) < 0) {
        g2_err("%s: failed to send\n", what);
        return G2_ERR_SEND;
    }
    g2_msg_t ack;
    if (await_reply(is_edit_ack, slot, 1, &ack) != G2_OK) {
        g2_err("%s: no answer from the G2\n", what);
        edit_ack_owed_slot = slot;
        return G2_ERR_RECV;
    }
    int nack = ack.interrupt[4] == 0x7E, code = ack.interrupt[5];
    g2_msg_free(&ack);
    if (nack) { g2_err("%s: G2 rejected the edit (code %d)\n", what, code); return G2_ERR_REJECTED; }
    return G2_OK;
}

int g2_add_cable(int slot, int location, int color,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    if (slot < 0 || slot > 3)                { g2_err("add-cable: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)        { g2_err("add-cable: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 6)              { g2_err("add-cable: color must be 0-6\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("add-cable: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("add-cable: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[5]; G2Op op;
    g2_build_add_cable_op(&op, buf, location, color,
                          from_mod, from_con_type, from_con_id,
                          to_mod, to_con_type, to_con_id);
    return send_slot_edit(slot, "add-cable", &op, 1);
}

int g2_del_cable(int slot, int location,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    if (slot < 0 || slot > 3)          { g2_err("del-cable: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("del-cable: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("del-cable: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("del-cable: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[5]; G2Op op;
    g2_build_del_cable_op(&op, buf, location,
                          from_mod, from_con_type, from_con_id,
                          to_mod, to_con_type, to_con_id);
    return send_slot_edit(slot, "del-cable", &op, 1);
}

int g2_set_cable_color(int slot, int location, int color,
                       int from_mod, int from_con_type, int from_con_id,
                       int to_mod,   int to_con_type,   int to_con_id) {

    if (slot < 0 || slot > 3)                 { g2_err("set-cable-color: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)         { g2_err("set-cable-color: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 6)               { g2_err("set-cable-color: color must be 0-6\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("set-cable-color: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-cable-color: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[5]; G2Op op;
    g2_build_set_cable_color_op(&op, buf, location, color,
                                from_mod, from_con_type, from_con_id,
                                to_mod, to_con_type, to_con_id);
    return send_slot_edit(slot, "set-cable-color", &op, 1);
}

int g2_del_module(int slot, int location, int module_id) {

    if (slot < 0 || slot > 3)          { g2_err("del-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("del-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("del-module: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[2]; G2Op op;
    g2_build_del_module_op(&op, buf, location, module_id);
    return send_slot_edit(slot, "del-module", &op, 1);
}

int g2_move_module(int slot, int location, int module_id, int col, int row) {

    if (slot < 0 || slot > 3)          { g2_err("move-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("move-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("move-module: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[4]; G2Op op;
    g2_build_move_module_op(&op, buf, location, module_id, col, row);
    return send_slot_edit(slot, "move-module", &op, 1);
}

int g2_add_module(int slot, int location, int type_id, int module_id,
                  int col, int row, int color, int muta_lock,
                  int num_modes, const int *mode_vals,
                  int num_params, const int *param_vals,
                  const char *name) {
    (void)num_params; (void)param_vals; /* G2 initialises params to defaults */

    if (slot < 0 || slot > 3)          { g2_err("add-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("add-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    uint8_t buf[512]; G2Op op;
    int built = g2_build_add_module_op(&op, buf, location, type_id, module_id, col, row, color, muta_lock,
                                       num_modes, mode_vals, name);
    if (built < 0) return built;

    if (ensure_connected(0) < 0) { g2_err("add-module: failed to connect\n"); return G2_ERR_CONNECT; }

    return send_slot_edit(slot, "add-module", &op, 1);
}

int g2_set_module_color(int slot, int location, int module_id, int color) {

    if (slot < 0 || slot > 3)          { g2_err("set-module-color: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("set-module-color: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 24)       { g2_err("set-module-color: color must be 0-24\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-color: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[3]; G2Op op;
    g2_build_set_module_color_op(&op, buf, location, module_id, color);
    return send_slot_edit(slot, "set-module-color", &op, 1);
}

/* Sends whole patch sections ([type][len16][data], as in a .pch2) as one slot edit. The Patch
 * Mutator uses it for the official audition dump (CMMutaParamDump): Parameters (0x4d) for the
 * patch-settings, VA and FX contexts plus Morph (0x65), each holding only variation 9. */
int g2_send_sections(int slot, const uint8_t *buf, size_t len) {
    if (slot < 0 || slot > 3) { g2_err("send-sections: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    size_t ofs = 0;
    while (ofs + 3 <= len) ofs += 3 + (size_t)((buf[ofs + 1] << 8) | buf[ofs + 2]);
    if (len < 3 || ofs != len) { g2_err("send-sections: not a sequence of whole sections\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("send-sections: failed to connect\n"); return G2_ERR_CONNECT; }

    G2Op op = { .cmd = buf[0], .payload = (uint8_t *)buf + 1, .len = (int)len - 1 };
    return send_slot_edit(slot, "send-sections", &op, 1);
}

int g2_set_mutation_lock(int slot, int location, int module_id, int locked) {

    if (slot < 0 || slot > 3)          { g2_err("set-mutation-lock: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("set-mutation-lock: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (locked < 0 || locked > 1)      { g2_err("set-mutation-lock: locked must be 0 or 1\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-mutation-lock: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[3]; G2Op op;
    g2_build_set_mutation_lock_op(&op, buf, location, module_id, locked);
    return send_slot_edit(slot, "set-mutation-lock", &op, 1);
}

int g2_set_module_uprate(int slot, int location, int module_id, int uprate) {

    if (slot < 0 || slot > 3)          { g2_err("set-module-uprate: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("set-module-uprate: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (uprate < 0 || uprate > 1)      { g2_err("set-module-uprate: uprate must be 0 or 1\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-uprate: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[3]; G2Op op;
    g2_build_set_module_uprate_op(&op, buf, location, module_id, uprate);
    return send_slot_edit(slot, "set-module-uprate", &op, 1);
}

int g2_set_module_label(int slot, int location, int module_id, const char *label) {

    if (slot < 0 || slot > 3)         { g2_err("set-module-name: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1) { g2_err("set-module-name: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-name: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t buf[20]; G2Op op;
    g2_build_set_module_label_op(&op, buf, location, module_id, label);
    return send_slot_edit(slot, "set-module-name", &op, 1);
}

int g2_set_module_labels(int slot, int location, int module_id, int ntok, const char **tok) {
    if (slot < 0 || slot > 3)            { g2_err("set-module-labels: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 2)    { g2_err("set-module-labels: location must be 0(fx), 1(va) or 2(patch)\n"); return G2_ERR_INVALID_PARAM; }

    uint8_t buf[G2_MODULE_LABELS_BUFSZ]; G2Op op;
    if (g2_build_set_module_labels_op(&op, buf, location, module_id, ntok, tok) != G2_OK) {
        g2_err("set-module-labels: malformed <param> <count> <label>... groups or list too long\n");
        return G2_ERR_INVALID_PARAM;
    }
    if (ensure_connected(0) < 0) { g2_err("set-module-labels: failed to connect\n"); return G2_ERR_CONNECT; }

    return send_slot_edit(slot, "set-module-labels", &op, 1);
}

int g2_batch_ops(int slot, const G2Op *ops, int n_ops) {
    if (slot < 0 || slot > 3)    { g2_err("seq: invalid slot\n");      return G2_ERR_INVALID_PARAM; }
    if (n_ops <= 0)               return G2_OK;
    if (ensure_connected(0) < 0) { g2_err("seq: failed to connect\n"); return G2_ERR_CONNECT; }

    return send_slot_edit(slot, "seq", ops, n_ops);
}

int g2_set_module_mode(int slot, int location, int module_id, int param, int val) {

    if (slot < 0 || slot > 3)         { g2_err("set-module-mode: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1) { g2_err("set-module-mode: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-mode: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t extra[4] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)param, (uint8_t)val };
    G2Op op = { .cmd = 0x2B, .payload = extra, .len = 4 };
    return send_slot_edit(slot, "set-module-mode", &op, 1);
}

int g2_select_patch(int slot, int bank, int location) {
    if (slot < 0 || slot > 3)           return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 127) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    uint8_t cmd[4] = { 0x0a, (uint8_t)slot, (uint8_t)(bank - 1), (uint8_t)(location - 1) };
    if (send_system_data(0x41, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_select_perf(int bank, int location) {
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 127) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    uint8_t cmd[4] = { 0x0a, 4, (uint8_t)(bank - 1), (uint8_t)(location - 1) };
    if (send_system_data(0x41, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    /* In daemon mode the listener queue is the only consumer; the daemon's
     * select-perf dispatch already drains the whole post-select cascade
     * (ACK, synth/perf settings, version updates, final BULK_REARM) and emits
     * each as a watch event. Calling recv_interrupt() here too would race it
     * for the same messages, silently swallowing whichever one it grabs
     * first (e.g. perf_settings) without emitting it or freeing its bulk
     * payload — see select-perf dispatch in daemon.c. */
    if (!g2_listener_active) {
        uint8_t response[64] = {0};
        recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
        g2_drain_pending();
    }
    return G2_OK;
}

/* Waits for the G2's answer to a flash operation on (bank0, location0), 0-based: a
 * CMFlashDumpMarker (0x18, status 0 = written) or a CMFlashCommandResult (0x0D,
 * [flag][bank][location][fileType][result]). The result comes on its own as an embedded
 * message, or inside a bulk one - a clear is answered with one bulk holding a delete
 * notification (0x15) followed by the 0x0D result (hardware-captured 2026-10-24):
 *   01 0c 00 | 15 00 1f 04 13 4e 01 | 0d 00 1f 04 00 05 | crc
 * Anything else is relayed so the watch stream keeps it. Like the official editor
 * (CFlashData marks itself busy until HandleFlashCommandResult), the next flash command
 * must not go out before this answer: a blind single read took other commands' replies.
 * Returns 1 for a marker, 2 for a command result (status in *status), 0 when none came,
 * negative for a USB/memory error. */
static int await_flash_result(int bank0, int location0, int *status) {
    for (int attempt = 0; attempt < 20; attempt++) {
        uint8_t response[64] = {0};
        int rret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
        /* Through the listener queue a bare timeout is 0, so anything negative is a real USB
         * error: stop now. The direct libusb path (recv_interrupt_with_retry, g2_io.c) reports
         * a plain timeout as -1 as well, so there we can only keep waiting - otherwise the
         * one-shot CLI aborts on the first write that takes over 2 s. */
        if (rret < 0) {
            if (g2_listener_active) {
                g2_err("flash location %d: USB error waiting for the result: %s\n", location0 + 1, libusb_error_name(rret));
                return rret;
            }
            continue;
        }
        if (rret == 0) continue;
        if ((response[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) {
            if (response[4] == 0x18 && response[7] == (uint8_t)bank0 && response[8] == (uint8_t)location0) {
                *status = response[5];
                return 1;
            }
            if (response[4] == 0x0D && response[6] == (uint8_t)bank0 && response[7] == (uint8_t)location0) {
                *status = response[9];
                return 2;
            }
            continue;   /* somebody else's embedded message - keep waiting */
        }
        if ((response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t bulkSize = ((uint16_t)response[1] << 8) | response[2];
            if (bulkSize == 0) continue;
            uint8_t *bulk = malloc(bulkSize);
            if (!bulk) return G2_ERR_NO_MEMORY;
            int bret = recv_bulk(bulk, bulkSize);
            int found = 0;
            if (bret > 7 && bulk[1] == 0x0C) {
                /* Marker layout: [0x01][0x0C][ver][0x18][status][fileType][bank][location]. */
                if (bulk[3] == 0x18 && bulk[6] == (uint8_t)bank0 && bulk[7] == (uint8_t)location0) {
                    *status = bulk[4];
                    found = 1;
                }
                /* A 0x0D result anywhere in the system message, tagged with our location. */
                for (int i = 3; !found && i + 5 < bret; i++) {
                    if (bulk[i] == 0x0D && bulk[i + 2] == (uint8_t)bank0 && bulk[i + 3] == (uint8_t)location0) {
                        *status = bulk[i + 5];
                        found = 2;
                    }
                }
            }
            /* Relayed even when it holds our result: a store/clear ack also carries the
             * names entry or cleared location and the flash usage the editor shows. */
            if (bret > 0) {
                g2_msg_t relay = {0};
                memcpy(relay.interrupt, response, 16);
                relay.bulk = bulk;
                relay.bulk_size = (uint16_t)bret;
                g2_emit_event(&relay);
            }
            free(bulk);
            if (found) return found;
        }
    }
    return 0;
}

/* Waits for the answer to a store/clear of bank-location (1-based; a range is answered for its
 * first location) and maps it to a return code. Messages name the location, or the bank when
 * `whole_bank`. Result codes and texts per CFlashData::HandleFlashCommandResult: 0, 2, 5 = done (a clear
 * answers 5), 1 = can't load, 3 = memory full, 4 = memory protect on. The official editor shows
 * no message for other codes; here they are an error. */
static int check_flash_result(const char *what, int bank, int location, int whole_bank) {
    char where[16];
    if (whole_bank) snprintf(where, sizeof(where), "bank %d", bank);
    else            snprintf(where, sizeof(where), "%d-%d", bank, location);
    int status = -1;
    int got = await_flash_result(bank - 1, location - 1, &status);
    if (got < 0) return got == G2_ERR_NO_MEMORY ? G2_ERR_NO_MEMORY : G2_ERR_RECV;
    if (got == 0) {
        /* G2_ERR, not G2_ERR_TIMEOUT: the daemon treats that as a lost device. */
        g2_err("%s: no reply from device for %s\n", what, where);
        return G2_ERR;
    }
    if (got == 2 && status != 0 && status != 2 && status != 5) {
        g2_err("%s: device refused %s (%s)\n", what, where,
               status == 4 ? "Memory protect on" : status == 3 ? "Flash memory full" : status == 1 ? "Can't load from flash" : "flash error");
        return G2_ERR;
    }
    return G2_OK;
}

int g2_store_patch(int slot, int bank, int location) {
    if (slot < 0 || slot > 4)           return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 128) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    /* S_STORE: [0x0B, slot, bank-1, location-1] */
    uint8_t cmd[4] = { 0x0b, (uint8_t)slot, (uint8_t)(bank - 1), (uint8_t)(location - 1) };
    if (send_system_data(0x41, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    /* The G2 refuses a store (memory protect on, flash full) with a CMFlashCommandResult:
     * a blind read here reported success while nothing reached the flash. */
    return check_flash_result("store-patch", bank, location, 0);
}

int g2_clear_patch(int type, int bank, int location) {
    if (type < 0 || type > 1)           return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 128) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    /* S_CLEAR: [0x0C, type, bank-1, location-1, 0x00] */
    uint8_t cmd[5] = { 0x0c, (uint8_t)type, (uint8_t)(bank - 1), (uint8_t)(location - 1), 0x00 };
    if (send_system_data(0x41, cmd, 5) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    return check_flash_result("clear-patch", bank, location, 0);
}

int g2_clear_bank(int type, int bank, int from_loc, int to_loc) {
    if (type < 0 || type > 1)             return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)            return G2_ERR_INVALID_PARAM;
    if (from_loc < 1 || from_loc > 128)   return G2_ERR_INVALID_PARAM;
    if (to_loc < 1 || to_loc > 128)       return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)          return G2_ERR_CONNECT;
    g2_drain_pending();
    /* S_CLEAR_BANK: bank written twice — matches Delphi CreateClearBankMessage */
    uint8_t cmd[7] = { 0x0e, (uint8_t)type,
                       (uint8_t)(bank - 1), (uint8_t)(from_loc - 1),
                       (uint8_t)(bank - 1), (uint8_t)(to_loc - 1), 0x00 };
    if (send_system_data(0x41, cmd, 7) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    /* Done: one bulk with the deleted range (0x12), the flash usage (0x13) and a 0x0D result for
     * from_loc, status 5. Memory protect on: only that result, status 4 - a blind read here
     * reported success while the bank stayed (hardware-captured 2026-10-26). */
    return check_flash_result("clear-bank", bank, from_loc, from_loc == 1 && to_loc == 128);
}

int g2_set_synth_settings(cJSON *params) {
    if (!params) { g2_err("set-synth-settings: NULL params\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-synth-settings: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t data[56]; size_t len;
    if (g2_build_synth_set_msg(params, data, &len) < 0) {
        g2_err("set-synth-settings: failed to build message\n");
        return G2_ERR_INVALID_PARAM;
    }
    if (send_system_data(0x41, data, len) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

/* The G2's reply to a 0x3E mode change: bulk [1]=0x0C [3]=0x1F (version update, see g2_events.c). */
static int is_mode_reply(const uint8_t *intr, const uint8_t *bulk, uint16_t n, int arg) {
    (void)arg;
    return (intr[0] & 0x0f) == RESPONSE_TYPE_EXTENDED && bulk && n > 3 && bulk[1] == 0x0C && bulk[3] == 0x1F;
}

int g2_set_perf_mode(int mode, int shift) {
    if (mode < 0 || mode > 1) { g2_err("set-perf-mode: mode must be 0(patch) or 1(performance)\n"); return G2_ERR_INVALID_PARAM; }
    if (shift < 0 || shift > 1) { g2_err("set-perf-mode: shift must be 0 or 1\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-perf-mode: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t cmd[3] = { 0x3E, (uint8_t)mode, (uint8_t)shift };
    if (send_system_data(0x41, cmd, 3) < 0) return G2_ERR_SEND;
    /* In daemon mode: listener handles the response (aCmd=0x0C, sub=0x1F mode/slot data)
     * and sets g2_pending_rearm for the main loop.
     * In CLI mode: wait for that reply (~650 ms after 0x3E; a fixed 200 ms sleep left it for the
     * next one-shot, test:g2 2026-10-22), then stop streaming so the all-slots version update
     * doesn't trigger g2_rearm() and leave the G2 in an unread streaming state. Best effort: no
     * reply within USB_TIMEOUT_LONG_MS doesn't fail the command. */
    if (!g2_listener_active) {
        g2_msg_t r;
        if (await_reply(is_mode_reply, 0, 0, &r) == G2_OK) g2_msg_free(&r);
        g2_lock_stream();
    }
    return G2_OK;
}

int g2_set_perf_name(const char *name) {
    /* "" is valid: the official editor sends it too (CPerformance::SetPerformanceName has no empty check). */
    if (!name) { g2_err("set-perf-name: missing name\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-perf-name: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    uint8_t version;
    if (query_version(4, &version) != G2_OK) { g2_err("No response from G2 for perf version\n"); return G2_ERR; }

    size_t nlen = strlen(name);
    if (nlen > 16) nlen = 16;
    uint8_t cmd[19];
    int pos = 0;
    cmd[pos++] = 0x29;
    memcpy(cmd + pos, name, nlen);
    pos += (int)nlen;
    if (nlen < 16) cmd[pos++] = 0;

    if (send_system_data(version, cmd, (size_t)pos) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    /* The name-only ack is an embedded 0x04/0x29 message, which recv_interrupt() relays as a
     * perf_name event and skips in daemon mode — so a timeout here is expected, not an error. */
    int ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    /* Check for EXTENDED response (bulk event) - must be consumed or it blocks further communication */
    if (ret > 0 && (response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
        uint16_t bulkSize = ((uint16_t)response[1] << 8) | response[2];
        if (bulkSize > 0) {
            uint8_t *bulk = malloc(bulkSize);
            if (bulk) {
                recv_bulk(bulk, bulkSize);
                free(bulk);
            }
        }
    }
    g2_drain_pending();
    return G2_OK;
}

int g2_set_patch_name(int slot, const char *name) {
    if (slot < 0 || slot > 3)  { g2_err("set-patch-name: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    /* "" is valid: the official editor sends it too (CPatchView::OpenPatchNameDlg has no empty check). */
    if (!name)                 { g2_err("set-patch-name: missing name\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-patch-name: failed to connect\n"); return G2_ERR_CONNECT; }
    size_t nlen = strlen(name);
    if (nlen > 16) nlen = 16;
    uint8_t payload[16];
    memcpy(payload, name, nlen);
    if (nlen < 16) payload[nlen] = 0x00;
    G2Op op = { .cmd = 0x27, .payload = payload, .len = (int)(nlen + (nlen < 16 ? 1 : 0)) };
    return send_slot_edit(slot, "set-patch-name", &op, 1);
}

int g2_set_patch_description(int slot, const uint8_t *data, int len) {
    if (slot < 0 || slot > 3) { g2_err("set-patch-description: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (!data || len <= 0)    { g2_err("set-patch-description: no data\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-patch-description: failed to connect\n"); return G2_ERR_CONNECT; }
    /* G2 uses chunk format for C_PATCH_DESCR: [0x21][size_hi][size_lo][data] */
    uint8_t payload[2 + 64];
    if (len > 62) { g2_err("set-patch-description: data too long\n"); return G2_ERR_INVALID_PARAM; }
    payload[0] = (len >> 8) & 0xFF;
    payload[1] = len & 0xFF;
    memcpy(payload + 2, data, len);
    /* Waits for the G2's answer like every other edit: fire-and-forget let this ack land on the next
     * edit's await_reply, so a NACK got blamed on an add-module (duration test 2026-10-08). */
    G2Op op = { .cmd = 0x21, .payload = payload, .len = 2 + len };
    return send_slot_edit(slot, "set-patch-description", &op, 1);
}

/* No g2_set_patch_notes(): confirmed twice on real hardware (both hangs) plus three independent
 * reference sources (decompiled official editor, Delphi reference, chrispurusha/G2-Edit) that a
 * standalone live SET for patch notes does not exist in the real protocol — see g2_device.h and
 * project memory. Notes reach the device only embedded in a full patch write (g2_upload_patch). */

/* NOTE: g2_set_voice_mode / g2_set_voice_count call g2_get_patch internally
 * (read-modify-write). Do NOT call these from an editor that has a patch
 * loaded in memory — use set-patch-description directly instead. */
static int set_voice_description_field(int slot, int field, int val) {
    const char *slot_names[] = {"A", "B", "C", "D"};
    cJSON *patch = g2_get_patch(slot_names[slot]);
    if (!patch) { g2_err("voice-field: failed to get patch for slot %d\n", slot); return G2_ERR; }

    const char *hex = cJSON_GetStringValue(cJSON_GetObjectItem(patch, "data"));
    if (!hex) { cJSON_Delete(patch); return G2_ERR_INVALID_PARAM; }

    int hex_len = (int)strlen(hex);
    int data_len = hex_len / 2;
    uint8_t *data = malloc(data_len);
    if (!data) { cJSON_Delete(patch); return G2_ERR; }
    for (int k = 0; k < data_len; k++) {
        char buf[3] = { hex[k*2], hex[k*2+1], 0 };
        data[k] = (uint8_t)strtol(buf, NULL, 16);
    }
    cJSON_Delete(patch);

    /* Find null-terminated text header */
    int text_end = -1;
    for (int k = 0; k < data_len; k++) {
        if (data[k] == 0) { text_end = k; break; }
    }
    if (text_end < 0 || text_end + 3 > data_len) { free(data); return G2_ERR_INVALID_PARAM; }

    /* Scan sections for type 0x21 (patch description) */
    int sec_off = text_end + 3;
    int guard = 0;
    while (sec_off + 3 <= data_len && guard++ < 64) {
        uint8_t type = data[sec_off];
        int body_len = (data[sec_off + 1] << 8) | data[sec_off + 2];
        if (type == 0x21) {
            uint8_t *body = data + sec_off + 3;
            if (body_len < 14 || sec_off + 3 + body_len > data_len) { free(data); return G2_ERR_INVALID_PARAM; }
            if (field == 0) {
                /* voices: bits 61-65 (5 bits) */
                body[7] = (body[7] & 0xF8) | ((val >> 2) & 0x07);
                body[8] = (body[8] & 0x3F) | ((val & 0x03) << 6);
            } else {
                /* monopoly: bits 90-91 (2 bits) */
                body[11] = (body[11] & 0xCF) | ((val & 0x03) << 4);
            }
            int ret = g2_set_patch_description(slot, body, body_len);
            free(data);
            return ret;
        }
        sec_off += 3 + body_len;
    }
    free(data);
    g2_err("voice-field: description section (0x21) not found\n");
    return G2_ERR_INVALID_PARAM;
}

int g2_set_voice_mode(int slot, int mode) {
    if (slot < 0 || slot > 3) { g2_err("voice-mode: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (mode < 0 || mode > 3) { g2_err("voice-mode: mode must be 0-3\n"); return G2_ERR_INVALID_PARAM; }
    return set_voice_description_field(slot, 1, mode);
}

int g2_set_voice_count(int slot, int count) {
    if (slot < 0 || slot > 3) { g2_err("voice-count: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (count < 1 || count > 32) { g2_err("voice-count: count must be 1-32\n"); return G2_ERR_INVALID_PARAM; }
    return set_voice_description_field(slot, 0, count);
}

static int get_perf_version(uint8_t *out_version) {
    if (query_version(4, out_version) != G2_OK) { g2_err("No response from G2 for perf version\n"); return G2_ERR; }
    g2_perf_version_cache = *out_version;
    return G2_OK;
}

int g2_set_master_clock_run(int run) {
    if (ensure_connected(0) < 0) { g2_err("set-master-clock-run: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version;
    if (get_perf_version(&version) < 0) return G2_ERR;
    uint8_t cmd[4] = { 0x3F, 0xFF, 0x00, run ? 1 : 0 };
    if (send_system_data(version, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_master_clock_bpm(int bpm) {
    if (bpm < 0 || bpm > 255) { g2_err("set-master-clock-bpm: bpm out of range\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-master-clock-bpm: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version;
    if (get_perf_version(&version) < 0) return G2_ERR;
    uint8_t cmd[4] = { 0x3F, 0xFF, 0x01, (uint8_t)bpm };
    if (send_system_data(version, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

/* Toggles the front panel's Parameter Pages knob-assign SOURCE between Patch and Global — the
 * SHIFT+GLOBAL combo's own command, sub-mode 0x02 of the shared 0x3F opcode (see g2_events.c's
 * 0x3F case for how the confirming capture was made: 2026-08-28, 4 consecutive real SHIFT+GLOBAL
 * presses echoed ff0201/ff0200/ff0201/ff0200 in lockstep). System-wide, not per-slot — mirrors
 * g2_set_master_clock_run/bpm's transport exactly, not the per-slot g2_select_global_page. */
int g2_set_knob_source(int is_global) {
    if (ensure_connected(0) < 0) { g2_err("set-knob-source: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version;
    if (get_perf_version(&version) < 0) return G2_ERR;
    uint8_t cmd[4] = { 0x3F, 0xFF, 0x02, is_global ? 1 : 0 };
    if (send_system_data(version, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

/* Virtual Keyboard note on/off. Payload is just {flag, note} — no slot, no velocity (the protocol
 * doesn't carry one). THE FLAG IS INVERTED FROM THE OBVIOUS READING: 0 sounds the note, 1 releases
 * it. Confirmed against real hardware by ear (other-approaches/G2-Edit's dev log, 2026-08-02) —
 * sending 1-for-on gave a keyboard silent on press, sounding on release. */
int g2_play_note(int note, int on) {
    if (note < 0 || note > 127) { g2_err("play-note: note out of range\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("play-note: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    /* Fire-and-forget with a cached perf version, like the reference (COMMAND_WRITE_NO_RESP): Repeat
     * sends ~8 of these per second, and the daemon runs commands serially, so a per-note version
     * round trip plus a reply wait made the queue grow without bound. */
    uint8_t version = g2_perf_version_cache;
    if (!version && get_perf_version(&version) < 0) return G2_ERR;
    uint8_t cmd[3] = { SUB_COMMAND_PLAY_NOTE, on ? 0 : 1, (uint8_t)note };
    if (send_system_data(version, cmd, 3) < 0) return G2_ERR_SEND;
    return G2_OK;
}

/* Defined further down, next to g2_get_global_knobs; used by g2_get_perf_file below. */
static int get_global_knobs_payload(uint8_t **out, uint16_t *out_len);

/* Locates the section-data region within a raw .pch2/.prf2 buffer:
 * [name][0x00][0x17][0x00][section bytes][2 byte CRC]. Returns 0 on success, -1 if
 * the buffer is too short to contain a valid section (data_len <= 0). */
static int locate_section_data(const uint8_t *data, long fsize, int *name_end, int *data_offset, int *data_len) {
    int ne = 0;
    while (ne < fsize && data[ne]) ne++;
    *name_end = ne;
    *data_offset = ne + 3;   /* skip NUL + 0x17 + 0x00 */
    /* A trailing 2-byte CRC exists only when the section train ends 2 bytes before EOF.
     * Files saved from get-patch carry none: cutting 2 bytes there truncates the last
     * section, and the G2 parses our frame's CRC as patch data, renames the live slots
     * to "Error" and hangs. */
    long pos = *data_offset;
    while (pos + 3 <= fsize) {
        long n = ((long)data[pos + 1] << 8) | data[pos + 2];
        if (pos + 3 + n > fsize) break;
        pos += 3 + n;
    }
    *data_len = (int)fsize - *data_offset - (pos == fsize ? 0 : 2);
    return (*data_len > 0) ? 0 : -1;
}

/* Derives a wire name from a filename's basename, up to the first '.', clamped to
 * `max` characters. `name` must point at a zeroed buffer of at least max+1 bytes.
 * The flash-dump protocol allows a full 16 (the field is NUL-terminated only when
 * shorter - see parse_name); the slot-upload messages keep their 15. Returns the
 * name length. */
static int name_from_filepath(const char *filepath, char *name, int max) {
    const char *base = strrchr(filepath, '/');
    base = base ? base + 1 : filepath;
    /* Strip the extension at the LAST dot, not the first: a patch name may itself
     * contain one ("Burp  NL-X v7.4.pch2"), and cutting at the first dot renamed
     * it to "Burp  NL-X v7" on the device. */
    const char *dot = strrchr(base, '.');
    int limit = dot ? (int)(dot - base) : (int)strlen(base);
    if (limit > max) limit = max;
    int ni = 0;
    while (ni < limit && base[ni]) { name[ni] = base[ni]; ni++; }
    return ni;
}

/* Builds and sends the S_SET_PATCH USB packet for a single slot.
 * Packet: [len_hi][len_lo][0x01][cmd][0x53][0x37][0x00 x3][name+\0][section_data][crc_hi][crc_lo]
 * Version byte 0x53 is hardcoded for S_SET_PATCH (confirmed by the Delphi editor).
 * Name field is variable length: name characters followed by a null byte. */
static int send_patch_upload(int slot, const char *name, int name_len, const uint8_t *section_data, int data_len) {
    /* Dynamic allocation — patch files exceed send_slot's 2048-byte stack buffer. */
    int name_write_len = name_len + 1;  /* name chars + terminating null */
    size_t extraLen = 3 + (size_t)name_write_len + (size_t)data_len;
    size_t totalLen = COMMAND_OFFSET + 4 + extraLen + 2;
    uint8_t *buff = (uint8_t *)calloc(1, totalLen);
    if (!buff) return G2_ERR_NO_MEMORY;

    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SLOT | (uint8_t)slot;
    buff[pos++] = 0x53;  /* fixed version for S_SET_PATCH — not the dynamic patch version */
    buff[pos++] = SUB_COMMAND_SET;  /* 0x37 */
    pos += 3;  /* three zero bytes (calloc) */
    memcpy(buff + pos, name, (size_t)name_write_len);
    pos += name_write_len;
    memcpy(buff + pos, section_data, (size_t)data_len);
    pos += data_len;

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    g2_drain_pending();
    int ret = send_bulk_msg(buff, msgLength);
    free(buff);
    if (ret < 0) return (ret == G2_ERR_TOO_LARGE) ? G2_ERR_TOO_LARGE : G2_ERR_SEND;

    usleep(USB_SEND_DELAY_US * 5);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    g2_drain_pending();
    return G2_OK;
}

/* Reads an open file in full. Returns a malloc'd buffer (caller frees) and its size, or
 * NULL if the file is empty, unreadable or out of memory. */
static uint8_t *read_whole_file(FILE *f, long *fsize) {
    if (fseek(f, 0, SEEK_END) != 0) return NULL;
    long n = ftell(f);
    if (n <= 0 || fseek(f, 0, SEEK_SET) != 0) return NULL;
    uint8_t *data = malloc((size_t)n);
    if (data && fread(data, 1, (size_t)n, f) != (size_t)n) { free(data); data = NULL; }
    *fsize = n;
    return data;
}

int g2_upload_patch(int slot, const char *filepath) {
    if (slot < 0 || slot > 3)    return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    FILE *f = fopen(filepath, "rb");
    if (!f) return G2_ERR_FILE_OPEN;
    long fsize;
    uint8_t *file_data = read_whole_file(f, &fsize);
    fclose(f);
    if (!file_data) return G2_ERR_FILE_OPEN;

    /* pch2 format: [text header][0x00][0x17][0x00][section bytes][2 byte CRC]
     * Use filename (without extension) as the patch name. */
    char name[16] = {0};
    int ni = name_from_filepath(filepath, name, 15);

    int name_end, data_offset, data_len;
    if (locate_section_data(file_data, fsize, &name_end, &data_offset, &data_len) < 0) {
        free(file_data);
        return G2_ERR_PARSE;
    }

    int ret = send_patch_upload(slot, name, ni, file_data + data_offset, data_len);
    free(file_data);
    return ret;
}

/* Same as g2_upload_patch, but takes an already-in-memory pch2 buffer instead of a
 * filepath — used by the daemon's "upload-patch-data" command so the caller (the
 * Electron app) doesn't need to round-trip the patch through a temp file. The wire
 * name is read from the buffer's own leading NUL-terminated bytes (truncated to 15
 * chars), matching the name already embedded there by the caller. */
int g2_upload_patch_buf(int slot, const uint8_t *data, size_t len) {
    if (slot < 0 || slot > 3)    return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    int name_end, data_offset, data_len;
    if (locate_section_data(data, (long)len, &name_end, &data_offset, &data_len) < 0)
        return G2_ERR_PARSE;

    int ni = name_end < 15 ? name_end : 15;
    char name[16] = {0};
    memcpy(name, data, (size_t)ni);

    return send_patch_upload(slot, name, ni, data + data_offset, data_len);
}

/* Builds and sends the S_SET_PATCH performance-upload USB packet (CMD_SYS scope).
 * Performance upload: CMD_SYS (0x2C), version 0x42, subcommand 0x37 (S_SET_PATCH).
 * After the name, the G2 parser expects [$1A][$29][name\0] before the section data
 * (confirmed by Delphi AddMsgSetPerformance in BVE.NMG2Synth.pas). Without it
 * the parser finds 0x11 (C_PERF_SETTINGS) where it expects 0x1A, hanging the G2. */
static int send_perf_upload(const char *name, int name_len, const uint8_t *section_data, int data_len) {
    int name_write_len = name_len + 1;
    size_t extraLen = 3 + (size_t)name_write_len + 2 + (size_t)name_write_len + (size_t)data_len;
    size_t totalLen = COMMAND_OFFSET + 4 + extraLen + 2;
    uint8_t *buff = (uint8_t *)calloc(1, totalLen);
    if (!buff) return G2_ERR_NO_MEMORY;

    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SYS;  /* 0x2C — performance scope */
    buff[pos++] = 0x42;                        /* fixed version for full performance upload */
    buff[pos++] = SUB_COMMAND_SET;             /* 0x37 */
    pos += 3;  /* three zero bytes (calloc) */
    memcpy(buff + pos, name, (size_t)name_write_len);
    pos += name_write_len;
    buff[pos++] = 0x1A;
    buff[pos++] = 0x29;  /* C_PERF_NAME inline header required by G2 parser */
    memcpy(buff + pos, name, (size_t)name_write_len);
    pos += name_write_len;
    memcpy(buff + pos, section_data, (size_t)data_len);
    pos += data_len;

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    g2_drain_pending();
    int ret = send_bulk_msg(buff, msgLength);
    free(buff);
    if (ret < 0) return (ret == G2_ERR_TOO_LARGE) ? G2_ERR_TOO_LARGE : G2_ERR_SEND;

    /* Deliberately does NOT read an ACK, unlike send_patch_upload. Adding a
     * recv_interrupt()+g2_drain_pending() here was tested against real hardware and killed the
     * G2's USB comms every time (dead until a power cycle), where the same upload without it
     * succeeds: in listener mode it steals a packet from the listener thread, and in direct mode
     * it starts reading ~50ms in, while the G2 is still applying all four slots. The caller-side
     * race this was meant to solve is handled in the editor instead — see
     * slots.ts _reloadSlotAfterUpload's retry-with-backoff and its sequential reload loop. */
    /* Let the G2 finish applying all 4 slots before returning. Without an ACK read there is no
     * other completion signal, and the command otherwise reports success while the device is
     * still busy — the next get-patch then fails ("No response from G2 for patch version", then
     * "Failed to send get patch version command"), which is what left slot A stale after
     * Performance → Download. This settle used to run in direct mode only; the editor always
     * uses the daemon, so that is precisely the path that had none. A plain sleep is safe here,
     * unlike the recv_interrupt above: it takes nothing from the listener queue. */
    usleep(PERF_UPLOAD_SETTLE_US);
    if (!g2_listener_active) g2_lock_stream();
    return G2_OK;
}

int g2_upload_perf(const char *filepath) {
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    FILE *f = fopen(filepath, "rb");
    if (!f) return G2_ERR_FILE_OPEN;
    long fsize;
    uint8_t *file_data = read_whole_file(f, &fsize);
    fclose(f);
    if (!file_data) return G2_ERR_FILE_OPEN;

    /* prf2 format: [text header][0x00][0x17][0x00][section bytes][2 byte CRC]
     * Use filename (without extension) as the performance name. */
    char name[16] = {0};
    int ni = name_from_filepath(filepath, name, 15);

    int name_end, data_offset, data_len;
    if (locate_section_data(file_data, fsize, &name_end, &data_offset, &data_len) < 0) {
        free(file_data);
        return G2_ERR_PARSE;
    }

    int ret = send_perf_upload(name, ni, file_data + data_offset, data_len);
    free(file_data);
    return ret;
}

/* Same as g2_upload_perf, but takes an already-in-memory prf2 buffer instead of a
 * filepath — see g2_upload_patch_buf for why. */
int g2_upload_perf_buf(const uint8_t *data, size_t len) {
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    int name_end, data_offset, data_len;
    if (locate_section_data(data, (long)len, &name_end, &data_offset, &data_len) < 0)
        return G2_ERR_PARSE;

    int ni = name_end < 15 ? name_end : 15;
    char name[16] = {0};
    memcpy(name, data, (size_t)ni);

    return send_perf_upload(name, ni, data + data_offset, data_len);
}

cJSON *g2_get_perf_file(const char *filename, int return_bytes) {
    uint8_t *perfData = NULL;
    size_t perfSize = 0;
    uint8_t *pch2Data[4] = {NULL, NULL, NULL, NULL};
    size_t pch2Size[4] = {0, 0, 0, 0};
    uint8_t *knobsData = NULL;
    uint16_t knobsLen = 0;
    uint8_t *outBuf = NULL;
    cJSON *result = NULL;

    if (ensure_connected(1) < 0) {
        g2_err("Failed to connect to G2\n");
        goto cleanup;
    }

    /* Drain stale data (same pattern as g2_get_patch_file) */
    if (!g2_listener_active) g2_drain_quiet(USB_TIMEOUT_STALE_MS, NULL);

    /* Step 1: performance settings raw bytes */
    perfData = perf_settings_bytes(&perfSize);

    if (perfSize < 8) {
        g2_err("Failed to get performance settings\n");
        goto cleanup;
    }

    /* Extract performance name from perfData[4] */
    char perfName[32] = {0};
    int nameLen = parse_name(perfData + 4, perfName, sizeof(perfName));

    /* Step 2: Download all 4 slot patches */
    for (int slot = 0; slot < 4; slot++) {
        g2_err("Fetching patch from slot %c...\n", "ABCD"[slot]);

        /* Tagged reply (fetch_patch, like get-patch): the first extended message can be e.g. a resources_used
         * message instead, which failed the conversion below (2026-10-20, intermittent). */
        uint8_t version;
        uint8_t *patchData;
        uint16_t patchSize;
        char patchName[32];
        if (fetch_patch(slot, &version, &patchData, &patchSize, patchName, sizeof(patchName)) != G2_OK) goto cleanup;

        pch2Data[slot] = malloc(patchSize);
        if (!pch2Data[slot]) { free(patchData); g2_err("Memory allocation failed\n"); goto cleanup; }
        pch2Size[slot] = (size_t)patchSize;
        if (patch_usb_to_pch2(patchData, (size_t)patchSize, pch2Data[slot], &pch2Size[slot]) < 0) {
            free(patchData);
            g2_err("Failed to convert patch for slot %c\n", "ABCD"[slot]);
            goto cleanup;
        }
        free(patchData);
    }

    /* Step 3: Determine output filename (not needed for a bytes-only fetch) */
    char defaultFilename[64];
    if (!return_bytes && filename == NULL) {
        if (strlen(perfName) == 0)
            snprintf(defaultFilename, sizeof(defaultFilename), "performance.prf2");
        else
            snprintf(defaultFilename, sizeof(defaultFilename), "%s.prf2", perfName);
        filename = defaultFilename;
    }

    /* Step 4: Global knob assignments — the .prf2's terminating C_KNOBS_GLOBAL section.
     * On a failed query fall back to the valid "120 slots, none assigned" payload rather
     * than failing the save: a structurally complete file matters more than these 17 bytes
     * (same encoding as the TS side's writeGlobalKnobs([])). */
    static const uint8_t emptyKnobs[17] = {0x00, 0x78};
    if (get_global_knobs_payload(&knobsData, &knobsLen) < 0) {
        knobsData = NULL;
        knobsLen = (uint16_t)sizeof(emptyKnobs);
    }
    const uint8_t *knobs = knobsData ? knobsData : emptyKnobs;

    /* Step 5: Assemble .prf2 file in memory. Layout (matching a real .prf2 and what the G2
     * itself expects back on upload): [0x11 perf settings], then 4 × (that slot's patch
     * section train, each terminated by its own 0x6f), then one 0x5f C_KNOBS_GLOBAL.
     * 0x11 section content = perfData[4 + nameLen + 3 .. perfSize-1].
     * Offset +3 skips 3 unknown header bytes after the name; byte at +3 maps to unknown2
     * and bytes at +4..+10 map to the 8-byte performance settings header fields.
     * The USB response ends with its own 2-byte CRC, which belongs to the transport and not to
     * the section — taking the payload all the way to perfSize left those two bytes inside the
     * 0x11 chunk (verified against a genuine .prf2 of the same performance: 85 bytes vs 83). */
    size_t perf_sect_offset = (size_t)(4 + nameLen + 3);
    size_t perf_sect_len = (perf_sect_offset + 2 < perfSize) ? (perfSize - perf_sect_offset - 2) : 0;
    perf_settings_normalize_slots(perfData + perf_sect_offset, perf_sect_len);

    size_t header_len = strlen(PRF2_TEXT_HEADER) + 3;  /* text header + null + 0x17 + file type */
    size_t sect11_total = 3 + perf_sect_len;   /* [0x11][hi][lo] + data */
    size_t slots_sect_len = 0;
    for (int s = 0; s < 4; s++)
        slots_sect_len += pch2Size[s] + PCH2_CANONICAL_GROWTH;  /* 0x69 may be inserted */
    slots_sect_len += 4 * 3;  /* one 0x6f separator terminating each of the 4 slots */

    outBuf = malloc(header_len + sect11_total + slots_sect_len + 3 + knobsLen + 2);
    if (!outBuf) { g2_err("Memory allocation failed\n"); goto cleanup; }

    size_t pos = 0;

    /* File header: [text header\0][0x17][0x01], as the official editor writes it.
     * 0x17 = format version, 0x01 = file type "performance" (0x00 is a patch). */
    size_t hdrlen = strlen(PRF2_TEXT_HEADER);
    memcpy(outBuf + pos, PRF2_TEXT_HEADER, hdrlen); pos += hdrlen;
    outBuf[pos++] = 0x00;
    outBuf[pos++] = 0x17;
    outBuf[pos++] = 0x01;

    /* CRC covers [version][file type][section bytes] — i.e. it starts two bytes back, at the
     * 0x17, not at the first section. Starting it at the sections left every .prf2 we wrote with
     * a CRC that didn't validate (the TS side computes the same range in buildRawHex). */
    size_t crc_start = pos - 2;

    /* 0x11 performance settings section */
    outBuf[pos++] = 0x11;
    outBuf[pos++] = (uint8_t)((perf_sect_len >> 8) & 0xff);
    outBuf[pos++] = (uint8_t)(perf_sect_len & 0xff);
    if (perf_sect_len > 0) {
        memcpy(outBuf + pos, perfData + perf_sect_offset, perf_sect_len);
        pos += perf_sect_len;
    }

    /* Slot sections, each rewritten into canonical chunk order and terminated by its own 0x6f
     * (C_PATCH_NOTES). The whole pch2 payload is used — its leading 18 bytes are that patch's
     * C_PATCH_DESCR chunk (0x21, see patch_usb_to_pch2), which a performance carries once per
     * slot. patch_slot_sections_canonical may insert a 0x69; the sizing above allows for it. */
    static const uint8_t sep6f[3] = {0x6f, 0x00, 0x00};
    for (int s = 0; s < 4; s++) {
        if (pch2Size[s] > 0) {
            size_t reordered = 0;
            patch_slot_sections_canonical(pch2Data[s], pch2Size[s], outBuf + pos, &reordered);
            pos += reordered;
        }
        memcpy(outBuf + pos, sep6f, 3);
        pos += 3;
    }

    /* 0x5f C_KNOBS_GLOBAL terminator */
    outBuf[pos++] = 0x5f;
    outBuf[pos++] = (uint8_t)((knobsLen >> 8) & 0xff);
    outBuf[pos++] = (uint8_t)(knobsLen & 0xff);
    memcpy(outBuf + pos, knobs, knobsLen);
    pos += knobsLen;

    /* CRC over all section bytes */
    uint16_t crc = calc_crc16(outBuf + crc_start, pos - crc_start);
    outBuf[pos++] = (uint8_t)((crc >> 8) & 0xff);
    outBuf[pos++] = (uint8_t)(crc & 0xff);

    if (return_bytes) {
        /* Hex, not base64: matches every other command's "data" field (e.g.
         * g2_get_patch above), which the TS side already consumes as a hex string
         * throughout the patch/performance pipeline (rawHex, serializePerformance, …). */
        char *hexStr = malloc(pos * 2 + 1);
        if (!hexStr) { g2_err("Memory allocation failed\n"); goto cleanup; }
        for (size_t i = 0; i < pos; i++) snprintf(hexStr + i * 2, 3, "%02x", outBuf[i]);
        hexStr[pos * 2] = '\0';
        result = cJSON_CreateObject();
        cJSON_AddStringToObject(result, "name", perfName);
        cJSON_AddNumberToObject(result, "size", (int)pos);
        cJSON_AddStringToObject(result, "data", hexStr);
        free(hexStr);
    } else {
        FILE *f = fopen(filename, "wb");
        if (!f) { g2_err("Failed to open file '%s' for writing\n", filename); goto cleanup; }
        size_t written = fwrite(outBuf, 1, pos, f);
        fclose(f);
        if (written != pos) { g2_err("Failed to write complete file\n"); goto cleanup; }

        result = cJSON_CreateObject();
        cJSON_AddStringToObject(result, "file", filename);
        cJSON_AddStringToObject(result, "name", perfName);
        cJSON_AddNumberToObject(result, "size", (int)pos);
    }

cleanup:
    free(perfData);
    for (int s = 0; s < 4; s++) free(pch2Data[s]);
    free(knobsData);
    free(outBuf);
    return result;
}

int g2_copy_variation(int slot, int from_var, int to_var) {
    if (slot < 0 || slot > 3)         { g2_err("copy-variation: invalid slot\n");     return G2_ERR_INVALID_PARAM; }
    if (from_var < 0 || from_var > 8) { g2_err("copy-variation: from must be 0-8\n"); return G2_ERR_INVALID_PARAM; }
    if (to_var < 0 || to_var > 8)     { g2_err("copy-variation: to must be 0-8\n");   return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0)      { g2_err("copy-variation: not connected\n");    return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t payload[2] = { (uint8_t)from_var, (uint8_t)to_var };
    if (send_slot(slot, version, 0x44, payload, 2) < 0) {
        g2_err("copy-variation: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

/* Shared frame builder for the WRITE_NO_RESP subcommands below (set-param, select-param,
 * set-morph-range): packs the COMMAND_WRITE_NO_RESP|COMMAND_SLOT header, subcmd byte and
 * payload, appends the CRC, and sends via libusb_bulk_transfer. No recv_interrupt — callers
 * deliberately avoid send_slot()/COMMAND_REQ, whose ack would churn the connection on
 * high-frequency writes (turning a knob, moving the panel cursor, etc). */
static int send_write_no_resp(int slot, uint8_t version, uint8_t subcmd,
                               const uint8_t *payload, int len) {
    uint8_t buff[2048] = {0};
    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_WRITE_NO_RESP | COMMAND_SLOT | (uint8_t)slot;
    buff[pos++] = version;
    buff[pos++] = subcmd;
    memcpy(&buff[pos], payload, (size_t)len);
    pos += len;

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;
    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    g2_trace('>', buff, msgLength);
    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff,
                                   msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    return (ret < 0) ? G2_ERR_SEND : G2_OK;
}

int g2_set_param(int slot, int location, int module_id,
                 int param_idx, int value, int variation) {
    if (slot < 0 || slot > 3)             { g2_err("set-param: invalid slot\n");        return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 2)     { g2_err("set-param: invalid location\n");    return G2_ERR_INVALID_PARAM; }
    if (module_id < 0 || module_id > 255) { g2_err("set-param: invalid module-id\n");   return G2_ERR_INVALID_PARAM; }
    if (param_idx < 0 || param_idx > 255) { g2_err("set-param: invalid param-idx\n");   return G2_ERR_INVALID_PARAM; }
    if (variation < 0 || variation > 9)   { g2_err("set-param: variation must be 0-9\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0)          { g2_err("set-param: not connected\n");       return G2_ERR_CONNECT; }

    uint8_t version = cable_get_version(slot);

    /* Deliberately NOT sent via send_slot()/COMMAND_REQ: the G2 treats a
     * COMMAND_REQ set-param as a structural patch edit, bumping the patch
     * version and emitting an error/ack on every single write — turning a
     * knob then floods patch_version_change + error events and destabilizes
     * the connection. COMMAND_WRITE_NO_RESP is required for this subcommand. */
    uint8_t payload[5] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)param_idx,
                           (uint8_t)value, (uint8_t)variation };
    return send_write_no_resp(slot, version, 0x40 /* SUB_COMMAND_SET_PARAM */, payload, 5);
}

int g2_select_param(int slot, int location, int module_id, int param_idx) {
    if (slot < 0 || slot > 3)             { g2_err("select-param: invalid slot\n");        return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 2)     { g2_err("select-param: invalid location\n");    return G2_ERR_INVALID_PARAM; }
    if (module_id < 0 || module_id > 255) { g2_err("select-param: invalid module-id\n");   return G2_ERR_INVALID_PARAM; }
    if (param_idx < 0 || param_idx > 255) { g2_err("select-param: invalid param-idx\n");   return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0)          { g2_err("select-param: not connected\n");       return G2_ERR_CONNECT; }

    uint8_t version = cable_get_version(slot);

    /* Same category as g2_set_param: this moves the hardware panel's cursor on every
     * keyboard nav, so it must NOT go through send_slot()/COMMAND_REQ (which acks and
     * would churn the connection on rapid arrow-key repeats) — COMMAND_WRITE_NO_RESP. */
    uint8_t payload[4] = { 0x00, (uint8_t)location, (uint8_t)module_id, (uint8_t)param_idx };
    return send_write_no_resp(slot, version, SUB_COMMAND_SEL_PARAM, payload, 4);
}

int g2_set_morph_range(int slot, int location, int module_id, int param_idx,
                        int morph_group, int range, int variation) {
    if (slot < 0 || slot > 3)             { g2_err("set-morph-range: invalid slot\n");        return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)     { g2_err("set-morph-range: invalid location\n");    return G2_ERR_INVALID_PARAM; }
    if (module_id < 0 || module_id > 255) { g2_err("set-morph-range: invalid module-id\n");   return G2_ERR_INVALID_PARAM; }
    if (param_idx < 0 || param_idx > 255) { g2_err("set-morph-range: invalid param-idx\n");   return G2_ERR_INVALID_PARAM; }
    if (morph_group < 0 || morph_group > 7) { g2_err("set-morph-range: invalid morph-group\n"); return G2_ERR_INVALID_PARAM; }
    if (range < -127 || range > 127)      { g2_err("set-morph-range: range must be -127..127\n"); return G2_ERR_INVALID_PARAM; }
    if (variation < 0 || variation > 9)   { g2_err("set-morph-range: variation must be 0-9\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0)          { g2_err("set-morph-range: not connected\n");       return G2_ERR_CONNECT; }

    uint8_t version = cable_get_version(slot);
    uint8_t magnitude = (uint8_t)(range < 0 ? -range : range);
    uint8_t negative = (uint8_t)(range < 0 ? 1 : 0);

    /* Same category as g2_set_param: the Delphi reference sends S_SET_MORPH_RANGE via its
     * "responseless" table, not the acked/COMMAND_REQ path — so this must NOT go through
     * send_slot() (which always sets COMMAND_REQ). */
    uint8_t payload[7] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)param_idx,
                           (uint8_t)morph_group, magnitude, negative, (uint8_t)variation };
    return send_write_no_resp(slot, version, SUB_COMMAND_SET_MORPH_RANGE, payload, 7);
}

int g2_set_morph_range_batch(int slot, const G2MorphEntry *entries, int count) {
    if (count <= 0) return G2_OK;
    for (int i = 0; i < count; i++) {
        int ret = g2_set_morph_range(slot, entries[i].location, entries[i].module_id,
                                      entries[i].param_idx, entries[i].morph_group,
                                      entries[i].range, entries[i].variation);
        if (ret != G2_OK) return ret;
    }
    return G2_OK;
}

int g2_assign_midicc(int slot, int location, int module_id, int param_idx, int cc_num) {
    if (slot < 0 || slot > 3)           return G2_ERR_INVALID_PARAM;
    if (location < 0 || location > 2)   return G2_ERR_INVALID_PARAM;
    if (cc_num < 0 || cc_num > 119)     return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)        return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload[4] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)param_idx, (uint8_t)cc_num };
    return send_slot((uint8_t)slot, version, 0x22, payload, 4) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_deassign_midicc(int slot, int cc_num) {
    if (slot < 0 || slot > 3)       return G2_ERR_INVALID_PARAM;
    if (cc_num < 0 || cc_num > 119) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)    return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t cc_byte = (uint8_t)cc_num;
    return send_slot((uint8_t)slot, version, 0x23, &cc_byte, 1) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_assign_midicc_batch(int slot, const G2MidiCCEntry *entries, int count) {
    if (slot < 0 || slot > 3)    return G2_ERR_INVALID_PARAM;
    if (count <= 0)               return G2_OK;
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t entry_bufs[count][4];
    G2Op ops[count];
    for (int i = 0; i < count; i++) {
        entry_bufs[i][0] = (uint8_t)entries[i].location;
        entry_bufs[i][1] = (uint8_t)entries[i].module_id;
        entry_bufs[i][2] = (uint8_t)entries[i].param_idx;
        entry_bufs[i][3] = (uint8_t)entries[i].cc_num;
        ops[i].cmd     = 0x22;
        ops[i].payload = entry_bufs[i];
        ops[i].len     = 4;
    }
    return send_slot_batch((uint8_t)slot, version, ops, count) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_deassign_midicc_batch(int slot, const int *cc_nums, int count) {
    if (slot < 0 || slot > 3)    return G2_ERR_INVALID_PARAM;
    if (count <= 0)               return G2_OK;
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t cc_bytes[count];
    G2Op ops[count];
    for (int i = 0; i < count; i++) {
        cc_bytes[i]    = (uint8_t)cc_nums[i];
        ops[i].cmd     = 0x23;
        ops[i].payload = &cc_bytes[i];
        ops[i].len     = 1;
    }
    return send_slot_batch((uint8_t)slot, version, ops, count) < 0 ? G2_ERR_SEND : G2_OK;
}

void g2_build_assign_knob_op(G2Op *op, uint8_t *buf, int loc, int module_id, int param_idx, int slot_index, int is_led) {
    /* Delphi writes location as a 2-bit field followed by 6 pad bits, MSB-first (TBitWriter buffers
     * a Byte), so the third byte is location<<6 — NOT the bare location value like MIDI CC's.
     * The next 2 bits are the target type (Delphi/G2Editor.c EDeviceAssignType: 0=param, 1=LED/level
     * meter); for a level meter param_idx is the LED number, not a param index. */
    buf[0]=(uint8_t)module_id; buf[1]=(uint8_t)param_idx; buf[2]=(uint8_t)((loc << 6) | (is_led << 4));
    buf[3]=0x00; buf[4]=(uint8_t)slot_index;
    op->cmd=SUB_COMMAND_ASSIGN_KNOB; op->payload=buf; op->len=5;
}

void g2_build_deassign_knob_op(G2Op *op, uint8_t *buf, int slot_index) {
    buf[0]=0x00; buf[1]=(uint8_t)slot_index;
    op->cmd=SUB_COMMAND_DEASSIGN_KNOB; op->payload=buf; op->len=2;
}

/* Parameter Pages knob assignment (S_ASSIGN_KNOB=0x25 / S_DEASSIGN_KNOB=0x26). slot_index is the
 * knob's address 0-119 (3 Banks x 5 Pages x 8 Knobs — see g2-editor/src/renderer/paramPages.ts).
 * Same acked COMMAND_REQ envelope as MIDI CC assign (send_slot), NOT the raw WRITE_NO_RESP
 * envelope used by g2_set_morph_range. Payload layout is a best-effort inference from the Delphi
 * reference editor (BVE.NMG2Mess.pas AddAssignKnobMessage/AddDeAssignKnobMessage) cross-checked
 * against decompiled G2Editor.c opcodes. Confirmed on real hardware (2026-08-28) to be accepted
 * without error, but the front panel never echoes 0x25/0x26 back (see g2_events.c's 0x74 case),
 * and it does not reject bad fields either (no ack of validity) — so verify assigns via get-patch.
 * Unlike the reference editor's compound message (deassign old knob, deassign occupant, assign,
 * select page), this sends only the bare assign; the editor deassigns the param's old knob first
 * (see assignParamToPage) but does not explicitly clear an occupied target knob. */
int g2_assign_knob(int slot, int location, int module_id, int param_idx, int slot_index, int is_led) {
    if (slot < 0 || slot > 3)               return G2_ERR_INVALID_PARAM;
    if (location < 0 || location > 2)       return G2_ERR_INVALID_PARAM; /* 2 = patch: Morph Group dials (PATCH_MORPH module 1) */
    if (module_id < 0 || module_id > 255)   return G2_ERR_INVALID_PARAM;
    if (param_idx < 0 || param_idx > 255)   return G2_ERR_INVALID_PARAM;
    if (slot_index < 0 || slot_index > 119) return G2_ERR_INVALID_PARAM;
    if (is_led < 0 || is_led > 1)           return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)            return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload[5]; G2Op op;
    g2_build_assign_knob_op(&op, payload, location, module_id, param_idx, slot_index, is_led);
    if (g2_debug) {
        printf("{\"debug\":\"assign_knob\",\"slot\":%d,\"version\":%u,\"location\":%d,\"module\":%d,\"param\":%d,\"knob\":%d,\"led\":%d}\n",
               slot, version, location, module_id, param_idx, slot_index, is_led);
        fflush(stdout);
    }
    return send_slot((uint8_t)slot, version, op.cmd, op.payload, (size_t)op.len) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_deassign_knob(int slot, int slot_index) {
    if (slot < 0 || slot > 3)               return G2_ERR_INVALID_PARAM;
    if (slot_index < 0 || slot_index > 119) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)            return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload[2]; G2Op op;
    g2_build_deassign_knob_op(&op, payload, slot_index);
    if (g2_debug) {
        printf("{\"debug\":\"deassign_knob\",\"slot\":%d,\"version\":%u,\"knob\":%d}\n", slot, version, slot_index);
        fflush(stdout);
    }
    return send_slot((uint8_t)slot, version, op.cmd, op.payload, (size_t)op.len) < 0 ? G2_ERR_SEND : G2_OK;
}

/* Select the front-panel Parameter Page (S_SEL_PARAM_PAGE=0x2d). CONFIRMED on real hardware
 * (2026-08-28, both directions round-tripping with the editor). Unlike the knob assign/deassign
 * pair above, the layout was solid before that too: the decompiled Clavia editor writes exactly [0x2d][page_id]
 * (G2Editor.c CMParameterPageFocus::WriteStream) and packs the two selectors with
 * page_id = page*3 + bank (G2Demo.c GetPageId; decoder G2Editor.c SetFocusedParameterPage, which
 * silently ignores anything >= 15 — so reject that here rather than sending a no-op). There is no
 * separate Bank opcode: changing only the Bank means re-sending the whole page_id. The G2 echoes
 * this same sub-command back when the page is changed from the front panel (see g2_events.c). */
int g2_select_param_page(int slot, int page_id) {
    if (slot < 0 || slot > 3)          return G2_ERR_INVALID_PARAM;
    if (page_id < 0 || page_id > 14)   return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)       return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload = (uint8_t)page_id;
    return send_slot((uint8_t)slot, version, SUB_COMMAND_SEL_PARAM_PAGE, &payload, 1) < 0 ? G2_ERR_SEND : G2_OK;
}

/* Request the current Parameter Page (Q_PARAM_PAGE=0x58). Decompiled Clavia editor:
 * CMParameterPageFocusRequest::WriteStream is Initialize(0x58, 2 [request class], 1), sent by
 * CPatch::CleanDirtyData right after the patch-header request. Fire-and-forget: the answer is
 * the same 0x2D message the front panel emits on a page press (see g2_events.c). */
int g2_request_param_page(int slot) {
    if (slot < 0 || slot > 3)          return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)       return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    return send_slot((uint8_t)slot, version, SUB_COMMAND_GET_PARAM_PAGE, NULL, 0) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_request_global_page(int slot) {
    if (slot < 0 || slot > 3)          return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)       return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    return send_slot((uint8_t)slot, version, SUB_COMMAND_GET_GLOBAL_PAGE, NULL, 0) < 0 ? G2_ERR_SEND : G2_OK;
}

void g2_build_assign_global_knob_op(G2Op *op, uint8_t *buf, int target_slot, int loc, int module_id, int param_idx, int slot_index) {
    buf[0]=(uint8_t)((target_slot << 4) | (loc << 2)); buf[1]=(uint8_t)module_id; buf[2]=(uint8_t)param_idx;
    buf[3]=0x00; buf[4]=(uint8_t)slot_index;
    op->cmd=SUB_COMMAND_ASSIGN_GLOBAL_KNOB; op->payload=buf; op->len=5;
}

void g2_build_deassign_global_knob_op(G2Op *op, uint8_t *buf, int slot_index) {
    buf[0]=0x00; buf[1]=(uint8_t)slot_index;
    op->cmd=SUB_COMMAND_DEASSIGN_GLOBAL_KNOB; op->payload=buf; op->len=2;
}

/* Global Parameter Pages knob assignment (S_ASS_GLOBAL_KNOB=0x1c / S_DEASS_GLOB_KNOB=0x1d).
 * Mirrors g2_assign_knob/g2_deassign_knob above, with one difference: the payload's first byte
 * folds in a 4-bit target-slot nibble (which patch's module the knob controls) alongside the
 * 2-bit location, per the Delphi reference (BVE.NMG2Mess.pas AddAssignGlobalKnobMessage:
 * slotIndex(4) location(2) unused(2), module(8), param(8), unused(8), knobIndex(8)). `slot` is
 * only the transport/routing slot the command rides on — any of the 4 works interchangeably.
 * UNVERIFIED against real hardware — worth a spot-check before trusting field-level semantics. */
int g2_assign_global_knob(int slot, int target_slot, int location, int module_id, int param_idx, int slot_index) {
    if (slot < 0 || slot > 3)               return G2_ERR_INVALID_PARAM;
    if (target_slot < 0 || target_slot > 3) return G2_ERR_INVALID_PARAM;
    if (location < 0 || location > 2)       return G2_ERR_INVALID_PARAM; /* 2 = patch: Morph Group dials (PATCH_MORPH module 1) */
    if (module_id < 0 || module_id > 255)   return G2_ERR_INVALID_PARAM;
    if (param_idx < 0 || param_idx > 255)   return G2_ERR_INVALID_PARAM;
    if (slot_index < 0 || slot_index > 119) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)            return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload[5]; G2Op op;
    g2_build_assign_global_knob_op(&op, payload, target_slot, location, module_id, param_idx, slot_index);
    return send_slot((uint8_t)slot, version, op.cmd, op.payload, (size_t)op.len) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_deassign_global_knob(int slot, int slot_index) {
    if (slot < 0 || slot > 3)               return G2_ERR_INVALID_PARAM;
    if (slot_index < 0 || slot_index > 119) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)            return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload[2]; G2Op op;
    g2_build_deassign_global_knob_op(&op, payload, slot_index);
    return send_slot((uint8_t)slot, version, op.cmd, op.payload, (size_t)op.len) < 0 ? G2_ERR_SEND : G2_OK;
}

/* Select the active Global Parameter Page (S_SEL_GLOBAL_PAGE=0x1e) — Global Pages sibling of
 * g2_select_param_page. Same page_id packing (page*3 + bank, 0-14). See g2_assign_global_knob
 * above for the UNVERIFIED-against-hardware caveat; the Delphi reference itself never implements
 * the receive/echo side of this opcode either. */
int g2_select_global_page(int slot, int page_id) {
    if (slot < 0 || slot > 3)          return G2_ERR_INVALID_PARAM;
    if (page_id < 0 || page_id > 14)   return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)       return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload = (uint8_t)page_id;
    return send_slot((uint8_t)slot, version, SUB_COMMAND_SEL_GLOBAL_PAGE, &payload, 1) < 0 ? G2_ERR_SEND : G2_OK;
}

/* Bulk fetch of the Global Parameter Pages assignment list (Q_GLOBAL_KNOBS=0x5e request,
 * C_KNOBS_GLOBAL=0x5f response chunk). Opcodes confirmed against the decompiled Clavia editor
 * (CMPerfKnobMapRequest sends 0x5e; CMPerformanceKnobMapDump, molecule id 0x5f, is the response
 * — its ReadStream delegates to the SAME NSFile_V11::CKnobMapData_11 class the per-patch $62
 * section uses, just constructed with an internal "isGlobal" flag, confirming
 * parseGlobalKnobsChunk's extra-slot-field design). System-wide, NOT per-slot: unlike
 * g2_get_patch's SUB_COMMAND_GET_PATCH_SLOT, CMPerfKnobMapRequest::WriteStream initializes with
 * scope=2 (system) — the same scope byte as query_synth_settings's SUB_COMMAND_GET_SYNTH_SETTINGS
 * and CMGlobalParameterPageFocusRequest (0x59) — not scope=0 (slot), so this mirrors
 * query_synth_settings's send_system()+extended-response transport, not g2_get_patch's
 * send_slot()+per-patch-version one. Flushes stale EP 0x81 data before sending (like g2_get_patch)
 * and validates the response's tag byte with a bounded discard-and-retry loop (like
 * get_patch_text's SUB_RESPONSE_PATCH_NOTES check) — a stray leftover bulk transfer from a
 * preceding operation would otherwise be silently misread as this chunk. Same envelope shape as
 * that SUB_RESPONSE_PATCH_NOTES bulk branch too: [0..2] header, [3]=response tag (checked below),
 * [4..5]=payload length (big-endian), [6..]=the actual C_KNOBS_GLOBAL bytes — so those 6 bytes are
 * stripped before hex-encoding under "data", letting the TS side feed it straight into
 * parseGlobalKnobsChunk. Not run through patch_usb_to_pch2 — that conversion strips a whole-patch
 * header/CRC wrapper this single section-chunk reply doesn't carry; it needs its own, smaller
 * envelope strip instead (above). The stripped payload goes into a malloc'd buffer the caller
 * frees — shared by g2_get_global_knobs, which hex-encodes it for the editor, and
 * g2_get_perf_file, which embeds it as the .prf2's terminating 0x5f section. */
static int get_global_knobs_payload(uint8_t **out, uint16_t *out_len) {
    uint8_t interruptResp[16] = {0};
    int ret;

    *out = NULL;
    *out_len = 0;

    if (ensure_connected(1) < 0) {
        g2_err("Failed to connect to G2\n");
        return -1;
    }

    /* Flush stale G2 data left over from a previous command (direct mode only — the listener
     * thread drains EP 0x81 continuously, so no flush needed then). Mirrors g2_get_patch. */
    if (!g2_listener_active) g2_drain_quiet(USB_TIMEOUT_STALE_MS, NULL);

    if (send_system(0x41, SUB_COMMAND_GET_GLOBAL_KNOBS) < 0) {
        g2_err("Failed to send get-global-knobs command\n");
        return -1;
    }

    usleep(USB_SEND_DELAY_US);

    /* Discard-and-retry until a response tagged C_KNOBS_GLOBAL (0x5f) at byte[3] arrives, or we
     * give up — same lockstep-ish pattern as get_patch_text, since a straggler from a preceding
     * operation can still be in flight when our request's answer arrives. */
    for (int attempt = 0; attempt < 5; attempt++) {
        ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret <= 0) {
            g2_err("No interrupt response for global knobs\n");
            return -1;
        }
        if ((interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) continue;

        uint16_t chunkSize = (interruptResp[1] << 8) | interruptResp[2];
        if (chunkSize == 0) continue;
        uint8_t *chunkData = malloc(chunkSize);
        if (!chunkData) {
            g2_err("Memory allocation failed\n");
            return -1;
        }
        ret = recv_bulk(chunkData, chunkSize);
        if (ret <= 0 || chunkSize < 6 || chunkData[3] != RESP_CHUNK_KNOBS_GLOBAL) {
            free(chunkData);
            continue;
        }

        /* Strip the envelope: [4..5] is the payload's own big-endian length, clamped to what we
         * actually received, same as get_patch_text's textLen handling. */
        uint16_t payloadLen = ((uint16_t)chunkData[4] << 8) | chunkData[5];
        if (payloadLen > (uint16_t)(chunkSize - 6)) payloadLen = (uint16_t)(chunkSize - 6);

        uint8_t *payload = malloc(payloadLen ? payloadLen : 1);
        if (!payload) {
            free(chunkData);
            g2_err("Memory allocation failed\n");
            return -1;
        }
        memcpy(payload, chunkData + 6, payloadLen);
        free(chunkData);
        *out = payload;
        *out_len = payloadLen;
        return 0;
    }

    g2_err("No matching response for global knobs after retries\n");
    return -1;
}

cJSON *g2_get_global_knobs(void) {
    uint8_t *payload;
    uint16_t payloadLen;
    if (get_global_knobs_payload(&payload, &payloadLen) < 0) return NULL;

    cJSON *root = cJSON_CreateObject();
    char *hexStr = malloc((size_t)payloadLen * 2 + 1);
    if (hexStr) {
        for (size_t i = 0; i < payloadLen; i++) {
            snprintf(hexStr + i * 2, 3, "%02x", payload[i]);
        }
        hexStr[(size_t)payloadLen * 2] = '\0';
        cJSON_AddStringToObject(root, "data", hexStr);
        free(hexStr);
    }
    free(payload);
    return root;
}

/* GET_RESOURCES_USED (0x71): query FX (loc=0) then VA (loc=1) and return a
 * plain JSON array matching the "data" field of the resources_used watch event:
 * [loc][27 bytes][0x72 sub-cmd][loc][27 bytes] (57 bytes compound packet).
 * Falls back to FX-only (28 bytes) if the VA query fails. */
cJSON *g2_get_resources(const char *slot_str) {
    uint8_t interruptResp[16] = {0};
    uint8_t version;
    int ret;

    if (ensure_connected(1) < 0) { g2_err("Failed to connect to G2\n"); return NULL; }

    int slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) { g2_err("Invalid slot: %s\n", slot_str); return NULL; }

    /* Get patch version */
    ret = query_version(slot, &version);
    if (ret == G2_ERR_SEND) { g2_err("Failed to get version\n"); return NULL; }
    if (ret != G2_OK) { g2_err("No version response\n"); return NULL; }

    /* Query FX area (loc=0) */
    uint8_t loc = 0;
    if (send_slot(slot, version, 0x71, &loc, 1) < 0) { g2_err("Failed to send get-resources\n"); return NULL; }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response for get-resources\n"); return NULL;
    }

    uint16_t fxBulkSize = ((uint16_t)interruptResp[1] << 8) | interruptResp[2];
    if (fxBulkSize < 6) { g2_err("get-resources: FX bulk too small\n"); return NULL; }
    uint8_t *fxBulk = malloc(fxBulkSize);
    if (!fxBulk) { g2_err("Memory allocation failed\n"); return NULL; }

    int fxRet = recv_bulk(fxBulk, fxBulkSize);
    if (fxRet < 6) { free(fxBulk); g2_err("Failed to read resources FX bulk\n"); return NULL; }
    int fxDataEnd = fxRet - 2;  /* strip 2-byte CRC */

    cJSON *arr = cJSON_CreateArray();

    /* Query VA area (loc=1) and build compound packet if successful */
    uint8_t loc1 = 1;
    if (send_slot(slot, version, 0x71, &loc1, 1) == 0) {
        usleep(USB_SEND_DELAY_US);
        uint8_t vaInterrupt[16] = {0};
        int ret2 = recv_interrupt(vaInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret2 > 0 && (vaInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t vaBulkSize = ((uint16_t)vaInterrupt[1] << 8) | vaInterrupt[2];
            if (vaBulkSize >= 6) {
                uint8_t *vaBulk = malloc(vaBulkSize);
                if (vaBulk) {
                    int vaRet = recv_bulk(vaBulk, vaBulkSize);
                    if (vaRet >= 6) {
                        int vaDataEnd = vaRet - 2;
                        for (int i = 4; i < fxDataEnd; i++)
                            cJSON_AddItemToArray(arr, cJSON_CreateNumber(fxBulk[i]));
                        cJSON_AddItemToArray(arr, cJSON_CreateNumber(0x72));
                        for (int i = 4; i < vaDataEnd; i++)
                            cJSON_AddItemToArray(arr, cJSON_CreateNumber(vaBulk[i]));
                        free(vaBulk);
                        free(fxBulk);
                        return arr;
                    }
                    free(vaBulk);
                }
            }
        }
    }

    /* Fall back: return FX data only */
    for (int i = 4; i < fxDataEnd; i++)
        cJSON_AddItemToArray(arr, cJSON_CreateNumber(fxBulk[i]));
    free(fxBulk);
    return arr;
}

/* Sets one per-slot byte of the performance settings: 0 = active, 1 = key, 2 = hold.
 * Deselecting the slot that has the keyboard hands the keyboard to the first slot still
 * selected, in the same write (reference editor: CPerformance::SetSlotSelection). */
static int g2_set_slot_perf_field(int slot_idx, int field_offset, int value) {
    if (slot_idx < 0 || slot_idx > 3) { g2_err("set-slot-perf: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-slot-perf: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    perf_settings_t ps;
    int ret = perf_settings_read(&ps);
    if (ret != G2_OK) return ret;
    ps.slot[slot_idx][field_offset] = (uint8_t)(value & 0xFF);
    if (field_offset == 0 && !value && (ps.slot[slot_idx][1] & 1)) {
        ps.slot[slot_idx][1] = 0;
        for (int i = 0; i < 4; i++) {
            if (i != slot_idx && (ps.slot[i][0] & 1)) { ps.slot[i][1] = 1; break; }
        }
    }
    return perf_settings_write(&ps);
}

int g2_set_slot_enabled(int slot_idx, int value) {
    return g2_set_slot_perf_field(slot_idx, 0, value);
}

int g2_set_slot_key(int slot_idx, int value) {
    return g2_set_slot_perf_field(slot_idx, 1, value);
}

int g2_set_slot_hold(int slot_idx, int value) {
    return g2_set_slot_perf_field(slot_idx, 2, value);
}

int g2_set_slot_range(int slot_idx, int lower, int upper) {
    if (slot_idx < 0 || slot_idx > 3) { g2_err("set-slot-range: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-slot-range: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    perf_settings_t ps;
    int ret = perf_settings_read(&ps);
    if (ret != G2_OK) return ret;
    ps.slot[slot_idx][5] = (uint8_t)(lower & 0xFF);
    ps.slot[slot_idx][6] = (uint8_t)(upper & 0xFF);
    return perf_settings_write(&ps);
}

/* Modify a single byte of the C_PERF_SETTINGS chunk (chunk[offset]):
 * chunk[5]=rangeEnable (KB Split) */
static int g2_set_perf_header_byte(int offset, int value) {
    if (ensure_connected(0) < 0) { g2_err("set-perf-header: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    perf_settings_t ps;
    int ret = perf_settings_read(&ps);
    if (ret != G2_OK) return ret;
    ps.chunk[offset] = (uint8_t)(value & 0xFF);
    return perf_settings_write(&ps);
}

int g2_set_rangeEnable(int value) { return g2_set_perf_header_byte(5, value); }

/* Select a slot, activating it if it is currently inactive.
 * Sends SET_PERF_SETTINGS to enable/key the target and disable/unkey the
 * currently-focused slot, then sends SELECT_SLOT (0x09).
 * If the target slot is already active, skips the perf settings write. */
int g2_switch_slot(const char *slot_str) {
    int target = parse_slot(slot_str);
    if (target < 0 || target > 3) { g2_err("switch-slot: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;
    g2_drain_pending();

    perf_settings_t ps;
    int ret = perf_settings_read(&ps);
    if (ret != G2_OK) return ret;

    /* Fast path: slot already active — just focus it */
    if (ps.slot[target][0] & 1) { g2_msg_free(&ps.msg); return g2_select_slot(slot_str); }

    /* Activate and key the target slot, deactivate and unkey the currently-focused one.
     * chunk[4] = FUnknown3(4b)|FSelectedSlot(2b)|FUnknown4(2b). */
    int focused = (ps.chunk[4] >> 2) & 0x3;
    ps.slot[target][0] = 1;
    ps.slot[target][1] = 1;
    if (focused != target) {
        ps.slot[focused][0] = 0;
        ps.slot[focused][1] = 0;
    }
    ret = perf_settings_write(&ps);
    if (ret != G2_OK) return ret;

    /* Step 5: SELECT_SLOT (0x09) — send directly, no GET_PATCH_VERSION.
     * In daemon mode, perf_settings_update sits in the queue after the ACK;
     * g2_select_slot's recv_interrupt would pop it instead of the version
     * response, leaving that response orphaned as a spurious patch_version event.
     * Delphi never queries GET_PATCH_VERSION before SELECT_SLOT; 0x41 is
     * accepted unconditionally by the G2 for this command. */
    uint8_t sel[2] = {0x09, (uint8_t)target};
    if (send_system_data(0x41, sel, 2) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    if (!g2_listener_active) g2_drain_pending();
    return G2_OK;
}

/* Send Controller Snapshot - sends all MIDI CC values for all slots to MIDI OUT
 * Uses opcode 0x55 (S_CTRL_SNAPSHOT). This is a slot-scoped command that needs to be
 * sent to each active slot. Based on Delphi code: AddMsgControllerSnapshot writes 0x55. */
int g2_send_controller_snapshot(void) {
    if (ensure_connected(0) < 0) { g2_err("send-controller-snapshot: not connected\n"); return G2_ERR_CONNECT; }
    
    /* Send to all slots A-D. The G2 will send all controller values to MIDI OUT. */
    for (int slot = 0; slot < 4; slot++) {
        uint8_t version = cable_get_version(slot);
        /* Skip slots with version 0 (empty/uninitialized) - the G2 rejects commands with version 0 */
        if (version == 0) {
            g2_err("send-controller-snapshot: skipping slot %c (version not initialized)\n", 'A' + slot);
            continue;
        }
        /* No additional payload for controller snapshot - just the subcommand */
        if (send_slot((uint8_t)slot, version, SUB_COMMAND_CTRL_SNAPSHOT, NULL, 0) < 0) {
            g2_err("send-controller-snapshot: failed to send to slot %c\n", 'A' + slot);
            return G2_ERR_SEND;
        }
        usleep(USB_SEND_DELAY_US);
    }
    if (!g2_listener_active) g2_drain_pending();
    return G2_OK;
}

/* Dump Patch as MIDI SYSEX - transmits complete patch in slot as SYSEX dump
 * Uses opcode 0x3D (S_MIDI_DUMP). Based on C++ decompilation: CMDumpOneRequest::WriteStream
 * initializes with 0x3d. This is a slot-scoped command. */
int g2_dump_patch(int slot) {
    if (slot < 0 || slot > 3) { g2_err("dump-patch: invalid slot, expected 0-3\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("dump-patch: not connected\n"); return G2_ERR_CONNECT; }
    
    uint8_t version = cable_get_version(slot);
    /* Skip if version is 0 (empty/uninitialized slot) - the G2 rejects commands with version 0 */
    if (version == 0) {
        g2_err("dump-patch: slot %c is empty or not initialized\n", 'A' + slot);
        return G2_ERR_INVALID_PARAM;
    }
    /* No additional payload for MIDI dump - just the subcommand */
    if (send_slot((uint8_t)slot, version, SUB_COMMAND_MIDI_DUMP, NULL, 0) < 0) {
        g2_err("dump-patch: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    if (!g2_listener_active) g2_drain_pending();
    return G2_OK;
}

/* Get Bank from device - reads every location (1-128) of a bank directly out of
 * the G2's flash memory and saves each occupied one to disk as a .pch2 file, plus
 * a .pchList index. This is the G2's dedicated "flash dump" protocol - request
 * opcode 0x17, status marker 0x18, raw data 0x19 - confirmed from the official
 * editor's decompiled source (other-approaches/G2-ReverseEngineered/G2Editor.c:
 * CFlashDumper / CMFlashDumpRequest / CMFlashDumpMarker / CMFlashDumpRawData).
 * Unlike select-patch/select-perf (RETRIEVE, opcode 0x0A) this never loads
 * anything into a live edit slot (A-D) - flash locations are addressed purely
 * by (type, bank, location), so it cannot disturb whatever is currently loaded.
 * There is no "bank complete" sentinel from the hardware: the host just walks
 * all 128 locations in order and stops - same as the reference implementation. */
/* Same "escape only what JSON string syntax requires" as the event emitters in
 * g2_events.c - patch names are free text from the device/filesystem. */
static void print_json_escaped(const char *s) {
    for (const char *p = s ? s : ""; *p; p++) {
        if (*p == '"' || *p == '\\') fputc('\\', stdout);
        fputc(*p, stdout);
    }
}

static void emit_bank_upload_progress(int location, int total, int written, int empty, int corrupt, const char *name) {
    printf("{\"type\":\"bank_upload_progress\",\"location\":%d,\"total\":%d,\"written\":%d,\"empty\":%d,\"corrupt\":%d,\"name\":\"",
           location, total, written, empty, corrupt);
    print_json_escaped(name);
    printf("\"}\n");
    fflush(stdout);
}

/* Copies a device-supplied name into out as a safe single path component: path
 * separators and characters illegal on common filesystems become '_', and a leading
 * '.' (so ".." and hidden files) does too. Not static: exercised by unit tests. */
void sanitize_filename(const char *name, char *out, size_t outSize) {
    size_t i = 0;
    for (; name[i] && i + 1 < outSize; i++) {
        unsigned char c = (unsigned char)name[i];
        out[i] = (strchr("/\\:*?\"<>|", c) || c < 0x20 || c == 0x7f || (i == 0 && c == '.')) ? '_' : (char)c;
    }
    out[i] = '\0';
}

/* flash_read_location results. */
enum { FLASH_READ_DATA = 0, FLASH_READ_EMPTY, FLASH_READ_CORRUPT, FLASH_READ_ABORT };

/* Reads flash location `location0` (0-based) of `bank` (1-based). Shared by
 * get-bank and get-location. On FLASH_READ_DATA, *bulkOut holds the raw message
 * (caller frees it) and body/bodyLen point into it; `name` receives the entry's
 * name. On FLASH_READ_ABORT, `reason` says why. */
static int flash_read_location(int type, int bank, int location0, uint8_t **bulkOut,
                               const uint8_t **body, size_t *bodyLen, char *name, size_t nameLen,
                               char *reason, size_t reasonLen) {
    *bulkOut = NULL;
    uint8_t req[4] = { 0x17, (uint8_t)type, (uint8_t)(bank - 1), (uint8_t)location0 };
    if (send_system_data(0x41, req, sizeof(req)) < 0) {
        snprintf(reason, reasonLen, "failed to send request for location %d", location0 + 1);
        return FLASH_READ_ABORT;
    }
    usleep(USB_SEND_DELAY_US);

    /* Lockstep on (bank, location): the G2 can answer a location later than
     * the request that asked for it, and a blind single read then stores
     * location N-1's patch under location N's name - confirmed on hardware
     * (2026-09-14), every file in a 23-patch dump was shifted by one.
     * Accept only a CMFlashDumpMarker (0x18) or CMFlashDumpRawData (0x19)
     * tagged with the bank/location just requested; relay anything else. */
    int got = 0;                 /* 1 = marker, 2 = raw data */
    uint8_t status = 0;
    uint8_t *bulk = NULL;
    uint16_t size = 0;
    for (int attempt = 0; attempt < 20 && !got; attempt++) {
        uint8_t interruptResp[16] = {0};
        int ret = recv_interrupt(interruptResp, sizeof(interruptResp), USB_TIMEOUT_LONG_MS);
        if (ret <= 0) break;
        uint8_t msgType = interruptResp[0] & 0x0f;
        if (msgType == RESPONSE_TYPE_EMBEDDED) {
            /* [..][aCmd][version][0x18][status][fileType][bank][location] */
            if (interruptResp[4] != 0x18 || interruptResp[7] != (uint8_t)(bank - 1)
                || interruptResp[8] != (uint8_t)location0) {
                /* Someone else's message - relay it so the watch stream keeps it,
                 * same as the RESPONSE_TYPE_EXTENDED case below. */
                g2_msg_t relay = {0};
                memcpy(relay.interrupt, interruptResp, 16);
                g2_emit_event(&relay);
                continue;
            }
            status = interruptResp[5];
            got = 1;
        } else if (msgType == RESPONSE_TYPE_EXTENDED) {
            size = ((uint16_t)interruptResp[1] << 8) | interruptResp[2];
            if (size < 8) { discard_bulk(size); continue; }
            bulk = malloc(size);
            if (!bulk) {
                snprintf(reason, reasonLen, "out of memory at location %d", location0 + 1);
                return FLASH_READ_ABORT;
            }
            if (recv_bulk(bulk, size) <= 0) {
                free(bulk);
                snprintf(reason, reasonLen, "failed to read bulk data at location %d", location0 + 1);
                return FLASH_READ_ABORT;
            }
            if (bulk[1] == 0x0C && bulk[3] == 0x18
                && bulk[6] == (uint8_t)(bank - 1) && bulk[7] == (uint8_t)location0) {
                status = bulk[4];
                free(bulk); bulk = NULL;
                got = 1;
            } else if (bulk[1] == 0x0C && bulk[3] == 0x19
                       && bulk[5] == (uint8_t)(bank - 1) && bulk[6] == (uint8_t)location0) {
                got = 2;     /* bulk kept, handed to the caller */
            } else {
                /* Someone else's message - relay it so the watch stream keeps it. */
                g2_msg_t relay = {0};
                memcpy(relay.interrupt, interruptResp, 16);
                relay.bulk = bulk;
                relay.bulk_size = size;
                g2_emit_event(&relay);
                free(bulk); bulk = NULL;
            }
        }
    }
    if (!got) {
        snprintf(reason, reasonLen, "no response for location %d", location0 + 1);
        return FLASH_READ_ABORT;
    }

    if (got == 1) {
        /* Wire status codes per CMFlashDumpMarker::ReadStream: 4 = entry empty,
         * 5 = entry corrupt (skip both, keep going), anything else here is an
         * abort condition (1 = memory protected, 3 = memory full). */
        if (status == 4) return FLASH_READ_EMPTY;
        if (status == 5) return FLASH_READ_CORRUPT;
        snprintf(reason, reasonLen, "device reported status %u at location %d (memory protected/full?)", status, location0 + 1);
        return FLASH_READ_ABORT;
    }

    /* CMFlashDumpRawData payload, mirroring build_flash_dump_raw_frame:
     * [fileType][bank][location][name..NUL][size_hi][size_lo][version][body].
     * The body is already the whole file from its name-terminating NUL
     * onward ([0x00][version][type][sections][CRC]), so the file on disk is
     * simply the official text header followed by it - what the original
     * editor's CFlashDumper writes (CPatchFilePort::SaveFromDump goes
     * through the same WriteDataFile as a normal save), and the layout the
     * editor's Save writes. No patch_usb_to_pch2/perf_sections_to_prf2
     * conversion is involved, and patches and performances are identical
     * here apart from the type byte the body already carries and the
     * header's Type= line. */
    uint8_t *payload = bulk + 4;
    size_t payloadSize = size - 4;
    /* parse_name returns the FIELD length: name + terminator, or just the name
     * when it fills all 16 bytes (utils.c, same convention as
     * perf_settings_normalize_slots). Scanning for a NUL instead swallows the
     * first size byte of a 16-character name. */
    uint8_t nameBuf[16] = {0};   /* zero-padded copy: parse_name must not read past the payload */
    memcpy(nameBuf, payload + 3, payloadSize - 3 < sizeof(nameBuf) ? payloadSize - 3 : sizeof(nameBuf));
    size_t nameField = (size_t)parse_name(nameBuf, name, nameLen);
    size_t bodyOfs = 3 + nameField + 3;
    if (bodyOfs > payloadSize) {
        free(bulk);
        snprintf(reason, reasonLen, "truncated response at location %d", location0 + 1);
        return FLASH_READ_ABORT;
    }
    *bodyLen = ((size_t)payload[3 + nameField] << 8) | payload[3 + nameField + 1];
    if (*bodyLen == 0 || bodyOfs + *bodyLen > payloadSize) {
        free(bulk);
        snprintf(reason, reasonLen, "bad payload length at location %d", location0 + 1);
        return FLASH_READ_ABORT;
    }
    *body = payload + bodyOfs;
    *bulkOut = bulk;
    return FLASH_READ_DATA;
}

/* Writes a flash-dump body as a .pch2/.prf2 file: the official text header
 * followed by the body verbatim. Returns 0 on success. */
static int write_dump_file(const char *filename, int type, const uint8_t *body, size_t bodyLen) {
    const char *textHeader = type == 0 ? PCH2_TEXT_HEADER : PRF2_TEXT_HEADER;
    FILE *f = fopen(filename, "wb");
    if (!f) return -1;
    int ok = fwrite(textHeader, 1, strlen(textHeader), f) == strlen(textHeader)
          && fwrite(body, 1, bodyLen, f) == bodyLen;
    return (fclose(f) == 0 && ok) ? 0 : -1;
}

cJSON *g2_get_bank(int type, int bank, const char *folder, const char *name) {
    if (type < 0 || type > 1) { g2_err("get-bank: invalid type\n"); return NULL; }
    if (bank < 1 || (type == 0 && bank > 32) || (type == 1 && bank > 8)) {
        g2_err("get-bank: invalid bank number for type\n");
        return NULL;
    }
    if (folder == NULL) { g2_err("get-bank: folder required\n"); return NULL; }
    if (ensure_connected(1) < 0) { g2_err("get-bank: not connected\n"); return NULL; }

    /* Drain stale data (same pattern as g2_get_patch_file/g2_get_perf_file). */
    if (!g2_listener_active) g2_drain_quiet(USB_TIMEOUT_STALE_MS, NULL);

    /* .pchList index: header line + one "<bank>:<location>: <name>" line per
     * written patch (format matches the reference CFlashDumper::WriteDumpList). */
    size_t listCap = 4096, listLen = 0;
    char *list = malloc(listCap);
    if (!list) {
        g2_err("get-bank: out of memory\n");
        return NULL;
    }
    listLen += (size_t)snprintf(list, listCap, "Version=Nord Modular G2 Bank Dump\n");

    int writtenCount = 0, emptyCount = 0, corruptCount = 0;
    int aborted = 0;
    char abortReason[128] = {0};

    /* Tracks the disambiguated name already written for each prior location,
     * so two patches sharing a name in the same bank don't overwrite each
     * other's file - the 2nd, 3rd, ... occurrence gets a "2", "3", ... suffix
     * appended directly (no separator). */
    char writtenNames[128][40] = {{0}};

    for (int location = 0; location < 128; location++) {
        uint8_t *bulk = NULL;
        const uint8_t *body = NULL;
        size_t bodyLen = 0;
        char patchName[32] = {0};
        int rd = flash_read_location(type, bank, location, &bulk, &body, &bodyLen,
                                     patchName, sizeof(patchName), abortReason, sizeof(abortReason));
        if (rd == FLASH_READ_ABORT) { aborted = 1; break; }
        if (rd == FLASH_READ_EMPTY) { emptyCount++; emit_bank_upload_progress(location + 1, 128, writtenCount, emptyCount, corruptCount, ""); continue; }
        if (rd == FLASH_READ_CORRUPT) {
            corruptCount++;
            g2_err("get-bank: location %d is corrupt, skipping\n", location + 1);
            emit_bank_upload_progress(location + 1, 128, writtenCount, emptyCount, corruptCount, "");
            continue;
        }

        const char *baseName = strlen(patchName) ? patchName : "Untitled";
        char fileBase[32];   /* baseName made safe as a file name - the name lives only in the file name */
        sanitize_filename(baseName, fileBase, sizeof(fileBase));

        int occurrence = 0;
        for (int i = 0; i < writtenCount; i++) if (strcmp(writtenNames[i], fileBase) == 0) occurrence++;
        char dispName[40];
        if (occurrence == 0) snprintf(dispName, sizeof(dispName), "%s", fileBase);
        else snprintf(dispName, sizeof(dispName), "%s%d", fileBase, occurrence + 1);
        snprintf(writtenNames[writtenCount], sizeof(writtenNames[0]), "%s", fileBase);

        char filename[1024];
        snprintf(filename, sizeof(filename), "%s/%s.%s", folder, dispName, type == 0 ? "pch2" : "prf2");
        if (write_dump_file(filename, type, body, bodyLen) < 0) {
            free(bulk);
            snprintf(abortReason, sizeof(abortReason), "failed to write file for location %d", location + 1);
            aborted = 1;
            break;
        }
        free(bulk);

        if (listLen + 64 > listCap) {
            listCap *= 2;
            char *grown = realloc(list, listCap);
            if (!grown) {
                free(list);
                return NULL;
            }
            list = grown;
        }
        listLen += (size_t)snprintf(list + listLen, listCap - listLen, "%d:%d: %s\n", bank, location + 1, dispName);
        writtenCount++;
        emit_bank_upload_progress(location + 1, 128, writtenCount, emptyCount, corruptCount, dispName);
    }

    cJSON *result = NULL;
    if (!aborted) {
        char listPath[1024];
        snprintf(listPath, sizeof(listPath), "%s/%s.pchList", folder, name ? name : "PatchBank");
        FILE *lf = fopen(listPath, "wb");
        if (lf) { fwrite(list, 1, listLen, lf); fclose(lf); }

        result = cJSON_CreateObject();
        cJSON_AddNumberToObject(result, "written", writtenCount);
        cJSON_AddNumberToObject(result, "empty", emptyCount);
        cJSON_AddNumberToObject(result, "corrupt", corruptCount);
        cJSON_AddStringToObject(result, "folder", folder);
    } else {
        g2_err("get-bank: aborted - %s\n", abortReason);
    }

    free(list);
    return result;
}

/* Parses a .pchList index (as written by g2_get_bank) into per-location file
 * paths. Sibling file convention: <dirname(pchListPath)>/<name>.<ext>,
 * matching what get-bank itself writes (a numbered suffix like "Name2" only
 * appears in <name> when get-bank had to disambiguate a duplicate). A line
 * with an out-of-range location or a missing sibling file is skipped
 * (warned), not fatal - only a missing or unreadable .pchList itself is.
 * Returns the entry count, or -1.
 * Not static: exercised directly by unit tests (see test_bank_source.c). */
int parse_pchlist(const char *pchListPath, int type, bank_entry_t *entries, int maxEntries) {
    FILE *f = fopen(pchListPath, "r");
    if (!f) { g2_err("send-bank: cannot open %s\n", pchListPath); return -1; }

    char dir[900] = ".";
    const char *slash = strrchr(pchListPath, '/');
    if (slash) {
        size_t n = (size_t)(slash - pchListPath);
        if (n >= sizeof(dir)) n = sizeof(dir) - 1;
        memcpy(dir, pchListPath, n);
        dir[n] = '\0';
    }

    const char *ext = (type == 0) ? "pch2" : "prf2";
    char line[512];
    int count = 0;
    while (fgets(line, sizeof(line), f)) {
        int loc;
        char name[256];
        if (sscanf(line, "%*d:%d: %255[^\r\n]", &loc, name) != 2) continue; /* header line or blank */
        if (loc < 1 || loc > 128) { g2_err("send-bank: skipping out-of-range location %d in %s\n", loc, pchListPath); continue; }
        if (count >= maxEntries) { g2_err("send-bank: too many entries in %s\n", pchListPath); break; }

        /* The "name" field's own convention varies by producer: get-bank writes
         * a bare name (no extension, no location prefix on the name itself -
         * the sibling file separately gets both a %03d_ prefix and extension
         * appended); other tools (e.g. a real Nord Modular G2 bank dump,
         * confirmed against a real fixture 2026-09-14) write the name WITH
         * its extension already and no prefix at all. Try every combination
         * rather than assume one. */
        char filepath[1024] = {0};
        const char *candidates[4];
        char c0[1024], c1[1024], c2[1024], c3[1024];
        snprintf(c0, sizeof(c0), "%s/%s", dir, name);
        snprintf(c1, sizeof(c1), "%s/%s.%s", dir, name, ext);
        snprintf(c2, sizeof(c2), "%s/%03d_%s", dir, loc, name);
        snprintf(c3, sizeof(c3), "%s/%03d_%s.%s", dir, loc, name, ext);
        candidates[0] = c0; candidates[1] = c1; candidates[2] = c2; candidates[3] = c3;
        int found = 0;
        for (int i = 0; i < 4 && !found; i++) {
            FILE *check = fopen(candidates[i], "rb");
            if (check) { fclose(check); snprintf(filepath, sizeof(filepath), "%s", candidates[i]); found = 1; }
        }
        if (!found) { g2_err("send-bank: missing sibling file for location %d: %s\n", loc, name); continue; }

        entries[count].location = loc;
        snprintf(entries[count].filepath, sizeof(entries[count].filepath), "%s", filepath);
        count++;
    }
    fclose(f);
    return count;
}

/* Scans a folder for *.pch2 (type 0) or *.prf2 (type 1) files (used when
 * sending a bank from a plain folder with no .pchList sidecar to derive
 * locations from). There is no location encoded in the filename, so entries
 * are assigned locations 1, 2, 3, ... in alphabetical filename order.
 * Returns the entry count, or -1.
 * Not static: exercised directly by unit tests (see test_bank_source.c). */
static int scan_bank_folder_name_cmp(const void *a, const void *b) {
    return strcmp(*(const char * const *)a, *(const char * const *)b);
}

int scan_bank_folder(const char *folderPath, int type, bank_entry_t *entries, int maxEntries) {
    DIR *d = opendir(folderPath);
    if (!d) { g2_err("send-bank: cannot open folder %s\n", folderPath); return -1; }

    const char *ext = (type == 0) ? ".pch2" : ".prf2";
    size_t extLen = strlen(ext);
    char names[128][256];
    int count = 0;
    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        const char *fn = ent->d_name;
        size_t len = strlen(fn);
        if (len < extLen || strcmp(fn + len - extLen, ext) != 0) continue; /* not this type - not an error */
        if (count >= maxEntries || count >= 128) { g2_err("send-bank: too many files in %s\n", folderPath); break; }
        snprintf(names[count], sizeof(names[0]), "%s", fn);
        count++;
    }
    closedir(d);

    const char *sortedNames[128];
    for (int i = 0; i < count; i++) sortedNames[i] = names[i];
    qsort(sortedNames, count, sizeof(sortedNames[0]), scan_bank_folder_name_cmp);

    for (int i = 0; i < count; i++) {
        entries[i].location = i + 1;
        snprintf(entries[i].filepath, sizeof(entries[i].filepath), "%s/%s", folderPath, sortedNames[i]);
    }
    return count;
}

/* Builds one CMFlashDumpRawData (opcode 0x19) write message - a system-scoped
 * command writing a whole patch/performance file at a specific flash
 * (type, bank0, location0). Pure function, no I/O, so it is unit-testable
 * without hardware.
 * Byte layout captured from real hardware (2026-09-14) by dumping what the G2
 * itself sends for the same message in the opposite direction (get-bank's
 * CMFlashDumpRawData response), and matching the decompiled official editor's
 * CMFlashDumpRawData::WriteStream (other-approaches/G2-ReverseEngineered/
 * G2Editor.c:20945-20973):
 *   [len_hi][len_lo][0x01][COMMAND_REQ|COMMAND_SYS][0x41][0x19]
 *   [type][bank0][location0]
 *   [name bytes][0x00]   - NUL-terminated, NOT a fixed 16-byte field
 *   [size_hi][size_lo]   - file_len as a UWord
 *   [version]            - WriteStream's PutUByte(version); the file's own
 *                          version byte, i.e. file_data[1] (0x17 = 23)
 *   [file_data: file_len bytes]
 *   [crc_hi][crc_lo]     - CRC-16 over the whole message
 * file_data is the .pch2/.prf2 file content from its name-terminating NUL to
 * EOF - i.e. [0x00][version][type][sections][file CRC]. That is NOT the same
 * as locate_section_data's output: the leading 3 bytes and the file's own
 * trailing CRC are part of what the G2 stores and verifies. Sending only the
 * section bytes (as this did before) left the device parsing the message's
 * trailing bytes as further molecules, which it answered with one 0x7E code 3
 * NACK per write and which renamed the four live slots to "Error".
 * bank0/location0 are already 0-indexed (caller passes bank-1, location).
 * Returns the total message length, or -1 if out_cap is too small.
 * Not static: exercised directly by unit tests (see test_bank_source.c). */
int build_flash_dump_raw_frame(int type, int bank0, int location0, const char *name,
                                const uint8_t *file_data, size_t file_len,
                                uint8_t *out, size_t out_cap) {
    size_t nameLen = strlen(name);
    if (nameLen > 16) nameLen = 16;
    size_t nameField = nameLen + (nameLen < 16 ? 1 : 0);
    size_t needed = (size_t)COMMAND_OFFSET + 4 + 3 + nameField + 2 + 1 + file_len + 2;
    if (out_cap < needed || file_len < 2) return -1;

    int pos = COMMAND_OFFSET;
    out[pos++] = 0x01;
    out[pos++] = COMMAND_REQ | COMMAND_SYS;
    out[pos++] = 0x41;
    out[pos++] = 0x19;
    out[pos++] = (uint8_t)type;
    out[pos++] = (uint8_t)bank0;
    out[pos++] = (uint8_t)location0;
    memcpy(out + pos, name, nameLen);
    pos += (int)nameLen;
    if (nameLen < 16) out[pos++] = 0x00;   /* 16 chars fill the field, unterminated */
    out[pos++] = (uint8_t)((file_len >> 8) & 0xff);
    out[pos++] = (uint8_t)(file_len & 0xff);
    out[pos++] = file_data[1];
    memcpy(out + pos, file_data, file_len);
    pos += (int)file_len;

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&out[COMMAND_OFFSET], msgLength);
    out[pos++] = (crc >> 8) & 0xff;
    out[pos++] = crc & 0xff;
    msgLength += 4;

    out[0] = (msgLength >> 8) & 0xff;
    out[1] = msgLength & 0xff;
    return pos;
}

/* Sends one flash-dump raw-data write and waits for the G2's own answer: a
 * CMFlashDumpMarker (0x18) carrying the same status codes g2_get_bank already
 * decodes on the read side. Uses the bounded discard-until-tag-match lockstep
 * the rest of this file uses for request/response pairs (g2_get_patch's notes
 * step, g2_get_global_knobs, query_perf_settings): the listener thread keeps
 * running, so an unrelated notification can still land between the write and
 * its marker; those are relayed on as events instead of being mistaken for the
 * answer.
 * Note that recv_interrupt() (g2_io.c) never hands back an aCmd <= 0x03 frame
 * while the listener is active - it emits it as an event and keeps waiting - so
 * a 0x7E NACK cannot be observed here directly; no marker at all is what a
 * rejected write looks like from here.
 * Returns the marker's status byte (0 = written) via *status when one arrives,
 * or leaves it at -1; the return value is G2_OK only for status 0. */
static int send_flash_dump_raw(int type, int bank0, int location0, const char *name,
                                const uint8_t *file_data, size_t file_len, int *status) {
    *status = -1;
    size_t cap = (size_t)COMMAND_OFFSET + 4 + 3 + 16 + 2 + 1 + file_len + 2;
    uint8_t *buff = calloc(1, cap);
    if (!buff) return G2_ERR_NO_MEMORY;

    int msgLength = build_flash_dump_raw_frame(type, bank0, location0, name, file_data, file_len, buff, cap);
    if (msgLength < 0) { free(buff); return G2_ERR_NO_MEMORY; }

    g2_drain_pending();
    /* send_bulk_msg completes a short write instead of restarting the frame, and
     * retries only while nothing has gone out - which covers the transient
     * single-transfer failures seen over a long bank operation (2026-09-14)
     * without ever leaving the device mid-message. */
    int ret = send_bulk_msg(buff, msgLength);
    free(buff);
    if (ret < 0) return (ret == G2_ERR_TOO_LARGE) ? G2_ERR_TOO_LARGE : G2_ERR_SEND;

    usleep(USB_SEND_DELAY_US);
    /* Wait on the device, don't outrun it: a flash write takes far longer than
     * USB_TIMEOUT_STANDARD_MS, and the marker is what paces the whole bank loop
     * (the official editor chains the next file off HandleDumpDownOK the same
     * way). A long timeout is free on the happy path - this returns the moment
     * the marker arrives. The attempt budget is generous because unrelated
     * system/perf notifications also land here and each consumes one - and so
     * does a bare timeout, so one slow write or one burst of unrelated traffic
     * can't sink the whole location; only a real recv error ends it early. */
    /* CMFlashDumpMarker: 0 = DumpDownOK (written), 1 = MemoryProtected, 3 = MemoryFull,
     * 4 = EntryEmpty, 5 = EntryCorrupt - only 0 means this entry landed. Which of the two
     * acknowledgements the G2 sends depends on what was already at the location (an
     * overwrite answers with a command result); the reference editor advances its loop off
     * either (CFlashDumper::HandleDumpDownOK / ::HandleFlashCommandResult), and treats
     * command result 4 as MemoryProtected. */
    int got = await_flash_result(bank0, location0, status);
    if (got == G2_ERR_NO_MEMORY) return G2_ERR_NO_MEMORY;
    if (got == 1) return *status == 0 ? G2_OK : G2_ERR;
    if (got == 2) return *status == 4 ? G2_ERR : G2_OK;
    *status = -1;   /* no answer at all (or a USB error): the caller treats this as "no reply" */
    return G2_ERR;
}

/* flash_write_file results: written / skipped / skipped and the location must be
 * cleared (the bank must not keep stale data there) / lockstep broken, stop. */
enum { FLASH_WRITE_OK = 0, FLASH_WRITE_SKIP, FLASH_WRITE_SKIP_CLEAR, FLASH_WRITE_ABORT };

/* Writes one .pch2/.prf2 file to flash location `location0` (0-based) of `bank`
 * (1-based) under the wire name `name`. Shared by send-bank and put-location.
 * On anything but FLASH_WRITE_OK, `reason` says why. */
static int flash_write_file(int type, int bank, int location0, const char *filepath, const char *name,
                            char *reason, size_t reasonLen) {
    FILE *f = fopen(filepath, "rb");
    if (!f) { snprintf(reason, reasonLen, "cannot open source file"); return FLASH_WRITE_SKIP; }
    long fsize;
    uint8_t *fileData = read_whole_file(f, &fsize);
    fclose(f);
    if (!fileData) { snprintf(reason, reasonLen, "cannot read source file"); return FLASH_WRITE_SKIP; }

    /* The G2 stores the file body verbatim: everything from the name-
     * terminating NUL to EOF, i.e. [0x00][version][type][sections][file
     * CRC] - confirmed byte-for-byte against what the device sends back
     * for the same location (see build_flash_dump_raw_frame). Identical
     * for patches and performances, so neither locate_section_data nor
     * perf_prf2_to_sections is involved here; locate_section_data is only
     * used to find the name terminator and reject a truncated file. */
    int name_end, data_offset, data_len;
    if (locate_section_data(fileData, fsize, &name_end, &data_offset, &data_len) < 0) {
        free(fileData);
        snprintf(reason, reasonLen, "failed to parse patch file");
        return FLASH_WRITE_SKIP;
    }

    /* Third header byte: 0x00 = patch, 0x01 = performance (FILE_TYPE_PATCH/
     * FILE_TYPE_PERFORMANCE, nmg2PatchSerializer.ts) - reject a source file
     * that doesn't match the bank's own type rather than write it into a
     * slot the device will never read back correctly. */
    if (fileData[name_end + 2] != (uint8_t)type) {
        free(fileData);
        snprintf(reason, reasonLen, "wrong file type for this bank");
        return FLASH_WRITE_SKIP_CLEAR;
    }

    int status = -1;
    int ret = send_flash_dump_raw(type, bank - 1, location0, name,
                                  fileData + name_end, (size_t)fsize - (size_t)name_end, &status);
    free(fileData);

    if (ret == G2_ERR_TOO_LARGE) {
        /* Nothing was sent - the device cannot take a message this big and
         * sending it anyway wedges it (see G2_MAX_MESSAGE_LEN). The official
         * editor fails on the same file too, so the entry is simply not
         * transferable over USB. */
        snprintf(reason, reasonLen, "too large for device (%ld bytes)", fsize);
        return FLASH_WRITE_SKIP_CLEAR;
    }
    if (ret == G2_ERR_SEND || ret == G2_ERR_NO_MEMORY) {
        snprintf(reason, reasonLen, "failed to send location %d", location0 + 1);
        return FLASH_WRITE_ABORT;
    }
    if (ret != G2_OK && status < 0) {
        /* No marker came back at all: the request/response lockstep is broken,
         * so every later write would be sent blind. */
        snprintf(reason, reasonLen, "no reply from device for location %d", location0 + 1);
        return FLASH_WRITE_ABORT;
    }
    if (ret != G2_OK) {
        /* Device answered but refused this entry (memory protected/full). */
        snprintf(reason, reasonLen, "device refused write (status %d)", status);
        return FLASH_WRITE_SKIP;
    }
    return FLASH_WRITE_OK;
}

static void emit_bank_download_progress(int location, int total, int written, int cleared, int failed, const char *name) {
    printf("{\"type\":\"bank_download_progress\",\"location\":%d,\"total\":%d,\"written\":%d,\"cleared\":%d,\"failed\":%d,\"name\":\"",
           location, total, written, cleared, failed);
    print_json_escaped(name);
    printf("\"}\n");
    fflush(stdout);
}

/* Records one non-fatal per-location send-bank skip so g2_send_bank's result
 * JSON can tell the caller which locations were dropped and why, instead of
 * just a bare count. */
static void add_bank_failure(cJSON *failures, int location, const char *filepath, const char *reason) {
    const char *base = strrchr(filepath, '/');
    base = base ? base + 1 : filepath;
    cJSON *f = cJSON_CreateObject();
    cJSON_AddNumberToObject(f, "location", location);
    cJSON_AddStringToObject(f, "name", base);
    cJSON_AddStringToObject(f, "reason", reason);
    cJSON_AddItemToArray(failures, f);
}

/* Send Bank to device - writes bank data (patches or performances) to G2 flash
 * using the same flash-dump protocol get_bank reads with (request 0x17,
 * marker 0x18, raw data 0x19 - confirmed against the decompiled official
 * editor, other-approaches/G2-ReverseEngineered/G2Editor.c: CFlashDumper).
 * WARNING: this OVERWRITES the entire target bank - any location with no
 * matching source entry is cleared via g2_clear_patch, not left untouched.
 * Like the reference implementation, this is a per-location loop (0-127) with
 * a settle delay between writes instead of a synchronous ack wait - see
 * send_flash_dump_raw's comment for why the ack can't be read here. There is
 * no single bulk message for a whole bank. */
cJSON *g2_send_bank(const char *type_str, const char *source_type, const char *source_path, int bank) {
    int type = (type_str && strcmp(type_str, "performance") == 0) ? 1 : 0;
    if (bank < 1 || (type == 0 && bank > 32) || (type == 1 && bank > 8)) {
        g2_err("send-bank: invalid bank number for type\n");
        return NULL;
    }
    if (source_path == NULL) { g2_err("send-bank: source path required\n"); return NULL; }
    if (ensure_connected(1) < 0) { g2_err("send-bank: not connected\n"); return NULL; }

    bank_entry_t *entries = calloc(128, sizeof(bank_entry_t));
    if (!entries) {
        g2_err("send-bank: out of memory\n");
        return NULL;
    }

    int nEntries;
    if (source_type && strcmp(source_type, "pchList") == 0) {
        nEntries = parse_pchlist(source_path, type, entries, 128);
    } else if (source_type && strcmp(source_type, "folder") == 0) {
        nEntries = scan_bank_folder(source_path, type, entries, 128);
    } else {
        g2_err("send-bank: source type must be 'pchList' or 'folder'\n");
        free(entries);
        return NULL;
    }
    if (nEntries < 0) {
        free(entries);
        return NULL;
    }

    bank_entry_t *byLocation[128] = {0};
    for (int i = 0; i < nEntries; i++) byLocation[entries[i].location - 1] = &entries[i];

    int writtenCount = 0, clearedCount = 0, failedCount = 0;
    int aborted = 0;
    char abortReason[128] = {0};
    cJSON *failures = cJSON_CreateArray();
    /* Locations listed in the source but skipped (too large, or wrong file
     * type for this bank); cleared in a second pass once the write loop is
     * done - see the loop's exit. */
    int deferredClear[128];
    int nDeferredClear = 0;
    unsigned long dropsAtStart = g2_msg_drops;

    for (int location = 0; location < 128; location++) {
        bank_entry_t *e = byLocation[location];
        if (!e) {
            if (g2_clear_patch(type, bank, location + 1) != G2_OK) {
                snprintf(abortReason, sizeof(abortReason), "failed to clear location %d", location + 1);
                aborted = 1;
                break;
            }
            clearedCount++;
            emit_bank_download_progress(location + 1, 128, writtenCount, clearedCount, failedCount, "");
            continue;
        }

        /* Wire name: basename with the NNN_ location prefix skipped - but only for
         * pchList sources, since that prefix is get-bank's own .pchList/file naming
         * convention. A folder source has no such guarantee, and a user-named file
         * that happens to start with 3 digits and an underscore (e.g. "123_Lead.pch2")
         * must not have its name silently truncated. name_from_filepath re-derives
         * its own basename, so passing it an already-prefix-stripped pointer with no
         * further '/' in it works unchanged. */
        const char *base = strrchr(e->filepath, '/');
        base = base ? base + 1 : e->filepath;
        if (source_type && strcmp(source_type, "pchList") == 0 &&
            strlen(base) > 4 && isdigit((unsigned char)base[0]) && isdigit((unsigned char)base[1]) &&
            isdigit((unsigned char)base[2]) && base[3] == '_') {
            base += 4;
        }

        char name[17] = {0};
        name_from_filepath(base, name, 16);

        char reason[128];
        int wr = flash_write_file(type, bank, location, e->filepath, name, reason, sizeof(reason));
        if (wr == FLASH_WRITE_ABORT) {
            snprintf(abortReason, sizeof(abortReason), "%s", reason);
            aborted = 1;
            break;
        }
        if (wr != FLASH_WRITE_OK) {
            g2_err("send-bank: %s: %s, location %d skipped\n", e->filepath, reason, location + 1);
            /* Cleared in the second pass after the loop. Deferred because
             * g2_clear_patch used to blind-read one unmatched message, which
             * broke the per-location lockstep between two writes; it now waits
             * for its own tagged result (await_flash_result), so an inline
             * clear would no longer do that. */
            if (wr == FLASH_WRITE_SKIP_CLEAR && nDeferredClear < 128) deferredClear[nDeferredClear++] = location + 1;
            add_bank_failure(failures, location + 1, e->filepath, reason);
            failedCount++;
            emit_bank_download_progress(location + 1, 128, writtenCount, clearedCount, failedCount, name);
            continue;
        }
        writtenCount++;
        emit_bank_download_progress(location + 1, 128, writtenCount, clearedCount, failedCount, name);
    }

    free(entries);

    /* Second pass: clear the locations that were listed but skipped (too large,
     * or wrong file type). A bank download already clears every location
     * absent from the source list, so one that is listed but unwritable must
     * not keep unrelated data the user would see as a valid entry - location
     * 16 of the test bank held a corrupt 34 KB performance from an earlier
     * failed write. Skipped when the run aborted: the device has already
     * stopped answering by then. */
    if (!aborted) {
        for (int i = 0; i < nDeferredClear; i++) g2_clear_patch(type, bank, deferredClear[i]);
    }

    if (aborted) g2_err("send-bank: aborted - %s\n", abortReason);

    cJSON *result = cJSON_CreateObject();
    cJSON_AddNumberToObject(result, "written", writtenCount);
    cJSON_AddNumberToObject(result, "cleared", clearedCount);
    cJSON_AddNumberToObject(result, "failed", failedCount);
    cJSON_AddItemToObject(result, "failures", failures);
    cJSON_AddBoolToObject(result, "aborted", aborted);
    if (aborted) cJSON_AddStringToObject(result, "abortReason", abortReason);
    /* Replies the listener queue evicted while this ran. Any nonzero value here
     * means a marker may have been thrown away rather than never sent, which is
     * what an otherwise unexplainable "no reply for location N" looks like. */
    unsigned long drops = g2_msg_drops - dropsAtStart;
    if (drops) {
        cJSON_AddNumberToObject(result, "queueDrops", (double)drops);
        g2_err("send-bank: listener queue dropped %lu message(s) during this bank - "
               "a marker may have been evicted\n", drops);
    }
    return result;
}

static int flash_location_valid(const char *cmd, int type, int bank, int location, const char *file) {
    if (type < 0 || type > 1) { g2_err("%s: invalid type\n", cmd); return 0; }
    if (bank < 1 || (type == 0 && bank > 32) || (type == 1 && bank > 8)) {
        g2_err("%s: invalid bank number for type\n", cmd);
        return 0;
    }
    if (location < 1 || location > 128) { g2_err("%s: invalid location\n", cmd); return 0; }
    if (file == NULL) { g2_err("%s: file required\n", cmd); return 0; }
    if (ensure_connected(1) < 0) { g2_err("%s: not connected\n", cmd); return 0; }
    return 1;
}

cJSON *g2_get_location(int type, int bank, int location, const char *file) {
    if (!flash_location_valid("get-location", type, bank, location, file)) return NULL;
    if (!g2_listener_active) g2_drain_quiet(USB_TIMEOUT_STALE_MS, NULL);

    uint8_t *bulk = NULL;
    const uint8_t *body = NULL;
    size_t bodyLen = 0;
    char name[32] = {0};
    char reason[128] = {0};
    int rd = flash_read_location(type, bank, location - 1, &bulk, &body, &bodyLen,
                                 name, sizeof(name), reason, sizeof(reason));
    if (rd == FLASH_READ_ABORT) { g2_err("get-location: %s\n", reason); return NULL; }
    if (rd == FLASH_READ_DATA) {
        int wret = write_dump_file(file, type, body, bodyLen);
        free(bulk);
        if (wret < 0) { g2_err("get-location: failed to write %s\n", file); return NULL; }
    }
    cJSON *result = cJSON_CreateObject();
    cJSON_AddStringToObject(result, "name", name);
    cJSON_AddBoolToObject(result, "empty", rd == FLASH_READ_EMPTY);
    cJSON_AddBoolToObject(result, "corrupt", rd == FLASH_READ_CORRUPT);
    return result;
}

cJSON *g2_put_location(int type, int bank, int location, const char *file, const char *name) {
    if (!flash_location_valid("put-location", type, bank, location, file)) return NULL;
    char wireName[17] = {0};
    if (name) snprintf(wireName, sizeof(wireName), "%s", name);
    else name_from_filepath(file, wireName, 16);

    char reason[128] = {0};
    if (flash_write_file(type, bank, location - 1, file, wireName, reason, sizeof(reason)) != FLASH_WRITE_OK) {
        g2_err("put-location: %s: %s\n", file, reason);
        return NULL;
    }
    cJSON *result = cJSON_CreateObject();
    cJSON_AddStringToObject(result, "name", wireName);
    return result;
}

