# G2 CLI Makefile
# Build C CLI tool for Nord G2 synthesizer

CC      ?= gcc
LIBUSB_CFLAGS ?= $(shell \
  pkg-config --cflags libusb-1.0 2>/dev/null || \
  (test -d /opt/homebrew/include/libusb-1.0 && echo "-I/opt/homebrew/include/libusb-1.0") || \
  (test -d /usr/local/include/libusb-1.0 && echo "-I/usr/local/include/libusb-1.0") || \
  (test -d /opt/local/include/libusb-1.0 && echo "-I/opt/local/include/libusb-1.0"))
LIBUSB_LIBS   ?= $(shell \
  pkg-config --libs libusb-1.0 2>/dev/null || \
  (test -f /opt/homebrew/lib/libusb-1.0.dylib && echo "-L/opt/homebrew/lib -lusb-1.0") || \
  (test -f /usr/local/lib/libusb-1.0.dylib && echo "-L/usr/local/lib -lusb-1.0") || \
  (test -f /opt/local/lib/libusb-1.0.dylib && echo "-L/opt/local/lib -lusb-1.0"))
CFLAGS  = -Wall -Wextra -Iinclude -Itest -I. $(LIBUSB_CFLAGS) $(ARCH_FLAGS) -g -DUNITY_OUTPUT_COLOR
LDFLAGS = $(LIBUSB_LIBS) $(ARCH_FLAGS) -pthread
TARGET = g2-cli
SRC_DIR = src
TEST_DIR = test
INCLUDE_DIR = include
BUILD_DIR = build
OBJ_DIR = $(BUILD_DIR)/obj
BIN_DIR = $(BUILD_DIR)/bin
TEST_BUILD_DIR = $(BUILD_DIR)/test

# Source files
SRC_FILES = $(wildcard $(SRC_DIR)/*.c)
OBJ_FILES = $(SRC_FILES:$(SRC_DIR)/%.c=$(OBJ_DIR)/%.o)

# Test source files
TEST_SRC = $(wildcard $(TEST_DIR)/*.c)
# Runner mains (run_tests_*.c) and the hardware runners' shared helpers are linked per runner
TEST_SRC := $(filter-out $(TEST_DIR)/run_tests_%.c $(TEST_DIR)/runner_common.c, $(TEST_SRC))
# Exclude mocks directory
TEST_SRC := $(filter-out $(TEST_DIR)/mocks/%, $(TEST_SRC))

# Headers
HEADERS = $(wildcard $(INCLUDE_DIR)/*.h)

.PHONY: all clean depend info test test-unit test-cli test-e2e test-e2e-slow clean-tests

all: info $(BIN_DIR)/$(TARGET)

info:
	@echo "G2 CLI - Building Nord G2 CLI tool"
	@echo "CC: $(CC)"
	@echo "CFLAGS: $(CFLAGS)"

$(BIN_DIR)/$(TARGET): $(OBJ_FILES) | $(BIN_DIR)
	$(CC) $(OBJ_FILES) $(LDFLAGS) -o $@
	@echo "Built: $@"

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c $(HEADERS) | $(OBJ_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# CLI version = editor version (g2-editor/package.json); main.o rebuilds when it changes.
EDITOR_PACKAGE = ../g2-editor/package.json
VERSION := $(shell sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' $(EDITOR_PACKAGE) | head -1)
$(OBJ_DIR)/main.o: CFLAGS += -DPROGRAM_VERSION='"$(VERSION)"'
$(OBJ_DIR)/main.o: $(EDITOR_PACKAGE)

$(OBJ_DIR):
	mkdir -p $(OBJ_DIR)

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

clean:
	rm -rf $(BUILD_DIR)

clean-tests:
	rm -rf $(TEST_BUILD_DIR)

depend:
	$(CC) $(CFLAGS) -MM $(SRC_FILES) > .depend

-include .depend

# Test rules
# unit, then cli + e2e; without a G2 the hardware suites print NOT RUN and are skipped
test: test-unit
	@G2_ALLOW_NO_DEVICE=1 $(MAKE) --no-print-directory test-cli test-e2e

test-unit: $(TEST_BUILD_DIR)/g2-unit-tests
	./$<

# Hardware suites: with no G2 detected the runner exits 1 ("NOT RUN") unless G2_ALLOW_NO_DEVICE=1 is set.
# CLI: one-shot commands and in-process g2_* calls, no daemon.
test-cli: $(TEST_BUILD_DIR)/g2-cli-tests
	./$<

# Daemon: shared-daemon and multi-daemon tests.
test-e2e: $(TEST_BUILD_DIR)/g2-e2e-tests
	./$<

# Not part of `make test`: bank transfer tests scan whole hardware banks
# (up to 128 round trips per bank touched) and run for minutes - see run_tests_e2e_slow.c.
test-e2e-slow: $(TEST_BUILD_DIR)/g2-e2e-slow-tests
	./$<

TEST_LINK_OBJS = $(filter-out $(OBJ_DIR)/main.o, $(OBJ_FILES))
HW_RUNNER_SRC = $(TEST_DIR)/runner_common.c

$(TEST_BUILD_DIR)/g2-unit-tests: $(TEST_DIR)/run_tests_unit.c
$(TEST_BUILD_DIR)/g2-cli-tests: $(TEST_DIR)/run_tests_cli.c $(HW_RUNNER_SRC)
$(TEST_BUILD_DIR)/g2-e2e-tests: $(TEST_DIR)/run_tests_e2e.c $(HW_RUNNER_SRC)
$(TEST_BUILD_DIR)/g2-e2e-slow-tests: $(TEST_DIR)/run_tests_e2e_slow.c $(HW_RUNNER_SRC)

$(TEST_BUILD_DIR)/g2-%-tests: $(TEST_SRC) $(OBJ_FILES) | $(TEST_BUILD_DIR)
	$(CC) $(CFLAGS) $(filter %.c, $^) $(TEST_LINK_OBJS) $(LDFLAGS) -o $@
	@echo "Built: $@"

$(TEST_BUILD_DIR):
	mkdir -p $(TEST_BUILD_DIR)
