; electron-builder includes this file from build/ automatically.
;
; A fresh install opens on a welcome page, so the stacked lockup on installerSidebar.bmp is the
; first thing the DM sees (docs/brand/BRAND.md §3), and ends on a finish page with "Run Trifold".
;
; An in-app update (Restart now, ADR 0045) runs this installer with --updated and without /S, so
; the DM sees a progress window instead of nothing while the old version is replaced. It skips
; every page but the progress bar (ADR 0053): welcome, install mode (an update keeps the mode it
; has), folder (skipped by electron-builder) and finish, which starts the new version instead.

!macro customWelcomePage
  Function trifoldWelcomePre
    ${if} ${isUpdated}
      Abort
    ${endif}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_PRE trifoldWelcomePre
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Runs before the "Install for anyone / only for me" page. An update installs where the current
; version is; the page shows only if both a per-user and a per-machine copy exist.
!macro customInstallMode
  ${if} ${isUpdated}
    ${if} $hasPerUserInstallation == "1"
    ${andIf} $hasPerMachineInstallation == "0"
      StrCpy $isForceCurrentInstall "1"
    ${elseIf} $hasPerUserInstallation == "0"
    ${andIf} $hasPerMachineInstallation == "1"
      StrCpy $isForceMachineInstall "1"
    ${endif}
  ${endif}
!macroend

; The progress page's heading: an update says Trifold reopens by itself, so nobody starts it by
; hand halfway through. (electron-builder sets this page's PRE function; SHOW is free.)
!macro customPageAfterChangeDir
  Function trifoldInstFilesShow
    ${if} ${isUpdated}
      !insertmacro MUI_HEADER_TEXT "Updating Trifold" "Trifold opens again by itself when this finishes."
    ${endif}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW trifoldInstFilesShow
!macroend

!macro customFinishPage
  Function trifoldStartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  ; An update needs no finish page: start the new version and close, as the silent install did.
  Function trifoldFinishPre
    ${if} ${isUpdated}
      HideWindow
      Call trifoldStartApp
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE trifoldFinishPre
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "trifoldStartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend
