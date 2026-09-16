/* Terrain kernels, C -> wasm32, for the JS/WASM A-B in terrainbench.mjs.
 *
 * Built with:
 *   clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry -Wl,--export-all \
 *         -o terrainkernels.wasm terrainkernels.c
 *
 * No stdlib, no malloc: every buffer is a byte offset into the exported
 * linear memory, laid out by the caller. The JS mirrors in terrainbench.mjs
 * are line-for-line the same algorithms with the same RNG, so the two sides
 * can be checksum-compared before their times are compared.
 */

/* clang turns even a sixty-four element clearing loop into a call to memset,
 * and -nostdlib means nothing supplies one. Freestanding builds have to bring
 * their own; this is the whole libc this file needs. */
__attribute__((used))
void *memset(void *p, int v, __SIZE_TYPE__ n) {
  unsigned char *b = (unsigned char *)p;
  while (n--) *b++ = (unsigned char)v;
  return p;
}
__attribute__((used))
void *memcpy(void *dst, const void *src, __SIZE_TYPE__ n) {
  unsigned char *d = (unsigned char *)dst;
  const unsigned char *s = (const unsigned char *)src;
  while (n--) *d++ = *s++;
  return dst;
}

static unsigned int rng;

static inline unsigned int xs32(void) {
  unsigned int x = rng;
  x ^= x << 13; x ^= x >> 17; x ^= x << 5;
  return rng = x;
}
/* [0,1) from the top 24 bits, so JS and C agree bit for bit */
static inline float frand(void) {
  return (float)(xs32() >> 8) * (1.0f / 16777216.0f);
}

/* --- 1. Midpoint displacement (diamond-square) ---------------------------
 * Dwarf Fortress seeds map fields on a coarse grid and fills them in
 * fractally; this is that, on a (2^k + 1) square.
 */
void diamond_square(float *h, int n, unsigned int seed, float rough) {
  rng = seed ? seed : 1u;
  int size = n - 1;
  h[0] = frand();
  h[size] = frand();
  h[size * n] = frand();
  h[size * n + size] = frand();

  float scale = 1.0f;
  for (int step = size; step > 1; step >>= 1) {
    int half = step >> 1;

    for (int y = 0; y < size; y += step)
      for (int x = 0; x < size; x += step) {
        float a = h[y * n + x], b = h[y * n + x + step];
        float c = h[(y + step) * n + x], d = h[(y + step) * n + x + step];
        h[(y + half) * n + (x + half)] =
            (a + b + c + d) * 0.25f + (frand() - 0.5f) * scale;
      }

    for (int y = 0; y <= size; y += half) {
      int x0 = ((y / half) & 1) ? 0 : half;
      for (int x = x0; x <= size; x += step) {
        float sum = 0.0f;
        int cnt = 0;
        if (x >= half)      { sum += h[y * n + x - half];        cnt++; }
        if (x + half <= size){ sum += h[y * n + x + half];        cnt++; }
        if (y >= half)      { sum += h[(y - half) * n + x];       cnt++; }
        if (y + half <= size){ sum += h[(y + half) * n + x];      cnt++; }
        h[y * n + x] = sum / (float)cnt + (frand() - 0.5f) * scale;
      }
    }
    scale *= rough;
  }
}

/* --- 2. River carving ----------------------------------------------------
 * The wiki's description of DF's river step: start at high ground, walk to
 * the lowest neighbour, and when no neighbour is lower, dig the current cell
 * down until one is. Returns total steps walked.
 */
int carve_rivers(float *h, int n, int sources, int maxSteps,
                 unsigned int seed, float dig) {
  rng = seed ? seed : 1u;
  int steps = 0;
  for (int s = 0; s < sources; s++) {
    int x = 1 + (int)(xs32() % (unsigned)(n - 2));
    int y = 1 + (int)(xs32() % (unsigned)(n - 2));
    for (int k = 0; k < maxSteps; k++) {
      steps++;
      int i = y * n + x;
      float best = h[i];
      int bx = -1, by = -1;
      for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          int nx = x + dx, ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= n - 1 || ny >= n - 1) continue;
          float v = h[ny * n + nx];
          if (v < best) { best = v; bx = nx; by = ny; }
        }
      if (bx < 0) { h[i] -= dig; continue; }   /* stuck: dig */
      h[i] -= dig * 0.25f;                      /* widen as it runs */
      x = bx; y = by;
      if (h[y * n + x] < 0.0f) break;           /* reached the sea */
    }
  }
  return steps;
}

/* --- 3. Fluid tick -------------------------------------------------------
 * DF's 0-7 per-tile fill with gravity and diffusion, in place, bottom z
 * first. Diffusion averages the two tiles, which is the rule the wiki
 * describes; moving a single unit instead looks the same at rest but cannot
 * carry water more than about seven tiles from a source, so a long channel
 * starves. Pressure (the teleport rule) is left out: it is the rarer path
 * and this is the per-frame cost we are sizing. Returns units moved.
 */
int fluid_tick(unsigned char *lvl, unsigned char *solid, int w, int h, int d) {
  int moved = 0;
  int plane = w * h;
  for (int z = 0; z < d; z++) {
    unsigned char *L = lvl + z * plane;
    unsigned char *S = solid + z * plane;
    unsigned char *Lb = z > 0 ? lvl + (z - 1) * plane : 0;
    unsigned char *Sb = z > 0 ? solid + (z - 1) * plane : 0;
    for (int y = 1; y < h - 1; y++) {
      int row = y * w;
      for (int x = 1; x < w - 1; x++) {
        int i = row + x;
        int v = L[i];
        if (!v || S[i]) continue;

        if (Lb && !Sb[i] && Lb[i] < 7) {
          int room = 7 - Lb[i];
          int mv = v < room ? v : room;
          Lb[i] = (unsigned char)(Lb[i] + mv);
          v -= mv;
          L[i] = (unsigned char)v;
          moved += mv;
          if (!v) continue;
        }

        int ns[4]; ns[0] = i - 1; ns[1] = i + 1; ns[2] = i - w; ns[3] = i + w;
        for (int k = 0; k < 4; k++) {
          int j = ns[k];
          if (S[j]) continue;
          int diff = v - L[j];
          if (diff >= 2) {              /* average the pair, as DF describes */
            int mv = diff >> 1;
            L[j] = (unsigned char)(L[j] + mv);
            v -= mv;
            L[i] = (unsigned char)v;
            moved += mv;
          }
        }
      }
    }
  }
  return moved;
}

/* --- 4. Pressure ---------------------------------------------------------
 * DF's third rule, and the one that makes a river a river. Gravity and
 * diffusion are local; pressure is not. A connected body of 7/7 water can
 * push a unit out of any opening it touches, at or below the z-level of the
 * highest full tile in the body -- so water crosses a level channel in one
 * tick instead of dying seven tiles from the source.
 *
 * The cost is the point. Finding the body means flooding it, so the work is
 * proportional to the water, every tick, not to the water that moved. That
 * is the shape of the most expensive thing in Dwarf Fortress.
 *
 * The flow tick only ever touches the interior, so pressure must too. A
 * border cell it drains can never be refilled by gravity or diffusion, so
 * pressure refills it itself the next tick and drains it again the tick
 * after: a ring that moves thousands of units for ever and never settles.
 * Two rules working on different sets of cells is the bug.
 *
 * `starts` limits which cells may open a component; nstarts < 0 scans every
 * cell, which is the unbounded version. `seen` is stamped with `gen` rather
 * than cleared -- clearing it would be a pass over every cell, which is the
 * one thing an active set exists to avoid. `seen`, `stack`, `comp` and `out`
 * must each hold w*h*d ints.
 */
static int zCnt[64], zPos[64];

/* Counting sort by z level, highest first. One pass over a handful of buckets. */
static int *by_z_desc(const int *src, int n, int plane, int *dst) {
  int k, z;
  for (z = 0; z < 64; z++) zCnt[z] = 0;
  for (k = 0; k < n; k++) zCnt[src[k] / plane]++;
  for (z = 63, k = 0; z >= 0; z--) { zPos[z] = k; k += zCnt[z]; }
  for (k = 0; k < n; k++) { z = src[k] / plane; dst[zPos[z]++] = src[k]; }
  return dst;
}

int pressure_tick(unsigned char *lvl, unsigned char *solid, int w, int h, int d,
                  int *stack, int *comp0, int *out0, int *sortA, int *sortB,
                  int *seen, int gen, const int *starts, int nstarts) {
  int plane = w * h, total = plane * d, moved = 0;
  int limit = nstarts < 0 ? total : nstarts;

  for (int s = 0; s < limit; s++) {
    int i0 = nstarts < 0 ? s : starts[s];
    if (i0 < 0 || i0 >= total) continue;
    if (seen[i0] == gen || solid[i0] || lvl[i0] != 7) continue;
    {   /* interior only, exactly as fluid_tick */
      int z0 = i0 / plane, o0 = i0 - z0 * plane, y0 = o0 / w, x0 = o0 - y0 * w;
      if (x0 < 1 || y0 < 1 || x0 >= w - 1 || y0 >= h - 1) continue;
    }

    int *comp = comp0, *out = out0;
    int sp = 0, n = 0, outN = 0, zTop = -1;
    stack[sp++] = i0;
    seen[i0] = gen;
    while (sp) {
      int c = stack[--sp];
      comp[n++] = c;
      int z = c / plane;
      if (z > zTop) zTop = z;
      int off = c - z * plane, y = off / w, x = off - y * w;
      for (int k = 0; k < 6; k++) {
        int j;
        if (k == 0)      { if (x <= 1)     continue; j = c - 1; }
        else if (k == 1) { if (x >= w - 2) continue; j = c + 1; }
        else if (k == 2) { if (y <= 1)     continue; j = c - w; }
        else if (k == 3) { if (y >= h - 2) continue; j = c + w; }
        else if (k == 4) { if (z <= 0)     continue; j = c - plane; }
        else             { if (z >= d - 1) continue; j = c + plane; }
        if (seen[j] == gen || solid[j]) continue;
        seen[j] = gen;
        if (lvl[j] == 7) stack[sp++] = j;
        else out[outN++] = j;          /* somewhere this body can push into */
      }
    }

    comp = by_z_desc(comp, n, plane, sortA);
    out = by_z_desc(out, outN, plane, sortB);

    /* One unit per opening per tick: that rate limit is what stops pressure
     * equalising a body instantly. */
    int donor = 0;
    for (int k = 0; k < outN; k++) {
      int j = out[k];
      if (j / plane > zTop) continue;   /* never higher than the head */
      /* Only where the water can rest: pushing into a cell with unfilled
       * space under it just hands the unit to gravity. */
      if (j >= plane) {
        int below = j - plane;
        if (!solid[below] && lvl[below] < 7) continue;
      }
      /* And the donor has to be at least as high as where the unit goes.
       * That is what a head of water means. Leave it out and pressure lifts
       * a unit that gravity then drops, neither rule wrong on its own, and
       * together a still body that rings for ever. Both lists are sorted
       * from the top down, so one forward pointer serves every opening. */
      int zdst = j / plane;
      while (donor < n && (lvl[comp[donor]] < 7 || comp[donor] / plane < zdst)) donor++;
      if (donor >= n) break;
      lvl[comp[donor]]--;
      lvl[j]++;
      moved++;
    }
  }
  return moved;
}

/* Sum of a float buffer, so the two implementations can be compared. */
float checksum_f32(float *p, int count) {
  float s = 0.0f;
  for (int i = 0; i < count; i++) s += p[i];
  return s;
}
int checksum_u8(unsigned char *p, int count) {
  int s = 0;
  for (int i = 0; i < count; i++) s += p[i] * (i % 7 + 1);
  return s;
}
