#!/bin/bash

# electron-builder's default deb after-remove (app-builder-lib/templates/linux/after-remove.tpl),
# plus removal of the G2 udev rule. Keep in sync with the default on electron-builder upgrades.

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/usr/bin/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

# Only on a real remove: on upgrade the new version's after-install puts the rule back anyway
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    rm -f /etc/udev/rules.d/70-nord-g2.rules
    if hash udevadm 2>/dev/null; then
        udevadm control --reload-rules || true
    fi
fi
