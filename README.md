# Nord Modular G2 - Editor

Editor for the Nord Modular G2 - For macOS, Windows and Linux.

The original editor by Clavia does not work on macOS. A new editor, for all platforms, would benefit the future of the Nord G2.

## Current status

A lot is working, and a lot is not working ;-)
First goal is to have a basic working editor

- [x] Core USB Communication: connecting, disconnecting
- [x] Startup sequence, getting device info, patches from the slots, and list of patches and performances
- [x] Parsing of the patch data
- [x] Rendering of the patch (some modules and parameters needs attention)
- [x] Switch Slots & Variations (in editor & G2, synced)
- [x] Load & Save pch2 file
- [x] Adding, deleting, moving and change colors of modules. (also multiple modules)
- [ ] Rename module
- [x] Adding and deleting cables
- [ ] Change color of cable
- [x] Watch params change in editor, while changed on G2 - not tested with all params
- [x] Change params in editor and sync to G2 - not tested with all params
- [ ] Undo/Redo
- [ ] Update Led's
- [ ] Update VU meters
- [ ] Update CPU
- [ ] Editing synth settings
- [ ] Editing performance settings
- [ ] Editing patch settings
- [ ] ...
- [ ] Midi CC's
- [ ] Morphs
- [ ] Parameter Pages
- [ ] ...

### Screenshots of current status

27 april 2026:

![alt text](screenshots/G2-editor-00.jpg)

## Tech

Goals:

- An editor for multiple platforms, at least macOS, Windows and if possible Linux and then also Raspberry Pi.
- Using tech that is widely available and used by many developers.

This editor is build with electronjs, with TypeScript and VueJS.
It uses a C++ CLI tool to handle the USB communication. Which will be part of the build.

### Acknowledgement

A lot of the code is based on work of others from the Nord G2 community at https://electro-music.com, specialy the Delphi Editor by bverhue: https://www.bverhue.nl/g2dev/ and the patchviewer by ian-s: https://electro-music.com/patchviewer/. But also the g2ools from qfingers: https://electro-music.com/forum/viewtopic.php?t=15405.
