# Changelog

All notable changes to G2 Editor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

<!-- When releasing: run `git cliff --unreleased --prepend CHANGELOG.md` to auto-generate from commits -->

## [Unreleased]

- Splash screen stays when update available

## [0.7.1] - 2026-10-12

### New
- Setting "Prevent wheel scroll": a mouse wheel no longer scrolls the patch canvas (knobs/sliders still respond; trackpad scrolling unaffected)

### Changed
- Improved click behaviour on switches
- Improved status-bar hints

### Fixed
- Fixed In/Out mini-module icons (arrows)
- Some mini-modules not visible in Module Picker
- Cable coloring with undo/redo
- Typo in About dialog
- Dead changelog link in documentation

## [0.7.0] - 2026-10-10

### New
- Assigning Morph Groups
- Assigning Parameter Pages
- Patch text notes
- Bank (patch & performance) upload/download, with Patch Browser integration
- Replace Module (swap a module in place)
- Selected module follows/sync selected module on synth
- Mini-modules picker
- Cable hovering emphasizes the whole connected nest
- Mouse-wheel interaction
- Zoom for patch area only
- New / Init 1 / Init 2 patch buttons
- Recent files in File menu
- Window size/position persisted across sessions
- Toasts, error popups, and contextual hints (UX review pass)
- Compact mode for the Extended Toolbar
- Click-click cabling mode, auto-connect/auto-suggest cabling, configurable cable snap range
- Delete a cable via keyboard while it's highlighted
- SeqNote piano-roll editor
- Sequencer Random/Clear
- Drum Synth presets
- Vocoder graph & preset selector
- RndPattern dropdown graphics
- Vertical spinner on selected knobs
- Open .pch2 / .prf2 files with the editor (file association)
- Double-click on canvas opens QuickAdd module popup
- VU meters can be assigned to Parameter Pages
- Reconnect dialog; editor re-uploads its slots after a reconnect

### Changed
- Toolbar layout reorganized
- Styling/UX polish across canvas, Morph Groups, Parameter Pages
- Undo/redo history improvements
- Improved MIDI Learn
- CMD-L / CMD-M shortcuts swapped
- Module graph visualizations fixed and now all modules have graphs
- Auto-connect / auto-suggest cabling
- Module default parameter values now match the hardware (e.g. Env KB and Mixer switches default on)

### Fixed
- Saving settings did not work allways (Windows)
- Patch category not saving correctly
- Editing actions not registering in undo history (offline mode)
- Light theme issues
- File saving (pch2 & prf2)
- Patch parser/serializer bugs (roundtrip issues)
- Voice mode not picked up / patch reloaded
- Label/name handling
- Several causes of the G2 hanging / not responding (USB timeouts, module index limit, deleting morphed modules, cable color changes, performance settings)
- Bank transfers producing wrong files or "Error" slots
- Performance shown as Patch mode (synth settings misread)
- Setting performance name gave an error
- Performance Settings menu item wrongly dimmed
- Edits overwritten by stale synth data after reconnect
- Cable colors for uprated signals, and some modules with mixed-up connectors/parameters

### Breaking
- Files saved before this version of this editor could be badly formatted

---

## [0.6.1] - 2026-07-04

### Fixed
- Windows CI build

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
