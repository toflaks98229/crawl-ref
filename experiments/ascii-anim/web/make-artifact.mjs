/* Package watertable.html for a host that wraps the page in its own
 * <!doctype html><head><body> skeleton.
 *
 *   node make-artifact.mjs [outfile]
 *
 * The file in this directory stays canonical and stays openable from disk.
 * Two things change on the way out:
 *
 *   - the document wrapper comes off, because the host supplies one;
 *   - the grid measures the element it lives in rather than the window,
 *     because that skeleton pads the root by the phone's safe-area insets
 *     and a canvas sized to the window would hang off the bottom.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(HERE, "watertable.artifact.html");
let s = readFileSync(join(HERE, "watertable.html"), "utf8");

const strip = [
  /^<!doctype html>\n/i, /^<html[^>]*>\n/i, /^<head>\n/i,
  /^<\/head>\n/im, /^<body>\n/im, /^<\/body>\n/im, /^<\/html>\n?/im,
  /^<meta charset[^>]*>\n/i        // the skeleton supplies charset and viewport
];
for (const re of strip) s = s.replace(re, "");

// The canvas fills its own box, not the viewport.
s = s.replace("    var w = window.innerWidth, h = window.innerHeight;",
              "    var w = document.body.clientWidth || window.innerWidth;\n" +
              "    var h = document.body.clientHeight || window.innerHeight;");

// Form controls and scrollbars should match the console, not the host.
s = s.replace(":root { --ground: #06060d; }",
              ":root { --ground: #06060d; color-scheme: dark; }");

if (/<\/?(html|head|body)\b/i.test(s)) throw new Error("wrapper tags left behind");
writeFileSync(out, s);
console.log("wrote " + out + "  (" + s.length + " bytes, title: " +
            (s.match(/<title>(.*?)<\/title>/i) || [, "none"])[1] + ")");
