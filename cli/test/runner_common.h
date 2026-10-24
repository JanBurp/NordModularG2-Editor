/*
 * G2 CLI - shared helpers for the hardware test runners
 * (run_tests_cli.c, run_tests_e2e.c, run_tests_e2e_slow.c).
 */
#ifndef RUNNER_COMMON_H
#define RUNNER_COMMON_H

/* Returns -1 when a G2 is on USB (run the suite). Otherwise prints why nothing ran and
 * returns main()'s exit code: 0 with G2_ALLOW_NO_DEVICE set, 1 without. */
int g2_preflight(const char *suite);

/* Runs one Unity test with its stdout captured, printing only "<name> PASS|FAIL|SKIP: <reason>"
 * (G2_TEST_VERBOSE=1 shows the captured output instead). Returns 1 if the test skipped
 * because the G2 is "not connected" - lets a runner stop instead of skipping the rest one by one. */
int run_test_silently(const char *name, void (*test_func)(void));

#endif
