# Kapás – esti ellenőrzés a kiadás előtt

Sorrendben. Ami pipát kap, az kész. A részletek a hivatkozott fájlokban vannak.

## A. Telefonon (tesztapp, kb. 30 perc)

- [ ] **Frissült-e:** Beállítások → Az appról → Verzió: `…-7e51aa8` vagy újabb.
- [ ] **Üdvözlő:** egy másik (üres) telefonon vagy az app adatainak törlése után: 3 lépés (halfajok + víz, Google-mentés, értesítések). Meglévő naplónál nem jön elő.
- [ ] **Google Drive:** Beállítások → Biztonsági mentés: a neved, „Minden fent van a Drive-on (x/x fájl)”. drive.google.com → Kapás mentés mappa.
- [ ] **Videó:** egy rövid videós fogás wifin felmegy (a Drive-on `….mp4`).
- [ ] **Visszaállítás próbája:** második telefon (vagy az app törlése, újratelepítés), bejelentkezés ugyanazzal a fiókkal → rákérdez → minden fogás, fotó és videó visszajön.
- [ ] **Visszajelzés gomb:** Beállítások → Az appról → Visszajelzés küldése: a levél végén „Hibák: nincs” (vagy a hibák listája).
- [ ] **Új ikon:** a kezdőképernyőn a Tisza-kanyar (nap + folyó); ha a régi látszik, indítsd újra a telefont. Téma-ikon: Beállítások → Háttérkép és stílus → Témájú ikonok.
- [ ] **Horgászat-mód:** Kezdőlap → Horgászat indítása → az értesítési sávban futó stopper; zárolt képernyőn „+ Balin”; „Befejezés” → összefoglaló.
- [ ] **Widget:** kezdőképernyő hosszan nyomva → Modulok → Kapás – horgászidő; „+ hal” és „Horgászat” gomb.
- [ ] **Állandó kártya:** Beállítások → Értesítések → Állandó kártya be → lehúzott értesítési sávban és zárolt képernyőn: mai horgászidő,
  esti rablás, „+ hal”, „Horgászat”. Horgászat indításakor eltűnik (a stopper van helyette), befejezéskor visszajön; telefon-újraindítás után is ott van.
- [ ] **Okos értesítés:** Beállítások → Értesítések → Jó horgászidő bekapcsolása; a „Következő:” sor mutatja, mikor szól.
- [ ] **Húzás, rezgés, konfetti:** Fogások listán elhúzni egy elemet; egy rekordnál nagyobb hossz mentése.
- [ ] **Csali szerkesztése:** Beállítások → Csalitáram → a csali nevére koppintva; átnevezésnél „a korábbi fogásoknál is átírom”.
- [ ] **Logó a fejlécben:** sötét módban is jól látszik (vékony keret, halvány fény).
- [ ] **Helyeim / Ma neked:** Térkép fül teteje és Kezdőlap (kell 2+ fogás ugyanazon a néven mentett helyen).
- [ ] **A teljes lista:** `store/TELEFONOS-TESZT.md`, legalább az 1–6. és a 10a–10d. szakasz.

## B. A kiadás feltételei (csak te tudod)

- [ ] **Visszajelzési e-mail:** `app/src/main/assets/index.html` → `const FEEDBACK_EMAIL="";` közé a címed.
- [ ] **Adatvédelmi oldal:** `docs/adatvedelem.html` végén a `[ide jön a fejlesztői e-mail-cím]` helyére ugyanaz.
  (A kiadási workflow megáll, amíg ez a kettő hiányzik.)
- [ ] **GitHub Pages:** repó → Settings → Pages → Branch: `fejlesztesek` (vagy `main`), mappa `/docs` → Save.
  Ellenőrzés: `https://levi20003.github.io/Kap-s-/adatvedelem.html` megnyílik.
- [ ] **Play fejlesztői fiók:** a személyazonosság-ellenőrzés kész (KIADAS.md 0.).
- [ ] **Aláíró kulcs a GitHubon:** `FOGASNAPLO_KEYSTORE_B64`, `FOGASNAPLO_KEYSTORE_PASS` (KIADAS.md 1.).

## C. Kiadás (KIADAS.md 3–5.)

- [ ] Actions → „Kiadás (Play Áruház)” → Run workflow: versionCode **10**, versionName **2.0**.
- [ ] A futás „Annotations” részéből a **Valódi app SHA-1** → Google Cloud → Clients → új Android-kliens: `hu.fogasnaplo.app` + ez a SHA-1
  (`store/GOOGLE-BEJELENTKEZES.md` 3.).
- [ ] Play Console: app létrehozása, **PEPK-úton a saját kulcsod** (KIADAS.md 4., hogy a telefonodon lévő Kapás frissíthető maradjon).
  Ha a Play saját kulcsot generál, annak SHA-1-ét is fel kell venni Google Cloud-kliensnek.
- [ ] Áruházi adatlap: szövegek a `store/play-aruhaz.md`-ből, képek a `store/kepek/`-ből (ikon, kiemelt grafika, 8 képernyőkép).
- [ ] Adatbiztonság (Data safety): a `play-aruhaz.md` két táblázata szerint (a Google Drive-os rész is).
- [ ] Zárt teszt: a `.aab` feltöltése, 12 tesztelő Gmail-címe a tesztelői listára **és** a Google Cloud → Audience → Test users közé.
- [ ] A Google Cloud hozzájárulási képernyő: amíg zárt teszt van, maradhat „Testing”; az éles kiadás előtt **Publish app** („In production”).

## D. A kiadás után (fejlesztés, nem sürgős)

- [ ] Angol nyelvű változat (a szövegek kiemelése egy fordítótáblába, aztán az angol áruházi adatlap).
- [ ] A CI-akciók frissítése (Node 24-es verziók, `setup-java` v5), mielőtt a GitHub kikapcsolja a régieket.
- [ ] `BRIDGE_DAYS`: a 2027-es áthelyezett munkanapok, amikor a rendelet megjelenik (évente).
- [ ] Az első visszajelzések és a Play Console összeomlás-jelentései alapján javítások.

## Ha valami nem stimmel

Beállítások → Visszajelzés küldése: a levélben benne a verzió, a telefon és az utolsó hibák. Képernyőkép + a lépés száma ebből a listából.
