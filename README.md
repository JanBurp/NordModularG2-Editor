# G2 CLI

Command-line editor for Nord G2 synthesizer.

## Prerequisites

- libusb-1.0
- macOS or Linux

## Build

```bash
make
```

## Run

```bash
./build/bin/g2-cli --help
```

### Examples

Connect to G2:
```bash
./build/bin/g2-cli connect
```

Get patch from slot A:
```bash
./build/bin/g2-cli get-patch A
```

List all patches:
```bash
./build/bin/g2-cli list patches
```

Watch for parameter changes:
```bash
./build/bin/g2-cli watch
```

## Test

Run all tests:
```bash
make test
```

Run unit tests only (no hardware required):
```bash
make test-unit
```

Run integration tests (requires G2 hardware):
```bash
make test-integration
```