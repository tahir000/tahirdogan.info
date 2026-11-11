# Excel Birleştirme: Kurulum ve Kullanım

Gelen Excel'leri (banka cevapları, tebligat raporu, sorgu listeleri) tek bir ana Excel'de birleştiren sayfa.

- **Sayfa düzeni:** Her kurum (müvekkil) bir sayfadır. Her satır, bir dosyadaki bir borçludur.
- **Nasıl dolar:** Gelen her Excel kendi bilgisini o satırın ilgili sütununa yazar.
- **Rapor:** Sayfa, neyin hangi sayfaya ve hangi sütuna yazıldığını gösterir.
- **Gizlilik:** Tüm işlem tarayıcıda yapılır. Dosyalar hiçbir sunucuya gönderilmez.

## Sunucuya kurulum

Aşağıdaki beş dosyayı sunucuda aynı klasöre koymak yeterli:

| Dosya | Görevi |
| --- | --- |
| `index.html` | Sayfanın kendisi |
| `arayuz.js` | Dosya seçme, rapor, notlar, ayarlar |
| `birlestirme.js` | Satırları tanıma ve yerleştirme kuralları |
| `okuyucu.js` | Excel ve CSV okuma |
| `yazici.js` | Biçimli ana Excel'i oluşturma |

- **Gereken:** Sunucuda program ya da veritabanı gerekmez. Statik dosya sunan her yer çalışır: nginx, Apache ya da bir bulut depolamanın statik site özelliği.
- **Yüklenmesi gerekmeyenler:** `test/` klasörü ve bu dosya.
- **HTTPS:** Sayfayı HTTPS ile yayınlayın.
- **Erişim:** Sayfa veri tutmaz, yine de adresin dışarıda dolaşmaması için erişimi büroyla sınırlayın. Şifreli dizin, VPN ya da IP kısıtı olabilir. Sayfa arama motorlarına kapalıdır (`noindex`).
- **Dış bağlantı yok:** Dış kütüphane ya da yazı tipi yüklenmez. Sayfanın güvenlik politikası dışarıya her türlü bağlantıyı kapatır.

nginx için şifreli dizin örneği:

```nginx
location /excel-birlestirme/ {
    auth_basic "Büro";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

Sayfa sunucuya konmadan da kullanılabilir: `index.html` Chrome'da çift tıklanarak açılır.

## Kullanım

1. **Ana Excel:** İlk kullanımda boş bırakın. Sonraki her seferde en son indirilen ana Excel'i seçin.
2. **Gelen Excel'ler:** WhatsApp'tan gelen dosyaları seçin ya da sürükleyin. Her sayfa için şunlar görünür: türü, satır sayısı ve hangi sütunun nereye gideceği. Kutuyla sayfayı dahil edip çıkarabilirsiniz. Dosyalar değiştirilme tarihine göre eskiden yeniye işlenir.
3. **Birleştir:** Rapor çıkar. Satırların hangi kurum sayfasına gittiğini, hangi sütunlara kaç satır yazıldığını, eşleşen ve kullanılmayan sütunları, atlanan satırları nedenleriyle ve Diğer'e gidenleri gösterir. Altında satır satır döküm vardır.
4. **Ana Excel'i indir:** "Ana Excel YYYY-AA-GG SS.DD.xlsx" adıyla iner. Bir sonraki sefer 1. adımda bu dosyayı seçin.

**Tek güncel ana Excel.** Ana Excel tek kaynaktır. Büronun ortak klasöründe tek bir güncel ana Excel tutun; her birleştirmeden sonra yeni indirileni oraya koyun. İki kişi aynı anda farklı kopyalarla çalışırsa birinin eklediği bilgi ötekinin dosyasında olmaz.

## Ana Excel'in sayfaları

| Sayfa | İçerik |
| --- | --- |
| Kurum sayfaları (her müvekkil için bir sayfa) | Kurumun borçluları |
| Diğer | Kurumu bulunamayan satırlar |
| Notlar | Excel'lerden bağımsız notlar. Sayfadaki formdan ya da doğrudan Excel'de yazılır |
| Günlük | Her yüklemede hangi dosyadan kaç satır geldiği |
| Son Yükleme Raporu | Son birleştirmede satır satır neyin nereye yazıldığı |
| Ayarlar | Kurum listesi ve sütun eşleştirmeleri |

Sütunlar: Borçlu Adı, Borçlu TCKN / VKN, İcra Dairesi, Dosya No, Tebligat Bilgisi, Kesinleşme Bilgisi, Araç Sorgusu, Araç Haczi, Tapu Sorgusu, Tapu Haczi, Alacaklı Olduğu Dosya Sorgusu, Alacaklı Olduğu Dosya Haczi, Maaş Sorgusu, Maaş Haczi, Banka Sorgusu, Banka Haczi, Bankada Para Var mı?, Bankadan Para İstendi mi?, Firma Sorgusu, Firma Haczi. Sonra Föy No, Alacaklı, Son Güncelleme ve Kaynak gelir. Son ikisi satırın en son ne zaman ve hangi dosyadan güncellendiğini gösterir.

Ana Excel'de elle değişiklik yapılabilir: hücreler düzeltilir, not yazılır, yeni sütun eklenir. Bunlar sonraki birleştirmede korunur. Renk gibi elle verilen biçimler yeniden indirince sıfırlanır, değerler kalır.

## Gelen dosyalar nasıl okunur

- **Satırın yeri:** İcra Dairesi, Dosya No ve borçlu adı birlikte aranır. TCKN / VKN varsa önce o kullanılır, Föy No da yedek anahtardır. Şirket adındaki kısaltmalar (İNŞ., TİC., LTD. ŞTİ.) aynı borçlu sayılır. Bulunmazsa yeni satır açılır.
- **Kurum:** Satırdaki Alacaklı adı Ayarlar'daki kelimelerle eşleştirilir. Alacaklı yoksa dosya zaten bir kurum sayfasındaysa oraya gider, değilse Diğer'e. Aynı dosya sonra Alacaklı bilgisiyle gelirse Diğer'deki satırlar kurum sayfasına kendiliğinden taşınır.
- **Yenisi geçerli:** Aynı bilgi yeniden gelirse yenisi yazılır. Boş hücre eski bilgiyi silmez. Kimlik sütunları (ad, TCKN, daire, dosya no, Föy No, Alacaklı) yalnız boşsa doldurulur.
- **Banka cevapları** (Evrak Sayısı, Hata, Toplam Bakiye sütunları olan dosya):
  - Banka Haczi: "Var, 25 banka cevabı". İncelenemeyen evrak varsa parantez içinde eklenir.
  - Bankada Para Var mı?: bakiye varsa "Evet, 4.250,40 TL", cevap var bakiye yoksa "Hayır".
  - İ.B.C.S. ve İş Emri şimdilik kullanılmıyor.
- **Tebligat raporu:**
  - Borçlu adı açıklamadaki köşeli parantezden alınır ([BORÇLU VE MÜFLİS ...]). Borçlu rolünde olmayan taraflara (ör. alacaklı vekili) çıkan tebligatlar atlanır.
  - Tebligat Bilgisi: "Tebliğ edildi - 21.MAD. GORE MUHTARA TESLİM / ... - 04.11.2026".
  - Başlıksız iki tarih sütunundan erken olanı tebliğ tarihi sayılır.
  - Daha eski tarihli bir tebligat, yenisinin üstüne yazılmaz.
- **Diğer listeler:** Başlıklar tablo sütunlarıyla ya da bilinen eş adlarla eşleşir (ör. "Karşı yan", "Birim", "TC Kimlik No", "Araç Sorgu Sonucu"). Tanınmayan başlıklar raporda "Kullanılmayan sütunlar" altında görünür. Bunları Ayarlar > Sütun eşleştirme bölümünden bağlayabilirsiniz; listede olmayan bir ad yazılırsa tabloya yeni sütun olarak eklenir.
- **Araç:** Araç Sorgusu araç çıkmadığını söylüyorsa ve Araç Haczi boşsa Araç Haczi "Malvarlığı yok" olur.
- **Elle süzülmüş sayfalar:** Tüm kayıtları aynı dosyanın başka bir sayfasında da bulunan sayfa varsayılan olarak atlanır (ör. banka cevaplarındaki Sayfa1).
- **Desteklenen biçimler:** .xlsx, .xlsm, CSV (Türkçe karakterli eski kodlama dahil), HTML tablolu .xls, Excel 2003 XML. Eski Excel 97-2003 (.xls) dosyası için uyarı çıkar. Bu dosyayı Excel'de .xlsx olarak kaydedip yükleyin.

## Ayarlar

- **Kurumlar:** Kurum adı sayfa adı olur. "Alacaklı adında geçenler" virgülle ayrılır ve kelime başından eşleşir (ÖRNEK, "Örnek Bankası A.Ş." ile eşleşir). Liste ilk açılışta boştur; büronun listesini içeren başlangıç ana Excel'i yüklenince gelir.
- **Sütun eşleştirme:** Gelen Excel'deki bir başlığı tablodaki bir sütuna bağlar.
- **Nerede saklanır:** Ayarlar hem tarayıcıda hem indirilen ana Excel'in Ayarlar sayfasında saklanır. Ana Excel yüklenince oradaki ayarlar kullanılır.

## Gizlilik (KVKK)

- Seçilen dosyalar tarayıcıdan çıkmaz. Sayfa hiçbir adrese bağlanmaz.
- Tarayıcıda yalnız kurum listesi, sütun eşleştirmeleri ve not formundaki "Yazan" adı saklanır.
- Ana Excel borçluların kişisel verisini içerir. Yalnız yetkili kişilerin erişebildiği yerde saklayın.

## Tarayıcı

Güncel Chrome, Edge, Safari ya da Firefox.

## Deneme

`test/test.html` sayfası 71 kontrol çalıştırır. Klasörde `python3 -m http.server` komutunu çalıştırın, sonra `http://localhost:8000/test/test.html` adresini açın. Sekme başlığında "TEST 71/71" görünmeli. Testteki kişi ve şirket adları uydurmadır.
