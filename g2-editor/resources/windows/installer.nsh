; Installs UsbDk once (one UAC prompt), so libusb can open the G2 without Zadig/WinUSB.
; UsbDk is a filter driver: Clavia's driver stays bound and the original editor keeps working.
; Uninstalling the editor leaves UsbDk installed (Settings → Apps → "UsbDk Runtime Libraries").
; Skipped on Windows on ARM: UsbDk has no ARM64 driver (x64 drivers can't load there), so those
; users need WinUSB via Zadig. The native architecture is read from the registry because this
; 32-bit installer's own environment reports x86.
!macro customInstall
  ReadRegStr $1 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PROCESSOR_ARCHITECTURE"
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\UsbDk" "ImagePath"
  ${If} $1 != "ARM64"
  ${AndIf} $0 == ""
    ExecShellWait "runas" "msiexec.exe" '/i "$INSTDIR\resources\UsbDk_x64.msi" /passive /norestart'
  ${EndIf}
!macroend
