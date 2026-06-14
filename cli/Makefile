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
TEST_SRC := $(filter-out $(TEST_DIR)/run_tests.c, $(TEST_SRC))
TEST_SRC := $(filter-out $(TEST_DIR)/run_tests_unit.c, $(TEST_SRC))
TEST_SRC := $(filter-out $(TEST_DIR)/run_tests_integration.c, $(TEST_SRC))
# Exclude mocks directory
TEST_SRC := $(filter-out $(TEST_DIR)/mocks/%, $(TEST_SRC))

# Headers
HEADERS = $(wildcard $(INCLUDE_DIR)/*.h)

.PHONY: all clean depend info test test-unit test-integration clean-tests

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
test: test-unit test-integration

test-unit: $(TEST_BUILD_DIR)/g2-unit-tests
	@echo "Running unit tests..."
	./$(TEST_BUILD_DIR)/g2-unit-tests

test-integration: $(TEST_BUILD_DIR)/g2-integration-tests
	@echo "Running integration tests..."
	./$(TEST_BUILD_DIR)/g2-integration-tests

$(TEST_BUILD_DIR)/g2-unit-tests: $(TEST_DIR)/run_tests_unit.c $(TEST_SRC) $(OBJ_FILES) | $(TEST_BUILD_DIR)
	$(CC) $(CFLAGS) $(TEST_DIR)/run_tests_unit.c \
		$(TEST_SRC) \
		$(OBJ_DIR)/daemon.o \
		$(OBJ_DIR)/g2_device.o \
		$(OBJ_DIR)/g2_io.o \
		$(OBJ_DIR)/g2_protocol.o \
		$(OBJ_DIR)/g2_events.o \
		$(OBJ_DIR)/utils.o \
		$(OBJ_DIR)/bitstream.o \
		$(OBJ_DIR)/cjson.o \
		$(OBJ_DIR)/output.o \
		$(LDFLAGS) -o $@
	@echo "Built: $@"

$(TEST_BUILD_DIR)/g2-integration-tests: $(TEST_DIR)/run_tests_integration.c $(TEST_SRC) $(OBJ_FILES) | $(TEST_BUILD_DIR)
	$(CC) $(CFLAGS) $(TEST_DIR)/run_tests_integration.c \
		$(TEST_SRC) \
		$(OBJ_DIR)/daemon.o \
		$(OBJ_DIR)/g2_device.o \
		$(OBJ_DIR)/g2_io.o \
		$(OBJ_DIR)/g2_protocol.o \
		$(OBJ_DIR)/g2_events.o \
		$(OBJ_DIR)/utils.o \
		$(OBJ_DIR)/bitstream.o \
		$(OBJ_DIR)/cjson.o \
		$(OBJ_DIR)/output.o \
		$(LDFLAGS) -o $@
	@echo "Built: $@"

$(TEST_BUILD_DIR):
	mkdir -p $(TEST_BUILD_DIR)
