# Kapás – Google-bejelentkezés és Drive-mentés beállítása (egyszer kell)

Az app a Google saját bejelentkezését használja (Google Play-szolgáltatás, `AuthorizationClient`), és a felhasználó **saját Google Drive-jára**
ment: napló, összes fotó és videó, teljes méretben, a „Kapás mentés” mappába. Ehhez a Google-nek tudnia kell, hogy a Kapás a te appod:
ezt egy ingyenes Google Cloud-projektben kell beállítani. Amíg ez nincs meg, a bejelentkezés gomb ezt írja:
„A Google-bejelentkezés ehhez az apphoz még nincs beállítva”.

A Google felülete gyakran változik; ha egy menüpont máshol van, a nevét keresd (pl. „OAuth consent screen”, „Credentials”).

## 1. Projekt és Drive API

1. <https://console.cloud.google.com/> → bejelentkezés a fejlesztői Google-fiókoddal → fent a projektválasztó → **New project**, név: `Kapas`.
2. **APIs & Services → Library** → keresd: **Google Drive API** → **Enable**.

## 2. A hozzájárulási képernyő (Google Auth Platform)

1. **APIs & Services → OAuth consent screen** (újabb felületen: **Google Auth Platform → Branding**).
2. App name: `Kapás`, User support email: a te címed. Logót **ne** tölts fel (logóval a Google külön ellenőrzést kér).
3. App home page: `https://levi20003.github.io/Kap-s-/adatvedelem.html`, Privacy policy: ugyanez. Developer contact: a te címed.
4. **Audience**: External. Amíg „Testing” állapotban van, csak a **Test users** listán szereplő Gmail-címek tudnak bejelentkezni
   (max. 100): vedd fel magad és a tesztelőket (a zárt teszt 12 tesztelőjét is).
5. **Data access → Add or remove scopes**: `https://www.googleapis.com/auth/drive.file` („See, edit, create, and delete only the specific
   Google Drive files you use with this app”). Ez nem érzékeny hatókör, ezért nem kell hozzá Google-ellenőrzés.
6. Az éles kiadás előtt: **Audience → Publish app** („In production”). Tesztállapotban a Google hetente újra kéri a bejelentkezést;
   az app ezt kezeli („A Google újra kéri a bejelentkezést” + gomb), de élesben ez nem kell.

## 3. Android-kliensek (csomagnév + aláíró kulcs ujjlenyomata)

**APIs & Services → Credentials → Create credentials → OAuth client ID → Android.** Mindhárom kulcshoz külön kliens kell:

| Mihez | Package name | SHA-1 honnan |
|---|---|---|
| Tesztapp | `hu.fogasnaplo.app.teszt` | GitHub → Actions → CI → a legutóbbi futás → **Annotations**: „Tesztapp SHA-1”. Előtte állítsd be a `FOGASNAPLO_TESZT_SEED` secretet (KIADAS.md 1b), különben a kulcs változhat. |
| Valódi app, feltöltő kulcs | `hu.fogasnaplo.app` | Actions → „Kiadás (Play Áruház)” futás → Annotations: „Valódi app SHA-1”. Vagy a gépeden: `keytool -list -v -keystore fogasnaplo.keystore -alias fogasnaplo` → SHA1. |
| Valódi app a Play-ből | `hu.fogasnaplo.app` | Play Console → az app → **Test and release → App integrity → App signing** → „App signing key certificate” SHA-1. Ha a PEPK-úton a saját kulcsodat adtad meg (KIADAS.md 4.), ez ugyanaz, mint a feltöltő kulcs, és nem kell külön kliens. |

Client ID-t, titkos kulcsot **nem** kell az appba írni: Androidon a Google a csomagnév + SHA-1 alapján ismeri fel az appot.
A beállítás után pár perc, mire érvényes lesz.

## 4. Kipróbálás

1. Tesztapp → Beállítások → Biztonsági mentés → **Bejelentkezés Google-fiókkal** → fiók kiválasztása → engedélyezés.
2. Megjelenik a neved és a címed, majd: „Feltöltés a Drive-ra… x/y fájl”, végül „Minden fent van a Drive-on”.
3. drive.google.com → **Kapás mentés** mappa: `fogasnaplo.json`, a fotók (`….jpg`), a videók (`….mp4`), az előnézetek (`thumb-….jpg`).
4. Visszaállítás próbája: Beállítások → **Visszaállítás a Drive-ról** (vagy egy másik telefonon / újratelepítés után bejelentkezés: üres naplónál magától letölt, és megerősítést kér).

| Hibaüzenet | Ok |
|---|---|
| „még nincs beállítva (a fejlesztő Google Cloud-beállítása hiányzik)” | Nincs Android-kliens ehhez a csomagnévhez + SHA-1-hez, vagy még nem élesedett (várj 5 percet). |
| „A Google Drive API nincs bekapcsolva” | 1.2 kimaradt. |
| A fiókválasztó után semmi / „access_denied” | A fiók nincs a Test users listán (2.4), vagy a hatókör nincs felvéve (2.5). |
| „nincs (vagy elavult) a Google Play-szolgáltatás” | Pl. Huawei telefon: ott a mappás vagy a fájlos mentés működik. |

## Hogyan működik (röviden)

- A napló minden változás után kb. 20 mp-cel, induláskor és előtérbe jövéskor szinkronizál; csak az új vagy változott fájl megy fel.
- A videók alapból csak wifin mennek fel („Videók feltöltése mobilneten is” kapcsoló).
- Üres napló sosem írja felül a Drive-on lévőt; másik telefon újabb mentését sem: ilyenkor az app összefésülést kínál.
- A naplóból kikerült fájlok a Drive kukájába kerülnek (30 napig visszahozhatók), nem törlődnek azonnal.
- Kijelentkezéskor a hozzáférés a Google-nál is visszavonódik; a Drive-on lévő mentés megmarad.
