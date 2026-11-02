#!/bin/bash

# electron-builder's default deb after-install (app-builder-lib/templates/linux/after-install.tpl),
# plus the G2 udev rule and the AppArmor profile at the end. A custom afterInstall replaces the default, so keep both in sync.

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# SUID chrome-sandbox for Electron 5+
chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# USB access to the G2 for the logged-in user (no driver needed on Linux, only permission)
install -m 644 '/opt/${sanitizedProductName}/resources/70-nord-g2.rules' /etc/udev/rules.d/70-nord-g2.rules || true
if hash udevadm 2>/dev/null; then
    udevadm control --reload-rules || true
    udevadm trigger --subsystem-match=usb --attr-match=idVendor=0ffc || true
fi

# Ubuntu 24.04+ restricts user namespaces, so Electron's sandbox falls back to the SUID chrome-sandbox,
# which fails on the space in "/opt/G2 Editor" (execvp "/opt/G2"). This AppArmor profile allows the
# normal namespace sandbox. Only where AppArmor knows abi 4.0: older systems don't restrict namespaces.
if hash apparmor_parser 2>/dev/null && [ -f /etc/apparmor.d/abi/4.0 ]; then
    cat > '/etc/apparmor.d/${executable}' <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile ${executable} "/opt/${sanitizedProductName}/${executable}" flags=(unconfined) {
  userns,
  include if exists <local/${executable}>
}
EOF
    apparmor_parser -r '/etc/apparmor.d/${executable}' || true
fi
