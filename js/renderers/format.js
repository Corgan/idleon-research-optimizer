// ===== FORMAT HELPERS - pure display formatting =====
// No DOM or global state references.

export function fmtTime(hrs) {
  if (!isFinite(hrs) || hrs <= 0) return '\u2014';
  if (hrs < 1) return Math.round(hrs * 60) + 'm';
  if (hrs < 24) return hrs.toFixed(1) + 'h';
  const d = Math.floor(hrs / 24);
  const h = Math.round(hrs % 24);
  if (d > 365) return (d / 365).toFixed(1) + 'y';
  return d + 'd ' + h + 'h';
}

export function fmtExp(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function fmtVal(v) {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(1);
}

export function fmtExact(v) {
  return Math.round(v).toLocaleString();
}
