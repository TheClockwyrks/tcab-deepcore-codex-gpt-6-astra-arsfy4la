import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type ReadState,
  type Rect,
  tile,
  cargoStats,
  maxFuel,
  maxHull,
  depth,
  scanner,
  buildings,
} from "./model";
import { menu, menuRect, controls } from "./ui";
export const PALETTE = {
  bg: "#0c171f",
  panel: "#12242e",
  line: "#354b54",
  text: "#e5e5ce",
  muted: "#8fa6a5",
  gold: "#e6b65f",
  teal: "#8bd7c4",
  red: "#ef8067",
};
const frames: Record<C.MinerState, number> = {
  idle: 4,
  walk: 8,
  "drill-down": 4,
  "drill-side": 4,
  jetpack: 4,
  fall: 4,
  hurt: 3,
  "fuel-out": 3,
};
export const animationFrames = frames;
function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size = 16,
  color = PALETTE.text,
  font = "monospace",
) {
  ctx.fillStyle = color;
  ctx.font = `${size >= 24 ? "bold " : ""}${size}px ${font}`;
  ctx.fillText(str, x, y);
}
function box(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill = PALETTE.panel,
  stroke = PALETTE.line,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function sprite(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  path: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const image = s.resources.images[path];
  if (image) ctx.drawImage(image as ImageBitmap, x, y, w, h);
}
function miner(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = C.MINER_SPRITE,
  state = s.miner.state,
) {
  let frame = Math.floor(s.miner.anim * C.ANIM_FPS);
  frame =
    state === "hurt" ? Math.min(frames.hurt - 1, frame) : frame % frames[state];
  ctx.save();
  if (s.miner.facing === "west") {
    ctx.translate(x + size, y);
    ctx.scale(-1, 1);
    sprite(
      s,
      ctx,
      `miner/${state}/frame${String(frame).padStart(2, "0")}.png`,
      0,
      0,
      size,
      size,
    );
  } else
    sprite(
      s,
      ctx,
      `miner/${state}/frame${String(frame).padStart(2, "0")}.png`,
      x,
      y,
      size,
      size,
    );
  ctx.restore();
}
function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function shaped(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  c: number,
  r: number,
  kind: "tunnel" | "lava",
) {
  const x = c * C.TILE,
    y = r * C.TILE,
    n = 8;
  const same = (cc: number, rr: number) =>
    rr < 1 ? kind === "tunnel" : tile(s, cc, rr).kind === kind;
  ctx.save();
  round(ctx, x + n, y + n, C.TILE - n * 2, C.TILE - n * 2, 14);
  if (same(c - 1, r)) ctx.rect(x, y + n, 40, 64);
  if (same(c + 1, r)) ctx.rect(x + 40, y + n, 40, 64);
  if (same(c, r - 1)) ctx.rect(x + n, y, 64, 40);
  if (same(c, r + 1)) ctx.rect(x + n, y + 40, 64, 40);
  for (const dx of [-1, 1])
    for (const dy of [-1, 1])
      if (same(c + dx, r) && same(c, r + dy) && same(c + dx, r + dy))
        ctx.rect(x + (dx > 0 ? 40 : 0), y + (dy > 0 ? 40 : 0), 40, 40);
  ctx.clip();
  sprite(
    s,
    ctx,
    kind === "tunnel"
      ? "tiles/tunnel.png"
      : `hazards/lava/frame${String(Math.floor(s.simTime * 5) % 4).padStart(2, "0")}.png`,
    x,
    y,
    C.TILE,
    C.TILE,
  );
  ctx.restore();
}
function world(s: ReadState, ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const shake = s.shake;
  ctx.translate(
    -s.camera.x + Math.sin(s.simTime * 63) * shake,
    -s.camera.y + C.HUD_H + Math.cos(s.simTime * 49) * shake * 0.6,
  );
  if (s.camera.y < C.SURFACE_Y) {
    sprite(
      s,
      ctx,
      "surface/sky.png",
      s.camera.x,
      s.camera.y,
      C.VIEW_W,
      Math.max(480, C.SURFACE_Y - s.camera.y),
    );
    for (const b of buildings) {
      sprite(s, ctx, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      text(
        ctx,
        b.id.replace(/-/g, " ").toUpperCase(),
        b.x + 12,
        b.y - 15,
        13,
        PALETTE.muted,
      );
      if (
        s.miner.x + C.MINER_W / 2 >= b.x &&
        s.miner.x + C.MINER_W / 2 <= b.x + b.w &&
        Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) < 8
      ) {
        box(
          ctx,
          { x: b.x + 30, y: b.y - 63, w: 180, h: 30 },
          "#182d35",
          PALETTE.gold,
        );
        text(
          ctx,
          "[E] " + (b.id === "save-pad" ? "SAVE" : "INTERACT"),
          b.x + 45,
          b.y - 43,
          13,
          PALETTE.gold,
        );
      }
    }
    sprite(
      s,
      ctx,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE - 80,
      C.SURFACE_Y - 180,
      240,
      180,
    );
    text(
      ctx,
      "MINE ACCESS  ↓",
      C.CAVE_MOUTH_COL * C.TILE - 26,
      C.SURFACE_Y - 196,
      14,
      PALETTE.gold,
    );
    sprite(
      s,
      ctx,
      `rocket/stage${s.installed}.png`,
      1810,
      C.SURFACE_Y - 240 - (s.launchTime ?? 0) ** 2 * 90,
      200,
      240,
    );
  }
  const first = Math.max(1, Math.floor(s.camera.y / C.TILE)),
    last = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
  for (let r = first; r <= last; r++)
    for (
      let c = Math.max(0, Math.floor(s.camera.x / C.TILE));
      c <=
      Math.min(C.WORLD_COLS - 1, Math.ceil((s.camera.x + C.VIEW_W) / C.TILE));
      c++
    ) {
      const t = tile(s, c, r),
        x = c * C.TILE,
        y = r * C.TILE;
      const variant = (c * 17 + r * 7) % C.TILE_VARIANTS;
      const base = t.band
        ? `tiles/${t.band}-${variant}.png`
        : "tiles/bedrock.png";
      sprite(s, ctx, base, x, y, C.TILE, C.TILE);
      if (t.kind === "tunnel" || t.kind === "lava")
        shaped(s, ctx, c, r, t.kind);
      if (t.kind === "stone")
        sprite(s, ctx, `tiles/stone-${c % 2}.png`, x, y, C.TILE, C.TILE);
      if (t.ore) sprite(s, ctx, `ore/${t.ore}.png`, x, y, C.TILE, C.TILE);
      if (t.material)
        sprite(s, ctx, `materials/${t.material}.png`, x, y, C.TILE, C.TILE);
      if (t.kind === "core")
        sprite(s, ctx, "materials/core.png", x, y, C.TILE, C.TILE);
      if (t.health !== null && t.maxHealth && t.health < t.maxHealth)
        sprite(
          s,
          ctx,
          `tiles/crack/frame${String(Math.min(C.CRACK_FRAMES - 1, Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES))).padStart(2, "0")}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
      ctx.strokeStyle = "#050c141b";
      ctx.strokeRect(x + 0.5, y + 0.5, C.TILE, C.TILE);
    }
  if (s.launchTime === null)
    miner(s, ctx, s.miner.x - (C.MINER_SPRITE - C.MINER_W) / 2, s.miner.y - 8);
  if (s.coreGround) {
    sprite(
      s,
      ctx,
      "materials/core-sample.png",
      s.coreGround.col * C.TILE,
      s.coreGround.row * C.TILE,
      C.TILE,
      C.TILE,
    );
    text(
      ctx,
      `${s.coreTimer?.toFixed(1)}s`,
      s.coreGround.col * C.TILE,
      s.coreGround.row * C.TILE - 6,
      20,
      PALETTE.red,
    );
  }
  // The particle binding receives a logical 400-square surface over the engine context.
  let drawing = false;
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key === "canvas") return { width: 400, height: 400 };
      const value = Reflect.get(target, key, target) as unknown;
      if (typeof value === "function")
        return (...args: unknown[]) => {
          if (
            !drawing &&
            ["fill", "fillRect", "stroke", "strokeRect"].includes(String(key))
          )
            return;
          return value.apply(target, args) as unknown;
        };
      return value;
    },
    set(target, key, value: unknown) {
      return Reflect.set(target, key, value, target);
    },
  });
  for (const fx of s.effects) {
    const authored = s.resources.systems[fx.name];
    if (!authored) continue;
    const system = fx.tint
      ? {
          ...authored,
          emitters: authored.emitters.map((e) => ({
            ...e,
            particle: {
              ...e.particle,
              colorGradient: [
                { color: fx.tint!, at: 0 },
                { color: fx.tint!, at: 1 },
              ],
            },
          })),
        }
      : authored;
    ctx.save();
    ctx.translate(fx.x - 200, fx.y - 200);
    drawing = false;
    const player = new ParticleCanvasPlayer(system as ParticleSystem, proxy, {
      clear: false,
      seed: fx.seed,
      pixelRadius: 3,
    });
    for (let age = 0; age < fx.age; age += 1 / 30)
      player.simulator.step(Math.min(1 / 30, fx.age - age) * 1000);
    drawing = true;
    player.update(0);
    ctx.restore();
  }
  ctx.restore();
  // Gentle edge darkness leaves the miner and mineral colors readable.
  const shade = ctx.createRadialGradient(640, 390, 180, 640, 390, 760);
  shade.addColorStop(0, "#07131c00");
  shade.addColorStop(1, "#07131c88");
  ctx.fillStyle = shade;
  ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
}
function hud(s: ReadState, ctx: CanvasRenderingContext2D) {
  box(ctx, { x: 0, y: 0, w: C.STAGE_W, h: C.HUD_H }, "#101f28", "#415258");
  const stat = (
    icon: string,
    x: number,
    label: string,
    value: number,
    max: number,
    color: string,
  ) => {
    sprite(s, ctx, `icons/${icon}.png`, x, 16, C.ICON_SIZE, C.ICON_SIZE);
    text(ctx, label, x + 34, 21, 10, PALETTE.muted);
    text(ctx, `${Math.ceil(value)} / ${max}`, x + 34, 39, 13, color);
    ctx.fillStyle = "#2b3a40";
    ctx.fillRect(x + 115, 19, 86, 17);
    ctx.fillStyle = color;
    ctx.fillRect(x + 117, 21, 82 * Math.min(1, value / max), 13);
  };
  stat(
    "fuel",
    18,
    "FUEL",
    s.miner.fuel,
    maxFuel(s),
    s.miner.fuel / maxFuel(s) < C.LOW_FUEL_FRACTION
      ? PALETTE.red
      : PALETTE.gold,
  );
  stat(
    "hull",
    240,
    "HULL",
    s.miner.hull,
    maxHull(s),
    s.miner.hull / maxHull(s) < C.LOW_HULL_FRACTION
      ? PALETTE.red
      : PALETTE.teal,
  );
  const cargo = cargoStats(s);
  sprite(s, ctx, "icons/cargo.png", 465, 16, 24, 24);
  text(
    ctx,
    cargo.loadKg >= cargo.liftLimitKg ? C.OVERLOAD : "CARGO",
    499,
    21,
    10,
    PALETTE.muted,
  );
  text(
    ctx,
    `${cargo.slotsUsed}/${cargo.slotCap} · ${cargo.loadKg}kg`,
    499,
    39,
    13,
    cargo.slotsUsed >= cargo.slotCap ? PALETTE.red : PALETTE.text,
  );
  sprite(s, ctx, "icons/credits.png", 652, 16, 24, 24);
  text(ctx, "CREDITS", 685, 21, 10, PALETTE.muted);
  text(ctx, Math.floor(s.credits).toLocaleString(), 685, 39, 14, PALETTE.gold);
  sprite(s, ctx, "icons/depth.png", 786, 16, 24, 24);
  text(ctx, "DEPTH", 817, 21, 10, PALETTE.muted);
  text(ctx, `${Math.floor(depth(s))} m`, 817, 39, 14);
  for (const [i, m] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[m] ? 1 : 0.2;
    sprite(s, ctx, `icons/${m}.png`, 920 + i * 33, 16, 24, 24);
    ctx.globalAlpha = 1;
  }
  for (const c of controls(s).filter((c) =>
    ["inventory", "pause", "mute"].includes(c.id),
  )) {
    box(ctx, c.rect, "#1b3039");
    text(ctx, c.label, c.rect.x + 9, c.rect.y + 22, 12, PALETTE.muted);
  }
}
function titleArt(s: ReadState, ctx: CanvasRenderingContext2D) {
  sprite(s, ctx, "surface/sky.png", 0, 0, 1280, 720);
  ctx.save();
  ctx.beginPath();
  ctx.rect(688, 0, 592, 720);
  ctx.clip();
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 8; c++) {
      const x = 688 + c * 80,
        y = r * 80;
      const band = C.BANDS[Math.min(3, Math.floor(r / 3))];
      sprite(s, ctx, `tiles/${band}-${(r + c) % 3}.png`, x, y, 80, 80);
      if (c === 3 || (r === 4 && c > 1 && c < 6) || (r === 7 && c < 5))
        sprite(s, ctx, "tiles/tunnel.png", x + 5, y, 70, 80);
      else if ((r * 7 + c * 3) % 7 < 2 && r > 1)
        sprite(
          s,
          ctx,
          `ore/${C.MINERALS[(r + c) % C.MINERALS.length].id}.png`,
          x,
          y,
          80,
          80,
        );
    }
  sprite(s, ctx, "materials/resonite.png", 770, 418, 100, 100);
  sprite(s, ctx, "materials/cryenite.png", 1120, 528, 90, 90);
  miner(s, ctx, 898, 285, 128, "drill-down");
  sprite(s, ctx, "rocket/stage5.png", 1100, 32, 130, 156);
  ctx.restore();
  const fade = ctx.createLinearGradient(500, 0, 900, 0);
  fade.addColorStop(0, PALETTE.bg);
  fade.addColorStop(1, "#0c171f00");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 940, 720);
  ctx.fillStyle = "#0c171fcc";
  ctx.fillRect(0, 0, 560, 720);
  ctx.strokeStyle = "#d2b77940";
  ctx.beginPath();
  ctx.moveTo(647, 80);
  ctx.lineTo(647, 640);
  ctx.stroke();
  text(ctx, "01 / SURFACE", 700, 55, 12, PALETTE.gold);
  text(ctx, "02 / THE DESCENT", 700, 682, 12, PALETTE.muted);
}
function menus(s: ReadState, ctx: CanvasRenderingContext2D) {
  const isTitle = [
    "title",
    "mode-select",
    "size-select",
    "how-to-play",
  ].includes(s.screen);
  if (isTitle) titleArt(s, ctx);
  else {
    ctx.fillStyle = "#07131dd9";
    ctx.fillRect(0, 56, 1280, 664);
  }
  text(
    ctx,
    "D E E P C O R E   /   EXPEDITION SYSTEMS",
    86,
    88,
    12,
    PALETTE.gold,
  );
  const heading =
    s.screen === "title"
      ? C.TITLE_TEXT
      : s.screen === "mode-select"
        ? "CHOOSE YOUR RISK"
        : s.screen === "size-select"
          ? "HOW FAR DOWN?"
          : s.screen === "how-to-play"
            ? "THE WAY HOME"
            : s.screen === "paused"
              ? "TAKE A BREATH"
              : s.screen === "victory"
                ? "HOMEWARD."
                : "SIGNAL LOST";
  text(
    ctx,
    heading,
    80,
    220,
    s.screen === "title" ? 86 : 42,
    PALETTE.text,
    "sans-serif",
  );
  const lines =
    s.screen === "title"
      ? [
          "A dead world. A working drill. One way out.",
          "Mine the depths. Build your escape.",
        ]
      : s.screen === "mode-select"
        ? [
            "STANDARD · Restore your last save after death.",
            "HARDCORE · Death deletes your save.",
          ]
        : s.screen === "size-select"
          ? [
              "QUICK 1,250m  /  STANDARD 2,500m",
              "MARATHON 5,000m · Same danger. Deeper descent.",
            ]
          : s.screen === "paused"
            ? ["Your expedition is on hold.", "The Core timer is frozen."]
            : s.screen === "victory"
              ? [
                  "Five components. One final burn.",
                  "You made it off the rock.",
                ]
              : s.screen === "game-over"
                ? [
                    s.summary?.deathCause?.replace(/-/g, " ").toUpperCase() ??
                      "EXPEDITION ENDED",
                    "The mine keeps what you leave behind.",
                  ]
                : ["Depth is cheap. Height is expensive."];
  lines.forEach((l, i) => text(ctx, l, 86, 274 + i * 28, 15, PALETTE.muted));
  if (s.screen === "how-to-play") {
    box(ctx, { x: 680, y: 118, w: 550, h: 530 }, "#10242ef5", "#526766");
    const brief = [
      [
        "01  BUILD YOUR ESCAPE",
        "Sell ore, upgrade your suit, and fabricate five rocket",
        "components. Launch from the camp to win.",
      ],
      [
        "02  ALWAYS LEAVE FUEL FOR THE CLIMB",
        "Drill down or sideways, never up. Your jetpack is the",
        "only way back through a shaft. Fuel is never free.",
      ],
      [
        "03  WEALTH HAS WEIGHT",
        "Slots cap cargo. Weight slows your climb. At the lift",
        "limit, open [I] and drop ore until you can fly.",
      ],
      [
        "04  LISTEN TO THE ROCK",
        "Gas wisps warn of violent blasts. Lava burns the hull.",
        "Buy hull and radiator upgrades. Brake before landing.",
      ],
      [
        "05  FIND THE IMPOSSIBLE MATERIALS",
        "A scanner finds Resonite and Cryenite. The Core Sample",
        "starts a 90-second race. Install it before it detonates.",
      ],
      [
        "06  MAKE IT BACK TO THE SAVE PAD",
        "Standard restores your save after death. Hardcore",
        "deletes it. Neither mode saves automatically.",
      ],
    ];
    brief.forEach(([title, a, b], i) => {
      text(ctx, title, 703, 155 + i * 79, 13, PALETTE.gold);
      text(ctx, a, 703, 178 + i * 79, 12, PALETTE.muted);
      text(ctx, b, 703, 196 + i * 79, 12, PALETTE.muted);
    });
    const guide = [
      ["A / D  or  ← / →", "Walk. Drill a wall when you reach it."],
      ["S / ↓", "Drill down while standing on solid rock."],
      ["W / ↑ / SPACE", "Thrust upward through your tunnels."],
      ["E / ENTER", "Visit a building. Sell ore. Buy fuel."],
      ["I / 1—6 / J", "Cargo / field supplies / jettison Core."],
      ["ESC / M", "Pause / mute. Save only at the Save Pad."],
    ];
    guide.forEach(([key, desc], i) => {
      text(ctx, key, 86, 345 + i * 38, 13, PALETTE.gold);
      text(ctx, desc, 86, 361 + i * 38, 11, PALETTE.muted);
    });
  }
  if (s.summary) {
    const a = s.summary;
    text(
      ctx,
      `${Math.floor(a.deepestDepthMeters)}m DEEPEST   ·   ${a.creditsEarned} CR EARNED`,
      660,
      380,
      18,
      PALETTE.gold,
    );
    text(
      ctx,
      `${Math.floor(a.elapsedSeconds / 60)}m ${Math.floor(a.elapsedSeconds % 60)}s   ·   ${a.componentsInstalled}/5 COMPONENTS`,
      660,
      415,
      16,
      PALETTE.muted,
    );
  }
  menu(s).forEach((label, i) => {
    const r = menuRect(s, i)!;
    const active = i === s.menuIndex;
    box(
      ctx,
      r,
      active ? "#283b3d" : "#13252ed9",
      active ? PALETTE.gold : "#3b4b50",
    );
    if (active) {
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(r.x, r.y, 4, r.h);
    }
    text(
      ctx,
      label,
      r.x + 23,
      r.y + 32,
      17,
      active ? PALETTE.gold : PALETTE.text,
    );
    text(
      ctx,
      active ? "→" : String(i + 1).padStart(2, "0"),
      r.x + r.w - 40,
      r.y + 31,
      17,
      active ? PALETTE.gold : PALETTE.muted,
    );
  });
  text(
    ctx,
    "↑ ↓ SELECT     ENTER CONFIRM     M SOUND",
    86,
    678,
    11,
    PALETTE.muted,
  );
}
function panel(s: ReadState, ctx: CanvasRenderingContext2D) {
  if (!s.panel) return;
  ctx.fillStyle = "#07121dc4";
  ctx.fillRect(0, 56, 1280, 664);
  box(ctx, { x: 210, y: 112, w: 860, h: 540 }, "#12242ef5", "#657572");
  text(ctx, s.panel.replace(/-/g, " ").toUpperCase(), 250, 159, 27);
  text(
    ctx,
    `${Math.floor(s.credits)} CR AVAILABLE`,
    250,
    182,
    11,
    PALETTE.gold,
  );
  const list = controls(s).filter(
    (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
  );
  list.forEach((c, i) => {
    box(
      ctx,
      c.rect,
      c.enabled ? "#213840" : "#182b34",
      i === s.panelIndex ? PALETTE.gold : PALETTE.line,
    );
    text(
      ctx,
      c.label,
      c.rect.x + 13,
      c.rect.y + 25,
      13,
      c.enabled ? PALETTE.text : "#6e8287",
    );
    if (c.detail) {
      ctx.font = "12px monospace";
      text(
        ctx,
        c.detail,
        c.rect.x + c.rect.w - 13 - ctx.measureText(c.detail).width,
        c.rect.y + 25,
        12,
        c.enabled ? PALETTE.gold : "#6e8287",
      );
    }
  });
  if (s.panel === "inventory") {
    const stats = cargoStats(s);
    text(
      ctx,
      `${stats.slotsUsed}/${stats.slotCap} SLOTS  ·  ${stats.loadKg}/${stats.liftLimitKg} KG LIFT  ·  RESONITE ${s.satchel.resonite}  ·  CRYENITE ${s.satchel.cryenite}`,
      250,
      600,
      12,
      PALETTE.teal,
    );
    if (!list.some((c) => c.id !== "close"))
      text(
        ctx,
        "Your cargo bay is empty. Find a vein below.",
        250,
        265,
        16,
        PALETTE.muted,
      );
  }
  if (s.panel === "launch-pad") {
    C.ROCKET_COMPONENTS.forEach((part, i) => {
      text(
        ctx,
        `${i < s.installed ? "✓" : "○"}  ${part.name}`,
        265,
        310 + i * 45,
        16,
        i < s.installed ? PALETTE.teal : PALETTE.muted,
      );
      text(
        ctx,
        `${part.credits} CR${part.material ? " + " + part.material : ""}`,
        600,
        310 + i * 45,
        13,
        PALETTE.gold,
      );
    });
    sprite(s, ctx, `rocket/stage${s.installed}.png`, 865, 310, 130, 156);
  }
  if (s.panel === "ore-market") {
    let row = 0;
    for (const ore of C.MINERALS)
      if (s.cargo[ore.id]) {
        text(
          ctx,
          `${ore.name} × ${s.cargo[ore.id]}   /   ${(s.cargo[ore.id] ?? 0) * ore.value} CR`,
          260 + (row % 2) * 370,
          290 + Math.floor(row / 2) * 33,
          14,
          PALETTE.muted,
        );
        row++;
      }
  }
  text(
    ctx,
    "↑ ↓ SELECT   ENTER ACTIVATE                                    ESC CLOSE",
    250,
    627,
    11,
    PALETTE.muted,
  );
}
export function render(s: ReadState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (
    ["title", "mode-select", "size-select", "how-to-play"].includes(s.screen)
  ) {
    menus(s, ctx);
    return;
  }
  world(s, ctx);
  hud(s, ctx);
  if (s.screen === "victory" && s.launchTime !== null && s.launchTime < 3) {
    text(ctx, "LAUNCH SEQUENCE / HOMEWARD", 430, 110, 24, PALETTE.gold);
    return;
  }
  if (s.screen !== "in-mine") {
    menus(s, ctx);
    return;
  }
  const band =
    depth(s) < 0.02
      ? "SURFACE CAMP"
      : C.BANDS[
          Math.min(
            3,
            Math.floor((4 * depth(s)) / (s.coreRow * C.METERS_PER_ROW)),
          )
        ].toUpperCase();
  box(ctx, { x: 20, y: 76, w: 196, h: 35 }, "#10222bcc");
  text(ctx, `●  ${band}`, 34, 99, 12, PALETTE.muted);
  box(ctx, { x: 20, y: 674, w: 470, h: 30 }, "#0e2029e8", "#263c44");
  text(
    ctx,
    "A D  MOVE    S  DRILL    W  THRUST    E  INTERACT",
    30,
    697,
    11,
    PALETTE.muted,
  );
  const scan = scanner(s);
  if (scan.locked)
    text(
      ctx,
      `SCAN  ${scan.target?.toUpperCase()}  ${scan.distanceTiles?.toFixed(1)} TILES  ${scan.dirY > 0 ? "↓" : "↑"} ${scan.dirX > 0 ? "→" : "←"}`,
      740,
      95,
      13,
      PALETTE.teal,
    );
  panel(s, ctx);
  if (s.coreTimer !== null && s.satchel.coreSample) {
    box(ctx, { x: 457, y: 76, w: 366, h: 61 }, "#3a2525", PALETTE.red);
    text(
      ctx,
      `CORE UNSTABLE   ${s.coreTimer.toFixed(1)}s`,
      476,
      103,
      20,
      PALETTE.gold,
    );
    text(
      ctx,
      "RETURN TO LAUNCH PAD  /  [J] JETTISON",
      476,
      123,
      11,
      PALETTE.muted,
    );
  }
  if (s.noteTime > 0) {
    const toastY = s.panel
      ? 530
      : s.miner.y - s.camera.y + C.HUD_H > 520
        ? 146
        : 558;
    const w = Math.min(900, s.note.length * 9 + 40);
    box(
      ctx,
      { x: (1280 - w) / 2, y: toastY, w, h: 38 },
      "#132a32ed",
      "#697b70",
    );
    text(ctx, s.note, (1280 - w) / 2 + 20, toastY + 25, 13, PALETTE.gold);
  }
  if (s.notice && s.notice.age >= C.NOTICE_DELAY) {
    box(ctx, { x: 350, y: 600, w: 580, h: 85 }, "#2a3035", PALETTE.gold);
    text(
      ctx,
      s.notice.hazard === "gas" ? "VOLATILE GAS" : "EXTREME HEAT",
      370,
      627,
      17,
      PALETTE.gold,
    );
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "Watch for pale wisps. Upgrade hull before deeper cuts."
        : "Route around lava. A radiator reduces heat damage.",
      370,
      653,
      13,
    );
    text(ctx, "CLICK TO DISMISS", 370, 673, 10, PALETTE.muted);
  }
}
