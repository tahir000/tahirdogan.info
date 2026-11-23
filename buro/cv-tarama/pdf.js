/* Bağımlılıksız PDF metin çıkarıcı (Ekstre 89/1 aracındakinin CV'ler için genişletilmiş kopyası:
   sıkıştırılmış nesne akışları (ObjStm), /Differences glif adları, şifreli dosya tespiti).
   PdfMetin.extract(Uint8Array) -> [{page, lines:[{y, text, items:[{x, s}]}]}] (satırlar y'ye göre gruplanır, x'e göre sıralanır)
   PdfMetin.metin(Uint8Array) -> düz metin (satırlar \n ile) */
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
    // Sıkıştırılmış nesne akışları: içlerindeki nesneler düz metinde görünmez
    for (const k of Object.keys(objs)) {
      const o = objs[k]; if (!/\/Type\s*\/ObjStm\b/.test(o.dict)) continue;
      let d = streamData(o); if (!d || !d.length) continue;
      const n = +((o.dict.match(/\/N\s+(\d+)/) || [])[1] || 0), first = +((o.dict.match(/\/First\s+(\d+)/) || [])[1] || 0);
      const t = latin1(d); const bas = t.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < n && 2 * i + 1 < bas.length; i++) {
        const num = bas[2 * i], ofs = first + bas[2 * i + 1], son = 2 * i + 3 < bas.length ? first + bas[2 * i + 3] : t.length;
        if (!objs[num]) objs[num] = { num, dict: t.slice(ofs, son), streamRaw: null, absStreamStart: null };
      }
    }
    return objs;
  }
  function streamData(o) {
    if (!o || !o.streamRaw) return null;
    if (o._data) return o._data;
    let d = o.streamRaw;
    if (/ASCII85Decode|\/A85\b/.test(o.dict)) d = a85(d);
    else if (/ASCIIHexDecode|\/AHx\b/.test(o.dict)) d = hexToBytes(latin1(d).replace(/>.*$/s, ''));
    if (/FlateDecode/.test(o.dict)) { try { d = Z.inflate(d); } catch (e) { d = BOS; } }
    o._data = d; return d;
  }
  function a85(u) {
    const s = latin1(u).replace(/^\s*<~/, '').replace(/~>.*$/s, '').replace(/\s+/g, ''); const out = []; let grup = [];
    for (const c of s) {
      if (c === 'z' && !grup.length) { out.push(0, 0, 0, 0); continue; }
      grup.push(c.charCodeAt(0) - 33);
      if (grup.length === 5) { let v = 0; for (const g of grup) v = v * 85 + g; out.push(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255); grup = []; }
    }
    if (grup.length > 1) { const n = grup.length; while (grup.length < 5) grup.push(84); let v = 0; for (const g of grup) v = v * 85 + g; out.push(...[v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255].slice(0, n - 1)); }
    return Uint8Array.from(out);
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
  // Glif adı -> karakter (ToUnicode olmayan basit yazı tiplerinde /Differences için)
  const GLIF = { space: ' ', period: '.', comma: ',', colon: ':', semicolon: ';', hyphen: '-', endash: '–', emdash: '—', at: '@', slash: '/', parenleft: '(', parenright: ')', plus: '+', underscore: '_', quoteright: '’', quotesingle: "'", ampersand: '&', bullet: '•', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', scedilla: 'ş', Scedilla: 'Ş', gbreve: 'ğ', Gbreve: 'Ğ', dotlessi: 'ı', Idotaccent: 'İ', Idot: 'İ', ccedilla: 'ç', Ccedilla: 'Ç', odieresis: 'ö', Odieresis: 'Ö', udieresis: 'ü', Udieresis: 'Ü', acircumflex: 'â', icircumflex: 'î', ucircumflex: 'û' };
  const glif = ad => GLIF[ad] || (/^[A-Za-z]$/.test(ad) ? ad : /^uni([0-9A-Fa-f]{4})$/.test(ad) ? String.fromCharCode(parseInt(ad.slice(3), 16)) : /^[A-Za-z]\.\w+$/.test(ad) ? ad[0] : null);
  function farklar(objs, dict) {
    let enc = dict; const r = getRef(dict, 'Encoding'); if (r && objs[r]) enc = objs[r].dict;
    const m = enc.match(/\/Differences\s*\[([^\]]*)\]/); if (!m) return null;
    const map = {}; let kod = 0;
    for (const t of m[1].match(/\d+|\/[^\s\/\[\]]+/g) || []) { if (t[0] === '/') { const c = glif(t.slice(1)); if (c != null) map[kod] = c; kod++; } else kod = +t; }
    return map;
  }
  function parantez(s, i) { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === '[') d++; else if (s[j] === ']') { d--; if (!d) return s.slice(i + 1, j); } } return s.slice(i + 1); }
  // sözlükteki dizi değeri (doğrudan ya da dolaylı nesne), köşeli parantezsiz metin
  function dizi(objs, dict, key) {
    const ref = dict.match(new RegExp('/' + key + '\\s+(\\d+)\\s+\\d+\\s+R'));
    if (ref) { const o = objs[+ref[1]]; if (!o) return null; const i = o.dict.indexOf('['); return i < 0 ? null : parantez(o.dict, i); }
    const k = dict.search(new RegExp('/' + key + '\\s*\\[')); if (k < 0) return null;
    return parantez(dict, dict.indexOf('[', k));
  }
  // Glif genişlikleri (1/1000 birim): harf harf yerleştirilen metinde (Canva vb.) boşlukları bulmak için
  function genislikler(objs, dict) {
    if (/\/Subtype\s*\/Type0/.test(dict)) {
      const dfa = dizi(objs, dict, 'DescendantFonts') || '';
      const r = !/<</.test(dfa) && dfa.match(/(\d+)\s+\d+\s+R/);
      const dd = /<</.test(dfa) ? dfa : r && objs[+r[1]] ? objs[+r[1]].dict : '';
      const dw = +((dd.match(/\/DW\s+([\d.]+)/) || [])[1] || 1000); const W = {};
      // W içinde dizi yerine dolaylı nesne olabilir: [0 9 0 R]
      const wa = (dizi(objs, dd, 'W') || '').replace(/(\d+)\s+\d+\s+R/g, (m, n) => { const o = objs[+n]; const i = o ? o.dict.indexOf('[') : -1; return i < 0 ? '' : '[' + parantez(o.dict, i) + ']'; });
      if (wa) {
        const tk = wa.match(/\[|\]|[-+]?[\d.]+/g) || []; let p = 0;
        while (p < tk.length) {
          const c = +tk[p++];
          if (tk[p] === '[') { p++; let k = c; while (p < tk.length && tk[p] !== ']') W[k++] = +tk[p++]; p++; }
          else { const c2 = +tk[p++], w = +tk[p++]; for (let k = c; k <= c2 && k - c < 65536; k++) W[k] = w; }
        }
      }
      return c => W[c] != null ? W[c] : dw;
    }
    const fc = +((dict.match(/\/FirstChar\s+(\d+)/) || [])[1] || 0);
    const wa = dizi(objs, dict, 'Widths'); const arr = wa ? (wa.match(/[-+]?[\d.]+/g) || []).map(Number) : [];
    return c => { const w = arr[c - fc]; return w != null && w > 0 ? w : 500; };
  }
  function fontInfo(objs, num) {
    const o = objs[num]; if (!o) return { codeLen: 1, map: null, w: () => 500 };
    const tu = getRef(o.dict, 'ToUnicode');
    let cm = null; if (tu) { const d = streamData(objs[tu]); if (d) cm = parseCMap(latin1(d)); }
    if (!cm) { const f = farklar(objs, o.dict); if (f) cm = { map: f, codeLen: 1 }; }
    return { codeLen: /Identity-H/.test(o.dict) ? 2 : (cm ? cm.codeLen : 1), map: cm ? cm.map : null, w: genislikler(objs, o.dict) };
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
  function fontlar(objs, res) {
    const fd = resolveDict(objs, res, 'Font');
    const fonts = {}; for (const m of fd.matchAll(/\/([^\s\/<>\[\]]+)\s+(\d+)\s+\d+\s+R/g)) fonts[m[1]] = fontInfo(objs, +m[2]);
    return fonts;
  }
  // res: kaynak sözlüğü (Font, XObject); form XObject'lerin (Do) içine derinlik sınırıyla iner
  function runContent(data, res, objs, ctm0, derinlik) {
    const fonts = fontlar(objs, res);
    const s = latin1(data); const items = []; const stack = [];
    let i = 0, font = null, tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0], leading = 0, ctm = ctm0 || [1, 0, 0, 1, 0, 0]; const gs = [];
    let fs = 1, Tc = 0, Tw = 0, Th = 1;
    const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
    const ilerle = d => { tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + d * tm[0], tm[5] + d * tm[1]]; };
    // metni yazar, metin matrisini glif genişlikleri kadar ilerletir; öğe başlangıç ve bitiş x'ini taşır
    const goster = b => {
      if (!font) return;
      const m0 = mul(tm, ctm); const adim = font.codeLen === 2 ? 2 : 1; let str = '', d = 0;
      for (let k = 0; k + adim - 1 < b.length; k += adim) {
        const c = adim === 2 ? (b[k] << 8) | b[k + 1] : b[k];
        str += font.map && font.map[c] != null ? font.map[c] : (adim === 2 ? '' : winChar(c));
        d += (font.w(c) / 1000) * fs + Tc + (adim === 1 && c === 32 ? Tw : 0);
      }
      ilerle(d * Th);
      if (str) { const m1 = mul(tm, ctm); items.push({ x: m0[4], y: m0[5], xe: m1[4], s: str, fs: Math.abs(fs) * (Math.hypot(m0[2], m0[3]) || 1) }); }
    };
    const satirBasi = () => { tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] - leading * tlm[2], tlm[5] - leading * tlm[3]]; tm = tlm.slice(); };
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
        case 'q': gs.push([ctm.slice(), font, fs, Tc, Tw, Th]); stack.length = 0; break;
        case 'Q': { const g = gs.pop(); if (g) [ctm, font, fs, Tc, Tw, Th] = g; else ctm = [1, 0, 0, 1, 0, 0]; stack.length = 0; break; }
        case 'Tc': Tc = nums(1)[0] || 0; break;
        case 'Tw': Tw = nums(1)[0] || 0; break;
        case 'Tz': Th = (nums(1)[0] || 100) / 100; break;
        case 'cm': { const a = nums(6); ctm = mul(a, ctm); break; }
        case 'Tf': { const a = stack.splice(-2); font = (a[0] && fonts[a[0].v]) || { codeLen: 1, map: null, w: () => 500 }; fs = (a[1] && a[1].v) || 1; break; }
        case 'Tm': { const a = nums(6); tm = a.slice(); tlm = a.slice(); break; }
        case 'Td': { const a = nums(2); tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] + a[0] * tlm[0] + a[1] * tlm[2], tlm[5] + a[0] * tlm[1] + a[1] * tlm[3]]; tm = tlm.slice(); break; }
        case 'TD': { const a = nums(2); leading = -a[1]; tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] + a[0] * tlm[0] + a[1] * tlm[2], tlm[5] + a[0] * tlm[1] + a[1] * tlm[3]]; tm = tlm.slice(); break; }
        case 'TL': leading = nums(1)[0]; break;
        case 'T*': satirBasi(); break;
        case 'Tj': { const a = stack.pop(); if (a && a.t === 'str') goster(a.b); stack.length = 0; break; }
        case "'": { satirBasi(); const a = stack.pop(); if (a && a.t === 'str') goster(a.b); stack.length = 0; break; }
        case '"': { const a = stack.pop(); const n = stack.splice(-2).map(x => x.v); Tw = n[0] || 0; Tc = n[1] || 0; satirBasi(); if (a && a.t === 'str') goster(a.b); stack.length = 0; break; }
        case 'TJ': { const a = stack.pop(); if (a && a.t === 'arr') for (const el of a.v) { if (el.t === 'str') goster(el.b); else if (el.t === 'num') ilerle(-el.v / 1000 * fs * Th); } stack.length = 0; break; }
        case 'Do': {
          const a = stack.pop(); stack.length = 0;
          if (!a || a.t !== 'name' || (derinlik || 0) > 6) break;
          const xd = resolveDict(objs, res, 'XObject'); const r = xd.match(new RegExp('/' + a.v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(\\d+)\\s+\\d+\\s+R'));
          const xo = r && objs[+r[1]]; if (!xo || !/\/Subtype\s*\/Form/.test(xo.dict)) break;
          const mm = xo.dict.match(/\/Matrix\s*\[([^\]]*)\]/); const mat = mm ? mm[1].trim().split(/\s+/).map(Number) : [1, 0, 0, 1, 0, 0];
          const xr = resolveDict(objs, xo.dict, 'Resources') || res;
          const d = streamData(xo); if (d) for (const it of runContent(d, xr, objs, mul(mat.length === 6 ? mat : [1, 0, 0, 1, 0, 0], ctm), (derinlik || 0) + 1)) items.push(it);
          break;
        }
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
      const kaynak = resolveDict(objs, p.dict, 'Resources');
      let contents = []; const cArr = p.dict.match(/\/Contents\s*\[([^\]]*)\]/);
      if (cArr) contents = [...cArr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(x => +x[1]); else { const c = getRef(p.dict, 'Contents'); if (c) contents = [c]; }
      // Contents dolaylı bir dizi nesnesi olabilir: [4 0 R 27 0 R]
      contents = contents.flatMap(n => objs[n] && !objs[n].streamRaw && /^\s*\[/.test(objs[n].dict) ? [...objs[n].dict.matchAll(/(\d+)\s+\d+\s+R/g)].map(x => +x[1]) : [n]);
      const data = Z.birlestir(contents.flatMap(n => [streamData(objs[n]) || BOS, SATIR]));
      const items = runContent(data, kaynak, objs).filter(it => it.s.trim() !== '');
      items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      const satirlar = [];
      for (const it of items) { const last = satirlar[satirlar.length - 1]; if (last && Math.abs(last.y - it.y) < Math.max(2, 0.3 * it.fs)) last.items.push(it); else satirlar.push({ y: it.y, items: [it] }); }
      // Aynı satırda: küçük aralık bitişik yazılır, orta aralık boşluk, çok büyük aralık (yan sütun) ayrı satır olur
      const lines = [];
      for (const l of satirlar) {
        l.items.sort((a, b) => a.x - b.x);
        let parca = { y: l.y, items: [], text: '' }, sonX = -Infinity, sonS = null, sonx0 = null;
        for (const it of l.items) {
          if (sonS === it.s && Math.abs(it.x - sonx0) < 0.5) continue; // üst üste aynı yazı (kalın görünüm)
          if (parca.items.length) {
            const bosluk = it.x - sonX, f = Math.max(it.fs, 1);
            if (bosluk > 3 * f) { lines.push(parca); parca = { y: l.y, items: [], text: '' }; }
            else if (bosluk > 0.15 * f && !/\s$/.test(parca.text) && !/^\s/.test(it.s)) parca.text += ' ';
          }
          parca.items.push(it); parca.text += it.s; sonX = Math.max(sonX, it.xe); sonS = it.s; sonx0 = it.x;
        }
        lines.push(parca);
      }
      for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim();
      res.push({ page: pi + 1, lines: lines.filter(l => l.text) });
    });
    return res;
  }
  function metin(buf) {
    if (/\/Encrypt\s*\d+\s+\d+\s+R/.test(latin1(buf))) {
      const e = new Error('Şifreli PDF'); e.sifreli = true; throw e;
    }
    return extract(buf).map(p => p.lines.map(l => l.text).join('\n')).join('\n');
  }
  // Taranmış PDF'ler için: her sayfadaki en büyük görüntü (OCR'a verilecek).
  // -> [{tur:'jpeg', veri}] ya da [{tur:'ham', w, h, kanal:1|3, veri}] ; JPX/CCITT/JBIG2 atlanır
  // PNG öngörücüsü (/Predictor 10-15): her satır bir filtre baytıyla başlar
  function pngCoz(d, satir, bpp, h) {
    const out = new Uint8Array(satir * h); let p = 0;
    for (let y = 0; y < h && p < d.length; y++) {
      const f = d[p++]; const o = y * satir, u = o - satir;
      for (let x = 0; x < satir; x++) {
        const a = x >= bpp ? out[o + x - bpp] : 0, b = y ? out[u + x] : 0, c = y && x >= bpp ? out[u + x - bpp] : 0; let v = d[p++] || 0;
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        out[o + x] = v & 255;
      }
    }
    return out;
  }
  function goruntuler(buf, enCok) {
    const objs = parseObjects(buf); const out = [];
    const sayi = (d, k) => { const m = d.match(new RegExp('/' + k + '\\s+(\\d+)(\\s+\\d+\\s+R)?')); if (!m) return null; if (m[2]) { const o = objs[+m[1]]; return o ? parseInt(o.dict.trim()) : null; } return +m[1]; };
    const topla = (res, derinlik, liste) => {
      const xd = resolveDict(objs, res, 'XObject');
      for (const m of xd.matchAll(/\/[^\s\/<>\[\]]+\s+(\d+)\s+\d+\s+R/g)) {
        const o = objs[+m[1]]; if (!o) continue;
        if (/\/Subtype\s*\/Image/.test(o.dict)) liste.push(o);
        else if (/\/Subtype\s*\/Form/.test(o.dict) && derinlik < 4) topla(resolveDict(objs, o.dict, 'Resources'), derinlik + 1, liste);
      }
    };
    for (const p of pageList(objs).slice(0, enCok || 2)) {
      const liste = []; topla(resolveDict(objs, p.dict, 'Resources'), 0, liste);
      liste.sort((a, b) => (sayi(b.dict, 'Width') * sayi(b.dict, 'Height')) - (sayi(a.dict, 'Width') * sayi(a.dict, 'Height')));
      const o = liste[0]; if (!o) continue;
      const w = sayi(o.dict, 'Width'), h = sayi(o.dict, 'Height'); if (!w || !h || w * h < 250000) continue; // küçük görsel: logo ya da fotoğraf
      if (/JPXDecode|CCITTFaxDecode|JBIG2Decode/.test(o.dict)) continue;
      let d = streamData(o); if (!d || !d.length) continue;
      if (/DCTDecode/.test(o.dict)) { out.push({ tur: 'jpeg', veri: d }); continue; }
      const bpc = sayi(o.dict, 'BitsPerComponent') || 8;
      let kanal = /DeviceRGB|CalRGB/.test(o.dict) ? 3 : /DeviceGray|CalGray/.test(o.dict) ? 1 : 0;
      if (!kanal) { const cs = o.dict.match(/\/ColorSpace\s*(\d+)\s+\d+\s+R/); const c = cs && objs[+cs[1]] ? objs[+cs[1]].dict : ''; const icc = c.match(/\/ICCBased\s+(\d+)\s+\d+\s+R/); const n = icc && objs[+icc[1]] ? sayi(objs[+icc[1]].dict, 'N') : (/DeviceRGB/.test(c) ? 3 : /DeviceGray/.test(c) ? 1 : 0); kanal = n === 3 ? 3 : n === 1 ? 1 : 0; }
      if (!kanal || (bpc !== 8 && !(bpc === 1 && kanal === 1))) continue;
      const pred = sayi(o.dict, 'Predictor') || 1;
      if (pred >= 10) d = pngCoz(d, bpc === 1 ? Math.ceil(w / 8) : w * kanal, bpc === 1 ? 1 : kanal, h);
      if (bpc === 1) { // 1 bit siyah-beyaz tarama -> 8 bit gri
        const satir = Math.ceil(w / 8), g = new Uint8Array(w * h); const ters = /\/Decode\s*\[\s*1\s+0\s*\]/.test(o.dict);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const bit = (d[y * satir + (x >> 3)] >> (7 - (x & 7))) & 1; g[y * w + x] = (bit ^ (ters ? 1 : 0)) ? 255 : 0; }
        out.push({ tur: 'ham', w, h, kanal: 1, veri: g }); continue;
      }
      if (d.length < w * h * kanal) continue;
      out.push({ tur: 'ham', w, h, kanal, veri: d.subarray(0, w * h * kanal) });
    }
    return out;
  }
  globalThis.PdfMetin = { extract, metin, goruntuler };
})();
