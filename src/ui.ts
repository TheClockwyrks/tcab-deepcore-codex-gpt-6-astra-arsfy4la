import * as C from "./constants";
import {
  type ReadState,
  type State,
  type Rect,
  buildings,
  cargoStats,
  maxFuel,
  maxHull,
} from "./model";
import * as T from "./transactions";
export interface Control {
  id: string;
  subject: string | null;
  label: string;
  detail: string;
  rect: Rect;
  enabled: boolean;
}
export function menu(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (index < 0 || index >= menu(s).length) return null;
  return {
    x: 86,
    y: (s.screen === "how-to-play" ? 592 : 362) + index * 64,
    w: 420,
    h: 50,
  };
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const out: Control[] = [];
  const add = (
    id: string,
    label: string,
    detail = "",
    enabled = true,
    subject: string | null = null,
  ) =>
    out.push({
      id,
      subject,
      label,
      detail,
      enabled,
      rect: { x: 250, y: 202 + out.length * 49, w: 780, h: 40 },
    });
  if (s.panel === "fuel-depot") {
    add(
      "buy-fuel",
      `FUEL +${C.FUEL_BUY_INCREMENT}`,
      `${C.FUEL_PRICE} CR / UNIT`,
      s.credits >=
        Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
          C.FUEL_PRICE && s.miner.fuel < maxFuel(s),
    );
    add(
      "fill-fuel",
      "FILL TANK",
      `${Math.max(0, maxFuel(s) - s.miner.fuel).toFixed(0)} CR`,
      s.credits > 0 && s.miner.fuel < maxFuel(s),
    );
    add(
      "buy-repair",
      `REPAIR +${C.REPAIR_BUY_INCREMENT}`,
      `${C.REPAIR_PRICE} CR / UNIT`,
      s.credits >=
        Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
          C.REPAIR_PRICE && s.miner.hull < maxHull(s),
    );
    add(
      "repair-full",
      "FULL REPAIR",
      `${Math.max(0, maxHull(s) - s.miner.hull) * C.REPAIR_PRICE} CR`,
      s.credits > 0 && s.miner.hull < maxHull(s),
    );
  }
  if (s.panel === "ore-market") {
    const value = C.MINERALS.reduce(
      (a, o) => a + (s.cargo[o.id] ?? 0) * o.value,
      0,
    );
    add(
      "sell",
      C.SELL,
      `${cargoStats(s).slotsUsed} MINERALS  /  ${value} CR`,
      value > 0,
    );
  }
  if (s.panel === "upgrade-shop")
    for (const track of C.TRACKS) {
      const tier = s.tiers[track],
        price = C.UPGRADE_PRICES[tier - 1];
      const values: Record<C.TrackName, readonly (number | string)[]> = {
        fuel: C.FUEL_TIERS,
        drill: [1, 2, 3, 4, 5],
        cargo: C.CARGO_TIERS,
        hull: C.HULL_TIERS,
        jetpack: C.JETPACK_TIERS.map((t) => `${t.liftLimitKg} KG`),
        radiator: C.RADIATOR_TIERS.map((t) => `${t * 100}%`),
        scanner: C.SCANNER_TIERS.map((t) =>
          t === null ? "OFF" : `${t} TILES`,
        ),
      };
      add(
        "buy-upgrade",
        `${track.toUpperCase()}  /  TIER ${tier}`,
        tier >= C.MAX_TIER[track]
          ? "MAXIMUM"
          : `NEXT ${values[track][tier]}  ·  ${price} CR`,
        tier < C.MAX_TIER[track] && s.credits >= price,
        track,
      );
    }
  if (s.panel === "supply-depot")
    for (const item of C.ITEMS)
      add(
        "buy-item",
        item.name.toUpperCase(),
        `${s.items[item.id]} HELD  ·  ${item.price} CR`,
        s.credits >= item.price,
        item.id,
      );
  if (s.panel === "launch-pad") {
    const part = C.ROCKET_COMPONENTS[s.installed];
    if (part)
      add(
        "fabricate",
        C.FABRICATE,
        `${part.name}  ·  ${part.credits} CR${part.material ? " + " + part.material : ""}`,
        s.credits >= part.credits &&
          (!part.material ||
            (part.material === "core-sample"
              ? s.satchel.coreSample
              : s.satchel[part.material] > 0)),
      );
    else add("launch", C.LAUNCH, "LEAVE THIS WORLD");
  }
  if (s.panel === "inventory") {
    for (const ore of C.MINERALS)
      if (s.cargo[ore.id])
        add(
          "drop-ore",
          `DROP ${ore.name.toUpperCase()}`,
          `${s.cargo[ore.id]} × ${ore.weightKg} KG`,
          true,
          ore.id,
        );
    for (const item of C.ITEMS)
      if (s.items[item.id])
        add(
          "use-item",
          `${C.USE} ${item.name.toUpperCase()}`,
          `${s.items[item.id]} HELD`,
          true,
          item.id,
        );
    if (s.satchel.coreSample)
      add("jettison", C.JETTISON, "DISCARD THE UNSTABLE SAMPLE");
    if (out.length > 8)
      out.forEach(
        (o, i) =>
          (o.rect = {
            x: 240 + (i % 2) * 400,
            y: 195 + Math.floor(i / 2) * 38,
            w: 390,
            h: 36,
          }),
      );
  }
  out.push(
    {
      id: "inventory",
      subject: null,
      label: "I  CARGO",
      detail: "",
      enabled: true,
      rect: { x: 1002, y: 11, w: 105, h: 34 },
    },
    {
      id: "pause",
      subject: null,
      label: "Ⅱ",
      detail: "",
      enabled: true,
      rect: { x: 1120, y: 11, w: 48, h: 34 },
    },
    {
      id: "mute",
      subject: null,
      label: s.muted ? "♪ OFF" : "♪ ON",
      detail: "",
      enabled: true,
      rect: { x: 1179, y: 11, w: 85, h: 34 },
    },
  );
  if (s.panel)
    out.push({
      id: "close",
      subject: null,
      label: "ESC  CLOSE",
      detail: "",
      enabled: true,
      rect: { x: 925, y: 132, w: 120, h: 34 },
    });
  if (s.notice && s.notice.age >= C.NOTICE_DELAY)
    out.push({
      id: "dismiss-notice",
      subject: null,
      label: "",
      detail: "",
      enabled: true,
      rect: { x: 350, y: 600, w: 580, h: 85 },
    });
  return out;
}
export function controlRect(s: ReadState, id: string, subject: string | null) {
  return (
    controls(s).find((c) => c.id === id && c.subject === subject)?.rect ?? null
  );
}
export function contains(r: Rect, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
export function choose(s: State, index: number): State {
  const choice = menu(s)[index];
  s.menuIndex = 0;
  if (choice === "CONTINUE" || choice === "CONTINUE FROM SAVE")
    return T.restore(s);
  if (s.screen === "title") {
    s.screen = choice === "NEW EXPEDITION" ? "mode-select" : "how-to-play";
  } else if (s.screen === "mode-select") {
    if (choice === "BACK") {
      s.screen = "title";
      s.menuIndex = s.hasSave ? 1 : 0;
    } else {
      s.mode = C.MODES[index];
      s.screen = "size-select";
    }
  } else if (s.screen === "size-select") {
    if (choice === "BACK") {
      s.screen = "mode-select";
      s.menuIndex = C.MODES.indexOf(s.mode);
    } else {
      s.worldSize = C.WORLD_SIZES[index];
      return T.start(s);
    }
  } else if (s.screen === "how-to-play") {
    s.screen = "title";
    s.menuIndex = s.hasSave ? 2 : 1;
  } else if (s.screen === "paused") {
    if (choice === "RESUME") s.screen = "in-mine";
    else if (choice === "RESTART") return T.start(s);
    else {
      s.screen = "title";
      s.panel = null;
      s.menuIndex = s.hasSave ? 1 : 0;
    }
  } else if (choice === "PLAY AGAIN") return T.start(s);
  else {
    s.screen = "title";
    s.menuIndex = s.hasSave ? 1 : 0;
  }
  return s;
}
export function back(s: State): State {
  if (s.screen === "paused") {
    s.screen = "in-mine";
    s.menuIndex = 0;
    return s;
  }
  if (s.screen === "size-select") return choose(s, 3);
  if (s.screen === "mode-select") return choose(s, 2);
  if (s.screen === "how-to-play") return choose(s, 0);
  return s;
}
export function act(s: State, id: string, subject: string | null) {
  switch (id) {
    case "drop-ore": {
      const ore = subject as C.OreId;
      s.cargo[ore] = Math.max(0, (s.cargo[ore] ?? 0) - 1);
      if (!s.cargo[ore]) delete s.cargo[ore];
      break;
    }
    case "sell":
      T.sell(s);
      break;
    case "buy-fuel":
      T.buyMeter(s, "fuel", false);
      break;
    case "fill-fuel":
      T.buyMeter(s, "fuel", true);
      break;
    case "buy-repair":
      T.buyMeter(s, "hull", false);
      break;
    case "repair-full":
      T.buyMeter(s, "hull", true);
      break;
    case "buy-upgrade":
      T.buyUpgrade(s, subject as C.TrackName);
      break;
    case "buy-item":
      T.buyItem(s, subject as C.ItemId);
      break;
    case "use-item":
      T.useItem(s, subject as C.ItemId);
      break;
    case "jettison":
      T.jettison(s);
      break;
    case "fabricate":
      T.fabricate(s);
      break;
    case "launch":
      T.launch(s);
      break;
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelIndex = 0;
      break;
    case "pause":
      if (s.panel) s.panel = null;
      else {
        s.screen = "paused";
        s.menuIndex = 0;
      }
      break;
    case "close":
      s.panel = null;
      break;
    case "dismiss-notice":
      s.notice = null;
      break;
  }
}
export function activateBuilding(s: State, id?: C.BuildingId) {
  const m = s.miner;
  const b = buildings.find(
    (b) =>
      (!id || id === b.id) &&
      m.x + C.MINER_W / 2 >= b.x &&
      m.x + C.MINER_W / 2 <= b.x + b.w &&
      Math.abs(m.y + C.MINER_H - C.SURFACE_Y) < 8,
  );
  if (!b) return;
  if (b.id === "save-pad") T.save(s);
  else {
    s.panel = b.id;
    s.panelIndex = 0;
  }
}
