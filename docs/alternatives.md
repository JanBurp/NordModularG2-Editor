---
title: Other Editors
nav_order: 5
---

# Other Nord Modular G2 Editors

There are a few other open-source approaches to editing the Nord Modular G2. Here is a quick comparison:

|  | **This Editor** | [G2-Edit](https://github.com/chrispurusha/G2-Edit) | [Cube G2 Editor](https://cubeg2.github.io/) | [G2Dev](https://www.bverhue.nl/g2dev/) (Delphi editor) | [g2-webeditor](https://github.com/ty-art-ty/g2-webeditor) | [g2fx](https://github.com/sirlensalot/g2fx) |
|---|---|---|---|---|---|---|
| **Platform** | macOS, Windows (Linux planned) | macOS only (Windows in progress) | macOS 15+ (Apple Silicon only) | Windows, macOS (Android unfinished) | Any browser | macOS (Apple Silicon), Windows 11 |
| **Approach** | Electron desktop app + C USB daemon | C++                                                         | Native Mac app | Native Delphi/FireMonkey app; also a VST plugin and TCP-IP sync between editors | Browser-only; needs a separate hardware USB bridge | Native app; |
| **Open source** | Yes | Yes | [Yes](https://github.com/cubeg2/cube-g2-editor) (GPL-3.0) | Yes | Yes | Yes (BSD-3-Clause) |
| **Pros** | Active development. Multi-platform; full feature set (in progress) | Active development. Full feature set. Sound Engine. | Active development. Native Mac. Spectrum/X-Y scopes via audio interface | Exposes hidden driver/resonator modules not in the official editor; VST + network sync | No install; runs in any browser |  |
| **Cons** | Due to used electron platform, maybe slower then native alternatives. | Modules look different. | Apple Silicon Macs only. | No longer maintained. | Needs extra hardware bridge to reach the G2; no offline use | Not much information. |

All six projects are open source and free to use.
