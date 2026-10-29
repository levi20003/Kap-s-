# Kapás – az eddigi előrehaladás

Állapot: 2026. október 29. · Ág: `fejlesztesek` · Utolsó tesztelt commit: `bbc3e04`

Ez a dokumentum a fejlesztés elejétől (2026. október 19.) mostanáig foglalja össze, mi készült el, hogyan működik, hol tart a kiadás,
és mi jön ezután. Három részből áll: technikai, termék és marketing, valamint a nyitott kérdések.

---

## 1. Egy mondatban

A Kapás egy magyar nyelvű horgász fogásnapló Androidra, amely a magyar tilalmi időket és méretkorlátokat a rendelet szerint számolja,
a fogásokat időjárással és holdfázissal együtt tárolja, és minden adatot a telefonon tart.

---

## 2. Idővonal

| Dátum | Mérföldkő | Fontos commit |
|---|---|---|
| okt. 19. | Fogásnapló 1.4–1.5: adatvédelem, stabil tárolás, fotók fájlban, tilalmi idők évente számolva | `ad35fab`, `cda4777`, `67bcc88` |
| okt. 19. | Tesztek a repóban, GitHub Actions CI, elvitt/visszaengedett hal, napi darabszám-figyelmeztetés | `3642fc9`, `ca3e016` |
| okt. 19. | Automatikus heti mentés, ZIP-mentés, statisztika havi bontással, értesítések, kezdőképernyő-gyorsgombok | `2dc5471`, `bec9bae`, `afdcc46` |
| okt. 19. | Android 16 (API 36) célverzió, tesztapp a valódi mellé, öt fül, zsálya téma (világos/sötét) | `662fed6`, `4ed3f0b`, `3bdcc99` |
| okt. 20. | 1.7 újratervezés (öt fül, kártyák, animációk), új név: **Kapás**, folyóvölgyes logó | `3bdcc99`, `b988d20` |
| okt. 20. | Időjárás: Szeged alapból, kézi helyválasztás, óránkénti és 7 napos előrejelzés, napkelte-ív | `441d7ac`, `c7cc03c` |
| okt. 21. | Időjárási UI javítások: egységes értékelés, „Most” és „Ma” kiemelés, horgászablakok fél órásak | `aa49b62`, `e3e16cb`, `96c1032`, `5049e90` |
| okt. 21. | „Erdei csend” design: krémpapír, Evergreen panelek, Fraunces betű | `c638ad2` |
| okt. 21. | Tesztapp önfrissítés: háttérben letölt, kilépéskor telepít | `a08e16c` |
| okt. 22. | Több fotó és videó, megtekintő kártya, megosztható fogáskártya, utólagos archív időjárás | `6cbfc00` |
| okt. 22. | Év összefoglaló (kártya és 1080×1920 sztori-kép) | `445adc8` |
| okt. 22. | Play Áruház-előkészítés: AAB-build, kiadási workflow, adatlap, képek, adatvédelmi oldal | `3f0086d` |
| okt. 22. | UI-refaktor: Tailwind (offline `tw.css`), Lucide ikonok, bento statisztika, spec-pirulák | `1728282` |
| okt. 22. | Gyors rögzítő gomb (FAB), halfaj-megoszlás, csali-rangsor | `420527e` |
| okt. 22. | Kap-ás Kihívások: XP, 9 szint, heti sorozat, heti küldetések, jelvények | `bbc3e04` |

---

## 3. Technikai áttekintés

### 3.1 Architektúra

- **Burok:** natív Android (Java). `MainActivity.java` (≈1240 sor) a WebView-t, a fájl- és kamera-hozzáférést, a helyadatot,
  a mentést, az értesítéseket és a frissítést kezeli. `ReminderReceiver`, `UpdateReceiver`, `ShotProvider` a kiegészítő komponensek.
- **Felület:** egyetlen HTML/JS fájl (`app/src/main/assets/index.html`, ≈2450 sor). Nincs keretrendszer, nincs bundler: a logika és a megjelenés egy fájlban van.
  Ez a döntés azért jó, mert a WebView-ban gyors, offline, és nincs függőségi lánc, ami eltörhet.
- **Stílus:** a kézzel írt CSS mellett egy Tailwind-réteg (`tailwind/input.css`, `@apply`-jal a meglévő osztályokra), fordítva `app/src/main/assets/tw.css`-be.
  A fordított fájl a repóban van, így nincs CDN-függés. Preflight ki van kapcsolva, hogy ne írja felül a meglévő stílust.
- **Ikonok:** Lucide rajzolatok (`lucide-static` csomagból), a `ICONS` táblában.
- **Betűk:** Fraunces (címek, számok) és Figtree (szöveg), helyben, woff2-ben, OFL licenc a `fonts/` mappában.

### 3.2 Adattárolás

| Kulcs / hely | Tartalom | Megjegyzés |
|---|---|---|
| `fogasnaplo.v1` (localStorage) | halfajok, fogások | a fő napló, formátuma nem változott migráció nélkül |
| `fogasnaplo.today` | időjárás-gyorsítótár | óránként és naponként |
| `fogasnaplo.wxplace` | az időjárás helye | kézi |
| `fogasnaplo.kihivasok` | az már bejelentett XP / szint / jelvény | csak az értesítés-ismétlés ellen |
| `fogasnaplo.theme`, `fogasnaplo.todayOpen`, `fogasnaplo.notify`, `fogasnaplo.autobackup` | beállítások | |
| `files/photos/`, `files/thumbs/` | fotók és videók, előnézetek | a naplóban csak `file://` URI |

Fogásonként: `media: [{src, thumb, video?, dur?}]` (max. 12). A régi `photo` mező megmaradt, mindig az első fotóra mutat, így a régi mentések is működnek.

### 3.3 Fő funkciók és hol vannak

- **Kezdőlap:** napszak szerinti köszöntés, a mai horgászidő, a fogások száma, időjárás (5 körös értékelés, 7 napos napsáv, napív, óránkénti sáv).
- **Fogások:** lista hónapokra bontva, keresés, szűrők, megtekintő kártya (lapozható fotók és videók), szerkesztő.
- **Statisztika:** év összefoglaló, Kap-ás Kihívások, halfajonkénti megoszlás, csali-rangsor, havi oszlop, legjobb csali/hely, napszak, holdfázis, légnyomás.
- **Térkép:** a fogások helye, kék jelölő a GPS-es fogásoknak, helyválasztó.
- **Beállítások:** halfajok, tilalmi értesítések, biztonsági mentés (kézi ZIP/JSON, heti automatikus mappa), verzió.
- **Gyors rögzítés:** lebegő „+” gomb, csali- és halgombok, egy koppintással mentés.

### 3.4 Szabályok

- **Tilalmi idők:** a 133/2013. (XII. 29.) VM rendelet alapdátumai (`RULES`), évente kiszámolva (`closedSpans`): hétvége és ünnep eltolás,
  húsvéthoz kötött ünnepek. Duna és Tisza külön szabály (`OVERRIDES`). Áthelyezett munkanapokat évente kell beírni (`BRIDGE_DAYS`).
- **Darabszám-korlát:** az elvitt halakat számolja (fajonként 3, összesen 5; Duna 2/4). Csak figyelmeztet.

### 3.5 Android-specifikus

- Minimum SDK 24, célverzió 36 (a Google Play 2026. augusztusi követelménye).
- Engedélyek: hely (csak használat közben), értesítések (Android 13+), indításkor újraélesztés (`RECEIVE_BOOT_COMPLETED`).
- Teljes képernyő Android 15+-on: a WebView párnázása a rendszersávokkal.
- Vissza gomb: `OnBackInvokedCallback` (API 33+), régebben `onBackPressed`.
- Tesztapp (`hu.fogasnaplo.app.teszt`): külön csomagnév, külön adatok, a valódi mellé telepíthető, a GitHub Release-ből frissül.

### 3.6 Build, teszt, CI

- **Build:** `build.sh` Gradle nélkül (`aapt2` → `javac` → `d8` → `zipalign` → `apksigner`), és `AAB=1` módban Android App Bundle is (`bundletool`).
- **Tesztek:** `tests/` mappa, `npm test`. `rules.test.js` (tilalmi számítás), `browser.test.js` (böngészős végigjárás ál-Android híddal).
  Jelenleg **169 ellenőrzés**, mind zöld. Minden fülön ellenőrzi, hogy 360 és 412 px-en nincs vízszintes túlcsordulás.
- **CI (GitHub Actions):** minden pushnál lefut a teszt és a build; a tesztjob Ubuntu 24.04-en fut (az `ubuntu-latest` alatt a Playwright függőségei elakadtak).
  Az AAB-t a CI is megépíti és ellenőrzi.
- **Kiadás:** kézzel indítható workflow (`kiadas.yml`), a valódi kulccsal (GitHub Secrets), AAB-t és APK-t ad artifactként.

### 3.7 Biztonság és adatvédelem

- Nincs szerver, nincs fiók, nincs analitika. Az egyetlen kimenő hívás az Open-Meteo (időjárás, településkeresés) és az OpenStreetMap (térkép csempék).
- Helyadat csak a fogás mentésekor, GPS-ből, és csak ha az engedély megvan. Az időjárás **soha nem kér GPS-t magától**.
- Az aláíró kulcs nincs a repóban; a `.gitignore` kizárja. A kiadási workflow a kulcsot a futás végén törli.
- Adatvédelmi tájékoztató: `docs/adatvedelem.html` (GitHub Pages-re tehető).
- Biztonsági mentés: a felhasználó maga viszi ki (ZIP vagy JSON), vagy a választott mappába ír a heti automatikus mentés.

---

## 4. Termékállapot

### Kész

- Fogásrögzítés részletekkel (méret, súly, csali, hely, időjárás, fotó, videó, megjegyzés, elvitt/visszaengedett).
- Gyors rögzítés (kezdőképernyő-gyorsgomb, lebegő gomb).
- Tilalmi idők és méretkorlátok, értesítések a tilalmak előtt és után.
- Időjárás és horgászidő (értékelés, előrejelzés, napív, horgászablakok).
- Statisztika és év összefoglaló, megosztható képek.
- Kap-ás Kihívások: XP, szintek, heti sorozat, heti küldetések, jelvények.
- Mentés és visszaállítás (ZIP és JSON), heti automatikus mentés.
- Kétféle téma, a telefon módját követve.
- Tesztapp önfrissítéssel.

### Még nincs kész / nyitott

- **Valódi telefonon kevés az ellenőrzés.** A legtöbb újdonság (videó, megosztás, kamera, automatikus frissítés, rögzítés kilépéskor) csak böngészőben vagy a CI-ben lett tesztelve. Ezeket egy valódi telefonon végig kell járni.
- **Play Áruház:** a fejlesztői fiók és a 12 zárt tesztelő hiányzik (ezt a Play kérheti új személyes fiókoknál). A kiadási csomag és a szövegek készen vannak.
- **Aláírás-átmenet:** ha a Play a saját kulcsával ír alá, a meglévő telefonos app nem frissíthető ráfelülírással. Az útmutató leírja a kulcs feltöltését (PEPK).
- **iPhone:** nincs natív változat. A felület HTML, így a webes változat elvileg használható, de iOS Safari-ban (helyadat, fájlok, mentés) külön ellenőrzés kell.
- **Csali-adatok:** a régi fogásaidban nincs csali megadva, ezért a csali-rangsor és a csali-jelvények üresek, amíg fel nem töltöd.
- **Tilalmi évenkénti karbantartás:** a `BRIDGE_DAYS` táblát minden évben frissíteni kell, amikor a rendelet megjelenik.
- **Lucide/Tailwind kivétel:** a `border-emerald-900/30`, `zinc-*`, `emerald-500/20` a Tailwind palettáját használja, nem a tokeneket (kérésre). Ezt a CLAUDE.md rögzíti.

---

## 5. Termék és felhasználók

### Kinek készül

- Elsősorban magyar horgászoknak, különösen a Tiszán és a Maroson pergetőknek (balin, süllő, sügér, csuka, harcsa).
- Akik a tilalmi szabályokat nem akarják fejből fejben tartani, és szeretnék a fogásaikat utólag is visszanézni.

### Mitől más

- **A magyar szabályok beépítve:** a tilalmi idők a rendelet szerint, pihenőnap-eltolással, a Duna és a Tisza külön szabályaival. Erre a nemzetközi appok nem építenek.
- **Nincs fiók, nincs reklám, nincs közösségi falon megosztás.** A helyek nem kerülnek más kezébe.
- **Offline:** a vízparton működik térerő nélkül.
- **Játékosítás, de visszafogottan:** XP és jelvények, amelyek a valódi horgászatot jutalmazzák (pl. visszaengedés, fotó, részletes fogásnapló), nem a mennyiséget hajszolják.

### Versenytársak (ellenőrizendő)

A nemzetközi piacon a nagy szereplő a Fishbrain (közösségi funkciók, előfizetés). Mellette a FishAngler és néhány kisebb app van.
Ezek adatait ebben a dokumentumban nem állítom: a pontos felhasználószám-adatokat, árakat és funkciókat a piacelemzés előtt ellenőrizni kell.
Itthon a magyar szabályok és a magyar nyelv a fő különbség.

---

## 6. Marketing

### 6.1 Pozicionálás

Egy mondatban: **„A horgásznapló, ami a tiéd marad: magyar szabályok, időjárás, fogások, a helyeid kiadása nélkül.”**

Három üzenet, amelyet minden anyagban látni kell:
1. **Magyar szabályok, pontosan:** a tilalmi idők és méretkorlátok a rendelet szerint, kiszámolva.
2. **A te adataid a telefonodon:** nincs fiók, nincs reklám, nincs felhő, ha nem akarod.
3. **Egy koppintás a vízparton:** gyors rögzítés, offline, egyszerű.

### 6.2 Célcsoportok

| Csoport | Mit keres | Hol érhető el |
|---|---|---|
| Pergető horgászok (Tisza, Maros, Duna) | tilalmi idők, fogásnapló, horgászidő | horgászcsoportok Facebookon, horgászboltok |
| Kezdő horgászok | szabályok átlátása, egyszerű napló | Play Áruház keresés, YouTube |
| Egyesületek | tagok és fogások átlátása | egyesületi vezetők, e-mail |

### 6.3 Csatornák

- **Play Áruház:** magyar leírás, képernyőképek (7 db, feliratokkal), kiemelt grafika, ikon. Az anyagok a `store/` mappában vannak.
- **Facebook és horgászcsoportok:** rövid bemutató, képernyőkép, a tilalmi naptár mint „hasznos” tartalom.
- **Videó:** rövid klipek (pl. „Holnaptól csukatilalom, ezt kell tudnod”). A tilalmi számítás a tartalom magja.
- **Szájról szájra:** az év összefoglaló megosztható sztori-képe és a fogáskártya a legtermészetesebb terjedési eszköz.
- **Horgászbolt és egyesület:** QR-kódos kártya a pultra.

### 6.4 Terjedési mechanizmusok (már beépítve)

- **Fogáskártya:** minden megosztott képen ott a „Kapás” név.
- **Év összefoglaló:** decemberben a legerősebb megosztási alkalom.
- **Jelvények:** a Kap-ás Kihívások megosztható célokat ad (pl. „első Harcsa”).

### 6.5 Mit kell még megcsinálni

- A Play-leírás és a képernyőképek közösségi kipróbálása.
- Egy-két kisebb bemutató videó forgatása.
- Az első felhasználói csoport (zárt teszt): horgásztársak és egy horgászcsoport.
- Visszajelzés-gomb a Beállításokban (ha Attila és a többi tesztelő jelez, ez gyorsítja).

### 6.6 Mérés (még nincs)

Az app nem gyűjt analitikát, ezért a Play Console letöltési és megtartási adatai, valamint a zárt teszt visszajelzései lesznek az egyetlen mutatók.
Ez tudatos döntés az adatvédelem miatt, de ennek ára, hogy a használatról kevés adatunk lesz.

---

## 7. Kockázatok

| Kockázat | Hatás | Mit lehet tenni |
|---|---|---|
| Valódi telefonon nem minden működik úgy, mint böngészőben | rossz első benyomás | a tesztelők végigjárják a listát |
| Automatikus frissítés váratlanul hibás buildet tölt le | tesztelők elégedetlensége | csak a tesztcsatorna kapja, nincs éles app-frissítés |
| A Play aláírás-átmenete elrontja a meglévő telepítést | adatvesztés | előtte mentés, a PEPK-útmutató követése |
| A tilalmi évenkénti karbantartás kimarad | hibás dátumok | naptári emlékeztető, a `BRIDGE_DAYS` ellenőrzése |
| Nincs felhasználói visszajelzés | nem tudjuk, mi kell | visszajelzés-gomb, zárt teszt |
| A tesztek csak böngészőben futnak | Android-specifikus hibák maradhatnak | a CI APK-ja és a kézi telepítés |

---

## 8. Következő lépések (javasolt sorrend)

1. **Valódi telefonos próba**: a tesztapp (`Fogasnaplo-TESZT.apk`) végigjárása, különösen videó, megosztás, kilépéskor frissítés.
2. **Visszajelzés-gomb** a Beállításokban (e-mail vagy Messenger, az app verziójával és a telefon típusával).
3. **Zárt teszt** a Play Console-ban: 12 tesztelő, 14 nap.
4. **Play-fiók**: regisztráció, identitás-ellenőrzés, a kiadási csomag feltöltése, az aláírás-átmenet beállítása.
5. **Adatvédelmi oldal** GitHub Pages-re, a kapcsolattartó e-mail beírása.
6. **Marketing-anyagok**: rövid videó, Facebook-bejegyzés, horgászcsoport-bemutató.
7. **iPhone**: a webes változat tesztelése iOS Safari-ban, majd a döntés az App Store-ról.

---

## 9. Mit kell tudni a folyamatról

- A fejlesztés szinte teljesen a `fejlesztesek` ágon zajlott, minden változtatás a CI-n átment, mielőtt a tesztapp frissült.
- A tesztapp a GitHub Release-ből (`teszt`) frissül; az éles app kiadása a Play-en keresztül történik.
- A dokumentáció fájljai: `store/KIADAS.md` (kiadási lépések), `store/play-aruhaz.md` (Play-szövegek), `docs/adatvedelem.html`, `CLAUDE.md` (fejlesztői szabályok), és ez a fájl.
