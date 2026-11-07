#!/bin/bash
# Double-click in Finder to start Trifold in dev mode (console + player windows, hot reload).
# Close the Terminal window, or press Ctrl+C in it, to stop the app.
cd "$(dirname "$0")" || exit 1
unset ELECTRON_RUN_AS_NODE
pnpm dev
