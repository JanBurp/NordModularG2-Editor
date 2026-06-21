# Changelog

All notable changes to G2 Editor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

<!-- When releasing: run `git cliff --unreleased --prepend CHANGELOG.md` to auto-generate from commits -->

## [Unreleased]

### Added
- Undo/Redo
- Copy Variation
- Themes: System, Light, Dark
- Graphics & Params for several modules improved/finished
- Missing VU meter's on Modules

### Changed
- Parameter sending smoother
- Documentation restructured

### Fixed
- Cable editing bug
- Swapped Gate LEDs
- Sequencer and VU LED rendering issues
- Sequencer Random/Clear buttons not working

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
- Settings panel now only shows options relevant to the current context
- Color picker was not area-aware; UX improved
- Save As dialog did not open for new (unsaved) patches

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
