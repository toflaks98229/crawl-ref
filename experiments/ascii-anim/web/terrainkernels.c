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
 * first. Pressure (the teleport rule) is left out: it is the rarer path and
 * this is the per-frame cost we are sizing. Returns units moved.
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
        for (int k = 0; k < 4 && v > 1; k++) {
          int j = ns[k];
          if (S[j]) continue;
          int u = L[j];
          if (u + 1 < v) {
            L[j] = (unsigned char)(u + 1);
            v--;
            L[i] = (unsigned char)v;
            moved++;
          }
        }
      }
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
