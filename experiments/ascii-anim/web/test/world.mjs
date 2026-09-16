import { launch, buildProbe, reporter, shot } from "./harness.mjs";

const PROBE = buildProbe();
const { ok, finish } = reporter();
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", e => errs.push("pageerror: " + e.message));
await p.goto(PROBE);

await p.waitForFunction(() => window.__wt && window.__wt.W && !window.__wt.gen.busy, null, { timeout: 30000 });

// --- 1. a random world, then a fixed one so the rest is repeatable --------
const r1 = await p.evaluate(() => ({ tries: window.__wt.gen.tries, ms: window.__wt.gen.ms,
                                     accepted: window.__wt.gen.accepted }));
console.log("\nrandom world: " + JSON.stringify(r1));
ok("a random world is accepted", r1.accepted);
ok("generation stays under 4s", r1.ms < 4000, r1.ms + "ms over " + r1.tries + " tries");

await p.evaluate(() => window.__wt.regen(777));
await p.waitForFunction(() => !window.__wt.gen.busy, null, { timeout: 30000 });
const g = await p.evaluate(() => {
  const w = window.__wt;
  return { tries: w.gen.tries, ms: w.gen.ms, accepted: w.gen.accepted, fails: w.gen.fails,
           land: w.gen.landFrac, mouths: w.gen.mouths, kinds: w.gen.kinds, stride: w.map.stride,
           loaded: document.fonts.check('16px "IBM Plex Mono"') };
});
console.log("seed 777: " + JSON.stringify(g));
ok("accepted by the rejection pass", g.accepted, g.fails.join(","));
ok("land fraction plausible", g.land > 0.28 && g.land < 0.62, (g.land * 100).toFixed(0) + "%");
ok("rivers reach the sea", g.mouths >= 4, g.mouths + " mouths");
ok("biome variety", g.kinds >= 5, g.kinds + " kinds");
ok("webfont actually loaded", g.loaded);

// --- 2. tofu by pixels, not by advance width ------------------------------
// In a monospace face every glyph has the same advance as the missing-glyph
// box, so measureText proves nothing; compare the rendered ink instead.
const font = await p.evaluate(() => {
  const c = document.createElement("canvas"); c.width = 48; c.height = 48;
  const x = c.getContext("2d", { willReadFrequently: true });
  const fam = getComputedStyle(document.body).fontFamily;
  const ink = ch => {
    x.fillStyle = "#000"; x.fillRect(0, 0, 48, 48);
    x.font = "32px " + fam; x.fillStyle = "#fff";
    x.textBaseline = "middle"; x.textAlign = "center";
    x.fillText(ch, 24, 24);
    const d = x.getImageData(0, 0, 48, 48).data;
    let s = ""; for (let i = 0; i < d.length; i += 4) s += d[i] > 100 ? "1" : "0";
    return s;
  };
  const tofu = ink("￿"), blank = ink(" "), missing = [];
  for (const ch of window.__wt.glyphs) {
    if (ch === " ") continue;
    const s = ink(ch);
    if (s === tofu || s === blank) missing.push("U+" + ch.codePointAt(0).toString(16));
  }
  return { missing };
});
ok("no tofu in the alphabet", font.missing.length === 0, font.missing.join(" "));
await p.screenshot({ path: shot("wt-world.png") });

// --- 3. what you see is what you embark on --------------------------------
const aim = await p.evaluate(() => {
  const w = window.__wt, W = w.W, n = W.n;
  let best = -1, bi = 0;
  for (let i = 0; i < W.flow.length; i++) if (W.flow[i] > best && W.biome[i] !== 0) { best = W.flow[i]; bi = i; }
  w.aim(bi % n, Math.floor(bi / n));
  const at = w.at();
  return { shown: w.shown(), got: W.biome[at], flow: W.flow[at] };
});
console.log("\ncursor: " + JSON.stringify(aim));
ok("the embark tile is the biome the cursor shows", aim.shown === aim.got);
ok("the river tile really carries a river", aim.flow >= 6, "flow " + aim.flow);

await p.keyboard.press("Enter");
await p.waitForTimeout(400);
const L0 = await p.evaluate(() => {
  const L = window.__wt.L;
  return { mode: window.__wt.mode, w: L.w, h: L.h, d: L.d, cells: L.cells,
           springs: L.springs.length, sinks: L.sinks.length, vz: L.vz };
});
console.log("embark: " + JSON.stringify(L0));
ok("switched to the local map", L0.mode === "local");
ok("the river reached the local map", L0.springs > 0 && L0.sinks > 0,
   L0.springs + " springs, " + L0.sinks + " sinks");

// --- 4. the river runs, and keeps running ---------------------------------
// Early: the channel is draining hard and the set is large.
await p.waitForTimeout(700);
const early = await p.evaluate(() => ({ curN: window.__wt.L.curN, moved: window.__wt.L.moved,
                                        tickMs: window.__wt.stat.tickMs }));
console.log("after 0.7s: " + JSON.stringify(early));
ok("the river runs while it is draining", early.curN > 10 && early.moved > 0,
   early.curN + " active, " + early.moved + " units moved");
ok("even under load the tick is cheap", early.tickMs < 8, early.tickMs.toFixed(2) + "ms");

await p.waitForTimeout(3000);
const run = await p.evaluate(() => {
  const L = window.__wt.L;
  let wet = 0, reached = 0;
  for (let i = 0; i < L.cells; i++) if (L.lvl[i]) wet++;
  // did the water get all the way across?
  for (let z = 0; z < L.d; z++) for (let y = 1; y < L.h - 1; y++)
    if (L.lvl[z * L.plane + y * L.w + (L.w - 6)]) reached++;
  return { wet, reached, curN: L.curN, moved: L.moved, ticks: L.ticks, leak: L.leak,
           tickMs: window.__wt.stat.tickMs, paintMs: window.__wt.stat.paintMs };
});
console.log("after 3s: " + JSON.stringify(run));
ok("water is present", run.wet > 100, run.wet + " wet cells");
ok("the water crossed the map", run.reached > 0, run.reached + " wet cells near the far edge");
// Pressure is on by default, so the river keeps running rather than settling.
ok("the river is still running", run.curN > 0 && run.moved > 0,
   run.curN + " active, " + run.moved + " units moved last tick");
ok("the automatic drain check did not fire", run.leak === 0, run.leak ? run.leak + " units missed" : "");
ok("tick inside budget", run.tickMs < 8, run.tickMs.toFixed(2) + "ms");
ok("paint inside budget", run.paintMs < 16.7, run.paintMs.toFixed(2) + "ms");
await p.screenshot({ path: shot("wt-local.png") });

// --- 5. the explicit drain check ------------------------------------------
// Turn pressure off with R and the same river becomes a chain of still
// pools, which is what the two cheap rules alone can do. Then, and only
// then, is settled water free.
await p.keyboard.press("r");
// Wait for the set to drain rather than for a fixed number of seconds: how
// long a channel takes to settle depends on the terrain it is cut into.
await p.waitForFunction(() => window.__wt.L.curN === 0, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);   // let the rolling average decay too
const quiet = await p.evaluate(() => ({ curN: window.__wt.L.curN,
  tickMs: +window.__wt.stat.tickMs.toFixed(3), press: window.__wt.L.pressCells }));
console.log("pressure off, 4s later: " + JSON.stringify(quiet));
ok("without pressure the river settles", quiet.curN === 0, quiet.curN + " active");
ok("settled water costs nothing", quiet.tickMs < 0.1, quiet.tickMs + "ms");
await p.keyboard.press("v");
await p.waitForTimeout(200);
const ver = await p.evaluate(() => window.__wt.L.leak);
ok("the reference scan agrees it has settled", ver === 0, ver + " units still movable");
await p.keyboard.press("r");

// --- 6. an aquifer tile, dug into --------------------------------------
const aq = await p.evaluate(() => {
  const w = window.__wt, W = w.W, n = W.n;
  for (let i = 0; i < W.biome.length; i++) {
    if (W.biome[i] === 0 || W.flow[i] >= 6) continue;
    if (W.drain[i] < 0.40 && W.elev[i] > W.sea + 0.05) {
      w.aim(i % n, Math.floor(i / n));
      w.buildLocal(i);
      const L = w.L;
      return { hasAq: L.hasAq, aqTop: L.aqTop, drain: W.drain[i] };
    }
  }
  return { none: true };
});
console.log("\naquifer tile: " + JSON.stringify(aq));
ok("found a tile with an aquifer", aq.hasAq === true);
const dug = await p.evaluate(() => {
  const L = window.__wt.L;
  for (let y = 3; y < L.h - 3; y++) for (let x = 3; x < L.w - 3; x++) {
    if (L.mat[L.aqTop * L.plane + y * L.w + x] !== 3) continue;
    let wetAbove = false;
    for (let z = L.aqTop + 1; z < L.d; z++) if (L.lvl[z * L.plane + y * L.w + x]) wetAbove = true;
    if (wetAbove) continue;
    const before = L.leaking.length;
    for (let z = L.aqTop + 3; z >= L.aqTop; z--) window.__wt.digAt(x, y, z);
    L.vz = L.aqTop + 1; window.__wt.lcur.x = x; window.__wt.lcur.y = y;
    return { x, y, before, after: L.leaking.length };
  }
  return { none: true };
});
if (dug.none) ok("a dry aquifer face to dig", false);
else {
  ok("digging registered a leaking face", dug.after > dug.before, dug.before + " -> " + dug.after);
  await p.waitForTimeout(3000);
  const flooded = await p.evaluate(d => {
    const L = window.__wt.L;
    let n = 0;
    for (let z = 0; z < L.d; z++) n += L.lvl[z * L.plane + d.y * L.w + d.x];
    return n;
  }, dug);
  ok("the aquifer flooded the shaft", flooded > 0, flooded + " units");
}
await p.screenshot({ path: shot("wt-aquifer.png") });
await p.keyboard.press("f");
await p.waitForTimeout(250);
await p.screenshot({ path: shot("wt-levels.png") });
await p.keyboard.press("Escape");
await p.waitForTimeout(250);
ok("escape returns to the world map", await p.evaluate(() => window.__wt.mode === "world"));

const real = errs.filter(e => !/ERR_CERT|favicon/.test(e));
ok("no console errors", real.length === 0, real.slice(0, 3).join(" | "));
await b.close();
process.exit(finish());
