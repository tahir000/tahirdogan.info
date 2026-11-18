/* Bağımlılıksız, VakıfBank ekstre PDF'leri için yeterli metin çıkarıcı.
   PdfMetin.extract(Uint8Array) -> [{page, lines:[{y, text, items:[{x, s}]}]}] (satırlar y'ye göre gruplanır, x'e göre sıralanır) */
(function () {
  'use strict';
  const Z = globalThis.Zip;

  const WIN = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ' };
  const winChar = b => WIN[b] || String.fromCharCode(b);
  const latin1 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return s; };
  const BOS = new Uint8Array(0), SATIR = new Uint8Array([10]);

  function parseObjects(buf) {
    const s = latin1(buf);
    const objs = {}; const re = /(\d+)\s+(\d+)\s+obj\b/g; let m; const starts = [];
    while ((m = re.exec(s))) starts.push({ num: +m[1], bodyStart: m.index + m[0].length });
    for (const st of starts) {
      const endIdx = s.indexOf('endobj', st.bodyStart);
      const body = s.slice(st.bodyStart, endIdx < 0 ? undefined : endIdx);
      const si = body.search(/\bstream\r?\n/);
      const o = { num: st.num, dict: body, streamRaw: null, absStreamStart: null };
      if (si >= 0) { o.dict = body.slice(0, si); o.absStreamStart = st.bodyStart + si + body.slice(si).match(/^stream\r?\n/)[0].length; }
      objs[st.num] = o;
    }
    for (const k in objs) {
      const o = objs[k]; if (o.absStreamStart == null) continue;
      let len = null; const ml = o.dict.match(/\/Length\s+(\d+)(\s+(\d+)\s+R)?/);
      if (ml) { if (ml[2]) { const ref = objs[+ml[1]]; if (ref) len = parseInt(ref.dict.trim()); } else len = +ml[1]; }
      if (len == null || isNaN(len)) { const e = s.indexOf('endstream', o.absStreamStart); len = e - o.absStreamStart; }
      o.streamRaw = buf.subarray(o.absStreamStart, o.absStreamStart + len);
    }
    return objs;
  }
  function streamData(o) {
    if (!o || !o.streamRaw) return null;
    if (o._data) return o._data;
    let d = o.streamRaw;
    if (/FlateDecode/.test(o.dict)) { try { d = Z.inflate(d); } catch (e) { d = BOS; } }
    o._data = d; return d;
  }
  function hexToBytes(h) { h = h.replace(/[^0-9a-fA-F]/g, ''); if (h.length % 2) h += '0'; const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
  function parseCMap(txt) {
    const map = {}; let codeLen = 1;
    const cs = txt.match(/begincodespacerange([\s\S]*?)endcodespacerange/);
    if (cs) { const h = cs[1].match(/<([0-9a-fA-F]+)>/); if (h) codeLen = h[1].length / 2; }
    const uni = h => { const b = hexToBytes(h); let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; };
    for (const blk of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map[parseInt(p[1], 16)] = uni(p[2]);
    for (const blk of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
        const a = parseInt(p[1], 16), b = parseInt(p[2], 16);
        if (p[4]) { const base = hexToBytes(p[4]); for (let c = a; c <= b; c++) { const bb = new Uint8Array(base); bb[bb.length - 1] += (c - a); let s = ''; for (let i = 0; i + 1 < bb.length; i += 2) s += String.fromCharCode((bb[i] << 8) | bb[i + 1]); map[c] = s; } }
        else { const arr = [...p[5].matchAll(/<([0-9a-fA-F]+)>/g)].map(x => uni(x[1])); for (let c = a; c <= b; c++) map[c] = arr[c - a] || ''; }
      }
    }
    return { map, codeLen };
  }
  function getRef(dict, key) { const m = dict.match(new RegExp('/' + key + '\\s+(\\d+)\\s+\\d+\\s+R')); return m ? +m[1] : null; }
  function fontInfo(objs, num) {
    const o = objs[num]; if (!o) return { codeLen: 1, map: null };
    const tu = getRef(o.dict, 'ToUnicode');
    let cm = null; if (tu) { const d = streamData(objs[tu]); if (d) cm = parseCMap(latin1(d)); }
    return { codeLen: /Identity-H/.test(o.dict) ? 2 : (cm ? cm.codeLen : 1), map: cm ? cm.map : null };
  }
  function decode(bytes, f) {
    let out = '';
    if (f.codeLen === 2) { for (let i = 0; i + 1 < bytes.length; i += 2) { const c = (bytes[i] << 8) | bytes[i + 1]; out += (f.map && f.map[c] != null) ? f.map[c] : ''; } }
    else { for (const b of bytes) out += (f.map && f.map[b] != null) ? f.map[b] : winChar(b); }
    return out;
  }
  const ESC = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
  function parseLiteral(s, i) {
    let depth = 1; const out = []; i++;
    while (i < s.length && depth > 0) {
      const c = s[i];
      if (c === '\\') {
        const n = s[i + 1];
        if (ESC[n] != null) { out.push(ESC[n]); i += 2; continue; }
        if (/[0-7]/.test(n)) { let o = ''; let j = i + 1; while (j < i + 4 && /[0-7]/.test(s[j])) o += s[j++]; out.push(parseInt(o, 8) & 255); i = j; continue; }
        if (n === '\r' || n === '\n') { i += 2; if (n === '\r' && s[i] === '\n') i++; continue; }
        out.push((n || '').charCodeAt(0) & 255); i += 2; continue;
      }
      if (c === '(') depth++;
      if (c === ')') { depth--; if (depth === 0) { i++; break; } }
      out.push(c.charCodeAt(0) & 255); i++;
    }
    return { bytes: Uint8Array.from(out), next: i };
  }
  function runContent(data, fonts) {
    const s = latin1(data); const items = []; const stack = [];
    let i = 0, font = null, tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0], leading = 0, ctm = [1, 0, 0, 1, 0, 0]; const gs = [];
    const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
    const pushText = str => { if (str) { const m = mul(tm, ctm); items.push({ x: m[4], y: m[5], s: str }); } };
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      if (c === '(') { const r = parseLiteral(s, i); stack.push({ t: 'str', b: r.bytes }); i = r.next; continue; }
      if (c === '<' && s[i + 1] !== '<') { const e = s.indexOf('>', i); stack.push({ t: 'str', b: hexToBytes(s.slice(i + 1, e)) }); i = e + 1; continue; }
      if (c === '<' && s[i + 1] === '<') { const e = s.indexOf('>>', i); i = e < 0 ? s.length : e + 2; continue; }
      if (c === '[') { stack.push({ t: 'mark' }); i++; continue; }
      if (c === ']') { const arr = []; while (stack.length && stack[stack.length - 1].t !== 'mark') arr.unshift(stack.pop()); stack.pop(); stack.push({ t: 'arr', v: arr }); i++; continue; }
      if (c === '/') { let j = i + 1; while (j < s.length && !/[\s\/\[\]\(\)<>{}%]/.test(s[j])) j++; stack.push({ t: 'name', v: s.slice(i + 1, j) }); i = j; continue; }
      let j = i; while (j < s.length && !/[\s\/\[\]\(\)<>{}%]/.test(s[j])) j++;
      if (j === i) { i++; continue; }
      const tok = s.slice(i, j); i = j;
      if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(tok)) { stack.push({ t: 'num', v: parseFloat(tok) }); continue; }
      const nums = n => stack.splice(-n).map(x => x.v);
      switch (tok) {
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; stack.length = 0; break;
        case 'q': gs.push(ctm.slice()); stack.length = 0; break;
        case 'Q': ctm = gs.pop() || [1, 0, 0, 1, 0, 0]; stack.length = 0; break;
        case 'cm': { const a = nums(6); ctm = mul(a, ctm); break; }
        case 'Tf': { const a = stack.splice(-2); font = (a[0] && fonts[a[0].v]) || { codeLen: 1, map: null }; break; }
        case 'Tm': { const a = nums(6); tm = a.slice(); tlm = a.slice(); break; }
        case 'Td': { const a = nums(2); tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] + a[0] * tlm[0] + a[1] * tlm[2], tlm[5] + a[0] * tlm[1] + a[1] * tlm[3]]; tm = tlm.slice(); break; }
        case 'TD': { const a = nums(2); leading = -a[1]; tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] + a[0] * tlm[0] + a[1] * tlm[2], tlm[5] + a[0] * tlm[1] + a[1] * tlm[3]]; tm = tlm.slice(); break; }
        case 'TL': leading = nums(1)[0]; break;
        case 'T*': tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] - leading * tlm[2], tlm[5] - leading * tlm[3]]; tm = tlm.slice(); break;
        case 'Tj': { const a = stack.pop(); if (a && a.t === 'str' && font) pushText(decode(a.b, font)); stack.length = 0; break; }
        case "'": { tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] - leading * tlm[2], tlm[5] - leading * tlm[3]]; tm = tlm.slice(); const a = stack.pop(); if (a && a.t === 'str' && font) pushText(decode(a.b, font)); stack.length = 0; break; }
        case 'TJ': { const a = stack.pop(); if (a && a.t === 'arr' && font) { let str = ''; for (const el of a.v) { if (el.t === 'str') str += decode(el.b, font); else if (el.t === 'num' && el.v < -200) str += ' '; } pushText(str); } stack.length = 0; break; }
        default: if (/^[A-Za-z\*"']+$/.test(tok)) stack.length = 0;
      }
    }
    return items;
  }
  function pageList(objs) {
    const out = [];
    let rootRef = null; for (const k in objs) if (/\/Type\s*\/Catalog/.test(objs[k].dict)) { rootRef = getRef(objs[k].dict, 'Pages'); break; }
    const gorulen = new Set();
    const walk = n => { const o = objs[n]; if (!o || gorulen.has(n)) return; gorulen.add(n); if (/\/Type\s*\/Pages\b/.test(o.dict)) { const kids = (o.dict.match(/\/Kids\s*\[([^\]]*)\]/) || [, ''])[1]; for (const r of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(+r[1]); } else if (/\/Type\s*\/Page\b/.test(o.dict)) out.push(o); };
    if (rootRef) walk(rootRef);
    if (!out.length) for (const k in objs) if (/\/Type\s*\/Page\b/.test(objs[k].dict)) out.push(objs[k]);
    return out;
  }
  function resolveDict(objs, dict, key) {
    const ref = dict.match(new RegExp('/' + key + '\\s+(\\d+)\\s+\\d+\\s+R'));
    if (ref) return objs[+ref[1]] ? objs[+ref[1]].dict : '';
    const k = dict.indexOf('/' + key); if (k < 0) return '';
    const i = dict.indexOf('<<', k); if (i < 0) return ''; let depth = 0, j = i;
    for (; j < dict.length; j++) { if (dict.startsWith('<<', j)) { depth++; j++; } else if (dict.startsWith('>>', j)) { depth--; j++; if (depth === 0) break; } }
    return dict.slice(i, j + 1);
  }
  function extract(buf) {
    const objs = parseObjects(buf); const res = [];
    pageList(objs).forEach((p, pi) => {
      const fd = resolveDict(objs, resolveDict(objs, p.dict, 'Resources'), 'Font');
      const fonts = {}; for (const m of fd.matchAll(/\/([^\s\/<>\[\]]+)\s+(\d+)\s+\d+\s+R/g)) fonts[m[1]] = fontInfo(objs, +m[2]);
      let contents = []; const cArr = p.dict.match(/\/Contents\s*\[([^\]]*)\]/);
      if (cArr) contents = [...cArr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(x => +x[1]); else { const c = getRef(p.dict, 'Contents'); if (c) contents = [c]; }
      const data = Z.birlestir(contents.flatMap(n => [streamData(objs[n]) || BOS, SATIR]));
      const items = runContent(data, fonts).filter(it => it.s.trim() !== '');
      items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      const lines = [];
      for (const it of items) { const last = lines[lines.length - 1]; if (last && Math.abs(last.y - it.y) < 2.5) last.items.push(it); else lines.push({ y: it.y, items: [it] }); }
      for (const l of lines) {
        l.items.sort((a, b) => a.x - b.x);
        const cells = [];
        for (const it of l.items) { const c = cells[cells.length - 1]; if (c && Math.abs(c.x - it.x) < 0.5) c.s += it.s; else cells.push({ x: it.x, y: it.y, s: it.s }); }
        for (const c of cells) c.s = c.s.replace(/\s+/g, ' ').trim();
        l.items = cells.filter(c => c.s);
        l.text = l.items.map(x => x.s).join(' ').replace(/\s+/g, ' ').trim();
      }
      res.push({ page: pi + 1, lines });
    });
    return res;
  }
  globalThis.PdfMetin = { extract };
})();
