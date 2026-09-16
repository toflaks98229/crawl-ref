/* Shared rig for the watertable suites.
 *
 *   npm i playwright        (once, anywhere on the path)
 *   node test/run.mjs       all of them
 *   node test/river.mjs     one of them
 *
 * Every suite drives the real page through real input. The one thing it
 * needs that a player does not is a way to read the simulation back, so the
 * probe below is the shipped file with a window.__wt accessor appended --
 * built on demand, never committed, and never part of what is published.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const WEB = dirname(HERE);
export const TMP = join(HERE, ".tmp");

const HOOK = `
  window.__wt = { get L(){return L;}, get W(){return W;}, get gen(){return gen;},
    get map(){return map;}, get mode(){return mode;}, get stat(){return stat;},
    get cur(){return cur;}, get lcur(){return lcur;}, get usingWorker(){return usingWorker;},
    get pressure(){return pressure;}, setPressure: function(v){ pressure = v; },
    aim: function (wx, wy) { cur.x = Math.floor(wx / map.stride); cur.y = Math.floor(wy / map.stride); },
    at: cursorWorldIndex, shown: function () { return map.b[cur.y * map.rw + cur.x]; },
    embark: embark, digAt: digAt, pourAt: pourAt, verify: verify, MAT: MAT,
    regen: generateWorld, buildLocal: buildLocal, fullScanTick: fullScanTick, glyphs: GLYPHS };
`;

export function buildProbe() {
  mkdirSync(TMP, { recursive: true });
  const src = readFileSync(join(WEB, "watertable.html"), "utf8");
  const marker = "\n})();\n</script>";
  if (!src.includes(marker)) throw new Error("watertable.html: no place to attach the probe");
  const out = join(TMP, "probe.html");
  writeFileSync(out, src.replace(marker, HOOK + "})();\n</script>", 1));
  return "file://" + out;
}

// --ignore-certificate-errors is for the harness only: behind a proxy whose CA
// the browser does not trust, the webfont never loads and the glyph test would
// measure a fallback face instead of the one the page asks for.
export function launch() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--ignore-certificate-errors"]
  });
}

export const shot = (name) => join(TMP, name);

export function reporter() {
  let bad = 0;
  return {
    ok(label, cond, extra = "") {
      if (!cond) bad++;
      console.log((cond ? "  ok   " : "  FAIL ") + label + (extra ? "  " + extra : ""));
    },
    finish() {
      console.log("\n" + (bad === 0 ? "ALL CHECKS PASSED" : bad + " CHECK(S) FAILED"));
      return bad;
    }
  };
}

export async function ready(p, url) {
  await p.goto(url);
  await p.waitForFunction(() => window.__wt && window.__wt.W && !window.__wt.gen.busy,
                          null, { timeout: 30000 });
}
