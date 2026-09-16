import { launch, buildProbe, reporter, shot } from "./harness.mjs";

const PROBE = buildProbe();
const { ok, finish } = reporter();
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(PROBE);

await p.waitForFunction(() => window.__wt && window.__wt.W && !window.__wt.gen.busy, null, { timeout: 30000 });
await p.evaluate(() => window.__wt.regen(777));
await p.waitForFunction(() => !window.__wt.gen.busy, null, { timeout: 30000 });
await p.evaluate(() => {
  const w = window.__wt, W = w.W, n = W.n;
  let best = -1, bi = 0;
  for (let i = 0; i < W.flow.length; i++) if (W.flow[i] > best && W.biome[i] !== 0) { best = W.flow[i]; bi = i; }
  w.aim(bi % n, Math.floor(bi / n));
});

// --- pressure ON ---------------------------------------------------------
await p.evaluate(() => window.__wt.setPressure(true));
await p.keyboard.press("Enter");
await p.waitForTimeout(5000);
const on = await p.evaluate(() => {
  const L = window.__wt.L;
  let wet = 0, far = 0;
  for (let i = 0; i < L.cells; i++) if (L.lvl[i]) wet++;
  for (let z = 0; z < L.d; z++) for (let y = 1; y < L.h - 1; y++)
    if (L.lvl[z * L.plane + y * L.w + (L.w - 6)]) far++;
  return { wet, far, curN: L.curN, pressMoved: L.pressMoved, pressCells: L.pressCells,
           tickMs: +window.__wt.stat.tickMs.toFixed(3), pressMs: +window.__wt.stat.pressMs.toFixed(3),
           paintMs: +window.__wt.stat.paintMs.toFixed(2), leak: L.leak };
});
console.log("\npressure ON after 5s:  " + JSON.stringify(on));
ok("the river keeps running", on.pressMoved > 0,
   on.curN + " active, " + on.pressMoved + " units pushed last tick");
ok("water reaches the far edge", on.far > 0, on.far + " wet cells there");
ok("pressure is flooding a body every tick", on.pressCells > 0, on.pressCells + " cells flooded per tick");
ok("still inside the frame budget", on.tickMs + on.pressMs < 16.7,
   "flow " + on.tickMs + "ms + pressure " + on.pressMs + "ms");

// --- pressure OFF, same embark -------------------------------------------
await p.evaluate(() => { window.__wt.setPressure(false); window.__wt.buildLocal(window.__wt.L.wi); });
// Wait for the set to drain rather than a fixed span: how long a channel
// takes to settle depends on the terrain it is cut into.
await p.waitForFunction(() => window.__wt.L.curN === 0, null, { timeout: 40000 }).catch(() => {});
await p.waitForTimeout(2500);
const off = await p.evaluate(() => {
  const L = window.__wt.L;
  let far = 0;
  for (let z = 0; z < L.d; z++) for (let y = 1; y < L.h - 1; y++)
    if (L.lvl[z * L.plane + y * L.w + (L.w - 6)]) far++;
  return { curN: L.curN, far, tickMs: +window.__wt.stat.tickMs.toFixed(3) };
});
console.log("pressure OFF after 5s: " + JSON.stringify(off));
ok("without pressure the river settles", off.curN === 0, off.curN + " active");
ok("the cost of settled water is nothing", off.tickMs < 0.1, off.tickMs + "ms");
console.log("  ->   pressure costs " + on.pressMs + "ms/tick to keep " +
            on.pressMoved + " units moving through " + on.pressCells + " cells");

// --- the case that costs: one big connected body -------------------------
// A still sea costs nothing, because nothing in it is active and pressure is
// gated on the active set. Disturb it and the gate stops helping: pressure
// has to flood the whole body to find out what it can push.
const sea = await p.evaluate(() => {
  const w = window.__wt, W = w.W, n = W.n;
  let deepest = -1, bi = -1;
  for (let i = 0; i < W.biome.length; i++)
    if (W.biome[i] === 0 && (deepest < 0 || W.elev[i] < deepest)) { deepest = W.elev[i]; bi = i; }
  if (bi < 0) return { none: true };
  w.setPressure(true);
  w.buildLocal(bi);
  const L = w.L;
  let wet = 0;
  for (let k = 0; k < L.cells; k++) if (L.lvl[k]) wet++;
  return { wet, active: L.curN };
});
if (!sea.none) {
  // Breach it from the side, the way a fort does: open a solid cell that the
  // sea is already touching, below its surface. The cells at the breach are
  // full and active, so pressure has a real body to flood.
  let hot = { cells: 0, pressMs: 0, tickMs: 0, curN: 0 };
  for (let k = 0; k < 24; k++) {
    const sample = await p.evaluate(() => {
      const L = window.__wt.L;
      let cut = 0;
      for (let t = 0; t < 400 && cut < 4; t++) {
        const x = 3 + ((Math.random() * (L.w - 6)) | 0), y = 3 + ((Math.random() * (L.h - 6)) | 0);
        const z = 1 + ((Math.random() * (L.d - 4)) | 0);
        const i = z * L.plane + y * L.w + x;
        if (!L.mat[i]) continue;
        const ns = [i - 1, i + 1, i - L.w, i + L.w, i + L.plane];
        let touchesWater = false;
        for (const j of ns) if (j >= 0 && j < L.cells && !L.mat[j] && L.lvl[j] === 7) touchesWater = true;
        if (!touchesWater) continue;
        window.__wt.digAt(x, y, z);
        cut++;
      }
      return { cells: L.pressCells, pressMs: +window.__wt.stat.pressMs.toFixed(3),
               tickMs: +window.__wt.stat.tickMs.toFixed(3), curN: L.curN };
    });
    if (sample.cells > hot.cells) hot = sample;
    await p.waitForTimeout(70);
  }
  await p.waitForTimeout(16000);
  const cold = await p.evaluate(() => ({ cells: window.__wt.L.pressCells,
      pressMs: +window.__wt.stat.pressMs.toFixed(3), curN: window.__wt.L.curN }));
  console.log("\nan ocean embark: " + sea.wet + " wet cells, " + sea.active + " active at t=0");
  console.log("  worst tick while disturbed: " + hot.cells + " cells flooded, pressure " +
              hot.pressMs + "ms/tick, flow " + hot.tickMs + "ms, " + hot.curN + " active");
  console.log("  once it is still again:     " + cold.cells + " cells flooded, pressure " +
              cold.pressMs + "ms/tick, " + cold.curN + " active");
  ok("a disturbed body costs the whole body", hot.cells > 1000, hot.cells + " cells flooded to move a handful of units");
  ok("it settles again rather than ringing for ever", cold.curN === 0 && cold.cells === 0,
     cold.curN + " active, " + cold.cells + " flooded");
}

// --- conservation, on a tile with no source and no sink ------------------
const cons = await p.evaluate(async () => {
  const w = window.__wt, W = w.W, n = W.n;
  for (let i = 0; i < W.biome.length; i++) {
    if (W.biome[i] === 0 || W.flow[i] >= 6) continue;
    if (W.drain[i] > 0.6 && W.rain[i] < 0.4 && W.elev[i] < W.sea + 0.10) {   // low, dry: sea-filled, no aquifer
      w.buildLocal(i);
      const L = w.L;
      if (L.springs.length || L.hasAq) continue;
      let before = 0;
      for (let k = 0; k < L.cells; k++) before += L.lvl[k];
      if (before < 100) continue;
      w.setPressure(true);
      return { before, wi: i };
    }
  }
  return { none: true };
});
if (cons.none) console.log("\n  --   conservation test skipped: no still-water tile found");
else {
  await p.waitForTimeout(4000);
  const after = await p.evaluate(() => {
    const L = window.__wt.L;
    let n = 0;
    for (let k = 0; k < L.cells; k++) n += L.lvl[k];
    return { total: n, leak: L.leak };
  });
  console.log("\nconservation with pressure: " + cons.before + " in, " + after.total + " out");
  ok("pressure conserves water", after.total === cons.before);
  ok("the drain check stayed quiet", after.leak === 0, after.leak ? after.leak + " units" : "");
}

await p.screenshot({ path: shot("wt-pressure.png") });
ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));
await b.close();
process.exit(finish());
