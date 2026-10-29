#!/usr/bin/env node
// Reusable Stencyl MBS (binary game data) + lime pak reader for Legends of Idleon.
//
// Sources (src/N.new.formatted.js, 2026-09-18 build):
//   - Loader: `this.resourceListMbs = new Kh(dg.get(), !1, !1)` then
//     `readData(Za.getBytes("assets/data/resources.mbs"))` (~line 8389). The two
//     false flags mean the file carries no type table and no init string list.
//   - Reader class (Kh, ~line 34870-35200): big-endian, header version@0 (2),
//     typeTableHash@4, typeTablePointer@8, stringTablePointer@12, root dynamic@16.
//   - Typedefs (createField order, ~line 14236-15110). Field sizes: bool 1, int 4,
//     float 4, string 4 (string-table index), list 4 (pointer), dynamic 8.
//
// Exports: openGamePak(), readManifest(), parseMbs(buffer), loadResources().
// CLI: node _tools/extract/mbs.cjs [--sprite <id>] [--actor <id>] [--find <name>]

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_ASAR = 'C:/Program Files (x86)/Steam/steamapps/common/Legends of Idleon/resources/app.asar';
const PAK_IN_ASAR = 'distBuild/static/game/lib/default.pak';
const N_IN_ASAR = 'distBuild/static/game/N.js';

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(); }

// ---- asar ------------------------------------------------------------------
function readAsarFile(asarPath, inner) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
    const headerLen = head.readUInt32LE(12);
    const hb = Buffer.alloc(headerLen); fs.readSync(fd, hb, 0, headerLen, 16);
    const header = JSON.parse(hb.toString('utf8'));
    const base = 8 + head.readUInt32LE(4);
    let node = header;
    for (const part of inner.split('/')) { node = node.files && node.files[part]; if (!node) throw new Error(`asar: ${inner} not found`); }
    const out = Buffer.alloc(node.size); fs.readSync(fd, out, 0, node.size, base + Number(node.offset));
    return out;
  } finally { fs.closeSync(fd); }
}

// ---- lime manifest (embedded in N.js) ---------------------------------------
// Each entry: R0i<position>...R4y<idLen>:<urlencoded id>R6i<length>
function readManifest(nSource) {
  const text = Buffer.isBuffer(nSource) ? nSource.toString('latin1') : nSource;
  const map = new Map();
  const re = /R4y(\d+):/g; let m;
  while ((m = re.exec(text))) {
    const len = Number(m[1]); const start = m.index + m[0].length;
    const enc = text.slice(start, start + len);
    if (!enc.startsWith('assets')) continue;
    const after = text.slice(start + len, start + len + 24).match(/^R6(?:i(\d+)|z)/);
    const before = text.slice(Math.max(0, m.index - 200), m.index);
    const offs = [...before.matchAll(/R0(?:i(\d+)|z)/g)];
    if (!after || !offs.length) continue;
    const off = offs[offs.length - 1][1];
    map.set(decodeURIComponent(enc), { position: off === undefined ? 0 : Number(off), length: after[1] === undefined ? 0 : Number(after[1]) });
  }
  return map;
}

function openGamePak(opts = {}) {
  const asar = opts.asar || DEFAULT_ASAR;
  if (!fs.existsSync(asar)) throw new Error(`Game asar not found at ${asar}`);
  const nJs = readAsarFile(asar, N_IN_ASAR);
  const pak = readAsarFile(asar, PAK_IN_ASAR);
  const manifest = readManifest(nJs);
  const cache = new Map();
  function get(id) {
    if (cache.has(id)) return cache.get(id);
    const e = manifest.get(id);
    if (!e) return null;
    if (e.position + e.length > pak.length) throw new Error(`${id}: range outside pak`);
    const buf = zlib.gunzipSync(pak.subarray(e.position, e.position + e.length));
    cache.set(id, buf); return buf;
  }
  return {
    asar, manifest, get, entry: id => manifest.get(id) || null,
    nJsSha256: sha256(nJs), pakSha256: sha256(pak), nJsSize: nJs.length, pakSize: pak.length,
    asarMtime: fs.statSync(asar).mtime.toISOString(),
  };
}

// ---- MBS --------------------------------------------------------------------
const T = { BOOL: 0, INT: 1, FLOAT: 2, STRING: 3, LIST: 4, DYNAMIC: 5, NULL: 6, Resource: 10, Background: 11, CustomBlock: 12, Blank: 13, Font: 14, Music: 15, ActorType: 16, Sprite: 17, Animation: 18, AnimShape: 19 };
const SIZE = { 0: 1, 1: 4, 2: 4, 3: 4, 4: 4, 5: 8, 6: 0 };
const ANIM_SIZE = 50;

function parseMbs(buf) {
  const i32 = a => buf.readInt32BE(a);
  const f32 = a => buf.readFloatBE(a);
  const bool = a => buf[a] !== 0;
  if (i32(0) !== 2) throw new Error(`MBS version ${i32(0)} != 2`);
  const strTab = i32(12);
  const strCount = i32(strTab);
  const strCache = new Map();
  function str(a) {
    const idx = i32(a);
    if (idx < 0 || idx >= strCount) return null;
    if (strCache.has(idx)) return strCache.get(idx);
    const p = i32(strTab + 4 * (idx + 1)); const len = i32(p);
    const s = buf.toString('utf8', p + 4, p + 4 + len); strCache.set(idx, s); return s;
  }
  function list(a) { // a = address of a list pointer
    const p = i32(a); if (!p) return { len: 0, type: -1, base: 0 };
    return { len: i32(p), type: i32(p + 4), base: p + 8 };
  }
  function intList(a) { const l = list(a); const out = []; for (let k = 0; k < l.len; k++) out.push(i32(l.base + 4 * k)); return out; }
  function resource(a) { return { atlasID: i32(a), description: str(a + 4), id: i32(a + 8), name: str(a + 12) }; }
  function animation(a) {
    return {
      across: i32(a), down: i32(a + 4), durations: intList(a + 8), height: i32(a + 12), id: i32(a + 16),
      loop: bool(a + 20), name: str(a + 21), numFrames: i32(a + 25), originX: i32(a + 29), originY: i32(a + 33),
      sync: bool(a + 37), version: i32(a + 38), width: i32(a + 42),
    };
  }
  function sprite(a) {
    const r = resource(a);
    const anims = list(a + 29); const animations = [];
    for (let k = 0; k < anims.len; k++) {
      const ea = anims.base + k * (anims.type === T.DYNAMIC ? 8 : ANIM_SIZE);
      animations.push(animation(anims.type === T.DYNAMIC ? i32(ea + 4) : ea));
    }
    return Object.assign(r, { defaultAnimation: i32(a + 16), readableImages: bool(a + 20), height: i32(a + 21), width: i32(a + 25), animations });
  }
  function actorType(a) {
    const r = resource(a);
    return Object.assign(r, { autoScale: bool(a + 20), bodyType: i32(a + 21), groupID: i32(a + 35), ignoreGravity: bool(a + 39), physicsMode: i32(a + 53), sprite: i32(a + 61), isStatic: bool(a + 65) });
  }
  // MBS_BACKGROUND (N.new.formatted.js ~14283): resource fields then readableImages bool@16,
  // durations list@17, height@21, numFrames@25, repeats bool@29, resized bool@30, width@31,
  // xParallaxFactor f@35, xVelocity f@39, yParallaxFactor f@43, yVelocity f@47.
  // Nonzero velocity makes a ScrollingBackground (~14023), else an ImageBackground.
  function background(a) {
    return Object.assign(resource(a), {
      durations: intList(a + 17), height: i32(a + 21), numFrames: i32(a + 25), repeats: bool(a + 29), resized: bool(a + 30),
      width: i32(a + 31), xParallax: f32(a + 35), xVelocity: f32(a + 39), yParallax: f32(a + 43), yVelocity: f32(a + 47),
    });
  }

  // Root: dynamic list of dynamic resources.
  const rootType = i32(16); const rootVal = i32(20);
  if (rootType !== T.LIST) throw new Error(`MBS root typecode ${rootType} is not a list`);
  const len = i32(rootVal); const elType = i32(rootVal + 4); const base = rootVal + 8;
  const sprites = new Map(); const actorTypes = new Map(); const backgrounds = new Map(); const other = [];
  for (let k = 0; k < len; k++) {
    let type = elType, addr = base + k * (SIZE[elType] ?? 8);
    if (elType === T.DYNAMIC) { type = i32(addr); addr = i32(addr + 4); }
    if (type === T.Sprite) { const s = sprite(addr); sprites.set(s.id, s); }
    else if (type === T.ActorType) { const t = actorType(addr); actorTypes.set(t.id, t); }
    else if (type === T.Background) { const b = background(addr); backgrounds.set(b.id, b); other.push(Object.assign({ type }, resource(addr))); }
    else if (type >= T.Resource && type <= T.Music) other.push(Object.assign({ type }, resource(addr)));
  }
  return { sprites, actorTypes, backgrounds, other };
}

// Scene file assets/data/scene-<id>.mbs: same header, root is one MbsScene.
// MbsScene fields (createField order): retainAtlases bool@0, depth@1, description@5,
// eventSnippetID@9, extH@13, extW@17, extX@21, extY@25, format@29, gravX f@33,
// gravY f@37, height@41, id@45, name@49, revision@53, savecount@57, tileDepth@61,
// tileH@65, tileW@69, type@73, width@77, actorInstances list@81.
// MbsActorInstance (49 bytes): angle f@0, aid@4, customized bool@8, groupID@9,
// id (actor type)@13, name@17, scaleX f@21, scaleY f@25, x@29, y@33, z (layer)@37,
// orderInLayer@41.
function parseSceneMbs(buf) {
  const i32 = a => buf.readInt32BE(a);
  const f32 = a => buf.readFloatBE(a);
  if (i32(0) !== 2) throw new Error(`MBS version ${i32(0)} != 2`);
  const strTab = i32(12); const strCount = i32(strTab);
  const str = a => { const idx = i32(a); if (idx < 0 || idx >= strCount) return null; const p = i32(strTab + 4 * (idx + 1)); return buf.toString('utf8', p + 4, p + 4 + i32(p)); };
  let s = i32(20);
  if (i32(16) === T.DYNAMIC) s = i32(s + 4);
  const scene = { id: i32(s + 45), name: str(s + 49), width: i32(s + 77), height: i32(s + 41), tileW: i32(s + 69), tileH: i32(s + 65), actors: [] };
  const p = i32(s + 81);
  if (p) {
    const len = i32(p); const base = p + 8;
    for (let k = 0; k < len; k++) {
      const a = base + 49 * k;
      scene.actors.push({ type: i32(a + 13), name: str(a + 17), x: i32(a + 29), y: i32(a + 33), z: i32(a + 37), scaleX: f32(a + 21), scaleY: f32(a + 25), angle: f32(a) });
    }
  }
  // Layers list@89 (dynamic: typeId,addr). Read by the scene loader at N.new.formatted.js ~19095-19130.
  // 30 ColorBackground {color i32 ARGB}; 31 GradientBackground {color1, color2};
  // 33 tile layer; 34 ImageBackground = MBS_LAYER (~15930: id@0, name@4, order@8,
  // opacity@12, blendmode str@16, scrollFactorX f@20, scrollFactorY f@24, visible@28,
  // locked@29) + resourceID@30, customScroll bool@34 (~16002). Higher order = further back.
  scene.colorBackground = null; scene.layers = [];
  const lp = i32(s + 89);
  if (lp) {
    const len = i32(lp); const et = i32(lp + 4);
    for (let k = 0; k < len; k++) {
      if (et !== T.DYNAMIC) break;
      const t = i32(lp + 8 + 8 * k); const a = i32(lp + 8 + 8 * k + 4);
      if (t === 30) scene.colorBackground = { type: 'color', color: i32(a) >>> 0 };
      else if (t === 31) scene.colorBackground = { type: 'gradient', color1: i32(a) >>> 0, color2: i32(a + 4) >>> 0 };
      else if (t === 33 || t === 34) {
        const L = { kind: t === 34 ? 'image' : 'tile', id: i32(a), name: str(a + 4), order: i32(a + 8), opacity: i32(a + 12), blend: str(a + 16), scrollX: f32(a + 20), scrollY: f32(a + 24), visible: buf[a + 28] !== 0 };
        if (t === 34) { L.resourceID = i32(a + 30); L.customScroll = buf[a + 34] !== 0; }
        scene.layers.push(L);
      }
    }
  }
  return scene;
}

function loadResources(opts = {}) {
  const pak = opts.pak || openGamePak(opts);
  const raw = pak.get('assets/data/resources.mbs');
  if (!raw) throw new Error('resources.mbs not found in manifest');
  const mbs = parseMbs(raw);
  mbs.sha256 = sha256(raw); mbs.size = raw.length; mbs.entry = pak.entry('assets/data/resources.mbs');
  return Object.assign(mbs, { pak });
}

function sheetId(spriteId, animId) { return `assets/graphics/1x/sprite-${spriteId}-${animId}.png`; }

module.exports = { DEFAULT_ASAR, readAsarFile, readManifest, openGamePak, parseMbs, parseSceneMbs, loadResources, sheetId, sha256 };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const res = loadResources();
  console.log(`resources.mbs ${res.size} bytes sha ${res.sha256.slice(0, 12)} entry ${JSON.stringify(res.entry)}; sprites ${res.sprites.size}, actorTypes ${res.actorTypes.size}`);
  for (let k = 0; k < argv.length; k += 2) {
    const v = argv[k + 1];
    if (argv[k] === '--sprite') { const s = res.sprites.get(Number(v)); console.log(JSON.stringify(s && Object.assign({}, s, { animations: s.animations.map(a => Object.assign({}, a, { durations: a.durations.length > 8 ? a.durations.slice(0, 8).concat('…' + a.durations.length) : a.durations })) }), null, 1)); }
    else if (argv[k] === '--actor') console.log(JSON.stringify(res.actorTypes.get(Number(v))));
    else if (argv[k] === '--find') { const re = new RegExp(v, 'i'); for (const t of res.actorTypes.values()) if (re.test(t.name)) console.log('actor', t.id, t.name, 'sprite', t.sprite); for (const s of res.sprites.values()) if (re.test(s.name)) console.log('sprite', s.id, s.name, s.animations.length, 'anims'); }
  }
}
