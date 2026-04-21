# G2 Editor

CLI and Electron GUI for Nord G2 synthesizer.

## Structure

- `cli/` - C CLI tool
- `g2-editor/` - Electron GUI app (Vue + TypeScript)

## Build CLI

```bash
cd cli && make
```

## Build Electron App

```bash
cd g2-editor
npm install
cd ../cli && make && cd ../g2-editor
npm run postinstall
npm run dev
```

## CLI Commands

```bash
./cli/build/bin/g2-cli --help
./cli/build/bin/g2-cli connect
./cli/build/bin/g2-cli settings
./cli/build/bin/g2-cli get-patch A
./cli/build/bin/g2-cli list patches
```

## Test CLI

```bash
cd cli && make test
```