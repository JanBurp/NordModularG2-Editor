---
title: Technical Reference
nav_order: 7
has_children: true
---

# Technical Reference

Documentation for developers working on or with the Nord Modular G2 Editor.

## Sections

- [Development Setup](development-setup) — build instructions for CLI and Electron app
- [CLI Commands](cli-commands) — full reference for the `g2-cli` command-line tool
- [USB Protocol](usb-protocol) — USB framing, commands, watch events, daemon architecture
- [Patch File Format](patch-format) — PCH2/PRF2 binary format, sections, bit encoding

## Repository Structure

```
cli/             C CLI tool for USB communication with the G2 hardware
g2-editor/       Electron desktop app (Vue 3 + TypeScript)
test-patches/    Sample .pch2 files for testing
doc/             Module help files (used by the in-app help system)
docs/            This documentation site
```
