// Deterministic QR-style code renderer (visual placeholder — not a scannable code).
// Seeded so a given batch/grade always paints the same pattern.
export function drawQR(c, seed, ink, bg) {
  if (!c) return;
  const N = 25, m = 4, px = (N + 2) * m;
  c.width = px; c.height = px;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, px, px);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  x.fillStyle = ink;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if ((i < 8 && j < 8) || (i < 8 && j >= N - 8) || (i >= N - 8 && j < 8)) continue;
      if (rnd() < 0.48) x.fillRect((i + 1) * m, (j + 1) * m, m, m);
    }
  }
  [[0, 0], [N - 7, 0], [0, N - 7]].forEach(([i, j]) => {
    const X = (i + 1) * m, Y = (j + 1) * m;
    x.fillStyle = ink; x.fillRect(X, Y, 7 * m, 7 * m);
    x.fillStyle = bg; x.fillRect(X + m, Y + m, 5 * m, 5 * m);
    x.fillStyle = ink; x.fillRect(X + 2 * m, Y + 2 * m, 3 * m, 3 * m);
  });
}
