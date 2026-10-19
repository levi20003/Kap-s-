# Fogásnapló – Android app

Horgász fogásnapló (pergetés). A felület egyetlen WebView-ban futó HTML/JS oldal
(`app/src/main/assets/index.html`), a natív rész csak a burok (`MainActivity.java`,
`ShotProvider.java`). Csomagnév: `hu.fogasnaplo.app`, minSdk 24, targetSdk 34.

## Build

```
./build.sh <versionCode> <versionName>     # pl. ./build.sh 6 1.5
```

- Gradle nélkül, közvetlenül az SDK eszközeivel: `aapt2` → `javac` → `d8` → `zipalign` → `apksigner`.
- Kimenet: `out/Fogasnaplo.apk`. Az SDK helye `ANDROID_HOME` (alapértelmezés `/home/claude/android-sdk`), build-tools 35.0.0, platform android-35.
- Aláírás: `fogasnaplo.keystore` + `keystore-jelszo.txt` a projekt gyökerében.
  **Ezek soha nem kerülhetnek a repóba** (`.gitignore` kizárja őket, az `out/`, `*.apk`, `*.zip` mellett).
- A Gradle-fájlok (`build.gradle.kts` stb.) megvannak, de a hivatalos build a `build.sh`.

## Adattárolás

- A fogásadatok a WebView `localStorage`-ában vannak, kulcs: **`fogasnaplo.v1`**.
- Egyéb kulcsok: `fogasnaplo.region`, `fogasnaplo.home`, `fogasnaplo.today`.
- A kulcsot vagy az adatformátumot ne változtasd meg migráció nélkül, különben a felhasználók elveszítik a naplójukat.
- Fotók: a teljes kép `files/photos/`, az előnézet `files/thumbs/` (Android), a naplóban csak `file://` uri van.
  1.4-ig az előnézet base64-ként a localStorage-ban volt; induláskor `migrateThumbs` átköltözteti (a localStorage ~5 MB-nál megtelik).
  Új adatot soha ne tegyél base64-ként a naplóba.
- Induláskor `sweepFiles` → `ANDROID.cleanup` törli a naplóban nem szereplő fotókat (1 óra türelmi idővel), üres naplónál nem fut.
- Mentésfájl (`version: 2`): az előnézetek beágyazva (data url). Visszatöltés = összefésülés megerősítés után, meglévő fogást nem ír felül.
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

## Tilalmi idők és méretkorlátok (2026)

- Forrás: a 2026-os országos szabályok, **133/2013. (XII. 29.) VM rendelet**.
- Duna és Tisza: egységes vízterületi szabályok (szigorúbb minimum és felső méretkorlát, harcsára téli elviteli tilalom).
- A kódban: `RULES` (országos tilalmi időszakok és minimumméret), `OVERRIDES` (duna / tisza eltérések), `ALIAS` (fajnév-szinonimák) az `index.html`-ben.
- A helyi horgászrend szigorúbb lehet; az app ezt a felületen jelzi is.
- Szabálymódosításnál a rendelet aktuális szövegéből dolgozz, és az évszámot (`2026`) is frissítsd ott, ahol a felület mutatja.
