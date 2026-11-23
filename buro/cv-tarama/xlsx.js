/* Bağımlılıksız XLSX okuma (ilk sayfa -> başlıklı satır nesneleri) ve yazma (inline string, sabit başlık, filtre, sütun genişliği). */
(function () {
  'use strict';
  const Z = globalThis.Zip;
  const te = new TextEncoder(), td = new TextDecoder();

  // ---------- yazma ----------
  const esc = s => String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const dateSerial = s => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ''); if (!m) return null; return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000; };

  // stiller: 0 normal, 1 başlık, 2 sayı #,##0.00, 3 tarih, 4 kaydır, 5 yeşil, 6 sarı, 7 turuncu, 8 tamsayı, 9 kalın, 10 gri
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts>
<fonts count="3"><font><sz val="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // sayfa: {name, cols:[{key,title,width,type:'s'|'n'|'i'|'d'|'w'}], rows:[obj], styleFn?(row,col)->stil, filter?:bool, header?:bool}
  function sheetXml(sh, idx) {
    const out = []; const nc = sh.cols.length; const hasHeader = sh.header !== false;
    out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
    out.push(`<sheetViews><sheetView workbookViewId="0"${idx === 0 ? ' tabSelected="1"' : ''}>${hasHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews>`);
    out.push('<sheetFormatPr defaultRowHeight="13.5"/><cols>');
    sh.cols.forEach((c, i) => out.push(`<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`));
    out.push('</cols><sheetData>');
    let r = 1;
    if (hasHeader) {
      out.push('<row r="1" ht="30" customHeight="1">');
      sh.cols.forEach((c, i) => out.push(`<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${esc(c.title)}</t></is></c>`));
      out.push('</row>'); r = 2;
    }
    for (const row of sh.rows) {
      const cells = [];
      sh.cols.forEach((c, i) => {
        const v = row[c.key]; if (v == null || v === '') return;
        const ref = colName(i) + r; let st = sh.styleFn ? sh.styleFn(row, c) : null;
        if (c.type === 'n' || c.type === 'i') {
          const num = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
          if (isFinite(num)) { cells.push(`<c r="${ref}" s="${st ?? (c.type === 'i' ? 8 : 2)}"><v>${num}</v></c>`); return; }
        }
        if (c.type === 'd') { const ds = dateSerial(v); if (ds != null) { cells.push(`<c r="${ref}" s="${st ?? 3}"><v>${ds}</v></c>`); return; } }
        let s = String(v); if (s.length > 32000) s = s.slice(0, 32000) + '…';
        if (st == null && c.type === 'w') st = 4;
        cells.push(`<c r="${ref}" t="inlineStr"${st != null ? ` s="${st}"` : ''}><is><t xml:space="preserve">${esc(s)}</t></is></c>`);
      });
      out.push(`<row r="${r}">${cells.join('')}</row>`); r++;
    }
    out.push('</sheetData>');
    if (sh.filter !== false && hasHeader && sh.rows.length) out.push(`<autoFilter ref="A1:${colName(nc - 1)}${r - 1}"/>`);
    out.push('</worksheet>');
    return { xml: out.join(''), lastRow: r - 1 };
  }

  async function yaz(sheets) {
    const files = []; const defs = [];
    sheets.forEach((sh, i) => {
      const { xml, lastRow } = sheetXml(sh, i);
      files.push({ ad: `xl/worksheets/sheet${i + 1}.xml`, veri: te.encode(xml) });
      if (sh.filter !== false && sh.header !== false && sh.rows.length) defs.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(sh.name.replace(/'/g, "''"))}'!$A$1:$${colName(sh.cols.length - 1)}$${lastRow}</definedName>`);
    });
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defs.length ? `<definedNames>${defs.join('')}</definedNames>` : ''}</workbook>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    return Z.zip([
      { ad: '[Content_Types].xml', veri: te.encode(ct) }, { ad: '_rels/.rels', veri: te.encode(rels) },
      { ad: 'xl/workbook.xml', veri: te.encode(wb) }, { ad: 'xl/_rels/workbook.xml.rels', veri: te.encode(wbRels) },
      { ad: 'xl/styles.xml', veri: te.encode(STYLES) }, ...files
    ]);
  }

  // ---------- okuma ----------
  const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
  const metin = x => unesc([...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
  const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const TARIH_ID = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
  const iki = n => String(n).padStart(2, '0');
  function seriTarih(v, saatli) {
    const ms = Math.round((v - 25569) * 86400000); const d = new Date(ms);
    const t = `${d.getUTCDate()}.${iki(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
    return saatli && (d.getUTCHours() || d.getUTCMinutes()) ? `${t} ${d.getUTCHours()}:${iki(d.getUTCMinutes())}` : t;
  }
  // ilk sayfayı okur: [{başlık: değer}] (sayılar Number, tarihler "g.aa.yyyy[ ss:dd]" metni)
  function oku(buf) {
    const z = Z.unzip(buf);
    const dosya = ad => { const b = z.al(ad); return b ? td.decode(b) : ''; };
    const sst = [...dosya('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => metin(m[1]));
    const stil = dosya('xl/styles.xml'); const ozel = {};
    for (const m of stil.matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)) ozel[+m[1]] = /[dy]/i.test(m[2].replace(/"[^"]*"|\[[^\]]*\]/g, ''));
    const xfs = ((stil.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '').match(/<xf\b[^>]*>/g) || [];
    const tarihStil = xfs.map(x => { const id = +((x.match(/numFmtId="(\d+)"/) || [])[1] || 0); return TARIH_ID.has(id) || !!ozel[id]; });
    // ilk sayfanın yolu
    const wb = dosya('xl/workbook.xml'); const rels = dosya('xl/_rels/workbook.xml.rels');
    const rid = (wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    let hedef = rid && (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`)) || [])[1];
    if (hedef) hedef = hedef.replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/'); else hedef = z.adlar.find(a => /^xl\/worksheets\/sheet\d*\.xml$/.test(a));
    const xml = dosya(hedef);
    const satirlar = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const s = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = cm[1], ic = cm[2] || ''; const ref = (at.match(/\br="([A-Z]+\d+)"/) || [])[1]; if (!ref) continue;
        const t = (at.match(/\bt="(\w+)"/) || [])[1]; const st = +((at.match(/\bs="(\d+)"/) || [])[1] || 0);
        const vm = ic.match(/<v>([\s\S]*?)<\/v>/); let v = '';
        if (t === 's') v = vm ? sst[+vm[1]] || '' : '';
        else if (t === 'inlineStr') v = metin(ic);
        else if (t === 'str' || t === 'e') v = vm ? unesc(vm[1]) : '';
        else if (t === 'b') v = vm ? vm[1] === '1' : '';
        else if (vm) { const n = parseFloat(vm[1]); v = tarihStil[st] && isFinite(n) ? seriTarih(n, true) : n; }
        s[colIdx(ref)] = v;
      }
      satirlar.push(s);
    }
    if (!satirlar.length) return [];
    const H = Array.from(satirlar[0], h => String(h ?? '').replace(/ /g, ' ').trim());
    return satirlar.slice(1).filter(r => r.some(x => x !== '' && x != null)).map(r => { const o = {}; H.forEach((h, i) => { if (h) o[h] = r[i] ?? ''; }); return o; });
  }

  globalThis.Xlsx = { yaz, oku };
})();
