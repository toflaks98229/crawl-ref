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

// survey a spread of land tiles
const survey = await p.evaluate(() => {
  const w = window.__wt, W = w.W, n = W.n, out = [];
  const seen = new Set();
  for (let i = 0; i < W.biome.length && out.length < 8; i += 977) {
    if (W.biome[i] === 0 || W.elev[i] < W.sea + 0.04) continue;
    if (seen.has(W.biome[i]) && out.length > 4) continue;
    seen.add(W.biome[i]);
    w.buildLocal(i);
    const L = w.L;
    const count = {};
    for (let k = 0; k < L.cells; k++) count[L.mat[k]] = (count[L.mat[k]] || 0) + 1;
    out.push({ biome: W.biome[i], volc: +W.volc[i].toFixed(2), rain: +W.rain[i].toFixed(2),
               sed: count[2] || 0, ign: count[4] || 0, aq: count[3] || 0,
               ore: count[5] || 0, gem: count[6] || 0,
               cav: (() => { let n2 = 0; for (let k = 0; k < L.plane; k++)
                       if (!L.mat[L.cavTop * L.plane + k]) n2++; return n2; })(),
               cavTop: L.cavTop,
               wet: (() => { let n2 = 0; for (let k = 0; k < L.cells; k++) if (L.lvl[k]) n2++; return n2; })() });
  }
  return out;
});
console.log("\nbiome volc rain | sediment igneous aquifer |  ore  gem | cavern cells  wet");
for (const r of survey)
  console.log(String(r.biome).padStart(5) + String(r.volc).padStart(5) + String(r.rain).padStart(5) +
    " |" + String(r.sed).padStart(9) + String(r.ign).padStart(8) + String(r.aq).padStart(8) +
    " |" + String(r.ore).padStart(5) + String(r.gem).padStart(5) +
    " |" + String(r.cav).padStart(9) + String(r.wet).padStart(9));

ok("every tile has both stone layers", survey.every(r => r.sed > 0 && r.ign > 0));
ok("every tile has ore", survey.every(r => r.ore > 0));
ok("gems appear", survey.some(r => r.gem > 0), survey.filter(r => r.gem > 0).length + "/" + survey.length + " tiles");
ok("caverns appear", survey.some(r => r.cav > 0), survey.filter(r => r.cav > 0).length + "/" + survey.length + " tiles");
ok("volcanism moves the igneous up", (() => {
  const hi = survey.filter(r => r.volc > 0.5), lo = survey.filter(r => r.volc <= 0.5);
  if (!hi.length || !lo.length) return true;
  const f = a => a.reduce((s, r) => s + r.ign / (r.ign + r.sed), 0) / a.length;
  return f(hi) > f(lo);
})());

// dig into a cavern and check it reads
const dig = await p.evaluate(() => {
  const w = window.__wt, W = w.W;
  for (let i = 0; i < W.biome.length; i += 373) {
    if (W.biome[i] === 0) continue;
    w.buildLocal(i);
    const L = w.L;
    let cav = 0;
    for (let k = 0; k < L.plane; k++) if (!L.mat[L.cavTop * L.plane + k]) cav++;
    if (!cav) continue;
    for (let y = 3; y < L.h - 3; y++) for (let x = 3; x < L.w - 3; x++) {
      const p2 = y * L.w + x;
      if (L.mat[L.cavTop * L.plane + p2]) continue;      // want open cavern
      for (let z = L.surface[p2]; z > L.cavTop; z--) window.__wt.digAt(x, y, z);
      L.vz = L.cavTop; window.__wt.lcur.x = x; window.__wt.lcur.y = y;
      return { x, y, cavTop: L.cavTop, dug: L.dug, sank: L.surface[p2] - L.cavTop };
    }
  }
  return { none: true };
});
console.log("\nshaft to the cavern: " + JSON.stringify(dig));
ok("a shaft can be sunk to the cavern", !dig.none && dig.dug > 0, dig.none ? "" : dig.sank + " levels");
await p.waitForTimeout(2500);
const after = await p.evaluate(() => ({ leak: window.__wt.L.leak, curN: window.__wt.L.curN,
  tick: +window.__wt.stat.tickMs.toFixed(3), press: +window.__wt.stat.pressMs.toFixed(3) }));
ok("the sim stays healthy after breaking in", after.leak === 0 && after.tick < 8,
   "leak " + after.leak + ", tick " + after.tick + "ms, pressure " + after.press + "ms");
await p.screenshot({ path: shot("wt-cavern.png") });
ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));
await b.close();
process.exit(finish());
