#!/bin/bash
# Double-click in Finder to open a second copy of Trifold as a player (docs/PLAYER-MODE.md),
# beside the one Trifold.command runs. Start Trifold.command first: this copy uses what it built,
# has its own Library in .dev-player, and has player mode on.
# Close the Terminal window, or press Ctrl+C in it, to stop the player copy.
cd "$(dirname "$0")" || exit 1
unset ELECTRON_RUN_AS_NODE
pnpm dev:player
