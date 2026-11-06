#!/bin/bash

# electron-builder's default deb after-remove (app-builder-lib/templates/linux/after-remove.tpl, electron-builder 26),
# plus removal of the G2 udev rule. Keep in sync with the default on electron-builder upgrades.

# Delete the link to the binary
# update-alternatives --remove <name> <path>: 'path' must be the registered alternative binary,
# not the generic symlink — see https://man7.org/linux/man-pages/man1/update-alternatives.1.html
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

APPARMOR_PROFILE_DEST='/etc/apparmor.d/${executable}'

# Remove and unload apparmor profile.
if [ -f "$APPARMOR_PROFILE_DEST" ]; then
  # Unload the profile from the running kernel before deleting the file so the
  # policy is not left enforced until the next reboot.  Mirror the chroot guard
  # used in the after-install script — live AppArmor operations are not
  # meaningful inside a chroot.
  # https://wiki.debian.org/AppArmor/HowToUse
  if apparmor_status --enabled > /dev/null 2>&1; then
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
    fi
  fi
  rm -f "$APPARMOR_PROFILE_DEST"
fi

# Only on a real remove: on upgrade the new version's after-install puts the rule back anyway
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    rm -f /etc/udev/rules.d/70-nord-g2.rules
    if hash udevadm 2>/dev/null; then
        udevadm control --reload-rules || true
    fi
fi
