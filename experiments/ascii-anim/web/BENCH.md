# Canvas glyph throughput

Measured in headless Chromium with **no GPU acceleration**, so these are a
conservative floor — real hardware is faster. `node bench2.mjs`, ms per frame,
60fps budget = 16.7ms.

## Strategy comparison, full-grid repaint

| scene | cells | naive fillText | batched by colour | atlas + drawImage |
|---|---|---|---|---|
| 80×30 | 2,400 | 5.4 | 4.5 | 10.9 |
| 160×60 | 9,600 | 17.0 | 14.5 | 35.0 |
| 240×90 | 21,600 | 35.2 | 31.4 | 73.2 |
| 400×150 | 60,000 | 97.0 | 83.9 | 206.4 |

A pre-rendered glyph atlas blitted with `drawImage` is **2-3x slower** than
plain `fillText` here. That result is specific to software rasterisation —
`drawImage` normally wins on a GPU — so do not take it as a general rule.

## What actually makes it viable

| scene | cells | moving cells | full repaint | run-length batched | dirty cells only |
|---|---|---|---|---|---|
| 160×60 | 9,600 | 1,200 | 15.2 | 8.6 | **2.5** |
| 240×90 | 21,600 | 3,000 | 31.4 | 18.9 | **6.4** |
| 400×150 | 60,000 | 6,000 | 82.8 | 45.6 | **12.4** |
| 600×200 | 120,000 | 9,000 | 181.6 | 89.7 | **18.8** |

Run-to-run variance on a shared machine is real: a repeat run put the
400x150 full repaint at 67.8ms rather than 82.8, and the dirty column at 10.0
rather than 12.4. Read the ratios between the columns, not the absolute
figures.

Two conclusions the architecture follows from:

1. **Repaint only cells whose (glyph, colour) changed.** A battlefield is
   mostly static terrain with a few thousand moving marks, so the dirty set is
   5-10% of the grid. This is a 6-7x win and is what puts a 60,000-cell map
   inside the 60fps budget without a GPU.
2. **Run-length batching** — one `fillText` per run of same-colour cells — is
   the fallback for frames that must repaint everything (a zoom step, a camera
   jump). Roughly 1.8x over per-cell calls.

Zoom therefore must not increase the cell count. Zooming out makes each cell
cover more ground (semantic LOD), keeping both the glyph legible and the frame
cost flat.
