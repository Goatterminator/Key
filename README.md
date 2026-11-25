# Kulcsmásoló 3D

Telefonos webapp, amellyel egy kulcsot a **telefon képernyőjére fektetve, 1:1 méretben** lehet bejelölni, majd a kész 3D modellt **STL fájlként letölteni** és 3D nyomtatóval kinyomtatni.

Nem kell hozzá telepítés, szerver vagy fiók: egyetlen statikus weboldal, ami a böngészőben fut, és kezdőképernyőre téve offline is működik (PWA).

## Hogyan működik?

1. **Kalibrálás** – egy bankkártyát (vagy személyi igazolványt, jogosítványt; mind 85,60 × 53,98 mm) teszel a képernyőre, és a keretet a széleihez igazítod. Ebből tudja az app, hány képpont 1 mm a te telefonodon. (Kártya helyett vonalzóval is lehet a keret tetején lévő mm-skála alapján.)
2. **Penge** – ráteszed a kulcsot a sablonra (hegye felfelé, bevágások jobbra), és a vonalakat a kulcs széleihez igazítod: váll, egyenes hátsó él, penge magassága, hegy és letörések. A sablon el is forgatható, ha a kulcs nem pont egyenesen fekszik.
3. **Bevágások** – a bevágások aljához koppintasz, majd finoman pontosítod őket. Szabványos V-alakú bevágásokat rajzol (állítható szög és talpszélesség), vagy szabad vonalat. Az „Egyenletes távolság” gomb a gyári egyenlő osztást állítja vissza.
4. **Fej** – a fogórész mérete, lekerekítése és a kulcskarika lyuk.
5. **Profil** – penge- és fejvastagság, valamint a hengerzár-kulcsok hosszanti hornyai (oldal, kezdet, szélesség, mélység).
6. **3D modell** – forgatható előnézet, méretek, ellenőrzés (zárt, nyomtatható háló), **STL letöltés** vagy megosztás.

### Pontossági segédeszközök

- A kontúr vonala csak a jelölt alakzaton **kívülre** rajzolódik, a belseje sárga: akkor jó a jelölés, ha a vonal épp kilátszik a kulcs mellett, és nem látszik sárga sáv.
- Kijelölt fogantyút a képernyőn **bárhol** lehet húzni (nem takarja el az ujj), **Finom** módban negyed sebességgel.
- **Nyíl gombok** 0,02 / 0,05 / 0,1 / 0,5 mm-es lépésközzel (nyomva tartva ismétel).
- Minden méret számmal is megadható (pl. tolómérővel mért értékek) a „Pontos értékek” alatt.
- Visszavonás, milliméteres rács, világos/sötét háttér, teljes képernyő.
- A munka automatikusan mentődik a böngészőben, és JSON fájlba is menthető / betölthető.

## Futtatás

Bármilyen statikus webszerver megfelel, build lépés nincs.

```bash
python3 -m http.server 8080
# majd böngészőben: http://localhost:8080
```

### Claude artifactként

Az app Claude artifactként is fut (a claude.ai-on vagy a Claude alkalmazásban). Az `artifact/index.html` ugyanaz az oldal a platform keret nélküli formátumában; a `node scripts/build-artifact.mjs` készíti el az `index.html`-ből. Közzétételkor mellé kell tenni a `css/app.css`, `js/*.js` és `vendor/earcut.js` fájlokat, és a `downloads` képességet kell megadni.

Artifactban a fájlmentés a Claude saját mentési párbeszédén keresztül megy, ami `.stl` fájlt nem enged, ezért az STL egy **ZIP fájlban** érkezik (ugyanaz a modell, ki kell bontani). A projekt JSON mentése és betöltése ugyanúgy működik.

### Saját tárhelyen

Telefonon a legkényelmesebb **HTTPS** alatt elérhetővé tenni, például **GitHub Pages**-szel: a repó *Settings → Pages* oldalán válaszd a „Deploy from a branch” opciót, az ágat és a `/ (root)` mappát. Ezután a telefonon nyisd meg az oldalt, és add hozzá a kezdőképernyőhöz – így teljes képernyőn fut, és a nézet nem mozdul el jelölés közben.

## Szilárdság

Egy nyomtatott műanyag kulcs nagyjából tízszer gyengébb a sárgarézénél, ezért az app több dolgot is tesz azért, hogy ne törjön bele a zárba:

- **Fokozatos vastagítás a váll mögött:** a vastagabb fej (alapból 3,2 mm) nem éles lépcsővel kezdődik a vállnál – ott van a penge legterheltebb keresztmetszete –, hanem 1 mm-rel mögötte, 0,2 mm-es lépcsőkben, ahol a keresztmetszet már a fej teljes szélessége.
- **Tömör váll-környék:** a kulcskarika lyuk nem kerülhet a váll és a vastagítás közelébe, és körülötte is marad legalább 1,5 mm anyag.
- **Szilárdsági becslés a 3D lépésben:** végigméri a pengét, megkeresi a leggyengébb keresztmetszetet (a 3D nézetben piros gyűrű), és a kiválasztott anyagra (PLA, PETG, ABS, nylon, PC, szénszálas) becsli, mekkora csavarást bír a fejnél. Értékelés: jó / közepes / gyenge. Ez durva becslés, arra jó, hogy lásd, mi erősít és mi gyengít.

A legtöbbet a nyomtatás és a használat számít:

- Anyag: szénszálas nylon (PA-CF) vagy PC a legerősebb, utána nylon és PETG. A PLA rideg, hirtelen törik.
- 100% kitöltés, 5–6 fal, magasabb fúvóka-hőmérséklet (jobb rétegtapadás), lapjára fektetve.
- A hornyokat ne mélyítsd jobban, mint az eredetin; ha szorul, inkább a szeletelő XY-korrekcióját használd.
- Először **nyitott ajtónál** próbáld ki, fújd be a zárat zárspray-vel vagy grafitporral, és ne erőltesd.

## Nyomtatási tippek

- Rétegvastagság 0,1–0,12 mm, 0,4 mm-es (vagy kisebb) fúvóka.
- A modell már nyomtatási helyzetben van (lapjára fektetve, a képernyőhöz érő oldala lent), támasz nem kell.
- Ha szorul: XY méretkorrekció −0,05…−0,1 mm (PrusaSlicer: *XY Size Compensation*, Cura: *Horizontal Expansion*), és „elefántláb” kompenzáció.

## Korlátok

- Hagyományos, élén fogazott (stiftes / tárcsás) kulcsokhoz készült. Fúrt (dimple), lézervágott (oldalbarázdás) és elektronikus kulcsokhoz nem alkalmas.
- A hosszanti hornyokat téglalap keresztmetszettel modellezi.
- A nyomtatott műanyag kulcs eltörhet a zárban: óvatosan, tesztre vagy vészhelyzetre használd, vagy mintaként fémkulcs készítéséhez.
- Csak a saját, vagy engedéllyel használt kulcsodat másold.

## Fejlesztés

```bash
npm test        # geometria és háló tesztek (Node 20+)
npm run e2e     # végigkattintja az appot egy emulált telefonon (Playwright + Chromium kell hozzá)
```

| Fájl | Feladat |
| --- | --- |
| `js/geometry.js` | A projektből a kulcs körvonala (penge, bevágások, hegy, fej, lyuk) és a 3D háló |
| `js/mesh.js` | 2,5D „lépcsős extrudálás”: vízzáró háló a hornyokkal és a vastagabb fejjel, CSG könyvtár nélkül |
| `js/stage.js` | Teljes képernyős 2D vászon: kalibrálás, 1:1 jelölés, profil-ábra |
| `js/handles.js`, `js/frame.js` | Fogantyúk és a képernyő ↔ kulcs koordináta-rendszer |
| `js/viewer.js` | Saját, függőség nélküli WebGL előnézet |
| `js/stl.js` | Bináris STL író |
| `js/zip.js` | Egyszerű ZIP író (artifactban így tölthető le az STL) |
| `js/main.js` | Lépések, panelek, mentés, visszavonás |
| `vendor/earcut.js` | Sokszög-háromszögelés ([earcut](https://github.com/mapbox/earcut), ISC licenc) |
