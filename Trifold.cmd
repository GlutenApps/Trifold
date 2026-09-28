@echo off
rem Double-click to start Trifold in dev mode (console + player windows, hot reload).
rem Close this window, or press Ctrl+C in it, to stop the app.
title Trifold (dev)
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
call pnpm dev
if errorlevel 1 pause
