/* Test için uydurma başvurular: kişiler, adresler ve kurumlar gerçek değildir.
   PDF (harf harf yerleşim, form XObject, nesne akışı), DOCX, iç içe .eml, zip ve görsel örnekleri üretir. */
(function () {
  'use strict';
  const te = new TextEncoder();
  const latin = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'latin1').toString('base64')).replace(/.{76}/g, '$&\r\n'); };

  // satirlar: [{metin, harfHarf}] ; Type0/Identity-H yazı tipi, ToUnicode, genişlikler; içerik form XObject içinde, yazı tipi nesne akışında
  function pdf(satirlar) {
    const harfler = [...new Set(satirlar.map(s => s.metin).join('').replace(/ /g, ''))];
    const kod = c => harfler.indexOf(c) + 1;
    const fs = 10, gen = 500, bosluk = 250;
    let icerik = 'BT\n/F1 ' + fs + ' Tf\n'; let y = 800;
    for (const s of satirlar) {
      if (s.harfHarf) {
        let x = 50;
        for (const c of s.metin) {
          if (c !== ' ') icerik += `1 0 0 1 ${x.toFixed(2)} ${y} Tm <${hex4(kod(c))}> Tj\n`;
          x += (c === ' ' ? bosluk : gen) * fs / 1000;
        }
      } else {
        const sozler = s.metin.split(' ');
        icerik += `1 0 0 1 50 ${y} Tm [` + sozler.map(w => '<' + [...w].map(c => hex4(kod(c))).join('') + '>').join(' -300 ') + '] TJ\n';
      }
      y -= 16;
    }
    icerik += 'ET\n';
    const tu = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
      harfler.length + ' beginbfchar\n' + harfler.map(c => `<${hex4(kod(c))}> <${hex4(c.charCodeAt(0))}>`).join('\n') + '\nendbfchar\nendcmap\nend\nend\n';
    const fontObj = '<< /Type /Font /Subtype /Type0 /BaseFont /Ornek /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 8 0 R >>';
    const objStm = '6 0 ' + fontObj;
    const ilk = '6 0 '.length;
    const nesneler = [
      [1, '<< /Type /Catalog /Pages 2 0 R >>'],
      [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
      [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /X1 4 0 R >> >> /Contents 5 0 R >>'],
      [4, `<< /Type /XObject /Subtype /Form /BBox [0 0 595 842] /Resources << /Font << /F1 6 0 R >> >> /Length ${icerik.length} >>`, icerik],
      [5, '<< /Length 25 >>', 'q 1 0 0 1 0 0 cm /X1 Do Q'],
      [7, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Ornek /DW 1000 /W [1 [${harfler.map(() => gen).join(' ')}]] >>`],
      [8, `<< /Length ${tu.length} >>`, tu],
      [9, `<< /Type /ObjStm /N 1 /First ${ilk} /Length ${objStm.length} >>`, objStm]
    ];
    let out = '%PDF-1.5\n';
    for (const [n, d, akis] of nesneler) out += `${n} 0 obj\n${d}\n${akis != null ? 'stream\n' + akis + '\nendstream\n' : ''}endobj\n`;
    out += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
    return te.encode(out); // tüm içerik ASCII ya da \u altında: kodlar onaltılık yazıldı
  }

  async function docx(paragraflar) {
    const p = paragraflar.map(t => `<w:p><w:r><w:t xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p}<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Tablo</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Hücre</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const resim = new Uint8Array(1500); let r = 7; for (let i = 0; i < resim.length; i++) { r = (r * 1103515245 + 12345) >>> 0; resim[i] = r >>> 24; } // sıkışmayan dolgu: gerçek DOCX'ler gibi 800 bayttan büyük olsun
    return globalThis.Zip.zip([{ ad: '[Content_Types].xml', veri: te.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') }, { ad: 'word/document.xml', veri: te.encode(xml) }, { ad: 'word/media/image1.png', veri: resim }]);
  }

  const rfc2047 = s => '=?UTF-8?B?' + b64(te.encode(s)).replace(/\r\n/g, '') + '?=';
  const qp = s => [...te.encode(s)].map(b => (b > 126 || b === 61) ? '=' + b.toString(16).toUpperCase().padStart(2, '0') : String.fromCharCode(b)).join('');
  // mail: {kimden, konu, govde, ekler:[{ad, veri, tur}], ic: mail (iletilen)}
  function eml(m) {
    const sinir = 'sinir-' + Math.random().toString(36).slice(2);
    let s = `From: ${m.kimden}\r\nTo: ik@buro.test\r\nSubject: ${rfc2047(m.konu)}\r\nDate: Mon, 3 Nov 2025 10:00:00 +0300\r\nMIME-Version: 1.0\r\n`;
    s += `Content-Type: multipart/mixed; boundary="${sinir}"\r\n\r\nBu bir MIME iletisidir.\r\n`;
    s += `--${sinir}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${qp(m.govde || '')}\r\n`;
    if (m.ic) s += `--${sinir}\r\nContent-Type: message/rfc822\r\nContent-Disposition: attachment\r\n\r\n${eml(m.ic)}\r\n`;
    for (const e of m.ekler || []) {
      const adKodlu = "UTF-8''" + encodeURIComponent(e.ad);
      s += `--${sinir}\r\nContent-Type: ${e.tur || 'application/octet-stream'}; name="${e.ad.replace(/[^\x20-\x7e]/g, '_')}"\r\nContent-Disposition: attachment;\r\n filename*=${adKodlu}\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(e.veri)}\r\n`;
    }
    s += `--${sinir}--\r\n`;
    return s;
  }
  const baytla = s => te.encode(s); // başlıklarda ham UTF-8 de olur

  const sahteJpeg = () => { const u = new Uint8Array(4000); u.set([0xFF, 0xD8, 0xFF, 0xE0]); for (let i = 4; i < u.length; i++) u[i] = (i * 31) & 255; return u; };

  const CV = {
    avukat: [
      { metin: 'Deniz Örnek', harfHarf: true },
      { metin: 'deniz.ornek@ornek.test 0532 111 22 33', harfHarf: true },
      { metin: 'Kadıköy İstanbul' },
      { metin: 'EĞİTİM' },
      { metin: 'Örnek Üniversitesi Hukuk Fakültesi 2013 - 2017' },
      { metin: 'İstanbul Barosu ruhsat 2018 Av. Deniz Örnek' },
      { metin: 'DENEYİM' },
      { metin: '2018 - halen Örnek Hukuk Bürosu avukat olarak çalıştım' },
      { metin: 'icra takip, dilekçe, duruşma, müvekkil görüşmeleri, istinaf' },
      { metin: 'İngilizce C1 TOLES' },
      { metin: 'UYAP İcramatik Excel MS Office' },
      { metin: 'Hakkımda: çözüm odaklı, ekip çalışmasına yatkın, yoğun tempoya uyumlu biriyim.' },
      { metin: 'Kurslar: arabuluculuk temel eğitimi, kişisel verilerin korunması semineri.' },
      { metin: 'Referanslar talep halinde iletilecektir. Ehliyet: B sınıfı.' }
    ],
    callcenter: [
      { metin: 'Mehmet Deneme', harfHarf: true },
      { metin: 'mehmet.deneme@ornek.test' },
      { metin: 'Örnek Anadolu Lisesi' },
      { metin: '2017 - 2023 Örnek Çağrı Merkezi tahsilat uzmanı outbound arama' },
      { metin: 'müşteri temsilcisi olarak banka alacaklarında borçlu araması' },
      { metin: 'Excel Avaya CRM' },
      { metin: 'Hakkımda: sabırlı, iletişimi güçlü, hedef odaklı çalışmayı seven biriyim.' },
      { metin: 'Kurslar: etkili iletişim eğitimi, zaman yönetimi semineri, ilk yardım belgesi.' },
      { metin: 'Referanslar talep halinde iletilecektir. Ehliyet: B sınıfı. Askerlik: yapıldı.' },
      { metin: 'Görevlerim: günlük arama listesinin yönetimi, ödeme sözlerinin kaydı ve takibi.' }
    ],
    stajyer: ['Ayşe Taslak', 'ayse.taslak@ornek.test', 'Örnek Üniversitesi Hukuk Fakültesi 4. sınıf öğrencisiyim', 'Yaz stajı: Örnek Hukuk Bürosu 2024', 'İngilizce B2', 'MS Office UYAP', 'Beşiktaş İstanbul']
  };

  async function basvurular() {
    const Z = globalThis.Zip;
    const avPdf = pdf(CV.avukat), ccPdf = pdf(CV.callcenter), stj = await docx(CV.stajyer);
    const fatura = pdf([{ metin: 'Fatura no 123 tutar 100 TL' }]);
    // 1) İletilmiş mail: dışta büroda ileten kişi, içte aday ve CV'si
    const iletilen = (konu, aday, ek) => eml({ kimden: 'Ofis Calisani <iletici@buro.test>', konu: 'Fwd: ' + konu, govde: 'Bilginize.', ic: { kimden: aday, konu, govde: 'Merhaba, CV\'m ektedir.', ekler: [ek] } });
    const m1 = iletilen('Avukat ilanı başvurusu', '"Deniz Örnek" <deniz.ornek@ornek.test>', { ad: 'Deniz Örnek CV.pdf', veri: avPdf, tur: 'application/pdf' });
    const m2 = iletilen('Stajyer başvurusu', 'Ayşe Taslak <ayse.taslak@ornek.test>', { ad: 'Ayşe Taslak Özgeçmiş.docx', veri: stj });
    const m3 = iletilen('CV', 'Görsel Aday <gorsel.aday@ornek.test>', { ad: 'IMG_0001.jpeg', veri: sahteJpeg(), tur: 'image/jpeg' });
    // 4) Eksiz, uzun gövdeli başvuru; 5) yalnız fatura eki olan mail
    const m4 = eml({ kimden: 'Selin Yazı <selin.yazi@ornek.test>', konu: 'Ofis asistanı ilanı', govde: 'Merhaba, ilanınızı gördüm. Lise mezunuyum, 2019 - 2024 yılları arasında bir muhasebe bürosunda sekreter ve ön muhasebe çalışanı olarak görev yaptım. Evrak arşiv ve dosyalama işlerinde deneyimliyim. Excel ve MS Office kullanıyorum.' });
    const m5 = eml({ kimden: 'Muhasebe <muhasebe@tedarikci.test>', konu: 'Fatura bilgilendirme', govde: 'Faturanız ektedir.', ekler: [{ ad: 'fatura.pdf', veri: fatura, tur: 'application/pdf' }] });
    const zipli = await Z.zip([{ ad: 'basvurular/m2.eml', veri: baytla(m2) }, { ad: 'basvurular/m3.eml', veri: baytla(m3) }]);
    return {
      dosyalar: [
        { ad: 'm1.eml', yol: 'm1.eml', veri: baytla(m1) },
        { ad: 'm1 (kopya).eml', yol: 'm1 (kopya).eml', veri: baytla(m1) },
        { ad: 'basvurular.zip', yol: 'basvurular.zip', veri: zipli },
        { ad: 'm4.eml', yol: 'm4.eml', veri: baytla(m4) },
        { ad: 'm5.eml', yol: 'm5.eml', veri: baytla(m5) },
        { ad: 'mehmet.pdf', yol: 'Callcenter/mehmet.pdf', veri: ccPdf }
      ],
      avPdf, ccPdf, stj
    };
  }

  globalThis.CvOrnekler = { pdf, docx, eml, basvurular, CV };
})();
