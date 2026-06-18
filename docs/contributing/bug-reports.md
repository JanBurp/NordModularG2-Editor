---
title: Bug Reports
parent: Contributing
nav_order: 1
---

# Bug Reports

Thank you for testing! Your feedback is invaluable for improving the editor.

## How to Report an Issue

Please file issues in the [GitHub issue tracker](https://github.com/janburp/NordModularG2-Editor/issues).

When filing an issue, include:

- **What you did** — step-by-step instructions to reproduce the problem
- **What you expected** — what should have happened
- **What actually happened** — what went wrong, including any error messages
- **Your setup** — operating system, editor version, and whether you were connected to a G2 device
- **A patch file** — if the issue is related to a specific patch, attach the `.pch2` file

The more detail you provide, the better. If I cannot replicate the issue, I cannot investigate or fix it.

## Tips for Good Bug Reports

- Find the **minimal steps** to reproduce — simpler is better
- Check if the issue is already reported before filing a new one
- One issue per report — don't combine multiple problems in one ticket

## Viewing the Console Log

The editor logs USB traffic, connection status, and commands to the DevTools console. Including this output in a bug report is very helpful.

**To open the console:**
- Menu: **View → Toggle DevTools** (or `Cmd+Shift+I` on Mac, `Ctrl+Shift+I` on Windows/Linux)
- Click the **Console** tab

**To save the log:**
1. Right-click anywhere inside the console panel
2. Choose **Save as...** and save the file
3. Attach the saved file to your issue report
