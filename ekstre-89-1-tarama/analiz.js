/* Ekstre 89/1 taraması — çekirdek: ekstre ayrıştırma, 89/1 muhatap puanlaması, haftalık kuyruk ve tarama geçmişi. */
(function () {
  'use strict';
  const PDF_RE = /_(\d{9,12})( \(\d+\))?\.pdf$/i;
  const musNo = s => { s = String(s ?? '').replace(/^'/, '').trim(); return /^\d+$/.test(s) && s.length < 12 ? s.padStart(12, '0') : s; };
  const san = v => v == null ? '' : String(v).replace(/[\r\n;]+/g, ' ');

  // =====================================================================
  // 1) Ekstre PDF ayrıştırma
  // =====================================================================
  const trNumP = s => { if (!s) return null; s = s.replace(/\s/g, ''); const neg = s.startsWith('-'); s = s.replace(/^[-+]/, ''); const v = parseFloat(s.replace(/\./g, '').replace(',', '.')); return isNaN(v) ? null : (neg ? -v : v); };
  const enNum = s => { if (!s) return null; s = s.replace(/\s/g, ''); const neg = s.startsWith('-'); s = s.replace(/^[-+]/, ''); const v = parseFloat(s.replace(/,/g, '')); return isNaN(v) ? null : (neg ? -v : v); };
  const dParse = s => { const m = (s || '').match(/(\d\d)\.(\d\d)\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

  function parseMevduat(pages) {
    const h = {}; const txs = [];
    for (const p of pages) for (const l of p.lines) {
      const t = l.text; let m;
      if ((m = t.match(/^Hesap No:\s*(\d+)/))) h.hesapNo = m[1];
      if ((m = t.match(/VB Müş\. No\s*:\s*(\d+)/))) h.musteriNo = m[1];
      if ((m = t.match(/Bakiye\s*:\s*([-\d\.,]+)\s*TL/))) h.bakiye = trNumP(m[1]);
      if ((m = t.match(/IBAN\s*:\s*(TR[\d ]+)/))) h.iban = m[1].replace(/\s+/g, ' ').trim();
      if ((m = t.match(/Tarih Aralığı\s*:\s*([\d\.]+)\s*-\s*([\d\.]+)/))) { h.bas = dParse(m[1]); h.bit = dParse(m[2]); }
      if ((m = t.match(/^Şube\s*:\s*(.+?)\s+Ortak Hesap\s*:\s*(\S+)/))) { h.sube = m[1].trim(); h.ortak = m[2]; }
      if ((m = t.match(/^Hesap Türü\s*:\s*(.+?)\s+Rumuz/))) h.hesapTuru = m[1].trim();
    }
    for (const p of pages) {
      let inTable = false; const pageTx = []; const pending = [];
      for (const l of p.lines) {
        const c = l.items;
        if (/^TARİH\b/.test(l.text) && /MİKTAR/.test(l.text)) { inTable = true; continue; }
        if (!inTable) continue;
        if (/Dekont yerine|vakifbank\.com\.tr|Mükellefler|Finanskent|^Sf\. \d/.test(l.text)) continue;
        const isTx = c.length >= 3 && /^\d\d\.\d\d\.\d{4}$/.test(c[0].s) && /^\d\d:\d\d$/.test(c[1].s);
        if (isTx) {
          const tx = { y: l.y, tarih: dParse(c[0].s), saat: c[1].s, islemNo: (c[2] && /^\d+$/.test(c[2].s)) ? c[2].s : '', tutar: null, bakiye: null, ad: [], aciklama: [] };
          for (const cell of c.slice(2)) {
            if (cell.x >= 230 && cell.x < 345 && /^-?[\d\.]+,\d\d$/.test(cell.s)) tx.tutar = trNumP(cell.s);
            else if (cell.x >= 345 && cell.x < 405 && /^-?[\d\.]+,\d\d$/.test(cell.s)) tx.bakiye = trNumP(cell.s);
            else if (cell.x >= 400) tx.ad.push(cell.s);
          }
          pageTx.push(tx); continue;
        }
        if (c.every(cell => cell.x >= 400)) { pending.push(l); continue; }
        if (c[0].x < 100) { const last = pageTx[pageTx.length - 1] || txs[txs.length - 1]; if (last) last.aciklama.push(l.text); }
      }
      for (const l of pending) { let best = null, bd = 1e9; for (const tx of pageTx) { const d = Math.abs(tx.y - l.y); if (d < bd) { bd = d; best = tx; } } if (best && bd < 14) { if (l.y > best.y) best.ad.unshift(l.text); else best.ad.push(l.text); } }
      txs.push(...pageTx);
    }
    return { h, txs: txs.map(t => ({ tarih: t.tarih, saat: t.saat, islemNo: t.islemNo, tutar: t.tutar, bakiye: t.bakiye, islemAdi: t.ad.join(' ').replace(/\s+/g, ' ').trim(), aciklama: t.aciklama.join(' ').replace(/\s+/g, ' ').trim() })) };
  }
  function parseKart(pages) {
    const h = {}; const txs = [];
    for (const p of pages) {
      let inT = false;
      for (const l of p.lines) {
        const t = l.text; let m;
        if ((m = t.match(/Kart No\s*:\s*([\d\*]+)/))) h.kartNo = m[1];
        if ((m = t.match(/Dönem Borcunuz\s*:\s*([\d,\.]+)/))) h.donemBorcu = enNum(m[1]);
        if ((m = t.match(/Hesap Kesim Tarihi\s*:\s*([\d\.]+)/)) && !/Sonraki/.test(t)) h.kesim = dParse(m[1]);
        if ((m = t.match(/^Şube Adı\s*:\s*(.+)$/))) h.sube = m[1];
        if (/^İŞLEM TARİHİ/.test(t)) { inT = true; continue; }
        if (/^HESAP ÖZETİ|^WORLDPUAN|^FAİZ ORANLARI/.test(t)) { inT = false; continue; }
        if (!inT) continue;
        const c = l.items;
        if (c.length >= 2 && /^\d\d\.\d\d\.\d{4}$/.test(c[0].s)) {
          let tutar = null; const desc = []; let taksit = '';
          for (const cell of c.slice(1)) {
            if (/^-?[\d,]+\.\d\d$/.test(cell.s) && cell.x > 380 && tutar == null) tutar = enNum(cell.s);
            else if (/^\d+x[\d,\.]+$/.test(cell.s)) taksit = cell.s;
            else if (cell.x < 450) desc.push(cell.s);
          }
          txs.push({ tarih: dParse(c[0].s), saat: '', islemNo: '', tutar, bakiye: null, islemAdi: desc.join(' '), aciklama: taksit ? ('Kalan taksit: ' + taksit) : '' });
        }
      }
    }
    return { h, txs };
  }
  async function ozetAnahtar(veri) {
    if (globalThis.crypto && crypto.subtle) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', veri)); return Array.from(d, b => b.toString(16).padStart(2, '0')).join(''); }
    let h = 2166136261; for (let i = 0; i < veri.length; i++) { h ^= veri[i]; h = Math.imul(h, 16777619); } return veri.length + ':' + (h >>> 0);
  }
  const pdfMusteriNo = ad => { const m = ad.match(PDF_RE); return m ? musNo(m[1]) : null; };
  const pdfUnvan = ad => ad.replace(PDF_RE, '').replace(/_+$/, '').trim();

  // dosyalar: [{ad, veri: Uint8Array | () => Promise<Uint8Array>}] ; musMap: {müşteriNo: müşteri} (rapor yoksa boş)
  // raporVar=false ise müşteriler dosya adından türetilir.
  async function ekstreleriOku(dosyalar, musMap, raporVar, ilerleme) {
    const ekstreler = [], hareketler = [], gorulen = new Set();
    const sirali = [...dosyalar].sort((a, b) => (a.ad < b.ad ? -1 : a.ad > b.ad ? 1 : 0));
    for (let i = 0; i < sirali.length; i++) {
      const f = sirali[i]; const no = pdfMusteriNo(f.ad);
      if (ilerleme) await ilerleme(i, sirali.length, f.ad);
      if (!no) { ekstreler.push({ musteriNo: '', dosya: f.ad, durum: 'atlandı: dosya adında müşteri no yok' }); continue; }
      if (!musMap[no]) {
        if (raporVar) { ekstreler.push({ musteriNo: no, dosya: f.ad, durum: 'atlandı: raporda bu müşteri yok' }); continue; }
        musMap[no] = { MusteriNo: no, Unvan: pdfUnvan(f.ad), Tip: '', TakipNolar: '', IcraDosyalar: '', Bakiye: 0 };
      }
      let veri; try { veri = typeof f.veri === 'function' ? await f.veri() : f.veri; } catch (e) { ekstreler.push({ musteriNo: no, dosya: f.ad, durum: 'okunamadı: ' + e.message }); continue; }
      const anahtar = await ozetAnahtar(veri);
      if (gorulen.has(anahtar)) { ekstreler.push({ musteriNo: no, dosya: f.ad, durum: 'mükerrer (aynı içerik)' }); continue; }
      gorulen.add(anahtar);
      let pages; try { pages = globalThis.PdfMetin.extract(veri); } catch (e) { ekstreler.push({ musteriNo: no, dosya: f.ad, durum: 'okunamadı: ' + e.message }); continue; }
      const flat = pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n');
      let e;
      if (/Kredi Kartı Hesap Özeti/.test(flat)) { const r = parseKart(pages); e = { tur: 'Kredi Kartı', ...r.h, txs: r.txs }; }
      else { const r = parseMevduat(pages); e = { tur: 'Mevduat', ...r.h, txs: r.txs }; }
      const m = musMap[no];
      ekstreler.push({ musteriNo: no, dosya: f.ad, durum: 'okundu', tur: e.tur, hesap: e.hesapNo || e.kartNo || '', iban: e.iban || '', sube: e.sube || '', hesapTuru: e.hesapTuru || '', bas: e.bas || '', bit: e.bit || e.kesim || '', bakiye: e.bakiye ?? e.donemBorcu ?? '', sayfa: pages.length, hareket: e.txs.length });
      for (const t of e.txs) hareketler.push({ unvan: san(m.Unvan), musteriNo: no, takipNolar: san(m.TakipNolar), tur: e.tur, hesap: san(e.hesapNo || e.kartNo || ''), tarih: san(t.tarih), saat: san(t.saat), islemNo: san(t.islemNo), tutar: t.tutar, bakiye: t.bakiye, islemAdi: san(t.islemAdi), aciklama: san(t.aciklama) });
    }
    return { ekstreler, hareketler };
  }

  // =====================================================================
  // 2) 89/1 muhatap analizi
  // =====================================================================
  function analiz89({ hareketler: HAM, ekstreler, musteriler, raporSatirlari, bugun }) {
    const BUGUN = bugun;
    const trUp = s => (s || '').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
    const fold = s => trUp(s).replace(/İ/g, 'I').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/Â/g, 'A').replace(/Î/g, 'I').replace(/Û/g, 'U');
    const key = s => fold(s).replace(/[^A-Z0-9]/g, '');
    const clean = s => (s || '').replace(/\s+/g, ' ').replace(/^[\s\-\/\.,:'"(]+|[\s\-\/,:'"(]+$/g, '').trim();
    const num = s => { if (s == null || s === '') return null; const v = parseFloat(String(s).replace(/^'/, '').replace(',', '.')); return isNaN(v) ? null : v; };
    const gun = d => d ? Math.round((Date.parse(BUGUN) - Date.parse(d)) / 86400000) : 99999;
    const fmtTL = v => (v == null ? '' : v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' TL');
    const ayYil = d => d ? d.slice(5, 7) + '/' + d.slice(0, 4) : '';

    // ---------- sözlükler ----------
    const BANKALAR = [
      ['Ziraat Katılım', /Z[İI]RAAT\s*KATILIM/], ['Vakıf Katılım', /VAKIF\s*KATILIM/], ['Emlak Katılım', /EMLAK\s*KATILIM/], ['VakıfBank', /VAKIFLAR\s*BANKASI|VAKIFBANK/],
      ['Ziraat Bankası', /Z[İI]RAAT/], ['Halkbank', /HALK\s*BANK/], ['İş Bankası', /[İI]Ş\s*BANKASI|[İI]ŞBANK/], ['Garanti BBVA', /GARANT[İI]/],
      ['Akbank', /AKBANK/], ['Yapı Kredi', /YAPI\s*(VE\s*)?KRED[İI]/], ['QNB', /QNB|F[İI]NANSBANK/], ['Denizbank', /DEN[İI]Z\s*BANK/], ['TEB', /\bTEB\b|TÜRK\s*EKONOM[İI]/],
      ['ING', /\bING\b/], ['Enpara', /ENPARA/], ['Kuveyt Türk', /KUVEYT/], ['Albaraka', /ALBARAKA/], ['Türkiye Finans', /TÜRK[İI]YE\s*F[İI]NANS/], ['Şekerbank', /ŞEKER\s*BANK/],
      ['Fibabanka', /F[İI]BA/], ['Odeabank', /ODEA/], ['HSBC', /HSBC/], ['Burgan', /BURGAN/], ['Anadolubank', /ANADOLU\s*BANK/], ['Alternatifbank', /ALTERNAT[İI]F/],
      ['Aktif Bank', /AKT[İI]F\s*YATIRIM/], ['TOM Katılım', /T\.?O\.?M\.?\s*KATILIM/], ['Hayat Finans', /HAYAT\s*F[İI]NANS/], ['Colendi', /COLEND[İI]/], ['Merkez Bankası', /MERKEZ\s*BANKASI/],
      ['PTT', /POSTA\s*VE\s*TELGRAF|\bPTT\b/]
    ];
    const bankaAdi = s => { const u = trUp(s); for (const [ad, re] of BANKALAR) if (re.test(u)) return ad; return null; };
    const EPARA = [
      ['Papara', /PAPARA/], ['PayFix', /PAY\s*F[İI]X/], ['Sipay', /S[İI]PAY/], ['Payco', /PAYCO/], ['Sender Ödeme', /SENDER\s*ÖDEME/], ['MyPayz', /MYPAYZ/],
      ['Paratim', /PARAT[İI]M/], ['Klon Ödeme', /KLON\s*ÖDEME/], ['Vizyon Elektronik Para', /V[İI]ZYON\s*ELEKTRON/], ['Elekse', /ELEKSE/], ['Parolapara', /PAROLAPARA/],
      ['Moka United', /MOKA/], ['Param (Türk Elektronik Para)', /TÜRK\s*ELEKTRON[İI]K\s*PARA|\bPARAM\b/], ['İninal', /[İI]N[İI]NAL/], ['Tosla (Aköde)', /TOSLA|AKÖDE/],
      ['Paycell', /PAYCELL/], ['Hepsipay', /HEPS[İI]PAY/], ['Papel', /PAPEL/], ['Ozan Elektronik Para', /OZAN\s*ELEKTRON/], ['Paybull', /PAYBULL/], ['Fups', /FUPS/],
      ['E-para/ödeme kuruluşu', /ELEKTRON[İI]K\s*PARA|ÖDEME\s*KURULU|ÖDEME\s*H[İI]ZMET/]
    ];
    const eparaAdi = s => { const u = trUp(s); for (const [ad, re] of EPARA) if (re.test(u)) return ad === 'E-para/ödeme kuruluşu' ? clean(s) : ad; return null; };
    const KRIPTO = [
      ['Binance TR (BN Teknoloji A.Ş.)', /BN\s*TEKNOLOJ|B[İI]NANCE/], ['Paribu', /PAR[İI]BU/], ['BtcTurk', /BTC\s*TURK|BTCTÜRK/], ['Bitexen', /B[İI]TEXEN/],
      ['Bitci', /B[İI]TC[İI]/], ['Icrypex', /[İI]CRYPEX/], ['OKX TR', /\bOKX\b/], ['Gate TR', /GATE\s*(TR|GLOBAL|\.IO)/], ['Bybit', /BYB[İI]T/], ['Thodex', /THODEX/],
      ['Kripto platformu', /KR[İI]PTO\s*VARLIK|KR[İI]PTO/]
    ];
    const kriptoAdi = s => { const u = trUp(s); for (const [ad, re] of KRIPTO) if (re.test(u)) return ad; return null; };
    const BAHIS = [
      ['Nesine (D Elektronik Şans Oyunları A.Ş.)', /D\s*ELEKTRON[İI]K\s*ŞANS|NES[İI]NE/], ['Misli (Misli Elektronik Şans Oyunları A.Ş.)', /M[İI]SL[İI]/],
      ['Bilyoner (Bilyoner İnteraktif Hizmetler A.Ş.)', /B[İI]LYONER/], ['Birebin Şans Oyunları A.Ş.', /B[İI]REB[İI]N/], ['Sisal Şans (Milli Piyango)', /S[İI]SAL|M[İI]LL[İI]\s*P[İI]YANGO/],
      ['Türkiye Jokey Kulübü (TJK)', /JOKEY|H[İI]PODROM/], ['Oley.com', /OLEY/], ['Tuttur', /TUTTUR/]
    ];
    const bahisAdi = s => { const u = trUp(s); for (const [ad, re] of BAHIS) if (re.test(u)) return ad; return null; };
    const KUMAR_METIN = /\bBET\b|BAH[İI]S|CAS[İI]NO|\bSLOT\b|POKER|RULET|\bKUMAR\b|[İI]DDAA|JOJOBET|MATBET|MARSBAH|TEMPOBET|SUPERBET|ONWIN|GRANDPASHA|SEKABET|HOL[İI]GANBET|BETT[İI]LT|1XBET|MOSTBET|P[İI]NCO|MELBET|MEGABAH|DUMANBET|CAS[İI]BOM|MAR[İI]BET|BETEBET/;
    const PLATFORM = [
      ['Trendyol (DSM Grup / TYG)', /TRENDYOL|DSM\s*GRUP|\bTYG\b/], ['Uber', /\bUBER\b/], ['Martı (Martı İleri Teknoloji A.Ş.)', /MARTI\s*[İI]LER[İI]|\bMARTI\s*TAG|\bMARTI\b/],
      ['Getir', /GET[İI]R\s*(PERAKENDE|[İI]LET|GIDA|FOOD)|\bGET[İI]R\b/], ['Yemeksepeti', /YEMEK\s*SEPET/], ['Hepsiburada (D-Market)', /HEPS[İI]BURADA|D-?MARKET/], ['HepsiJet', /HEPS[İI]JET/],
      ['Amazon', /AMAZON/], ['Çiçeksepeti', /Ç[İI]ÇEK\s*SEPET/], ['Bolt', /\bBOLT\b/], ['BiTaksi', /B[İI]TAKS[İI]/], ['Airbnb', /A[İI]RBNB/], ['PayPal', /PAYPAL/],
      ['iyzico', /[İI]YZ[İI]|IYZI/], ['PayTR', /PAYTR/], ['Pazarama', /PAZARAMA/], ['n11', /\bN11\b/], ['Sahibinden', /SAH[İI]B[İI]NDEN/], ['Letgo', /LETGO/],
      ['Yurtiçi Kargo', /YURT[İI]Ç[İI]\s*KARGO/], ['Aras Kargo', /ARAS\s*KARGO/], ['MNG Kargo', /MNG\s*KARGO/], ['Sürat Kargo', /SÜRAT\s*KARGO/],
      ['Migros', /M[İI]GROS\s*(T[İI]CARET|YEMEK|ONE)/], ['Scotty', /SCOTTY/]
    ];
    const platformAdi = s => { const u = trUp(s); for (const [ad, re] of PLATFORM) if (re.test(u)) return ad; return null; };
    const MENKUL = /MENKUL\s*DE[ĞG]ER|YATIRIM\s*MENKUL|M[İI]DAS|PORTFÖY|ARACI\s*KURUM/;
    const SIGORTA = /HAYAT\s*VE\s*EMEKL|EMEKL[İI]L[İI]K\s*A|S[İI]GORTA|ORDU\s*YARDIMLAŞMA|\bOYAK\b/;
    const ICRA = /[İI]CRA\s*DA[İI]RES|[İI]CRADA[İI]RES|[İI]CRA\s*MÜDÜR|[İI]CRA\s*MEMUR|[İI]CRAMEMUR/;
    const SIRKET = /A\.\s?Ş\.?|ANON[İI]M|L[İI]M[İI]TED|\bLTD\b|ŞT[İI]\.?|Ş[İI]RKET|KOOPERAT[İI]F|VAKF|DERNE[ĞG]|BELED[İI]YE|MÜDÜRLÜ[ĞG]|BAŞKANLI[ĞG]|KURUMU|HOLD[İI]NG|SANAY[İI]|T[İI]CARET|[İI]NŞAAT|TEKST[İI]L|GIDA|OTOMOT[İI]V|ÜN[İI]VERS[İI]TE|HASTANE|VAL[İI]L[İI][ĞG]|KAYMAKAM|BAKANLI[ĞG]|KOMUTANLI[ĞG]|ORTAKLI[ĞG]|TEŞK[İI]LAT|ENERJ[İI]|LOJ[İI]ST[İI]K|TUR[İI]ZM|PAZARLAMA|DANIŞMANLIK|HİZMETLER/;
    const KAMU = /MÜDÜRLÜ[ĞG]|MUDURLUG|\bMÜD\b|BAŞKANLI[ĞG]|VAL[İI]L[İI][ĞG]|KOMUTANLI[ĞG]|\bKOM\b|BELED[İI]YE|BAKANLI[ĞG]|KAYMAKAMLI[ĞG]|ÜN[İI]VERS[İI]TE|CEZA\s*[İI]NFAZ|KAPALI\s*CEZA|L\s*T[İI]P[İI]|JANDARMA|EMN[İI]YET|\bSGK\b|SOSYAL\s*GÜVENL|DEVLET|TUGAY|ALAY|KORUCU|MEMUR|AM[İI]RL[İI][ĞG]|KUV\.|VAL[İI]L[İI]|ET\s*VE\s*SÜT|İŞ\s*KURUMU|ŞEKER\s*FABR/;
    const EMEKLI = /EMEKL|BA[ĞG]-?\s*KUR|\bSSK\b/;
    const KIRA = /\bK[İI]RA(SI|LAR|LARI|SINI)?\b|K[İI]RA\s*BEDEL|K[İI]RA\s*ÖDEME|\bK[İI]RAS[İI]?\b/;
    const IC_ISLEM = /Virman|Kredi|Ek Hesap|Taksit|Faiz|Vergi|Kapatma|Kapama|Hesap Açma|İptal|iptal|Yapılandırma|Temdit|Süpürme|Döviz|Altın|Gümüş|Komisyon|Tahakkuk|Kovan|Uyap|UYAP|İcraTahsilatı|SGK|Tapu|Mercedes|Financell|Vinov|Senet|Çekin|Talimat|Takibe Aktarım|Takipli|Tarım Kart|Halka Arz|Yatırım Fonu|Yatırım|kullandirim|kulandirim|Promosyon|Sanal POS|POS-Alışveriş|POSAlışveriş|İade|faiz|tasfiye|Mevduat Hesap|Kart/;

    const STOP = new Set(['A', 'S', 'AS', 'LTD', 'STI', 'SIRKETI', 'SIRKET', 'LIMITED', 'ANONIM', 'SANAYI', 'VE', 'TICARET', 'TIC', 'SAN', 'VEDIS', 'DIS']);
    const toks = s => fold(s).split(/[^A-Z0-9]+/).filter(t => t.length >= 2 && !STOP.has(t));
    function isSelf(ad, borclu) {
      const a = key(ad), b = key(borclu);
      if (!a || a.length < 5 || !b) return false;
      if (a === b) return true;
      const [s, l] = a.length < b.length ? [a, b] : [b, a];
      if (l.includes(s) && s.length >= 0.7 * l.length) return true;
      const ta = toks(ad), tb = toks(borclu); if (ta.length < 2 || tb.length < 2) return false;
      const shared = ta.filter(t => tb.includes(t)).length;
      if (ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1] && shared >= 2) return true;
      return shared >= 3;
    }
    const splitKurum = seg => { const m = (seg || '').match(/^(.*?(?:A\.\s?Ş\.?))\s*(.*)$/i); return m && m[2] ? [m[1], m[2]] : ['', seg || '']; };
    function isveren(text) {
      let m;
      if ((m = text.match(/\(\s*(\d+)\s*[_\-]\s*([0-9A-ZÇĞİÖŞÜ]{1,3})\s*[_\-]+\s*([^()]+?)\)\s*Kurumun/i))) return { ad: clean(m[3]), kod: m[1] + '_' + m[2] };
      if ((m = text.match(/(\d{3,7}[0-9A-Z]{0,3})\s*\((\d+)\)\s*Kurumun/))) return { ad: '', kod: m[2] };
      if ((m = text.match(/\s(\d{3,7}[0-9A-Z]{0,3})\s+Kurumun/))) return { ad: '', kod: m[1] };
      if ((m = text.match(/([^()]+?)\)\s*Kurumun/i))) return { ad: clean(m[1].replace(/^.*[_(]\s*/, '').replace(/^.*\d{6,}[0-9A-Z]*\s+/, '')), kod: '' };
      if ((m = text.match(/(\d+)_([0-9A-Z]{1,3})_(.+?)\s+\d\d\.\d\d\.\d{4}\s+Tarihli/i))) return { ad: clean(m[3]), kod: m[1] + '_' + m[2] };
      return { ad: '', kod: '' };
    }
    const ckey = s => { const t = toks(s); const k = t.slice(0, 2).join(''); return t.length >= 2 && k.length >= 8 ? 'C' + k : key(s); };

    function parse(tx) {
      const ad = tx.islemAdi || '', a = tx.aciklama || '', yon = tx.tutar > 0 ? 'G' : 'C';
      let kanal = 'Diğer', kurum = '', karsi = '', serbest = '', vkn = '', m;
      if (/Maaş Ödemesi|^Ek Ödeme|^Diğer Ödeme/.test(ad) && /Kurumun|Tarihli Maaş/.test(a)) { kanal = 'Maaş'; const i = isveren(ad + ' ' + a); if (i.ad && /^\d[0-9A-Z]{2,8}$/.test(i.ad)) { i.kod = i.ad; i.ad = ''; } karsi = i.ad || (i.kod ? `VakıfBank maaş kurumu, kod ${i.kod} (ad ekstrede yok)` : ''); if (i.kod) vkn = 'Kurum kodu ' + i.kod; }
      else if (/Gelen FAST/i.test(ad)) { kanal = 'FAST'; if ((m = a.match(/^(.*?)\(\s*\d[^()]*?sorgu no'lu\s*(.+?)\s*hesabından\s*(.+?)\s*hesabına gelen FAST/i))) { serbest = m[1]; [kurum, karsi] = splitKurum(m[2]); } }
      else if (/^FAST Anlık Ödeme$/i.test(ad.trim())) { kanal = 'FAST'; if ((m = a.match(/^(.*?)\(\s*\d[^()]*?sorgu no'lu\s*(.+?)\s*hesabından\s*(.+?)\s*hesabına giden FAST/i))) { serbest = m[1]; [kurum, karsi] = splitKurum(m[3]); } }
      else if (/Gelen EFT/i.test(ad)) { kanal = 'EFT'; if ((m = a.match(/^(?:(.*)\/)?\s*([^\/]+?)-\d{3,5}-\d+-\d+\s*sorgu numaralı\s*(.+?)\s*tarafından/i))) { serbest = m[1] || ''; kurum = m[2]; karsi = m[3]; } }
      else if (/giden EFT/i.test(ad) && !/Kredi Kartı|İade/i.test(ad)) { kanal = 'EFT'; serbest = a.split('(')[0]; if ((m = a.match(/HESABINDAN\s*(.+?)\s+-\s/i))) kurum = m[1]; if ((m = a.match(/NO'LU\s*(.+?)\s*HESABINA YAPILAN/i))) karsi = m[1]; }
      else if (/havale/i.test(ad) && !/İptal|iptal/.test(ad)) {
        kanal = /Tös/.test(ad) ? 'TÖS' : 'Havale'; kurum = 'VakıfBank';
        if ((m = a.match(/TR[\d\s\*]+?\s*nolu\s*(.+?)\s*hesabından\s*TR[\d\s\*]+?\s*nolu\s*(.+?)\s*hesabına/i))) karsi = yon === 'G' ? m[1] : m[2];
        const p = a.split(' / '); if (p.length > 1) serbest = p[0];
        if ((m = a.match(/VN:\s*(\d{10,11})/))) vkn = m[1];
      }
      else if (/Batch Yatan/.test(ad)) { kanal = 'POS'; if ((m = a.match(/(\d+) nolu isyerinin/))) karsi = m[1]; }
      else if (/Jokey|Nesine|Misli|Bilyoner|Oley|Şans ?Oyun|ŞansOyun|İddaa|Tuttur|Sisal|Birebin/i.test(ad)) { kanal = 'Bahis'; karsi = ad; }
      else if (/Para Yat/i.test(ad)) { kanal = 'Nakit'; if ((m = a.match(/[İI]şlem\s*Yapan\s*:\s*(.+?)\s*$/i))) { karsi = m[1]; kanal = 'Yatırılan'; serbest = a.split(' / ').length > 1 ? a.split(' / ')[0] : ''; } }
      else if (/Para Çek|ATM/i.test(ad)) kanal = 'Nakit';
      else if (IC_ISLEM.test(ad)) kanal = 'İç';
      return { kanal, yon, kurum: clean(kurum), karsi: clean(karsi), serbest: clean(serbest), vkn };
    }

    const TUR = {
      MAAS: { ad: 'Maaş/ücret (işveren)', w: 5 }, EMEKLI: { ad: 'Emekli aylığı (SGK)', w: 0.5 }, PLATFORM: { ad: 'Platform/pazaryeri/kurye geliri', w: 4 },
      SIRKET_DUZENLI: { ad: 'Şirket/kurumdan düzenli ödeme', w: 4 }, KENDI_BANKA: { ad: 'Başka bankadaki kendi hesabı', w: 2 }, EPARA: { ad: 'E-para/ödeme kuruluşu hesabı', w: 3 },
      KRIPTO: { ad: 'Kripto platformu', w: 3 }, KIRA: { ad: 'Kira geliri (kiracı)', w: 3 }, BAHIS: { ad: 'Bahis/şans oyunu şirketi', w: 2 }, MENKUL: { ad: 'Aracı kurum/menkul kıymet', w: 2 },
      VB_YATIRIM: { ad: 'VakıfBank yatırım hesabı (fon/halka arz)', w: 1 }, ICRA: { ad: 'Başka icra dosyasından ödeme', w: 2 }, POS: { ad: 'POS üye işyeri geliri (VakıfBank)', w: 2 },
      SIRKET_YUKSEK: { ad: 'Şirket/kurumdan yüksek tutarlı ödeme', w: 2 }, SIRKET: { ad: 'Şirket/kurumdan tekrarlı ödeme', w: 1 }, SIGORTA: { ad: 'Sigorta/BES/OYAK ödemesi', w: 1.5 },
      SAHIS_DUZENLI: { ad: 'Şahıstan düzenli ödeme', w: 1 }, SAHIS_YUKSEK: { ad: 'Şahıstan yüksek tutarlı ödeme', w: 1 }
    };
    function oneriMetni(t, h) {
      switch (t) {
        case 'MAAS': return KAMU.test(trUp(h.ad)) && !/A\.Ş|ANON[İI]M|L[İI]M[İI]TED/.test(trUp(h.ad)) ? `Kamu işvereni: ${h.ad} muhasebe/tahakkuk birimine maaş haczi müzekkeresi (İİK 83)` : `İşveren ${h.ad}: 89/1 ihbarnamesi + maaş haczi (İİK 83)`;
        case 'EMEKLI': return 'SGK aylığı — 5510 s.K. m.93 uyarınca kural olarak haczedilemez; 89/1 için uygun değil (bilgi amaçlı)';
        case 'PLATFORM': return `${h.ad}: 89/1 (hakediş/satış alacakları)`;
        case 'SIRKET_DUZENLI': return `${h.ad}: 89/1 (düzenli ödeme — muhtemel işveren/ticari alacak)`;
        case 'KENDI_BANKA': return `${h.ad}: borçlunun bu bankadaki hesaplarına haciz (UYAP banka haczi / 89/1)`;
        case 'EPARA': return `${h.ad}: 89/1 (borçlunun e-para/cüzdan bakiyesi)`;
        case 'KRIPTO': return `${h.ad}: 89/1 (kripto varlık ve TL bakiyesi)`;
        case 'KIRA': return `${h.ad}: 89/1 (kira alacağı — kiracıya)`;
        case 'BAHIS': return `${h.ad}: 89/1 (üye hesap bakiyesi / ikramiye alacağı)`;
        case 'MENKUL': return `${h.ad}: 89/1 / menkul kıymet haczi (MKK kaydı kontrol)`;
        case 'ICRA': return `${h.ad}: borçlu bu dosyada alacaklı görünüyor — dosyadaki alacağına haciz (icra dairesine haciz müzekkeresi)`;
        case 'VB_YATIRIM': return 'VakıfBank nezdindeki yatırım hesabı (fon/hisse) — banka kayıtları/MKK üzerinden kontrol, gerekirse haciz';
        case 'POS': return `VakıfBank POS üye işyeri ${h.ad}: üye işyeri/POS alacaklarına haciz`;
        case 'SIRKET_YUKSEK': case 'SIRKET': return `${h.ad}: 89/1 (alacak ilişkisi ödemelerden görünüyor)`;
        case 'SIGORTA': return `${h.ad}: ödeme/birikim haczi özel düzenlemelere tabi olabilir — kontrol edilerek 89/1`;
        case 'SAHIS_DUZENLI': case 'SAHIS_YUKSEK': return `${h.ad}: 89/1 gönderilebilir (ilişki belirsiz — kira/borç ilişkisi araştırılmalı)`;
      }
      return '';
    }
    const guncellik = son => { const g = gun(son); return g <= 183 ? 1 : g <= 365 ? 0.7 : g <= 730 ? 0.4 : 0.15; };
    const guncellikMetni = son => { const g = gun(son); return g <= 183 ? 'Son 6 ay' : g <= 365 ? 'Son 12 ay' : g <= 730 ? '1-2 yıl önce' : '2 yıldan eski'; };

    // ---------- veri ----------
    const musMap = {}; for (const m of musteriler) musMap[m.MusteriNo] = m;
    const rapor = {};
    for (const v of raporSatirlari || []) {
      const s = k => (v[k] == null ? '' : String(v[k]));
      const r = (rapor[musNo(s('Müşteri No'))] ||= { itiraz: new Set(), acilis: new Set(), durum: new Set(), tur: new Set() });
      if (s('Uyap Borca İtiraz Tarihi')) r.itiraz.add(s('Takip Dosya No') + ': ' + s('Uyap Borca İtiraz Tarihi').split(' ')[0]);
      if (s('Uyap Dosya Açılış Tarihi')) r.acilis.add(s('Uyap Dosya Açılış Tarihi').split(' ')[0]);
      if (s('Uyap Dosya Durumu')) r.durum.add(s('Uyap Dosya Durumu')); if (s('Takip Türü')) r.tur.add(s('Takip Türü'));
    }
    const hareketler = HAM.map(r => ({ ...r, tutar: num(r.tutar), bakiye: num(r.bakiye) }));

    // ---------- analiz ----------
    const byMus = {}; for (const h of hareketler) (byMus[h.musteriNo] ||= []).push(h);
    const ozet = [], muhataplar = [], dikkatHareket = [];
    const tumMusNo = [...new Set([...Object.keys(byMus), ...ekstreler.filter(e => e.durum === 'okundu' || /mükerrer|okunamadı/.test(e.durum)).map(e => e.musteriNo)])].filter(n => musMap[n]);

    for (const musNo_ of tumMusNo) {
      const m = musMap[musNo_]; const borc = m.Bakiye || 0; const borclu = m.Unvan || '';
      const txs = (byMus[musNo_] || []).filter(t => t.tur === 'Mevduat' && t.tutar != null);
      const esik = Math.max(0.5 * borc, 50000);
      const hedef = {}; const dikkat = {};
      const hEkle = (tur, ad, tx, p) => {
        const k = tur + '|' + (/^(SIRKET|MAAS|PLATFORM|SIGORTA|MENKUL)/.test(tur) ? ckey(ad) : key(ad)); const h = (hedef[k] ||= { tur, ad, adet: 0, aylar: new Set(), gelen: 0, giden: 0, ilk: null, son: null, max: 0, kanallar: new Set(), vkn: new Set(), ornek: [], txs: [] });
        if (ad && ad.length > h.ad.length) h.ad = ad;
        h.adet++; if (tx.tarih) { h.aylar.add(tx.tarih.slice(0, 7)); if (!h.ilk || tx.tarih < h.ilk) h.ilk = tx.tarih; if (!h.son || tx.tarih > h.son) h.son = tx.tarih; }
        if (tx.tutar > 0) h.gelen += tx.tutar; else h.giden += -tx.tutar; h.max = Math.max(h.max, Math.abs(tx.tutar));
        h.kanallar.add(p.kanal + (p.kurum && p.kanal !== 'Havale' && p.kanal !== 'TÖS' ? ' / ' + (bankaAdi(p.kurum) || eparaAdi(p.kurum) || p.kurum) : '')); if (p.vkn) h.vkn.add(p.vkn);
        h.txs.push(tx); if (h.ornek.length < 2) h.ornek.push(`${tx.tarih} ${tx.tutar > 0 ? '+' : ''}${tx.tutar} ${tx.islemAdi}: ${tx.aciklama}`.slice(0, 260));
      };
      const dEkle = (tur, ad, tx, not) => { const k = tur + '|' + key(ad); const d = (dikkat[k] ||= { tur, ad, adet: 0, toplam: 0, son: null, not, txs: [] }); d.adet++; d.toplam += Math.abs(tx.tutar); if (!d.son || tx.tarih > d.son) d.son = tx.tarih; d.txs.push(tx); };

      const sahisG = {}, sirketG = {};
      for (const tx of txs) {
        const p = parse(tx); tx._p = p;
        const metin = trUp([p.karsi, p.kurum, p.serbest].join(' '));
        const self = p.karsi && isSelf(p.karsi, borclu);
        let kripto, plat, ep;
        if (/Tapu Döner/.test(tx.islemAdi)) { dEkle('Tapu işlemi (harç ödemesi)', 'Tapu', tx, 'Taşınmaz alım/satımı olabilir — TAKBİS sorgusu'); continue; }
        if (/Mercedes|Financell/.test(tx.islemAdi) || (/ARAÇ|OTOMOT[İI]V|PEŞ[İI]NAT/.test(metin) && tx.tutar < 0)) dEkle('Araç alımı/finansmanı', p.karsi || tx.islemAdi, tx, 'Araç kaydı sorgulanmalı (EGM)');
        if (/AltınAlış|Altın Alış|Vadeli Mevduat Hesap Açma|Yatırım Fonu Alış|Döviz Alış|GümüşAlış|YatırımHesabına/.test(tx.islemAdi)) { dEkle('VakıfBank nezdinde altın/vadeli/fon/döviz', tx.islemAdi.replace(/\s+/g, ' '), tx, 'Banka içi varlık — VakıfBank kayıtlarından kontrol'); continue; }
        if (/Halka Arz|Yatırım Fonu Satış|YatırımHesabından/.test(tx.islemAdi)) { hEkle('VB_YATIRIM', 'VakıfBank yatırım hesabı', tx, p); continue; }
        if (p.kanal === 'İç' || p.kanal === 'Nakit') continue;
        if (p.kanal === 'Maaş') { const isv = p.karsi || 'Maaş (kurum adı okunamadı)'; if (tx.tutar < 0 || isSelf(isv, borclu)) continue; hEkle(EMEKLI.test(trUp(isv)) ? 'EMEKLI' : 'MAAS', isv, tx, p); continue; }
        if (p.kanal === 'POS') { if (tx.tutar > 0) hEkle('POS', p.karsi || 'POS', tx, p); continue; }
        if (p.kanal === 'Bahis' || bahisAdi(p.karsi)) { hEkle('BAHIS', bahisAdi(p.karsi || tx.islemAdi) || bahisAdi(tx.islemAdi) || p.karsi, tx, p); continue; }
        if (KUMAR_METIN.test(trUp(p.serbest + ' ' + p.karsi))) { dEkle('Bahis/kumar çağrışımlı açıklama', p.karsi || '-', tx, 'Açıklamada bahis/kumar ifadesi — yasa dışı bahis şüphesi'); }
        if ((kripto = kriptoAdi(p.karsi) || kriptoAdi(p.serbest))) { hEkle('KRIPTO', kripto, tx, p); continue; }
        if (MENKUL.test(trUp(p.karsi))) { hEkle('MENKUL', p.karsi, tx, p); continue; }
        if (ICRA.test(trUp(p.karsi))) { const dn = (p.serbest.match(/(\d{4}\s*\/\s*\d+)\s*No/i) || [])[1]; if (tx.tutar > 0) hEkle('ICRA', p.karsi + (dn ? ' — dosya ' + dn.replace(/\s/g, '') : ''), tx, p); else dEkle('Başka icra dosyasına ödeme', p.karsi, tx, 'Borçlunun başka alacaklılara icra ödemesi var'); continue; }
        if ((ep = eparaAdi(p.karsi))) { hEkle('EPARA', ep, tx, p); continue; }
        if ((ep = eparaAdi(p.kurum))) {
          if (self) hEkle('EPARA', ep, tx, p);
          else if (tx.tutar < 0) dEkle('E-para kuruluşu üzerinden 3. kişiye transfer', ep, tx, 'Başkasının e-para cüzdanına ödeme — aracı hesap/yasa dışı bahis şüphesi');
          else (sahisG[key(p.karsi)] ||= { ad: p.karsi + ' (' + ep + ')', txs: [] }).txs.push(tx);
          continue;
        }
        if (self) { const b = bankaAdi(p.kurum); if (b && b !== 'VakıfBank' && b !== 'Merkez Bankası') hEkle('KENDI_BANKA', b, tx, p); continue; }
        if (tx.tutar > 0 && (plat = platformAdi(p.karsi))) { hEkle('PLATFORM', plat + (p.karsi ? ' — ' + p.karsi : ''), tx, p); continue; }
        if (tx.tutar > 0 && SIGORTA.test(trUp(p.karsi))) { hEkle('SIGORTA', p.karsi, tx, p); continue; }
        if (tx.tutar > 0 && p.karsi && KIRA.test(trUp(p.serbest))) { hEkle('KIRA', p.karsi, tx, p); continue; }
        if (tx.tutar > 0 && p.karsi) { const sk = SIRKET.test(trUp(p.karsi)); const g = sk ? sirketG : sahisG; const gr = (g[sk ? ckey(p.karsi) : key(p.karsi)] ||= { ad: p.karsi, txs: [] }); if (p.karsi.length > gr.ad.length) gr.ad = p.karsi; gr.txs.push(tx); continue; }
        if (tx.tutar < 0 && p.karsi && Math.abs(tx.tutar) >= esik) dEkle('Yüksek tutarlı çıkış', p.karsi, tx, `Tek seferde ${fmtTL(-tx.tutar)} (borcun %${Math.round(-100 * tx.tutar / (borc || 1))}'i) — mal kaçırma/tasarrufun iptali açısından incelenebilir`);
      }
      for (const g of Object.values(sirketG)) {
        const aylar = new Set(g.txs.map(t => t.tarih.slice(0, 7))).size; const mx = Math.max(...g.txs.map(t => t.tutar));
        if (hedef['MAAS|' + ckey(g.ad)]) { for (const tx of g.txs) hEkle('MAAS', g.ad, tx, tx._p); continue; }
        const tur = aylar >= 3 ? 'SIRKET_DUZENLI' : mx >= esik ? 'SIRKET_YUKSEK' : g.txs.length >= 2 ? 'SIRKET' : null;
        if (tur) for (const tx of g.txs) hEkle(tur, g.ad, tx, tx._p);
      }
      for (const g of Object.values(sahisG)) {
        const aylar = new Set(g.txs.map(t => t.tarih.slice(0, 7))).size; const mx = Math.max(...g.txs.map(t => t.tutar));
        const tur = aylar >= 3 ? 'SAHIS_DUZENLI' : mx >= esik ? 'SAHIS_YUKSEK' : null;
        if (tur) for (const tx of g.txs) hEkle(tur, g.ad, tx, tx._p);
      }
      const liste = Object.values(hedef).map(h => { const w = TUR[h.tur].w; const gc = guncellik(h.son); return { ...h, puan: +(w * gc).toFixed(2), gc, aySay: h.aylar.size }; }).sort((a, b) => b.puan - a.puan || b.gelen - a.gelen);
      const tumHedef = liste.filter(h => h.tur !== 'EMEKLI');
      const enIyiTur = []; for (const h of tumHedef) if (!enIyiTur.some(x => x.tur === h.tur)) enIyiTur.push(h);
      const puan = Math.min(10, +enIyiTur.slice(0, 3).reduce((s, h) => s + h.puan, 0).toFixed(1));
      const aktifGelir = tumHedef.find(h => /^(MAAS|PLATFORM|SIRKET_DUZENLI)$/.test(h.tur) && gun(h.son) <= 183);
      const oneri = (aktifGelir || puan >= 6) ? 'A - Güçlü 89/1 adayı' : puan >= 3 ? 'B - Olası 89/1 adayı' : puan > 0 ? 'C - Zayıf' : 'D - Tespit yok';
      for (const h of liste) {
        muhataplar.push({ oneri, borclu, musteriNo: musNo_, takip: m.TakipNolar, borc, tespit: TUR[h.tur].ad, muhatap: h.ad, kanal: [...h.kanallar].join(', '), vkn: [...h.vkn].join(', '), adet: h.adet, aySay: h.aySay, gelen: +h.gelen.toFixed(2), giden: +h.giden.toFixed(2), ilk: h.ilk, son: h.son, guncellik: guncellikMetni(h.son), puan: h.puan, islem: oneriMetni(h.tur, h), ornek: h.ornek.join('  ||  ') });
        for (const tx of h.txs) dikkatHareket.push({ borclu, musteriNo: musNo_, takip: m.TakipNolar, tespit: TUR[h.tur].ad, muhatap: h.ad, tarih: tx.tarih, tutar: tx.tutar, islemAdi: tx.islemAdi, aciklama: tx.aciklama, hesap: tx.hesap });
      }
      const dlist = Object.values(dikkat).sort((a, b) => b.toplam - a.toplam);
      for (const d of dlist) for (const tx of d.txs) dikkatHareket.push({ borclu, musteriNo: musNo_, takip: m.TakipNolar, tespit: 'DİKKAT: ' + d.tur, muhatap: d.ad, tarih: tx.tarih, tutar: tx.tutar, islemAdi: tx.islemAdi, aciklama: tx.aciklama, hesap: tx.hesap });
      const eks = ekstreler.filter(e => e.musteriNo === musNo_);
      const okunan = eks.filter(e => e.durum === 'okundu');
      const basT = okunan.map(e => e.bas).filter(Boolean).sort()[0] || '', bitT = okunan.map(e => e.bit).filter(Boolean).sort().pop() || '';
      const son = txs.map(t => t.tarih).filter(Boolean).sort().pop() || '';
      const r = rapor[musNo_] || { itiraz: new Set(), acilis: new Set(), durum: new Set(), tur: new Set() };
      const emekli = liste.find(h => h.tur === 'EMEKLI');
      ozet.push({
        oneri, puan, borclu, tip: m.Tip, musteriNo: musNo_, takip: m.TakipNolar, icra: m.IcraDosyalar, borc,
        itiraz: [...r.itiraz].join(', '), acilis: [...r.acilis].join(', '),
        muhataplar: tumHedef.slice(0, 6).map(h => `${h.ad} [${TUR[h.tur].ad}; ${h.adet} işlem/${h.aySay} ay; son ${ayYil(h.son)}]`).join(' | '),
        anaMuhatap: tumHedef[0] ? `${tumHedef[0].ad} (${TUR[tumHedef[0].tur].ad}, son ${ayYil(tumHedef[0].son)})` : '',
        dikkat: [...(emekli ? [`Emekli aylığı alıyor (son ${ayYil(emekli.son)}) — haczedilemez`] : []), ...dlist.slice(0, 5).map(d => `${d.tur}: ${d.ad} (${d.adet} işlem, ${fmtTL(d.toplam)}, son ${ayYil(d.son)})`)].join(' | '),
        son, donem: basT && bitT ? `${basT.split('-').reverse().join('.')} - ${bitT.split('-').reverse().join('.')}` : '',
        hesapSay: new Set(okunan.map(e => e.hesap)).size, ekstreSay: eks.length, hareketSay: txs.length,
        giris: +txs.filter(t => t.tutar > 0).reduce((s, t) => s + t.tutar, 0).toFixed(2), cikis: +txs.filter(t => t.tutar < 0).reduce((s, t) => s - t.tutar, 0).toFixed(2),
        aktif: son && gun(son) <= 365 ? 'Evet' : 'Hayır'
      });
    }
    ozet.sort((a, b) => a.oneri.localeCompare(b.oneri) || b.puan - a.puan || b.borc - a.borc);
    ozet.forEach((o, i) => o.sira = i + 1);
    const sira = Object.fromEntries(ozet.map(o => [o.musteriNo, o.sira]));
    muhataplar.sort((a, b) => sira[a.musteriNo] - sira[b.musteriNo] || b.puan - a.puan);
    dikkatHareket.sort((a, b) => sira[a.musteriNo] - sira[b.musteriNo] || a.tespit.localeCompare(b.tespit) || (a.tarih < b.tarih ? 1 : -1));

    // ---------- istatistik ----------
    const say = f => ozet.filter(f).length;
    const sayTur = {}; for (const x of muhataplar) { sayTur[x.tespit] ||= new Set(); sayTur[x.tespit].add(x.musteriNo); }
    const dSay = {}; for (const x of dikkatHareket.filter(d => d.tespit.startsWith('DİKKAT'))) { dSay[x.tespit] ||= new Set(); dSay[x.tespit].add(x.musteriNo); }
    const stats = {
      borclu: ozet.length, A: say(o => o.oneri[0] === 'A'), B: say(o => o.oneri[0] === 'B'), C: say(o => o.oneri[0] === 'C'), D: say(o => o.oneri[0] === 'D'),
      itirazli: say(o => o.itiraz), aktif: say(o => o.aktif === 'Evet'), hareket: hareketler.length, ekstre: ekstreler.length,
      okunan: ekstreler.filter(e => e.durum === 'okundu').length, mukerrer: ekstreler.filter(e => /mükerrer/.test(e.durum)).length, okunamayan: ekstreler.filter(e => /okunamadı/.test(e.durum)).length,
      atlanan: ekstreler.filter(e => /^atlandı/.test(e.durum)).length,
      turler: Object.fromEntries(Object.entries(sayTur).map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1])),
      dikkat: Object.fromEntries(Object.entries(dSay).map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1]))
    };

    // ---------- XLSX sayfaları ----------
    const gradeStyle = (row, c) => c.key === 'oneri' ? (row.oneri[0] === 'A' ? 5 : row.oneri[0] === 'B' ? 6 : row.oneri[0] === 'C' ? 10 : null) : null;
    const aciklama = [
      ['89/1 HACİZ İHBARNAMESİ ADAY ANALİZİ', ''],
      ['Hazırlanma tarihi', BUGUN.split('-').reverse().join('.')],
      ['Kaynak', `Seçilen ${stats.ekstre} PDF ekstre (${stats.okunan} benzersiz okundu, ${stats.mukerrer} mükerrer, ${stats.okunamayan} okunamadı${stats.atlanan ? ', ' + stats.atlanan + ' atlandı' : ''})`],
      ['Borçlu sayısı', stats.borclu],
      ['İncelenen hareket', `${stats.hareket} hareket. Not: banka ekstrelerinde yalnızca 10.000 TL ve üzeri hareketler yer alıyor; küçük tutarlı ödemeler (ör. küçük bahis yatırımları, düşük kurye hakedişleri) görünmüyor.`],
      ['', ''], ['SONUÇ DAĞILIMI', ''],
      ['A - Güçlü 89/1 adayı', stats.A], ['B - Olası 89/1 adayı', stats.B], ['C - Zayıf', stats.C], ['D - Tespit yok', stats.D],
      ['Son 12 ayda hesap hareketi olan', stats.aktif], ['', ''],
      ['TESPİT TÜRÜ', 'BORÇLU SAYISI'], ...Object.entries(stats.turler), ['', ''],
      ['DİKKAT ÇEKEN (89/1 dışı) BULGU', 'BORÇLU SAYISI'], ...Object.entries(stats.dikkat).map(([k, v]) => [k.replace('DİKKAT: ', ''), v]), ['', ''],
      ['PUANLAMA', 'Her muhatap için: tür ağırlığı × güncellik. Ağırlıklar: maaş 5; platform/düzenli şirket ödemesi 4; e-para, kripto, kira 3; başka bankadaki kendi hesabı, bahis şirketi, aracı kurum, icra dosyası, POS, yüksek tutarlı şirket ödemesi 2; sigorta/BES 1,5; şahıs ödemeleri ve VakıfBank yatırım hesabı 1. Güncellik: son 6 ay ×1, 6-12 ay ×0,7, 1-2 yıl ×0,4, daha eski ×0,15. Borçlu puanı = farklı türlerden en güçlü 3 muhatabın toplamı (en fazla 10).'],
      ['ÖNERİ SINIFLARI', 'A: son 6 ayda aktif gelir kaynağı (maaş, platform veya düzenli şirket ödemesi) var ya da puan ≥ 6. B: puan ≥ 3. C: puan > 0. D: tespit yok.'],
      ['Maaş kurum kodu', 'Bazı maaş satırlarında işveren adı yok, yalnızca VakıfBank maaş kurum kodu var (ör. "kod 04489"). Bu kod banka içinden sorgulanarak işveren adı bulunabilir.'],
      ['Kendi hesabı tespiti', 'FAST/EFT açıklamasındaki gönderen/alıcı adı borçlunun adıyla eşleşiyorsa ve karşı banka VakıfBank dışındaysa, o bankada borçlunun kendi hesabı olduğu kabul edildi.'],
      ['', ''], ['HUKUKİ NOTLAR', ''],
      ['Kesinleşme', '89/1 ihbarnamesi kural olarak kesinleşmiş takipte (haciz aşamasında) gönderilir. Her dosyada kesinleşme UYAP\'tan ayrıca kontrol edilmelidir.'],
      ['Maaş', 'Maaş/ücret haczi İİK 83 sınırları içinde yapılır. Kamu işverenlerinde uygulamada maaş haczi müzekkeresi, özel işverenlerde 89/1 ihbarnamesi ve/veya maaş haczi müzekkeresi gönderilir.'],
      ['Emekli aylığı', 'SGK tarafından bağlanan aylıklar 5510 s.K. m.93 uyarınca kural olarak haczedilemez; bu nedenle emekli aylığı tespitleri puana katılmadı, yalnızca bilgi olarak gösterildi.'],
      ['Bahis / kripto / e-para', 'Lisanslı bahis şirketleri (Nesine, Misli, Bilyoner, TJK vb.), kripto platformları (Binance TR = BN Teknoloji A.Ş., Paribu, BtcTurk vb.) ve e-para kuruluşları (Papara, Sipay, PayFix vb.) borçlunun nezdindeki bakiye/alacakları için 89/1 muhatabıdır. Başkasının e-para cüzdanına yapılan transferler yalnızca "dikkat" olarak işaretlendi.'],
      ['Sınırlar', 'Analiz yalnızca VakıfBank ekstrelerine dayanır; kefiller ayrı incelenmemiştir. Otomatik metin ayrıştırması kullanıldığından, ihbarname göndermeden önce ilgili hareketin "Dikkat Çeken Hareketler" sayfasından teyidi önerilir.']
    ].map(([a, b]) => ({ a, b }));
    const sheets = [
      { name: 'Özet ve Yöntem', header: false, filter: false, cols: [{ key: 'a', title: '', width: 42 }, { key: 'b', title: '', width: 130, type: 'w' }], rows: aciklama, styleFn: (row, c) => c.key === 'a' && (/^[A-ZÇĞİÖŞÜ0-9\/ ()\-]+$/.test(row.a) && row.a.length > 3) ? 9 : null },
      {
        name: '89-1 Adaylar', styleFn: gradeStyle, rows: ozet, cols: [
          { key: 'sira', title: 'Sıra', width: 6, type: 'i' }, { key: 'oneri', title: 'Öneri', width: 21 }, { key: 'puan', title: 'Puan', width: 7, type: 'n' },
          { key: 'borclu', title: 'Borçlu', width: 28 }, { key: 'tip', title: 'Tip', width: 9 }, { key: 'musteriNo', title: 'Müşteri No', width: 14 }, { key: 'takip', title: 'Takip No', width: 11 },
          { key: 'icra', title: 'İcra Dairesi / Dosya', width: 40 }, { key: 'borc', title: 'Takip Bakiyesi (TL)', width: 15, type: 'n' },
          { key: 'muhataplar', title: 'Önerilen 89/1 Muhatapları (puan sırasıyla)', width: 90, type: 'w' }, { key: 'dikkat', title: 'Diğer Dikkat Çekenler', width: 70, type: 'w' },
          { key: 'son', title: 'Son Hareket', width: 11, type: 'd' }, { key: 'aktif', title: 'Son 12 Ayda Hareket', width: 10 }, { key: 'donem', title: 'Ekstre Dönemi', width: 23 },
          { key: 'hesapSay', title: 'Hesap', width: 7, type: 'i' }, { key: 'ekstreSay', title: 'Ekstre', width: 7, type: 'i' }, { key: 'hareketSay', title: 'Hareket (10 bin+)', width: 9, type: 'i' },
          { key: 'giris', title: 'Toplam Giriş', width: 15, type: 'n' }, { key: 'cikis', title: 'Toplam Çıkış', width: 15, type: 'n' }, { key: 'acilis', title: 'UYAP Açılış', width: 11 }
        ]
      },
      {
        name: 'Muhataplar', styleFn: gradeStyle, rows: muhataplar, cols: [
          { key: 'oneri', title: 'Borçlu Önerisi', width: 20 }, { key: 'borclu', title: 'Borçlu', width: 26 }, { key: 'musteriNo', title: 'Müşteri No', width: 14 }, { key: 'takip', title: 'Takip No', width: 11 },
          { key: 'borc', title: 'Takip Bakiyesi', width: 14, type: 'n' }, { key: 'tespit', title: 'Tespit Türü', width: 30 }, { key: 'muhatap', title: 'Muhatap (89/1 gönderilecek)', width: 45 },
          { key: 'kanal', title: 'Kanal / Banka', width: 22 }, { key: 'vkn', title: 'VKN / Maaş Kurum Kodu', width: 16 }, { key: 'adet', title: 'İşlem', width: 7, type: 'i' }, { key: 'aySay', title: 'Ay', width: 5, type: 'i' },
          { key: 'gelen', title: 'Gelen Toplam', width: 14, type: 'n' }, { key: 'giden', title: 'Giden Toplam', width: 14, type: 'n' }, { key: 'ilk', title: 'İlk', width: 11, type: 'd' }, { key: 'son', title: 'Son', width: 11, type: 'd' },
          { key: 'guncellik', title: 'Güncellik', width: 12 }, { key: 'puan', title: 'Puan', width: 6, type: 'n' }, { key: 'islem', title: 'Önerilen İşlem', width: 70, type: 'w' }, { key: 'ornek', title: 'Örnek Hareket', width: 90 }
        ]
      },
      {
        name: 'Dikkat Çeken Hareketler', rows: dikkatHareket, cols: [
          { key: 'borclu', title: 'Borçlu', width: 26 }, { key: 'musteriNo', title: 'Müşteri No', width: 14 }, { key: 'takip', title: 'Takip No', width: 11 }, { key: 'tespit', title: 'Tespit', width: 32 },
          { key: 'muhatap', title: 'Muhatap', width: 36 }, { key: 'tarih', title: 'Tarih', width: 11, type: 'd' }, { key: 'tutar', title: 'Tutar', width: 14, type: 'n' }, { key: 'islemAdi', title: 'İşlem', width: 24 },
          { key: 'aciklama', title: 'Açıklama', width: 120 }, { key: 'hesap', title: 'Hesap', width: 14 }
        ]
      },
      {
        name: 'Tüm Hareketler (10bin+)', rows: hareketler, cols: [
          { key: 'unvan', title: 'Borçlu', width: 26 }, { key: 'musteriNo', title: 'Müşteri No', width: 14 }, { key: 'takipNolar', title: 'Takip No', width: 11 }, { key: 'tur', title: 'Tür', width: 9 },
          { key: 'hesap', title: 'Hesap', width: 14 }, { key: 'tarih', title: 'Tarih', width: 11, type: 'd' }, { key: 'saat', title: 'Saat', width: 6 }, { key: 'islemNo', title: 'İşlem No', width: 10 },
          { key: 'tutar', title: 'Tutar', width: 14, type: 'n' }, { key: 'bakiye', title: 'Bakiye', width: 14, type: 'n' }, { key: 'islemAdi', title: 'İşlem', width: 26 }, { key: 'aciklama', title: 'Açıklama', width: 120 }
        ]
      },
      {
        name: 'Ekstre Listesi', rows: ekstreler.map(e => ({ ...e, unvan: (musMap[e.musteriNo] || {}).Unvan, bakiye: num(e.bakiye) })), cols: [
          { key: 'unvan', title: 'Borçlu', width: 26 }, { key: 'musteriNo', title: 'Müşteri No', width: 14 }, { key: 'dosya', title: 'PDF Dosyası', width: 40 }, { key: 'durum', title: 'Durum', width: 20 },
          { key: 'tur', title: 'Tür', width: 9 }, { key: 'hesap', title: 'Hesap No', width: 14 }, { key: 'iban', title: 'IBAN', width: 34 }, { key: 'sube', title: 'Şube', width: 26 }, { key: 'hesapTuru', title: 'Hesap Türü', width: 22 },
          { key: 'bas', title: 'Başlangıç', width: 11, type: 'd' }, { key: 'bit', title: 'Bitiş', width: 11, type: 'd' }, { key: 'bakiye', title: 'Ekstre Bakiyesi', width: 14, type: 'n' }, { key: 'sayfa', title: 'Sayfa', width: 6, type: 'i' }, { key: 'hareket', title: 'Hareket', width: 8, type: 'i' }
        ]
      }
    ];
    return { sheets, stats, ozet, muhataplar };
  }

  // =====================================================================
  // 3) Genel Dosya Raporu, haftalık kuyruk ve tarama geçmişi
  // =====================================================================
  const sayi = v => typeof v === 'number' ? v : (() => { const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; })();
  const metin = v => v == null ? '' : String(v).trim();
  function musterileriKur(rows) {
    if (!rows.length || !('Müşteri No' in rows[0])) throw new Error('Raporda "Müşteri No" sütunu bulunamadı. "Genel Dosya Raporu (İcra Dosya)" Excel dosyasını seçin.');
    const g = {};
    for (const r of rows) { const n = musNo(r['Müşteri No']); if (n) (g[n] ||= []).push(r); }
    return Object.entries(g).map(([no, rs]) => {
      const tekil = a => [...new Set(a.filter(Boolean))];
      const takipler = tekil(rs.map(r => metin(r['Takip Dosya No'])));
      const bakiye = takipler.reduce((s, t) => s + sayi(rs.find(r => metin(r['Takip Dosya No']) === t)['Bakiye']), 0);
      const acik = (r, k) => !(k in r) || metin(r[k]) === 'Açık';
      return {
        MusteriNo: no, Unvan: metin(rs[0]['Müşteri Ünvan']), Tip: metin(rs[0]['Takip Dosya Tipi']), TakipNolar: takipler.join(','),
        IcraDosyalar: tekil(rs.map(r => `${metin(r['İcra Dairesi'])} ${metin(r['İcra Dosya No'])}`.trim())).join(' | '), Bakiye: +bakiye.toFixed(2),
        icraAcik: rs.some(r => acik(r, 'Dosya Durum') && acik(r, 'İcra Durum'))
      };
    });
  }
  // CSV (; veya , ayraçlı, tırnaklı alan destekli)
  function csvSatir(l, ay) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ay) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  }
  function csvOku(text) {
    const L = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim());
    if (!L.length) return [];
    const ay = (L[0].match(/;/g) || []).length >= (L[0].match(/,/g) || []).length ? ';' : ',';
    const H = csvSatir(L[0], ay).map(h => h.trim());
    return L.slice(1).map(l => { const v = csvSatir(l, ay); const o = {}; H.forEach((h, i) => o[h] = (v[i] ?? '').trim()); return o; });
  }
  const csvHucre = v => { v = v == null ? '' : String(v).replace(/[\r\n;]+/g, ' '); return /^[=+\-@]/.test(v) ? "'" + v : v; };
  const csvYaz = (rows, kolonlar) => '\uFEFF' + [kolonlar.join(';'), ...rows.map(r => kolonlar.map(k => csvHucre(r[k])).join(';'))].join('\r\n') + '\r\n';

  const GECMIS_KOLON = ['musteriNo', 'unvan', 'takipNolar', 'taramaTarihi', 'durum', 'ekstreSayisi', 'oneri', 'puan', 'rapor'];
  const gecmisOku = text => csvOku(text).map(r => ({ ...r, musteriNo: musNo(r.musteriNo) })).filter(r => r.musteriNo && /^\d{4}-\d\d-\d\d$/.test(r.taramaTarihi || ''));
  function gecmisBirlestir(eski, yeni) {
    const k = r => r.musteriNo + '|' + r.taramaTarihi; const m = new Map(eski.map(r => [k(r), r]));
    for (const r of yeni) m.set(k(r), r);
    return [...m.values()].sort((a, b) => (a.taramaTarihi < b.taramaTarihi ? -1 : a.taramaTarihi > b.taramaTarihi ? 1 : 0) || String(a.unvan).localeCompare(String(b.unvan), 'tr'));
  }
  const gecmisCsv = rows => csvYaz(rows, GECMIS_KOLON);
  const gunFarki = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

  function kuyrukKur({ musteriler, gecmis, tarih, yenidenTaramaGun, sadeceAcik }) {
    const son = {};
    for (const r of gecmis) if (r.taramaTarihi !== tarih && (!son[r.musteriNo] || r.taramaTarihi > son[r.musteriNo].taramaTarihi)) son[r.musteriNo] = r;
    const kuyruk = [], haric = [];
    for (const m of musteriler) {
      const s = son[m.MusteriNo];
      const kayit = { no: m.MusteriNo, takip: m.TakipNolar.split(',')[0], takipNolar: m.TakipNolar, unvan: m.Unvan, bakiye: m.Bakiye, icra: m.IcraDosyalar, tip: m.Tip };
      if (sadeceAcik && !m.icraAcik) { haric.push({ ...kayit, neden: 'Açık takip/icra dosyası yok', sonTarama: s ? s.taramaTarihi : '', sonOneri: s ? s.oneri : '' }); continue; }
      if (s) { const g = gunFarki(s.taramaTarihi, tarih); if (yenidenTaramaGun === 0 || g < yenidenTaramaGun) { haric.push({ ...kayit, neden: `Son ${g} günde tarandı (${s.durum})`, sonTarama: s.taramaTarihi, sonOneri: s.oneri }); continue; } }
      kuyruk.push(kayit);
    }
    kuyruk.sort((a, b) => b.bakiye - a.bakiye); kuyruk.forEach((k, i) => k.sira = i + 1);
    haric.sort((a, b) => (b.sonTarama || '').localeCompare(a.sonTarama || '') || b.bakiye - a.bakiye);
    return { kuyruk, haric };
  }
  // durum: {müşteriNo: {ekstre, oneri}} — analizden sonra doldurulur
  function listeSayfalari(K, durum) {
    durum = durum || {};
    const d = k => durum[k.no] ? (durum[k.no].ekstre ? `Tarandı (${durum[k.no].ekstre} ekstre)` : 'Ekstre seçilmedi') : 'Bekliyor';
    const st = (row, c) => c.key === 'durum' ? (/^Tarandı/.test(row.durum) ? 5 : 7) : c.key === 'oneri' && row.oneri ? (row.oneri[0] === 'A' ? 5 : row.oneri[0] === 'B' ? 6 : 10) : null;
    return [
      {
        name: 'Kuyruk', styleFn: st, rows: K.kuyruk.map(k => ({ ...k, durum: d(k), ekstre: (durum[k.no] || {}).ekstre || '', oneri: (durum[k.no] || {}).oneri || '' })), cols: [
          { key: 'sira', title: 'Sıra', width: 6, type: 'i' }, { key: 'unvan', title: 'Borçlu', width: 30 }, { key: 'no', title: 'Müşteri No', width: 14 }, { key: 'takip', title: 'Takip No (aranacak)', width: 12 },
          { key: 'takipNolar', title: 'Tüm Takip Nolar', width: 18 }, { key: 'icra', title: 'İcra Dairesi / Dosya', width: 50 }, { key: 'bakiye', title: 'Takip Bakiyesi (TL)', width: 16, type: 'n' },
          { key: 'durum', title: 'Durum', width: 22 }, { key: 'ekstre', title: 'Ekstre', width: 7, type: 'i' }, { key: 'oneri', title: '89/1 Önerisi', width: 22 }
        ]
      },
      {
        name: 'Hariç Tutulanlar', rows: K.haric, cols: [
          { key: 'unvan', title: 'Borçlu', width: 30 }, { key: 'no', title: 'Müşteri No', width: 14 }, { key: 'takipNolar', title: 'Takip Nolar', width: 18 }, { key: 'bakiye', title: 'Takip Bakiyesi (TL)', width: 16, type: 'n' },
          { key: 'neden', title: 'Neden', width: 32 }, { key: 'sonTarama', title: 'Son Tarama', width: 12, type: 'd' }, { key: 'sonOneri', title: 'Son Öneri', width: 22 }
        ]
      }
    ];
  }

  globalThis.Tarama = { PDF_RE, musNo, pdfMusteriNo, pdfUnvan, ekstreleriOku, analiz89, musterileriKur, csvOku, gecmisOku, gecmisBirlestir, gecmisCsv, kuyrukKur, listeSayfalari };
})();
