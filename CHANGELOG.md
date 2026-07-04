# Changelog

All notable changes to G2 Editor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

<!-- When releasing: run `git cliff --unreleased --prepend CHANGELOG.md` to auto-generate from commits -->

## [Unreleased]

---

## [0.6.0] - 2026-07-04

### Added
- Undo/Redo
- Copy Variation
- Midi CC assignments
- Popups for MidiCC and values
- New Patch / New Performance implemented (#14)
- Patch browser: Load/Store/Delete/Sort actions implemented and UX improvements
- Module category search improvements
- Context menu and QuickAdd popup (M) for adding modules to patch
- Graphics & Params for several modules improved/finished
- Knob reset (double-click to reset to default)
- Themes: System, Light, Dark
- Cable editing improvements
- Cable rendering options
- Knob dial options
- Area position stored in patch (voice/fx/split)
- SidePanel open/closed state persisted as user preference
- Settings pane auto-opens last section
- Key commands help

### Changed
- Parameter sending smoother (#8)
- Documentation restructured
- Patch browser UX fully revised
- Faster performance loading (`select-perf`)
- SidePanel default state as setting
- Jack and cable coloring improved
- Key commands revised and documentation updated

### Fixed
- Swapped Gate LEDs
- Sequencer and VU LED rendering issues (#10)
- Sequencer Random/Clear buttons not working (#9)
- Performance name bug when switching from patch mode
- Switching slots, also changes key (#11)
- Cable editing bug (split area)
- Windows scrollbar consuming layout space
- Error popup when closing editor (#12)
- Patch load from synth (#15)
- Input focus bug
- Enter key in SetValue dialog
- VU meters mixed up in renderer
- Module rename not area-aware
- Corrupted paramname length in parser
- Label rename bug (CLI and editor)
- Performance file upload flow robustness
- Missing VU meter's on Modules
- Compressor module outputs swapped (R-L)
- Input pad parameter mapping

---

## [0.5.6] - 2026-06-14

### Added
- System requirements section in documentation
- USB driver documentation for Windows
- Download links for latest builds in documentation (no need to look at Releases)
- All remaining CLI commands wired up in doc
- Loading status indicator during connection
- Editor version and platform logged on startup

### Fixed
- libusb detection on older macOS versions (make build)
- Cleaner usb-could-not-claim error messages on macOS and Windows
- More robust error logging when USB device cannot be claimed


---

## [0.5.5] - 2026-06-12


### Added
- Extensive logging and help output for CLI tool
- CLI and daemon binaries available as downloads
- Content-Security-Policy header for Electron renderer

### Fixed
- Settings panel now only shows options relevant to the current context (#3)
- Color picker was not area-aware; UX improved (#1)
- Save As dialog did not open for new (unsaved) patches (#2)

---

## [0.5.4] - 2026-06-11

### Fixed
- Help link on documentation page
- Install instructions and build artifact naming

---

## [0.5.0] - 2026-06-11

### Added
- About dialog
- New application icons
- Module help integrated into build
- E2E test suite (headless + offline modes)
- Test patches for development

### Changed
- Modules panel as default side panel
- Local build script made more robust and clean

### Fixed
- Connection timeout handling
- Resources parsing

---

## Notes on versioning

To prepare a release with git-cliff:

```bash
# Install once (macOS)
brew install git-cliff

# Generate CHANGELOG entries from unreleased conventional commits
git cliff --unreleased --prepend CHANGELOG.md

# Bump version and tag
cd g2-editor && npm version patch   # or minor / major
git add CHANGELOG.md g2-editor/package.json
git commit -m "chore: release v$(node -p "require('./g2-editor/package.json').version")"
git tag "v$(node -p "require('./g2-editor/package.json').version")"
git push && git push --tags
```

Commit messages in `type: description` format (e.g. `feat:`, `fix:`, `chore:`) give git-cliff richer output.
