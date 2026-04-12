# G2 CLI Makefile
# Build C CLI tool for Nord G2 synthesizer

CC = gcc
CFLAGS = -Wall -Wextra -Iinclude -Itest -I. -I/opt/homebrew/Cellar/libusb/1.0.29/include/libusb-1.0 -g
LDFLAGS = -L/opt/homebrew/Cellar/libusb/1.0.29/lib -lusb-1.0 -pthread
TARGET = g2-cli
SRC_DIR = src
TEST_DIR = test
INCLUDE_DIR = include
BUILD_DIR = build
OBJ_DIR = $(BUILD_DIR)/obj
BIN_DIR = $(BUILD_DIR)/bin
TEST_BUILD_DIR = $(BUILD_DIR)/test
TEST_BIN = $(TEST_BUILD_DIR)/g2-tests

# Source files
SRC_FILES = $(wildcard $(SRC_DIR)/*.c)
OBJ_FILES = $(SRC_FILES:$(SRC_DIR)/%.c=$(OBJ_DIR)/%.o)

# Test source files
TEST_SRC = $(wildcard $(TEST_DIR)/*.c)
TEST_SRC := $(filter-out $(TEST_DIR)/run_tests.c, $(TEST_SRC))

# Headers
HEADERS = $(wildcard $(INCLUDE_DIR)/*.h)

.PHONY: all clean depend info test

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
test: $(TEST_BIN)
	@echo "Running tests..."
	./$(TEST_BIN)

$(TEST_BIN): $(TEST_DIR)/run_tests.c $(TEST_SRC) $(OBJ_FILES) | $(TEST_BUILD_DIR)
	$(CC) $(CFLAGS) $(TEST_DIR)/run_tests.c \
		$(TEST_SRC) \
		$(OBJ_DIR)/g2_device.o \
		$(OBJ_DIR)/utils.o \
		$(OBJ_DIR)/bitstream.o \
		$(OBJ_DIR)/cjson.o \
		$(OBJ_DIR)/output.o \
		$(LDFLAGS) -o $@
	@echo "Built: $@"

$(TEST_BUILD_DIR):
	mkdir -p $(TEST_BUILD_DIR)
