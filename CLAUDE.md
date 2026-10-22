# Kapás (régi nevén Fogásnapló) – Android app

Horgász fogásnapló (pergetés). A felület egyetlen WebView-ban futó HTML/JS oldal
(`app/src/main/assets/index.html`), a natív rész csak a burok (`MainActivity.java`,
`ShotProvider.java`). Csomagnév: `hu.fogasnaplo.app`, minSdk 24, targetSdk 36 (Google Play: 2026. aug. 31-től kötelező).

## Build

```
./build.sh <versionCode> <versionName>     # pl. ./build.sh 8 1.7
```

- Gradle nélkül, közvetlenül az SDK eszközeivel: `aapt2` → `javac` → `d8` → `zipalign` → `apksigner`.
- Kimenet: `out/Fogasnaplo.apk`. Az SDK helye `ANDROID_HOME` (alapértelmezés `/home/claude/android-sdk`), build-tools 36.0.0, platform android-36
  (felülírható: `PLATFORM=35 BUILD_TOOLS=35.0.0 ./build.sh …`, de Play-be csak 36-tal).
- Aláírás: `fogasnaplo.keystore` + `keystore-jelszo.txt` a projekt gyökerében.
  **Ezek soha nem kerülhetnek a repóba** (`.gitignore` kizárja őket, az `out/`, `*.apk`, `*.zip` mellett).
- A Gradle-fájlok (`build.gradle.kts` stb.) megvannak, de a hivatalos build a `build.sh`.
- Tesztapp a valódi mellé: `APP_ID=hu.fogasnaplo.app.teszt LABEL="Kapás" ./build.sh …` (külön csomagnév, külön adatok).
  A CI minden pushnál ezt is megépíti („Fogasnaplo-TESZT-telefonra” artifact), egy csak CI-s kulccsal. A kamera-provider authority a csomagnévből jön.
- A `fejlesztesek` és `main` ágra pusholt tesztbuild a `teszt` GitHub Release-be kerül (`Fogasnaplo-TESZT.apk` + `version.json`,
  versionCode = 1000 + futásszám). A tesztapp **magától frissül**: induláskor és előtérbe jövéskor (legfeljebb 30 percenként) `checkUpdate` megnézi,
  újabb verziónál a háttérben letölti, és amikor kilépsz az appból (`onStop`, de nem kamera/fájlválasztó közben), `PackageInstaller`-munkamenettel telepíti.
  Android 12+-on ez csendes (`USER_ACTION_NOT_REQUIRED`), ha az app a telepítője önmagának; különben a rendszer egyszer rákérdez, amikor visszajössz.
  A sáv „Frissítés most” gombja azonnal telepít (`installUpdate`). Az eredmény az `UpdateReceiver`-be jön; elutasított verziót nem telepít újra magától.
  Csak a tesztbuildben: a manifest `<!--TESZT:…-->` sorait a `build.sh` kapcsolja be (`REQUEST_INSTALL_PACKAGES`, `UPDATE_PACKAGES_WITHOUT_USER_ACTION`, `UpdateReceiver`).

## Működés, amire figyelni kell

- A Leaflet (`lib/leaflet.js`) nincs a `<head>`-ben: `withLeaflet(cb)` tölti be, amikor először kell térkép. Új térképes kód is ezen át menjen.
- Hálózati kérés `fetchT(url, ms)`-sel (15 mp időkorlát), ne nyers `fetch`-csel.
- Ha az app napváltás után jön előtérbe (és nincs nyitva szerkesztő), újratölti magát, hogy a dátumok és a tilalmi címkék frissek legyenek.
- Értesítések: a JS számolja ki az eseményeket (`reminderEvents`: tilalom előtti este 18:00, vége utáni reggel 8:00, azonos napiak összevonva),
  és `ANDROID.setReminders(json)`-nel átadja; a `ReminderReceiver` egyszerre egy riasztást tart, újraindítás után újra élesít.
  Be/ki: `fogasnaplo.notify` kulcs. Android 13+ engedélyt kér (`POST_NOTIFICATIONS`).
- Parancsikonok: a 4 leggyakoribb faj „+ Faj” ikonja (`pushShortcuts` → `ShortcutManager`). Koppintásra `__fnQuick({sp})` → `quickCatch`.
  Az activity `singleTask`; újra létrehozott activity nem rögzít újra fogást.
- Android 15+ teljes képernyő: a WebView egy `FrameLayout`-ban van, ami a rendszersávok és a billentyűzet méretével párnáz (API 35+).
- Vissza gomb: API 33+ `OnBackInvokedCallback` (Android 16-tól csak ez működik), régebben `onBackPressed`; mindkettő `handleBack()` → `__fnBack`.
- Térkép: a fogás helye `coordsOf(c)` (kézi `place`, ennek híján az automatikus `gps`); a csak GPS-es fogás kék (`.pin.gps`) jelölőt kap.
- Helyválasztó: a fogás GPS-helyén nyílik, a jelölő előre ott van; 12-es nagyítás alatt a koppintás csak ránagyít (pontatlan jelölés ellen).
- **Öt fül** (`TABS` = home, list, stats, map, more; `go(tab)` vált, `render()` rajzolja az aktívat):
  Kezdőlap (hős-összesítő, mai horgászidő, halfaj-számlálók, rekordok), Fogások (lista, keresés, szűrők), Statisztika (összefoglaló csempék + diagramok),
  Térkép, Beállítások (halfajaim, értesítések, biztonsági mentés, verzió). A Kezdőlapon csak az kell, ami a vízparton: régebbi fogások adatai nem.
  Új funkciónak először a helyét döntsd el, ne a Kezdőlapra tedd alapból.
- Kezdőlap → Időjárás: a hely kézi (`wxPlace()`, alapból **Szeged**; a fejléc helygombja: település-keresés az Open-Meteo geocodinggal,
  vagy egyszeri „Jelenlegi helyem”). Az időjárás **soha nem kér GPS-t magától** (akkumulátor). Mutatja: értékelés (1–5), hőmérséklet, szél/lökés,
  napkelte/napnyugta, eső (mm, %), óránkénti sáv (ma: a következő 24 óra; más napra koppintva 4–23 óra), napi előrejelzés (alapból 3 nap,
  „Részletek” alatt 7 + légnyomás-görbe, horgászablakok, indoklás és magyarázat a pontozásról / hPa-ról). Kompakt/nyitott: `fogasnaplo.todayOpen`.
  A pontozás (`scoreToday`) változásakor a felületi magyarázatot (`explainEl`) is igazítsd.
  Üres naplónál a Kezdőlap a gyakori halfajokat kínálja egy koppintásra.
- Statisztika: havi oszlopra koppintva a Fogások fülre ugrik, arra a hónapra szűrve (`state.month`, a Fogások fülön chip törli).
- Beállítások → halfaj törlése megerősítéssel (a hozzá tartozó fogások is törlődnek).
- Elrendezés: a tab-konténerek `.wrap` elemek egymásban, ezért `.wrap .wrap{width:100%}` kell (a `margin:auto` különben a tartalom szélességére zsugorítaná,
  és a kártyák kilógnának a képernyőből). A tesztek minden fülön ellenőrzik, hogy 360 és 412 px-en nincs vízszintes túlcsordulás.
- Animáció: `playEnter` a fülváltáskor `.enter` osztályt ad a konténernek (kártyák felcsúsznak, sávok nőnek), `countTo` számlál a hős-számnál.
  Minden `prefers-reduced-motion` alatt kikapcsol (a tesztek is ezzel futnak, hogy determinisztikusak legyenek).
- Ha a WebView renderelője összeomlik, a `MainActivity` újraindítja magát (`onRenderProcessGone`).

## Tesztek és CI

- `cd tests && npm ci && npx playwright install chromium && npm test`: tilalmi számítás (`rules.test.js`) és böngészős tesztek ál-Android híddal (`browser.test.js`).
- Új funkcióhoz tegyél tesztet a `browser.test.js`-be. A GitHub Actions (`.github/workflows/ci.yml`) minden pushnál lefuttatja, és a `build.sh`-val egy eldobható CI-kulccsal megépíti az APK-t.

## Adattárolás

- A fogásadatok a WebView `localStorage`-ában vannak, kulcs: **`fogasnaplo.v1`**.
- Egyéb kulcsok: `fogasnaplo.region`, `fogasnaplo.home`, `fogasnaplo.today` (időjárás-gyorsítótár: `h` óránkénti, `d` napi), `fogasnaplo.wxplace` (időjárás helye).
- A kulcsot vagy az adatformátumot ne változtasd meg migráció nélkül, különben a felhasználók elveszítik a naplójukat.
- Fotók és videók: fogásonként `media: [{src, thumb, video?, dur?}]` (max. 12; `mediaOf(c)` olvas, `setMedia(c, list)` ír). A régi `photo: {src, thumb}`
  mező **megmarad és mindig az első fotó** (régebbi verziók és mentések miatt); a régi fogásoknak csak `photo`-juk van, a `mediaOf` ebből is listát ad.
  Videó: kamera (`ACTION_VIDEO_CAPTURE`, max. 30 mp) vagy galéria (több elem egyszerre, kép + videó), `.mp4` a `files/photos/`-ban (max. 200 MB),
  előnézet az első képkockából. A teljes kép `files/photos/`, az előnézet `files/thumbs/` (Android), a naplóban csak `file://` uri van.
  1.4-ig az előnézet base64-ként a localStorage-ban volt; induláskor `migrateThumbs` átköltözteti (a localStorage ~5 MB-nál megtelik).
  Új adatot soha ne tegyél base64-ként a naplóba.
- Induláskor `sweepFiles` → `ANDROID.cleanup` törli a naplóban nem szereplő fotókat (1 óra türelmi idővel), üres naplónál nem fut.
- Biztonsági mentés (Beállítások): két gomb. „Mentés most”: Androidon ZIP (napló + fotók; ha van kiválasztott mappa, oda, különben fájlválasztóval),
  böngészőben .json. „Visszaállítás”: Androidon a fájl első bájtjai döntik el, hogy ZIP vagy .json; böngészőben fájlválasztó. A heti automatikus mentés
  (mappa) a háttérben megy, a Beállításokban csak állapotsor és „Másik mappa” / „Kikapcsolás”.
- Mentésfájl (`version: 2`): az előnézetek beágyazva (data url). Visszatöltés = összefésülés megerősítés után, meglévő fogást nem ír felül.
- Fogás `kept`: `true` = elvitt, `false` = visszaengedett, hiányzik = nincs megadva. A napi darabszám-figyelmeztetés (`LIMITS`, `LIMITED`, `limitVerdict`)
  csak az elvitt halakat számolja: fajonként 3, összesen 5 db (Duna: 2 / 4). Csak figyelmeztet, nem tilt.
- ZIP-mentés (Android): ZIP = `fogasnaplo.json` (a napló `file://` uri-kkal) + `photos/` + `thumbs/`. Visszatöltéskor a fotók a saját nevükkel
  kicsomagolódnak, a JS átírja az uri-kat az új telefon mappáira, és az összefésülés ugyanúgy megerősítést kér.
- Heti automatikus mentés: a mappa SAF tree uri-ja a `SharedPreferences`-ben (`backupTree`), állapot a `fogasnaplo.autobackup` kulcsban.
  Induláskor és előtérbe jövéskor `maybeAutoBackup()`; a mappában a 4 legutóbbi `fogasnaplo-ÉÉÉÉ-HH-NN.zip` marad.
- Törlés (− gomb, „Fogás törlése”) 6 mp-ig visszavonható (`deleteWithUndo`); a fotó csak utána törlődik.
- Fogásra koppintva (lista, rekord, térkép-buborék „Részletek”) **megtekintő kártya** nyílik (`openViewer`: lapozható fotók/videók, adatok);
  szerkeszteni a „Szerkesztés” gombbal lehet (`openEditor({fromView:true})`, mentés/mégse után vissza a kártyára). A gyors „+” rögzítés közvetlenül a szerkesztőt nyitja.
- „Megosztás”: `catchCardImage` 1080×1350-es képet rajzol (fotó + zöld sáv: faj, méret, dátum, hely, csali, idő), Androidon `shareImage` → megosztás-menü.
  A helyi fotót a WebView nem engedi vászonra rajzolni, ezért `ANDROID.readPhoto` adja át data url-ként.
- Fogás időjárása (`ensureWx`, induláskor `retryPendingWx` a hiányzókat pótolja, 85 napnál régebbire az archív API-ból). Hely nélküli fogásnál
  `wxCoords`: a szokásos hely, ennek híján az időjárás helye (Szeged); ilyenkor `wx.near` jelzi, hogy közelítő adat.

## „Erdei csend” design – két téma

Meleg krémpapír alap, mélyzöld (Evergreen `#2F4A3A`) panelek és gombok, talpas címek (**Fraunces**, `--f-display`, 500/600, helyi woff2 + OFL a `fonts/`-ban),
törzsszöveg Figtree. Narancs csak kiemelésre (értékelés 4–5, rekord, napív). A régi zsálya paletta (Sage `#8EA58C`, Moss, Mint) a másodlagos tónusokban él tovább.
Világos és sötét téma: alapból a telefon módját követi (`ANDROID.isNight()`, váltáskor `__fnSysTheme`). Kézzel a fejléc nap/hold gombja váltja
(`#themeBtn`): ha a gomb a telefon módjától eltérőre vált, `fogasnaplo.theme` = `light`/`dark` (felülbírálás), ha a telefon módjára, a kulcs törlődik
(újra követi a telefont). Váltáskor körkörös átváltás (View Transitions, ahol van). A téma `<html data-theme>`-ként él;
a `<head>` apró szkriptje az első rajzolás előtt beállítja. `ANDROID.setTheme(light)` a rendszersávok ikonszínét és az ablak hátterét igazítja
(a `MainActivity` színei a `--bg`-vel egyeznek).

| Token | Sötét | Világos |
|---|---|---|
| `--bg` | `#121915` | `#f4f0e8` (krém) |
| `--surface` | `#1c261f` | `#fdfbf7` |
| `--fg` | `#efebe1` | `#1e2a22` |
| `--water` (fő szín: gombok, kiválasztott elemek) | `#c5d4be` | `#2f4a3a` (Evergreen) |
| `--accent` / `--accent-txt` (kiemelés / narancs szöveg) | `#ff8350` / `#ffa070` | `#c4501f` / `#a3401a` |
| `--hero-*` (zöld panelek: hős-kártya, horgászidő-panel, táj) | sötétebb erdő | Evergreen átmenet |
| `--edge` / `--shadow-card` / `--shadow-pop` | finom perem és lágy, mély árnyék | ugyanazok, meleg barnás árnyékkal |

- Kezdőlap: köszöntés (`renderGreet`: napszak szerint, alatta dátum + a mai horgászidő), hős-kártya (zöld panel SVG folyóvölgy-tájjal, „Fogásaim →” gomb),
  időjárás-kártya: felül teljes szélességű zöld „Horgászidő ma” panel 5 körös értékeléssel, rá ráfutó **napsáv** (`daysEl`: 7 nap chipként, a „Ma”
  körvonalas, a kiválasztott teli zöld), alatta a kiválasztott nap fejléce (`.selday`), napív, eső/szél, óránkénti sáv.
- Alsó fülsáv: az aktív ikon mögött csúszó pirula (`.tabind`).
- Halfaj-kártya: kerek jelvény (talpas kezdőbetű), számláló, zöld + gomb; bal csík csak tilalomnál / közelgő tilalomnál. Rekord: vízszintes trófea-sor, az első arany.
- Minden szín token a két `:root` blokkban (`:root` = sötét, `:root[data-theme="light"]` = világos). **Ne írj kézzel hexet a CSS-be**:
  ha új szín kell, vegyél fel tokent mindkét blokkba.
- A kontrasztot (WCAG) mindkét témában ellenőrizd: a szöveg legalább 4,5:1, a nagy szöveg és ikon legalább 3:1.

## Tilalmi idők és méretkorlátok

- Forrás: **133/2013. (XII. 29.) VM rendelet**. A `RULES` a rendelet *alapdátumait* tartalmazza (pl. csuka 02.01–03.31), nem egy adott év dátumait.
- A tényleges dátumot a `closedSpans()` számolja évente: ha az első nap szombat vagy pihenőnap, a következő munkanapon kezdődik;
  ha az utolsó nap az, az előtte lévő munkanapon ér véget. Ünnepnapok: fix + húsvéthoz kötött (nagypéntek, húsvét, pünkösd).
- **Évente teendő:** a `BRIDGE_DAYS` táblába beírni a következő év áthelyezett pihenőnapjait, amikor az NGM-rendelet megjelenik
  (2025-ben pl. máj. 2. hídnap volt, ezért a ponty tilalma máj. 5-én kezdődött).
- Ellenőrzés: a számítás 2026-ra pontosan a korábbi kézi táblát adja (csuka 02.02., ponty 05.04–05.29. stb.).
- Duna és Tisza: `OVERRIDES` (szigorúbb minimum és felső méretkorlát, harcsára téli elviteli tilalom). Ezek a helyi szabályok nem tolódnak (`shift:false`).
- `ALIAS`: fajnév-szinonimák. A helyi horgászrend szigorúbb lehet; az app ezt a felületen jelzi is.

## Név és logó

- Az app neve **Kapás** (1.8-ig Fogásnapló). A logó a folyóvölgyes kép: a fejlécben `app/src/main/assets/logo.png`, adaptív ikon előtérként
  `res/drawable-nodpi/ic_launcher_fg.png` (világos zsálya háttér: `ic_launcher_bg.xml`), egyszínű téma-ikon `ic_launcher_mono.xml`, régebbi Androidon az `ic_launcher.png`-k.
- **Nem változott** (kompatibilitás): csomagnév `hu.fogasnaplo.app`, `fogasnaplo.*` tárolókulcsok, `FogasnaploAndroid` híd, mentésfájl-nevek,
  és a release-eszközök neve (`Fogasnaplo-TESZT.apk`, `version.json`), mert a már telepített tesztappok frissítője ezeket keresi.
