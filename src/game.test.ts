/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type DeepcoreState, type DeepcoreDebugApi } from "./game";
import * as C from "./constants";
import { initial, clone, cell, depth, cargoStats, scanner } from "./model";
import { debug } from "./debug";
import { generate, resize } from "./world";
import { step, camera } from "./simulation";
import * as T from "./transactions";
import { menuRect, controlRect } from "./ui";
const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(path)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData() {
        return Promise.resolve({});
      }
      resume() {
        return Promise.resolve();
      }
    },
  );
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});
const engines: Engine<DeepcoreState, DeepcoreDebugApi>[] = [];
afterEach(() => {
  engines.forEach((e) => e.destroy());
  engines.length = 0;
  store.clear();
});
async function setup(ms = 1000 / 60) {
  const events = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, down = true) => {
    const event = new Event(down ? "keydown" : "keyup");
    Object.assign(event, { code, repeat: false });
    events.dispatchEvent(event);
  };
  return { engine, key, canvas, events };
}
function state() {
  const s = initial({ images: {}, systems: {} });
  s.screen = "in-mine";
  return s;
}
const still = { left: false, right: false, down: false, up: false };
function tick(s: DeepcoreState, seconds: number, held = still) {
  for (let i = 0; i < Math.round(seconds * 120); i++) step(s, held, 1 / 120);
}
describe("engine integration", () => {
  it("loads the full authored asset set and registers live diagnostics", async () => {
    const { engine } = await setup();
    expect(Object.keys(engine.state.resources.images).length).toBeGreaterThan(
      85,
    );
    expect(Object.keys(engine.state.resources.systems)).toHaveLength(12);
    expect(engine.debug.snapshot(engine.state).screen).toBe("title");
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
    await engine.advance(2);
    expect(engine.state.simTime).toBeCloseTo(1 / 30);
  });
  it("keyboard menus start a fresh expedition, drill, pause and resume", async () => {
    const { engine, key } = await setup();
    for (let i = 0; i < 3; i++) {
      key("Enter");
      await engine.advance(1);
      key("Enter", false);
      await engine.advance(1);
    }
    expect(engine.state.screen).toBe("in-mine");
    expect(engine.state.coreRow).toBe(250);
    key("KeyS");
    await engine.advance(60);
    key("KeyS", false);
    expect(depth(engine.state)).toBeGreaterThan(5);
    key("Escape");
    await engine.advance(1);
    key("Escape", false);
    const fuel = engine.state.miner.fuel;
    await engine.advance(20);
    expect(engine.state.miner.fuel).toBe(fuel);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("in-mine");
  });
  it("uses both pointer edges inside the same menu item", async () => {
    const { engine, events } = await setup();
    const r = engine.debug.menuItemRect(engine.state, 0)!;
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type);
      Object.assign(event, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerdown" ? 1 : 0,
      });
      events.dispatchEvent(event);
    };
    pointer("pointerdown", r.x + 20, r.y + 20);
    await engine.advance(1);
    pointer("pointerup", 10, 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("pointerdown", r.x + 20, r.y + 20);
    await engine.advance(1);
    pointer("pointerup", r.x + 20, r.y + 20);
    await engine.advance(1);
    expect(engine.state.screen).toBe("mode-select");
  });
  it("keeps the previous state immutable through drill updates", async () => {
    const { engine, key } = await setup();
    engine.apply((s) => debug.setScreen(s, "in-mine"));
    engine.apply((s) => debug.setTile(s, C.SPAWN_COL, 1, "rock"));
    engine.apply((s) => debug.setTile(s, C.SPAWN_COL, 2, "rock"));
    const old = engine.state;
    key("KeyS");
    await engine.advance(15);
    expect(old.grid[1][C.SPAWN_COL].health).toBe(C.BAND_HEALTH.topsoil);
    expect(engine.state.grid[1][C.SPAWN_COL].health).toBeLessThan(
      C.BAND_HEALTH.topsoil,
    );
  });
  it("agrees at different frame rates over a fixed interval", async () => {
    const a = await setup(1000 / 30),
      b = await setup(1000 / 60);
    for (const e of [a.engine, b.engine]) {
      e.apply((s) => debug.setScreen(s, "in-mine"));
      e.apply((s) => debug.setMinerPosition(s, 400, 200));
      e.apply((s) => debug.setMinerTravel(s, false));
    }
    await a.engine.advance(30);
    await b.engine.advance(60);
    expect(a.engine.state.miner.fuel).toBeCloseTo(b.engine.state.miner.fuel, 8);
    expect(a.engine.state.elapsedSeconds).toBeCloseTo(1, 8);
  });
});
describe("generation and immutable poses", () => {
  for (const size of C.WORLD_SIZES)
    it(`generates ${size} with exact material nodes and traversable spine`, () => {
      const s = state();
      resize(s, size);
      generate(s);
      expect(s.coreRow).toBe(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
      for (const material of C.MATERIALS) {
        expect(
          s.grid.flat().filter((t) => t.material === material),
        ).toHaveLength(1);
      }
      expect(s.grid[s.coreRow][C.CORE_COL].kind).toBe("core");
      for (let r = 1; r < s.coreRow; r++)
        expect(["stone", "lava"]).not.toContain(s.grid[r][C.CORE_COL].kind);
      expect(s.grid[1][C.CAVE_MOUTH_COL].kind).toBe("tunnel");
      for (let b = 0; b < 4; b++) {
        const band = s.grid.flat().filter((t) => t.band === C.BANDS[b]);
        expect(
          band.filter((t) => t.kind === "ore").length / band.length,
        ).toBeGreaterThan(C.ORE_DENSITY * (1 - C.DENSITY_TOLERANCE));
      }
    });
  it("resizes without changing surviving cell bands or health", () => {
    let s = state();
    s = debug.setOreTile(s, 4, 130, "cobaltine");
    s = debug.setTileHealth(s, 4, 130, 3);
    s = debug.setWorldSize(s, "quick");
    expect(debug.tileAt(s, 4, 130)).toMatchObject({
      band: "rockbed",
      health: 3,
      ore: "cobaltine",
    });
    s = debug.setWorldSize(s, "marathon");
    expect(debug.tileAt(s, 16, 250).kind).toBe("tunnel");
    expect(debug.tileAt(s, 16, 1000).kind).toBe("core");
    expect(debug.tileAt(s, 4, 130).health).toBe(3);
  });
  it("rejects invalid poses and reconciles without advancing", () => {
    const s = state();
    expect(() => debug.setTier(s, "fuel", 6)).toThrow();
    expect(() => debug.setTileHealth(s, 4, 4, 2)).toThrow();
    expect(() => debug.setCoreTimer(s, 2)).toThrow();
    const n = debug.reconcile(debug.setMinerPosition(s, 400, 2000));
    expect(n.elapsedSeconds).toBe(0);
    expect(n.miner.y).toBe(2000);
    expect(n.deepestDepthMeters).toBe(0);
  });
  it("derives scanner bearing, load and next component from poses", () => {
    let s = state();
    s = debug.setTier(s, "scanner", 3);
    s = debug.setMaterialTile(s, 8, 5, "resonite");
    expect(scanner(s).locked).toBe(true);
    s = debug.setMaterial(s, "resonite", 1);
    expect(scanner(s).locked).toBe(false);
    s = debug.setCargo(s, "aurite", 4);
    expect(debug.snapshot(s).miner.overloaded).toBe(true);
    s = debug.setRocketInstalled(s, 3);
    expect(debug.snapshot(s).rocket.nextComponent).toBe("thruster");
  });
});
describe("movement, drilling and hazards", () => {
  it("requires grounding for a cut and retains partial damage", () => {
    let s = state();
    s = debug.setTile(s, 4, 1, "rock");
    s = debug.setTile(s, 4, 2, "rock");
    tick(s, 0.25, { ...still, down: true });
    expect(s.grid[1][4].health).toBe(2);
    expect(s.miner.y).toBeCloseTo(C.SURFACE_Y - C.MINER_H + 40);
    tick(s, 0.25, still);
    expect(s.grid[1][4].health).toBe(2);
    s.miner.y = -100;
    tick(s, 0.125, { ...still, down: true });
    expect(s.grid[1][4].health).toBe(2);
  });
  it("banks ore exactly once and leaves full cargo unchanged", () => {
    let s = state();
    s = debug.setOreTile(s, 4, 1, "ferron");
    s = debug.setTile(s, 4, 2, "rock");
    tick(s, 0.5, { ...still, down: true });
    expect(s.cargo.ferron).toBe(1);
    expect(s.grid[1][4].kind).toBe("tunnel");
    s = debug.setCargo(s, "ferron", 15);
    s = debug.setOreTile(s, 4, 2, "marlite");
    s = debug.setTile(s, 4, 3, "rock");
    tick(s, 0.5, { ...still, down: true });
    expect(s.cargo.marlite).toBeUndefined();
    expect(cargoStats(s).slotsUsed).toBe(15);
  });
  it("travel and drill gates operate independently", () => {
    let s = state();
    s = debug.setTile(s, 4, 1, "rock");
    s = debug.setMinerTravel(s, false);
    const y = s.miner.y;
    tick(s, 0.25, { ...still, down: true });
    expect(s.miner.y).toBe(y);
    expect(s.grid[1][4].health).toBe(2);
    s = debug.setMinerDrill(s, false);
    tick(s, 0.25, { ...still, down: true });
    expect(s.grid[1][4].health).toBe(2);
  });
  it("thrust has no ceiling and a full load prevents lift", () => {
    const s = state();
    tick(s, 1, { ...still, up: true });
    expect(s.miner.y).toBeLessThan(-300);
    expect(s.miner.fuel).toBeLessThan(100);
    let loaded = state();
    loaded = debug.setCargo(loaded, "ferron", 35);
    loaded = debug.setTile(loaded, 4, 1, "rock");
    tick(loaded, 1, { ...still, up: true });
    expect(loaded.miner.y).toBeCloseTo(C.SURFACE_Y - C.MINER_H);
  });
  it("hard landings damage hull and emit dust", () => {
    let s = state();
    s = debug.setTile(s, 4, 10, "rock");
    s = debug.setMinerPosition(s, 332, 600);
    s = debug.setMinerVelocity(s, 0, 950);
    tick(s, 0.3);
    expect(s.miner.hull).toBeLessThan(100);
    expect(s.effects.some((e) => e.name === "impact-dust")).toBe(true);
  });
  it("gas ignores radiator and starts a delayed notice", () => {
    let s = state();
    s = debug.setTier(s, "radiator", 5);
    s = debug.setMinerPosition(s, 332, 126 * 80 - 72);
    T.gas(s, 4, 126);
    expect(s.miner.hull).toBeLessThanOrEqual(40);
    expect(s.notice?.hazard).toBe("gas");
    expect(debug.snapshot(s).notice?.shown).toBe(false);
  });
  it("lava radiator reduces contact damage", () => {
    let a = state();
    a = debug.setTile(a, 4, 2, "lava");
    a = debug.setMinerPosition(a, 332, 160);
    a = debug.setMinerTravel(a, false);
    const b = debug.setTier(a, "radiator", 5);
    tick(a, 0.5);
    tick(b, 0.5);
    expect(100 - b.miner.hull).toBeCloseTo((100 - a.miner.hull) * 0.2, 5);
  });
  it("core timer runs in inventory, but not pause, and ground distance matters", () => {
    let s = debug.setCoreCarried(state(), true);
    s = debug.setCoreTimer(s, 1);
    s.panel = "inventory";
    tick(s, 0.5);
    expect(s.coreTimer).toBeCloseTo(0.5);
    s.screen = "paused";
    tick(s, 2);
    expect(s.coreTimer).toBeCloseTo(0.5);
    s.screen = "in-mine";
    T.jettison(s);
    s.miner.x = 1500;
    tick(s, 0.6);
    expect(s.screen).toBe("in-mine");
    expect(s.coreTimer).toBeNull();
  });
  it("zero hull kills through an open panel and destroys a live sample", () => {
    const s = debug.setCoreCarried(state(), true);
    s.panel = "inventory";
    s.miner.hull = 0;
    tick(s, 0.1);
    expect(s.screen).toBe("game-over");
    expect(s.coreTimer).toBeNull();
    expect(s.summary?.deathCause).toBe("hull-destroyed");
  });
  it("camera lead ramps and unwinds by elapsed time", () => {
    const s = state();
    s.miner.vy = 300;
    camera(s, 1);
    expect(s.camera.lead).toBe(C.CAM_LEAD_MAX / 2);
    s.miner.vy = 0;
    camera(s, 0.25);
    expect(s.camera.lead).toBe(0);
  });
});
describe("economy, supplies and persistence", () => {
  it("sells using canonical ore prices and pays for partial refills", () => {
    const s = debug.setCargo(state(), "ferron", 3);
    T.sell(s);
    expect(s.credits).toBe(84);
    expect(s.creditsEarned).toBe(84);
    s.miner.fuel = 0;
    T.buyMeter(s, "fuel", true);
    expect(s.miner.fuel).toBe(84);
    expect(s.credits).toBe(0);
  });
  it("upgrades add capacity difference rather than free refills", () => {
    const s = state();
    s.credits = 300;
    s.miner.fuel = 30;
    T.buyUpgrade(s, "fuel");
    expect(s.miner.fuel).toBe(105);
    expect(s.tiers.fuel).toBe(2);
    expect(s.credits).toBe(0);
    T.buyUpgrade(s, "fuel");
    expect(s.tiers.fuel).toBe(2);
  });
  it("explosives destroy ore but preserve materials and Core", () => {
    let s = state();
    s = debug.setMinerPosition(s, 332, 160);
    s = debug.setOreTile(s, 4, 2, "ferron");
    s = debug.setMaterialTile(s, 5, 2, "resonite");
    s = debug.setTile(s, 3, 2, "stone");
    s.items.dynamite = 1;
    T.useItem(s, "dynamite");
    expect(s.grid[2][4].kind).toBe("tunnel");
    expect(s.grid[2][3].kind).toBe("tunnel");
    expect(s.grid[2][5].material).toBe("resonite");
    expect(s.cargo.ferron).toBeUndefined();
    expect(s.items.dynamite).toBe(0);
  });
  it("uses posed teleport outcomes once and retains ineffective supplies", () => {
    let s = state();
    s.items.nanobots = 1;
    T.useItem(s, "nanobots");
    expect(s.items.nanobots).toBe(1);
    s.items["quantum-teleporter"] = 1;
    s = debug.setNextTeleportHeight(s, 8);
    s = debug.setNextTeleportSpeed(s, 700);
    T.useItem(s, "quantum-teleporter");
    expect(s.miner.y + C.MINER_H).toBe(C.SURFACE_Y - 8 * C.TILE);
    expect(s.miner.vy).toBe(700);
    expect(s.nextTeleportHeight).toBeNull();
    expect(s.nextTeleportSpeed).toBeNull();
  });
  it("fabricates in order and consumes the Core timer before launch", () => {
    const s = state();
    s.credits = C.ROCKET_TOTAL_CREDITS;
    s.satchel.resonite = 1;
    s.satchel.cryenite = 1;
    s.satchel.coreSample = true;
    s.coreTimer = 90;
    for (let i = 0; i < 5; i++) T.fabricate(s);
    expect(s.installed).toBe(5);
    expect(s.credits).toBe(0);
    expect(s.coreTimer).toBeNull();
    T.launch(s);
    expect(s.screen).toBe("victory");
    expect(s.summary?.componentsInstalled).toBe(5);
  });
  it("saves actual terrain and holdings, restores on surface, refuses a live Core", () => {
    let s = state();
    generate(s);
    s = debug.setCargo(s, "marlite", 2);
    s.miner.fuel = 42;
    s.grid[4][4] = cell("tunnel", "topsoil");
    T.save(s);
    expect(s.hasSave).toBe(true);
    const restored = T.restore(s);
    expect(restored.miner.fuel).toBe(42);
    expect(restored.cargo.marlite).toBe(2);
    expect(restored.grid[4][4].kind).toBe("tunnel");
    expect(depth(restored)).toBe(0);
    s = debug.setCoreCarried(s, true);
    T.save(s);
    expect(s.note).toContain("Cannot save");
  });
  it("hardcore death deletes the save immediately; standard preserves it", () => {
    const standard = state();
    T.save(standard);
    T.end(standard, "hull-destroyed");
    expect(standard.hasSave).toBe(true);
    const hardcore = clone(standard);
    hardcore.mode = "hardcore";
    hardcore.summary = null;
    T.end(hardcore, "hull-destroyed");
    expect(hardcore.hasSave).toBe(false);
  });
  it("reports only visible controls and valid menu rectangles", () => {
    const s = state();
    expect(menuRect(s, 0)).toBeNull();
    expect(controlRect(s, "sell", null)).toBeNull();
    s.panel = "ore-market";
    expect(controlRect(s, "sell", null)).not.toBeNull();
    expect(controlRect(s, "buy-item", "dynamite")).toBeNull();
  });
});

describe("regressions at expedition boundaries", () => {
  it("standing at the surface consumes no fuel, including at zero", () => {
    let s = debug.setTile(state(), C.SPAWN_COL, 1, "rock");
    tick(s, 10);
    expect(s.miner.fuel).toBe(C.FUEL_TIERS[0]);
    expect(depth(s)).toBe(0);
    s = debug.setFuel(s, 0);
    tick(s, 1);
    expect(s.screen).toBe("in-mine");
  });
  it("can resume a partial shaft and thrust out without becoming lodged", () => {
    let s = debug.setTile(state(), C.SPAWN_COL, 1, "rock");
    s = debug.setTile(s, C.SPAWN_COL, 2, "rock");
    tick(s, 0.3, { ...still, down: true });
    tick(s, 0.1);
    expect(s.grid[1][C.SPAWN_COL].health).toBe(2);
    const y = s.miner.y;
    tick(s, 0.4, { ...still, up: true });
    expect(s.miner.y).toBeLessThan(y - 30);
  });
  it("falls into open ground without sinking during the cut above it", () => {
    const s = debug.setTile(state(), C.SPAWN_COL, 1, "rock");
    tick(s, 0.25, { ...still, down: true });
    expect(s.miner.y).toBeCloseTo(C.SURFACE_Y - C.MINER_H);
    tick(s, 0.3, { ...still, down: true });
    expect(s.grid[1][C.SPAWN_COL].kind).toBe("tunnel");
    expect(s.miner.vy).toBeGreaterThan(0);
  });
  it("does not buy a fixed increment it cannot afford", () => {
    const s = state();
    s.miner.fuel = 20;
    s.credits = 10;
    T.buyMeter(s, "fuel", false);
    expect(s.miner.fuel).toBe(20);
    expect(s.credits).toBe(10);
    T.buyMeter(s, "fuel", true);
    expect(s.miner.fuel).toBe(30);
  });
});
