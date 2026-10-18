import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
}
export interface Point {
  col: number;
  row: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint?: string;
}
export interface Resources {
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
}
export interface State {
  resources: Resources;
  grid: Cell[][];
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  panelIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: null | (Point & { dir: "down" | "left" | "right" });
    hitClock: number;
    hurt: number;
    anim: number;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  installed: number;
  coreTimer: number | null;
  coreGround: Point | null;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  camera: { x: number; y: number; lead: number };
  noticesFired: Record<C.NoticeHazard, boolean>;
  notice: null | { hazard: C.NoticeHazard; age: number };
  summary: null | {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  };
  effects: Effect[];
  sounds: C.CueName[];
  shake: number;
  note: string;
  noteTime: number;
  accumulator: number;
  pointerDown: Record<number, string>;
  launchTime: number | null;
}
export type ReadState = DeepReadonly<State>;
export const SAVE_KEY = "deepcore-expedition-v1";
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export function clone(s: ReadState): State {
  return {
    ...s,
    resources: s.resources as Resources,
    grid: s.grid.map((row) => row.slice()) as Cell[][],
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    camera: { ...s.camera },
    noticesFired: { ...s.noticesFired },
    notice: s.notice ? { ...s.notice } : null,
    summary: s.summary ? { ...s.summary } : null,
    effects: s.effects.map((e) => ({ ...e })),
    sounds: [...s.sounds],
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    pointerDown: { ...s.pointerDown },
  };
}
export function bandAt(row: number, coreRow: number): C.BandName {
  return C.BANDS[Math.min(3, Math.floor((4 * (row - 1)) / (coreRow - 1)))];
}
export function cell(
  kind: C.TileKind,
  band: C.BandName | null,
  ore: C.OreId | null = null,
  material: C.MaterialId | null = null,
): Cell {
  const health =
    ["rock", "ore", "material", "gas", "lava"].includes(kind) && band
      ? C.BAND_HEALTH[band]
      : null;
  return { kind, band, ore, material, health, maxHealth: health };
}
export function emptyGrid(coreRow: number): Cell[][] {
  return Array.from({ length: coreRow + 1 }, (_, r) =>
    Array.from({ length: C.WORLD_COLS }, (_, c) =>
      cell(
        r === 0
          ? "tunnel"
          : c === 0 || c === C.WORLD_COLS - 1 || r === coreRow
            ? r === coreRow && c === C.CORE_COL
              ? "core"
              : "bedrock"
            : "tunnel",
        r > 0 && r < coreRow ? bandAt(r, coreRow) : null,
      ),
    ),
  );
}
export function tile(
  s: ReadState,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  return s.grid[row]?.[col] ?? cell("bedrock", null);
}
export function minerCell(s: ReadState): Point {
  return {
    col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
    row: Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE),
  };
}
export function solid(s: ReadState, c: number, r: number): boolean {
  return r < 1 ? c < 0 || c >= C.WORLD_COLS : tile(s, c, r).kind !== "tunnel";
}
export function grounded(s: ReadState): boolean {
  const m = s.miner;
  const feet = m.y + C.MINER_H;
  const row = Math.floor((feet + 0.1) / C.TILE);
  if (
    m.drilling?.dir === "down" &&
    Math.floor((m.x + C.MINER_W / 2) / C.TILE) === m.drilling.col &&
    feet >= m.drilling.row * C.TILE - 0.2 &&
    feet <= (m.drilling.row + 1) * C.TILE + 0.2 &&
    tile(s, m.drilling.col, m.drilling.row).health !== null
  )
    return true;
  if (Math.abs(feet - row * C.TILE) > 0.2) {
    const c = Math.floor((m.x + C.MINER_W / 2) / C.TILE),
      t = tile(s, c, row);
    return (
      t.health !== null &&
      t.maxHealth !== null &&
      solid(s, c, row + 1) &&
      Math.abs(feet - (row * C.TILE + (1 - t.health / t.maxHealth) * C.TILE)) <
        0.2
    );
  }
  return (
    solid(s, Math.floor((m.x + 1) / C.TILE), row) ||
    solid(s, Math.floor((m.x + C.MINER_W - 1) / C.TILE), row)
  );
}
export function cargoStats(s: ReadState) {
  let slotsUsed = 0,
    loadKg = 0;
  for (const ore of C.MINERALS) {
    const n = s.cargo[ore.id] ?? 0;
    slotsUsed += n;
    loadKg += n * ore.weightKg;
  }
  return {
    slotsUsed,
    slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
    loadKg,
    liftLimitKg: C.JETPACK_TIERS[s.tiers.jetpack - 1].liftLimitKg,
  };
}
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const depth = (s: ReadState) =>
  s.miner.y + C.MINER_H - C.SURFACE_Y < 0.001
    ? 0
    : Math.max(
        0,
        ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
      );
export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}
export function initial(resources: Resources, muted = false): State {
  const coreRow = C.STANDARD_ROWS;
  return {
    resources,
    grid: emptyGrid(coreRow),
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow,
    menuIndex: 0,
    panelIndex: 0,
    muted,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave: hasSave(),
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
      hitClock: 0,
      hurt: 0,
      anim: 0,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as State["tiers"],
    items: Object.fromEntries(C.ITEM_IDS.map((t) => [t, 0])) as State["items"],
    installed: 0,
    coreTimer: null,
    coreGround: null,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    camera: { x: 0, y: -288, lead: 0 },
    noticesFired: { gas: false, lava: false },
    notice: null,
    summary: null,
    effects: [],
    sounds: [],
    shake: 0,
    note: "",
    noteTime: 0,
    accumulator: 0,
    pointerDown: {},
    launchTime: null,
  };
}
export const buildings = C.BUILDINGS.map((id, i) => ({
  id,
  x: [110, 450, 790, 1100, 1430, 1790][i],
  y: C.SURFACE_Y - 180,
  w: 240,
  h: 180,
}));
export function note(s: State, message: string) {
  s.note = message;
  s.noteTime = 3;
}
export function effect(
  s: State,
  name: string,
  x = s.miner.x + C.MINER_W / 2,
  y = s.miner.y + C.MINER_H / 2,
  tint?: string,
) {
  s.effects.push({
    name,
    x,
    y,
    age: 0,
    seed: Math.floor(Math.random() * 1e9),
    tint,
  });
}
export function scanner(s: ReadState) {
  const p = minerCell(s);
  let best: null | {
    material: C.MaterialId;
    dx: number;
    dy: number;
    distance: number;
  } = null;
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  if (range !== null)
    for (
      let r = Math.max(1, p.row - range);
      r <= Math.min(s.coreRow - 1, p.row + range);
      r++
    )
      for (let c = 1; c < C.WORLD_COLS - 1; c++) {
        const t = tile(s, c, r);
        if (t.material && s.satchel[t.material] === 0) {
          const dx = c - p.col,
            dy = r - p.row,
            distance = Math.hypot(dx, dy);
          if (distance <= range && (!best || distance < best.distance))
            best = { material: t.material, dx, dy, distance };
        }
      }
  return best
    ? {
        locked: true,
        target: best.material,
        dirX: best.dx / (best.distance || 1),
        dirY: best.dy / (best.distance || 1),
        distanceTiles: best.distance,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
