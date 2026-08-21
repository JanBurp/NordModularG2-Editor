---
title: Other Editors
nav_order: 5
---

# Other Nord Modular G2 Editors

There are a few other open-source approaches to editing the Nord Modular G2. Here is a quick comparison:

|  | **This Editor** | [G2-Edit](https://github.com/chrispurusha/G2-Edit) | [G2Dev](https://www.bverhue.nl/g2dev/) (Delphi editor) | [g2-webeditor](https://github.com/ty-art-ty/g2-webeditor) | [g2fx](https://github.com/sirlensalot/g2fx) |
|---|---|---|---|---|---|
| **Platform** | macOS, Windows (Linux planned) | macOS only (could be ported) | Windows, macOS (Android unfinished) | Any browser | macOS (Apple Silicon), Windows 11 |
| **Approach** | Electron desktop app + C USB daemon | C++                                                         | Native Delphi/FireMonkey app; also a VST plugin and TCP-IP sync between editors | Browser-only; needs a separate hardware USB bridge | Native app; |
| **Open source** | Yes | Yes | Yes | Yes | Yes (BSD-3-Clause) |
| **Pros** | Multi-platform; full feature set (in progress); active development | Active development. Full feature set. Potentially faster UI | Exposes hidden driver/resonator modules not in the official editor; VST + network sync | No install; runs in any browser |  |
| **Cons** | Requires USB driver on Windows | macOS only (for now) | No longer maintained. | Needs extra hardware bridge to reach the G2; no offline use | Not much information. |

All five projects are open source and free to use.
