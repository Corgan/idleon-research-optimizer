// ===== COMBAT SIM REPLAY CODEC =====
// Compact binary storage for long combat-sim replays. Each recorded frame is a
// Uint8Array holding only what changed since the previous frame, and every
// `keyframeEvery` frames holds the complete state. Positions (x, y, vx, vy) are
// quantized to 0.1 px, the renderer's interpolation resolution, monster respawn
// countdowns (unused by the renderer) to 0.1 s, and changed values are stored as
// tenth deltas from the previous frame. Storage is uncapped: callers record at a fixed
// interval for the whole run.
//
// Frame layout: flags byte (bit 0 = keyframe), t (value), varint changed-key
// count, then per changed top-level snapshot key: varint keyIdx, kind byte, payload:
//   kind 0 plain object: varint n, n x (varint fieldIdx, value)
//   kind 1 list of { uid } objects: varint n, n x (uid value, varint m, m x (varint fieldIdx, value)),
//          varint r, r x removed uid value
//   kind 2 any other value, stored whole
// Values are tagged: 0 null, 1 false, 2 true, 3 uint varint, 4 negative int varint,
// 5 float64, 6 interned string, 7 array, 8 object, 9 absolute tenths (zigzag),
// 10 delta tenths from the previous value (zigzag), 11 prefixed id (interned prefix + varint,
// used for list uids such as 'i1189'), 12 field absent (delete), 13 uid with the previous uid's prefix in the same
// list as a zigzag delta from its number; bytes 16..255 are the small ints 0..239.
// List entries omit their uid field; a new entry is a field delta from the previous new entry of the same
// list in that frame (drops arrive in bursts that share type/position), or from { uid } for the first.
// Field names, key names, and string values share one interned dictionary,
// delivered incrementally with each batch. Semantics match JSON: undefined and
// non-finite numbers decode as null and undefined nested object fields are dropped.

const QUANTIZED = new Set(['x', 'y', 'vx', 'vy', 'respawn']);
const SMALL = 16, SMALL_MAX = 255 - SMALL;
const KIND_O = 0, KIND_L = 1, KIND_V = 2;
const UID_RE = /^(\D*)(0|[1-9]\d{0,14})$/;

function _q(key, v) {
  return typeof v === 'number' && QUANTIZED.has(key) && Number.isFinite(v) ? Math.round(v * 10) / 10 : v;
}

function _uidOrder(a, b) {
  const ma = typeof a === 'string' ? UID_RE.exec(a) : null, mb = typeof b === 'string' ? UID_RE.exec(b) : null;
  if (!ma || !mb) return ma ? 1 : mb ? -1 : 0;
  return ma[1] < mb[1] ? -1 : ma[1] > mb[1] ? 1 : Number(ma[2]) - Number(mb[2]);
}

function _same(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function _kindOf(v) {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { const e = v[i]; if (!e || typeof e !== 'object' || e.uid == null) return KIND_V; }
    return KIND_L;
  }
  return v && typeof v === 'object' ? KIND_O : KIND_V;
}

function _writer() {
  let buf = new Uint8Array(4096), dv = new DataView(buf.buffer), n = 0;
  const need = (k) => {
    if (n + k <= buf.length) return;
    let len = buf.length * 2; while (len < n + k) len *= 2;
    const nb = new Uint8Array(len); nb.set(buf.subarray(0, n)); buf = nb; dv = new DataView(buf.buffer);
  };
  const w = {
    reset() { n = 0; },
    take() { return buf.slice(0, n); },
    byte(b) { need(1); buf[n++] = b; },
    uv(v) { // unsigned varint, exact up to 2^53
      need(8);
      while (v >= 128) { buf[n++] = (v % 128) | 128; v = Math.floor(v / 128); }
      buf[n++] = v;
    },
    zz(v) { w.uv(v >= 0 ? v * 2 : -v * 2 - 1); },
    f64(v) { need(8); dv.setFloat64(n, v, true); n += 8; },
  };
  return w;
}

function _reader(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const r = {
    p: 0,
    byte() { return bytes[r.p++]; },
    uv() {
      let v = 0, mul = 1, b;
      do { b = bytes[r.p++]; v += (b & 127) * mul; mul *= 128; } while (b & 128);
      return v;
    },
    zz() { const z = r.uv(); return z % 2 ? -(z + 1) / 2 : z / 2; },
    f64() { const v = dv.getFloat64(r.p, true); r.p += 8; return v; },
  };
  return r;
}

export function createReplayEncoder(opts) {
  const keyframeEvery = Math.max(1, Number(opts?.keyframeEvery) || 300);
  const keys = [];
  const index = new Map();
  let sentKeys = 0;
  let prev = new Map(); // top key -> { kind, val } (val: field object, uid Map, or JSON string)
  let count = 0, bytes = 0;
  const w = _writer();
  const ki = (name) => {
    let i = index.get(name);
    if (i === undefined) { i = keys.length; keys.push(name); index.set(name, i); }
    return i;
  };
  function val(v) {
    if (v === null || v === undefined) { w.byte(0); return; }
    switch (typeof v) {
      case 'boolean': w.byte(v ? 2 : 1); return;
      case 'number':
        if (!Number.isFinite(v)) w.byte(0);
        else if (Number.isSafeInteger(v) && !Object.is(v, -0)) {
          if (v >= 0 && v <= SMALL_MAX) w.byte(SMALL + v);
          else if (v >= 0) { w.byte(3); w.uv(v); } else { w.byte(4); w.uv(-v); }
        } else { w.byte(5); w.f64(v); }
        return;
      case 'string': w.byte(6); w.uv(ki(v)); return;
      case 'object':
        if (Array.isArray(v)) { w.byte(7); w.uv(v.length); for (const e of v) val(e); return; }
        {
          const fs = []; for (const f in v) if (v[f] !== undefined && typeof v[f] !== 'function') fs.push(f);
          w.byte(8); w.uv(fs.length); for (const f of fs) { w.uv(ki(f)); val(v[f]); }
        }
        return;
      default: w.byte(0);
    }
  }
  // List uids: 'i1189' -> interned 'i' + 1189, so unique ids never grow the dictionary;
  // sequential uids in one list cost two bytes as deltas from the previous one.
  let uPre = null, uNum = 0;
  function uidVal(v) {
    const m = typeof v === 'string' ? UID_RE.exec(v) : null;
    if (!m) { val(v); return; }
    const n = Number(m[2]);
    if (m[1] === uPre) { w.byte(13); w.zz(n - uNum); } else { w.byte(11); w.uv(ki(m[1])); w.uv(n); uPre = m[1]; }
    uNum = n;
  }
  // Field value: quantized numbers are tenths, as a delta when the previous value is known.
  function fieldVal(f, v, old) {
    if (typeof v === 'number' && QUANTIZED.has(f) && Number.isFinite(v)) {
      const t = Math.round(v * 10);
      if (typeof old === 'number' && Number.isFinite(old)) { w.byte(10); w.zz(t - Math.round(old * 10)); }
      else { w.byte(9); w.zz(t); }
    } else val(v);
  }
  // Writes changed fields of obj vs old (count first); returns the new quantized field object.
  function objDelta(old, obj, skipUid) {
    const next = {};
    const ch = [];
    for (const f in obj) {
      if (skipUid && f === 'uid') { next.uid = obj.uid; continue; }
      const v = _q(f, obj[f]);
      next[f] = v;
      if (!old || !(f in old) || !_same(old[f], v)) ch.push(f);
    }
    const gone = [];
    if (old) for (const f in old) if (!(f in obj) && !(skipUid && f === 'uid')) gone.push(f);
    w.uv(ch.length + gone.length);
    for (const f of ch) { w.uv(ki(f)); fieldVal(f, next[f], old ? old[f] : undefined); }
    for (const f of gone) { w.uv(ki(f)); w.byte(12); }
    return next;
  }
  function changed(old, obj) {
    if (!old) return true;
    for (const f in obj) { if (!(f in old) || !_same(old[f], _q(f, obj[f]))) return true; }
    for (const f in old) if (!(f in obj)) return true;
    return false;
  }
  return {
    get keys() { return keys.slice(); },
    get count() { return count; },
    get bytes() { return bytes; },
    /** Dictionary entries added since the previous call: `{ keysFrom, keys }` for a store batch. */
    newKeys() { const out = { keysFrom: sentKeys, keys: keys.slice(sentKeys) }; sentKeys = keys.length; return out; },
    push(snap) {
      const kf = count % keyframeEvery === 0;
      if (kf) prev = new Map();
      w.reset();
      w.byte(kf ? 1 : 0);
      val(Number(snap.t) || 0);
      const parts = [];
      const next = new Map();
      for (const key in snap) {
        if (key === 't') continue;
        const v = snap[key];
        const kind = _kindOf(v);
        const p = prev.get(key);
        const old = p && p.kind === kind ? p.val : null;
        if (kind === KIND_O) {
          if (old && !changed(old, v)) { next.set(key, p); continue; }
          parts.push([key, kind, v, old]);
        } else if (kind === KIND_L) {
          let dirty = !old || old.size !== v.length;
          if (!dirty) for (const e of v) { const o = old.get(e.uid); if (!o || changed(o, e)) { dirty = true; break; } }
          if (!dirty) { next.set(key, p); continue; }
          parts.push([key, kind, v, old]);
        } else {
          const s = JSON.stringify(v === undefined ? null : v);
          if (old !== null && old === s) { next.set(key, p); continue; }
          parts.push([key, kind, v, s]);
        }
      }
      w.uv(parts.length);
      for (const [key, kind, v, aux] of parts) {
        w.uv(ki(key)); w.byte(kind);
        if (kind === KIND_O) next.set(key, { kind, val: objDelta(aux, v) });
        else if (kind === KIND_L) {
          const old = aux, valMap = new Map(), ups = [];
          for (const e of v) { const o = old ? old.get(e.uid) : null; if (changed(o, e)) ups.push([e, o]); else valMap.set(e.uid, o); }
          w.uv(ups.length);
          let tmpl = null;
          uPre = null;
          for (const [e, o] of ups) {
            uidVal(e.uid);
            if (o) valMap.set(e.uid, objDelta(o, e, true));
            else { tmpl = objDelta(tmpl || { uid: e.uid }, e, true); valMap.set(e.uid, tmpl); }
          }
          const gone = [];
          if (old) for (const uid of old.keys()) if (!valMap.has(uid)) gone.push(uid);
          gone.sort(_uidOrder);
          w.uv(gone.length);
          for (const uid of gone) uidVal(uid);
          next.set(key, { kind, val: valMap });
        } else { val(v); next.set(key, { kind, val: aux }); }
      }
      prev = next;
      count++;
      const out = w.take();
      bytes += out.length;
      return out;
    },
  };
}

/** Packs encoded frames into one transferable buffer: `{ buf, lens }`. */
export function packReplayFrames(frames) {
  let total = 0;
  for (const f of frames) total += f.length;
  const buf = new Uint8Array(total), lens = new Uint32Array(frames.length);
  let o = 0;
  frames.forEach((f, i) => { buf.set(f, o); o += f.length; lens[i] = f.length; });
  return { buf, lens };
}

/**
 * Array-like store of encoded frames. `get(k)` decodes frame k into the
 * original snapshot shape (fresh objects per frame) and keeps an LRU of
 * recently decoded frames so nearby backward scans stay cheap.
 * `append` accepts `{ keys | keysFrom+keys, frames: [Uint8Array] }` or a packed `{ buf, lens }`.
 */
export function createReplayStore(opts) {
  const cacheSize = Math.max(16, Number(opts?.cacheSize) || 1024);
  const window = Math.min(cacheSize, Math.max(1, Number(opts?.materializeWindow) || 400));
  const chunks = [];
  const fChunk = [], fOff = [], fLen = [], times = [];
  const keyframes = [];
  const keys = [];
  let bytes = 0;
  const cache = new Map();
  let cur = -1;
  let state = new Map(); // top key -> { kind, val }
  let uPre = null, uNum = 0; // previous list uid (prefix, number) for tag 13

  function frameBytes(k) { const c = chunks[fChunk[k]]; return c.subarray(fOff[k], fOff[k] + fLen[k]); }
  function val(r) {
    const t = r.byte();
    if (t >= SMALL) return t - SMALL;
    switch (t) {
      case 0: return null;
      case 1: return false;
      case 2: return true;
      case 3: return r.uv();
      case 4: return -r.uv();
      case 5: return r.f64();
      case 6: return keys[r.uv()];
      case 7: { const n = r.uv(), a = new Array(n); for (let i = 0; i < n; i++) a[i] = val(r); return a; }
      case 8: { const n = r.uv(), o = {}; for (let i = 0; i < n; i++) { const f = keys[r.uv()]; o[f] = val(r); } return o; }
      case 11: { uPre = keys[r.uv()]; uNum = r.uv(); return uPre + uNum; }
      case 13: { uNum += r.zz(); return uPre + uNum; }
      default: throw new Error('replay: bad value tag ' + t);
    }
  }
  function fieldVal(r, old) {
    const t = r.bytes[r.p];
    if (t === 9) { r.p++; return r.zz() / 10; }
    if (t === 10) { r.p++; return (Math.round(old * 10) + r.zz()) / 10; }
    return val(r);
  }
  function fields(r, e) {
    const m = r.uv();
    for (let j = 0; j < m; j++) {
      const f = keys[r.uv()];
      if (r.bytes[r.p] === 12) { r.p++; delete e[f]; } else e[f] = fieldVal(r, e[f]);
    }
  }
  function apply(bytesK) {
    const r = _reader(bytesK); r.bytes = bytesK;
    if (r.byte() & 1) state = new Map();
    const t = val(r);
    const n = r.uv();
    for (let i = 0; i < n; i++) {
      const key = keys[r.uv()], kind = r.byte();
      let s = state.get(key);
      if (!s || s.kind !== kind) { s = { kind, val: kind === KIND_O ? {} : kind === KIND_L ? new Map() : null }; state.set(key, s); }
      if (kind === KIND_O) fields(r, s.val);
      else if (kind === KIND_L) {
        const u = r.uv();
        let tmpl = null;
        uPre = null;
        for (let j = 0; j < u; j++) {
          const uid = val(r);
          let e = s.val.get(uid);
          if (e) { fields(r, e); continue; }
          e = tmpl ? Object.assign({}, tmpl) : {};
          e.uid = uid;
          fields(r, e);
          s.val.set(uid, e); tmpl = e;
        }
        const g = r.uv();
        for (let j = 0; j < g; j++) s.val.delete(val(r));
      } else s.val = val(r);
    }
    return t;
  }
  function materialize(t) {
    const snap = { t };
    for (const [key, s] of state) {
      if (s.kind === KIND_O) snap[key] = Object.assign({}, s.val);
      else if (s.kind === KIND_L) { const arr = []; for (const e of s.val.values()) arr.push(Object.assign({}, e)); snap[key] = arr; }
      else snap[key] = s.val && typeof s.val === 'object' ? JSON.parse(JSON.stringify(s.val)) : s.val;
    }
    return snap;
  }
  function put(k, snap) {
    cache.set(k, snap);
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
  }
  function lastKeyframe(k) {
    let lo = 0, hi = keyframes.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (keyframes[mid] <= k) { best = keyframes[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best;
  }
  function addChunk(buf, lens) {
    const ci = chunks.length;
    chunks.push(buf);
    let o = 0;
    for (let i = 0; i < lens.length; i++) {
      const k = fChunk.length, len = lens[i];
      fChunk.push(ci); fOff.push(o); fLen.push(len);
      const r = _reader(buf.subarray(o, o + len));
      if (r.byte() & 1) keyframes.push(k);
      times.push(val(r));
      o += len;
      bytes += len;
    }
  }
  return {
    get length() { return fLen.length; },
    get bytes() { return bytes; },
    append(batch) {
      if (!batch) return;
      if (batch.keys) {
        const from = batch.keysFrom == null ? 0 : batch.keysFrom;
        if (from > keys.length) throw new Error('replay: missing dictionary entries ' + keys.length + '..' + from);
        for (let i = 0; i < batch.keys.length; i++) keys[from + i] = batch.keys[i];
      }
      if (batch.buf) { addChunk(batch.buf instanceof Uint8Array ? batch.buf : new Uint8Array(batch.buf), batch.lens); return; }
      const frames = batch.frames || [];
      if (frames.length) { const p = packReplayFrames(frames); addChunk(p.buf, p.lens); }
    },
    /** Frame time without decoding. */
    time(k) { return times[k | 0]; },
    get(k) {
      k = k | 0;
      if (k < 0 || k >= fLen.length) return undefined;
      const hit = cache.get(k);
      if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
      const kb = lastKeyframe(k);
      if (kb < 0) return undefined;
      if (!(cur >= kb && cur < k)) { state = new Map(); cur = kb - 1; }
      let snap;
      while (cur < k) {
        cur++;
        const t = apply(frameBytes(cur));
        if (k - cur < window) {
          if (cur === k || !cache.has(cur)) { snap = materialize(t); put(cur, snap); }
        }
      }
      return snap || cache.get(k);
    },
  };
}