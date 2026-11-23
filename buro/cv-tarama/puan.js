/* Adayları tekilleştirir, beş kategoriye ayırır ve 100 puanlık cetvele göre puanlar.
   Kaynak: Claude ile yazılan "cv-tarama" programının score.py dosyası; kurallar aynen taşındı.
   Puan.adaylar(kayitlar) -> [{kat, ad, eposta, telefon, egitim, ozet, dosya, s:[5], toplam, manuel, not, yil, metin, ekKimligi, kaynak}] */
(function () {
  'use strict';

  const TR = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'İ': 'i', 'â': 'a', 'î': 'i', 'û': 'u' };
  const trMap = s => s.replace(/[çğıöşüİâîû]/g, c => TR[c]);
  // ASCII'ye katla. Bozuk Türkçe harfli metinlerde de desenler tutsun diye iki taraf aynı zemine indirilir.
  const fold = x => trMap(String(x || '').replace(/İ/g, 'i').toLowerCase().replace(/i̇/g, 'i'));
  const F = p => new RegExp(trMap(p));
  const FS = p => trMap(p);

  const LAW = F('hukuk fak[üu]ltesi|faculty of law|law school|hukuk lisans|hukuk b[öo]l[üu]m[üu]');
  const LIC = F('ruhsat|baro levhas|baroya kay|\\bav\\.\\s*[a-z]|attorney at law|avukat olarak (çalış|görev|faaliyet)|avukatlık yap|barosu.{0,20}avukat');
  const STU = F('\\d\\s*\\.\\s*sınıf|öğrencisiyim|öğrencis[iy]|stajyer öğrenci|öğrenci stajyer|yasal staj|stajyer avukat|hukuk stajı');

  const KW = {
    avukat: ['dava (dosya|takip|süreç)', 'duruşma', 'dilekçe', 'm[üu]vekkil', 'istinaf|temyiz', '\\bcmk\\b', 'danışmanlık', 'sözleşme hazırla', 'hukuki araştırma'],
    stajyer: ['stajyer', 'staj\\b', 'öğrenci', 'yaz staj', 'gönüllü staj', '\\bintern\\b'],
    callcenter: ['çağr[ıi] merkez', 'call ?cent', 'müşteri temsilcis', 'müşteri hizmet', 'telefonla tahsilat', 'dialer', 'inbound|outbound',
      'tahsilat uzman|tahsilat yetkilis|tahsilat sorumlus', 'süpervizör|supervisor', 'borçlu aram', 'ikna kabiliyet'],
    islemci: ['icra takip', 'işlemci', 'icra dosya', '\\buyap\\b', 'haciz', 'avukat katib|avukat yardımcıs', 'adliye takip|adliye işlem', 'icra memur',
      'icramatik', '\\byts\\b', 'icra pro|icra partner', 'sinerji', 'takip eleman|takip memur', 'icra uzman|icra sorumlu', 'yasal takip', 'tebligat', 'ilamlı|ilamsız'],
    ofis: ['sekreter', 'asistan', 'ofis eleman|ofis çalışan|büro personel', 'idari işler', 'ön muhasebe', 'resepsiyon|karşılama|santral', 'çay|kahve servis|temizlik',
      'yönetici asistan', 'ofis müdür|ofis yönet', 'evrak (kayıt|arşiv|düzen)', 'dosyalama', 'arşiv']
  };
  for (const k in KW) KW[k] = KW[k].map(F);
  const SOFT = ['\\buyap\\b', '\\byts\\b', 'icramatik', 'icra ?pro', 'icra ?partner', 'sinerji', 'hansoft', 'katibim', 't-?hos', 'meşe', 'galle', 'asistan34', 'optima',
    '\\blega\\b', 'uets', '\\bsap\\b', 'netsis', 'mikro\\b', '\\bcrm\\b', 'excel', 'microsoft office|ms ?office', 'lexpera', 'jurix', 'kazanci', '\\budf\\b', 'avaya',
    'altitude', 'themis', 'makbuztek', 'icramanager', 'f klavye|on parmak'].map(F);
  const LANGS = ['ingilizce|english', 'almanca|german', 'fransızca|french', 'arapça|arabic', 'rusça', 'ispanyolca', 'italyanca', 'japonca', 'kürtçe', 'yunanca'].map(F);
  const KATLAR = ['Avukat', 'Stajyer', 'Callcenter', 'İşlemci', 'Ofis elemanı'];
  const CAT = { avukat: 'Avukat', stajyer: 'Stajyer', callcenter: 'Callcenter', islemci: 'İşlemci', ofis: 'Ofis elemanı' };
  const SKIP = /(fatura|UBL|tebligat|referansmektub|tanitim mektub|aday b.ro|ielts)/i;
  const FWD = /noreply|kariyer\.net|linkedin|mail delivery|postmaster/i;
  const ISIMSIZ = '(isim tespit edilemedi)';
  const BU_YIL = new Date().getFullYear();

  const hits = (t, ps) => ps.reduce((n, p) => n + (p.test(t) ? 1 : 0), 0);

  function years(t) {
    let tot = 0;
    for (const m of t.matchAll(/\b(19[89]\d|20[0-2]\d)\s*[-–—/]\s*(19[89]\d|20[0-2]\d|halen|h[âa]len|g[üu]n[üu]m[üu]z|devam|present)\b/g)) {
      const y2 = /^\d+$/.test(m[2]) ? +m[2] : BU_YIL; const d = y2 - +m[1];
      if (d > 0 && d <= 30) tot += d;
    }
    const ms = [...t.matchAll(/(\d{1,2})\s*\+?\s*(?:yıl|yil|sene|year)/g)].map(m => +m[1]).filter(x => x > 0 && x <= 40);
    return Math.min(35, Math.max(tot, ms.length ? Math.max(...ms) : 0));
  }

  function eduScore(t) {
    let s = 8, b = 0;
    if (F('doktora|\\bphd\\b').test(t)) s = 20;
    else if (F('y[üu]ksek lisans|master|\\bllm\\b').test(t)) s = 19;
    else if (LAW.test(t)) s = 16;
    else if (F('[üu]niversite|fak[üu]lte|lisans|university|bachelor').test(t) && !F('ön ?lisans').test(t)) s = 14;
    else if (F('ön ?lisans|meslek y[üu]ksek|\\bmyo\\b|adalet mesle|y[üu]ksekokul').test(t)) s = 12;
    else if (F('\\blise\\b|anadolu lises|meslek lises|açık ?öğretim').test(t)) s = 8;
    else if (F('ilkokul|ilköğretim').test(t)) s = 5;
    if (F('adalet|zabıt katip').test(t) && s <= 12) b++;
    if (F('onur (derece|öğrenci)|birinci|ikinci|başarı bursu|burslu|full merit').test(t)) b++;
    if (/\b3[.,][0-9]\b|gano\s*:?\s*3|gpa\s*:?\s*3/.test(t)) b++;
    return Math.min(20, s + b);
  }

  function classify(text, body, subject, fname) {
    const t = fold(text + ' ' + body), s = fold(subject + ' ' + fname);
    const law = LAW.test(t), lic = LIC.test(t), stu = STU.test(t);
    const sc = {}; for (const k in KW) sc[k] = hits(t, KW[k]);
    // Aday hangi ilana başvurduğunu bilir: mail konusu CV içeriğine ağır basar.
    if (F('staj|öğrenci').test(s)) sc.stajyer += 3;
    if (F('çağr[ıi]|call ?cent|süpervizör|supervisor|tahsilat').test(s)) sc.callcenter += 4;
    if (F('işlemci|icra|haciz|takip').test(s)) sc.islemci += 4;
    if (F('asistan|sekreter|ofis|temizlik|çay|yardımcı personel').test(s)) sc.ofis += 3;
    if (F('avukat|meslektaş|baro').test(s)) sc.avukat += 2;
    // Sert kapılar: bunlar olmadan sınıflandırma dağılır
    if (!law) { sc.avukat = 0; sc.stajyer = Math.max(0, sc.stajyer - 4); }
    else if (lic) sc.avukat += 8;
    else if (stu) { sc.stajyer += 6; sc.avukat = Math.max(0, sc.avukat - 2); }
    else sc.avukat += 2;
    let en = null; for (const k in sc) if (en == null || sc[k] > sc[en]) en = k;
    if (sc[en] === 0) return { kat: 'Ofis elemanı', sc, law, lic };
    return { kat: CAT[en], sc, law, lic };
  }

  const DENEYIM = [[0, 4], [1, 9], [2, 12], [3, 15], [4, 17], [5, 19], [7, 22], [9, 24], [12, 26], [15, 28], [99, 30]];
  function score(text, body, kat, sc, lic, chars) {
    const t = fold(text + ' ' + body);
    if (chars < 150 && body.length < 200) return [0, 0, 0, 0, 0];
    const e = eduScore(t), y = years(t);
    let d = DENEYIM.find(([k]) => y <= k)[1];
    // "ilgili" deneyim: sektör dışı geçmiş tam puan almaz
    if (!F('hukuk b[üu]ro|avukatl?ık|adliye|icra|hukuk departman|law (firm|office)|varlık y[öo]netim|faktoring').test(t)) d = Math.max(3, Math.floor(d * 0.7));
    const key = Object.keys(CAT).find(k => CAT[k] === kat);
    let u = Math.min(25, 6 + Math.min(15, sc[key] * 2) + (F('istanbul|şişli|kağıthane|beşiktaş|mecidiyeköy|levent|kadıköy|üsküdar').test(t) ? 3 : 0));
    if (kat === 'Avukat' && lic) u = Math.min(25, u + 2);
    const nl = hits(t, LANGS); let lv = 0;
    for (const [p, v] of [[F('\\bc2\\b|akıcı|toles|ielts|toefl|\\byds\\b'), 3], [/\bc1\b|ileri (duzey|seviye)/, 3], [F('\\bb2\\b|iyi (derece|seviye)'), 2], [F('\\bb1\\b|orta (seviye|düzey)'), 1]])
      if (p.test(t)) lv = Math.max(lv, v);
    const l = Math.min(10, Math.min(5, nl * 2) + lv);
    let tk = Math.min(15, 2 + hits(t, SOFT) * 2);
    if (chars < 500) { tk = Math.min(tk, 7); d = Math.min(d, 14); } // beyan doğrulanamıyor
    return [e, d, u, l, tk];
  }

  const BAD = new Set(`ozgecmis hakkimda iletisim egitim deneyim deneyimler kisisel beceri beceriler referans
referanslar hukuk avukat cv profil adres telefon eposta mail sertifika sertifikalar yetkinlik
yetkinlikler diller kariyer bilgiler about contact education skills experience resume basvuru
merhaba sayin tarih dogum is staj stajyer ogrenci uyap office microsoft istanbul turkiye bilgi
durumu askerlik medeni surucu ehliyet hobiler ilgi alanlari cinsiyet vatandaslik uyruk not
ortalamasi lisans universitesi fakultesi lisesi anadolu meslek yuksekokulu kurslar projeler
faaliyetler personal information work objective language languages summary profile insan
kaynaklari uzmani sorumlusu yonetici asistani mudur memur katip elemani personeli operasyon
tecrubesi gecmisi nitelikler planlama merkezi departmani sistemi hayatim mahallesi caddesi
sokak ilkokul ortaokul university college school faculty law center centre call bank finansbank bankasi
burosu partner sirketi ltd tipi fatura no numarasi danismanlik holding group grup`.split(/\s+/));
  const HARF = /^[A-ZÇĞİÖŞÜa-zçğıöşü'. ]+$/;
  const harfli = c => c.toLowerCase() !== c.toUpperCase();
  const buyukMu = s => [...s].some(harfli) && [...s].every(c => !harfli(c) || c === c.toUpperCase());
  function baslikMi(s) { // Python str.istitle
    let onceki = false, var_ = false;
    for (const c of s) {
      if (!harfli(c)) { onceki = false; continue; }
      const buyuk = c === c.toUpperCase();
      if (buyuk && onceki) return false;
      if (!buyuk && !onceki) return false;
      onceki = true; var_ = true;
    }
    return var_;
  }
  const strip = (s, ch) => { let a = 0, b = s.length; while (a < b && ch.includes(s[a])) a++; while (b > a && ch.includes(s[b - 1])) b--; return s.slice(a, b); };
  // Büyük harfli metinde "I" çoğu zaman noktalı i'dir (Canva vb. büyük harf dönüşümü), bu yüzden I -> i
  const buyukHarfle = s => s.split(/\s+/).filter(Boolean).map(w => {
    const bas = w[0] === 'i' ? 'İ' : w[0] === 'ı' ? 'I' : w[0].toUpperCase();
    return bas + w.slice(1).replace(/İ/g, 'i').toLowerCase().replace(/i\u0307/g, 'i');
  }).join(' ');

  function looksName(s, email) {
    const w = s.split(/\s+/).filter(Boolean);
    if (!(w.length >= 2 && w.length <= 4) || /[0-9@/\\|:;()[\]]/.test(s)) return 0;
    if (!HARF.test(s)) return 0;
    const f = w.map(x => strip(fold(x), '.'));
    if (f.some(x => BAD.has(x)) || f.some(x => x.length < 2)) return 0;
    let sc = 2 + (buyukMu(s) || baslikMi(s) ? 1 : 0);
    if (email) { // e-posta ile örtüşme en güçlü sinyal
      const lp = fold(email.split('@')[0].replace(/[^a-zA-Z]/g, ''));
      sc += f.filter(x => x.length > 2 && lp.includes(x)).length * 3;
    }
    return sc;
  }

  function bestName(text, email, header) {
    const cands = [];
    const m = text.match(/(?:ad[ıi]?\s*soyad[ıi]?|ad\s*-\s*soyad|isim)\s*[:-]\s*([^\n]{4,40})/i);
    if (m) cands.push([10, m[1].trim()]);
    for (const line of text.split('\n').slice(0, 30).map(x => strip(x, ' :•|*-–—\t'))) {
      let s = line.replace(/^(av\.|stj\.|dr\.)\s*|^(avukat|stajyer|av|stj|dr)\s+/i, '').trim().replace(/\s{2,}/g, ' ');
      if (s.length >= 5 && s.length <= 40) { const v = looksName(s, email); if (v) cands.push([v, s]); }
    }
    if (cands.length) {
      let en = cands[0]; for (const c of cands) if (c[0] > en[0]) en = c;
      if (en[0] >= 3) return buyukHarfle(en[1]);
    }
    for (const mm of (header || '').matchAll(/"?([^"<@;]{4,45}?)"?\s*</g)) {
      const n = strip(mm[1].trim(), ' .');
      const k = n.split(/\s+/).filter(Boolean).length;
      if (!FWD.test(n) && k >= 2 && k <= 4 && HARF.test(n)) return buyukHarfle(n);
    }
    if (email) {
      const lp = email.split('@')[0].replace(/\d+/g, '').replace(/^(av|avukat|stj)[._]?/, '');
      const p = lp.split(/[._-]/).filter(x => x.length > 1);
      if (p.length) return buyukHarfle(p.join(' '));
    }
    return ISIMSIZ;
  }

  function emailOf(...parts) {
    const e = [...parts.join(' ').matchAll(/[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_.-]+\.[\p{L}\p{N}_]+/gu)].map(x => x[0].toLowerCase())
      .filter(y => !['noreply', 'kariyer.net', 'linkedin', 'example', 'info@'].some(k => y.includes(k)));
    return e[0] || '';
  }

  const normal = s => s.replace(/[^\p{L}\p{N}_]+/gu, '');
  const bosluk = s => s.replace(/\s+/g, ' ');
  const uzanti = ad => ((ad.match(/\.[^.]+$/) || [''])[0]).toLowerCase();

  const DURUM_NOTU = {
    gorsel: 'Görsel CV (fotoğraf ya da tarama); tarayıcı metni okuyamadı. Dosyayı açıp elle puanlayın',
    sifreli: 'Şifreli PDF; metin okunamadı. Dosyayı açıp elle puanlayın',
    hata: 'Dosya okunamadı. Dosyayı açıp elle puanlayın',
    desteksiz: 'Bu dosya türü okunamıyor. Dosyayı açıp elle puanlayın',
    taranmis: 'Taranmış PDF; metin yok. Dosyayı açıp elle puanlayın'
  };

  // kayitlar: [{idx, konu, kimden, govde, icMailler:[{kimden}], ekler:[{ad, boy, metin, durum, kimlik}]}]
  const adiAl = k => ((k || '').match(/^\s*"?([^"<@]+?)"?\s*</) || [])[1] || '';
  function adaylar(kayitlar) {
    // Üç ya da daha çok ayrı mailin dış göndereni olan kişi başvuruları ileten çalışandır: aday adı olarak kullanılmaz
    const say = {}; for (const r of kayitlar) { const a = fold(adiAl(r.kimden)).trim(); if (a) say[a] = (say[a] || 0) + 1; }
    const ileten = new Set(Object.keys(say).filter(a => say[a] >= 3));
    const cands = new Map();
    const add = (k, c) => { if (cands.has(k)) cands.get(k).kaynak.push(c.kaynak[0]); else cands.set(k, c); };
    for (const r of kayitlar) {
      const satirIci = [...(r.govde || '').matchAll(/^\s*(?:From|Kimden|Gönderen)\s*:\s*([^\n]*<[^>\n]+>)/gim)].map(m => m[1]);
      const dis = ileten.has(fold(adiAl(r.kimden)).trim()) ? '' : (r.kimden || '');
      const hdr = [...(r.icMailler || []).map(n => n.kimden || ''), ...satirIci, dis].filter(Boolean).join('; ');
      for (const a of r.ekler) {
        if (SKIP.test(a.ad) || ['.zip', '.xlsx', '.xls', ''].includes(uzanti(a.ad))) continue;
        const t = a.metin || '';
        const k = t.length > 200 ? 'm:' + normal(fold(t)).slice(0, 1200) : 'd:' + a.ad + a.boy;
        add(k, { dosya: a.ad, ekKimligi: a.kimlik, chars: t.length, text: t, durum: a.durum, kaynak: [r.idx], subject: r.konu || '', header: hdr, body: bosluk(r.govde || '').slice(0, 600) });
      }
      if (!r.ekler.length) {
        const b = bosluk(r.govde || '');
        if (b.length < 150) continue;
        add('g:' + normal(b.toLowerCase()).slice(0, 350), { dosya: '(ek yok, mail metni)', ekKimligi: null, chars: 0, text: '', durum: 'govde', kaynak: [r.idx], subject: r.konu || '', header: hdr, body: b.slice(0, 1000) });
      }
    }

    const rows = [];
    for (const c of cands.values()) {
      const email = emailOf(c.text, c.body, c.header);
      const { kat, sc, lic } = classify(c.text, c.body, c.subject, c.dosya);
      const s = score(c.text, c.body, kat, sc, lic, c.chars);
      const toplam = s.reduce((a, b) => a + b, 0);
      let not = '';
      if (toplam === 0) {
        const d = c.durum === 'tamam' && c.chars < 150 && /\.pdf$/i.test(c.dosya) ? 'taranmis' : c.durum;
        not = DURUM_NOTU[d] || 'CV eki yok ya da okunamadı; değerlendirilemedi';
      }
      const ph = (c.text + ' ' + c.body).match(/(?:\+?90[ -]?)?\(?0?5\d{2}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}/);
      const ed = [...c.text.matchAll(/[^\n]{0,70}(?:[Üü]niversite|Fak[üu]lte|Y[üu]ksekokul|Anadolu Lisesi|Açık ?[Öö]ğretim|University|Lise)[^\n]{0,45}/g)].slice(0, 2)
        .map(x => strip(bosluk(x[0]), ' :|•-'));
      rows.push({
        kat, ad: bestName(c.text, email, c.header), eposta: email, telefon: ph ? ph[0].trim() : '',
        egitim: [...new Set(ed)].join(' ; ').slice(0, 120) || 'Belirtilmemiş',
        ozet: bosluk(c.text || c.body).slice(0, 300), dosya: c.dosya, ekKimligi: c.ekKimligi,
        s, toplam, manuel: false, oncelik: '', not, yil: years(fold(c.text + ' ' + c.body)),
        metin: c.text || c.body, kaynak: c.kaynak, konu: c.subject
      });
    }

    // ikinci tekilleştirme: aynı kişi farklı dosyalarda
    const seen = new Set(), son = [];
    for (const o of rows.slice().sort((a, b) => (b.toplam - a.toplam) || (b.ozet.length - a.ozet.length))) {
      const n = o.ad === ISIMSIZ ? '' : fold(o.ad).replace(/ /g, ''); const p = o.telefon.replace(/\D/g, '').slice(-10);
      const keys = [o.eposta, n && p ? n + '|' + p : '', n.length > 10 ? n : ''].filter(Boolean);
      if (keys.some(k => seen.has(k))) continue;
      keys.forEach(k => seen.add(k));
      son.push(o);
    }
    return son;
  }

  function bant(t) {
    return t === 0 ? 'Değerlendirilemedi' : t >= 75 ? 'Öncelikli' : t >= 65 ? 'Güçlü aday' : t >= 50 ? 'Değerlendirilebilir' : 'Zayıf eşleşme';
  }

  globalThis.Puan = { adaylar, bant, fold, classify, score, years, eduScore, bestName, emailOf, KATLAR, ISIMSIZ, SKIP };
})();
