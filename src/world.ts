import * as C from "./constants";
import { bandAt, cell, emptyGrid, type State } from "./model";
/** Place counted populations, then preserve a safe connected spine and node branches. */
export function generate(s: State): void {
  s.grid = emptyGrid(s.coreRow);
  for (let r = 1; r < s.coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++)
      s.grid[r][c] = cell("rock", bandAt(r, s.coreRow));
  for (const [bi, band] of C.BANDS.entries()) {
    const positions: { c: number; r: number }[] = [];
    for (let r = 1; r < s.coreRow; r++)
      if (bandAt(r, s.coreRow) === band)
        for (let c = 1; c < C.WORLD_COLS - 1; c++) positions.push({ c, r });
    const pick = () => positions[Math.floor(Math.random() * positions.length)];
    const place = (kind: C.TileKind, count: number, cluster = false) => {
      let left = Math.round(count),
        tries = 0;
      while (left > 0 && tries++ < positions.length * 20) {
        const start = pick();
        for (let j = 0; j < (cluster ? 3 : 1) && left > 0; j++) {
          const c = Math.min(C.WORLD_COLS - 2, start.c + j),
            r = start.r;
          const t = s.grid[r][c];
          if (t.kind !== "rock" || c === C.CORE_COL || c === C.CAVE_MOUTH_COL)
            continue;
          if (kind === "ore" && r < C.ORE_MIN_ROW) continue;
          let ore: C.OreId | null = null;
          if (kind === "ore") {
            const f = (r - 1) / (s.coreRow - 1),
              weights = C.MINERALS.map(
                (m) =>
                  m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
              );
            let draw = Math.random() * weights.reduce((a, b) => a + b, 0);
            ore = C.MINERALS[C.MINERALS.length - 1].id;
            for (let k = 0; k < weights.length; k++) {
              draw -= weights[k];
              if (draw <= 0) {
                ore = C.MINERALS[k].id;
                break;
              }
            }
          }
          s.grid[r][c] = cell(kind, band, ore);
          left--;
        }
      }
    };
    const f = (bi + 0.5) / C.BANDS.length;
    place("ore", positions.length * C.ORE_DENSITY, true);
    if (bi > 0) {
      place(
        "stone",
        positions.length *
          (C.STONE_DENSITY_MIN +
            ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (f - 0.25)) / 0.75),
      );
      place(
        "gas",
        positions.length *
          (C.GAS_DENSITY_MIN +
            ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (f - 0.25)) / 0.75),
      );
    }
    if (bi > 1)
      place(
        "lava",
        positions.length *
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5),
        true,
      );
    for (const material of C.MATERIALS)
      if (C.MATERIAL_BAND[material] === band) {
        const p = pick();
        s.grid[p.r][p.c] = cell("material", band, null, material);
        for (
          let c = Math.min(C.CORE_COL, p.c);
          c <= Math.max(C.CORE_COL, p.c);
          c++
        ) {
          const t = s.grid[p.r][c];
          if (t.kind === "lava" || t.kind === "stone")
            s.grid[p.r][c] = cell("rock", band);
        }
      }
  }
  s.grid[1][C.CAVE_MOUTH_COL] = cell("tunnel", "topsoil");
}
export function resize(s: State, size: C.WorldSize) {
  const old = s.grid,
    oldCore = s.coreRow;
  s.worldSize = size;
  s.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
  s.grid = emptyGrid(s.coreRow);
  for (let r = 0; r < Math.min(oldCore, s.coreRow); r++)
    s.grid[r] = old[r].slice();
}
