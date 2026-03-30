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

// Precise time: includes minutes and seconds (for decision tree nodes).
export function fmtTimePrecise(hrs) {
  if (!isFinite(hrs) || hrs <= 0) return '\u2014';
  const totalSec = Math.round(hrs * 3600);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 365) return (d / 365).toFixed(1) + 'y';
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm ' + s + 's';
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

export function fmtExp(n) {
  if (n >= 1e24) return n.toExponential(2);
  if (n >= 1e21) return (n / 1e21).toFixed(2) + 'QQQ';
  if (n >= 1e18) return (n / 1e18).toFixed(2) + 'QQ';
  if (n >= 1e15) return (n / 1e15).toFixed(2) + 'Q';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function fmtVal(v) {
  const a = Math.abs(v);
  if (a >= 1e24) return v.toExponential(2);
  if (a >= 1e21) return (v / 1e21).toFixed(2) + 'QQQ';
  if (a >= 1e18) return (v / 1e18).toFixed(2) + 'QQ';
  if (a >= 1e15) return (v / 1e15).toFixed(2) + 'Q';
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(1);
}

export function fmtExact(v) {
  return Math.round(v).toLocaleString();
}
