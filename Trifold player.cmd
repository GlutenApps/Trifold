@echo off
rem Double-click to open a second copy of Trifold as a player (docs/PLAYER-MODE.md), beside the
rem one Trifold.cmd runs. Start Trifold.cmd first: this copy uses what it built, has its own
rem Library in .dev-player, and has player mode on.
rem Close this window, or press Ctrl+C in it, to stop the player copy.
title Trifold player (dev)
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
call pnpm dev:player
if errorlevel 1 pause
