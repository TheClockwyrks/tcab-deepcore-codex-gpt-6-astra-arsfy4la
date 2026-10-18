import * as C from "./constants";
import {
  type State,
  type ReadState,
  clone,
  initial,
  tile,
  cell,
  emptyGrid,
  minerCell,
  cargoStats,
  maxFuel,
  maxHull,
  grounded,
  depth,
  scanner,
  buildings,
} from "./model";
import { generate, resize } from "./world";
import * as T from "./transactions";
import { menu, menuRect, controlRect } from "./ui";
function valid(ok: boolean): asserts ok {
  if (!ok) throw new RangeError("Deepcore: argument outside its domain");
}
function number(value: number, min = -Infinity, max = Infinity) {
  valid(Number.isFinite(value) && value >= min && value <= max);
}
function member<T extends string>(value: T, values: readonly T[]) {
  valid(values.includes(value));
}
function count(value: number, min = 0, max = Infinity) {
  number(value, min, max);
  valid(Number.isInteger(value));
}
function coord(s: ReadState, c: number, r: number) {
  count(c, 0, C.WORLD_COLS - 1);
  count(r, 1, s.coreRow);
}
function pose<A extends unknown[]>(fn: (s: State, ...args: A) => void) {
  return (state: ReadState, ...args: A): State => {
    const s = clone(state);
    fn(s, ...args);
    return s;
  };
}
export function snapshot(s: ReadState) {
  const cargo = cargoStats(s),
    p = minerCell(s);
  const d = s.miner.drilling,
    t = d ? tile(s, d.col, d.row) : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      x: s.miner.x,
      y: s.miner.y,
      vx: s.miner.vx,
      vy: s.miner.vy,
      ...p,
      facing: s.miner.facing,
      state: s.miner.state,
      grounded: grounded(s),
      travel: s.miner.travel,
      drill: s.miner.drill,
      fuel: s.miner.fuel,
      maxFuel: maxFuel(s),
      hull: s.miner.hull,
      maxHull: maxHull(s),
      overloaded: cargo.loadKg >= cargo.liftLimitKg,
      drilling: d
        ? { ...d, progress: 1 - (t?.health ?? 0) / (t?.maxHealth ?? 1) }
        : null,
    },
    cargo: {
      ...cargo,
      ore: Object.fromEntries(Object.entries(s.cargo).filter(([, v]) => v > 0)),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.age >= C.NOTICE_DELAY }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export const debug = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt: (s: ReadState, col: number, row: number) => ({
    ...tile(s, col, row),
  }),
  findTile: (s: ReadState, kind: C.TileKind) => {
    member(kind, C.TILE_KINDS);
    let best: null | { col: number; row: number } = null,
      dist = Infinity;
    const p = minerCell(s);
    for (let row = 0; row <= s.coreRow; row++)
      for (let col = 0; col < C.WORLD_COLS; col++)
        if (tile(s, col, row).kind === kind) {
          const d = Math.hypot(col - p.col, row - p.row);
          if (d < dist) {
            dist = d;
            best = { col, row };
          }
        }
    return best;
  },
  buildings: (_s: ReadState) => buildings.map((b) => ({ ...b })),
  menuItemRect: menuRect,
  controlRect,
  reset: (s: ReadState) => initial(s.resources as State["resources"], s.muted),
  reconcile: (s: ReadState) => clone(s),
  generateMine: pose(generate),
  clearMine: pose((s) => {
    s.grid = emptyGrid(s.coreRow);
  }),
  clearCargo: pose((s) => {
    s.cargo = {};
  }),
  clearItems: pose((s) => {
    for (const id of C.ITEM_IDS) s.items[id] = 0;
  }),
  setTile: pose((s, col: number, row: number, kind: C.TileKind) => {
    coord(s, col, row);
    member(kind, ["rock", "gas", "lava", "stone", "bedrock", "tunnel", "core"]);
    s.grid[row][col] = cell(kind, tile(s, col, row).band);
  }),
  setOreTile: pose((s, col: number, row: number, ore: C.OreId) => {
    coord(s, col, row);
    member(
      ore,
      C.MINERALS.map((o) => o.id),
    );
    s.grid[row][col] = cell("ore", tile(s, col, row).band, ore);
  }),
  setMaterialTile: pose(
    (s, col: number, row: number, material: C.MaterialId) => {
      coord(s, col, row);
      member(material, C.MATERIALS);
      s.grid[row][col] = cell(
        "material",
        tile(s, col, row).band,
        null,
        material,
      );
    },
  ),
  setTileHealth: pose((s, col: number, row: number, health: number) => {
    coord(s, col, row);
    const t = tile(s, col, row);
    valid(t.maxHealth !== null);
    number(health, Number.MIN_VALUE, t.maxHealth);
    s.grid[row][col] = { ...t, health };
  }),
  placeCoreSample: pose((s, col: number, row: number) => {
    coord(s, col, row);
    valid(s.coreTimer === null && tile(s, col, row).kind === "tunnel");
    s.coreGround = { col, row };
    s.coreTimer = C.CORE_TIMER;
  }),
  setMinerPosition: pose((s, x: number, y: number) => {
    number(x);
    number(y);
    s.miner.x = x;
    s.miner.y = y;
  }),
  setMinerVelocity: pose((s, vx: number, vy: number) => {
    number(vx);
    number(vy);
    s.miner.vx = vx;
    s.miner.vy = vy;
  }),
  setFacing: pose((s, facing: C.Facing) => {
    member(facing, C.FACINGS);
    s.miner.facing = facing;
  }),
  setFuel: pose((s, value: number) => {
    number(value, 0);
    s.miner.fuel = value;
  }),
  setHull: pose((s, value: number) => {
    number(value, 0);
    s.miner.hull = value;
  }),
  setMinerTravel: pose((s, enabled: boolean) => {
    valid(typeof enabled === "boolean");
    s.miner.travel = enabled;
  }),
  setMinerDrill: pose((s, enabled: boolean) => {
    valid(typeof enabled === "boolean");
    s.miner.drill = enabled;
  }),
  setScreen: pose((s, screen: C.ScreenName) => {
    member(screen, C.SCREENS);
    s.screen = screen;
  }),
  setPanel: pose((s, panel: C.PanelId | null) => {
    if (panel !== null) member(panel, C.PANELS);
    s.panel = panel;
  }),
  setMenuIndex: pose((s, index: number) => {
    count(index, 0, menu(s).length - 1);
    s.menuIndex = index;
  }),
  setMode: pose((s, mode: C.Mode) => {
    member(mode, C.MODES);
    s.mode = mode;
  }),
  setWorldSize: pose((s, size: C.WorldSize) => {
    member(size, C.WORLD_SIZES);
    resize(s, size);
  }),
  setCredits: pose((s, value: number) => {
    number(value, 0);
    s.credits = value;
  }),
  setTier: pose((s, track: C.TrackName, tier: number) => {
    member(track, C.TRACKS);
    count(tier, 1, C.MAX_TIER[track]);
    s.tiers[track] = tier;
    s.miner.fuel = Math.min(s.miner.fuel, maxFuel(s));
    s.miner.hull = Math.min(s.miner.hull, maxHull(s));
  }),
  setCargo: pose((s, ore: C.OreId, n: number) => {
    member(
      ore,
      C.MINERALS.map((o) => o.id),
    );
    count(n);
    if (n) s.cargo[ore] = n;
    else delete s.cargo[ore];
  }),
  setMaterial: pose((s, material: C.MaterialId, n: number) => {
    member(material, C.MATERIALS);
    count(n);
    s.satchel[material] = n;
  }),
  setCoreCarried: pose((s, carried: boolean) => {
    valid(typeof carried === "boolean");
    if (carried) {
      valid(s.coreTimer === null);
      s.coreTimer = C.CORE_TIMER;
    } else if (s.satchel.coreSample) s.coreTimer = null;
    s.satchel.coreSample = carried;
  }),
  setCoreTimer: pose((s, seconds: number) => {
    valid(s.coreTimer !== null);
    number(seconds, Number.MIN_VALUE);
    s.coreTimer = seconds;
  }),
  setItemCount: pose((s, item: C.ItemId, n: number) => {
    member(item, C.ITEM_IDS);
    count(n);
    s.items[item] = n;
  }),
  setRocketInstalled: pose((s, n: number) => {
    count(n, 0, C.ROCKET_COMPONENTS.length);
    s.installed = n;
  }),
  setNoticeFired: pose((s, hazard: C.NoticeHazard, fired: boolean) => {
    member(hazard, C.NOTICE_HAZARDS);
    valid(typeof fired === "boolean");
    s.noticesFired[hazard] = fired;
  }),
  setCameraLead: pose((s, lead: number) => {
    number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
    s.camera.lead = lead;
  }),
  setElapsed: pose((s, seconds: number) => {
    number(seconds, 0);
    s.elapsedSeconds = seconds;
  }),
  clearSave: pose(T.clearSave),
  setNextTeleportHeight: pose((s, tiles: number | null) => {
    if (tiles !== null)
      number(tiles, C.TELEPORT_HEIGHT_TILES_MIN, C.TELEPORT_HEIGHT_TILES_MAX);
    s.nextTeleportHeight = tiles;
  }),
  setNextTeleportSpeed: pose((s, speed: number | null) => {
    if (speed !== null)
      number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
    s.nextTeleportSpeed = speed;
  }),
  dropOre: pose((s, ore: C.OreId) => {
    member(
      ore,
      C.MINERALS.map((o) => o.id),
    );
    const n = s.cargo[ore] ?? 0;
    if (n > 1) s.cargo[ore] = n - 1;
    else delete s.cargo[ore];
  }),
  sell: pose(T.sell),
  buyFuel: pose((s) => T.buyMeter(s, "fuel", false)),
  fillFuel: pose((s) => T.buyMeter(s, "fuel", true)),
  buyRepair: pose((s) => T.buyMeter(s, "hull", false)),
  repairFull: pose((s) => T.buyMeter(s, "hull", true)),
  buyUpgrade: pose((s, track: C.TrackName) => {
    member(track, C.TRACKS);
    T.buyUpgrade(s, track);
  }),
  buyItem: pose((s, item: C.ItemId) => {
    member(item, C.ITEM_IDS);
    T.buyItem(s, item);
  }),
  useItem: pose((s, item: C.ItemId) => {
    member(item, C.ITEM_IDS);
    T.useItem(s, item);
  }),
  jettison: pose(T.jettison),
  fabricate: pose(T.fabricate),
  launch: pose(T.launch),
  save: pose(T.save),
  dismissNotice: pose((s) => {
    s.notice = null;
  }),
};
