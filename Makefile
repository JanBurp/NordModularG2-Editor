# G2 CLI Makefile
# Build C CLI tool for Nord G2 synthesizer

CC = gcc
CFLAGS = -Wall -Wextra -Iinclude -I. -I/opt/homebrew/Cellar/libusb/1.0.29/include/libusb-1.0 -g
LDFLAGS = -L/opt/homebrew/Cellar/libusb/1.0.29/lib -lusb-1.0 -pthread
TARGET = g2-cli
SRC_DIR = src
INCLUDE_DIR = include
BUILD_DIR = build
OBJ_DIR = $(BUILD_DIR)/obj
BIN_DIR = $(BUILD_DIR)/bin

# Source files
SRC_FILES = $(wildcard $(SRC_DIR)/*.c)
OBJ_FILES = $(SRC_FILES:$(SRC_DIR)/%.c=$(OBJ_DIR)/%.o)

# Headers
HEADERS = $(wildcard $(INCLUDE_DIR)/*.h)

.PHONY: all clean depend info

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

depend:
	$(CC) $(CFLAGS) -MM $(SRC_FILES) > .depend

-include .depend
