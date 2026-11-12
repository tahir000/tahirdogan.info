# Excel Birleştirme: Kurulum ve Kullanım

Gelen Excel'leri (banka cevapları, tebligat raporu, sorgu listeleri) tek bir ana Excel'de birleştiren sayfa.

- **Sayfa düzeni:** Her kurum (müvekkil) bir sayfadır. Her satır bir icra dosyasıdır: icra dairesi ve dosya numarası aynı olan satırlar, ayrı Excel'lerden de gelse aynı Excel'in içinde de olsa, tek satırda toplanır.
- **Sütunlar sizin:** Ana Excel'in sütunları sabit değildir. Sütun ekler, siler, adını ve sırasını değiştirirsiniz; gelen her sütunun ana Excel'de hangi sütuna yazılacağını siz seçersiniz.
- **Nasıl dolar:** Gelen her Excel kendi bilgisini o satırın seçtiğiniz sütununa yazar.
- **Rapor:** Sayfa, neyin hangi sayfaya ve hangi sütuna yazıldığını gösterir.
- **Gizlilik:** Tüm işlem tarayıcıda yapılır. Dosyalar hiçbir sunucuya gönderilmez.

## Sunucuya kurulum

Aşağıdaki beş dosyayı sunucuda aynı klasöre koymak yeterli:

| Dosya | Görevi |
| --- | --- |
| `index.html` | Sayfanın kendisi |
| `arayuz.js` | Dosya seçme, sütun düzenleme ve eşleştirme, rapor, notlar, ayarlar |
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

1. **Ana Excel:** İlk kullanımda boş bırakın. Sonraki her seferde en son indirilen ana Excel'i seçin. Ana Excel yüklenince sütunlar o dosyadaki gibi olur. Aynı adımdaki "Ana Excel sütunları" bölümünden sütunları düzenlersiniz (aşağıda).
2. **Gelen Excel'ler:** WhatsApp'tan gelen dosyaları seçin ya da sürükleyin. Her sayfa için türü, satır sayısı, kaç ayrı dosya içerdiği ve "Sütun eşleştirme" tablosu görünür. Tabloda gelen her sütunun ana Excel'de hangi sütuna yazılacağını seçersiniz (aşağıda). Kutuyla sayfayı dahil edip çıkarabilirsiniz. Dosyalar değiştirilme tarihine göre eskiden yeniye işlenir.
3. **Birleştir:** Rapor çıkar. Satırların hangi kurum sayfasına gittiğini, hangi sütunlara kaç satır yazıldığını, eşleşen ve kullanılmayan sütunları, atlanan satırları nedenleriyle ve Diğer'e gidenleri gösterir. Altında satır satır döküm vardır.
4. **Ana Excel'i indir:** "Ana Excel YYYY-AA-GG SS.DD.xlsx" adıyla iner. Bir sonraki sefer 1. adımda bu dosyayı seçin.

**Tek güncel ana Excel.** Ana Excel tek kaynaktır. Büronun ortak klasöründe tek bir güncel ana Excel tutun; her birleştirmeden sonra yeni indirileni oraya koyun. İki kişi aynı anda farklı kopyalarla çalışırsa birinin eklediği bilgi ötekinin dosyasında olmaz.

## Ana Excel'in sayfaları

| Sayfa | İçerik |
| --- | --- |
| Kurum sayfaları (her müvekkil için bir sayfa) | Kurumun icra dosyaları; her dosya bir satır |
| Diğer | Kurumu bulunamayan satırlar |
| Notlar | Excel'lerden bağımsız notlar. Sayfadaki formdan ya da doğrudan Excel'de yazılır |
| Günlük | Her yüklemede hangi dosyadan kaç satır geldiği |
| Son Yükleme Raporu | Son birleştirmede satır satır neyin nereye yazıldığı |
| Ayarlar | Kurum listesi ve hatırlanan sütun eşleştirmeleri |

Ana Excel'de elle değişiklik yapılabilir: hücreler düzeltilir, not yazılır, yeni sütun eklenir. Bunlar sonraki birleştirmede korunur. Renk gibi elle verilen biçimler yeniden indirince sıfırlanır, değerler kalır.

## Ana Excel sütunları

Sütun listesi 1. adımdaki "Ana Excel sütunları" bölümündedir.

- **Başlangıç listesi:** Borçlu Adı, Borçlu TCKN / VKN, İcra Dairesi, Dosya No, Tebligat Bilgisi, Kesinleşme Bilgisi, Araç Sorgusu, Araç Haczi, Tapu Sorgusu, Tapu Haczi, Alacaklı Olduğu Dosya Sorgusu, Alacaklı Olduğu Dosya Haczi, Maaş Sorgusu, Maaş Haczi, Banka Sorgusu, Banka Haczi, Bankada Para Var mı?, Bankadan Para İstendi mi?, Firma Sorgusu, Firma Haczi, Föy No, Alacaklı.
- **Değiştirme:** Sütunun adını kutusuna yazarak değiştirirsiniz, oklarla sırasını değiştirirsiniz, × ile silersiniz, alttaki kutudan yeni sütun eklersiniz (ör. "Haciz Bilgisi"). Ad değişince ana Excel'deki bilgiler yeni ada taşınır. Sütun silinince o sütundaki bilgiler indirilecek Excel'e yazılmaz; sütun doluysa sayfa önce sorar.
- **Satır anahtarı:** İcra Dairesi ve Dosya No silinemez, adı değişmez. Satırlar bu ikisine göre bulunur.
- **Adı sabit sütunlar:** Borçlu Adı, Borçlu TCKN / VKN, Föy No ve Alacaklı sütunlarının adı değişmez, çünkü araç bunları adından tanır (kurum sayfası Alacaklı'ya göre seçilir). İstenirse silinebilirler.
- **Son Güncelleme ve Kaynak:** Bu iki sütunu araç yazar; her zaman sonda dururlar. Satırın en son ne zaman ve hangi dosyadan güncellendiğini gösterirler.
- **Nerede saklanır:** Sütun listesi tarayıcıda ve ana Excel'in başlık satırında durur. Ana Excel yüklenince sütunlar o dosyadaki gibi olur.

## Sütun eşleştirme

2. adımda her sayfanın altındaki tabloda gelen her sütun, örnek bir değeri ve yanında bir seçim kutusu görünür. Kutudan o sütunun ana Excel'de hangi sütuna yazılacağını seçersiniz.

- **Öneri:** Sayfa bilinen başlıkları kendiliğinden eşleştirir (ör. "Karşı yan" Borçlu Adı'na, "Birim" İcra Dairesi'ne, "Araç Haczi Durumu" Araç Haczi'ne). Öneriyi değiştirebilirsiniz.
- **Örnek:** Gelen Excel'deki "Araç Haczi Durumu" sütununu ana Excel'de "Haciz Bilgisi" sütununa yazdırmak için kutudan "+ Yeni sütun ekle..." seçip "Haciz Bilgisi" yazın. Sütun ana Excel'e eklenir.
- **Kullanma:** Bir sütunu ana Excel'e yazdırmamak için "Kullanma" seçin.
- **Hatırlama:** Seçiminiz hatırlanır. Aynı başlık bir daha geldiğinde aynı sütun kendiliğinden seçilir. Hatırlananlar Ayarlar bölümünde listelenir ve ana Excel'in Ayarlar sayfasına da yazılır.
- **Aynı sütuna iki kolon:** Gelen iki sütunu ana Excel'de aynı sütuna bağlarsanız değerler kendi başlıklarıyla yazılır: "Araç Haczi Durumu: Var - Tapu Durumu: Yok".
- **Dosya No şart:** Bir sayfanın yazılabilmesi için Dosya No (ya da Föy No) sütununun seçili olması gerekir. Sayfa bunu bulamazsa uyarır; tablodan hangi sütunun Dosya No olduğunu seçmeniz yeterlidir.
- **Özet sütunları:** Banka cevapları ve tebligat raporunda sayfa birkaç sütundan tek bir özet çıkarır ("özet" etiketiyle görünür). Özeti de, özetin çıkarıldığı ham sütunları da istediğiniz sütuna bağlayabilirsiniz.

## Aynı dosya tek satır

- **Kural:** İcra dairesi ve dosya numarası aynı olan satırlar tek satırda toplanır. Ayrı Excel'lerden gelenler de, aynı Excel'in içinde birden çok satırda duranlar da, daha önce indirilmiş ana Excel'deki yinelenen satırlar da buna dahildir. "İstanbul 8. İcra Dairesi" ile "İstanbul 8. İcra Müdürlüğü", "2026/101" ile "2026/00101" aynı sayılır. Aynı dosya numarası başka bir dairedeyse ayrı dosyadır.
- **Birden çok borçlu:** Borçlu adları "; " ile ayrılarak aynı hücreye yazılır. Şirket adındaki kısaltmalar (İNŞ., TİC., LTD. ŞTİ.) aynı borçlu sayılır. Her bilgi borçlusuyla birlikte durur: "ALİ KAYA: Var, 25 banka cevabı; VELİ KAYA: Var, 8 banka cevabı". Dosyada tek borçlu varsa bilgi yalın yazılır.
- **Güncelleme:** Sonradan gelen bilgi yalnız ilgili borçlunun kısmını günceller; öteki borçlunun bilgisi yerinde kalır. Satırında borçlu adı olmayan bilgi (ör. yalnız dosya numarasıyla gelen kesinleşme listesi) hücrenin tamamının yerine geçer.
- **Boş hücre silmez:** Gelen Excel'deki boş hücre ana Excel'deki bilgiyi silmez. İcra Dairesi, Dosya No, Föy No ve Alacaklı yalnız boşsa doldurulur.
- **Rapor:** Hangi satırların tek satırda toplandığı raporda satır numaralarıyla yazar (ör. "satır 2, 3, 4").

## Gelen dosyalar nasıl okunur

- **Satırın yeri:** İcra Dairesi ve Dosya No birlikte aranır. Dosya numarası yoksa Föy No kullanılır. İcra dairesi yoksa ve dosya numarası ana Excel'de tek bir dairede varsa o satıra yazılır; birden çok dairede varsa satır atlanır. Bulunmazsa yeni satır açılır.
- **Kurum:** Satırdaki Alacaklı adı Ayarlar'daki kelimelerle eşleştirilir. Alacaklı yoksa dosya zaten bir kurum sayfasındaysa oraya gider, değilse Diğer'e. Aynı dosya sonra Alacaklı bilgisiyle gelirse Diğer'deki satır kurum sayfasına kendiliğinden taşınır.
- **Banka cevapları** (Evrak Sayısı, Hata, Toplam Bakiye sütunları olan dosya) iki özet sütunu çıkarır:
  - Banka cevabı (özet), önerilen sütun Banka Haczi: "Var, 25 banka cevabı". İncelenemeyen evrak varsa parantez içinde eklenir.
  - Bankada para (özet), önerilen sütun Bankada Para Var mı?: bakiye varsa "Evet, 4.250,40 TL", cevap var bakiye yoksa "Hayır".
  - İ.B.C.S. ve İş Emri için öneri yoktur; isterseniz bir sütuna bağlarsınız.
- **Tebligat raporu** iki özet sütunu çıkarır:
  - Borçlu (açıklamadan): açıklamadaki köşeli parantezden alınır ([BORÇLU VE MÜFLİS ...]). Borçlu rolünde olmayan taraflara (ör. alacaklı vekili) çıkan tebligatlar atlanır.
  - Tebligat (özet), önerilen sütun Tebligat Bilgisi: "Tebliğ edildi - 21.MAD. GORE MUHTARA TESLİM / ... - 04.11.2026".
  - Başlıksız iki tarih sütunundan erken olanı tebliğ tarihi sayılır.
  - Aynı borçlunun birden çok tebligatından en yenisi yazılır. Daha eski tarihli bir tebligat, yenisinin üstüne yazılmaz.
- **Diğer listeler:** Başlıklar ana Excel'in sütun adlarıyla ya da bilinen eş adlarla eşleşir (ör. "Karşı yan", "Birim", "TC Kimlik No", "Araç Sorgu Sonucu"). Tanınmayan başlıklar eşleştirme tablosunda "Kullanma" olarak görünür; kutudan bir sütuna bağlarsınız.
- **Araç:** Araç Sorgusu araç çıkmadığını söylüyorsa ve Araç Haczi boşsa Araç Haczi "Malvarlığı yok" olur. Bu kural iki sütun da bu adlarla ana Excel'de durduğu sürece çalışır.
- **Elle süzülmüş sayfalar:** Tüm kayıtları aynı dosyanın başka bir sayfasında da bulunan sayfa varsayılan olarak atlanır (ör. banka cevaplarındaki Sayfa1).
- **Desteklenen biçimler:** .xlsx, .xlsm, CSV (Türkçe karakterli eski kodlama dahil), HTML tablolu .xls, Excel 2003 XML. Eski Excel 97-2003 (.xls) dosyası için uyarı çıkar. Bu dosyayı Excel'de .xlsx olarak kaydedip yükleyin.

## Ayarlar

- **Kurumlar:** Kurum adı sayfa adı olur. "Alacaklı adında geçenler" virgülle ayrılır ve kelime başından eşleşir (ÖRNEK, "Örnek Bankası A.Ş." ile eşleşir). Liste ilk açılışta boştur; büronun listesini içeren başlangıç ana Excel'i yüklenince gelir.
- **Hatırlanan sütun eşleştirmeleri:** 2. adımda yaptığınız seçimler burada birikir. Buradan da eklenip silinebilir. "(kullanma)" o başlığın yazılmayacağı anlamına gelir; listede olmayan bir sütun adı yazılırsa ana Excel'e yeni sütun olarak eklenir.
- **Nerede saklanır:** Ayarlar hem tarayıcıda hem indirilen ana Excel'de saklanır. Ana Excel yüklenince oradaki ayarlar ve sütunlar kullanılır.

## Gizlilik (KVKK)

- Seçilen dosyalar tarayıcıdan çıkmaz. Sayfa hiçbir adrese bağlanmaz.
- Tarayıcıda yalnız kurum listesi, sütun listesi, sütun eşleştirmeleri ve not formundaki "Yazan" adı saklanır.
- Ana Excel borçluların kişisel verisini içerir. Yalnız yetkili kişilerin erişebildiği yerde saklayın.

## Tarayıcı

Güncel Chrome, Edge, Safari ya da Firefox.

## Deneme

`test/test.html` sayfası 117 kontrol çalıştırır. Klasörde `python3 -m http.server` komutunu çalıştırın, sonra `http://localhost:8000/test/test.html` adresini açın. Sekme başlığında "TEST 117/117" görünmeli. Testteki kişi ve şirket adları uydurmadır.
