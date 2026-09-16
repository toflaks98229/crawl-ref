import { launch, buildProbe, reporter, shot } from "./harness.mjs";

const PROBE = buildProbe();
const { ok, finish } = reporter();
const b = await launch();

for (const mode of ["worker available", "Worker throws", "Worker silently dead"]) {
  const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  if (mode === "Worker throws")
    await p.addInitScript(() => { window.Worker = function () { throw new Error("blocked by policy"); }; });
  if (mode === "Worker silently dead")
    await p.addInitScript(() => { window.Worker = function () { this.postMessage = function () {}; this.terminate = function () {}; }; });
  const t0 = Date.now();
  await p.goto(PROBE);
  await p.waitForFunction(() => window.__wt && window.__wt.W && !window.__wt.gen.busy, null, { timeout: 30000 })
        .catch(() => {});
  const r = await p.evaluate(() => ({
    have: !!window.__wt.W, worker: window.__wt.usingWorker,
    tries: window.__wt.gen.tries, accepted: window.__wt.gen.accepted,
    said: document.getElementById("say").textContent }));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n" + mode + ": " + JSON.stringify(r) + "  (" + secs + "s)");
  ok("a world was generated", r.have && r.accepted);
  ok("it used the right path", mode === "worker available" ? r.worker : !r.worker);
  // and it is playable: embark and dig
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  // Drop until the cursor is actually over something solid -- with real
  // relief the level you embark on may be open sky at that particular cell,
  // and digging air is correctly a no-op.
  for (let k = 0; k < 8; k++) {
    const solid = await p.evaluate(() => {
      const L = window.__wt.L;
      return !!L.mat[L.vz * L.plane + window.__wt.lcur.y * L.w + window.__wt.lcur.x];
    });
    if (solid) break;
    await p.keyboard.press(",");
    await p.waitForTimeout(120);
  }
  await p.keyboard.press("d");
  await p.waitForTimeout(800);
  const play = await p.evaluate(() => ({ mode: window.__wt.mode, dug: window.__wt.L.dug,
                                         tick: +window.__wt.stat.tickMs.toFixed(3) }));
  ok("it is playable", play.mode === "local" && play.dug > 0, JSON.stringify(play));
  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await p.close();
}
await b.close();
process.exit(finish());
