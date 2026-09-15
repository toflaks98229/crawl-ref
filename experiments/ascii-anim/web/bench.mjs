/*
 * Canvas glyph throughput. Compares repaint strategies for a terminal-style
 * cell grid; results and what they imply are written up in BENCH.md.
 *
 *   npm i playwright && npx playwright install chromium
 *   node bench.mjs
 *
 * Set CHROMIUM to reuse a browser you already have, e.g.
 *   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node bench.mjs
 *
 * Headless Chromium usually rasterises in software, so these numbers are a
 * conservative floor rather than what real hardware will do.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page_url = "file://" + join(here, "bench.html");

const launch = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const browser = await chromium.launch(launch);
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));

await page.goto(page_url);
await page.waitForFunction(() => window.RESULTS, null, { timeout: 120000 });
const rows = await page.evaluate(() => window.RESULTS);

console.log("ms per frame (lower is better), 60fps budget = 16.7ms\n");
const head = ["scene", "cells", "moving", "full", "runs", "dirty"];
const table = [head, ...rows.map((x) => [x.label, x.cells, x.moving, x.full, x.runs, x.dirty])];
const width = head.map((_, i) => Math.max(...table.map((r) => String(r[i]).length)));
for (const r of table)
  console.log(r.map((c, i) => String(c).padEnd(width[i])).join("  "));

await browser.close();
