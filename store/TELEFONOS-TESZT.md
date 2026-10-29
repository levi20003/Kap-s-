# Kapás – tesztlista valódi telefonra

Ezt a listát a tesztelő végigjárja egy valódi Android-telefonon, **mielőtt** a zárt tesztbe (Play Console) kerül a csomag.
Minden pont mellett ott a várt eredmény. Ha valami nem stimmel: **Beállítások → Visszajelzés küldése**, a levél a verziót,
a képernyőméretet és a telefon típusát automatikusan tartalmazza. Írd hozzá, melyik pontnál tart (pl. „3.4”).

## 0. Előkészület

- [ ] Android 7 vagy újabb. Ha lehet, két különböző telefonon: egy régebbin (pl. Android 9–11) és egy újabbon (Android 14–16).
- [ ] Wi-Fi vagy mobilnet, a helymeghatározás bekapcsolva.
- [ ] A tesztapp telepítve (`Fogasnaplo-TESZT.apk`, a Releases oldalról: `…/releases/download/teszt/Fogasnaplo-TESZT.apk`). A telepítésnél engedélyezd az ismeretlen forrásokat.
- [ ] Beállítások → Verzió: felírod (pl. `1.8-abc1234 (1042)`).
- [ ] Teszteléshez nyiss egy üres naplót, vagy használd a valódit: a mentés (4.2) előtte biztosan legyen kész.

## 1. Első indítás és alapok

| # | Lépés | Várt eredmény |
|---|---|---|
| 1.1 | Indítsd el az appot | Megjelenik a Kezdőlap („Szép napot!”), nincs hibaüzenet, a fejlécben a Kapás név látszik |
| 1.2 | Váltogass az öt fül között | Mind az öt fül (Kezdőlap, Fogások, Statisztika, Térkép, Beállítások) megnyílik, az aktív alatt zöld pirula |
| 1.3 | Fordítsd el a telefont | Az app álló marad (fekvő nézet nincs engedélyezve), nem törik el semmi |
| 1.4 | Váltsd át a telefont sötét módra, majd vissza | Az app követi (sötét ↔ világos), a rendszersáv ikonjai olvashatók maradnak |
| 1.5 | Nyomd meg a nap/hold gombot a fejlécben | Kézzel vált, újraindítás után is megmarad |
| 1.6 | Android Vissza gomb/mozdulat a Kezdőlapon | Kilép az appból, nem a Kezdőlapról ugrik máshova |
| 1.7 | Vissza gomb, ha egy fül (pl. Statisztika) van nyitva | Visszavisz a Kezdőlapra; egy nyitott lapról (szerkesztő) bezárja a lapot |

## 2. GPS: helymeghatározás fogásrögzítéskor

| # | Lépés | Várt eredmény |
|---|---|---|
| 2.1 | Koppints egy halfaj melletti „+”-ra, ha még nincs hely-engedély | Az Android megkérdezi, megadod-e a hozzáférést |
| 2.2 | Add meg az engedélyt („használat közben”) | A fogás rögzül, a szerkesztő megnyílik; a Hely alatt hamarosan „Jelenlegi helyem” jelenik meg |
| 2.3 | Kint, szabad ég alatt: nyisd meg a Hely → Módosítás térképet | A jelölő a valódi helyeden áll (kb. 10–30 m pontossággal), a térkép betölt |
| 2.4 | Mentsd a fogást, nyisd meg a Térkép fület | A fogás jelölőként látszik (kék, ha csak GPS-es) |
| 2.5 | Tiltsd le a hely-engedélyt a rendszerben, rögzíts egy új fogást | Az app nem omlik össze; a hely nélkül is mentődik, a térképen kézzel is megadható |
| 2.6 | Kapcsold ki a telefon helymeghatározását (GPS), rögzíts | Hibaüzenet helyett barátságos jelzés, a fogás hely nélkül is mentődik |
| 2.7 | Időjárás-kártya a Kezdőlapon | **Soha** nem kér helyet magától; Szeged az alap, a helyet a gomb váltja |

## 3. Fotók és videók a fogásokhoz

| # | Lépés | Várt eredmény |
|---|---|---|
| 3.1 | Szerkesztő → 📷 Fotó, készíts egy képet | Az előnézet azonnal megjelenik a rácsban, a kép nincs elforgatva rosszul |
| 3.2 | 🖼 Galéria: jelölj ki 3 képet egyszerre | Mind a három megjelenik a rácsban |
| 3.3 | 🎥 Videó: vegyél fel 10 mp-et | Megjelenik egy előnézet ▶ jellel és a hossz (0:10) |
| 3.4 | Galéria: válassz egy videót | A videó bekerül, a hossza és az előnézet helyes |
| 3.5 | Távolíts el egy elemet a „×”-szel | Eltűnik; mentés után a fájl is törlődik a telefonról |
| 3.6 | Mentsd a fogást, koppints rá a listán | Megtekintő kártya nyílik: lapozható képek, a videó lejátszóval; **nem** szerkesztő nyílik |
| 3.7 | Játszd le a videót a kártyán | Hang és kép megy, a lejátszó vezérlői működnek |
| 3.8 | „Szerkesztés” gomb a kártyán | Megnyílik a szerkesztő; Mégse után vissza a kártyára |
| 3.9 | Vegyél fel 13 elemet | A 13.-nál az app jelzi, hogy legfeljebb 12 fér el |
| 3.10 | Zárd be az appot (kilépés) és nyisd újra | Minden fotó és videó még megvan |

## 4. Megosztható fogáskártya és év összefoglaló (Android megosztás)

| # | Lépés | Várt eredmény |
|---|---|---|
| 4.1 | Megtekintő kártya → Megosztás | Pár másodpercen belül megnyílik az Android megosztás-menü a képpel |
| 4.2 | Válaszd a Messenger, WhatsApp vagy Galéria mentést | A kép a fogás fotójával (vagy a zöld háttérrel) és a méret, dátum, hely felirattal érkezik |
| 4.3 | Fotó nélküli fogás megosztása | A kártya a folyóvölgyes háttérrel készül, a szöveg olvasható |
| 4.4 | Statisztika → „Évösszefoglaló megosztása” | Függőleges (sztori-méretű) kép: év, fogásszám, az év hala, top fajok |
| 4.5 | Nagyon hosszú helynév vagy csali | A szöveg levágódik vagy összezsugorodik, nem lóg ki a képből |

## 5. Offline működés és tárolás

| # | Lépés | Várt eredmény |
|---|---|---|
| 5.1 | Repülő üzemmód be, indítsd az appot | Elindul, a napló, a statisztika és a Kihívások látszik |
| 5.2 | Repülő üzemmódban rögzíts egy fogást | Mentődik; az időjárásnál „Nincs internet, amint lesz, magától letölti” |
| 5.3 | Kapcsold vissza a hálózatot, nyisd meg az appot | A fogás időjárása néhány másodpercen belül magától kitöltődik |
| 5.4 | Térkép fül, hálózat nélkül | A korábban megnézett csempék látszanak; a hiányzók szürkék, nincs összeomlás |
| 5.5 | Rögzíts egy fogást, majd **azonnal** zárd be az appot az „utolsó alkalmazások” listából (lehúzás) | Újranyitáskor a fogás megvan |
| 5.6 | Háttérben hagyd az appot 10 percig, nyisd újra | Ugyanott folytatja, nem tölt újra mindent, adat nem vész el |
| 5.7 | Kapcsold ki, majd be a telefont, nyisd meg az appot | A napló és a fotók megvannak |
| 5.8 | Napváltás után hozd előtérbe az appot (ha nincs nyitva szerkesztő) | Magától frissül a dátum és a tilalmi címkék |
| 5.9 | Telefon tárhelye majdnem tele | Az app nem omlik össze; megfelelő figyelmeztetés jelenik meg, ha a mentés nem sikerül |

## 6. Mentés és visszaállítás („háttérbeli tárolás”)

| # | Lépés | Várt eredmény |
|---|---|---|
| 6.1 | Beállítások → Mentés most | Fájlválasztóval ZIP-et ment, a siker visszajelzést ad |
| 6.2 | Beállítások → Mappa kiválasztása (pl. Google Drive vagy SD-kártya) | A kiválasztott mappa látszik az állapotsorban |
| 6.3 | Mentés most, ha van kiválasztott mappa | Közvetlenül oda ment, fotókkal együtt |
| 6.4 | Hagyd 7+ napig az automatikus mentést (vagy módosítsd az óra dátumát) | A mappában megjelenik a heti `fogasnaplo-ÉÉÉÉ-HH-NN.zip`; legfeljebb 4 marad |
| 6.5 | **Visszaállítás** egy másik/tiszta telefonon vagy az app törlése után | Megerősítést kér, majd a fogások és fotók visszajönnek, a meglévőt nem írja felül |
| 6.6 | Mentés → az app törlése → telepítés újra → Visszaállítás (a Play-es verzióra váltás próbája) | Minden fogás és fotó visszajön; ezt a Play aláírás-átmenet előtt kötelező kipróbálni |

## 7. Tilalmak, értesítések, időjárás

| # | Lépés | Várt eredmény |
|---|---|---|
| 7.1 | Halfaj-kártyák a Kezdőlapon | Címkék: „Fogható”, „Tilalom kezdete…”, „Tilalom …-ig”, a mai napnak megfelelően |
| 7.2 | Beállítások → Értesítések bekapcsolása | Android 13+: engedélyt kér; utána „Bekapcsolva. Következő: …” |
| 7.3 | Várj a tilalom előtti estére | 18:00-kor értesítés érkezik („Holnaptól tilalom: …”) |
| 7.4 | Kezdőlap → Időjárás | Érték, hőmérséklet, szél, napív (napkelte, napnyugta), óránkénti sáv, 7 napos sáv; a „Ma” elöl, kiemelve |
| 7.5 | Település keresése (pl. Csongrád) | Találatok jönnek, a választás megmarad újraindítás után |

## 8. Gyors rögzítés és a játék

| # | Lépés | Várt eredmény |
|---|---|---|
| 8.1 | Lebegő „+” gomb → csali és hal | A fogás azonnal mentődik a választott csalival, a szerkesztő megnyílik |
| 8.2 | Tartsd nyomva az app ikonját a kezdőképernyőn | A leggyakoribb 4 faj gyorsgombja látszik; rájuk koppintva új fogás indul |
| 8.3 | Statisztika → Kap-ás Kihívások | XP, szint, heti sorozat, 3 küldetés, jelvények; új fogás után értesítés („+XP”) |

## 9. Automatikus frissítés (csak a tesztappnál)

| # | Lépés | Várt eredmény |
|---|---|---|
| 9.1 | Új tesztverzió kerül fel a GitHubra | Az app (induláskor/visszatéréskor) jelzi: „Új verzió letöltése…”, majd „kész” |
| 9.2 | Lépj ki az appból | Csendben telepíti (Android 12+), vagy egyszer rákérdez |
| 9.3 | Nyisd meg újra | Az új verzió fut, a napló érintetlen |

## 10. Teljesítmény és stabilitás

- [ ] 100+ fogással (importálva) a lista és a statisztika folyamatosan görgethető.
- [ ] Néhány perc használat után az app nem melegszik, nem fogy gyorsan az akksi.
- [ ] A telefon másik alkalmazásba váltás és visszaváltás után a nyitott szerkesztő (és a beírt szöveg) megmarad.
- [ ] Nincs vízszintes elcsúszás kis (360 px) és nagy (412 px) képernyőn.

## Eredmény rögzítése

| Telefon (típus, Android) | Verzió | Dátum | Kiesett pontok | Megjegyzés |
|---|---|---|---|---|
|  |  |  |  |  |
|  |  |  |  |  |

**A zárt tesztbe csak akkor menj, ha:** az 1–6. szakasz minden pontja rendben van legalább két telefonon, és a 7–10. szakaszban nincs
súlyos hiba (összeomlás, adatvesztés, nem megnyíló képernyő).
