# Changelog

All notable changes to G2 Editor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

<!-- When releasing: run `git cliff --unreleased --prepend CHANGELOG.md` to auto-generate from commits -->

## [Unreleased]

### Added
- Extensive logging and help output for CLI tool
- CLI and daemon binaries available as downloads
- Content-Security-Policy header for Electron renderer

### Fixed
- Settings panel now only shows options relevant to the current context
- Color picker was not area-aware; UX improved
- Save As dialog did not open for new (unsaved) patches

---

## [0.5.4] - 2025-01-01

### Fixed
- Help link on documentation page
- Install instructions and build artifact naming

---

## [0.5.0] - 2024-12-01

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
