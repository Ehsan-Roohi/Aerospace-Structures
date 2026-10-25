/*
 * Wing Study IO — study files, design-parameter import, SHA-256 provenance and share links for the
 * MIE 446 Wing Lab (printed PLA semi-wing and D.520 metal-wing workspaces).
 *
 *   Browser: inline this file in the page; it defines the global WingStudyIO.
 *   Node:    const WingStudyIO = require('./wing_study_io.js');
 *
 * Files, pasted text and links are untrusted. They are read by a strict JSON reader (finite numbers
 * only: no NaN, Infinity or overflowing literals; no duplicate keys; size, depth and length limits),
 * copied field by field into a fresh state (unknown fields are refused), checked here for type,
 * units and bounds, and then checked by the engines themselves (WingEngine.makeGeometry, normalize
 * and the solver's own section builder ringLoops; MetalWingEngine.normalise). An import returns
 * either a complete validated state or a list of errors, never a partial state. Nothing is fetched
 * or evaluated, nothing is solved, and text from a file reaches the page only as escaped text.
 * Formats, limits and the neutral design-parameter schema are documented in WING_IMPORT.md.
 */
;(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.WingStudyIO = api;
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : undefined), function () {
  'use strict';

  const IO_VERSION = '2.0.0';
  const STUDY_FORMAT = 'mie446-wing-study';
  const PARAMS_FORMAT = 'mie446-wing-parameters';
  const FILE_VERSION = 1;
  const MAX_FILE_VERSION = 2;
  const SHARE_KEY = 'wingstudy';
  const LIMITS = Object.freeze({
    fileBytes: 262144,                  // study and design-parameter files, UTF-8 bytes (256 KiB)
    shareChars: 8000,                   // base64url token of a share link
    depth: 12, arrayItems: 256, objectKeys: 64, stringChars: 4096, numberChars: 100,
    printedItems: 12, printedSegments: 30, d520Items: 30, d520Segments: 30,
    tableRowsMin: 2, tableRowsMax: 31, rods: 8, ribs: 16,     // rods: the printed-wing page offers at most 8 (MAX_RODS)
    nameChars: 80, labelChars: 120, filenameChars: 255, notesChars: 2000, messages: 60,
  });
  const WORKSPACE_LABEL = Object.freeze({ printed: 'printed PLA semi-wing', d520: 'D.520 metal wing' });

  // Engines are passed in explicitly; inside the single-page app the globals are used as a fallback.
  /* global WingEngine, MetalWingEngine */
  const globalWing = () => (typeof WingEngine !== 'undefined' ? WingEngine : null);
  const globalMetal = () => (typeof MetalWingEngine !== 'undefined' ? MetalWingEngine : null);

  // ------------------------------------------------------------------ small helpers
  const own = (o, k) => o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  function join(base, key) {
    if (typeof key === 'number') return `${base}[${key}]`;
    const k = String(key);
    if (IDENT.test(k)) return base ? `${base}.${k}` : k;
    return `${base}[${JSON.stringify(k.length > 40 ? k.slice(0, 40) + '…' : k)}]`;
  }
  const fmt = (v) => (typeof v === 'number' ? (Object.is(v, -0) ? '0' : String(v)) : String(v));
  function describe(v) {
    if (v === undefined) return 'nothing';
    if (v === null) return 'null';
    if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : Number.isFinite(v) ? String(v) : v > 0 ? 'Infinity' : '-Infinity';
    if (typeof v === 'string') return `the text ${JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…' : v)}`;
    if (typeof v === 'boolean') return `the value ${v}`;
    if (Array.isArray(v)) return `a list of ${v.length}`;
    if (typeof v === 'object') return 'an object';
    return `a ${typeof v}`;
  }
  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(clone);
    const out = {};
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  }
  const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  function cleanName(v) {
    if (typeof v !== 'string') return null;
    return v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.filenameChars) || null;
  }
  /** Display metadata only: never interpreted as markup, a path or engine input. */
  function normalizeProjectName(value) {
    if (typeof value !== 'string') throw new Error('projectName must be plain text.');
    if (value.length > LIMITS.nameChars) throw new Error(`projectName must be at most ${LIMITS.nameChars} characters.`);
    if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))
      throw new Error('projectName contains control characters, line breaks or directional overrides; use plain text.');
    return value.trim();
  }
  /** Safe portable filename component; display names are preserved separately. */
  function safeFilenameStem(value, fallback = 'wing') {
    const token = v => Array.from(String(v ?? '').normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 64).join('');
    let stem = token(value) || token(fallback) || 'wing';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `wing-${stem}`;
    return stem;
  }
  function readProjectName(issues, obj) {
    if (!own(obj, 'projectName')) return '';
    try { return normalizeProjectName(obj.projectName); }
    catch (e) { issues.err('projectName', e.message); return ''; }
  }

  // Error and warning collector; messages are "path: message".
  function makeIssues() {
    const errors = [], warnings = [];
    let dropped = 0;
    return {
      errors, warnings,
      err(path, msg) { if (errors.length >= LIMITS.messages) { dropped++; return; } errors.push(path ? `${path}: ${msg}` : msg); },
      warn(path, msg) { if (warnings.length < LIMITS.messages) warnings.push(path ? `${path}: ${msg}` : msg); },
      get count() { return errors.length + dropped; },
      finish() { if (dropped) { errors.push(`…and ${dropped} more problems.`); dropped = 0; } },
    };
  }

  // ------------------------------------------------------------------ UTF-8
  function utf8Encode(str) {
    const out = new Uint8Array(str.length * 3);
    let n = 0;
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } else c = 0xfffd;
      } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out[n++] = c;
      else if (c < 0x800) { out[n++] = 0xc0 | (c >> 6); out[n++] = 0x80 | (c & 63); }
      else if (c < 0x10000) { out[n++] = 0xe0 | (c >> 12); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63); }
      else { out[n++] = 0xf0 | (c >> 18); out[n++] = 0x80 | ((c >> 12) & 63); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63); }
    }
    return out.slice(0, n);
  }
  /** Strict UTF-8 decoder: overlong forms, surrogates and truncated sequences are errors. */
  function utf8Decode(bytes) {
    const b = toBytes(bytes);
    let out = '';
    const chunk = [];
    for (let i = 0; i < b.length;) {
      const x = b[i];
      let cp, need;
      if (x < 0x80) { cp = x; need = 0; }
      else if (x >= 0xc2 && x <= 0xdf) { cp = x & 0x1f; need = 1; }
      else if (x >= 0xe0 && x <= 0xef) { cp = x & 0x0f; need = 2; }
      else if (x >= 0xf0 && x <= 0xf4) { cp = x & 0x07; need = 3; }
      else throw new Error(`byte ${i + 1} is not valid UTF-8`);
      if (i + need >= b.length + (need ? 0 : 1)) throw new Error(`the text ends inside a UTF-8 character at byte ${i + 1}`);
      for (let k = 1; k <= need; k++) {
        const c = b[i + k];
        if ((c & 0xc0) !== 0x80) throw new Error(`byte ${i + k + 1} is not valid UTF-8`);
        cp = (cp << 6) | (c & 0x3f);
      }
      if ((need === 2 && (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff))) || (need === 3 && (cp < 0x10000 || cp > 0x10ffff)))
        throw new Error(`bytes ${i + 1}–${i + need + 1} are not a valid UTF-8 character`);
      chunk.push(cp);
      if (chunk.length >= 4096) { out += String.fromCodePoint(...chunk); chunk.length = 0; }
      i += need + 1;
    }
    return out + String.fromCodePoint(...chunk);
  }
  function isBytes(v) {
    if (!v || typeof v !== 'object') return false;
    const tag = Object.prototype.toString.call(v);
    return tag === '[object ArrayBuffer]' || tag === '[object Uint8Array]' || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v));
  }
  function toBytes(v) {
    if (typeof v === 'string') return utf8Encode(v);
    const tag = Object.prototype.toString.call(v);
    if (tag === '[object ArrayBuffer]') return new Uint8Array(v);
    if (tag === '[object Uint8Array]') return v;
    if (v && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    throw new TypeError('Expected text or bytes.');
  }

  // ------------------------------------------------------------------ SHA-256 (FIPS 180-4), synchronous
  const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  /** Hex SHA-256 of text (hashed as UTF-8) or of bytes (Uint8Array / ArrayBuffer). */
  function sha256(input) {
    const msg = toBytes(input);
    const len = msg.length;
    const total = Math.ceil((len + 9) / 64) * 64;
    const buf = new Uint8Array(total);
    buf.set(msg);
    buf[len] = 0x80;
    const view = new DataView(buf.buffer);
    view.setUint32(total - 8, Math.floor(len / 0x20000000) >>> 0);
    view.setUint32(total - 4, (len * 8) >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + 4 * t);
      for (let t = 16; t < 64; t++) {
        const a = W[t - 15], b = W[t - 2];
        const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3), s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K256[t] + W[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
  }

  // ------------------------------------------------------------------ base64url
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function base64urlEncode(bytes) {
    const b = toBytes(bytes);
    let out = '';
    for (let i = 0; i < b.length; i += 3) {
      const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (i + 1 < b.length) out += B64[(n >> 6) & 63];
      if (i + 2 < b.length) out += B64[n & 63];
    }
    return out;
  }
  function base64urlDecode(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('not a base64url text');
    const out = new Uint8Array(Math.floor((text.length * 3) / 4));
    let n = 0;
    for (let i = 0; i < text.length; i += 4) {
      const q = [0, 1, 2, 3].map((k) => (i + k < text.length ? B64.indexOf(text[i + k]) : 0));
      const v = (q[0] << 18) | (q[1] << 12) | (q[2] << 6) | q[3];
      out[n++] = (v >> 16) & 255;
      if (i + 2 < text.length) out[n++] = (v >> 8) & 255;
      if (i + 3 < text.length) out[n++] = v & 255;
    }
    return out.slice(0, n);
  }

  // ------------------------------------------------------------------ strict JSON reader
  /**
   * RFC 8259 JSON with explicit refusals: NaN/Infinity/undefined, numbers that overflow to infinity
   * or underflow to zero, duplicate keys, raw control characters, lone surrogates, comments, trailing
   * commas, nesting deeper than LIMITS.depth, lists longer than LIMITS.arrayItems, objects with more
   * than LIMITS.objectKeys fields. Objects are created without a prototype, so keys such as
   * "__proto__" are plain data. Errors name the field path and the line and column.
   */
  function parseJson(text, limits = LIMITS) {
    if (typeof text !== 'string') throw new TypeError('parseJson needs text.');
    let i = 0;
    const n = text.length, path = [];
    const where = () => path.reduce((p, k) => join(p, k), '');
    function fail(msg, pos = i) {
      let line = 1, col = 1;
      for (let k = 0; k < pos && k < n; k++) { if (text.charCodeAt(k) === 10) { line++; col = 1; } else col++; }
      const p = where();
      const e = new Error(`${p ? p + ': ' : ''}${msg} (line ${line}, column ${col})`);
      e.jsonPath = p; e.line = line; e.column = col;
      throw e;
    }
    const ws = () => { while (i < n) { const c = text.charCodeAt(i); if (c === 32 || c === 9 || c === 10 || c === 13) i++; else break; } };
    const NUM = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    const ESC = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    function value(depth) {
      ws();
      if (i >= n) fail('the text ends where a value was expected');
      const c = text[i];
      if (c === '{') return object(depth + 1);
      if (c === '[') return array(depth + 1);
      if (c === '"') return string();
      if (c === 't') return word('true', true);
      if (c === 'f') return word('false', false);
      if (c === 'n') return word('null', null);
      if (c === '-' || (c >= '0' && c <= '9')) return number();
      for (const bad of ['NaN', 'Infinity', 'undefined']) if (text.startsWith(bad, i)) fail(`${bad} is not allowed: every number must be a finite JSON number`);
      if (c === "'") fail('text values and field names must use double quotes');
      if (c === '/') fail('comments are not allowed in JSON');
      fail(`unexpected character ${JSON.stringify(c)}`);
    }
    function word(w, v) {
      if (text.startsWith(w, i)) { i += w.length; return v; }
      fail(`unexpected text ${JSON.stringify(text.slice(i, i + 12))}`);
    }
    function number() {
      if (text.startsWith('-Infinity', i)) fail('-Infinity is not allowed: every number must be a finite JSON number');
      NUM.lastIndex = i;
      const m = NUM.exec(text);
      if (!m) fail('invalid number');
      const tok = m[0], next = text[i + tok.length];
      if (next !== undefined && /[0-9A-Za-z.+\-]/.test(next)) fail(`invalid number ${JSON.stringify(text.slice(i, i + tok.length + 1))}`);
      if (tok.length > limits.numberChars) fail(`the number ${tok.slice(0, 24)}… has more than ${limits.numberChars} characters`);
      const v = Number(tok);
      if (!Number.isFinite(v)) fail(`the number ${tok} is too large: it overflows to infinity, and every number must be finite`);
      if (v === 0 && /[1-9]/.test(tok.replace(/[eE].*$/, ''))) fail(`the number ${tok} is too small: it underflows to zero`);
      i += tok.length;
      return v;
    }
    function string() {
      i++;
      let out = '', start = i;
      for (;;) {
        if (i >= n) fail('a text value is not closed (missing ")');
        const c = text.charCodeAt(i);
        if (c === 34) { out += text.slice(start, i); i++; break; }
        if (c === 92) {
          out += text.slice(start, i);
          const e = text[i + 1];
          if (e === 'u') {
            const hex = text.slice(i + 2, i + 6);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) fail('invalid \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else if (e !== undefined && own(ESC, e)) { out += ESC[e]; i += 2; }
          else fail('invalid escape sequence in a text value');
          start = i;
          continue;
        }
        if (c < 32) fail('a text value contains a raw control character');
        i++;
        if (out.length + i - start > limits.stringChars) fail(`a text value is longer than ${limits.stringChars} characters`);
      }
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)) fail('a text value contains an unpaired Unicode surrogate');
      return out;
    }
    function object(depth) {
      if (depth > limits.depth) fail(`the data is nested more than ${limits.depth} levels deep`);
      i++;
      const obj = Object.create(null);
      let count = 0;
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail(text[i] === '}' ? 'a trailing comma is not allowed' : 'expected a field name in double quotes');
        const at = i, key = string();
        if (own(obj, key)) { path.push(key); fail(`duplicate field ${JSON.stringify(key.slice(0, 40))}: each field may appear only once`, at); }
        if (++count > limits.objectKeys) fail(`an object has more than ${limits.objectKeys} fields`, at);
        ws();
        if (text[i] !== ':') fail('expected : after a field name');
        i++;
        path.push(key);
        obj[key] = value(depth);
        path.pop();
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return obj; }
        fail(text[i] === '/' ? 'comments are not allowed in JSON' : 'expected , or } after a field');
      }
    }
    function array(depth) {
      if (depth > limits.depth) fail(`the data is nested more than ${limits.depth} levels deep`);
      i++;
      const arr = [];
      ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        if (arr.length >= limits.arrayItems) fail(`a list has more than ${limits.arrayItems} entries`);
        path.push(arr.length);
        arr.push(value(depth));
        path.pop();
        ws();
        if (text[i] === ',') { i++; ws(); if (text[i] === ']') fail('a trailing comma is not allowed'); continue; }
        if (text[i] === ']') { i++; return arr; }
        fail(text[i] === '/' ? 'comments are not allowed in JSON' : 'expected , or ] in a list');
      }
    }
    const result = value(0);
    ws();
    if (i < n) fail(text[i] === '/' ? 'comments are not allowed in JSON' : 'unexpected text after the end of the JSON value');
    return result;
  }

  // Bytes or text in, checked UTF-8 text out, with provenance (SHA-256 of the exact bytes).
  function readInput(input, label) {
    let bytes, text;
    if (typeof input === 'string') {
      if (input.length > LIMITS.fileBytes) return { error: `${label} is too large (more than ${LIMITS.fileBytes} bytes; the limit is ${LIMITS.fileBytes / 1024} KiB).`, byteLength: null };
      bytes = utf8Encode(input);
      text = input;
    } else if (isBytes(input)) {
      bytes = toBytes(input);
      if (bytes.length > LIMITS.fileBytes) return { error: `${label} is too large (${bytes.length} bytes; the limit is ${LIMITS.fileBytes} bytes = ${LIMITS.fileBytes / 1024} KiB).`, byteLength: bytes.length };
      try { text = utf8Decode(bytes); } catch (e) { return { error: `${label} is not UTF-8 text: ${e.message}.`, byteLength: bytes.length, sha256: sha256(bytes) }; }
    } else return { error: `${label} must be text.`, byteLength: null };
    if (bytes.length > LIMITS.fileBytes) return { error: `${label} is too large (${bytes.length} bytes; the limit is ${LIMITS.fileBytes} bytes = ${LIMITS.fileBytes / 1024} KiB).`, byteLength: bytes.length };
    const hash = sha256(bytes);
    let bom = false;
    if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); bom = true; }
    return { text, byteLength: bytes.length, sha256: hash, bom };
  }

  // ------------------------------------------------------------------ exact decimal unit conversion
  // A finite double is converted through its shortest decimal form with integer (BigInt) arithmetic,
  // so 0.07 m becomes exactly 70 mm and 1.5 in exactly 38.1 mm (the double nearest the true value).
  function decimalOf(v) {
    let s = String(v), neg = false, exp = 0;
    if (s[0] === '-') { neg = true; s = s.slice(1); }
    const e = s.search(/e/i);
    if (e >= 0) { exp = parseInt(s.slice(e + 1), 10); s = s.slice(0, e); }
    const dot = s.indexOf('.');
    if (dot >= 0) { exp -= s.length - dot - 1; s = s.slice(0, dot) + s.slice(dot + 1); }
    return { neg, digits: BigInt(s), exp };
  }
  /** v × mul × 10^exp ÷ div, correctly rounded (to within the 30 guard digits of the division). */
  function exactScale(v, mul, exp, div) {
    if (v === 0) return v;
    const d = decimalOf(v);
    let digits = d.digits * mul, e = d.exp + exp;
    if (div !== undefined && div !== 1n) { digits = (digits * 10n ** 30n) / div; e -= 30; }
    return Number(`${d.neg ? '-' : ''}${digits}e${e}`);
  }
  const LENGTH_UNITS = Object.freeze({
    mm: Object.freeze({ mul: 1n, exp: 0, text: '1 mm = 1 mm' }),
    cm: Object.freeze({ mul: 1n, exp: 1, text: '1 cm = 10 mm (exact)' }),
    m: Object.freeze({ mul: 1n, exp: 3, text: '1 m = 1000 mm (exact)' }),
    in: Object.freeze({ mul: 254n, exp: -1, text: '1 in = 25.4 mm (exact by definition)' }),
  });
  const lengthToMm = (v, u) => exactScale(v, LENGTH_UNITS[u].mul, LENGTH_UNITS[u].exp);
  const perLengthToPerMm = (v, u) => exactScale(v, 1n, -LENGTH_UNITS[u].exp, LENGTH_UNITS[u].mul);
  const half = (v) => exactScale(v, 5n, -1);

  // ------------------------------------------------------------------ field checks
  function checkKeys(issues, obj, path, allowed, explain) {
    for (const k of Object.keys(obj)) {
      if (allowed.includes(k)) continue;
      const p = join(path, k);
      if (explain && own(explain, k)) issues.err(p, explain[k]);
      else issues.err(p, `unknown field: it is not part of version ${FILE_VERSION} of this format (see WING_IMPORT.md); remove it`);
    }
  }
  const unitSuffix = (u) => (u ? ` ${u}` : '');
  /** Number field. o: {optional, nullable, integer, gt, ge, lt, le, nonzero, unit, label}. Returns undefined when invalid. */
  function num(issues, obj, key, path, o = {}) {
    const p = join(path, key), u = unitSuffix(o.unit);
    if (!own(obj, key) || obj[key] === undefined) {
      if (!o.optional) issues.err(p, `is missing${o.label ? ` (${o.label}${o.unit ? `, ${o.unit}` : ''})` : ''}`);
      return undefined;
    }
    const v = obj[key];
    if (v === null && o.nullable) return null;
    if (!isNum(v)) { issues.err(p, `must be a finite number${o.unit ? ` in ${o.unit}` : ''}, not ${describe(v)}`); return undefined; }
    if (o.integer && !Number.isInteger(v)) { issues.err(p, `must be a whole number, not ${fmt(v)}`); return undefined; }
    if (o.gt !== undefined && !(v > o.gt)) { issues.err(p, `must be greater than ${fmt(o.gt)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.ge !== undefined && !(v >= o.ge)) { issues.err(p, `must be at least ${fmt(o.ge)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.lt !== undefined && !(v < o.lt)) { issues.err(p, `must be less than ${fmt(o.lt)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.le !== undefined && !(v <= o.le)) { issues.err(p, `must be at most ${fmt(o.le)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.nonzero && v === 0) { issues.err(p, 'must not be zero'); return undefined; }
    return v;
  }
  function bool(issues, obj, key, path, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, `is missing (true or false${o.label ? `: ${o.label}` : ''})`); return undefined; }
    if (typeof obj[key] !== 'boolean') { issues.err(p, `must be true or false, not ${describe(obj[key])}`); return undefined; }
    return obj[key];
  }
  function choice(issues, obj, key, path, options, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, `is missing (one of ${options.map((q) => JSON.stringify(q)).join(', ')})`); return undefined; }
    const v = obj[key];
    if (typeof v !== 'string' || !options.includes(v)) { issues.err(p, `must be one of ${options.map((q) => JSON.stringify(q)).join(', ')}, not ${describe(v)}`); return undefined; }
    return v;
  }
  function text(issues, obj, key, path, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, 'is missing (text)'); return undefined; }
    const v = obj[key];
    if (v === null && o.nullable) return null;
    if (typeof v !== 'string') { issues.err(p, `must be text, not ${describe(v)}`); return undefined; }
    if (v.length > (o.max || LIMITS.nameChars)) { issues.err(p, `is too long (${v.length} characters; at most ${o.max || LIMITS.nameChars})`); return undefined; }
    if (o.multiline ? CONTROL.test(v) : /[\u0000-\u001f\u007f]/.test(v)) { issues.err(p, `contains control characters${o.multiline ? '' : ' or line breaks'}; use plain text`); return undefined; }
    if (o.nonEmpty && !v.trim()) { issues.err(p, 'must not be empty'); return undefined; }
    return v;
  }
  function objectField(issues, obj, key, path, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, `is missing${o.label ? ` (${o.label})` : ''}`); return undefined; }
    const v = obj[key];
    if (v === null && o.nullable) return null;
    if (!isObj(v)) { issues.err(p, `must be an object${o.label ? ` (${o.label})` : ''}, not ${describe(v)}`); return undefined; }
    return v;
  }

  // ------------------------------------------------------------------ load items (both wings)
  const ITEM_KINDS = Object.freeze(['point', 'distributed', 'elliptic', 'parabolic', 'table', 'schrenk']);
  const ITEM_KEYS = Object.freeze({
    point: ['kind', 'position', 'force', 'fraction', 'label'],
    distributed: ['kind', 'start', 'end', 'qStart', 'qEnd', 'fraction', 'label'],
    elliptic: ['kind', 'start', 'end', 'shape', 'total', 'peak', 'fraction', 'label'],
    parabolic: ['kind', 'start', 'end', 'shape', 'total', 'peak', 'fraction', 'label'],
    table: ['kind', 'points', 'fraction', 'source', 'label'],
    schrenk: ['kind', 'total', 'fraction', 'label'],
  });
  const SHAPES = Object.freeze(['start', 'end', 'middle']);
  const segmentsOf = (it) => (it && it.kind === 'table' && Array.isArray(it.points) ? Math.max(1, it.points.length - 1) : 1);
  const countSegments = (items) => (Array.isArray(items) ? items.reduce((s, it) => s + segmentsOf(it), 0) : 0);

  /**
   * Validated canonical copy of a list of load items, or undefined.
   * ctx: {lo, hi, pointLoOpen, len, line, rangeText, allowSchrenk, maxItems, maxSegments,
   *       toLen(v), toLine(v), convNote}  (toLen/toLine convert file units to engine units).
   */
  function checkItems(issues, raw, path, ctx) {
    if (!Array.isArray(raw)) { issues.err(path, `must be a list of load items, not ${describe(raw)}`); return undefined; }
    if (raw.length > ctx.maxItems) { issues.err(path, `has ${raw.length} load items; at most ${ctx.maxItems} are allowed`); return undefined; }
    const out = [];
    let bad = false;
    raw.forEach((it, i) => {
      const r = checkItem(issues, it, join(path, i), ctx);
      if (r === undefined) bad = true; else out.push(r);
    });
    if (bad) return undefined;
    const segments = countSegments(out);
    if (segments > ctx.maxSegments) {
      issues.err(path, `has ${segments} load segments in total (each item counts 1 and a table counts its rows − 1); at most ${ctx.maxSegments} are allowed`);
      return undefined;
    }
    return out;
  }
  function checkItem(issues, it, p, ctx) {
    if (!isObj(it)) { issues.err(p, `must be an object describing one load, not ${describe(it)}`); return undefined; }
    const kinds = ctx.allowSchrenk ? ITEM_KINDS : ITEM_KINDS.filter((k) => k !== 'schrenk');
    if (it.kind === 'schrenk' && !ctx.allowSchrenk) {
      issues.err(join(p, 'kind'), '"schrenk" load items exist for the printed wing only; the D.520 flight case sets its span loading with "distribution"');
      return undefined;
    }
    if (typeof it.kind !== 'string' || !kinds.includes(it.kind)) {
      issues.err(join(p, 'kind'), `must be one of ${kinds.map((k) => JSON.stringify(k)).join(', ')}, not ${describe(it.kind)}`);
      return undefined;
    }
    const kind = it.kind, n0 = issues.count, L = ctx.len, Q = ctx.line, note = ctx.convNote || '';
    const toLen = ctx.toLen || ((v) => v), toLine = ctx.toLine || ((v) => v);
    checkKeys(issues, it, p, ITEM_KEYS[kind]);
    const fileLen = ctx.fileLen || L, fileLine = ctx.fileLine || Q;
    const station = (key, label) => {
      const v = num(issues, it, key, p, { label, unit: fileLen });
      return v === undefined ? undefined : toLen(v);
    };
    const inRange = (key, v, { open = false } = {}) => {
      if (v === undefined) return;
      const okLo = open ? v > ctx.lo : v >= ctx.lo;
      if (!okLo || !(v <= ctx.hi)) issues.err(join(p, key), `${fmt(v)} ${L}${note} lies outside ${ctx.rangeText(open)}`);
    };
    const fraction = (optional) => num(issues, it, 'fraction', p, { ge: 0, le: 1, optional, label: 'chord fraction x/c measured from the local leading edge, 0–1' });
    const r = { kind };
    if (kind === 'point') {
      r.position = station('position', 'station from the root');
      r.force = num(issues, it, 'force', p, { unit: 'N', label: 'force, upward positive' });
      r.fraction = fraction(false);
      inRange('position', r.position, { open: ctx.pointLoOpen });
    } else if (kind === 'distributed' || kind === 'elliptic' || kind === 'parabolic') {
      r.start = station('start', 'start station');
      r.end = station('end', 'end station');
      inRange('start', r.start);
      inRange('end', r.end);
      if (r.start !== undefined && r.end !== undefined && !(r.end > r.start)) issues.err(join(p, 'end'), `must be greater than start (${fmt(r.start)} → ${fmt(r.end)} ${L}${note})`);
      if (kind === 'distributed') {
        const a = num(issues, it, 'qStart', p, { unit: fileLine, label: 'intensity at the start, upward positive' });
        const b = num(issues, it, 'qEnd', p, { unit: fileLine, label: 'intensity at the end, upward positive' });
        r.qStart = a === undefined ? undefined : toLine(a);
        r.qEnd = b === undefined ? undefined : toLine(b);
      } else {
        r.shape = choice(issues, it, 'shape', p, SHAPES);
        const hasT = own(it, 'total') && it.total !== null && it.total !== undefined;
        const hasP = own(it, 'peak') && it.peak !== null && it.peak !== undefined;
        if (hasT && hasP) issues.err(p, `give either total (N) or peak (${fileLine}), not both`);
        else if (!hasT && !hasP) issues.err(p, `needs either total (N) or peak (${fileLine})`);
        else if (hasT) r.total = num(issues, it, 'total', p, { unit: 'N', label: 'total force' });
        else { const v = num(issues, it, 'peak', p, { unit: fileLine, label: 'peak intensity' }); r.peak = v === undefined ? undefined : toLine(v); }
      }
      r.fraction = fraction(false);
    } else if (kind === 'table') {
      const pts = it.points, pp = join(p, 'points');
      let width = 0;
      if (!own(it, 'points')) issues.err(pp, `is missing (rows [y, w] or [y, w, x/c]; y in ${fileLen}, w in ${fileLine})`);
      else if (!Array.isArray(pts)) issues.err(pp, `must be a list of rows, not ${describe(pts)}`);
      else if (pts.length < LIMITS.tableRowsMin || pts.length > LIMITS.tableRowsMax) issues.err(pp, `must have ${LIMITS.tableRowsMin}–${LIMITS.tableRowsMax} rows (got ${pts.length}); nothing is truncated or resampled`);
      else {
        width = Array.isArray(pts[0]) ? pts[0].length : 0;
        if (width !== 2 && width !== 3) issues.err(join(pp, 0), `each row must be [y, w] or [y, w, x/c], not ${describe(pts[0])}`);
        else {
          const rows = [];
          pts.forEach((row, j) => {
            const rp = join(pp, j);
            if (!Array.isArray(row) || row.length !== width) { issues.err(rp, `must have ${width} numbers like the first row, not ${describe(row)}`); return; }
            const vals = [];
            for (let k = 0; k < width; k++) {
              if (!isNum(row[k])) { issues.err(join(rp, k), `must be a finite number, not ${describe(row[k])}`); return; }
              vals.push(row[k]);
            }
            const y = toLen(vals[0]), w = toLine(vals[1]);
            if (!(y >= ctx.lo && y <= ctx.hi)) issues.err(join(rp, 0), `station ${fmt(y)} ${L}${note} lies outside ${ctx.rangeText(false)}`);
            if (width === 3 && !(vals[2] >= 0 && vals[2] <= 1)) issues.err(join(rp, 2), `x/c must be between 0 and 1 (got ${fmt(vals[2])})`);
            if (rows.length && rows.length === j && !(y > rows[j - 1][0])) issues.err(join(rp, 0), `stations must increase strictly (${fmt(y)} after ${fmt(rows[j - 1][0])} ${L}); a step needs two separate loads`);
            rows.push(width === 3 ? [y, w, vals[2]] : [y, w]);
          });
          r.points = rows;
        }
      }
      if (width === 3) {
        if (own(it, 'fraction')) {
          const f = fraction(true);
          if (f !== undefined) { r.fraction = f; issues.warn(join(p, 'fraction'), 'is not used because every row gives its own x/c'); }
        }
      } else r.fraction = fraction(false);
      if (own(it, 'source')) {
        const sp = join(p, 'source'), s = it.source;
        if (!isObj(s)) issues.err(sp, `must be an object {filename, sha256, rows}, not ${describe(s)}`);
        else {
          checkKeys(issues, s, sp, ['filename', 'sha256', 'rows']);
          const src = {};
          const fn = text(issues, s, 'filename', sp, { optional: true, max: LIMITS.filenameChars });
          if (fn !== undefined) src.filename = fn;
          if (own(s, 'sha256')) {
            if (typeof s.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.sha256)) issues.err(join(sp, 'sha256'), 'must be 64 lower-case hexadecimal characters');
            else src.sha256 = s.sha256;
          }
          const rows = num(issues, s, 'rows', sp, { optional: true, integer: true, ge: 1, label: 'number of data rows in the source file' });
          if (rows !== undefined) {
            src.rows = rows;
            if (Array.isArray(pts) && rows !== pts.length) issues.warn(join(sp, 'rows'), `says ${rows} rows but the table has ${pts.length}`);
          }
          r.source = src;
        }
      }
    } else if (kind === 'schrenk') {
      r.total = num(issues, it, 'total', p, { unit: 'N', label: 'total force over the semi-span' });
      r.fraction = fraction(false);
    }
    const label = text(issues, it, 'label', p, { optional: true, max: LIMITS.labelChars });
    if (label !== undefined) r.label = label;
    if (issues.count > n0) return undefined;
    return r;
  }
  function describeItem(it, u) {
    const at = it.fraction !== undefined ? `, at ${fmt(it.fraction)}c` : '';
    const tag = it.label ? ` — “${it.label}”` : '';
    switch (it.kind) {
      case 'point': return `Point force ${fmt(it.force)} N at y = ${fmt(it.position)} ${u.len}${at}${tag}`;
      case 'distributed': return `Linear line load ${fmt(it.qStart)} → ${fmt(it.qEnd)} ${u.line} over y = ${fmt(it.start)}–${fmt(it.end)} ${u.len}${at}${tag}`;
      case 'elliptic': case 'parabolic':
        return `${it.kind === 'elliptic' ? 'Elliptic' : 'Parabolic'} line load, maximum at the ${it.shape === 'middle' ? 'middle (zero at both ends)' : it.shape}, over y = ${fmt(it.start)}–${fmt(it.end)} ${u.len}; ${it.total !== undefined && it.total !== null ? `total ${fmt(it.total)} N` : `peak ${fmt(it.peak)} ${u.line}`}${at}${tag}`;
      case 'table': {
        const pts = it.points, rows = pts.length;
        const where = pts[0].length === 3 ? ', x/c given per row' : at;
        const src = it.source && (it.source.filename || it.source.sha256) ? `; source ${it.source.filename || 'file'}${it.source.sha256 ? ` (SHA-256 ${it.source.sha256.slice(0, 12)}…)` : ''}` : '';
        return `Tabulated line load, ${rows} rows (${rows - 1} segments) over y = ${fmt(pts[0][0])}–${fmt(pts[rows - 1][0])} ${u.len}, ${u.line}${where}${src}${tag}`;
      }
      case 'schrenk': return `Schrenk distribution over the whole semi-span, total ${fmt(it.total)} N${at}${tag}`;
      default: return String(it.kind);
    }
  }
  // Export-side canonical copy of a UI load item (only the fields of its kind; engine-equivalent values).
  function canonicalItemFromUi(it, printed) {
    if (!isObj(it)) return it;
    const r = {};
    const keys = own(ITEM_KEYS, it.kind) ? ITEM_KEYS[it.kind] : Object.keys(it);
    for (const k of keys) if (own(it, k) && it[k] !== undefined) r[k] = clone(it[k]);
    // The printed engine reads a missing point/distributed chord fraction as 0.3c.
    if (printed && (it.kind === 'point' || it.kind === 'distributed') && (it.fraction === undefined || it.fraction === null)) r.fraction = 0.3;
    if (it.kind === 'elliptic' || it.kind === 'parabolic') {
      // A normalised curve may carry both values plus the basis it was entered with: keep the basis only.
      if (it.basis === 'total' || it.basis === 'peak') delete r[it.basis === 'total' ? 'peak' : 'total'];
      for (const k of ['total', 'peak']) if (r[k] === null) delete r[k];
    }
    if (it.kind === 'table' && (r.fraction === null || r.fraction === undefined)) delete r.fraction;
    if (r.label === null || r.label === '') delete r.label;
    return r;
  }

  // ------------------------------------------------------------------ engine support probes
  // An engine that predates a load kind rejects it. Probing once per engine and kind tells "this page's
  // engine cannot analyse this kind yet" apart from a physics error in an item it can analyse.
  const probeCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  const PRINTED_PROBES = {
    point: (L) => ({ kind: 'point', position: L, force: 1, fraction: 0.3 }),
    distributed: (L) => ({ kind: 'distributed', start: 0, end: L, qStart: 0.001, qEnd: 0.001, fraction: 0.3 }),
    elliptic: (L) => ({ kind: 'elliptic', start: 0, end: L, shape: 'start', total: 1, fraction: 0.3 }),
    parabolic: (L) => ({ kind: 'parabolic', start: 0, end: L, shape: 'start', total: 1, fraction: 0.3 }),
    table: (L) => ({ kind: 'table', points: [[0, 0.001], [L, 0.001]], fraction: 0.3 }),
    schrenk: () => ({ kind: 'schrenk', total: 1, fraction: 0.3 }),
  };
  const D520_PROBES = {
    point: (a, b) => ({ kind: 'point', position: b, force: 1, fraction: 0.25 }),
    distributed: (a, b) => ({ kind: 'distributed', start: a, end: b, qStart: 1, qEnd: 1, fraction: 0.25 }),
    elliptic: (a, b) => ({ kind: 'elliptic', start: a, end: b, shape: 'start', total: 1, fraction: 0.25 }),
    parabolic: (a, b) => ({ kind: 'parabolic', start: a, end: b, shape: 'start', total: 1, fraction: 0.25 }),
    table: (a, b) => ({ kind: 'table', points: [[a, 1], [b, 1]], fraction: 0.25 }),
  };
  function engineSupports(engine, workspace, kind) {
    let memo = probeCache ? probeCache.get(engine) : null;
    if (!memo) { memo = new Map(); if (probeCache) probeCache.set(engine, memo); }
    const key = `${workspace}:${kind}`;
    if (!memo.has(key)) {
      let ok = false;
      try {
        if (workspace === 'printed') {
          const L = engine.DEFAULT_GEOMETRY.semiSpan;
          engine.normalize({ load: { ...engine.DEFAULT_LOAD, kind: 'custom', items: [PRINTED_PROBES[kind](L)] } });
        } else {
          const P = engine.D520, a = P.fittingY, b = P.ribs[P.ribs.length - 1];
          engine.normalise({ n: 1, customLoads: [D520_PROBES[kind](a, b)] });
        }
        ok = true;
      } catch (e) { ok = false; }
      memo.set(key, ok);
    }
    return memo.get(key);
  }
  const engineMessage = (e, name) => `${e && e.message ? e.message : String(e)} (${name} check)`;
  function pathFor(rules, base, message) {
    for (const [re, rel] of rules) {
      const m = re.exec(message);
      if (m) return String(typeof rel === 'function' ? rel(m) : rel).split('.').reduce(join, base);
    }
    return base;
  }
  const PRINTED_RULES = [
    [/four-digit NACA|camber position|Airfoil thickness/i, 'geometry.naca'],
    [/Rod positions/i, 'geometry.rodFractions'],
    [/Tip chord/i, 'geometry.tipChord'],
    [/\bmodules\b/i, 'geometry.modules'],
    [/Interface rib offset/i, 'geometry.interfaceOffset'],
    [/clearance/i, 'geometry.clearance'],
    [/requested interior ribs/i, 'geometry.interiorRibs'],
    [/interior ribs/i, 'geometry.customInteriorRibs'],
    [/^(\w+) must be positive/, (m) => `geometry.${m[1]}`],
    [/disconnects the wing/i, 'geometry.rodFractions'],
    [/load|station|span/i, 'load'],
  ];
  const D520_RULES = [
    [/span-loading distribution/i, 'distribution'], [/support condition/i, 'support'], [/Aircraft mass/i, 'mass'],
    [/Reference CL/i, 'CL'], [/Scale factor for (\w+)/i, (m) => `scales.${m[1]}`], [/Load factor/i, 'n'],
    [/custom loads|load type|Point station|Distributed bounds|chord fraction/i, 'customLoads'],
    [/material|Poisson|ultimate|rupture/i, 'material'],
  ];

  // ------------------------------------------------------------------ printed wing: schema
  const GEOMETRY_V1 = Object.freeze(['naca', 'semiSpan', 'rootChord', 'tipChord', 'skin', 'ribThickness', 'modules', 'te', 'interiorRibs',
    'customInteriorRibs', 'interfaceOffset', 'cap', 'cavityStart', 'cavityEnd', 'rodFractions', 'rodDiameter', 'clearance', 'sleeveWall']);
  const GEOMETRY_V2 = Object.freeze(['planform','airfoil','sweepDeg','dihedralDeg','sweepReferenceFraction','twistReferenceFraction','twistEnabled','stations']);
  const hasAdvancedGeometry = (g) => GEOMETRY_V2.some(k => own(g,k) && g[k] != null);
  function checkAirfoil(issues,p,path){
    if(!isObj(p)){issues.err(path,'must be an airfoil profile object');return;}
    const analytic=p.kind==='naca4'||p.kind==='naca5';
    checkKeys(issues,p,path,analytic?['kind','code']:['kind','version','name','upper','lower','source']);
    if(!analytic&&p.kind!=='coordinates'){issues.err(join(path,'kind'),'use naca4, naca5 or coordinates');return;}
    if(analytic){if(typeof p.code!=='string')issues.err(join(path,'code'),'must be an airfoil code as text');return;}
    if(p.version!=null&&p.version!==1)issues.err(join(path,'version'),'coordinate profile version must be 1');
    if(p.name!=null)text(issues,p,'name',path,{max:80});
    for(const key of ['upper','lower']){
      const rows=p[key],rp=join(path,key);
      if(!Array.isArray(rows)||rows.length<3||rows.length>256){issues.err(rp,'must contain 3–256 normalized [x/c,z/c] points');continue;}
      rows.forEach((row,i)=>{if(!Array.isArray(row)||row.length!==2||row.some(x=>!isNum(x)))issues.err(join(rp,i),'must be exactly two finite coordinates');});
    }
    if(p.source!=null){
      if(!isObj(p.source)){issues.err(join(path,'source'),'must be provenance metadata');return;}
      checkKeys(issues,p.source,join(path,'source'),['format','filename','normalization','url','family']);
      for(const k of Object.keys(p.source))text(issues,p.source,k,join(path,'source'),{max:k==='url'?1024:180});
      if(p.source.normalization!=null&&p.source.normalization!=='unit-chord')issues.err(join(path,'source.normalization'),'only unit-chord coordinates are supported');
    }
  }
  const POSITIVE_MM = Object.freeze({
    semiSpan: 'semi-span', rootChord: 'root chord', tipChord: 'tip chord', skin: 'skin thickness, measured vertically',
    ribThickness: 'rib thickness', te: 'trailing-edge thickness', cap: 'root and tip cap thickness',
    interfaceOffset: 'interface rib offset from a seam', rodDiameter: 'rod diameter', sleeveWall: 'printed sleeve wall',
  });
  const ASSEMBLY_V1 = Object.freeze(['rodsBonded', 'seamsBonded', 'seamFreeLength', 'adhesiveTensile']);
  const CRITERIA_V1 = Object.freeze(['maxTipDeflection', 'maxTipTwist']);
  const PRINTED_LOAD_KEYS = Object.freeze({
    flight: ['aircraftMass', 'loadFactor', 'distribution', 'liftFraction', 'inertiaRelief', 'tipFraction', 'fos', 'tipMass', 'selfWeight'],
    tip: ['tipForce', 'tipFraction', 'fos', 'tipMass', 'selfWeight'],
    custom: ['items', 'fos', 'tipMass', 'selfWeight'],
  });
  const FLIGHT_DISTRIBUTIONS = Object.freeze(['schrenk', 'elliptic', 'planform', 'uniform', 'tip']);

  // Fields of the engine defaults that this version does not know are carried through by type.
  function extraField(issues, raw, key, path, dflt) {
    const p = join(path, key);
    if (!own(raw, key) || raw[key] === undefined) {
      issues.warn(p, `is not in the file; the engine default ${JSON.stringify(dflt)} is used`);
      return clone(dflt);
    }
    const v = raw[key];
    const kind = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
    if (typeof dflt === 'number' ? !isNum(v) : dflt !== null && kind(v) !== kind(dflt)) { issues.err(p, `must have the same type as the engine default (${kind(dflt)}), not ${describe(v)}`); return undefined; }
    return clone(v);
  }

  function checkPrintedGeometry(issues, raw, path, E) {
    if (!isObj(raw)) { issues.err(path, `must be an object with the wing geometry, not ${describe(raw)}`); return undefined; }
    const extras = Object.keys(E.DEFAULT_GEOMETRY).filter((k) => !GEOMETRY_V1.includes(k));
    checkKeys(issues, raw, path, [...GEOMETRY_V1, ...extras,...GEOMETRY_V2]);
    const n0 = issues.count, g = {};
    if (!own(raw, 'naca')) issues.err(join(path, 'naca'), 'is missing (four digits of a NACA 4-digit section, such as "2412")');
    else if (typeof raw.naca !== 'string' || !/^\d{4}$/.test(raw.naca)) issues.err(join(path, 'naca'), `must be the four digits of a NACA 4-digit section as text, such as "2412", not ${describe(raw.naca)}`);
    else { try { g.naca = E.normalizeNaca(raw.naca); } catch (e) { issues.err(join(path, 'naca'), engineMessage(e, 'WingEngine')); } }
    for (const [k, label] of Object.entries(POSITIVE_MM)) g[k] = num(issues, raw, k, path, { gt: 0, unit: 'mm', label });
    g.modules = num(issues, raw, 'modules', path, { integer: true, ge: 1, le: 3, label: 'number of printed modules' });
    g.interiorRibs = num(issues, raw, 'interiorRibs', path, { integer: true, ge: 0, le: 16, label: 'requested evenly spaced interior ribs' });
    const rp = join(path, 'customInteriorRibs');
    if (!own(raw, 'customInteriorRibs')) issues.err(rp, 'is missing (null, or a list of interior rib stations in mm)');
    else if (raw.customInteriorRibs === null) g.customInteriorRibs = null;
    else if (!Array.isArray(raw.customInteriorRibs)) issues.err(rp, `must be null or a list of rib stations in mm, not ${describe(raw.customInteriorRibs)}`);
    else if (raw.customInteriorRibs.length > LIMITS.ribs) issues.err(rp, `has ${raw.customInteriorRibs.length} stations; at most ${LIMITS.ribs} interior ribs are allowed`);
    else {
      const ribs = [];
      raw.customInteriorRibs.forEach((v, i) => {
        if (!isNum(v)) { issues.err(join(rp, i), `must be a finite number in mm, not ${describe(v)}`); return; }
        if (ribs.length === i && i && !(v > ribs[i - 1])) issues.err(join(rp, i), `rib stations must be listed in strictly increasing order (${fmt(v)} after ${fmt(ribs[i - 1])} mm)`);
        ribs.push(v);
      });
      g.customInteriorRibs = ribs;
    }
    g.cavityStart = num(issues, raw, 'cavityStart', path, { gt: 0, lt: 1, label: 'start of the hollow cavity, x/c' });
    g.cavityEnd = num(issues, raw, 'cavityEnd', path, { gt: 0, lt: 1, label: 'end of the hollow cavity, x/c' });
    if (isNum(g.cavityStart) && isNum(g.cavityEnd) && !(g.cavityEnd > g.cavityStart)) issues.err(join(path, 'cavityEnd'), `must be greater than cavityStart (${fmt(g.cavityStart)} → ${fmt(g.cavityEnd)})`);
    const fp = join(path, 'rodFractions');
    if (!own(raw, 'rodFractions')) issues.err(fp, 'is missing (list of rod positions x/c; an empty list means no rods)');
    else if (!Array.isArray(raw.rodFractions)) issues.err(fp, `must be a list of rod positions x/c, not ${describe(raw.rodFractions)}`);
    else if (raw.rodFractions.length > LIMITS.rods) issues.err(fp, `lists ${raw.rodFractions.length} rods; at most ${LIMITS.rods} are allowed`);
    else {
      const fr = [];
      raw.rodFractions.forEach((v, i) => {
        if (!isNum(v)) issues.err(join(fp, i), `must be a finite number (x/c), not ${describe(v)}`);
        else if (!(v > 0 && v < 1)) issues.err(join(fp, i), `must lie strictly between 0 and 1 (got ${fmt(v)})`);
        fr.push(v);
      });
      g.rodFractions = fr;
    }
    g.clearance = num(issues, raw, 'clearance', path, { ge: 0, le: 0.8, unit: 'mm', label: 'radial rod clearance' });
    if (isNum(g.tipChord) && isNum(g.rootChord) && g.tipChord > g.rootChord) issues.err(join(path, 'tipChord'), `cannot exceed the root chord (${fmt(g.tipChord)} mm > ${fmt(g.rootChord)} mm): only linear taper with tip ≤ root is analysed`);
    for (const k of extras) g[k] = extraField(issues, raw, k, path, E.DEFAULT_GEOMETRY[k]);
    for(const k of GEOMETRY_V2)if(own(raw,k)){
      if(raw[k]===null){issues.err(join(path,k),'omit optional geometry fields instead of null');continue;}
      g[k]=clone(raw[k]);
    }
    if(g.airfoil)checkAirfoil(issues,g.airfoil,join(path,'airfoil'));
    if(own(g,'stations')){
      if(!Array.isArray(g.stations)||g.stations.length<2||g.stations.length>9)issues.err(join(path,'stations'),'use 2–9 root-to-tip airfoil stations');
      else g.stations.forEach((s,i)=>{const sp=join(join(path,'stations'),i);if(!isObj(s)){issues.err(sp,'must be a station object');return;}checkKeys(issues,s,sp,['eta','airfoil','incidenceDeg']);checkAirfoil(issues,s.airfoil,join(sp,'airfoil'));});
    }
    if (issues.count > n0) return undefined;
    const out = {};
    for (const k of Object.keys(E.DEFAULT_GEOMETRY)) out[k] = g[k];
    for (const k of GEOMETRY_V1) if (!own(out, k)) out[k] = g[k];
    for(const k of GEOMETRY_V2)if(own(g,k))out[k]=g[k];
    return out;
  }
  function checkMaterials(issues, raw, path, E) {
    if (!isObj(raw)) { issues.err(path, `must be an object {plaKey, plaOver, rodKey, rodOver}, not ${describe(raw)}`); return undefined; }
    checkKeys(issues, raw, path, ['plaKey', 'plaOver', 'rodKey', 'rodOver']);
    const n0 = issues.count;
    const keysOf = (kind) => Object.keys(E.MATERIALS).filter((k) => E.MATERIALS[k] && E.MATERIALS[k].kind === kind);
    const card = (key, kind) => {
      const v = choice(issues, raw, key, path, keysOf(kind));
      return v;
    };
    const over = (key, fields) => {
      const p = join(path, key), o = raw[key], out = {};
      if (!own(raw, key)) { issues.err(p, `is missing (an object of overrides; null keeps the card value)`); return undefined; }
      if (!isObj(o)) { issues.err(p, `must be an object of overrides, not ${describe(o)}`); return undefined; }
      checkKeys(issues, o, p, fields);
      for (const f of fields) {
        if (!own(o, f) || o[f] === null) { out[f] = null; continue; }
        out[f] = num(issues, o, f, p, { ...(f==='nu'?{ge:0,lt:.5}:{gt:0}), unit:f==='nu'?'dimensionless':f==='rho'?'g/cm³':'MPa', label: 'override (null keeps the card value)' });
      }
      return out;
    };
    const m = { plaKey: card('plaKey', 'pla'), plaOver: over('plaOver', ['E', 'ft', 'fc', 'fs','rho','nu']), rodKey: card('rodKey', 'rod'), rodOver: over('rodOver', ['E']) };
    return issues.count > n0 ? undefined : m;
  }
  function checkAssembly(issues, raw, path, E) {
    if (!isObj(raw)) { issues.err(path, `must be an object with the joints, not ${describe(raw)}`); return undefined; }
    const extras = Object.keys(E.DEFAULT_ASSEMBLY || {}).filter((k) => !ASSEMBLY_V1.includes(k));
    checkKeys(issues, raw, path, [...ASSEMBLY_V1, ...extras]);
    const n0 = issues.count;
    const a = {
      rodsBonded: bool(issues, raw, 'rodsBonded', path, { label: 'rods epoxied into their sleeves' }),
      seamsBonded: bool(issues, raw, 'seamsBonded', path, { label: 'module seams epoxied' }),
      seamFreeLength: num(issues, raw, 'seamFreeLength', path, { nullable: true, gt: 0, unit: 'mm', label: 'rod free length at a dry seam; null means 2 × interface offset' }),
      adhesiveTensile: num(issues, raw, 'adhesiveTensile', path, { gt: 0, unit: 'MPa', label: 'epoxy butt-joint strength' }),
    };
    for (const k of extras) a[k] = extraField(issues, raw, k, path, E.DEFAULT_ASSEMBLY[k]);
    return issues.count > n0 ? undefined : a;
  }
  function checkCriteria(issues, raw, path, E, conv) {
    if (!isObj(raw)) { issues.err(path, `must be an object {maxTipDeflection, maxTipTwist}, not ${describe(raw)}`); return undefined; }
    const extras = Object.keys(E.DEFAULT_CRITERIA || {}).filter((k) => !CRITERIA_V1.includes(k));
    checkKeys(issues, raw, path, [...CRITERIA_V1, ...extras]);
    const n0 = issues.count;
    const d = num(issues, raw, 'maxTipDeflection', path, { gt: 0, unit: conv ? conv.fileLen : 'mm', label: 'allowed tip deflection' });
    const c = {
      maxTipDeflection: d === undefined ? undefined : conv ? conv.toLen(d) : d,
      maxTipTwist: num(issues, raw, 'maxTipTwist', path, { gt: 0, unit: 'deg', label: 'allowed tip twist' }),
    };
    for (const k of extras) c[k] = extraField(issues, raw, k, path, E.DEFAULT_CRITERIA[k]);
    return issues.count > n0 ? undefined : c;
  }
  /** conv (design-parameter files only): {fileLen, fileLine, toLen, toLine, note}. */
  function checkPrintedLoad(issues, raw, path, semiSpan, E, conv) {
    if (!isObj(raw)) { issues.err(path, `must be an object describing the load case, not ${describe(raw)}`); return undefined; }
    const kind = choice(issues, raw, 'kind', path, ['flight', 'tip', 'custom']);
    if (kind === undefined) return undefined;
    const n0 = issues.count;
    const allowed = ['kind', 'name', ...PRINTED_LOAD_KEYS[kind]];
    for (const k of Object.keys(raw)) {
      if (allowed.includes(k)) continue;
      const other = Object.keys(PRINTED_LOAD_KEYS).find((q) => PRINTED_LOAD_KEYS[q].includes(k));
      if (other) issues.warn(join(path, k), `ignored: it belongs to the "${other}" load case, not to "${kind}"`);
      else issues.err(join(path, k), `unknown field: it is not part of version ${FILE_VERSION} of this format (see WING_IMPORT.md); remove it`);
    }
    const L = { kind };
    L.selfWeight=own(raw,'selfWeight')?bool(issues,raw,'selfWeight',path,{label:'include 1-g wing self-weight'}):false;
    const fos = () => {
      const v = num(issues, raw, 'fos', path, { gt: 0, label: 'factor of safety on strength and buckling' });
      if (v !== undefined && v < 1) issues.warn(join(path, 'fos'), `a factor of safety of ${fmt(v)} is below 1`);
      return v;
    };
    const tipMass = () => num(issues, raw, 'tipMass', path, { ge: 0, unit: 'g', label: 'tip sensor mass' });
    if (kind === 'flight') {
      L.aircraftMass = num(issues, raw, 'aircraftMass', path, { gt: 0, unit: 'kg', label: 'aircraft mass' });
      L.loadFactor = num(issues, raw, 'loadFactor', path, { label: 'load factor n (lift / weight)' });
      L.distribution = choice(issues, raw, 'distribution', path, FLIGHT_DISTRIBUTIONS);
      L.liftFraction = num(issues, raw, 'liftFraction', path, { ge: 0, le: 1, label: 'chord fraction where the lift acts' });
      L.inertiaRelief = bool(issues, raw, 'inertiaRelief', path, { label: 'subtract the wing weight at n g' });
      if (own(raw, 'tipFraction')) L.tipFraction = num(issues, raw, 'tipFraction', path, { ge: 0, le: 1, label: 'chord fraction of the tip mass' });
      else {
        L.tipFraction = E.DEFAULT_LOAD.tipFraction;
        if (raw.tipMass > 0 && raw.inertiaRelief === true) issues.warn(join(path, 'tipFraction'), `is not given; the tip mass acts at the engine default ${fmt(L.tipFraction)}c`);
      }
      L.fos = fos(); L.tipMass = tipMass();
    } else if (kind === 'tip') {
      L.tipForce = num(issues, raw, 'tipForce', path, { unit: 'N', label: 'tip force, upward positive' });
      L.tipFraction = num(issues, raw, 'tipFraction', path, { ge: 0, le: 1, label: 'chord fraction of the tip force' });
      L.fos = fos(); L.tipMass = tipMass();
    } else {
      const ip = join(path, 'items');
      if (!own(raw, 'items')) issues.err(ip, 'is missing (a list of load items; an empty list means no load is defined yet)');
      else if (isNum(semiSpan)) {
        L.items = checkItems(issues, raw.items, ip, {
          lo: 0, hi: semiSpan, pointLoOpen: true, len: 'mm', line: 'N/mm', allowSchrenk: true,
          maxItems: LIMITS.printedItems, maxSegments: LIMITS.printedSegments,
          rangeText: (open) => `${open ? '0 < y' : '0 ≤ y'} ≤ semi-span ${fmt(semiSpan)} mm`,
          fileLen: conv ? conv.fileLen : 'mm', fileLine: conv ? conv.fileLine : 'N/mm',
          toLen: conv ? conv.toLen : undefined, toLine: conv ? conv.toLine : undefined, convNote: conv ? conv.note : '',
        });
      }
      L.fos = fos(); L.tipMass = tipMass();
    }
    const name = text(issues, raw, 'name', path, { optional: true, max: LIMITS.nameChars });
    if (name !== undefined) L.name = name;
    return issues.count > n0 ? undefined : L;
  }
  function checkPrintedStudy(issues, raw, path, E) {
    if (!isObj(raw)) { issues.err(path, `must be an object {geometry, materials, assembly, load, criteria}, not ${describe(raw)}`); return undefined; }
    checkKeys(issues, raw, path, ['geometry', 'materials', 'assembly', 'load', 'criteria', 'analysis']);
    let analysis;
    if(own(raw,'analysis')){
      if(!isObj(raw.analysis))issues.err(join(path,'analysis'),'must be an object {nElements}');
      else{
        checkKeys(issues,raw.analysis,join(path,'analysis'),['nElements']);
        const n=raw.analysis.nElements;
        if(!Number.isInteger(n)||n<4||n>100)issues.err(join(path,'analysis.nElements'),'must be an integer from 4 to 100');
        else analysis={nElements:n};
      }
    }
    const need = (k) => { if (!own(raw, k)) issues.err(join(path, k), 'is missing'); return own(raw, k); };
    const geometry = need('geometry') ? checkPrintedGeometry(issues, raw.geometry, join(path, 'geometry'), E) : undefined;
    const materials = need('materials') ? checkMaterials(issues, raw.materials, join(path, 'materials'), E) : undefined;
    const assembly = need('assembly') ? checkAssembly(issues, raw.assembly, join(path, 'assembly'), E) : undefined;
    const load = need('load') ? checkPrintedLoad(issues, raw.load, join(path, 'load'), geometry ? geometry.semiSpan : undefined, E) : undefined;
    const criteria = need('criteria') ? checkCriteria(issues, raw.criteria, join(path, 'criteria'), E) : undefined;
    if ([geometry, materials, assembly, load, criteria].includes(undefined)) return undefined;
    return { geometry, materials, assembly, load, criteria, ...(analysis?{analysis}:{}) };
  }
  // State handed to applyState: the UI's own field names.
  const printedState = (s) => ({
    projectName: '', emptyStudy: false,
    geometry: clone(s.geometry), plaKey: s.materials.plaKey, plaOver: clone(s.materials.plaOver), rodKey: s.materials.rodKey,
    rodOver: clone(s.materials.rodOver), assembly: clone(s.assembly), load: clone(s.load), criteria: clone(s.criteria), analysis:s.analysis?clone(s.analysis):null,
  });
  const printedStudyOf = (st) => ({
    geometry: clone(st.geometry), materials: { plaKey: st.plaKey, plaOver: clone(st.plaOver), rodKey: st.rodKey, rodOver: clone(st.rodOver) },
    assembly: clone(st.assembly), load: clone(st.load), criteria: clone(st.criteria), ...(st.analysis?{analysis:clone(st.analysis)}:{}),
  });
  /** Engine input for a printed state, exactly as the Wing Lab page builds it (card values unless an override is > 0). */
  function printedEngineInput(state, engine) {
    const E = engine || globalWing();
    const pla = { ...E.MATERIALS[state.plaKey] };
    for (const k of ['E', 'ft', 'fc', 'fs','rho']) if (state.plaOver && state.plaOver[k] > 0) pla[k] = state.plaOver[k];
    if(state.plaOver&&state.plaOver.nu!=null)pla.nu=state.plaOver.nu;
    const rod = { ...E.MATERIALS[state.rodKey] };
    if (state.rodOver && state.rodOver.E > 0) rod.E = state.rodOver.E;
    return { geometry: clone(state.geometry), pla, rod, assembly: clone(state.assembly), load: clone(state.load), criteria: clone(state.criteria), ...(state.analysis?{nElements:state.analysis.nElements}:{}) };
  }
  /** Rod holes must fit inside the airfoil and printed sleeves must not overlap (checked at the tip, the smallest chord). */
  function rodLayoutIssues(g, E) {
    const out = [], c = g.tipChord, rh = E.holeRadius(g), Rs = E.sleeveRadius(g);
    const centres = E.rodCentres(g,g.semiSpan),profile=E.airfoilAt?E.airfoilAt(g,g.semiSpan):g.naca;
    g.rodFractions.forEach((f, i) => {
      const v = E.verticalOrdinates(profile, f, c, g.te), depth = v.upper - v.lower;
      if (depth < 2 * rh) out.push({ index: i, message: `the rod hole (⌀${fmt(+(2 * rh).toFixed(4))} mm with clearance) does not fit inside the airfoil at x/c = ${fmt(f)}: the tip section is only ${fmt(+depth.toFixed(3))} mm deep there (tip chord ${fmt(c)} mm)` });
    });
    for (let i = 0; i < centres.length; i++)
      for (let j = i + 1; j < centres.length; j++) {
        const d = Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1]);
        if (d < 2 * Rs) out.push({ index: j, message: `the printed sleeves of the rods at x/c = ${fmt(g.rodFractions[i])} and ${fmt(g.rodFractions[j])} overlap at the tip chord (centres ${fmt(+d.toFixed(3))} mm apart; two sleeves need ${fmt(+(2 * Rs).toFixed(3))} mm)` });
      }
    return out;
  }
  /** Engine checks of a validated printed state. Never solves. Returns false on an error. */
  function printedEngineChecks(issues, state, path, E) {
    const n0 = issues.count, gp = join(path, 'geometry');
    let g;
    try { g = E.makeGeometry(clone(state.geometry)); }
    catch (e) { issues.err(pathFor(PRINTED_RULES, path, e.message), engineMessage(e, 'WingEngine')); return false; }
    for (const r of rodLayoutIssues(g, E)) issues.err(join(join(gp, 'rodFractions'), r.index), r.message);
    const load = state.load;
    let items = null;
    if (load.kind === 'custom') {
      const unsupported = [...new Set(load.items.map((it) => it.kind))].filter((k) => !engineSupports(E, 'printed', k));
      if (unsupported.length) issues.warn(join(join(path, 'load'), 'items'), `this page's WingEngine ${E.VERSION} cannot analyse ${unsupported.map((k) => `"${k}"`).join(', ')} load items yet: their structure, units and span bounds were checked here, the engine check was not possible, and the solver will report an error if it cannot use them`);
      items = load.items.map((it, i) => ({ it, i })).filter((q) => !unsupported.includes(q.it.kind));
    }
    // 1. geometry and joints with a neutral load
    const neutral = { ...state, load: { ...E.DEFAULT_LOAD, kind: 'tip', tipForce: 0, tipFraction: 0.3, fos: load.fos, tipMass: load.tipMass } };
    let n;
    try { n = E.normalize(printedEngineInput(neutral, E)); }
    catch (e) { issues.err(pathFor(PRINTED_RULES, path, e.message), engineMessage(e, 'WingEngine')); return false; }
    // 2. the solver's own section builder at its analysis stations (cavity collapse and similar)
    for (const y of n.ySec) {
      try { E.ringLoops(n.g, y); }
      catch (e) { issues.err(join(gp, 'skin'), `${e.message} (WingEngine section at y = ${fmt(+y.toFixed(3))} mm)`); return false; }
    }
    if (issues.count > n0) return false;
    // 3. the load case: each item alone, then all together
    const tryLoad = (l, p) => {
      try { E.normalize(printedEngineInput({ ...state, load: l }, E)); return true; }
      catch (e) { issues.err(p, engineMessage(e, 'WingEngine')); return false; }
    };
    if (items) {
      let ok = true;
      for (const { it, i } of items) ok = tryLoad({ ...load, items: [it] }, join(join(join(path, 'load'), 'items'), i)) && ok;
      if (ok && items.length > 1) tryLoad({ ...load, items: items.map((q) => q.it) }, join(join(path, 'load'), 'items'));
    } else tryLoad(load, join(path, 'load'));
    return issues.count === n0;
  }
  function canonicalPrintedFromUi(S, E) {
    if (!isObj(S)) throw new Error('There is no printed-wing study state to save.');
    const pick = (src, defaults) => {
      const out = {}, s = isObj(src) ? src : {};
      for (const k of Object.keys(defaults)) out[k] = clone(own(s, k) && s[k] !== undefined ? s[k] : defaults[k]);
      return out;
    };
    const geometry = pick(S.geometry, E.DEFAULT_GEOMETRY);
    for(const k of GEOMETRY_V2)if(own(S.geometry,k)&&S.geometry[k]!=null)geometry[k]=clone(S.geometry[k]);
    // The engine sorts custom rib stations; the file stores them in that (canonical) order.
    if (Array.isArray(geometry.customInteriorRibs) && geometry.customInteriorRibs.every(isNum)) geometry.customInteriorRibs.sort((a, b) => a - b);
    const over = (o, keys) => Object.fromEntries(keys.map((k) => [k, isObj(o) && isNum(o[k]) && (k==='nu'?o[k]>=0:o[k]>0) ? o[k] : null]));
    const l = { ...E.DEFAULT_LOAD, ...(isObj(S.load) ? S.load : {}) };
    const load = { kind: l.kind };
    if (own(PRINTED_LOAD_KEYS, l.kind)) for (const k of PRINTED_LOAD_KEYS[l.kind]) {if(k==='selfWeight'&&!l.selfWeight)continue;load[k] = k === 'items' ? (Array.isArray(l.items) ? l.items.map((it) => canonicalItemFromUi(it, true)) : clone(l.items)) : clone(l[k]);}
    return {
      geometry,
      materials: { plaKey: S.plaKey, plaOver: over(S.plaOver, ['E', 'ft', 'fc', 'fs','rho','nu']), rodKey: S.rodKey, rodOver: over(S.rodOver, ['E']) },
      assembly: pick(S.assembly, E.DEFAULT_ASSEMBLY), load, criteria: pick(S.criteria, E.DEFAULT_CRITERIA), ...(S.analysis?{analysis:clone(S.analysis)}:{}),
    };
  }
  function printedRows(state, E) {
    const g = state.geometry, rows = [], add = (group, label, value) => rows.push({ group, label, value });
    const profileName=p=>p?(p.name||`NACA ${p.code}`):`NACA ${g.naca}`;
    add('Geometry', 'Airfoil', g.stations?'Spanwise airfoil stations (listed below)':profileName(g.airfoil));
    add('Geometry', 'Semi-span', `${fmt(g.semiSpan)} mm`);
    add('Geometry', 'Root / tip chord', `${fmt(g.rootChord)} / ${fmt(g.tipChord)} mm (${g.planform||'linear'} reference-chord planform)`);
    if(hasAdvancedGeometry(g)){
      add('Geometry','Sweep / dihedral',`${fmt(g.sweepDeg||0)}° at ${fmt(g.sweepReferenceFraction??0)}c / ${fmt(g.dihedralDeg||0)}°; projected span y, x aft, z up`);
      add('Geometry','Geometric twist',`${g.twistEnabled?'enabled':'off'}; absolute incidence, positive LE-up, pivot ${fmt(g.twistReferenceFraction??.25)}c`);
      for(const [i,s]of (g.stations||[]).entries())add('Geometry',`Station ${i+1}`,`eta ${fmt(s.eta)}, y ${fmt(s.eta*g.semiSpan)} mm · ${profileName(s.airfoil)} · incidence ${fmt(s.incidenceDeg)}°`);
    }
    add('Structure', 'Modules', g.modules === 1 ? '1 (one piece, no seams)' : `${g.modules} (seams at ${E.seams(E.makeGeometry(clone(g))).map((v) => fmt(+v.toFixed(3))).join(', ')} mm)`);
    add('Structure', 'Skin / rib thickness', `${fmt(g.skin)} / ${fmt(g.ribThickness)} mm`);
    add('Structure', 'Interior ribs', g.customInteriorRibs ? (g.customInteriorRibs.length ? `custom stations ${g.customInteriorRibs.map(fmt).join(', ')} mm` : 'none (empty custom list)') : `${g.interiorRibs} requested, evenly spaced (interface ribs are added at seams)`);
    add('Structure', 'Rods', g.rodFractions.length ? `${g.rodFractions.length} × ⌀${fmt(g.rodDiameter)} mm at ${g.rodFractions.map((f) => `${fmt(f)}c`).join(', ')}; radial clearance ${fmt(g.clearance)} mm; sleeve wall ${fmt(g.sleeveWall)} mm` : 'none');
    for(const [i,s]of (g.spars||[]).entries())add('Structure',`Bonded spar ${i+1}`,`x/c ${fmt(s.fraction)}; root-to-end ${fmt(s.length)} mm; upper cap ${fmt(s.topWidth)} × ${fmt(s.topThickness)} mm; lower cap ${fmt(s.bottomWidth)} × ${fmt(s.bottomThickness)} mm; web ${fmt(s.webThickness)} mm, skin-derived height; ${s.material.name}, E ${fmt(s.material.E)} MPa, nu ${fmt(s.material.nu)}, rho ${fmt(s.material.rho)} g/cm³, ft/fc/fs ${fmt(s.material.ft)}/${fmt(s.material.fc)}/${fmt(s.material.fs)} MPa; perfect bond, thin-wall model`);
    add('Structure', 'Other', `trailing edge ${fmt(g.te)} mm; root/tip caps ${fmt(g.cap)} mm; interface rib offset ${fmt(g.interfaceOffset)} mm; cavity ${fmt(g.cavityStart)}–${fmt(g.cavityEnd)}c`);
    const card = (key, over, fields, unit) => {
      const m = E.MATERIALS[key];
      return `${m.short || m.name}: ${fields.map((f) => `${f} ${fmt(over[f] > 0 ? over[f] : m[f])} ${unit}${over[f] > 0 ? ' (override)' : ''}`).join(', ')}`;
    };
    add('Materials', 'Shell, ribs, sleeves', card(state.plaKey, state.plaOver, ['E', 'ft', 'fc', 'fs'], 'MPa'));
    add('Materials','Shell Poisson ratio / density',`${fmt(state.plaOver.nu!=null?state.plaOver.nu:E.MATERIALS[state.plaKey].nu)} / ${fmt(state.plaOver.rho>0?state.plaOver.rho:E.MATERIALS[state.plaKey].rho)} g/cm³`);
    add('Materials', 'Rods', card(state.rodKey, state.rodOver, ['E'], 'MPa'));
    const a = state.assembly;
    add('Joints', 'Rods in sleeves', a.rodsBonded ? 'epoxied (bonded)' : 'slip fit');
    add('Joints', 'Module seams', `${a.seamsBonded ? 'epoxied' : 'dry (rods only)'}; rod free length ${a.seamFreeLength === null ? '2 × interface offset' : `${fmt(a.seamFreeLength)} mm`}; epoxy ${fmt(a.adhesiveTensile)} MPa`);
    const L = state.load;
    if (L.kind === 'flight') add('Load', 'Case', `Flight-like lift: aircraft ${fmt(L.aircraftMass)} kg, n = ${fmt(L.loadFactor)}, ${L.distribution} distribution at ${fmt(L.liftFraction)}c, inertia relief ${L.inertiaRelief ? 'on' : 'off'}`);
    else if (L.kind === 'tip') add('Load', 'Case', `Tip force ${fmt(L.tipForce)} N (upward +) at ${fmt(L.tipFraction)}c of the tip chord`);
    else if (!L.items.length) add('Load', 'Case', 'Custom — no load defined yet (empty list)');
    else {
      add('Load', 'Case', `Custom: ${L.items.length} item(s), ${countSegments(L.items)} segment(s), upward positive`);
      L.items.forEach((it, i) => add('Load', `Item ${i + 1}`, describeItem(it, { len: 'mm', line: 'N/mm' })));
    }
    add('Checks', 'Factor of safety / tip mass', `${fmt(L.fos)} / ${fmt(L.tipMass)} g`);
    add('Checks', 'Stiffness criteria', `tip deflection ≤ ${fmt(state.criteria.maxTipDeflection)} mm; tip twist ≤ ${fmt(state.criteria.maxTipTwist)}°`);
    add('Analysis','Requested beam elements',state.analysis?`${state.analysis.nElements}; required stations may add elements. CAD/STL geometry is unchanged.`:'Solver default; required stations may add elements.');
    return rows;
  }

  // ------------------------------------------------------------------ D.520: schema
  const D520_KEYS = Object.freeze(['n', 'distribution', 'inertiaRelief', 'include', 'scales', 'support', 'taper', 'mass', 'CL', 'material', 'customLoads']);
  const D520_MATERIAL = Object.freeze({ E: 'Pa', nu: '', rho: 'kg/m³', Fty: 'Pa', Fcy: 'Pa', Ftu: 'Pa', Fsu: 'Pa', epsU: '' });
  function d520Bounds(M) {
    const P = M && M.D520;
    return P ? { lo: P.fittingY, hi: P.ribs[P.ribs.length - 1] } : { lo: 0.46, hi: 4.93 };
  }
  function checkD520Study(issues, raw, path, M) {
    if (!isObj(raw)) { issues.err(path, `must be an object with the D.520 inputs, not ${describe(raw)}`); return undefined; }
    checkKeys(issues, raw, path, D520_KEYS);
    const n0 = issues.count, s = {};
    s.n = num(issues, raw, 'n', path, { nonzero: true, label: 'load factor (flight) or load multiplier (custom loads)' });
    s.distribution = choice(issues, raw, 'distribution', path, ['liftingLine', 'schrenk', 'elliptic']);
    s.inertiaRelief = bool(issues, raw, 'inertiaRelief', path, { label: 'inertia relief in flight cases' });
    const inc = objectField(issues, raw, 'include', path, { label: '{fuel, guns, ammo}' });
    if (inc) {
      const ip = join(path, 'include');
      checkKeys(issues, inc, ip, ['fuel', 'guns', 'ammo']);
      s.include = { fuel: bool(issues, inc, 'fuel', ip), guns: bool(issues, inc, 'guns', ip), ammo: bool(issues, inc, 'ammo', ip) };
    }
    const sc = objectField(issues, raw, 'scales', path, { label: '{skin, web, boom, stringer}' });
    if (sc) {
      const sp = join(path, 'scales');
      checkKeys(issues, sc, sp, ['skin', 'web', 'boom', 'stringer']);
      s.scales = {};
      for (const k of ['skin', 'web', 'boom', 'stringer']) s.scales[k] = num(issues, sc, k, sp, { gt: 0, label: 'gauge scale factor' });
    }
    s.support = choice(issues, raw, 'support', path, ['fittings', 'clamped']);
    s.taper = bool(issues, raw, 'taper', path, { label: 'tapered-beam effect of inclined booms' });
    s.mass = num(issues, raw, 'mass', path, { nullable: true, gt: 0, unit: 'kg', label: 'gross mass; null keeps the preset' });
    s.CL = num(issues, raw, 'CL', path, { nullable: true, gt: 0, label: 'reference lift coefficient; null keeps the preset' });
    const mat = objectField(issues, raw, 'material', path, { nullable: true, label: 'material card' });
    if (mat === null) s.material = null;
    else if (mat) {
      const mp = join(path, 'material');
      checkKeys(issues, mat, mp, [...Object.keys(D520_MATERIAL), 'name']);
      s.material = {};
      for (const [k, unit] of Object.entries(D520_MATERIAL)) s.material[k] = num(issues, mat, k, mp, k === 'nu' ? { gt: 0, lt: 0.5, label: "Poisson's ratio" } : { gt: 0, unit: unit || undefined });
      const name = text(issues, mat, 'name', mp, { optional: true, max: LIMITS.nameChars });
      if (name !== undefined) s.material.name = name;
    }
    if (!own(raw, 'customLoads')) issues.err(join(path, 'customLoads'), 'is missing (null for flight loading, [] for no load, or a list of bench loads)');
    else if (raw.customLoads === null) s.customLoads = null;
    else {
      const b = d520Bounds(M);
      s.customLoads = checkItems(issues, raw.customLoads, join(path, 'customLoads'), {
        lo: b.lo, hi: b.hi, pointLoOpen: false, len: 'm', line: 'N/m', allowSchrenk: false,
        maxItems: LIMITS.d520Items, maxSegments: LIMITS.d520Segments,
        rangeText: () => `the fittings at ${fmt(b.lo)} m and the last rib at ${fmt(b.hi)} m`,
      });
    }
    return issues.count > n0 ? undefined : s;
  }
  function d520EngineChecks(issues, s, path, M) {
    const n0 = issues.count;
    try { M.normalise({ ...clone(s), customLoads: null }); }
    catch (e) { issues.err(pathFor(D520_RULES, path, e.message), engineMessage(e, 'MetalWingEngine')); return false; }
    if (s.customLoads && s.customLoads.length) {
      const unsupported = [...new Set(s.customLoads.map((it) => it.kind))].filter((k) => !engineSupports(M, 'd520', k));
      if (unsupported.length) issues.warn(join(path, 'customLoads'), `this page's MetalWingEngine ${M.VERSION} cannot analyse ${unsupported.map((k) => `"${k}"`).join(', ')} load items yet: their structure, units and span bounds were checked here, the engine check was not possible, and the solver will report an error if it cannot use them`);
      const items = s.customLoads.map((it, i) => ({ it, i })).filter((q) => !unsupported.includes(q.it.kind));
      let ok = true;
      for (const { it, i } of items) {
        try { M.normalise({ ...clone(s), customLoads: [clone(it)] }); }
        catch (e) { issues.err(join(join(path, 'customLoads'), i), engineMessage(e, 'MetalWingEngine')); ok = false; }
      }
      if (ok && items.length > 1) {
        try { M.normalise({ ...clone(s), customLoads: items.map((q) => clone(q.it)) }); }
        catch (e) { issues.err(join(path, 'customLoads'), engineMessage(e, 'MetalWingEngine')); }
      }
    }
    return issues.count === n0;
  }
  function canonicalD520FromUi(inp, M) {
    if (!isObj(inp)) throw new Error('There is no D.520 study state to save.');
    const D = M.DEFAULT_INPUT, pick = (v, d) => (v === undefined ? d : v);
    const material = inp.material === null || inp.material === undefined ? null : (() => {
      const m = { ...M.D520.material, ...(isObj(inp.material) ? inp.material : {}) }, out = {};
      for (const k of Object.keys(D520_MATERIAL)) out[k] = m[k];
      if (typeof m.name === 'string') out.name = m.name;
      return out;
    })();
    const sub = (v, d, keys) => Object.fromEntries(keys.map((k) => [k, pick(isObj(v) ? v[k] : undefined, d[k])]));
    return {
      n: pick(inp.n, D.n), distribution: pick(inp.distribution, D.distribution), inertiaRelief: pick(inp.inertiaRelief, D.inertiaRelief),
      include: sub(inp.include, D.include, ['fuel', 'guns', 'ammo']), scales: sub(inp.scales, D.scales, ['skin', 'web', 'boom', 'stringer']),
      support: pick(inp.support, D.support), taper: inp.taper !== false, mass: pick(inp.mass, null), CL: pick(inp.CL, null), material,
      customLoads: inp.customLoads === null || inp.customLoads === undefined ? null : Array.isArray(inp.customLoads) ? inp.customLoads.map((it) => canonicalItemFromUi(it, false)) : inp.customLoads,
    };
  }
  function d520Rows(s, M) {
    const rows = [], add = (group, label, value) => rows.push({ group, label, value });
    const custom = s.customLoads !== null;
    if (!custom) {
      add('Load', 'Case', `Flight: n = ${fmt(s.n)} g, ${s.distribution} span loading`);
      add('Load', 'Aircraft', `gross mass ${s.mass === null ? `preset (${fmt(M.D520.aircraft.mass)} kg)` : `${fmt(s.mass)} kg`}; CL ${s.CL === null ? `preset (${fmt(M.D520.aircraft.CL)})` : fmt(s.CL)}`);
      add('Load', 'Inertia relief', s.inertiaRelief ? `on (fuel ${s.include.fuel ? 'on' : 'off'}, guns ${s.include.guns ? 'on' : 'off'}, ammunition ${s.include.ammo ? 'on' : 'off'})` : 'off');
    } else if (!s.customLoads.length) add('Load', 'Case', `Custom — no load defined yet (empty list); multiplier ×${fmt(s.n)}`);
    else {
      add('Load', 'Case', `Custom bench loads: ${s.customLoads.length} item(s), ${countSegments(s.customLoads)} segment(s), multiplied by ${fmt(s.n)}; no flight lift and no inertia relief`);
      s.customLoads.forEach((it, i) => add('Load', `Item ${i + 1}`, describeItem(it, { len: 'm', line: 'N/m' })));
    }
    add('Structure', 'Gauge scales', `skin ×${fmt(s.scales.skin)}, webs ×${fmt(s.scales.web)}, booms ×${fmt(s.scales.boom)}, stringers ×${fmt(s.scales.stringer)}`);
    add('Structure', 'Support', s.support === 'clamped' ? 'clamped at the fittings' : 'fittings + centre section by symmetry');
    add('Structure', 'Tapered-beam effect', s.taper ? 'on' : 'off');
    const m = s.material || M.D520.material;
    add('Material', m.name || 'Material card', `E ${fmt(m.E / 1e9)} GPa, ν ${fmt(m.nu)}, ρ ${fmt(m.rho)} kg/m³, Fty ${fmt(m.Fty / 1e6)} MPa, Fcy ${fmt(m.Fcy / 1e6)} MPa, Ftu ${fmt(m.Ftu / 1e6)} MPa, Fsu ${fmt(m.Fsu / 1e6)} MPa, εu ${fmt(m.epsU)}${s.material ? '' : ' (preset)'}`);
    return rows;
  }

  // ------------------------------------------------------------------ native study files
  function studyResult(workspace, filename) {
    return {
      ok: false, kind: 'study', workspace, state: null, warnings: [], errors: [], preview: null, version: null,
      provenance: { filename: cleanName(filename), source: 'file', sha256: null, bytes: null, savedAt: null, savedWith: null, engine: null },
    };
  }
  function checkEnvelope(issues, doc, expected, engineVersion, res) {
    if (!isObj(doc)) { issues.err('', `This JSON text does not contain a Wing Lab study (expected an object, found ${describe(doc)}).`); return null; }
    if (doc.format === PARAMS_FORMAT) { issues.err('format', 'this is a design-parameter file (mie446-wing-parameters): use "Import design parameters", not "Open study"'); return null; }
    if (doc.format === 'mie446-beam-study') { issues.err('format', 'this is a Beam Lab study: open it in the Beam Lab'); return null; }
    if (doc.format !== STUDY_FORMAT) { issues.err('format', `must be "${STUDY_FORMAT}", not ${describe(doc.format)}`); return null; }
    if (!own(doc, 'version')) { issues.err('version', 'is missing'); return null; }
    if (!Number.isInteger(doc.version)) { issues.err('version', `must be the whole number ${FILE_VERSION}, not ${describe(doc.version)}`); return null; }
    if (doc.version > MAX_FILE_VERSION) { issues.err('version', `this study was saved by a newer Wing Lab (file version ${doc.version}; this page reads versions 1–${MAX_FILE_VERSION}). Nothing was imported; your current study is unchanged`); return null; }
    if (doc.version < 1) { issues.err('version', `${doc.version} is not a valid file version`); return null; }
    res.version = doc.version;
    const ws = doc.workspace;
    if(doc.version===2&&ws!=='printed'){issues.err('version','version 2 is the printed-wing station geometry format');return null;}
    if(doc.version===1&&(hasAdvancedGeometry(doc.study?.geometry)||own(doc.study||{},'analysis'))){issues.err('version','station geometry and analysis settings require file version 2; nothing was imported');return null;}
    if (ws !== 'printed' && ws !== 'd520') { issues.err('workspace', `must be "printed" or "d520", not ${describe(ws)}`); return null; }
    if (expected && ws !== expected) { issues.err('workspace', `this is a ${WORKSPACE_LABEL[ws]} study: open it in the ${WORKSPACE_LABEL[ws]} workspace (this is the ${WORKSPACE_LABEL[expected]} workspace)`); return null; }
    checkKeys(issues, doc, '', ['format', 'version', 'workspace', 'savedAt', 'app', 'study', ...(ws === 'printed' ? ['projectName', 'emptyStudy'] : [])]);
    if (ws === 'printed') {
      res.provenance.projectName = readProjectName(issues, doc);
      res.provenance.emptyStudy = own(doc, 'emptyStudy') ? bool(issues, doc, 'emptyStudy', '') : false;
    }
    if (own(doc, 'savedAt')) {
      const v = text(issues, doc, 'savedAt', '', { max: 40 });
      if (v !== undefined) { if (Number.isNaN(Date.parse(v))) issues.warn('savedAt', 'is not a valid date and time; ignored'); else res.provenance.savedAt = v; }
    }
    if (own(doc, 'app')) {
      if (!isObj(doc.app)) issues.err('app', `must be an object {name, engine}, not ${describe(doc.app)}`);
      else {
        for (const k of Object.keys(doc.app)) if (!['name', 'engine', 'io'].includes(k)) issues.warn(join('app', k), 'unknown metadata field ignored');
        const name = text(issues, doc.app, 'name', 'app', { optional: true, max: LIMITS.nameChars });
        const eng = text(issues, doc.app, 'engine', 'app', { optional: true, max: 40 });
        res.provenance.savedWith = name === undefined ? null : name;
        res.provenance.engine = eng === undefined ? null : eng;
        if (eng !== undefined && engineVersion && eng !== engineVersion) issues.warn('app.engine', `the study was saved with engine ${eng}; this page runs engine ${engineVersion}, and every result is recomputed by it`);
      }
    }
    if (res.provenance.engine === null) issues.warn('app.engine', 'the engine version that saved the study is not recorded');
    if (!own(doc, 'study')) { issues.err('study', 'is missing'); return null; }
    return ws;
  }
  /**
   * Import untrusted study text or bytes. opts: {workspace ('printed'|'d520'; omit to accept either),
   * engine, metalEngine, filename, source}. Returns {ok, kind:'study', workspace, state, warnings,
   * errors, preview, provenance, version}; state is null unless ok.
   */
  function importStudy(input, opts = {}) {
    const res = studyResult(opts.workspace || null, opts.filename);
    if (opts.source) res.provenance.source = opts.source;
    const issues = makeIssues();
    const done = () => {
      issues.finish();
      res.errors = issues.errors; res.warnings = issues.warnings;
      if (res.errors.length) { res.ok = false; res.state = null; }
      res.preview = { title: res.ok ? `${WORKSPACE_LABEL[res.workspace]} study` : 'Study file', rows: res.ok ? res.preview.rows : [] };
      return res;
    };
    res.preview = { rows: [] };
    const read = readInput(input, 'The study file');
    res.provenance.bytes = read.byteLength === undefined ? null : read.byteLength;
    res.provenance.sha256 = read.sha256 || null;
    if (read.error) { issues.err('', read.error); return done(); }
    if (read.bom) issues.warn('', 'a UTF-8 byte-order mark at the start of the file was ignored (it is included in the SHA-256)');
    let doc;
    try { doc = parseJson(read.text); } catch (e) { issues.err('', `This is not valid JSON: ${e.message}.`); return done(); }
    const peek = isObj(doc) && (doc.workspace === 'printed' || doc.workspace === 'd520') ? doc.workspace : null;
    const engine = peek === 'd520' ? (opts.metalEngine || (opts.workspace === 'd520' ? opts.engine : null) || globalMetal()) : (opts.engine || globalWing());
    const ws = checkEnvelope(issues, doc, opts.workspace || null, engine && engine.VERSION, res);
    if (!ws) return done();
    res.workspace = ws;
    if (!engine) { issues.err('', `${ws === 'printed' ? 'WingEngine' : 'MetalWingEngine'} is not loaded, so the study cannot be checked.`); return done(); }
    if (ws === 'printed') {
      const study = checkPrintedStudy(issues, doc.study, 'study', engine);
      if (study && !issues.count) {
        const state = { ...printedState(study), projectName: res.provenance.projectName, emptyStudy: res.provenance.emptyStudy };
        if (printedEngineChecks(issues, state, 'study', engine) && !issues.count) { res.ok = true; res.state = state; res.preview.rows = printedRows(state, engine); }
      }
    } else {
      const study = checkD520Study(issues, doc.study, 'study', engine);
      if (study && !issues.count && d520EngineChecks(issues, study, 'study', engine) && !issues.count) { res.ok = true; res.state = clone(study); res.preview.rows = d520Rows(study, engine); }
    }
    return done();
  }
  const importPrintedStudy = (input, engine, opts = {}) => importStudy(input, { ...opts, workspace: 'printed', engine: engine || opts.engine });
  const importD520Study = (input, metalEngine, opts = {}) => importStudy(input, { ...opts, workspace: 'd520', engine: metalEngine || opts.engine, metalEngine: metalEngine || opts.metalEngine || opts.engine });

  function savedError(prefix, errors) {
    const e = new Error(`${prefix}: ${errors.slice(0, 4).join(' · ')}${errors.length > 4 ? ` · …(${errors.length} problems)` : ''}`);
    e.errors = errors.slice();
    return e;
  }
  /** Versioned study document (an object) for the printed-wing UI state S. Throws when S is not valid. */
  function printedStudyDocument(S, engine, opts = {}) {
    const E = engine || globalWing();
    if (!E) throw new Error('WingEngine is not loaded.');
    const raw = canonicalPrintedFromUi(S, E), issues = makeIssues();
    const projectName = readProjectName(issues, { projectName: own(opts, 'projectName') ? opts.projectName : (S.projectName === undefined ? '' : S.projectName) });
    const emptyStudy = S.emptyStudy === undefined ? false : bool(issues, S, 'emptyStudy', '');
    const study = checkPrintedStudy(issues, raw, 'study', E);
    if (study && !issues.count) printedEngineChecks(issues, printedState(study), 'study', E);
    issues.finish();
    if (issues.errors.length) throw savedError('The current study cannot be saved', issues.errors);
    return { format: STUDY_FORMAT, version: hasAdvancedGeometry(study.geometry)||study.analysis?2:FILE_VERSION, workspace: 'printed', ...(projectName ? { projectName } : {}), ...(emptyStudy ? { emptyStudy: true } : {}), savedAt: opts.savedAt || new Date().toISOString(), app: { name: 'MIE 446 Wing Lab', engine: E.VERSION, io: IO_VERSION }, study };
  }
  const exportPrintedStudy = (S, engine, opts) => `${JSON.stringify(printedStudyDocument(S, engine, opts), null, 2)}\n`;
  /** Manufacturing preflight only. No model edits, no CAD generation and no safety approval. */
  function fabricationIssues(S, E) {
    if (S.emptyStudy) return ['Create a wing first. This is an empty study, not a printable wing.'];
    const n=printedEngineInput(S,E),g=n.geometry,m=n.pla,errors=[];
    // One-piece and larger designs may be exported; the notebook validates actual CAD against its configured printer.
    if(g.skin<.8||g.ribThickness<.8||g.te<.8)errors.push('Printed skin, ribs and trailing edge must be ≥0.8 mm.');
    if(!['pla_upright','pla_flat'].includes(S.plaKey))errors.push('The notebook currently fabricates PLA, not custom/metal shell materials.');
    if(g.rodFractions.some(f=>f<.1||f>.8)||g.rodFractions.length&&(g.clearance<.05||g.sleeveWall<.8))errors.push('CAD rod positions must be 0.10–0.80c; radial clearance ≥0.05 mm and sleeve wall ≥0.8 mm.');
    for(const [i,s]of (g.spars||[]).entries()){
      if(['E','nu','rho','ft','fc','fs'].some(k=>Math.abs(s.material[k]-m[k])>1e-9*Math.max(1,Math.abs(m[k]))))errors.push(`Spar ${i+1}: integral single-filament printing requires the same effective PLA properties as the shell. Match its material card and Solve; a carbon/metal spar cannot silently become printed PLA.`);
      if(Math.min(s.topThickness,s.bottomThickness,s.webThickness)<.4)errors.push(`Spar ${i+1}: cap/web thickness must be ≥0.4 mm; slicer extrusion-path inspection remains required.`);
    }
    return errors;
  }
  /** Versioned study document for the D.520 UI input MS.input. Throws when it is not valid. */
  function d520StudyDocument(input, metalEngine, opts = {}) {
    const M = metalEngine || globalMetal();
    if (!M) throw new Error('MetalWingEngine is not loaded.');
    const raw = canonicalD520FromUi(input, M), issues = makeIssues();
    const study = checkD520Study(issues, raw, 'study', M);
    if (study && !issues.count) d520EngineChecks(issues, study, 'study', M);
    issues.finish();
    if (issues.errors.length) throw savedError('The current D.520 study cannot be saved', issues.errors);
    return { format: STUDY_FORMAT, version: FILE_VERSION, workspace: 'd520', savedAt: opts.savedAt || new Date().toISOString(), app: { name: 'MIE 446 Wing Lab', engine: M.VERSION, io: IO_VERSION }, study };
  }
  const exportD520Study = (input, metalEngine, opts) => `${JSON.stringify(d520StudyDocument(input, metalEngine, opts), null, 2)}\n`;

  // ------------------------------------------------------------------ share links
  /** base64url(UTF-8 JSON) of a study document, after the same validation as a file. Throws when invalid or too long. */
  function encodeShare(studyDocument, opts = {}) {
    if (!isObj(studyDocument)) throw new Error('encodeShare needs a Wing Lab study document (an object).');
    const json = JSON.stringify(studyDocument);
    const check = importStudy(json, { ...opts, workspace: null, source: 'share link' });
    if (!check.ok) throw savedError('This study cannot be shared', check.errors);
    const token = base64urlEncode(utf8Encode(json));
    if (token.length > LIMITS.shareChars) throw new Error(`This study is too long for a link (${token.length} characters; the limit is ${LIMITS.shareChars}). Save it as a file instead.`);
    return token;
  }
  const shareFragment = (token) => `#${SHARE_KEY}=${token}`;
  /**
   * Decode a link, a "#wingstudy=…" fragment or a bare token, and import it exactly like a file
   * (opts: {engine, metalEngine, workspace}). Returns the same result object as importStudy.
   */
  function decodeShare(fragment, opts = {}) {
    const res = studyResult(opts.workspace || null, null);
    res.provenance.source = 'share link';
    const fail = (msg) => { res.errors = [msg]; res.preview = { title: 'Study link', rows: [] }; return res; };
    if (typeof fragment !== 'string' || !fragment.trim()) return fail('The link is empty.');
    let token = fragment.trim();
    const hash = token.indexOf('#');
    if (hash >= 0) token = token.slice(hash + 1);
    const part = token.split('&').find((p) => p.startsWith(`${SHARE_KEY}=`));
    if (part) token = part.slice(SHARE_KEY.length + 1);
    else if (token.includes('=')) return fail(`The link has no "${SHARE_KEY}=" part.`);
    if (token.length > LIMITS.shareChars) return fail(`The link is too long to be a study link (${token.length} characters; the limit is ${LIMITS.shareChars}).`);
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return fail('The link contains characters that a study link never contains (it may be damaged).');
    let bytes;
    try { bytes = base64urlDecode(token); } catch (e) { return fail('The link is damaged or incomplete.'); }
    return importStudy(bytes, { ...opts, source: 'share link' });
  }

  // ------------------------------------------------------------------ neutral design-parameter files
  const FRAME = Object.freeze({ span: 'y', chord: 'x', up: 'z', origin: 'root leading edge' });
  const FRAME_TEXT = Object.freeze({ span: 'span axis', chord: 'chord axis (leading edge → trailing edge)', up: 'thickness axis (upward)', origin: 'origin' });
  const PARAM_KEYS = Object.freeze(['format', 'version', 'source', 'units', 'span', 'frame', 'airfoil', 'rootChord', 'tipChord', 'sweepDeg',
    'dihedralDeg', 'twistDeg', 'sections', 'structure', 'material', 'supports', 'loads', 'criteria', 'notes']);
  const REQUIRED_ITEMS = Object.freeze([
    Object.freeze({ id: 'skin', label: 'Skin thickness', path: 'structure.skin' }),
    Object.freeze({ id: 'ribs', label: 'Rib layout (interior rib count or stations)', path: 'structure.ribs' }),
    Object.freeze({ id: 'rods', label: 'Spanwise rods (positions x/c and diameter; an empty list means no rods)', path: 'structure.rods' }),
    Object.freeze({ id: 'modules', label: 'Modules and seams (module count; dry or bonded seams when there is more than one module)', path: 'structure.modules' }),
    Object.freeze({ id: 'material', label: 'Material cards (printed PLA; the rod card when there are rods)', path: 'material' }),
    Object.freeze({ id: 'support', label: 'Root support (clamped root)', path: 'supports.root' }),
    Object.freeze({ id: 'loads', label: 'Load case', path: 'loads' }),
  ]);
  const PARAMETER_TEMPLATE = deepFreeze({
    format: PARAMS_FORMAT,
    version: 1,
    notes: 'Template for transferring an outer wing shape into the MIE 446 Wing Lab by hand. Replace the example values with your design. Lengths use units.length; angles are degrees and must be 0. See WING_IMPORT.md.',
    source: { app: 'manual transfer', appVersion: '', filename: '', exportedAt: '' },
    units: { length: 'mm' },
    span: { value: 450, kind: 'semi' },
    frame: { span: 'y', chord: 'x', up: 'z', origin: 'root leading edge' },
    airfoil: { type: 'naca4', code: '2412' },
    rootChord: 160,
    tipChord: 100,
    sweepDeg: 0,
    dihedralDeg: 0,
    twistDeg: 0,
  });
  function deepFreeze(o) { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; }
  const parameterTemplateText = () => `${JSON.stringify(PARAMETER_TEMPLATE, null, 2)}\n`;
  const NACA_DESIGNATION = /^\s*(?:NACA[\s-]*)?(\d{4})\s*$/i;

  /**
   * Import an untrusted design-parameter file (text or bytes). opts: {filename, engine}.
   * Returns {ok, status:'complete'|'geometry-only'|'rejected', analysisBlocked, fields, geometry, state,
   * required, supplied, errors, warnings, provenance, preview}. Never solves.
   */
  function importParameters(input, opts = {}) {
    const E = opts.engine || globalWing();
    const res = {
      ok: false, kind: 'parameters', workspace: 'printed', status: 'rejected', analysisBlocked: true, fields: [], geometry: null, state: null,
      required: [], supplied: [], errors: [], warnings: [], preview: null,
      provenance: { filename: cleanName(opts.filename), sha256: null, bytes: null, app: null, appVersion: null, exportedAt: null, sourceFilename: null },
    };
    const issues = makeIssues();
    const ov = (value, unit) => ({ value: value === undefined ? null : clone(value), unit: unit || null });
    const field = (path, original, converted, origin, note, target) => res.fields.push({ path, original, converted, origin, note: note || '', target: target || null });
    const done = () => {
      issues.finish();
      res.errors = issues.errors; res.warnings = issues.warnings;
      if (res.errors.length) { res.ok = false; res.status = 'rejected'; res.state = null; res.geometry = null; res.analysisBlocked = true; res.required = []; }
      res.preview = { title: 'Design parameters', rows: res.fields.map((f) => ({ group: f.origin, label: f.path, value: fieldValue(f.converted) })) };
      return res;
    };
    if (!E) { issues.err('', 'WingEngine is not loaded, so design parameters cannot be checked.'); return done(); }
    const read = readInput(input, 'The design-parameter file');
    res.provenance.bytes = read.byteLength === undefined ? null : read.byteLength;
    res.provenance.sha256 = read.sha256 || null;
    if (read.error) { issues.err('', read.error); return done(); }
    let doc;
    try { doc = parseJson(read.text); } catch (e) { issues.err('', `This is not valid JSON: ${e.message}.`); return done(); }
    if (!isObj(doc)) { issues.err('', `This JSON text does not contain design parameters (expected an object, found ${describe(doc)}).`); return done(); }
    if (doc.format === STUDY_FORMAT) { issues.err('format', 'this is a Wing Lab study file (mie446-wing-study): use "Open study", not "Import design parameters"'); return done(); }
    if (doc.format !== PARAMS_FORMAT) { issues.err('format', `must be "${PARAMS_FORMAT}", not ${describe(doc.format)}. Exports of other tools are not read directly: transfer the values into the template by hand (see WING_IMPORT.md)`); return done(); }
    if (!Number.isInteger(doc.version)) { issues.err('version', `must be the whole number ${FILE_VERSION}, not ${describe(doc.version)}`); return done(); }
    if (doc.version !== FILE_VERSION) { issues.err('version', doc.version > FILE_VERSION ? `file version ${doc.version} is newer than this page reads (version ${FILE_VERSION}); nothing was imported` : `${doc.version} is not a valid file version`); return done(); }
    checkKeys(issues, doc, '', PARAM_KEYS);
    if (own(doc, 'notes')) text(issues, doc, 'notes', '', { max: LIMITS.notesChars, multiline: true });

    // provenance
    const src = objectField(issues, doc, 'source', '', { label: '{app, appVersion, filename, exportedAt}' });
    if (src) {
      for (const k of Object.keys(src)) if (!['app', 'appVersion', 'filename', 'exportedAt'].includes(k)) issues.warn(join('source', k), 'unknown metadata field ignored');
      const app = text(issues, src, 'app', 'source', { max: 120, nonEmpty: true });
      const ver = text(issues, src, 'appVersion', 'source', { optional: true, max: 60 });
      const fn = text(issues, src, 'filename', 'source', { optional: true, max: LIMITS.filenameChars });
      const at = text(issues, src, 'exportedAt', 'source', { optional: true, max: 40 });
      res.provenance.app = app === undefined ? null : app;
      res.provenance.appVersion = ver || null;
      res.provenance.sourceFilename = fn || null;
      if (at) { if (Number.isNaN(Date.parse(at))) issues.warn('source.exportedAt', 'is not a valid date and time; ignored'); else res.provenance.exportedAt = at; }
    }

    // units and frame
    let U = null;
    const units = objectField(issues, doc, 'units', '', { label: '{length: "mm" | "cm" | "m" | "in"}' });
    if (units) {
      checkKeys(issues, units, 'units', ['length', 'force', 'stress']);
      const len = units.length;
      if (!own(units, 'length')) issues.err('units.length', 'is missing ("mm", "cm", "m" or "in")');
      else if (typeof len !== 'string' || !own(LENGTH_UNITS, len)) issues.err('units.length', `${describe(len)} is not a supported length unit: use "mm", "cm", "m" or "in" (nothing is guessed)`);
      else { U = len; field('units.length', ov(len), ov('mm'), 'supplied', LENGTH_UNITS[len].text, null); }
      if (own(units, 'force') && units.force !== 'N') issues.err('units.force', `${describe(units.force)} is not supported: give forces in N`);
      if (own(units, 'stress') && units.stress !== 'MPa') issues.err('units.stress', `${describe(units.stress)} is not supported: give moduli and strengths in MPa`);
    }
    const frame = objectField(issues, doc, 'frame', '', { label: 'axes {"span":"y","chord":"x","up":"z","origin":"root leading edge"}, required so that span, chord and thickness cannot be confused' });
    if (frame) {
      checkKeys(issues, frame, 'frame', Object.keys(FRAME));
      let okFrame = true;
      for (const k of Object.keys(FRAME)) {
        if (frame[k] !== FRAME[k]) {
          okFrame = false;
          issues.err(join('frame', k), `frame mismatch: this importer reads the ${FRAME_TEXT[k]} as ${JSON.stringify(FRAME[k])}, but the file says ${describe(frame[k])}. Nothing is rotated, mirrored or swapped automatically; convert the axes in the source or transfer the values by hand`);
        }
      }
      if (okFrame) field('frame', ov('span y, chord x, up z, origin at the root leading edge'), ov('same'), 'supplied', 'matches the Wing Lab axes', null);
    }
    const toMm = (v) => (U ? lengthToMm(v, U) : v);
    const lenNote = (v, mm) => (U && U !== 'mm' ? `${fmt(v)} ${U} = ${fmt(mm)} mm` : '');

    // span and chords
    let semiFile, semiMm, rootFile, tipFile;
    const span = objectField(issues, doc, 'span', '', { label: '{value, kind: "semi" | "full"}' });
    if (span) {
      checkKeys(issues, span, 'span', ['value', 'kind']);
      const v = num(issues, span, 'value', 'span', { gt: 0, unit: U || undefined, label: 'span length' });
      const kind = choice(issues, span, 'kind', 'span', ['semi', 'full']);
      if (v !== undefined && kind !== undefined) {
        semiFile = kind === 'full' ? half(v) : v;
        semiMm = toMm(semiFile);
        if (kind === 'full') field('span.value', ov(v, U), ov(semiMm, 'mm'), 'derived', `full span ${fmt(v)} ${U || ''} ÷ 2 = semi-span ${fmt(semiFile)} ${U || ''}${U && U !== 'mm' ? ` = ${fmt(semiMm)} mm` : ''}`.replace(/ {2,}/g, ' '), 'geometry.semiSpan');
        else field('span.value', ov(v, U), ov(semiMm, 'mm'), 'supplied', lenNote(v, semiMm) || 'semi-span (root to tip)', 'geometry.semiSpan');
      }
    }
    const chord = (key, label) => {
      const v = num(issues, doc, key, '', { gt: 0, unit: U || undefined, label });
      if (v === undefined) return undefined;
      field(key, ov(v, U), ov(toMm(v), 'mm'), 'supplied', lenNote(v, toMm(v)), `geometry.${key}`);
      return v;
    };
    rootFile = chord('rootChord', 'chord at the root');
    tipFile = chord('tipChord', 'chord at the tip');
    if (rootFile !== undefined && tipFile !== undefined && tipFile > rootFile) {
      issues.err('tipChord', `the tip chord (${fmt(tipFile)}) exceeds the root chord (${fmt(rootFile)}): inverse taper is not supported; the Wing Lab analyses a linear taper with tip ≤ root`);
      res.fields[res.fields.length - 1].origin = 'unsupported';
    }

    // airfoil
    let naca;
    const airfoilExplain = {
      root: 'separate root and tip airfoils are not supported: the Wing Lab uses one NACA 4-digit profile along the whole semi-span (give it as airfoil.type and airfoil.code)',
      tip: 'separate root and tip airfoils are not supported: the Wing Lab uses one NACA 4-digit profile along the whole semi-span (give it as airfoil.type and airfoil.code)',
      coordinates: 'coordinate airfoils are not supported: only NACA 4-digit sections, defined by their designation, can be analysed',
      points: 'coordinate airfoils are not supported: only NACA 4-digit sections, defined by their designation, can be analysed',
      elements: 'multi-element airfoils (slats, flaps, multiple elements) are not supported',
    };
    if (!own(doc, 'airfoil')) issues.err('airfoil', 'is missing ({"type":"naca4","code":"2412"})');
    else if (Array.isArray(doc.airfoil)) {
      issues.err('airfoil', `lists ${doc.airfoil.length} airfoils: multi-profile and multi-element wings are not supported; give one NACA 4-digit profile for the whole semi-wing`);
      field('airfoil', ov(`${doc.airfoil.length} airfoils`), ov(null), 'unsupported', 'one profile only');
    } else if (!isObj(doc.airfoil)) issues.err('airfoil', `must be an object {type, code}, not ${describe(doc.airfoil)}`);
    else {
      const af = doc.airfoil;
      checkKeys(issues, af, 'airfoil', ['type', 'code'], airfoilExplain);
      if (!own(af, 'type')) issues.err('airfoil.type', 'is missing ("naca4")');
      else if (af.type !== 'naca4') {
        const t = typeof af.type === 'string' ? af.type.toLowerCase() : '';
        const why = /coord|dat|point|xy|spline/.test(t) ? 'coordinate airfoils are not supported' : /naca\s*5|naca5|naca\s*6|naca6|naca\s*16/.test(t) ? 'NACA 5-digit, 6-series and 16-series sections are not supported' : 'only "naca4" is supported';
        issues.err('airfoil.type', `${describe(af.type)}: ${why}; the Wing Lab analyses NACA 4-digit sections only`);
        field('airfoil.type', ov(af.type), ov(null), 'unsupported', why);
      }
      if (!own(af, 'code')) issues.err('airfoil.code', 'is missing (such as "2412")');
      else if (typeof af.code !== 'string') issues.err('airfoil.code', `must be text such as "2412" (a number would drop leading zeros), not ${describe(af.code)}`);
      else {
        const m = NACA_DESIGNATION.exec(af.code);
        if (!m) {
          issues.err('airfoil.code', `${JSON.stringify(af.code.slice(0, 40))} is not a NACA 4-digit designation (four digits such as "2412", optionally preceded by "NACA"); other airfoils cannot be analysed`);
          field('airfoil.code', ov(af.code), ov(null), 'unsupported', 'not a NACA 4-digit designation', 'geometry.naca');
        } else {
          try {
            naca = E.normalizeNaca(m[1]);
            field('airfoil.code', ov(af.code), ov(naca), 'supplied', af.code === naca ? 'NACA 4-digit section' : `designation written as its four digits ${naca}`, 'geometry.naca');
          } catch (e) { issues.err('airfoil.code', engineMessage(e, 'WingEngine')); }
        }
      }
    }

    // straight wing only
    const ANGLE_TEXT = {
      sweepDeg: ['sweep', 'swept wings are not supported (the leading edge must be straight and unswept)'],
      dihedralDeg: ['dihedral', 'dihedral is not supported (the semi-wing must be flat)'],
      twistDeg: ['twist', 'twisted (washed-out) wings are not supported'],
    };
    for (const [key, [what, why]] of Object.entries(ANGLE_TEXT)) {
      const v = num(issues, doc, key, '', { unit: 'deg', label: `${what} angle; state 0 for a straight wing` });
      if (v === undefined) continue;
      if (v !== 0) {
        issues.err(key, `${what} of ${fmt(v)}°: ${why}. Nothing is flattened or approximated; change the design or analyse it with another tool`);
        field(key, ov(v, 'deg'), ov(null), 'unsupported', `${what} must be 0`);
      } else field(key, ov(v, 'deg'), ov(0, 'deg'), 'supplied', `${what} 0° (required)`);
    }

    // optional explicit sections: only the root and the tip of the same straight panel
    if (own(doc, 'sections')) {
      const s = doc.sections;
      if (!Array.isArray(s)) issues.err('sections', `must be a list of the root and tip sections, not ${describe(s)}`);
      else if (s.length !== 2) {
        issues.err('sections', s.length > 2 ? `describes ${s.length} sections: multi-section (cranked or multi-panel) wings are not supported; the Wing Lab analyses one straight linear-taper panel from root to tip` : `must list exactly the root and the tip section (got ${s.length})`);
        field('sections', ov(`${s.length} sections`), ov(null), 'unsupported', 'one straight panel only');
      } else {
        const expect = [[0, rootFile, 'root'], [semiFile, tipFile, 'tip']];
        s.forEach((sec, i) => {
          const sp = join('sections', i);
          if (!isObj(sec)) { issues.err(sp, `must be an object, not ${describe(sec)}`); return; }
          checkKeys(issues, sec, sp, ['station', 'chord', 'airfoil', 'leadingEdgeX', 'leadingEdgeZ', 'twistDeg']);
          const [st, ch, which] = expect[i];
          const vs = num(issues, sec, 'station', sp, { ge: 0, unit: U || undefined, label: 'spanwise station from the root' });
          const vc = num(issues, sec, 'chord', sp, { gt: 0, unit: U || undefined, label: 'chord' });
          if (vs !== undefined && st !== undefined && vs !== st) issues.err(join(sp, 'station'), `the ${which} section must be at ${fmt(st)} ${U || ''} (got ${fmt(vs)}); intermediate or extra sections are not supported`.replace(/ {2,}/g, ' '));
          if (vc !== undefined && ch !== undefined && vc !== ch) issues.err(join(sp, 'chord'), `does not match ${which === 'root' ? 'rootChord' : 'tipChord'} (${fmt(vc)} vs ${fmt(ch)}): a non-linear chord distribution is not supported`);
          for (const [k, why] of [['leadingEdgeX', 'a chordwise leading-edge offset means sweep, which is not supported'], ['leadingEdgeZ', 'a vertical leading-edge offset means dihedral, which is not supported'], ['twistDeg', 'section twist is not supported']]) {
            const v = num(issues, sec, k, sp, { optional: true, unit: k === 'twistDeg' ? 'deg' : U || undefined });
            if (v !== undefined && v !== 0) issues.err(join(sp, k), `${fmt(v)}: ${why}`);
          }
          if (own(sec, 'airfoil')) {
            const a = sec.airfoil, ap = join(sp, 'airfoil');
            if (!isObj(a)) issues.err(ap, `must be an object {type, code}, not ${describe(a)}`);
            else {
              checkKeys(issues, a, ap, ['type', 'code'], airfoilExplain);
              const m = typeof a.code === 'string' ? NACA_DESIGNATION.exec(a.code) : null;
              if (a.type !== 'naca4' || !m) issues.err(ap, 'only NACA 4-digit sections ({"type":"naca4","code":"…"}) are supported');
              else if (naca !== undefined && m[1] !== naca) issues.err(join(ap, 'code'), `NACA ${m[1]} differs from the wing airfoil NACA ${naca}: different root and tip airfoils are not supported`);
            }
          }
        });
        field('sections', ov('2 sections'), ov('one straight linear-taper panel'), 'supplied', 'root and tip sections checked against rootChord, tipChord and the airfoil');
      }
    }
    const outer = naca !== undefined && semiMm !== undefined && rootFile !== undefined && tipFile !== undefined && tipFile <= rootFile
      ? { naca, semiSpan: semiMm, rootChord: toMm(rootFile), tipChord: toMm(tipFile) } : null;

    // optional structure, material, supports, loads and criteria
    const D = E.DEFAULT_GEOMETRY, st = {}, have = {};
    const len = (obj, key, path, o, target) => {
      const v = num(issues, obj, key, path, { ...o, unit: U || undefined });
      if (v === undefined || v === null) return v;
      const mm = toMm(v);
      field(join(path, key), ov(v, U), ov(mm, 'mm'), 'supplied', lenNote(v, mm), target);
      return mm;
    };
    if (own(doc, 'structure')) {
      const S = doc.structure;
      if (!isObj(S)) issues.err('structure', `must be an object, not ${describe(S)}`);
      else {
        checkKeys(issues, S, 'structure', ['skin', 'ribs', 'rods', 'modules', 'seams', 'interfaceOffset', 'cap', 'trailingEdge', 'cavity']);
        if (own(S, 'skin')) { st.skin = len(S, 'skin', 'structure', { gt: 0, label: 'skin thickness, measured vertically' }, 'geometry.skin'); have.skin = st.skin !== undefined; }
        if (own(S, 'ribs')) {
          const R = objectField(issues, S, 'ribs', 'structure', { label: '{interior} or {stations}, optional thickness' });
          if (R) {
            checkKeys(issues, R, 'structure.ribs', ['interior', 'stations', 'thickness']);
            const hasI = own(R, 'interior'), hasS = own(R, 'stations');
            if (hasI && hasS) issues.err('structure.ribs', 'give either interior (a count of evenly spaced ribs) or stations (a list), not both');
            else if (!hasI && !hasS) issues.err('structure.ribs', 'needs interior (a count of evenly spaced ribs) or stations (a list of rib stations)');
            else if (hasI) {
              const n = num(issues, R, 'interior', 'structure.ribs', { integer: true, ge: 0, le: 16, label: 'evenly spaced interior ribs' });
              if (n !== undefined) { st.interiorRibs = n; st.customInteriorRibs = null; have.ribs = true; field('structure.ribs.interior', ov(n), ov(n), 'supplied', 'evenly spaced; the engine adds interface ribs at seams', 'geometry.interiorRibs'); }
            } else {
              const list = R.stations, lp = 'structure.ribs.stations';
              if (!Array.isArray(list)) issues.err(lp, `must be a list of stations, not ${describe(list)}`);
              else if (list.length > LIMITS.ribs) issues.err(lp, `lists ${list.length} ribs; at most ${LIMITS.ribs} are allowed`);
              else {
                const out = [];
                let okList = true;
                list.forEach((v, i) => {
                  if (!isNum(v)) { issues.err(join(lp, i), `must be a finite number${U ? ` in ${U}` : ''}, not ${describe(v)}`); okList = false; return; }
                  if (i && !(v > list[i - 1])) { issues.err(join(lp, i), `rib stations must increase strictly (${fmt(v)} after ${fmt(list[i - 1])})`); okList = false; }
                  out.push(toMm(v));
                });
                if (okList) { st.customInteriorRibs = out; st.interiorRibs = out.length; have.ribs = true; field(lp, ov(clone(list), U), ov(out, 'mm'), 'supplied', U && U !== 'mm' ? `converted from ${U}` : '', 'geometry.customInteriorRibs'); }
              }
            }
            if (own(R, 'thickness')) st.ribThickness = len(R, 'thickness', 'structure.ribs', { gt: 0, label: 'rib thickness' }, 'geometry.ribThickness');
          }
        }
        if (own(S, 'rods')) {
          const R = objectField(issues, S, 'rods', 'structure', { label: '{fractions, diameter, clearance, sleeveWall, bonded}' });
          if (R) {
            checkKeys(issues, R, 'structure.rods', ['fractions', 'diameter', 'clearance', 'sleeveWall', 'bonded']);
            const fr = R.fractions, fp = 'structure.rods.fractions';
            let fractions;
            if (!own(R, 'fractions')) issues.err(fp, 'is missing (rod positions x/c; [] for no rods)');
            else if (!Array.isArray(fr)) issues.err(fp, `must be a list of x/c values, not ${describe(fr)}`);
            else if (fr.length > LIMITS.rods) issues.err(fp, `lists ${fr.length} rods; at most ${LIMITS.rods} are allowed`);
            else {
              let okF = true;
              fr.forEach((v, i) => {
                if (!isNum(v)) { issues.err(join(fp, i), `must be a finite number (x/c), not ${describe(v)}`); okF = false; }
                else if (!(v > 0 && v < 1)) { issues.err(join(fp, i), `must lie strictly between 0 and 1 (got ${fmt(v)})`); okF = false; }
              });
              if (okF) { fractions = fr.slice(); field(fp, ov(fractions), ov(fractions), 'supplied', fractions.length ? 'x/c from the local leading edge' : 'no rods', 'geometry.rodFractions'); }
            }
            const dia = own(R, 'diameter') ? len(R, 'diameter', 'structure.rods', { gt: 0, label: 'rod diameter' }, 'geometry.rodDiameter') : undefined;
            if (fractions && fractions.length && !own(R, 'diameter')) issues.err('structure.rods.diameter', 'is missing: rods need a diameter');
            if (own(R, 'clearance')) { st.clearance = len(R, 'clearance', 'structure.rods', { ge: 0, label: 'radial clearance' }, 'geometry.clearance'); }
            if (own(R, 'sleeveWall')) st.sleeveWall = len(R, 'sleeveWall', 'structure.rods', { gt: 0, label: 'printed sleeve wall' }, 'geometry.sleeveWall');
            if (own(R, 'bonded')) { st.rodsBonded = bool(issues, R, 'bonded', 'structure.rods'); if (st.rodsBonded !== undefined) field('structure.rods.bonded', ov(st.rodsBonded), ov(st.rodsBonded), 'supplied', st.rodsBonded ? 'epoxied in the sleeves' : 'slip fit', 'assembly.rodsBonded'); }
            if (fractions) { st.rodFractions = fractions; if (dia !== undefined) st.rodDiameter = dia; have.rods = !fractions.length || dia !== undefined; }
          }
        }
        if (own(S, 'modules')) {
          st.modules = num(issues, S, 'modules', 'structure', { integer: true, ge: 1, le: 3, label: 'number of printed modules' });
          if (st.modules !== undefined) field('structure.modules', ov(st.modules), ov(st.modules), 'supplied', st.modules === 1 ? 'one piece, no seams' : `${st.modules - 1} seam(s)`, 'geometry.modules');
        }
        if (own(S, 'seams')) {
          const R = objectField(issues, S, 'seams', 'structure', { label: '{bonded, freeLength, adhesiveTensile}' });
          if (R) {
            checkKeys(issues, R, 'structure.seams', ['bonded', 'freeLength', 'adhesiveTensile']);
            if (own(R, 'bonded')) { st.seamsBonded = bool(issues, R, 'bonded', 'structure.seams'); if (st.seamsBonded !== undefined) field('structure.seams.bonded', ov(st.seamsBonded), ov(st.seamsBonded), 'supplied', st.seamsBonded ? 'epoxied seams' : 'dry seams (rods only)', 'assembly.seamsBonded'); }
            if (own(R, 'freeLength')) st.seamFreeLength = len(R, 'freeLength', 'structure.seams', { gt: 0, label: 'rod free length at a dry seam' }, 'assembly.seamFreeLength');
            if (own(R, 'adhesiveTensile')) {
              st.adhesiveTensile = num(issues, R, 'adhesiveTensile', 'structure.seams', { gt: 0, unit: 'MPa', label: 'epoxy butt-joint strength' });
              if (st.adhesiveTensile !== undefined) field('structure.seams.adhesiveTensile', ov(st.adhesiveTensile, 'MPa'), ov(st.adhesiveTensile, 'MPa'), 'supplied', '', 'assembly.adhesiveTensile');
            }
          }
        }
        have.modules = st.modules !== undefined && (st.modules === 1 || st.seamsBonded !== undefined);
        if (own(S, 'interfaceOffset')) st.interfaceOffset = len(S, 'interfaceOffset', 'structure', { gt: 0, label: 'interface rib offset from a seam' }, 'geometry.interfaceOffset');
        if (own(S, 'cap')) st.cap = len(S, 'cap', 'structure', { gt: 0, label: 'root and tip cap thickness' }, 'geometry.cap');
        if (own(S, 'trailingEdge')) st.te = len(S, 'trailingEdge', 'structure', { gt: 0, label: 'printed trailing-edge thickness' }, 'geometry.te');
        if (own(S, 'cavity')) {
          const R = objectField(issues, S, 'cavity', 'structure', { label: '{start, end} as x/c' });
          if (R) {
            checkKeys(issues, R, 'structure.cavity', ['start', 'end']);
            const a = num(issues, R, 'start', 'structure.cavity', { gt: 0, lt: 1, label: 'cavity start x/c' });
            const b = num(issues, R, 'end', 'structure.cavity', { gt: 0, lt: 1, label: 'cavity end x/c' });
            if (a !== undefined && b !== undefined) {
              if (!(b > a)) issues.err('structure.cavity.end', `must be greater than start (${fmt(a)} → ${fmt(b)})`);
              else { st.cavityStart = a; st.cavityEnd = b; field('structure.cavity', ov(`${fmt(a)}–${fmt(b)}`), ov(`${fmt(a)}–${fmt(b)}`), 'supplied', 'x/c', 'geometry.cavityStart/cavityEnd'); }
            }
          }
        }
      }
    }
    const mat = {};
    if (own(doc, 'material')) {
      const R = doc.material;
      if (!isObj(R)) issues.err('material', `must be an object {shell, rod}, not ${describe(R)}`);
      else {
        checkKeys(issues, R, 'material', ['shell', 'rod']);
        const keysOf = (kind) => Object.keys(E.MATERIALS).filter((k) => E.MATERIALS[k] && E.MATERIALS[k].kind === kind);
        const part = (key, kind, overrides) => {
          const p = join('material', key), o = objectField(issues, R, key, 'material', { optional: true, label: `{card${overrides.map((f) => `, ${f}`).join('')}}` });
          if (!o) return undefined;
          checkKeys(issues, o, p, ['card', ...overrides]);
          const cardKey = choice(issues, o, 'card', p, keysOf(kind));
          const over = {};
          for (const f of overrides) {
            if (!own(o, f)) { over[f] = null; continue; }
            over[f] = num(issues, o, f, p, { gt: 0, unit: 'MPa', label: 'override of the card value' });
            if (over[f] !== undefined) field(join(p, f), ov(over[f], 'MPa'), ov(over[f], 'MPa'), 'supplied', 'override of the card value', `${kind === 'pla' ? 'plaOver' : 'rodOver'}.${f}`);
          }
          if (cardKey !== undefined) field(join(p, 'card'), ov(cardKey), ov(E.MATERIALS[cardKey].name), 'supplied', E.MATERIALS[cardKey].source || '', kind === 'pla' ? 'plaKey' : 'rodKey');
          return cardKey === undefined || Object.values(over).includes(undefined) ? undefined : { card: cardKey, over };
        };
        const shell = part('shell', 'pla', ['E', 'ft', 'fc', 'fs']);
        const rod = part('rod', 'rod', ['E']);
        if (shell) { mat.plaKey = shell.card; mat.plaOver = shell.over; }
        if (rod) { mat.rodKey = rod.card; mat.rodOver = rod.over; }
        if (!own(R, 'shell')) issues.warn('material.shell', 'is not given: the printed PLA card is still required before analysis');
      }
    }
    const rodsNeeded = Array.isArray(st.rodFractions) && st.rodFractions.length > 0;
    have.material = mat.plaKey !== undefined && (!rodsNeeded || mat.rodKey !== undefined);
    if (own(doc, 'supports')) {
      const R = doc.supports;
      if (!isObj(R)) issues.err('supports', `must be an object {root: "clamped"}, not ${describe(R)}`);
      else {
        checkKeys(issues, R, 'supports', ['root']);
        if (!own(R, 'root')) issues.err('supports.root', 'is missing ("clamped")');
        else if (R.root !== 'clamped') { issues.err('supports.root', `${describe(R.root)} is not supported: the printed semi-wing is analysed as a cantilever clamped at the root face ("clamped")`); field('supports.root', ov(R.root), ov(null), 'unsupported', 'clamped root only'); }
        else { have.support = true; field('supports.root', ov('clamped'), ov('clamped root face'), 'supplied', 'no deflection, slope or twist at y = 0', null); }
      }
    }
    let load;
    if (own(doc, 'loads')) {
      const conv = U ? {
        fileLen: U, fileLine: `N/${U}`, toLen: (v) => lengthToMm(v, U), toLine: (v) => perLengthToPerMm(v, U), note: U === 'mm' ? '' : ` (converted from ${U})`,
      } : { fileLen: 'mm', fileLine: 'N/mm', toLen: (v) => v, toLine: (v) => v, note: '' };
      if (semiMm === undefined) issues.err('loads', 'cannot be checked without a valid span');
      else {
        load = checkPrintedLoad(issues, doc.loads, 'loads', semiMm, E, conv);
        if (load) {
          have.loads = true;
          const desc = load.kind === 'custom' ? (load.items.length ? `${load.items.length} custom item(s), ${countSegments(load.items)} segment(s)` : 'custom, no load defined yet') : load.kind === 'tip' ? `tip force ${fmt(load.tipForce)} N` : `flight-like lift, n = ${fmt(load.loadFactor)}`;
          field('loads', ov(desc), ov(desc), 'supplied', U && U !== 'mm' && load.kind === 'custom' ? `stations converted from ${U} to mm and line loads from N/${U} to N/mm` : '', 'load');
          if (load.kind === 'custom') load.items.forEach((it, i) => field(`loads.items[${i}]`, ov(describeItem(itemInFileUnits(doc.loads.items[i]), { len: U || 'mm', line: `N/${U || 'mm'}` })), ov(describeItem(it, { len: 'mm', line: 'N/mm' })), 'supplied', '', `load.items[${i}]`));
        }
      }
    }
    let criteria;
    if (own(doc, 'criteria')) criteria = checkCriteria(issues, doc.criteria, 'criteria', E, { fileLen: U || 'mm', toLen: toMm });

    if (issues.count) return done();
    res.geometry = outer;
    res.provenance.app = res.provenance.app || null;
    res.supplied = REQUIRED_ITEMS.filter((r) => have[r.id]).map((r) => r.id);
    res.required = REQUIRED_ITEMS.filter((r) => !have[r.id]).map((r) => ({ ...r }));
    for (const r of res.required) field(r.path, ov(null), ov(null), 'missing', `${r.label}: required before analysis`, null);
    if (res.required.length) {
      res.ok = true; res.status = 'geometry-only'; res.analysisBlocked = true;
      if (res.supplied.length) issues.warn('structure', `${res.supplied.length} of ${REQUIRED_ITEMS.length} required items are in the file; they are shown for reference and are applied only when the file supplies all of them`);
      return done();
    }
    // complete: assemble the study (defaults are reported as assumed) and run the engine checks
    const assumed = (path, target, value, unit, note) => { field(path, ov(null), ov(value, unit), 'assumed', note || 'not in the file: the Wing Lab default is used', target); return clone(value); };
    const g = clone(D);
    Object.assign(g, outer);
    g.skin = st.skin;
    g.ribThickness = st.ribThickness !== undefined ? st.ribThickness : assumed('structure.ribs.thickness', 'geometry.ribThickness', D.ribThickness, 'mm');
    g.modules = st.modules;
    g.interiorRibs = st.interiorRibs;
    g.customInteriorRibs = st.customInteriorRibs;
    g.rodFractions = st.rodFractions;
    g.rodDiameter = st.rodDiameter !== undefined ? st.rodDiameter : assumed('structure.rods.diameter', 'geometry.rodDiameter', D.rodDiameter, 'mm', 'not used: there are no rods');
    g.clearance = st.clearance !== undefined ? st.clearance : assumed('structure.rods.clearance', 'geometry.clearance', D.clearance, 'mm');
    g.sleeveWall = st.sleeveWall !== undefined ? st.sleeveWall : assumed('structure.rods.sleeveWall', 'geometry.sleeveWall', D.sleeveWall, 'mm');
    g.interfaceOffset = st.interfaceOffset !== undefined ? st.interfaceOffset : assumed('structure.interfaceOffset', 'geometry.interfaceOffset', D.interfaceOffset, 'mm');
    g.cap = st.cap !== undefined ? st.cap : assumed('structure.cap', 'geometry.cap', D.cap, 'mm');
    g.te = st.te !== undefined ? st.te : assumed('structure.trailingEdge', 'geometry.te', D.te, 'mm');
    if (st.cavityStart !== undefined) { g.cavityStart = st.cavityStart; g.cavityEnd = st.cavityEnd; }
    else { assumed('structure.cavity', 'geometry.cavityStart/cavityEnd', `${fmt(D.cavityStart)}–${fmt(D.cavityEnd)}`, 'x/c'); }
    const A = E.DEFAULT_ASSEMBLY;
    const assembly = {
      rodsBonded: st.rodsBonded !== undefined ? st.rodsBonded : assumed('structure.rods.bonded', 'assembly.rodsBonded', false, null, 'not in the file: slip-fit rods'),
      seamsBonded: st.seamsBonded !== undefined ? st.seamsBonded : assumed('structure.seams.bonded', 'assembly.seamsBonded', false, null, 'one-piece wing: there are no seams'),
      seamFreeLength: st.seamFreeLength !== undefined ? st.seamFreeLength : assumed('structure.seams.freeLength', 'assembly.seamFreeLength', 2 * g.interfaceOffset, 'mm', 'not in the file: 2 × interface rib offset (the engine rule)'),
      adhesiveTensile: st.adhesiveTensile !== undefined ? st.adhesiveTensile : assumed('structure.seams.adhesiveTensile', 'assembly.adhesiveTensile', A.adhesiveTensile, 'MPa'),
    };
    for (const k of Object.keys(A)) if (!own(assembly, k)) assembly[k] = clone(A[k]);
    if (mat.rodKey === undefined) { mat.rodKey = assumed('material.rod.card', 'rodKey', 'rod_hobby', null, 'not used: there are no rods'); mat.rodOver = { E: null }; }
    if (!criteria) criteria = assumed('criteria', 'criteria', { ...E.DEFAULT_CRITERIA }, null, `not in the file: Wing Lab defaults (tip deflection ≤ ${fmt(E.DEFAULT_CRITERIA.maxTipDeflection)} mm, tip twist ≤ ${fmt(E.DEFAULT_CRITERIA.maxTipTwist)}°)`);
    const state = { geometry: g, plaKey: mat.plaKey, plaOver: mat.plaOver, rodKey: mat.rodKey, rodOver: mat.rodOver, assembly, load, criteria };
    // Check the assembled study like a native one, then report every problem at the file's own field.
    const inner = makeIssues();
    const check = checkPrintedStudy(inner, printedStudyOf(state), 'study', E);
    if (check && !inner.count) printedEngineChecks(inner, printedState(check), 'study', E);
    inner.finish();
    inner.errors.forEach((m) => issues.err('', fileLocation(m)));
    inner.warnings.forEach((m) => issues.warn('', fileLocation(m)));
    if (check && !issues.count) { res.ok = true; res.status = 'complete'; res.analysisBlocked = false; res.state = printedState(check); }
    return done();
  }
  // "study.geometry.skin: …" (assembled study) → "structure.skin: …" (design-parameter file).
  const FILE_PATHS = [
    ['study.geometry.naca', 'airfoil.code'], ['study.geometry.semiSpan', 'span.value'], ['study.geometry.rootChord', 'rootChord'],
    ['study.geometry.tipChord', 'tipChord'], ['study.geometry.skin', 'structure.skin'], ['study.geometry.ribThickness', 'structure.ribs.thickness'],
    ['study.geometry.modules', 'structure.modules'], ['study.geometry.interiorRibs', 'structure.ribs.interior'],
    ['study.geometry.customInteriorRibs', 'structure.ribs.stations'], ['study.geometry.rodFractions', 'structure.rods.fractions'],
    ['study.geometry.rodDiameter', 'structure.rods.diameter'], ['study.geometry.clearance', 'structure.rods.clearance'],
    ['study.geometry.sleeveWall', 'structure.rods.sleeveWall'], ['study.geometry.interfaceOffset', 'structure.interfaceOffset'],
    ['study.geometry.cap', 'structure.cap'], ['study.geometry.te', 'structure.trailingEdge'], ['study.geometry.cavityStart', 'structure.cavity.start'],
    ['study.geometry.cavityEnd', 'structure.cavity.end'], ['study.geometry', 'structure'], ['study.assembly.seamFreeLength', 'structure.seams.freeLength'],
    ['study.assembly.adhesiveTensile', 'structure.seams.adhesiveTensile'], ['study.assembly.seamsBonded', 'structure.seams.bonded'],
    ['study.assembly.rodsBonded', 'structure.rods.bonded'], ['study.assembly', 'structure'], ['study.materials', 'material'],
    ['study.load', 'loads'], ['study.criteria', 'criteria'], ['study', 'design parameters'],
  ];
  function fileLocation(message) {
    for (const [from, to] of FILE_PATHS) {
      if (message.startsWith(from) && /^[.[:]/.test(message.slice(from.length))) return to + message.slice(from.length);
    }
    return message;
  }
  // File-unit copy of a raw item for the "In the file" column (display only).
  function itemInFileUnits(raw) {
    const r = {};
    for (const k of Object.keys(raw)) r[k] = raw[k];
    return r;
  }
  function fieldValue(v) {
    if (!v || v.value === null || v.value === undefined) return '—';
    const val = Array.isArray(v.value) ? v.value.map((x) => (Array.isArray(x) ? `[${x.map(fmt).join(', ')}]` : fmt(x))).join(', ') : isObj(v.value) ? Object.entries(v.value).map(([k, x]) => `${k} ${fmt(x)}`).join(', ') : fmt(v.value);
    return v.unit ? `${val} ${v.unit}` : val;
  }
  /**
   * Problems that applying an outer geometry {naca, semiSpan, rootChord, tipChord} to the current
   * printed UI state would cause (ribs outside the new span, a collapsing cavity …). Empty when none.
   */
  function checkOuterGeometry(uiState, outer, engine) {
    const E = engine || globalWing();
    try {
      const raw = canonicalPrintedFromUi(uiState, E);
      // A neutral-v1 file declares a single, straight NACA4 outer shape.
      // Never retain hidden station profiles or angles from the current study.
      for(const k of GEOMETRY_V2)delete raw.geometry[k];
      raw.geometry = { ...raw.geometry, naca: outer.naca, semiSpan: outer.semiSpan, rootChord: outer.rootChord, tipChord: outer.tipChord };
      const issues = makeIssues();
      const study = checkPrintedStudy(issues, raw, 'current study', E);
      if (study && !issues.count) printedEngineChecks(issues, printedState(study), 'current study', E);
      issues.finish();
      return issues.errors;
    } catch (e) { return [e.message]; }
  }

  // ------------------------------------------------------------------ preview (one model, two renderers)
  const ORIGIN_TEXT = Object.freeze({ supplied: 'supplied', derived: 'derived', assumed: 'assumed', missing: 'missing', unsupported: 'unsupported' });
  function provenanceRows(p, kind) {
    const rows = [];
    if (!p) return rows;
    if (p.projectName) rows.push(['Project', p.projectName]);
    rows.push(['File', p.filename || (p.source === 'share link' ? 'share link' : '—')]);
    if (p.bytes !== null && p.bytes !== undefined) rows.push(['Size', `${p.bytes} bytes`]);
    if (p.sha256) rows.push(['SHA-256', p.sha256]);
    if (kind === 'parameters') {
      rows.push(['Source app (as stated in the file)', p.app ? `${p.app}${p.appVersion ? ` ${p.appVersion}` : ''}` : '—']);
      if (p.sourceFilename) rows.push(['Source design file', p.sourceFilename]);
      if (p.exportedAt) rows.push(['Exported at', p.exportedAt]);
    } else {
      if (p.savedAt) rows.push(['Saved at', p.savedAt]);
      if (p.engine || p.savedWith) rows.push(['Saved with', `${p.savedWith || 'unknown app'}${p.engine ? `, engine ${p.engine}` : ''}`]);
    }
    return rows;
  }
  /** Display model shared by previewHtml and mount(). All values are plain text. */
  function previewModel(result) {
    if (!result || typeof result !== 'object') return { title: 'Nothing to preview', state: { kind: 'error', text: '' }, errors: [], warnings: [], lists: [], tables: [], provenance: [] };
    if (result.kind === 'parameters') {
      const st = result.status;
      const stateText = st === 'complete' ? 'Complete: every required item is in the file and the assembled study passed the WingEngine checks. Applying it does not start a solve.'
        : st === 'geometry-only' ? 'Outer geometry only — analysis blocked until skin, ribs, rods, modules/seams, material, root support and loads are supplied (in the file or in the app).'
          : 'Rejected: nothing can be applied. Fix the file or transfer the values by hand.';
      return {
        title: 'Design parameters',
        state: { kind: st === 'complete' ? 'ok' : st === 'geometry-only' ? 'blocked' : 'error', text: stateText },
        errors: result.errors.slice(), warnings: result.warnings.slice(),
        lists: result.required.length ? [{ heading: 'Required before analysis (analysis blocked)', kind: 'required', items: result.required.map((r) => `${r.label} — ${r.path}`) }] : [],
        tables: result.fields.length ? [{ caption: 'Fields: value in the file, value in the Wing Lab (mm), origin', columns: ['Field', 'In the file', 'Wing Lab value', 'Origin', 'Note'], rows: result.fields.map((f) => [f.path, fieldValue(f.original), fieldValue(f.converted), ORIGIN_TEXT[f.origin] || f.origin, f.note || '']) }] : [],
        provenance: provenanceRows(result.provenance, 'parameters'),
      };
    }
    const ws = result.workspace ? WORKSPACE_LABEL[result.workspace] : 'Wing Lab';
    return {
      title: result.ok ? `Open study: ${ws}` : 'Open study: not imported',
      state: result.ok ? { kind: result.warnings.length ? 'warn' : 'ok', text: 'Every field was checked. Apply replaces the current study; Cancel leaves it unchanged.' } : { kind: 'error', text: 'Nothing was imported; your current study is unchanged.' },
      errors: result.errors.slice(), warnings: result.warnings.slice(), lists: [],
      tables: result.ok && result.preview && result.preview.rows.length ? [{ caption: 'Study contents', columns: ['Group', 'Item', 'Value'], rows: result.preview.rows.map((r) => [r.group, r.label, r.value]) }] : [],
      provenance: provenanceRows(result.provenance, 'study'),
    };
  }
  function modelHtml(m) {
    const e = escapeHtml, out = [];
    out.push(`<section class="wio-preview-body"><h4 class="wio-preview-title">${e(m.title)}</h4>`);
    if (m.state.text) out.push(`<p class="wio-state wio-state-${e(m.state.kind)}">${e(m.state.text)}</p>`);
    if (m.errors.length) out.push(`<ul class="wio-errors" role="alert">${m.errors.map((t) => `<li>${e(t)}</li>`).join('')}</ul>`);
    if (m.warnings.length) out.push(`<ul class="wio-warnings">${m.warnings.map((t) => `<li>${e(t)}</li>`).join('')}</ul>`);
    for (const l of m.lists) out.push(`<div class="wio-list wio-list-${e(l.kind)}"><p class="wio-list-heading">${e(l.heading)}</p><ul>${l.items.map((t) => `<li>${e(t)}</li>`).join('')}</ul></div>`);
    for (const t of m.tables) out.push(`<table class="wio-table"><caption>${e(t.caption)}</caption><thead><tr>${t.columns.map((c) => `<th scope="col">${e(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    if (m.provenance.length) out.push(`<dl class="wio-provenance">${m.provenance.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>`);
    out.push('</section>');
    return out.join('');
  }
  /** Escaped HTML preview of an import result (study, link or design parameters). */
  const previewHtml = (result) => modelHtml(previewModel(result));

  // ------------------------------------------------------------------ mount(): file buttons and previews
  let mountCount = 0;
  /**
   * Build the study-file panel inside container with DOM APIs. options: {workspace:'printed'|'d520',
   * getState() → current UI state (S or MS.input), applyState(state, info), engine, documentRef,
   * download(filename, text, mime) (optional override of the browser download),
   * onPreview(node), onApplied(info, message), onDismiss(), canApply() → blocking reason (optional)}.
   * applyState is called only after validation, at most once per preview, and never starts a solve.
   */
  function mount(container, options = {}) {
    if (!container || typeof container.appendChild !== 'function') throw new Error('WingStudyIO.mount needs a container element.');
    const workspace = options.workspace || 'printed';
    if (workspace !== 'printed' && workspace !== 'd520') throw new Error('workspace must be "printed" or "d520".');
    const { getState, applyState } = options;
    if (typeof getState !== 'function' || typeof applyState !== 'function') throw new Error('mount needs getState() and applyState(state, info).');
    const doc = options.documentRef || container.ownerDocument;
    const win = doc.defaultView || {};
    const engine = options.engine || (workspace === 'printed' ? globalWing() : globalMetal());
    const uid = `wio${++mountCount}`;
    const el = (tag, attrs, ...kids) => {
      const node = doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'hidden') node.hidden = true;
        else node.setAttribute(k, v === true ? '' : String(v));
      }
      for (const c of kids) if (c !== null && c !== undefined) node.append(c);
      return node;
    };
    const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
    const button = (label, cls, onClick) => { const b = el('button', { type: 'button', class: `wio-btn ${cls}` }, label); b.addEventListener('click', onClick); return b; };
    const fileInput = (label, cls, onFile) => {
      const input = el('input', { type: 'file', accept: '.json,application/json', class: 'wio-file-input' });
      const lab = el('label', { class: `wio-btn wio-file ${cls}` }, el('span', { class: 'wio-file-text' }, label), input);
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        input.value = '';
        if (f) track(onFile(f));
      });
      return { label: lab, input };
    };
    let pending = Promise.resolve();
    let previewGeneration = 0, destroyed = false;
    const activeReaders = new Set();
    function invalidatePreview() {
      previewGeneration++;
      for (const reader of activeReaders) {
        try { reader.abort(); } catch (_) { /* Some embedded readers cannot abort; the generation guard still applies. */ }
      }
      activeReaders.clear();
      return previewGeneration;
    }
    const currentPreview = (generation) => !destroyed && generation === previewGeneration;
    const track = (p) => { pending = Promise.resolve(p).catch((e) => showFailure('Unexpected problem', [e && e.message ? e.message : String(e)])); return pending; };

    const root = el('div', { class: `wio-root wio-${workspace}`, role: 'group', 'aria-labelledby': `${uid}-title` });
    const title = el('h3', { class: 'wio-title', id: `${uid}-title` }, workspace === 'printed' ? 'Study files' : 'D.520 study files');
    const actions = el('div', { class: 'wio-actions' });
    const status = el('p', { class: 'wio-status', role: 'status', 'aria-live': 'polite' });
    const preview = el('div', { class: 'wio-preview', role: 'region', 'aria-label': 'Import preview', hidden: true });
    const saveBtn = button('Save study', 'wio-save', () => save());
    const open = fileInput('Open study (.json)', 'wio-open', (f) => openFile(f));
    actions.append(saveBtn, open.label);
    let params = null, pasteBox = null, pasteArea = null, templateBtn = null, pasteToggle = null;
    if (workspace === 'printed') {
      params = fileInput('Import design parameters (.json)', 'wio-params', (f) => importParametersFile(f));
      pasteToggle = button('Paste design parameters', 'wio-paste-toggle', () => {
        pasteBox.hidden = !pasteBox.hidden;
        pasteToggle.setAttribute('aria-expanded', String(!pasteBox.hidden));
        if (!pasteBox.hidden && pasteArea.focus) pasteArea.focus();
      });
      pasteToggle.setAttribute('aria-expanded', 'false');
      pasteToggle.setAttribute('aria-controls', `${uid}-paste-box`);
      templateBtn = button('Download parameter template', 'wio-template', () => downloadText('mie446-wing-parameters-template.json', parameterTemplateText(), 'Parameter template downloaded.'));
      actions.append(params.label, pasteToggle, templateBtn);
      pasteArea = el('textarea', { id: `${uid}-paste`, class: 'wio-paste-text', rows: '8', spellcheck: 'false', autocomplete: 'off' });
      pasteBox = el('div', { class: 'wio-paste', id: `${uid}-paste-box`, hidden: true },
        el('label', { for: `${uid}-paste`, class: 'wio-paste-label' }, 'Design parameters (JSON text, format mie446-wing-parameters)'),
        pasteArea,
        button('Preview pasted parameters', 'wio-paste-preview', () => previewParameters(pasteArea.value, 'pasted text')));
    }
    root.append(title, actions);
    if (pasteBox) root.append(pasteBox);
    root.append(status, preview);
    container.appendChild(root);

    const say = (msg) => { status.textContent = msg; };
    function downloadText(filename, textValue, done) {
      try {
        if (typeof options.download === 'function') options.download(filename, textValue, 'application/json');
        else {
          let url, revoke = false;
          if (win.URL && typeof win.URL.createObjectURL === 'function' && win.Blob) { url = win.URL.createObjectURL(new win.Blob([textValue], { type: 'application/json' })); revoke = true; }
          else url = `data:application/json;charset=utf-8,${encodeURIComponent(textValue)}`;
          const a = el('a', { href: url, download: filename, rel: 'noopener', class: 'wio-download' });
          a.style.display = 'none';
          (doc.body || root).appendChild(a);
          a.click();
          a.remove();
          if (revoke && typeof win.setTimeout === 'function') win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
        }
        say(done);
        return true;
      } catch (e) { showFailure('Download failed', [e.message || String(e)]); return false; }
    }
    function stamp() { const d = new Date(), p = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
    function save() {
      let textValue;
      try { textValue = workspace === 'printed' ? exportPrintedStudy(getState(), engine) : exportD520Study(getState(), engine); }
      catch (e) { showFailure('The study could not be saved', e.errors || [e.message || String(e)]); return null; }
      const name = JSON.parse(textValue).projectName;
      const filename = name ? `${safeFilenameStem(name)}.json` : `mie446-${workspace === 'printed' ? 'printed-wing' : 'd520'}-study-${stamp()}.json`;
      return downloadText(filename, textValue, `Saved ${filename}.`) ? textValue : null;
    }
    function readFile(file) {
      return new Promise((resolve) => {
        if (typeof file.size === 'number' && file.size > LIMITS.fileBytes) { resolve({ error: `The file is too large (${file.size} bytes; the limit is ${LIMITS.fileBytes} bytes = ${LIMITS.fileBytes / 1024} KiB).` }); return; }
        if (!win.FileReader) { resolve({ error: 'This browser cannot read local files.' }); return; }
        let reader;
        const finish = (result) => { activeReaders.delete(reader); resolve(result); };
        try {
          reader = new win.FileReader(); activeReaders.add(reader);
          reader.onload = () => finish({ bytes: new Uint8Array(reader.result) });
          reader.onerror = () => finish({ error: 'The file could not be read.' });
          reader.onabort = () => finish({ aborted: true });
          reader.readAsArrayBuffer(file);
        } catch (e) { finish({ error: e.message || 'The file could not be read.' }); }
      });
    }
    function showFailure(heading, errors) {
      clear(preview);
      preview.append(el('div', { class: 'wio-actions wio-preview-actions' }, button('Dismiss', 'wio-dismiss', cancel)));
      preview.append(renderModel({ title: heading, state: { kind: 'error', text: 'Nothing was changed.' }, errors, warnings: [], lists: [], tables: [], provenance: [] }));
      preview.hidden = false;
      say(heading);
      presentPreview();
    }
    function cancel() { invalidatePreview(); clear(preview); preview.hidden = true; say('Nothing was changed.'); options.onDismiss?.(); }
    function presentPreview() {
      // The host may present this real node in a visible dialog instead of a scrolled sidebar.
      options.onPreview?.(preview);
      const action = preview.querySelector('button');
      action?.focus({ preventScroll: true });
    }
    function renderModel(m) {
      const box = el('section', { class: 'wio-preview-body' }, el('h4', { class: 'wio-preview-title' }, m.title));
      if (m.state.text) box.append(el('p', { class: `wio-state wio-state-${m.state.kind}` }, m.state.text));
      if (m.errors.length) box.append(el('ul', { class: 'wio-errors', role: 'alert' }, ...m.errors.map((t) => el('li', {}, t))));
      if (m.warnings.length) box.append(el('ul', { class: 'wio-warnings' }, ...m.warnings.map((t) => el('li', {}, t))));
      for (const l of m.lists) box.append(el('div', { class: `wio-list wio-list-${l.kind}` }, el('p', { class: 'wio-list-heading' }, l.heading), el('ul', {}, ...l.items.map((t) => el('li', {}, t)))));
      for (const t of m.tables) {
        box.append(el('table', { class: 'wio-table' }, el('caption', {}, t.caption),
          el('thead', {}, el('tr', {}, ...t.columns.map((c) => el('th', { scope: 'col' }, c)))),
          el('tbody', {}, ...t.rows.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, c)))))));
      }
      if (m.provenance.length) { const dl = el('dl', { class: 'wio-provenance' }); for (const [k, v] of m.provenance) dl.append(el('dt', {}, k), el('dd', {}, v)); box.append(dl); }
      return box;
    }
    function show(result, buttons) {
      clear(preview);
      // Keep confirmation beside the file controls, not below a long inventory.
      preview.append(el('div', { class: 'wio-actions wio-preview-actions' }, ...buttons));
      preview.append(renderModel(previewModel(result)));
      preview.hidden = false;
      presentPreview();
    }
    function applyOnce(stateValue, info, doneText) {
      let used = false;
      const generation = previewGeneration;
      return () => {
        if (used || !currentPreview(generation)) return;
        const blocked = options.canApply?.();
        if (blocked) {
          let note = preview.querySelector('.wio-apply-error');
          if (!note) { note = el('p', { class: 'wio-apply-error', role: 'alert' }); preview.querySelector('.wio-preview-actions').append(note); }
          note.textContent = blocked;
          say(blocked);
          return;
        }
        used = true;
        invalidatePreview();
        try { applyState(clone(stateValue), info); }
        catch (e) { showFailure('The app could not apply the data', [e.message || String(e)]); return; }
        clear(preview); preview.hidden = true; say(doneText);
        options.onApplied?.(info, doneText);
      };
    }
    function showStudy(result) {
      if (!result.ok) { show(result, [button('Dismiss', 'wio-dismiss', cancel)]); say('The study was not imported.'); return result; }
      const info = { kind: 'study', workspace, provenance: clone(result.provenance), warnings: result.warnings.slice() };
      show(result, [button('Apply', 'wio-apply', applyOnce(result.state, info, `Study applied${result.provenance.filename ? ` from ${result.provenance.filename}` : ''}. Run the study to see results.`)), button('Cancel', 'wio-cancel', cancel), el('p', { class: 'wio-apply-help' }, 'File read successfully. Click Apply to replace the current wing with this design, or Cancel to keep it.')]);
      say('Check the preview, then Apply or Cancel.');
      return result;
    }
    async function openFile(file) {
      const generation = invalidatePreview();
      if (destroyed) return null;
      clear(preview);
      preview.append(el('p', { role: 'status' }, `Reading ${cleanName(file && file.name)}… Your current wing has not changed.`));
      preview.hidden = false;
      say('Reading the selected study file…');
      presentPreview();
      const got = await readFile(file);
      if (!currentPreview(generation) || got.aborted) return null;
      const name = cleanName(file && file.name);
      if (got.error) { showFailure('The study was not imported', [got.error]); return null; }
      return showStudy(importStudy(got.bytes, { workspace, engine, metalEngine: workspace === 'd520' ? engine : undefined, filename: name }));
    }
    function openText(textValue, filename) { invalidatePreview(); if (destroyed) return null; return showStudy(importStudy(textValue, { workspace, engine, metalEngine: workspace === 'd520' ? engine : undefined, filename })); }
    function showParameters(result) {
      const buttons = [];
      if (result.ok && result.geometry) {
        let conflicts = [];
        try { conflicts = checkOuterGeometry(getState(), result.geometry, engine); } catch (e) { conflicts = [e.message]; }
        if (conflicts.length) result.warnings.push(...conflicts.map((c) => `Applied to your current study, this outer geometry gives a problem to fix in the app before analysis: ${c}`));
        const info = {
          kind: 'outer-geometry', workspace, analysisBlocked: true, required: REQUIRED_ITEMS.map((r) => ({ ...r })), suppliedByFile: result.supplied.slice(), conflicts,
          provenance: clone(result.provenance), fields: clone(result.fields.filter((f) => ['geometry.naca', 'geometry.semiSpan', 'geometry.rootChord', 'geometry.tipChord'].includes(f.target))),
        };
        buttons.push(button('Apply outer geometry', 'wio-apply-geometry', applyOnce({ geometry: clone(result.geometry) }, info, 'Outer geometry applied. The analysis stays blocked until skin, ribs, rods, modules/seams, material, root support and loads are confirmed in the app.')));
        if (result.status === 'complete') {
          buttons.push(button('Apply complete study', 'wio-apply-complete', applyOnce(result.state, { kind: 'parameters-complete', workspace, analysisBlocked: false, provenance: clone(result.provenance), fields: clone(result.fields) }, 'Design parameters applied. Run the study to see results.')));
        }
      }
      buttons.push(button(result.ok ? 'Cancel' : 'Dismiss', result.ok ? 'wio-cancel' : 'wio-dismiss', cancel));
      show(result, buttons);
      say(result.ok ? 'Check the preview: values in the file, converted values and origins.' : 'The design parameters were rejected.');
      return result;
    }
    function previewParameters(textValue, filename) { invalidatePreview(); if (destroyed) return null; return showParameters(importParameters(textValue, { engine, filename: filename || 'pasted text' })); }
    async function importParametersFile(file) {
      const generation = invalidatePreview();
      if (destroyed) return null;
      const got = await readFile(file);
      if (!currentPreview(generation) || got.aborted) return null;
      if (got.error) { showFailure('The design parameters were not imported', [got.error]); return null; }
      return showParameters(importParameters(got.bytes, { engine, filename: cleanName(file && file.name) }));
    }
    return {
      root, save, openFile: (f) => track(openFile(f)), openText, previewParameters, cancel,
      idle: () => pending, destroy() { destroyed = true; invalidatePreview(); root.remove(); },
    };
  }

  return Object.freeze({
    VERSION: IO_VERSION, STUDY_FORMAT, PARAMS_FORMAT, FILE_VERSION, SHARE_KEY, LIMITS, PARAMETER_TEMPLATE, REQUIRED_ITEMS,
    escapeHtml, normalizeProjectName, safeFilenameStem, sha256, utf8Encode, utf8Decode, base64urlEncode, base64urlDecode, parseJson, countSegments,
    printedStudyDocument, exportPrintedStudy, importPrintedStudy, printedEngineInput, fabricationIssues,
    d520StudyDocument, exportD520Study, importD520Study, importStudy,
    importParameters, parameterTemplateText, checkOuterGeometry,
    encodeShare, decodeShare, shareFragment,
    previewModel, previewHtml, mount,
  });
}));
