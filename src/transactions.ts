import * as C from "./constants";
import {
  type State,
  type ReadState,
  clone,
  note,
  effect,
  maxFuel,
  maxHull,
  minerCell,
  depth,
  SAVE_KEY,
  initial,
} from "./model";
import { generate, resize } from "./world";
export function clearSave(s: State) {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
  s.hasSave = false;
}
export function start(s: ReadState): State {
  const n = initial(s.resources as State["resources"], s.muted);
  n.mode = s.mode;
  resize(n, s.worldSize);
  generate(n);
  n.screen = "in-mine";
  n.simTime = s.simTime;
  clearSave(n);
  note(n, "Find ore. Fund your escape.  [S] DRILL  ·  [W] THRUST");
  return n;
}
export function save(s: State) {
  if (s.coreTimer !== null) {
    note(s, "Cannot save an unstable Core Sample.");
    return;
  }
  try {
    const {
      resources: _resources,
      sounds: _sounds,
      effects: _effects,
      ...payload
    } = s;
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    s.hasSave = true;
    note(s, "Expedition secured.");
    s.sounds.push(C.CUES.fabricate);
  } catch {
    note(s, "Storage unavailable — expedition not saved.");
  }
}
export function restore(s: ReadState): State {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return clone(s);
    const data = JSON.parse(raw) as State;
    const n = {
      ...initial(s.resources as State["resources"], s.muted),
      ...data,
      resources: s.resources as State["resources"],
    };
    n.miner = {
      ...data.miner,
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      drilling: null,
      hitClock: 0,
      state: "idle",
    };
    n.screen = "in-mine";
    n.panel = null;
    n.menuIndex = 0;
    n.summary = null;
    n.effects = [];
    n.sounds = [];
    n.coreTimer = null;
    n.coreGround = null;
    n.simTime = s.simTime;
    n.muted = s.muted;
    n.camera = { x: 0, y: -288, lead: 0 };
    return n;
  } catch {
    return clone(s);
  }
}
export function end(s: State, cause: C.DeathCause | null) {
  if (s.summary) return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.menuIndex = 0;
  s.panel = null;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  if (cause) {
    effect(s, "death-burst");
    s.sounds.push(C.CUES.death);
    if (s.mode === "hardcore") clearSave(s);
  } else clearSave(s);
}
export function damage(s: State, amount: number, hazard?: C.NoticeHazard) {
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.miner.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, age: 0 };
  }
}
export function gas(s: State, c: number, r: number) {
  effect(s, "gas-explosion", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
  s.sounds.push(C.CUES.gasExplosion);
  s.shake = 12;
  const dx = s.miner.x + C.MINER_W / 2 - (c + 0.5) * C.TILE,
    dy = s.miner.y + C.MINER_H / 2 - (r + 0.5) * C.TILE,
    dist = Math.hypot(dx, dy);
  if (dist <= C.GAS_BLAST_TILES * C.TILE) {
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, (r - 1) / (s.coreRow - 1) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (dist || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (dist || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function sell(s: State) {
  let total = 0;
  for (const ore of C.MINERALS) total += (s.cargo[ore.id] ?? 0) * ore.value;
  s.credits += total;
  s.creditsEarned += total;
  s.cargo = {};
  note(s, `Cargo sold · +${total} Credits`);
  if (total) s.sounds.push(C.CUES.fabricate);
}
export function buyMeter(s: State, kind: "fuel" | "hull", full: boolean) {
  const cap = kind === "fuel" ? maxFuel(s) : maxHull(s),
    price = kind === "fuel" ? C.FUEL_PRICE : C.REPAIR_PRICE,
    increment = kind === "fuel" ? C.FUEL_BUY_INCREMENT : C.REPAIR_BUY_INCREMENT;
  const wanted = Math.max(0, Math.min(cap - s.miner[kind], increment));
  if (!full && wanted * price > s.credits) {
    note(s, "Insufficient Credits");
    return;
  }
  const amount = Math.max(
    0,
    Math.min(
      cap - s.miner[kind],
      s.credits / price,
      full ? Infinity : increment,
    ),
  );
  s.credits -= amount * price;
  s.miner[kind] += amount;
  note(
    s,
    amount
      ? `${kind === "fuel" ? "Fuel replenished" : "Hull repaired"} +${amount.toFixed(0)}`
      : "Nothing purchased",
  );
  if (amount) s.sounds.push(C.CUES.fabricate);
}
export function buyUpgrade(s: State, track: C.TrackName) {
  const tier = s.tiers[track],
    price = C.UPGRADE_PRICES[tier - 1];
  if (tier >= C.MAX_TIER[track] || s.credits < price) {
    note(s, "Upgrade unavailable");
    return;
  }
  const fuel = maxFuel(s),
    hull = maxHull(s);
  s.credits -= price;
  s.tiers[track]++;
  s.miner.fuel += maxFuel(s) - fuel;
  s.miner.hull += maxHull(s) - hull;
  s.sounds.push(C.CUES.fabricate);
  note(s, `${track.toUpperCase()} upgraded to tier ${tier + 1}`);
}
export function buyItem(s: State, id: C.ItemId) {
  const item = C.ITEMS.find((i) => i.id === id)!;
  if (s.credits < item.price) {
    note(s, "Insufficient Credits");
    return;
  }
  s.credits -= item.price;
  s.items[id]++;
  s.sounds.push(C.CUES.fabricate);
}
export function useItem(s: State, id: C.ItemId) {
  if (!s.items[id]) {
    note(s, "No supplies of this type");
    return;
  }
  let changed: boolean;
  const p = minerCell(s);
  if (id === "nanobots") {
    changed = s.miner.hull < maxHull(s);
    if (changed)
      s.miner.hull = Math.min(maxHull(s), s.miner.hull + C.NANOBOT_HULL);
  } else if (id === "emergency-fuel") {
    changed = s.miner.fuel < maxFuel(s);
    if (changed)
      s.miner.fuel = Math.min(maxFuel(s), s.miner.fuel + C.EMERGENCY_FUEL);
  } else if (id === "quantum-teleporter" || id === "matter-transmitter") {
    changed = id === "quantum-teleporter" || depth(s) > 0 || s.miner.vy !== 0;
    if (changed) {
      const height =
        id === "matter-transmitter"
          ? 0
          : (s.nextTeleportHeight ??
            C.TELEPORT_HEIGHT_TILES_MIN +
              Math.random() *
                (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN));
      s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
      s.miner.y = C.SURFACE_Y - height * C.TILE - C.MINER_H;
      s.miner.vx = 0;
      s.miner.vy =
        id === "matter-transmitter"
          ? 0
          : (s.nextTeleportSpeed ??
            C.TELEPORT_SPEED_MIN +
              Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN));
      s.miner.drilling = null;
      if (id === "quantum-teleporter") {
        s.nextTeleportHeight = null;
        s.nextTeleportSpeed = null;
      }
      effect(s, "core-extract");
    }
  } else {
    changed = false;
    const radius =
      id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    for (
      let r = Math.max(1, p.row - radius);
      r <= Math.min(s.coreRow, p.row + radius);
      r++
    )
      for (
        let c = Math.max(0, p.col - radius);
        c <= Math.min(C.WORLD_COLS - 1, p.col + radius);
        c++
      ) {
        const t = s.grid[r][c];
        if (["bedrock", "core", "material", "tunnel"].includes(t.kind))
          continue;
        if (t.kind === "gas") gas(s, c, r);
        s.grid[r][c] = {
          ...t,
          kind: "tunnel",
          ore: null,
          material: null,
          health: null,
          maxHealth: null,
        };
        changed = true;
      }
    if (changed) {
      effect(s, "gas-explosion");
      s.sounds.push(C.CUES.gasExplosion);
      s.shake = 10;
      s.miner.drilling = null;
    }
  }
  if (changed) {
    s.items[id]--;
    s.sounds.push(C.CUES.fabricate);
    effect(s, "material-shimmer");
  } else note(s, "No effect — supply retained");
  if (s.miner.hull <= 0) end(s, "hull-destroyed");
}
export function jettison(s: State) {
  if (!s.satchel.coreSample) return;
  s.satchel.coreSample = false;
  s.coreGround = minerCell(s);
  note(s, "Core Sample jettisoned. Move clear.");
}
export function fabricate(s: State) {
  const part = C.ROCKET_COMPONENTS[s.installed];
  if (!part) {
    note(s, "Rocket ready for launch");
    return;
  }
  const material = part.material;
  const hasMaterial =
    !material ||
    (material === "core-sample"
      ? s.satchel.coreSample
      : s.satchel[material] > 0);
  if (s.credits < part.credits || !hasMaterial) {
    note(s, "Missing Credits or required material");
    return;
  }
  s.credits -= part.credits;
  if (material === "core-sample") {
    s.satchel.coreSample = false;
    s.coreTimer = null;
  } else if (material) s.satchel[material]--;
  s.installed++;
  s.sounds.push(C.CUES.fabricate);
  note(s, `${part.name} installed`);
}
export function launch(s: State) {
  if (s.installed < C.ROCKET_COMPONENTS.length) {
    note(s, "Complete all five components first");
    return;
  }
  s.panel = null;
  s.launchTime = 0;
  s.sounds.push(C.CUES.launch);
  effect(s, "launch-exhaust", 1910, C.SURFACE_Y);
  end(s, null);
}
