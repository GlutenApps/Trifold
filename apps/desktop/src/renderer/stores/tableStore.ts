import { create } from 'zustand';
import {
  mediaUrl,
  type ReclaimMode,
  type TableReleaseTarget,
  type TableSnapshot,
  type TableStatus,
} from '@trifold/api';
import { errorMessage } from '@trifold/schema';
import { applyTableIntent } from '../features/players/applyIntent';
import { fogMapJpeg } from '../features/players/fogImage';
import { handleSummonEvent, installSummonUpkeep } from '../features/players/summons';
import { tableSnapshotFrom } from '../features/players/snapshot';
import { tokenArtUrl } from '../features/presenter/tokenArt';
import { useArtStore } from './artStore';
import { useCampaignStore } from './campaignStore';
import { useCombatStore } from './combatStore';
import { usePresenterStore } from './presenterStore';
import { useSceneStore } from './sceneStore';
import { activeFog, isRevealed } from '@trifold/rules';
import { DEFAULT_GRID } from '../features/presenter/mapMath';
import { cellCentre, squaresBetween } from '../features/presenter/ruler';

/**
 * The player connector as the console sees it (ADR 0043). Main owns the server, the devices and
 * the claims; this mirrors its status from `tableStatus` events and, while it runs, keeps main
 * fed with what the table may see (`installTableSync`).
 */
interface TableState {
  status: TableStatus | null;
  /**
   * Show join code on TV (PLAYER-CONNECTOR.md, "Joining"): off by default, not kept across
   * restarts.
   */
  joinOnTv: boolean;
  /** A failed request from the Player devices pop-up, shown there as a banner. */
  error: string | null;
  load(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  release(target: TableReleaseTarget): Promise<void>;
  setReclaimMode(mode: ReclaimMode): Promise<void>;
  answer(requestId: string, accept: boolean): Promise<void>;
  give(target: { kind: 'pc' | 'npc'; id: string }, deviceId: string): Promise<void>;
  setMovementLock(
    target: 'all' | { kind: 'pc' | 'npc'; id: string },
    locked: boolean,
  ): Promise<void>;
  setSummoning(summoning: { mode: 'on' | 'approval' | 'off'; cap: number }): Promise<void>;
  setJoinOnTv(on: boolean): void;
  receive(status: TableStatus): void;
}

export const useTableStore = create<TableState>((set) => {
  const run = async (task: () => Promise<TableStatus>) => {
    try {
      set({ status: await task(), error: null });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  };
  return {
    status: null,
    joinOnTv: false,
    error: null,
    load: () => run(() => window.trifold.table.status()),
    async start() {
      const id = useCampaignStore.getState().current?.campaign.id;
      if (id) await run(() => window.trifold.table.start(id));
    },
    stop: () => run(() => window.trifold.table.stop()),
    release: (target) => run(() => window.trifold.table.release(target)),
    setReclaimMode: (mode) => run(() => window.trifold.table.setReclaimMode(mode)),
    answer: (requestId, accept) => run(() => window.trifold.table.answer(requestId, accept)),
    give: (target, deviceId) => run(() => window.trifold.table.give(target, deviceId)),
    setMovementLock: (target, locked) =>
      run(() => window.trifold.table.setMovementLock(target, locked)),
    setSummoning: (summoning) => run(() => window.trifold.table.setSummoning(summoning)),
    setJoinOnTv: (joinOnTv) => set({ joinOnTv }),
    receive: (status) => set({ status }),
  };
});

/** Whether the server is serving the open campaign. */
export const tableOn = (status: TableStatus | null, campaignId: string | undefined): boolean =>
  status?.state === 'on' && !!campaignId && status.campaignId === campaignId;

/**
 * While the server runs for the open campaign: pushes a table snapshot whenever the live scene,
 * the fight, the party, the NPCs or creature art change (once per frame at most), draws the
 * fogged map image once per fog change, and keeps the TV's join code in step. Closing or
 * switching the campaign stops the server. Returns the unsubscribe.
 */
export function installTableSync(): () => void {
  let frame: number | null = null;
  let lastSnapshot = '';
  let lastImageKey = '';
  let wasOn = false;

  const push = () => {
    frame = null;
    const { status } = useTableStore.getState();
    const current = useCampaignStore.getState().current;
    if (!current || !tableOn(status, current.campaign.id)) return;
    const presenter = usePresenterStore.getState();
    const liveScene = presenter.liveSource?.scene ?? null;
    const slug = current.campaign.slug;
    const snapshot: TableSnapshot = tableSnapshotFrom({
      campaign: {
        id: current.campaign.id,
        name: current.campaign.name,
        tokenStyle: current.campaign.settings.tokenStyle,
        summonable: current.campaign.settings.summonable,
      },
      pcs: current.pcs,
      npcs: current.npcs,
      presenter: presenter.state,
      liveScene,
      combat: useCombatStore.getState().state,
      artFor: (t) => tokenArtUrl(t, slug),
      portraitUrl: (path) => mediaUrl(slug, path),
      // Players' drags in progress show to the other phones too.
      moving: presenter.moving,
      held: new Set(status!.devices.flatMap((d) => d.claims.map((c) => `${c.kind}:${c.id}`))),
    });
    const text = JSON.stringify(snapshot);
    if (text !== lastSnapshot) {
      lastSnapshot = text;
      void window.trifold.table.push(snapshot);
    }
    const scene = snapshot.scene;
    const image = liveScene?.image;
    if (scene && image) {
      const key = `${scene.id}|${scene.imageKey}`;
      if (key !== lastImageKey) {
        lastImageKey = key;
        void fogMapJpeg(
          mediaUrl(slug, image.displayPath),
          scene.width,
          scene.height,
          scene.fog?.shapes ?? null,
        )
          .then((jpeg) => {
            if (lastImageKey === key) {
              void window.trifold.table.setMapImage(scene.id, scene.imageKey, jpeg);
            }
          })
          .catch(() => {
            // Leave the key unset so the next change tries again; phones keep the backdrop.
            if (lastImageKey === key) lastImageKey = '';
          });
      }
    }
  };

  const schedule = () => {
    if (frame !== null) return;
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: () => void) => window.setTimeout(cb, 16);
    frame = raf(push);
  };

  const syncJoinCode = () => {
    const { status, joinOnTv } = useTableStore.getState();
    const on = tableOn(status, useCampaignStore.getState().current?.campaign.id);
    const url = status?.urls[0];
    usePresenterStore
      .getState()
      .setJoinCode(on && joinOnTv && url ? { url, localUrl: status.localUrl } : null);
  };

  const onTable = () => {
    const { status } = useTableStore.getState();
    const on = tableOn(status, useCampaignStore.getState().current?.campaign.id);
    if (on && !wasOn) {
      // A fresh start: main holds nothing yet.
      lastSnapshot = '';
      lastImageKey = '';
    }
    wasOn = on;
    if (on) schedule();
    syncJoinCode();
  };

  const offs = [
    window.trifold.on('tableStatus', (status) => useTableStore.getState().receive(status)),
    // A player's change main has checked: applied like a DM's own.
    window.trifold.on('tableIntent', (event) => applyTableIntent(event)),
    // Summons: placed, dismissed or kept as the player asks; upkeep runs here too.
    window.trifold.on('tableSummon', (event) => handleSummonEvent(event)),
    installSummonUpkeep(),
    // A player dragging a token: previews show without saving; a drop moves it.
    window.trifold.on('tableToken', (event) => {
      const presenter = usePresenterStore.getState();
      if (event.kind === 'preview') {
        presenter.setMoving(event.tokenId, {
          x: event.x,
          y: event.y,
          label: event.deviceLabel,
          ...(event.from ? { from: event.from } : {}),
        });
        showPlayerRuler(event.tokenId, event.from, { x: event.x, y: event.y });
      } else if (event.kind === 'previewEnd') {
        presenter.setMoving(event.tokenId, null);
        showPlayerRuler(event.tokenId, undefined, undefined);
      } else {
        useSceneStore.getState().patchTokenAnywhere(event.tokenId, { x: event.x, y: event.y });
        presenter.setMoving(event.tokenId, null);
        showPlayerRuler(event.tokenId, undefined, undefined);
      }
    }),
    useTableStore.subscribe(onTable),
    useCampaignStore.subscribe((s, prev) => {
      const id = s.current?.campaign.id;
      const status = useTableStore.getState().status;
      if (
        id !== prev.current?.campaign.id &&
        status &&
        status.state !== 'off' &&
        status.campaignId !== id
      ) {
        void useTableStore.getState().stop();
      }
      if (s.current !== prev.current) schedule();
    }),
    usePresenterStore.subscribe((s, prev) => {
      if (
        s.liveSource !== prev.liveSource ||
        s.moving !== prev.moving ||
        s.state.scene !== prev.state.scene ||
        s.state.breakScreen !== prev.state.breakScreen ||
        s.state.blackout !== prev.state.blackout ||
        // Going live or ending it shows or hides the table on phones (ADR 0046).
        s.state.live !== prev.state.live ||
        // The TV's overlays, which phones show too.
        s.state.overlays !== prev.state.overlays ||
        s.state.showSceneTitle !== prev.state.showSceneTitle ||
        s.state.combat !== prev.state.combat ||
        s.state.counters !== prev.state.counters ||
        s.state.timer !== prev.state.timer ||
        s.state.area !== prev.state.area
      ) {
        schedule();
      }
    }),
    useCombatStore.subscribe((s, prev) => {
      if (s.state !== prev.state) schedule();
    }),
    useArtStore.subscribe((s, prev) => {
      if (s.byKey !== prev.byKey) schedule();
    }),
  ];
  void useTableStore.getState().load();
  return () => offs.forEach((off) => off());
}

/** The token whose player ruler is on the TV, so clearing it never clears the DM's own ruler. */
let rulerToken: string | null = null;

/**
 * A player's move on the TV (all can see how far it goes): the same ruler the DM's map draws,
 * from where the move began to where the token is planned. Like the DM's, it never shows a line
 * that starts or ends under fog, nor one on a hidden token.
 */
function showPlayerRuler(
  tokenId: string,
  from: { x: number; y: number } | undefined,
  to: { x: number; y: number } | undefined,
): void {
  const presenter = usePresenterStore.getState();
  const scene = presenter.liveSource?.scene;
  const token = scene?.tokens.find((t) => t.id === tokenId);
  if (!scene || !token || !from || !to) {
    if (rulerToken === tokenId) {
      rulerToken = null;
      presenter.setRuler(null);
    }
    return;
  }
  const grid = scene.grid ?? DEFAULT_GRID;
  const fog = activeFog(scene.fog);
  const a = cellCentre(from, grid, token.footprint);
  const b = cellCentre(to, grid, token.footprint);
  const squares = squaresBetween(from, to);
  const shown = !token.hidden && squares > 0 && isRevealed(fog, a) && isRevealed(fog, b);
  if (!shown) {
    // Under fog, on a hidden token or not moved yet: the TV shows no line for it.
    if (rulerToken === tokenId) {
      rulerToken = null;
      presenter.setRuler(null);
    }
    return;
  }
  rulerToken = tokenId;
  presenter.setRuler({ sceneId: scene.id, from: a, to: b, squares });
}
