# Kapás – kiadás a Google Play Áruházba, lépésről lépésre

A szövegek és válaszok a `play-aruhaz.md`-ben, a képek a `kepek/` mappában vannak. Ez a lap a sorrendet mutatja.

## 0. Ami kell hozzá

- **Google Play Console fejlesztői fiók**: <https://play.google.com/console/signup>. Egyszeri díj (25 USD), személyazonosság-ellenőrzés,
  és egy Android-telefon, amin a Play Console appal igazolod a fiókot. Ez néhány napig tarthat, ezért érdemes most elindítani.
- **Az aláíró kulcsod**: `fogasnaplo.keystore` és a jelszava (`keystore-jelszo.txt`). Ezzel van aláírva a telefonodon lévő valódi Kapás.
  **Ezt soha ne töltsd fel a repóba**, és tarts róla biztonsági másolatot (pl. jelszókezelőben vagy pendrive-on).

## 1. A kulcs a GitHubra, titkosan (egyszer kell)

A kiadási build a GitHubon fut, és a kulcsot a repó titkos változóiból (Secrets) olvassa. A kulcs így sosem kerül a kódba.

1. Gépen, ahol a kulcs van: `base64 -w0 fogasnaplo.keystore > kulcs.txt` (Windows PowerShell:
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("fogasnaplo.keystore")) > kulcs.txt`).
2. GitHub → a repó → **Settings → Secrets and variables → Actions → New repository secret**:
   - `FOGASNAPLO_KEYSTORE_B64` = a `kulcs.txt` tartalma
   - `FOGASNAPLO_KEYSTORE_PASS` = a kulcs jelszava
3. Töröld a `kulcs.txt`-t.

## 2. Adatvédelmi oldal (a Play kötelezően kéri)

1. A `docs/adatvedelem.html` végén a `[ide jön a fejlesztői e-mail-cím]` helyére írd be azt az e-mail-címet, amit a Play Console-ban is
   kapcsolattartónak adsz meg.
2. GitHub → a repó → **Settings → Pages** → Source: **Deploy from a branch**, Branch: `fejlesztesek` (vagy `main`), mappa: **/docs** → Save.
3. Pár perc múlva él: `https://levi20003.github.io/Kap-s-/adatvedelem.html`. Ezt add meg a Play Console-ban adatvédelmi URL-nek.

## 3. A Play-be feltölthető csomag (AAB)

1. GitHub → **Actions → „Kiadás (Play Áruház)” → Run workflow**.
2. `versionCode`: **10** (minden kiadásnál nagyobb szám kell; a mostani valódi app 9-es), `versionName`: pl. **2.0**.
3. A futás végén az **Artifacts** alatt: `Kapas-2.0.aab` (ezt töltöd fel a Play-be) és `Kapas-2.0.apk` (ugyanez, közvetlen telepítéshez).

A build ellenőrzi, hogy a csomag a valódi `hu.fogasnaplo.app`, targetSdk 36, és nincs benne a tesztapp frissítő-engedélye.

## 4. Az app létrehozása a Play Console-ban

**Alkalmazás létrehozása**: név `Kapás – horgász fogásnapló`, alapértelmezett nyelv **magyar**, Alkalmazás, Ingyenes.

**⚠️ Aláírás – fontos a telefonodon lévő adataid miatt.** A Play alapból saját kulccsal írja alá az appot, és akkor a Play-es verzió nem tud
ráfrissülni a telefonodon lévő Kapásra (csak törlés után telepíthető, ami az adatokat is törli). Két megoldás:
- **Ajánlott:** az első feltöltésnél a „Play-alkalmazásaláírás” résznél válaszd: *Aláírókulcs módosítása → Kulcs exportálása és feltöltése
  Java-kulcstárból* (a Console megadja a PEPK eszközt és a parancsot). Így a Play a te mostani kulcsoddal ír alá, és a meglévő app adatostul frissül.
- Vagy: a Play-es telepítés előtt a régi appban **Mentés most** (ZIP), töröld a régit, telepítsd a Play-ből, majd **Visszaállítás**.

**Az alkalmazás beállítása** (Irányítópult → feladatlista), a válaszok a `play-aruhaz.md`-ben:
- Adatvédelmi irányelvek URL-je (2. lépés)
- Alkalmazás-hozzáférés: minden funkció elérhető különleges hozzáférés nélkül
- Hirdetések: nincsenek
- Tartalom-besorolás (IARC kérdőív)
- Célközönség: 13 év felett
- Adatbiztonság (Data safety)
- Kormányzati / pénzügyi / egészségügyi app: nem

**Fő áruházi adatlap**: név, rövid és teljes leírás a `play-aruhaz.md`-ből; ikon `kepek/ikon-512.png`, kiemelt grafika
`kepek/kiemelt-grafika.png`, telefonos képernyőképek `kepek/kepernyo-1…7.png`. Kategória: Sport.

## 5. Zárt tesztelés (új személyes fiókoknál kötelező)

A 2023 novembere után nyitott személyes fejlesztői fiókoknál az éles kiadás előtt **legalább 12 tesztelőnek 14 egymást követő napig**
be kell lépnie a zárt tesztbe. Utána kérhetsz hozzáférést az éles kiadáshoz.

1. **Tesztelés → Zárt tesztelés → Új verzió**: töltsd fel a `.aab`-t, „Újdonságok” szöveg a `play-aruhaz.md`-ből.
2. Tesztelők: hozz létre egy listát a Gmail-címükkel (horgásztársak, család, egy horgászcsoport tagjai), és küldd el nekik a csatlakozási linket.
3. Kérd meg őket, hogy a 14 nap alatt tényleg használják (rögzítsenek egy-két fogást), és ha van, írjanak visszajelzést.
4. 14 nap után: **Irányítópult → Hozzáférés kérése az éles verzióhoz**. Pár kérdésre kell válaszolni a tesztelésről.

## 6. Éles kiadás

**Éles → Új verzió** → ugyanaz az `.aab` (vagy egy újabb) → országok: Magyarország (később bővíthető) → ellenőrzésre küldés.
Az első ellenőrzés általában néhány nap.

## Később: frissítés

Actions → „Kiadás (Play Áruház)” → nagyobb `versionCode` (11, 12, …) → az új `.aab` a Play Console-ba → Éles → Új verzió.

## Tesztapp és valódi app

A tesztapp (`hu.fogasnaplo.app.teszt`) marad, ahogy van: a GitHubról frissül magától, a valódi mellé települ, és soha nem kerül a Play-be.
