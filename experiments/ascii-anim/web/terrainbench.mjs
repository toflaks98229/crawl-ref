/* Terrain generation cost, plain JS vs the same kernels compiled to wasm.
 *
 *   clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry -Wl,--export-all \
 *         -o terrainkernels.wasm terrainkernels.c
 *   node terrainbench.mjs
 *
 * The JS kernels below are line-for-line mirrors of terrainkernels.c and use
 * the same xorshift32, so each pair is checksum-compared before its times are
 * reported. A row whose checksums disagree is not a measurement.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = 65536;

/* The .wasm is a build artifact and is not checked in — build it on demand. */
const WASM = join(HERE, "terrainkernels.wasm");
if (!existsSync(WASM)) {
  try {
    execFileSync("clang", ["--target=wasm32", "-O3", "-nostdlib", "-Wl,--no-entry",
                           "-Wl,--export-all", "-o", WASM, join(HERE, "terrainkernels.c")],
                 { stdio: "inherit" });
  } catch (e) {
    console.error("need clang to build terrainkernels.wasm:\n  " + e.message);
    process.exit(1);
  }
}

/* ---------------------------------------------------------------- rng --- */
let rng = 1;
function xs32() {
  let x = rng;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return (rng = x >>> 0);
}
function frand() { return (xs32() >>> 8) * (1 / 16777216); }

/* ------------------------------------------------------------ kernels --- */
function diamondSquareJS(h, n, seed, rough) {
  rng = seed >>> 0 || 1;
  const size = n - 1;
  h[0] = frand();
  h[size] = frand();
  h[size * n] = frand();
  h[size * n + size] = frand();

  let scale = 1;
  for (let step = size; step > 1; step >>= 1) {
    const half = step >> 1;

    for (let y = 0; y < size; y += step)
      for (let x = 0; x < size; x += step) {
        const a = h[y * n + x], b = h[y * n + x + step];
        const c = h[(y + step) * n + x], d = h[(y + step) * n + x + step];
        h[(y + half) * n + (x + half)] =
          (a + b + c + d) * 0.25 + (frand() - 0.5) * scale;
      }

    for (let y = 0; y <= size; y += half) {
      const x0 = ((y / half) & 1) ? 0 : half;
      for (let x = x0; x <= size; x += step) {
        let sum = 0, cnt = 0;
        if (x >= half)        { sum += h[y * n + x - half];   cnt++; }
        if (x + half <= size) { sum += h[y * n + x + half];   cnt++; }
        if (y >= half)        { sum += h[(y - half) * n + x]; cnt++; }
        if (y + half <= size) { sum += h[(y + half) * n + x]; cnt++; }
        h[y * n + x] = sum / cnt + (frand() - 0.5) * scale;
      }
    }
    scale *= rough;
  }
}

function carveRiversJS(h, n, sources, maxSteps, seed, dig) {
  rng = seed >>> 0 || 1;
  let steps = 0;
  for (let s = 0; s < sources; s++) {
    let x = 1 + (xs32() % (n - 2));
    let y = 1 + (xs32() % (n - 2));
    for (let k = 0; k < maxSteps; k++) {
      steps++;
      const i = y * n + x;
      let best = h[i], bx = -1, by = -1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= n - 1 || ny >= n - 1) continue;
          const v = h[ny * n + nx];
          if (v < best) { best = v; bx = nx; by = ny; }
        }
      if (bx < 0) { h[i] -= dig; continue; }
      h[i] -= dig * 0.25;
      x = bx; y = by;
      if (h[y * n + x] < 0) break;
    }
  }
  return steps;
}

function fluidTickJS(lvl, solid, w, h, d) {
  let moved = 0;
  const plane = w * h;
  for (let z = 0; z < d; z++) {
    const base = z * plane, below = (z - 1) * plane;
    for (let y = 1; y < h - 1; y++) {
      const row = base + y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        let v = lvl[i];
        if (!v || solid[i]) continue;

        if (z > 0) {
          const b = below + y * w + x;
          if (!solid[b] && lvl[b] < 7) {
            const room = 7 - lvl[b];
            const mv = v < room ? v : room;
            lvl[b] += mv;
            v -= mv;
            lvl[i] = v;
            moved += mv;
            if (!v) continue;
          }
        }

        const ns = [i - 1, i + 1, i - w, i + w];
        for (let k = 0; k < 4 && v > 1; k++) {
          const j = ns[k];
          if (solid[j]) continue;
          const u = lvl[j];
          if (u + 1 < v) { lvl[j] = u + 1; lvl[i] = --v; moved++; }
        }
      }
    }
  }
  return moved;
}

const fr = Math.fround;
function sumF32(a, n) { let s = 0; for (let i = 0; i < n; i++) s = fr(s + a[i]); return s; }
function sumU8(a, n)  { let s = 0; for (let i = 0; i < n; i++) s += a[i] * (i % 7 + 1); return s | 0; }

/* -------------------------------------------------------------- wasm ---- */
const bytes = readFileSync(WASM);
const t0 = performance.now();
const mod = new WebAssembly.Module(bytes);
const inst = new WebAssembly.Instance(mod, {});
const instantiateMs = performance.now() - t0;
const W = inst.exports;
const mem = W.memory;
const HEAP = (W.__heap_base ? W.__heap_base.value : 1024) + 15 & ~15;

function grow(bytesNeeded) {
  const want = Math.ceil((HEAP + bytesNeeded) / PAGE);
  const have = mem.buffer.byteLength / PAGE;
  if (want > have) mem.grow(want - have);
}
const f32 = (off, n) => new Float32Array(mem.buffer, off, n);
const u8  = (off, n) => new Uint8Array(mem.buffer, off, n);

/* ------------------------------------------------------------- timing --- */
function time(fn, runs) {
  const t = [];
  for (let i = 0; i < runs; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); }
  t.sort((a, b) => a - b);
  return { med: t[t.length >> 1], best: t[0] };
}
const ms = (v) => v.toFixed(v < 10 ? 2 : 1);
const rows = [];
function row(kernel, scale, js, wa, ok, note) {
  rows.push({ kernel, scale, js, wa, ok, note });
}

/* --------------------------------------------------------------- run ---- */
console.log(`node ${process.version}   wasm instantiate ${instantiateMs.toFixed(2)}ms   ` +
            `module ${bytes.length}B\n`);

/* 1. midpoint displacement */
for (const k of [8, 9, 10, 11]) {
  const n = (1 << k) + 1, cells = n * n, runs = n > 1025 ? 3 : 7;
  grow(cells * 4);
  const jsBuf = new Float32Array(cells);
  const waBuf = f32(HEAP, cells);
  const js = time(() => diamondSquareJS(jsBuf, n, 12345, 0.55), runs);
  const wa = time(() => W.diamond_square(HEAP, n, 12345, 0.55), runs);
  const a = sumF32(jsBuf, cells), b = W.checksum_f32(HEAP, cells);
  const rel = Math.abs(a - b) / Math.max(1, Math.abs(a));
  row("diamond-square", `${n}² = ${(cells / 1e3).toFixed(0)}k`, js, wa,
      rel < 1e-3, `Δ ${(rel * 100).toExponential(1)}%`);
}

/* 2. river carving, on a freshly generated heightfield each run */
for (const [n, src] of [[513, 200], [1025, 800]]) {
  const cells = n * n;
  grow(cells * 4);
  const jsBuf = new Float32Array(cells);
  const waBuf = f32(HEAP, cells);
  const js = time(() => {
    diamondSquareJS(jsBuf, n, 777, 0.55);
    carveRiversJS(jsBuf, n, src, 4000, 999, 0.02);
  }, 5);
  const wa = time(() => {
    W.diamond_square(HEAP, n, 777, 0.55);
    W.carve_rivers(HEAP, n, src, 4000, 999, 0.02);
  }, 5);
  const a = sumF32(jsBuf, cells), b = W.checksum_f32(HEAP, cells);
  const rel = Math.abs(a - b) / Math.max(1, Math.abs(a));
  row("gen + carve", `${n}², ${src} rivers`, js, wa, rel < 1e-3,
      `Δ ${(rel * 100).toExponential(1)}%`);
}

/* 3. fluid ticks */
function seedFluid(lvl, solid, w, h, d, fill) {
  lvl.fill(0); solid.fill(0);
  let r = 4242;
  const nx = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return (r >>>= 0); };
  const plane = w * h;
  for (let i = 0; i < plane * d; i++) if ((nx() % 100) < 12) solid[i] = 1;
  const top = (d - 1) * plane;
  for (let i = 0; i < plane; i++) if ((nx() % 100) < fill) { solid[top + i] = 0; lvl[top + i] = 7; }
}
for (const [w, h, d, fill] of [[128, 128, 3, 40], [256, 256, 4, 40], [256, 256, 4, 90]]) {
  const cells = w * h * d;
  grow(cells * 2);
  const jsL = new Uint8Array(cells), jsS = new Uint8Array(cells);
  const waL = u8(HEAP, cells), waS = u8(HEAP + cells, cells);
  const TICKS = 20;
  const js = time(() => {
    seedFluid(jsL, jsS, w, h, d, fill);
    for (let t = 0; t < TICKS; t++) fluidTickJS(jsL, jsS, w, h, d);
  }, 7);
  const wa = time(() => {
    seedFluid(waL, waS, w, h, d, fill);
    for (let t = 0; t < TICKS; t++) W.fluid_tick(HEAP, HEAP + cells, w, h, d);
  }, 7);
  const same = sumU8(jsL, cells) === W.checksum_u8(HEAP, cells);
  row("fluid tick", `${w}×${h}×${d} = ${(cells / 1e3).toFixed(0)}k, ${fill}% wet`,
      { med: js.med / TICKS, best: js.best / TICKS },
      { med: wa.med / TICKS, best: wa.best / TICKS },
      same, `${cells / 1e3 | 0}k cells/tick`);
}

/* -------------------------------------------------------------- table --- */
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("kernel", 15) + pad("scale", 26) + pad("JS ms", 10) +
            pad("wasm ms", 10) + pad("wasm/JS", 9) + "check");
console.log("-".repeat(85));
for (const r of rows) {
  console.log(
    pad(r.kernel, 15) + pad(r.scale, 26) +
    pad(ms(r.med ?? r.js.med), 10) + pad(ms(r.wa.med), 10) +
    pad((r.wa.med / r.js.med).toFixed(2) + "×", 9) +
    (r.ok ? "ok" : "MISMATCH") + "  " + r.note);
}
console.log("\nms are medians; wasm/JS below 1.00 means wasm is faster.");

/* ------------------------------------------------- the active-set test ---
 * DF ticks the whole map, and its own wiki names water as the single
 * largest FPS drain. The question that decides the language is whether that
 * is a language problem or an algorithm problem: a full scan touches every
 * cell whether or not anything is moving, while an active set touches only
 * cells that moved last tick plus what they disturbed.
 *
 * Same rules as fluid_tick, same seeding, so the two are comparable tick for
 * tick. Marking policy on a move: source, destination, the cell above each
 * (fluid can now fall in) and the destination's four lateral neighbours.
 */
function fluidTickActiveJS(lvl, solid, w, h, d, cur, curN, mark, nxt, nmark) {
  const plane = w * h;
  const total = plane * d;
  let n = 0, moved = 0;

  const push = (i) => { if (i >= 0 && i < total && !nmark[i]) { nmark[i] = 1; nxt[n++] = i; } };
  /* Both ends need their laterals marked, not just the destination: the
   * source just lost fluid, so a neighbour that was level with it may now
   * want to spill in. Marking only the destination leaves ~600 units still
   * movable on a 262k grid, which the stability check below catches. */
  const touch = (i, j) => {
    push(i); push(j); push(i + plane); push(j + plane);
    push(i - 1); push(i + 1); push(i - w); push(i + w);
    push(j - 1); push(j + 1); push(j - w); push(j + w);
  };

  for (let a = 0; a < curN; a++) {
    const i = cur[a];
    const z = (i / plane) | 0;
    const off = i - z * plane;
    const y = (off / w) | 0, x = off - y * w;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;

    let v = lvl[i];
    if (!v || solid[i]) continue;

    if (z > 0) {
      const b = i - plane;
      if (!solid[b] && lvl[b] < 7) {
        const room = 7 - lvl[b];
        const mv = v < room ? v : room;
        lvl[b] += mv; v -= mv; lvl[i] = v; moved += mv;
        touch(i, b);
        if (!v) continue;
      }
    }

    const ns = [i - 1, i + 1, i - w, i + w];
    for (let k = 0; k < 4 && v > 1; k++) {
      const j = ns[k];
      if (solid[j]) continue;
      const u = lvl[j];
      if (u + 1 < v) { lvl[j] = u + 1; lvl[i] = --v; moved++; touch(i, j); }
    }
  }
  for (let a = 0; a < curN; a++) mark[cur[a]] = 0;
  return { n, moved };
}

console.log("\nactive set vs full scan — 256×256×4 (262k cells), 40% wet\n");
{
  const w = 256, h = 256, d = 4, plane = w * h, cells = plane * d, TICKS = 400;
  const lvl = new Uint8Array(cells), solid = new Uint8Array(cells);
  seedFluid(lvl, solid, w, h, d, 40);

  let cur = new Int32Array(cells), nxt = new Int32Array(cells);
  let mark = new Uint8Array(cells), nmark = new Uint8Array(cells);
  let curN = 0;
  for (let i = 0; i < cells; i++) if (lvl[i]) { mark[i] = 1; cur[curN++] = i; }

  const samples = [];
  let totalMs = 0;
  for (let t = 1; t <= TICKS; t++) {
    const s = performance.now();
    const r = fluidTickActiveJS(lvl, solid, w, h, d, cur, curN, mark, nxt, nmark);
    const el = performance.now() - s;
    totalMs += el;
    if (t <= 3 || t === 10 || t === 25 || t === 50 || t === 100 || t === 200 || t === TICKS)
      samples.push({ t, active: curN, ms: el, moved: r.moved });
    [cur, nxt] = [nxt, cur];
    [mark, nmark] = [nmark, mark];
    curN = r.n;
    if (!curN) { samples.push({ t, active: 0, ms: el, moved: 0, done: true }); break; }
  }

  console.log(pad("tick", 8) + pad("active cells", 15) + pad("ms", 9) + "units moved");
  console.log("-".repeat(45));
  for (const s of samples)
    console.log(pad(s.t, 8) + pad(s.active.toLocaleString(), 15) + pad(ms(s.ms), 9) +
                (s.done ? "settled" : s.moved.toLocaleString()));

  /* Two correctness checks, without which the speed number means nothing:
   * water must be conserved, and "settled" must mean settled under the
   * reference full scan, not merely that the queue ran dry. */
  let mass = 0;
  for (let i = 0; i < cells; i++) mass += lvl[i];
  const ref = new Uint8Array(cells), refS = new Uint8Array(cells);
  seedFluid(ref, refS, w, h, d, 40);
  let mass0 = 0;
  for (let i = 0; i < cells; i++) mass0 += ref[i];
  const stillMoves = fluidTickJS(lvl, solid, w, h, d);
  console.log(`\nconservation: ${mass0.toLocaleString()} units in, ` +
              `${mass.toLocaleString()} out — ${mass === mass0 ? "ok" : "LOST"}`);
  console.log(`stability: a full scan over the settled grid moves ` +
              `${stillMoves} more units — ${stillMoves === 0 ? "ok" : "NOT SETTLED"}`);

  const fullJS = rows.find(r => r.kernel === "fluid tick" && r.scale.startsWith("256")).js.med;
  const fullWA = rows.find(r => r.kernel === "fluid tick" && r.scale.startsWith("256")).wa.med;
  console.log(`\nfull scan: ${ms(fullJS)}ms/tick in JS, ${ms(fullWA)}ms/tick in wasm ` +
              `— every tick, forever.`);
  console.log(`active set: ${ms(totalMs)}ms for all ${TICKS} ticks in JS ` +
              `(${ms(totalMs / TICKS)}ms average).`);
}

/* --------------------------------------------------- a running river ----
 * The flood above is the worst case and settles. The case that decides
 * whether a map can have rivers at all is a source that never stops: what
 * does permanently running water cost per tick once it reaches steady
 * state?
 */
console.log("\na permanent source — 256×256×4, a 3×3 spring refilled every tick\n");
{
  const w = 256, h = 256, d = 4, plane = w * h, cells = plane * d, TICKS = 400;
  const lvl = new Uint8Array(cells), solid = new Uint8Array(cells);
  let r = 99;
  const nx = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return (r >>>= 0); };
  for (let i = 0; i < cells; i++) if ((nx() % 100) < 12) solid[i] = 1;

  const spring = [];
  const top = (d - 1) * plane;
  for (let y = 40; y < 43; y++) for (let x = 40; x < 43; x++) {
    const i = top + y * w + x;
    solid[i] = 0;
    spring.push(i);
  }

  let cur = new Int32Array(cells), nxt = new Int32Array(cells);
  let mark = new Uint8Array(cells), nmark = new Uint8Array(cells);
  let curN = 0;
  let activeSum = 0, msSum = 0, n = 0;

  for (let t = 1; t <= TICKS; t++) {
    for (const i of spring) { lvl[i] = 7; if (!mark[i]) { mark[i] = 1; cur[curN++] = i; } }
    const s = performance.now();
    const res = fluidTickActiveJS(lvl, solid, w, h, d, cur, curN, mark, nxt, nmark);
    const el = performance.now() - s;
    if (t > TICKS - 100) { activeSum += curN; msSum += el; n++; }
    [cur, nxt] = [nxt, cur];
    [mark, nmark] = [nmark, mark];
    curN = res.n;
  }
  const fullJS = rows.find(r => r.kernel === "fluid tick" && r.scale.startsWith("256")).js.med;
  console.log(`steady state over the last 100 ticks: ` +
              `${(activeSum / n).toFixed(0)} active cells, ${ms(msSum / n)}ms/tick`);
  console.log(`the same grid full-scanned: ${ms(fullJS)}ms/tick ` +
              `(${(fullJS / (msSum / n)).toFixed(0)}× the work, for the same water)`);
}
