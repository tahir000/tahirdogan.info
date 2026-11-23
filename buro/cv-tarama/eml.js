/* Bağımlılıksız .eml (MIME) okuyucu. İletilmiş mailin içindeki maile (message/rfc822) özyinelemeli iner.
   Eml.oku(Uint8Array) -> { konu, kimden, tarih, govde, ekler:[{ad, tur, veri}], icMailler:[{kimden, konu}] } */
(function () {
  'use strict';

  const latin1 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return s; };
  const bayt = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

  const KOD = { 'iso-8859-9': 'windows-1254', 'latin5': 'windows-1254', 'iso-8859-1': 'windows-1252', 'us-ascii': 'utf-8', 'ascii': 'utf-8' };
  function coz(u, charset) {
    let cs = String(charset || '').trim().toLowerCase().replace(/^"|"$/g, '');
    cs = KOD[cs] || cs || 'utf-8';
    if (cs === 'utf-8' || cs === 'utf8') {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch (e) { cs = 'windows-1254'; }
    }
    try { return new TextDecoder(cs).decode(u); } catch (e) { return new TextDecoder('utf-8').decode(u); }
  }

  function base64(s) {
    s = s.replace(/[^A-Za-z0-9+/]/g, '');
    const T = new Int16Array(128).fill(-1);
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => { T[c.charCodeAt(0)] = i; });
    const out = new Uint8Array(Math.floor(s.length * 3 / 4)); let o = 0, buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      buf = (buf << 6) | T[s.charCodeAt(i)]; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
    }
    return out.subarray(0, o);
  }
  function qp(s, baslikMi) {
    if (baslikMi) s = s.replace(/_/g, ' ');
    s = s.replace(/=\r?\n/g, '');
    const out = []; for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else out.push(s.charCodeAt(i) & 255);
    }
    return Uint8Array.from(out);
  }

  // Başlık değeri: ham 8 bit (UTF-8 ya da Türkçe kod sayfası) ve RFC 2047 kodlu sözcükler
  function baslikCoz(ham) {
    if (!ham) return '';
    // ham 8 bit yalnız henüz çözülmemiş (tüm karakterleri 0-255 aralığında) değerde aranır
    let s = /[\x80-\xff]/.test(ham) && !/[^\x00-\xff]/.test(ham) ? coz(bayt(ham), 'utf-8') : ham;
    s = s.replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?)/g, '$1');
    return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (m, cs, k, v) => {
      try { return coz(k.toLowerCase() === 'b' ? base64(v) : qp(v, true), cs.replace(/\*.*$/, '')); } catch (e) { return m; }
    }).replace(/\s+/g, ' ').trim();
  }

  function basliklar(blok) {
    const h = {}; const satirlar = blok.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
    for (const l of satirlar) {
      const i = l.indexOf(':'); if (i <= 0) continue;
      const k = l.slice(0, i).trim().toLowerCase();
      if (h[k] == null) h[k] = l.slice(i + 1).trim();
    }
    return h;
  }
  // Content-Type / Content-Disposition parametreleri (RFC 2231 dahil)
  function parametreler(v) {
    const out = { _deger: (v || '').split(';')[0].trim().toLowerCase() };
    const parca = {};
    const re = /;\s*([^=\s;]+)\s*=\s*("((?:[^"\\]|\\.)*)"|[^;]*)/g; let m;
    while ((m = re.exec(v || ''))) {
      const ad = m[1].toLowerCase(); const deger = m[3] != null ? m[3].replace(/\\(.)/g, '$1') : m[2].trim();
      const r = ad.match(/^([^*]+)\*(\d+)?(\*)?$/);
      if (r) { (parca[r[1]] = parca[r[1]] || []).push({ n: +(r[2] || 0), v: deger, kodlu: !!r[3] || (!r[2] && ad.endsWith('*')) }); }
      else out[ad] = deger;
    }
    for (const ad in parca) {
      const p = parca[ad].sort((a, b) => a.n - b.n); let cs = 'utf-8'; const bytes = [];
      p.forEach((x, i) => {
        let v = x.v;
        if (x.kodlu) {
          if (i === 0) { const mm = v.match(/^([^']*)'[^']*'(.*)$/); if (mm) { cs = mm[1] || cs; v = mm[2]; } }
          for (let j = 0; j < v.length; j++) { if (v[j] === '%' && /^[0-9A-Fa-f]{2}$/.test(v.substr(j + 1, 2))) { bytes.push(parseInt(v.substr(j + 1, 2), 16)); j += 2; } else bytes.push(v.charCodeAt(j) & 255); }
        } else for (const ch of new TextEncoder().encode(v)) bytes.push(ch);
      });
      out[ad] = coz(Uint8Array.from(bytes), cs);
    }
    return out;
  }

  function govdeCoz(ham, cte) {
    cte = (cte || '').toLowerCase();
    if (cte.includes('base64')) return base64(ham);
    if (cte.includes('quoted-printable')) return qp(ham, false);
    return bayt(ham);
  }

  const htmlMetin = s => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');

  // ham: latin1 dizgesi; sonuç: {basliklar, ct, parcalar} ağacından yapraklar toplanır
  function parcala(ham, sonuc, derinlik) {
    if (derinlik > 12) return;
    const ayr = ham.search(/\r?\n\r?\n/);
    const hb = ayr < 0 ? ham : ham.slice(0, ayr);
    const govde = ayr < 0 ? '' : ham.slice(ayr).replace(/^\r?\n\r?\n/, '');
    const h = basliklar(hb);
    const ct = parametreler(h['content-type'] || 'text/plain');
    const cd = parametreler(h['content-disposition'] || '');
    const tur = ct._deger || 'text/plain';
    let ad = cd.filename || ct.name || '';
    ad = ad ? baslikCoz(ad) : '';

    if (tur.startsWith('multipart/')) {
      const sinir = ct.boundary; if (!sinir) return;
      const parcalar = govde.split(new RegExp('\\r?\\n?--' + sinir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*(?:\\r?\\n|$)'));
      for (let i = 1; i < parcalar.length; i++) { const p = parcalar[i]; if (p.trim()) parcala(p, sonuc, derinlik + 1); }
      return;
    }
    if (tur === 'message/rfc822' || (ad && /\.eml$/i.test(ad))) {
      const ic = latin1(govdeCoz(govde, h['content-transfer-encoding']));
      const ih = basliklar(ic.split(/\r?\n\r?\n/)[0]);
      sonuc.icMailler.push({ kimden: baslikCoz(ih.from), konu: baslikCoz(ih.subject) });
      parcala(ic, sonuc, derinlik + 1);
      return;
    }
    const veri = govdeCoz(govde, h['content-transfer-encoding']);
    if (ad) { sonuc.ekler.push({ ad, tur, veri }); return; }
    if (tur === 'text/plain') sonuc.metinler.push(coz(veri, ct.charset));
    else if (tur === 'text/html') sonuc.htmller.push(htmlMetin(coz(veri, ct.charset)));
  }

  function oku(u) {
    const ham = latin1(u);
    const ayr = ham.search(/\r?\n\r?\n/);
    const h = basliklar(ayr < 0 ? ham : ham.slice(0, ayr));
    const s = { ekler: [], metinler: [], htmller: [], icMailler: [] };
    parcala(ham, s, 0);
    // Düz metin yoksa HTML gövdesi kullanılır
    const govde = (s.metinler.length ? s.metinler : s.htmller).join('\n');
    return { konu: baslikCoz(h.subject), kimden: baslikCoz(h.from), tarih: h.date || '', govde: govde.slice(0, 15000), ekler: s.ekler, icMailler: s.icMailler };
  }

  globalThis.Eml = { oku, baslikCoz, coz };
})();
