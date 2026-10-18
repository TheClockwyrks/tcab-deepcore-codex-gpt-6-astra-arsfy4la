import "./style.css";
import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import { type State, initial, clone, effect, tile, buildings } from "./model";
import { debug, snapshot } from "./debug";
import { render, PALETTE } from "./render";
import { step } from "./simulation";
import {
  menu,
  menuRect,
  controls,
  contains,
  choose,
  back,
  act,
  activateBuilding,
} from "./ui";
import { useItem, jettison } from "./transactions";
import { ASSET_PATHS } from "./asset-manifest";
export type DeepcoreState = State;
export type DeepcoreDebugApi = typeof debug;
export const BACKGROUND = PALETTE.bg;
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTION_NAMES)
      api.input.register(name, { keys: [...C.ACTIONS[name]] });
    const resources: State["resources"] = { images: {}, systems: {} };
    await Promise.all(
      ASSET_PATHS.map(async (path) => {
        if (path.endsWith(".png"))
          resources.images[path] = await api.assets.loadImage(path);
        else {
          const blob = await api.assets.load(path);
          resources.systems[path.slice(3, -5)] = JSON.parse(
            await blob.text(),
          ) as ParticleSystem;
        }
      }),
    );
    await Promise.all(
      Object.values(C.CUES).map((cue) =>
        api.audio.load(cue, `audio/${cue}.wav`),
      ),
    );
    for (const key of [
      "screen",
      "panel",
      "mode",
      "worldSize",
      "miner",
      "cargo",
      "satchel",
      "tiers",
      "coreTimer",
      "scanner",
      "credits",
      "depthMeters",
    ] as const)
      api.diagnostics.register(key, (s) => {
        const value = snapshot(s)[key];
        return typeof value === "object"
          ? JSON.stringify(value)
          : (value ?? "none");
      });
    return [initial(resources), debug];
  },
  update(state, api, dt) {
    let s = clone(state);
    s.simTime += dt;
    const input = api.input;
    const pressed = Object.fromEntries(
      C.ACTION_NAMES.map((n) => [n, input.pressed(n)]),
    ) as Record<C.ActionName, boolean>;
    if (pressed.mute) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    api.audio.loop(C.CUES.music);
    const samples = input.pointerSamples();
    for (const sample of samples) {
      const item = menu(s).findIndex((_, i) =>
        contains(menuRect(s, i)!, sample.x, sample.y),
      );
      const control = controls(s).find(
        (c) => c.enabled && contains(c.rect, sample.x, sample.y),
      );
      const b =
        s.screen === "in-mine" && !s.panel
          ? buildings.find((b) =>
              contains(
                {
                  x: b.x - s.camera.x,
                  y: b.y - s.camera.y + C.HUD_H,
                  w: b.w,
                  h: b.h,
                },
                sample.x,
                sample.y,
              ),
            )
          : undefined;
      const key =
        item >= 0
          ? `menu:${item}`
          : control
            ? `${control.id}:${control.subject ?? ""}`
            : b
              ? `building:${b.id}`
              : "";
      if (item >= 0) s.menuIndex = item;
      if (sample.type === "down") {
        s.pointerDown[sample.id] = key;
        if (control?.id === "dismiss-notice") s.notice = null;
      }
      if (sample.type === "up") {
        if (key && key === s.pointerDown[sample.id]) {
          if (item >= 0) s = choose(s, item);
          else if (control?.id === "mute")
            api.audio.setMuted(!api.audio.muted());
          else if (control) act(s, control.id, control.subject);
          else if (b) activateBuilding(s, b.id);
        }
        delete s.pointerDown[sample.id];
      }
    }
    if (s.screen !== "in-mine") {
      const length = menu(s).length;
      if (pressed.down) s.menuIndex = (s.menuIndex + 1) % length;
      if (pressed.up) s.menuIndex = (s.menuIndex + length - 1) % length;
      if (pressed.activate) s = choose(s, s.menuIndex);
      if (pressed.pause) s = back(s);
    } else {
      if (pressed.pause) act(s, "pause", null);
      if (pressed.inventory) act(s, "inventory", null);
      if (pressed.jettison) jettison(s);
      C.ITEM_IDS.forEach((id, i) => {
        if (pressed[`supply${i + 1}` as C.ActionName]) useItem(s, id);
      });
      if (s.panel) {
        const list = controls(s).filter(
          (c) =>
            !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
        );
        if (pressed.down) s.panelIndex = (s.panelIndex + 1) % list.length;
        if (pressed.up)
          s.panelIndex = (s.panelIndex + list.length - 1) % list.length;
        if (pressed.activate) {
          const c = list[s.panelIndex];
          if (c?.enabled) act(s, c.id, c.subject);
        }
      } else if (pressed.activate) activateBuilding(s);
    }
    const held = {
      left: input.value("left") > 0,
      right: input.value("right") > 0,
      down: input.value("down") > 0,
      up: input.value("up") > 0,
    };
    if (s.screen === "in-mine") {
      s.accumulator += dt;
      const tick = 1 / 120;
      while (s.accumulator + 1e-10 >= tick) {
        s.accumulator -= tick;
        step(s, held, tick);
        if (s.screen !== "in-mine") {
          s.accumulator = 0;
          break;
        }
      }
      if (s.notice) {
        s.notice.age += dt;
        if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
      }
      if (
        Math.floor(s.elapsedSeconds / C.GAS_SEEP_PERIOD) !==
        Math.floor(state.elapsedSeconds / C.GAS_SEEP_PERIOD)
      ) {
        for (
          let r = Math.max(1, Math.floor(s.camera.y / C.TILE));
          r <= Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
          r++
        )
          for (
            let c = Math.max(0, Math.floor(s.camera.x / C.TILE));
            c <
            Math.min(C.WORLD_COLS, Math.ceil((s.camera.x + C.VIEW_W) / C.TILE));
            c++
          )
            if (tile(s, c, r).kind === "gas")
              effect(s, "gas-seep", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
      }
      if (
        s.coreTimer !== null &&
        Math.floor(s.elapsedSeconds * (s.coreTimer < 15 ? 4 : 1)) !==
          Math.floor(state.elapsedSeconds * (s.coreTimer < 15 ? 4 : 1))
      )
        s.sounds.push(C.CUES.alarmCore);
    }
    if (s.screen !== "paused") {
      s.effects = s.effects
        .map((fx) => ({ ...fx, age: fx.age + dt }))
        .filter((fx) => fx.age < 1.3);
      s.noteTime = Math.max(0, s.noteTime - dt);
      s.shake = Math.max(0, s.shake - dt * 14);
      if (s.launchTime !== null) {
        s.launchTime += dt;
        if (s.launchTime < 3)
          effect(
            s,
            "launch-exhaust",
            1910,
            C.SURFACE_Y - s.launchTime ** 2 * 90,
          );
      }
      if (s.screen === "title") s.miner.anim += dt;
    }
    for (const cue of s.sounds) api.audio.play(cue);
    s.sounds = [];
    if (s.screen === "in-mine" && !s.panel && s.miner.drilling)
      api.audio.loop(C.CUES.drill);
    else api.audio.stop(C.CUES.drill);
    if (s.screen === "in-mine" && !s.panel && held.up && s.miner.fuel > 0)
      api.audio.loop(C.CUES.thrust);
    else api.audio.stop(C.CUES.thrust);
    s.muted = api.audio.muted();
    return s;
  },
  render,
};
