/* global document, KeyboardEvent */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route("**/capture", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body style="margin:0;background:#0c171f"><canvas id="capture" style="width:1280px;height:720px;display:block"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/capture");
await mkdir("showcase", { recursive: true });
const recording = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game } = await import("/src/game.ts");
  const e = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    clock: new ConstantClock(1000 / 30),
    background: "#0c171f",
  });
  await e.initialize();
  const d = e.debug;
  e.apply((s) => d.setWorldSize(s, "quick"));
  e.apply((s) => d.generateMine(s));
  e.apply((s) => d.setScreen(s, "in-mine"));
  for (const track of ["fuel", "drill", "cargo", "hull", "jetpack", "radiator"])
    e.apply((s) => d.setTier(s, track, 3));
  e.apply((s) => d.setFuel(s, 230));
  e.apply((s) => d.setHull(s, 205));
  e.apply((s) => d.setCredits(s, 2840));
  e.apply((s) => d.setRocketInstalled(s, 2));
  // A prepared mid-expedition shaft, then entirely ordinary held-key play.
  for (let r = 112; r < 125; r++) e.apply((s) => d.setTile(s, 16, r, "tunnel"));
  for (let c = 13; c <= 18; c++) e.apply((s) => d.setTile(s, c, 121, "tunnel"));
  e.apply((s) => d.setMinerPosition(s, 16 * 80 + 12, 125 * 80 - 72));
  e.apply((s) => d.setCargo(s, "argenite", 5));
  e.apply((s) => d.setCargo(s, "cobaltine", 3));
  await e.advance(1);
  e.startRecording();
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
  await e.advance(75);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  await e.advance(45);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
  await e.advance(15);
  const recording = e.stopRecording();
  e.destroy();
  return recording;
});
await writeFile(
  "showcase/descent.json.gz",
  gzipSync(JSON.stringify(recording)),
);
await page.screenshot({ path: "showcase/descent.png" });
await page.reload();
await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game } = await import("/src/game.ts");
  const e = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    clock: new ConstantClock(1000 / 60),
    background: "#0c171f",
  });
  await e.initialize();
  const d = e.debug;
  e.apply((s) => d.generateMine(s));
  e.apply((s) => d.setScreen(s, "in-mine"));
  e.apply((s) => d.setCredits(s, 1280));
  e.apply((s) => d.setRocketInstalled(s, 3));
  e.apply((s) => d.setMinerPosition(s, 1200, 8));
  await e.advance(1);
  e.destroy();
});
await page.screenshot({ path: "showcase/camp.png" });
await page.reload();
await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game } = await import("/src/game.ts");
  const e = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    clock: new ConstantClock(1000 / 60),
    background: "#0c171f",
  });
  await e.initialize();
  const d = e.debug;
  e.apply((s) => d.generateMine(s));
  e.apply((s) => d.setScreen(s, "in-mine"));
  e.apply((s) => d.setCredits(s, 6200));
  e.apply((s) => d.setRocketInstalled(s, 3));
  e.apply((s) => d.setMaterial(s, "cryenite", 1));
  e.apply((s) => d.setMinerPosition(s, 1900, 8));
  await e.advance(1);
  e.apply((s) => d.setPanel(s, "launch-pad"));
  await e.advance(1);
  e.destroy();
});
await page.screenshot({ path: "showcase/rocket.png" });
await page.reload();
await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game } = await import("/src/game.ts");
  const e = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    clock: new ConstantClock(1000 / 60),
    background: "#0c171f",
  });
  await e.initialize();
  const d = e.debug;
  e.apply((s) => d.setWorldSize(s, "quick"));
  e.apply((s) => d.generateMine(s));
  e.apply((s) => d.setScreen(s, "in-mine"));
  for (const track of ["fuel", "drill", "hull", "jetpack", "radiator"])
    e.apply((s) => d.setTier(s, track, 5));
  e.apply((s) => d.setFuel(s, 418));
  e.apply((s) => d.setHull(s, 370));
  e.apply((s) => d.setCredits(s, 5340));
  e.apply((s) => d.setRocketInstalled(s, 4));
  for (let r = 240; r < 250; r++) e.apply((s) => d.setTile(s, 16, r, "tunnel"));
  for (let c = 13; c <= 19; c++) e.apply((s) => d.setTile(s, c, 249, "tunnel"));
  e.apply((s) => d.setMinerPosition(s, 1292, 250 * 80 - 72));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
  await e.advance(1);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
  await e.advance(8);
  e.destroy();
});
await page.screenshot({ path: "showcase/core.png" });
await browser.close();
