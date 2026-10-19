# Fogásnapló – Android app

Horgász fogásnapló (pergetés). A felület egyetlen WebView-ban futó HTML/JS oldal
(`app/src/main/assets/index.html`), a natív rész csak a burok (`MainActivity.java`,
`ShotProvider.java`). Csomagnév: `hu.fogasnaplo.app`, minSdk 24, targetSdk 36 (Google Play: 2026. aug. 31-től kötelező).

## Build

```
./build.sh <versionCode> <versionName>     # pl. ./build.sh 7 1.6
```

- Gradle nélkül, közvetlenül az SDK eszközeivel: `aapt2` → `javac` → `d8` → `zipalign` → `apksigner`.
- Kimenet: `out/Fogasnaplo.apk`. Az SDK helye `ANDROID_HOME` (alapértelmezés `/home/claude/android-sdk`), build-tools 36.0.0, platform android-36
  (felülírható: `PLATFORM=35 BUILD_TOOLS=35.0.0 ./build.sh …`, de Play-be csak 36-tal).
- Aláírás: `fogasnaplo.keystore` + `keystore-jelszo.txt` a projekt gyökerében.
  **Ezek soha nem kerülhetnek a repóba** (`.gitignore` kizárja őket, az `out/`, `*.apk`, `*.zip` mellett).
- A Gradle-fájlok (`build.gradle.kts` stb.) megvannak, de a hivatalos build a `build.sh`.
- Tesztapp a valódi mellé: `APP_ID=hu.fogasnaplo.app.teszt LABEL="Fogásnapló TESZT" ./build.sh …` (külön csomagnév, külön adatok).
  A CI minden pushnál ezt is megépíti („Fogasnaplo-TESZT-telefonra” artifact), egy csak CI-s kulccsal. A kamera-provider authority a csomagnévből jön.

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
- Számláló: a „Mai horgászidő” alapból kompakt (`fogasnaplo.todayOpen`), hogy a halfajok és a + gombok elsőre látsszanak.
  Fogások: a statisztika lenyitható blokk, 5 fogás alatt csukva (`fogasnaplo.statsOpen` a felhasználó választása).
- Ha a WebView renderelője összeomlik, a `MainActivity` újraindítja magát (`onRenderProcessGone`).

## Tesztek és CI

- `cd tests && npm ci && npx playwright install chromium && npm test`: tilalmi számítás (`rules.test.js`) és böngészős tesztek ál-Android híddal (`browser.test.js`).
- Új funkcióhoz tegyél tesztet a `browser.test.js`-be. A GitHub Actions (`.github/workflows/ci.yml`) minden pushnál lefuttatja, és a `build.sh`-val egy eldobható CI-kulccsal megépíti az APK-t.

## Adattárolás

- A fogásadatok a WebView `localStorage`-ában vannak, kulcs: **`fogasnaplo.v1`**.
- Egyéb kulcsok: `fogasnaplo.region`, `fogasnaplo.home`, `fogasnaplo.today`.
- A kulcsot vagy az adatformátumot ne változtasd meg migráció nélkül, különben a felhasználók elveszítik a naplójukat.
- Fotók: a teljes kép `files/photos/`, az előnézet `files/thumbs/` (Android), a naplóban csak `file://` uri van.
  1.4-ig az előnézet base64-ként a localStorage-ban volt; induláskor `migrateThumbs` átköltözteti (a localStorage ~5 MB-nál megtelik).
  Új adatot soha ne tegyél base64-ként a naplóba.
- Induláskor `sweepFiles` → `ANDROID.cleanup` törli a naplóban nem szereplő fotókat (1 óra türelmi idővel), üres naplónál nem fut.
- Mentésfájl (`version: 2`): az előnézetek beágyazva (data url). Visszatöltés = összefésülés megerősítés után, meglévő fogást nem ír felül.
- Fogás `kept`: `true` = elvitt, `false` = visszaengedett, hiányzik = nincs megadva. A napi darabszám-figyelmeztetés (`LIMITS`, `LIMITED`, `limitVerdict`)
  csak az elvitt halakat számolja: fajonként 3, összesen 5 db (Duna: 2 / 4). Csak figyelmeztet, nem tilt.
- Fotós mentés (Android): ZIP = `fogasnaplo.json` (a napló `file://` uri-kkal) + `photos/` + `thumbs/`. Visszatöltéskor a fotók a saját nevükkel
  kicsomagolódnak, a JS átírja az uri-kat az új telefon mappáira, és az összefésülés ugyanúgy megerősítést kér.
- Heti automatikus mentés: a mappa SAF tree uri-ja a `SharedPreferences`-ben (`backupTree`), állapot a `fogasnaplo.autobackup` kulcsban.
  Induláskor és előtérbe jövéskor `maybeAutoBackup()`; a mappában a 4 legutóbbi `fogasnaplo-ÉÉÉÉ-HH-NN.zip` marad.
- Törlés (− gomb, „Fogás törlése”) 6 mp-ig visszavonható (`deleteWithUndo`); a fotó csak utána törlődik.

## Mélyvíz design – színek

| Token | Érték |
|---|---|
| `--bg` | `#0b1a1f` |
| `--surface` | `#12282f` |
| `--accent` | `#ff7a45` |
| `--water` | `#5fd0c5` |
| `--water-deep` | `#1f6f6c` |

A tokenek az `index.html` `:root` blokkjában vannak; új színt ezekből vagy a mellettük
lévő származtatott tokenekből (`--bg-2`, `--surface-2`, `--accent-2` …) használj, ne kézzel írt hexet.

## Tilalmi idők és méretkorlátok

- Forrás: **133/2013. (XII. 29.) VM rendelet**. A `RULES` a rendelet *alapdátumait* tartalmazza (pl. csuka 02.01–03.31), nem egy adott év dátumait.
- A tényleges dátumot a `closedSpans()` számolja évente: ha az első nap szombat vagy pihenőnap, a következő munkanapon kezdődik;
  ha az utolsó nap az, az előtte lévő munkanapon ér véget. Ünnepnapok: fix + húsvéthoz kötött (nagypéntek, húsvét, pünkösd).
- **Évente teendő:** a `BRIDGE_DAYS` táblába beírni a következő év áthelyezett pihenőnapjait, amikor az NGM-rendelet megjelenik
  (2025-ben pl. máj. 2. hídnap volt, ezért a ponty tilalma máj. 5-én kezdődött).
- Ellenőrzés: a számítás 2026-ra pontosan a korábbi kézi táblát adja (csuka 02.02., ponty 05.04–05.29. stb.).
- Duna és Tisza: `OVERRIDES` (szigorúbb minimum és felső méretkorlát, harcsára téli elviteli tilalom). Ezek a helyi szabályok nem tolódnak (`shift:false`).
- `ALIAS`: fajnév-szinonimák. A helyi horgászrend szigorúbb lehet; az app ezt a felületen jelzi is.
