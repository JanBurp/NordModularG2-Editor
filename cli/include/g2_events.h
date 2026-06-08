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

/* Format msg as JSON and write to stdout. */
void g2_emit_event(const g2_msg_t *msg);

/* Query synth settings (with patches) + perf settings and emit them to stdout.
 * Called from rearm_with_version_update() after any BULK_REARM event. */
void g2_emit_rearm_data(void);

#endif /* G2_EVENTS_H */
