import * as C from "./constants";
import {
  type State,
  tile,
  solid,
  grounded,
  minerCell,
  cargoStats,
  maxFuel,
  depth,
  clamp,
  effect,
  note,
} from "./model";
import { damage, gas, end } from "./transactions";
export interface Held {
  left: boolean;
  right: boolean;
  down: boolean;
  up: boolean;
}
export function camera(s: State, dt: number) {
  const m = s.miner;
  const target =
    Math.abs(m.vy) <= C.CAM_STILL_SPEED ? 0 : Math.sign(m.vy) * C.CAM_LEAD_MAX;
  const rate =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) *
    (s.camera.lead !== 0 &&
    (s.camera.lead * target <= 0 || Math.abs(target) < Math.abs(s.camera.lead))
      ? C.CAM_UNWIND_MULT
      : 1);
  s.camera.lead += clamp(target - s.camera.lead, -rate * dt, rate * dt);
  s.camera.x = clamp(
    m.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camera.y = Math.min(
    m.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.camera.lead,
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
  );
}
function blocks(s: State, x: number, y: number) {
  for (
    let r = Math.floor((y + 0.000001) / C.TILE);
    r <= Math.floor((y + C.MINER_H - 0.000001) / C.TILE);
    r++
  )
    for (
      let c = Math.floor((x + 0.000001) / C.TILE);
      c <= Math.floor((x + C.MINER_W - 0.000001) / C.TILE);
      c++
    ) {
      if (
        s.miner.drilling?.dir === "down" &&
        s.miner.drilling.col === c &&
        s.miner.drilling.row === r
      )
        continue;
      const t = tile(s, c, r);
      if (
        t.health !== null &&
        t.maxHealth &&
        t.health < t.maxHealth &&
        solid(s, c, r + 1) &&
        y + C.MINER_H <=
          r * C.TILE + (1 - t.health / t.maxHealth) * C.TILE + 0.15
      )
        continue;
      if (solid(s, c, r)) return true;
    }
  return false;
}
function move(s: State, axis: "x" | "y", delta: number) {
  const m = s.miner;
  if (!delta) return false;
  const start = m[axis],
    other = axis === "x" ? "y" : "x";
  const free = (v: number) =>
    axis === "x" ? !blocks(s, v, m[other]) : !blocks(s, m[other], v);
  if (free(start + delta)) {
    m[axis] += delta;
    return false;
  }
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (free(start + delta * mid)) lo = mid;
    else hi = mid;
  }
  m[axis] = start + delta * lo;
  return true;
}
const mineralColors = [
  "#c4a995",
  "#c7be74",
  "#de8b55",
  "#cbdcdb",
  "#6aa1d0",
  "#b5ca61",
  "#b28ac7",
  "#eb8668",
  "#d45561",
  "#a7e8ed",
  "#65e3a5",
  "#f390bc",
  "#f1cc63",
];
function breakCell(s: State, c: number, r: number) {
  const t = tile(s, c, r);
  s.grid[r][c] = {
    ...t,
    kind: "tunnel",
    ore: null,
    material: null,
    health: null,
    maxHealth: null,
  };
  if (t.ore) {
    if (cargoStats(s).slotsUsed < cargoStats(s).slotCap) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      s.sounds.push(C.CUES.orePickup);
      effect(
        s,
        "ore-sparkle",
        (c + 0.5) * C.TILE,
        (r + 0.5) * C.TILE,
        mineralColors[C.MINERALS.findIndex((o) => o.id === t.ore)],
      );
      note(s, `+ ${C.MINERALS.find((o) => o.id === t.ore)!.name}`);
    } else note(s, "Cargo full — mineral lost");
  }
  if (t.material) {
    s.satchel[t.material]++;
    s.sounds.push(C.CUES.materialChime);
    effect(s, "material-shimmer", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
    note(s, `${t.material.toUpperCase()} secured`);
  }
  if (t.kind === "gas") gas(s, c, r);
  if (t.kind === "lava") {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    s.sounds.push(C.CUES.lavaSizzle);
    effect(s, "lava-embers");
  }
}
export function step(s: State, held: Held, dt: number) {
  if (s.screen !== "in-mine") return;
  s.elapsedSeconds += dt;
  if (s.coreTimer !== null) {
    s.coreTimer -= dt;
    if (s.coreTimer <= 0) {
      const p = s.coreGround;
      effect(
        s,
        "core-detonation",
        p ? (p.col + 0.5) * C.TILE : undefined,
        p ? (p.row + 0.5) * C.TILE : undefined,
      );
      s.shake = 25;
      s.sounds.push(C.CUES.gasExplosion);
      const near =
        !p ||
        Math.hypot(
          s.miner.x + C.MINER_W / 2 - (p.col + 0.5) * C.TILE,
          s.miner.y + C.MINER_H / 2 - (p.row + 0.5) * C.TILE,
        ) <=
          C.CORE_BLAST_TILES * C.TILE;
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (near) end(s, "core-detonation");
    }
  }
  if (s.miner.hull <= 0) end(s, "hull-destroyed");
  if (s.miner.fuel <= 0 && depth(s) > 0) end(s, "fuel-out");
  if (s.screen !== "in-mine" || s.panel) return;
  const m = s.miner;
  const wasGrounded = grounded(s),
    p = minerCell(s),
    dir = Number(held.right) - Number(held.left);
  const thrust = held.up && m.fuel > 0;
  if (dir) m.facing = dir > 0 ? "east" : "west";
  let target: State["miner"]["drilling"] = null;
  if (m.drill && wasGrounded && !thrust && m.fuel > 0) {
    if (held.down)
      target =
        m.drilling?.dir === "down"
          ? { ...m.drilling }
          : {
              col: p.col,
              row: Math.floor((m.y + C.MINER_H + 0.2) / C.TILE),
              dir: "down",
            };
    else if (dir) {
      const col = Math.floor(
        (dir > 0 ? m.x + C.MINER_W + 0.2 : m.x - 0.2) / C.TILE,
      );
      const edge =
        dir > 0 ? col * C.TILE - m.x - C.MINER_W : m.x - (col + 1) * C.TILE;
      if (Math.abs(edge) < 0.5)
        target = { col, row: p.row, dir: dir > 0 ? "right" : "left" };
    }
  }
  if (target) {
    const t = tile(s, target.col, target.row);
    if (t.kind === "core" && target.dir === "down" && s.coreTimer === null) {
      s.satchel.coreSample = true;
      s.coreTimer = C.CORE_TIMER;
      s.sounds.push(C.CUES.materialChime);
      effect(s, "core-extract");
      note(s, "CORE UNSTABLE — 90 SECONDS TO THE LAUNCH PAD");
      target = null;
    } else if (t.health === null) target = null;
  }
  if (
    !target ||
    !m.drilling ||
    target.col !== m.drilling.col ||
    target.row !== m.drilling.row
  )
    m.hitClock = 0;
  // Releasing a downward cut rests the feet on its persistent cut face.
  if (!target && m.drilling?.dir === "down" && m.travel) {
    const old = m.drilling,
      t = tile(s, old.col, old.row);
    if (t.health !== null && t.maxHealth && solid(s, old.col, old.row + 1)) {
      m.y =
        old.row * C.TILE - C.MINER_H + (1 - t.health / t.maxHealth) * C.TILE;
    }
  }
  m.drilling = target;
  if (target) {
    m.hitClock += dt;
    while (m.hitClock + 1e-8 >= C.DRILL_HIT_INTERVAL && m.fuel > 0) {
      m.hitClock -= C.DRILL_HIT_INTERVAL;
      m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
      const t = tile(s, target.col, target.row);
      const health = (t.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
      s.grid[target.row][target.col] = { ...t, health };
      effect(
        s,
        "drill-debris",
        (target.col + 0.5) * C.TILE,
        target.dir === "down" ? m.y + C.MINER_H : m.y + C.MINER_H / 2,
        {
          topsoil: "#b69467",
          rockbed: "#9aaeb1",
          deepstone: "#788da7",
          coreshell: "#d37d67",
        }[t.band ?? "topsoil"],
      );
      if (health <= 0) {
        breakCell(s, target.col, target.row);
        if (
          target.dir === "down" &&
          m.travel &&
          solid(s, target.col, target.row + 1)
        ) {
          m.y = (target.row + 1) * C.TILE - C.MINER_H;
          m.vy = 0;
        }
        m.drilling = null;
        m.hitClock = 0;
        break;
      }
    }
    if (
      m.drilling?.dir === "down" &&
      m.travel &&
      solid(s, target.col, target.row + 1)
    ) {
      const t = tile(s, target.col, target.row);
      const progress = clamp(
        1 -
          ((t.health ?? 0) -
            (m.hitClock / C.DRILL_HIT_INTERVAL) *
              C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
            (t.maxHealth ?? 1),
        0,
        1,
      );
      m.y = target.row * C.TILE - C.MINER_H + progress * C.TILE;
      m.vy = 0;
    }
  }
  const stats = cargoStats(s),
    load = stats.loadKg / stats.liftLimitKg;
  if (m.travel) {
    m.vx =
      m.hurt > 0 && Math.abs(m.vx) > C.WALK_SPEED
        ? m.vx * Math.exp(-5 * dt)
        : dir * C.WALK_SPEED;
    if (move(s, "x", m.vx * dt)) m.vx = 0;
    if (!m.drilling) {
      if (thrust) {
        const jet = C.JETPACK_TIERS[s.tiers.jetpack - 1];
        m.vy = Math.max(
          -jet.emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
          m.vy - jet.emptyAccel * Math.max(0, 1 - load) * dt,
        );
      } else
        m.vy = Math.min(
          C.FALL_TERMINAL_EMPTY +
            (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) *
              Math.min(1, load),
          m.vy + C.GRAVITY * dt,
        );
      const impact = m.vy;
      if (move(s, "y", m.vy * dt)) {
        if (impact > C.IMPACT_SAFE_SPEED) {
          damage(s, (impact - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE);
          s.shake = Math.max(3, (impact - C.IMPACT_SAFE_SPEED) / 40);
          effect(s, "impact-dust", m.x + C.MINER_W / 2, m.y + C.MINER_H);
          s.sounds.push(C.CUES.impact);
        }
        m.vy = 0;
      }
    }
  }
  if (depth(s) > 0) m.fuel -= C.LIFE_SUPPORT_BURN * dt;
  if (thrust) {
    m.fuel -=
      (C.THRUST_BURN_MAX +
        (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
          Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
      C.THRUST_BURN_SIZE_MULT[s.worldSize] *
      dt;
    if (
      Math.floor(s.elapsedSeconds * 12) !==
      Math.floor((s.elapsedSeconds - dt) * 12)
    )
      effect(s, "jetpack-exhaust", m.x + 18, m.y + 60);
  }
  if (dir && !wasGrounded) m.fuel -= C.AIR_BURN * dt;
  m.fuel = Math.max(0, m.fuel);
  for (
    let r = Math.max(1, Math.floor(m.y / C.TILE));
    r <= Math.floor((m.y + C.MINER_H) / C.TILE);
    r++
  )
    for (
      let c = Math.floor(m.x / C.TILE);
      c <= Math.floor((m.x + C.MINER_W) / C.TILE);
      c++
    )
      if (
        tile(s, c, r).kind === "lava" &&
        !(m.drilling?.col === c && m.drilling?.row === r)
      ) {
        damage(
          s,
          C.LAVA_CONTACT_DPS *
            (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) *
            dt,
          "lava",
        );
        if (
          Math.floor(s.elapsedSeconds * 4) !==
          Math.floor((s.elapsedSeconds - dt) * 4)
        ) {
          effect(s, "lava-embers");
          s.sounds.push(C.CUES.lavaSizzle);
        }
      }
  m.hurt = Math.max(0, m.hurt - dt);
  const state: C.MinerState = m.drilling
    ? m.drilling.dir === "down"
      ? "drill-down"
      : "drill-side"
    : m.hurt > 0
      ? "hurt"
      : m.fuel <= 0 && depth(s) > 0
        ? "fuel-out"
        : thrust
          ? "jetpack"
          : !grounded(s)
            ? "fall"
            : dir
              ? "walk"
              : "idle";
  m.anim = m.state === state ? m.anim + dt : 0;
  m.state = state;
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  camera(s, dt);
  if (m.hull <= 0) end(s, "hull-destroyed");
  else if (m.fuel <= 0 && depth(s) > 0) end(s, "fuel-out");
  if (
    Math.floor(s.elapsedSeconds / 2) !==
      Math.floor((s.elapsedSeconds - dt) / 2) &&
    m.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION
  )
    s.sounds.push(C.CUES.alarmFuel);
}
