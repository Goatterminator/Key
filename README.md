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

Telefonon a legkényelmesebb **HTTPS** alatt elérhetővé tenni, például **GitHub Pages**-szel: a repó *Settings → Pages* oldalán válaszd a „Deploy from a branch” opciót, az ágat és a `/ (root)` mappát. Ezután a telefonon nyisd meg az oldalt, és add hozzá a kezdőképernyőhöz – így teljes képernyőn fut, és a nézet nem mozdul el jelölés közben.

## Nyomtatási tippek

- Anyag: PETG vagy PLA+ (a nylon/PC a legerősebb).
- Rétegvastagság 0,1–0,12 mm, 0,4 mm-es (vagy kisebb) fúvóka, 100% kitöltés, 3–4 fal.
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
| `js/main.js` | Lépések, panelek, mentés, visszavonás |
| `vendor/earcut.js` | Sokszög-háromszögelés ([earcut](https://github.com/mapbox/earcut), ISC licenc) |
