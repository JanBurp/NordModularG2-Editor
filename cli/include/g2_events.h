/*
 * G2 CLI - USB event formatter
 *
 * Decodes raw g2_msg_t messages received from the listener thread and
 * writes them as JSON lines to stdout. Shared by the watch loop and the
 * daemon main loop.
 */

#ifndef G2_EVENTS_H
#define G2_EVENTS_H

#include "g2_io.h"

/* 1 = emit LED/volume JSON; 0 = suppress (set via daemon "verbose" command) */
extern int g2_watch_verbose;

/* 1 = running as `daemon`, where multi-line JSON-per-event stdout is the intended
 * streaming protocol; 0 (default) = a one-shot command, where a caller/script expects
 * exactly one JSON object on stdout. Set once, at the top of g2_daemon_run(). Gates
 * whether g2_emit_event() relays a stray/unexpected message to stdout (daemon mode) or
 * stderr (one-shot mode, so it's still visible without breaking the single-object
 * contract). */
extern int g2_daemon_mode;

/* Format msg as JSON and write to stdout. */
void g2_emit_event(const g2_msg_t *msg);

/* Query synth settings (with patches) + perf settings and emit them to stdout.
 * Called from rearm_with_version_update() after any BULK_REARM event. */
void g2_emit_rearm_data(void);

#endif /* G2_EVENTS_H */
