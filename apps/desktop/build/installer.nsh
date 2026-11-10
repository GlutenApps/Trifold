; Opens the assisted installer on a welcome page, so the stacked lockup on installerSidebar.bmp
; is the first thing the DM sees (docs/brand/BRAND.md §3). electron-builder includes this file
; from build/ automatically.
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend
