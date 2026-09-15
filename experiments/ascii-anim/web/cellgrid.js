/*
 * cellgrid.js -- one glyph, one cell.
 *
 * Console text styling with the East Asian Width problem removed: cells keep
 * the VGA text-mode 1:2 aspect, but 한글 / 漢字 / かな / emoji / box-drawing
 * are compressed to a single cell instead of claiming two columns.
 *
 * Usage:
 *   CellGrid.useFont(someSpanInsideACell);   // after document.fonts.ready
 *   CellGrid.paint(span, "한");              // sets text + the x-axis squeeze
 *
 * Pair with CSS that gives the cell the console aspect and the glyph span a
 * centred transform-origin -- see cellgrid.css.
 */
var CellGrid = (function () {
  "use strict";

  var ctx = document.createElement("canvas").getContext("2d");
  var cache = new Map();
  var unit = 0;      // the half-width advance every cell is one of
  var ready = false;

  /* Adopt the computed font of a real glyph span, so measurements match what
     the browser will actually paint. Call again once webfonts have loaded:
     advances taken against a fallback face are wrong. */
  function useFont(sample) {
    var cs = getComputedStyle(sample);
    var font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize
             + "/" + cs.lineHeight + " " + cs.fontFamily;
    ctx.font = font;
    // Canvas rejects a malformed shorthand silently, leaving the old font.
    if (ctx.font.indexOf(cs.fontSize) === -1)
      ctx.font = cs.fontSize + " " + cs.fontFamily;
    unit = ctx.measureText("M").width || 1;
    cache.clear();
    ready = true;
    return font;
  }

  /* How much to squeeze this character on the x axis to fit one cell.
     1 for anything already half-width. */
  function scaleFor(ch) {
    if (!ready || !ch || ch === " ") return 1;
    var hit = cache.get(ch);
    if (hit !== undefined) return hit;
    var w = ctx.measureText(ch).width;
    var s = (w > unit * 1.02) ? unit / w : 1;
    cache.set(ch, s);
    return s;
  }

  function paint(span, ch) {
    if (span.textContent !== ch) span.textContent = ch;
    var s = scaleFor(ch);
    var t = s === 1 ? "" : "scaleX(" + s.toFixed(4) + ")";
    if (span.style.transform !== t) span.style.transform = t;
  }

  /* Lay a whole string into a row of cells, one character per cell.
     Splits by code point, so astral characters stay intact. */
  function paintRow(spans, str) {
    var chars = Array.from(str);
    for (var i = 0; i < spans.length; i++)
      paint(spans[i], chars[i] === undefined ? " " : chars[i]);
    return chars.length;
  }

  return {
    useFont: useFont,
    scaleFor: scaleFor,
    paint: paint,
    paintRow: paintRow,
    get unit() { return unit; }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CellGrid;
