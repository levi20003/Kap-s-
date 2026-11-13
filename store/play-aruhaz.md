# Kapás – Play Áruház-adatlap

Minden szöveg bemásolható a Play Console-ba (Áruházi jelenlét → Fő áruházi adatlap). A karakterkorlátok be vannak tartva.

## Alkalmazás neve (max. 30 karakter)

```
Kapás – horgász fogásnapló
```

## Rövid leírás (max. 80 karakter)

```
Fogásnapló, tilalmi idők, horgászidő és csaliajánló magyar horgászoknak.
```

## Teljes leírás (max. 4000 karakter)

```
Kapás – a horgásznapló, ami a tiéd marad.

Rögzítsd a fogásaidat egy koppintással, nézd meg, jó horgászidő van-e ma, mivel érdemes kimenni, és tudd mindig, melyik hal fogható. Magyar horgászoknak, magyar szabályokkal, reklám nélkül.

🎣 FOGÁSNAPLÓ EGY KOPPINTÁSSAL
• A halfaj melletti „+” vagy a gyors gomb azonnal rögzíti a fogást: időpont, hely, az akkori időjárás és a folyó vízállása magától kerül mellé.
• Utána ráérsz kitölteni: méret, súly, csali, hely a térképen, megjegyzés.
• Több fotó és rövid videó minden fogáshoz.
• Elvitted vagy visszaengedted? Az app figyelmeztet, ha elérnéd a napi darabszám-korlátot.

⏱ HORGÁSZAT INDÍTÁSA
• Egy gomb a vízparton: futó idő, a fogásaid hozzá tartoznak, a végén összefoglaló.
• Az értesítési sávban és a zárolt képernyőn is fut, „+ hal” gombokkal.
• A fogás nélküli alkalom is számít: így látod, hol és mikor éri meg igazán kimenni.

📍 HOVÁ MENJ MA?
• A gyakori helyeid kártyákon: mai horgászidő, legjobb órák, a víz iránya, ott bevált csali.
• „Ma neked”: a ma legjobb helyed egy pillantásra.
• Widget a kezdőképernyőre, kérésre állandó kártya az értesítési sávban (a mai horgászidő, „+ hal”), és értesítés, ha kiemelkedő horgászidő jön.

🪝 MIVEL HORGÁSSZ MA?
• Vedd fel a csalijaidat (akár fotóval, bármikor szerkeszthetők), és az app halra, napra és napszakra összeállítja a legjobb 3-at a saját dobozodból.
• Számol az évszakkal, a fénnyel, a víz színével és a saját fogásaiddal; vezetési tippet is ad.

📅 TILALMI IDŐK ÉS MÉRETKORLÁTOK
• Az országos szabályok (133/2013. VM rendelet) minden halfajra, a pihenőnapos eltolással együtt, évről évre.
• Duna és Tisza külön szabályokkal: szigorúbb méretek, felső korlát, téli elviteli tilalom.
• Értesítés a tilalom előtti estén és amikor újra fogható.

🌤 HORGÁSZIDŐ MA
• 1–5-ös értékelés a légnyomás változása, a szél, a felhőzet, a hőmérséklet, a holdfázis és a folyó vízállása (árad, stagnál, apad) alapján, indoklással.
• 7 napos előrejelzés, óránkénti sáv, eső, szél, napív hajnali és esti rablási ablakkal.
• Te választod a települést, az app magától soha nem kér GPS-t az időjáráshoz.

📊 MINTÁZATAID
• Mikor, mivel és hol fogsz a legtöbbet: havonta, fajonként, napszak, légnyomás, vízállás és holdfázis szerint, sikerességgel és hal/órával.
• Melyik csali és hely vált be az egyes fajoknál, rekordok, térkép a fogásaidról.

📝 HIVATALOS FOGÁSI NAPLÓ
• Az elvitt halaid naponta, víztérkóddal, darabbal és súllyal, ahogy a fogási naplóba kell írni. Egy koppintással kimásolható.
• Emlékeztet a február végi leadásra.

📤 OSZD MEG, AMIRE BÜSZKE VAGY
• Minden fogásból megosztható kártya készül fotóval, mérettel, hellyel.
• Év végén az éved összefoglalója sztori-méretben.

🔒 A HELYEID A TIÉID MARADNAK
• Nincs saját fiók, nincs közösségi hírfolyam, senki nem látja, hol fogtál.
• Ha bejelentkezel a Google-fiókoddal, a napló, a fotók és a videók a saját Google Drive-odra mentődnek; új telefonon minden visszajön. Az app csak a saját mappáját látja.
• Mentés fájlba is, egy gombnyomással. Reklám nincs.

Négy évszak színvilága, mindegyik világos és sötét változatban.

Fontos: a helyi horgászrend szigorúbb lehet az országos szabálynál, az app ezt jelzi is. Horgászat előtt mindig nézd meg a horgászvíz saját rendjét.

Jó kapást!
```

## Képernyőkép-feliratok (sorrendben)

A kész képek: `store/kepek/kepernyo-1.png` … `kepernyo-8.png` (1080×1920). A feliratok rá vannak írva a képekre.
Újragenerálás: `cd tests && node ../tools/aruhaz-kepek.js <munkamappa> <csalitár.json>` (bemutató adatok, a valódi app oldalából).

| # | Felirat | Alcím | Mit mutat |
|---|---|---|---|
| 1 | Jó horgászidő ma? | Légnyomás, szél, eső és a folyó vízállása, egy pillantásra. | Horgászidő-panel, napsáv, napív, vízhozam (tavasz) |
| 2 | Horgászat folyamatban | Idő, fogások, egy koppintás. A fogás nélküli nap is számít. | Élő horgászat-kártya (nyár) |
| 3 | Mivel horgássz ma? | A legjobb 3 csali a saját dobozodból, halra és napszakra. | Csaliajánló csalifotókkal |
| 4 | Hová menj ma? | A helyeid mai horgászideje, a legjobb órákkal. | Helyeim kártyák |
| 5 | Tilalmi idők, mindig frissen | Fogható, hamarosan tilos, tilalom: fajonként. | Halfaj-kártyák állapotcímkékkel |
| 6 | Minden fogás egy kártyán | Fotók, videók, méret, csali, hely, időjárás, víz. | Fogás megtekintő (tél) |
| 7 | A fogási napló kész | Az elvitt halak sorban, víztérkóddal, egy másolással. | Hivatalos fogási napló |
| 8 | Semmi nem vész el | Fotók és videók a saját Google Drive-odra. | Google-fiókos mentés, sötét téma |

## Grafikák

| Fájl | Méret | Hova |
|---|---|---|
| `store/kepek/ikon-512.png` | 512×512 | Alkalmazásikon |
| `store/kepek/kiemelt-grafika.png` | 1024×500 | Kiemelt grafika |
| `store/kepek/kepernyo-1…8.png` | 1080×1920 | Telefonos képernyőképek (a Play legfeljebb 8-at enged) |

## Kategória és címkék

- Alkalmazás vagy játék: **Alkalmazás**
- Kategória: **Sport**
- Címkék (ha kéri): Horgászat, Sport, Időjárás
- Kapcsolattartási e-mail: a saját fejlesztői e-mail-címed (kötelező, nyilvános lesz)
- Webhely: nem kötelező
- Adatvédelmi irányelvek URL: `https://levi20003.github.io/Kap-s-/adatvedelem.html` (lásd a KIADAS.md 2. lépését)

## Első kiadás – „Újdonságok” szöveg (max. 500 karakter)

```
Az első kiadás! Fogásnapló egy koppintással, horgászat-mód stopperrel, tilalmi idők a magyar szabályok szerint, horgászidő a folyó vízállásával, a helyeid mai horgászideje, csaliajánló a saját dobozodból, hivatalos fogási napló, widget, mentés a saját Google Drive-odra. Jó kapást!
```

## Adatbiztonság (Data safety) – válaszok

Az app szerver nélkül működik: a napló, a fotók és a videók a telefonon maradnak (és ha a felhasználó bejelentkezik, a saját Google Drive-jába mentődnek). Hálózatra csak ez megy:
- **Open-Meteo** (időjárás és településkeresés): a fogás vagy a választott település koordinátái, HTTPS-en, regisztráció nélkül.
- **OpenStreetMap** (térképcsempék): a megnézett térképrészlet csempéi.

| Kérdés | Válasz |
|---|---|
| Gyűjt vagy oszt meg az app felhasználói adatot? | **Igen** (a hely az időjáráshoz kimegy az Open-Meteónak) |
| Titkosítva továbbítódik? | **Igen** (HTTPS) |
| Kérheti a felhasználó az adatai törlését? | Nincs szerveroldali adat; a telefonon a fogás vagy az app törlése mindent töröl. Válasz: **Igen**, a leírással: „Az adatok csak a készüléken vannak, az alkalmazásban vagy annak törlésével eltávolíthatók.” |
| Adattípus | **Hely → Pontos hely** (és Hozzávetőleges hely) |
| Gyűjtött? / Megosztott? | **Gyűjtött: igen.** Megosztott: **nem** (szolgáltató dolgozza fel az app működéséhez) |
| Átmenetileg kezelt (ephemeral)? | **Igen** – az app nem tárolja szerveren, csak az időjárás lekéréséhez kerül ki |
| Kötelező vagy választható? | **Választható** (hely nélkül is használható) |
| Cél | **Alkalmazás funkciói** |
| Fotók, videók, személyes adatok, pénzügyi adatok, névjegyek, alkalmazás-aktivitás | Lásd lent: a Google-fiókos mentés miatt a fotók, videók és a napló **gyűjtöttnek** számítanak |

### Google-fiókos mentés (Drive) – a Data safety kiegészítése

Ha a felhasználó bejelentkezik a Google-fiókjával, az app a naplót (benne a fogások helyével), a fotókat és a videókat a **saját Google Drive-jába**
tölti fel (`drive.file` hatókör: az app csak az általa létrehozott fájlokat látja). A fejlesztő ezekhez nem fér hozzá, de a Play meghatározása szerint
ami az app révén elhagyja a telefont, az „gyűjtött”. Óvatos (ajánlott) válaszok:

| Adattípus | Gyűjtött | Megosztott | Kötelező? | Cél |
|---|---|---|---|---|
| Fotók és videók → Fotók, Videók | Igen | Nem | Választható (csak bejelentkezéssel) | Alkalmazás funkciói (biztonsági mentés) |
| Alkalmazás-aktivitás → Egyéb, felhasználó által létrehozott tartalom (a fogásnapló) | Igen | Nem | Választható | Alkalmazás funkciói |
| Hely → Pontos hely (a fogások helye a naplóban) | Igen (már fent is) | Nem | Választható | Alkalmazás funkciói |
| Személyes adatok → E-mail-cím | **Nem** (csak a telefonon jelenik meg, az app nem küldi tovább) | Nem | – | – |

- Titkosítva továbbítódik: **Igen** (HTTPS). Törlés: a felhasználó a Drive „Kapás mentés” mappáját törölheti, a hozzáférést a
  myaccount.google.com/permissions oldalon visszavonhatja; az appban: Beállítások → Kijelentkezés.
- A pontos besorolást a Play Console aktuális kérdései alapján nézd át (a kérdőív szövege változhat).

## Tartalom-besorolás (IARC kérdőív)

- Kategória: **Segédprogram, termelékenység, kommunikáció vagy egyéb**
- Erőszak, szexualitás, nyelvezet, szerencsejáték, drog: **Nem**
- Felhasználók közötti kommunikáció az appon belül: **Nem** (a megosztás a telefon saját megosztás-menüjén megy)
- Megosztja a felhasználó pontos helyét másokkal: **Nem**
- Várható eredmény: PEGI 3 / Mindenki

## Célközönség

- Életkor: **13–15, 16–17, 18 év felett** (13 év alatt a családbarát szabályzat külön követelményeket ír elő – erre nincs szükség)
- Gyerekeknek szóló app: **Nem**

## Egyéb nyilatkozatok

- Hirdetések: **Nincsenek**
- Alkalmazás-hozzáférés: **Minden funkció elérhető különleges hozzáférés nélkül** (nincs bejelentkezés)
- Kormányzati app: Nem · Pénzügyi funkciók: Nem · Egészség: Nem · Hírek: Nem
- Engedélyek: hely (csak használat közben, a fogás helyéhez), értesítések (tilalmi emlékeztető), indításkor futás (az emlékeztető újraélesítése). Fotó/videó a rendszer kamera- és galéria-alkalmazásán át megy, külön engedély nélkül.
