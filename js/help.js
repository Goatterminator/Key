// Help texts (Hungarian).

export const INTRO = `
<h2>Kulcsmásoló 3D</h2>
<p>Tedd a kulcsot a telefon képernyőjére, jelöld be a részeit milliméter pontosan, és tölts le belőle egy 3D nyomtatható STL modellt.</p>
<ol>
  <li><b>Kalibrálás</b> egy bankkártyával – így a képernyőn minden 1:1 méretben jelenik meg.</li>
  <li><b>Penge</b> – váll, hátsó él, magasság és a hegy.</li>
  <li><b>Bevágások</b> – a fogazat pontjai.</li>
  <li><b>Fej</b> – a fogórész és a kulcskarika lyuk.</li>
  <li><b>Profil</b> – vastagság és a hosszanti hornyok.</li>
  <li><b>3D modell</b> – ellenőrzés és STL letöltés.</li>
</ol>
<h3>Tippek a pontossághoz</h3>
<ul>
  <li>Fektesd a telefont asztalra, és nézz mindig merőlegesen a képernyőre (ferdén nézve az üveg vastagsága miatt elcsúszik a kép).</li>
  <li>A kulcsot ne fogd, miközben jelölsz – a fém tárgy érintésként hathat.</li>
  <li>Egy fogantyú kijelölése után a képernyőn bárhol húzhatod, így az ujjad nem takarja el. „Finom” módban negyed sebességgel mozog, a nyilakkal 0,02–0,5 mm-es lépésekben tolhatod.</li>
  <li>Legjobb, ha az oldalt a kezdőképernyőhöz adod (teljes képernyős, nem mozdul el a nézet).</li>
</ul>
<p class="callout">Csak a saját, vagy engedéllyel használt kulcsodat másold. A nyomtatott műanyag kulcs eltörhet a zárban – óvatosan használd.</p>
`;

export const HELP = {
  calib: `
<h2>Kalibrálás</h2>
<p>A telefonok képernyője eltérő sűrűségű, ezért egy ismert méretű tárggyal kell beállítani, mekkora 1 mm.</p>
<ol>
  <li>Fektesd a telefont asztalra, és tegyél rá álló helyzetben egy bankkártyát (vagy személyi igazolványt, jogosítványt, lakcímkártyát – mind 85,60 × 53,98 mm).</li>
  <li>A kártya bal felső sarkát igazítsd a piros sarokjelhez.</li>
  <li>Húzz fel-le a képernyőn (vagy használd a csúszkát / −+ gombokat), amíg a kék keret pontosan a kártya jobb és alsó széle mellett fut körbe, rés nélkül.</li>
  <li>Nyomd meg a „Kész” gombot.</li>
</ol>
<p><b>Nincs kártya, vagy nem fér ki a képernyőn?</b> A keret tetején milliméteres skála van: tegyél mellé egy vonalzót, és állítsd addig, amíg a beosztások egyeznek (minél hosszabb szakaszon, annál pontosabb).</p>
<p>A −/+ gombokkal nagyon finoman állíthatsz. Ha nagyítva van a nézet (csippentés), a méretek nem lesznek pontosak – ilyenkor állítsd vissza.</p>`,
  blade: `
<h2>1. Penge</h2>
<ol>
  <li>Tedd a kulcsot a sablonra: <b>hegye felfelé, a bevágások jobbra</b> nézzenek. Engedd el a kulcsot.</li>
  <li>Ha a sablon messze van, kapcsold be a <b>⤧ Mozgat</b> módot, és húzd a sablont a kulcs alá. A forgató fogantyúval (a hegy fölött) elforgathatod. Utána kapcsold ki.</li>
  <li>Állítsd be sorban:
    <ul>
      <li><b>Váll</b> – a vízszintes vonal, ahol a penge a fejhez ér (ez ütközik a zárhoz).</li>
      <li><b>Hátsó él</b> – a penge egyenes, bevágás nélküli éle. A forgató fogantyúval párhuzamosra állíthatod.</li>
      <li><b>Penge magassága</b> – a bevágás nélküli penge teljes szélessége (a váll közelében mérd).</li>
      <li><b>Hegy</b> – a csúcs pontja, és a két letörés kezdete.</li>
    </ul>
  </li>
</ol>
<p><b>Mikor jó?</b> Ha a rózsaszín vonal épp csak kilátszik a kulcs széle mellett, és nem látszik sárga sáv a kulcs és a vonal között.</p>
<p>Egy fogantyú kijelölése után a képernyőn bárhol húzhatod – a pont együtt mozog az ujjaddal, de nem takarja el. Tolómérővel mért értékeket a „Pontos értékek” alatt adhatsz meg.</p>`,
  cuts: `
<h2>2. Bevágások</h2>
<p><b>Koppints</b> minden bevágás legmélyebb pontja mellé (a kulcs szélénél). Ezután húzással vagy a nyilakkal pontosítsd, amíg a kis kör közepe épp a bevágás aljára esik.</p>
<ul>
  <li><b>V-alakú bevágások</b>: a szabványos fogazatot a megadott szöggel (általában 90–100°) és talpszélességgel rajzolja meg. A legtöbb hengerzár-kulcsnál ez a legpontosabb.</li>
  <li><b>Szabad vonal</b>: a pontokat egyenesekkel köti össze (különleges kulcsokhoz). Ilyenkor a váll mellett és a hegynél is tegyél pontot.</li>
  <li><b>Egyenletes távolság</b>: a gyári kulcsok bevágásai egyenlő távolságra vannak. Állítsd be pontosan az elsőt és az utolsót, a többit ez a gomb elosztja közöttük.</li>
  <li><b>Kétoldalú kulcs</b>: ha a penge mindkét élén ugyanazok a bevágások vannak (tükrözve).</li>
</ul>
<p>A „magasság” a penge megmaradó szélessége a hátsó éltől mérve, a „vágás” a bevágás mélysége.</p>`,
  head: `
<h2>3. Fej</h2>
<p>A fej alakja nem befolyásolja a nyitást, csak a fogást és a szilárdságot. Állítsd be a <b>fej végét</b>, a két <b>szélét</b> és a <b>kulcskarika lyukat</b>. A sarkok lekerekítését a „Pontos értékek” alatt találod.</p>
<p>A váll helyzetét az 1. lépésben állítottad be – az a fontos, mert a kulcs ott ütközik a zár elejéhez.</p>`,
  profile: `
<h2>4. Profil és vastagság</h2>
<p>A legtöbb hengerzár kulcsának pengéjén hosszanti hornyok vannak – ezek nélkül a kulcs nem csúszik be a zárba. Lapos kulcsnál (lakat, bútorzár, postaláda) nem kell horony.</p>
<ol>
  <li>Mérd meg tolómérővel a <b>penge vastagságát</b> (általában 1,8–2,3 mm). A fej lehet vastagabb – ettől erősebb lesz a kulcs.</li>
  <li>Nézd meg a kulcsot a hegye felől. Minden horonyhoz add meg:
    <ul>
      <li><b>Oldal</b>: <i>elöl</i> = ami a képernyőn felfelé nézett, <i>hátul</i> = ami a képernyőhöz ért.</li>
      <li><b>Kezdet</b>: a horony alsó széle a penge hátsó (egyenes) élétől.</li>
      <li><b>Szélesség</b> és <b>mélység</b> milliméterben.</li>
    </ul>
  </li>
</ol>
<p>A rajz a penge keresztmetszetét mutatja nagyítva. Ha a kulcs szorul, inkább pár tizeddel mélyebb és szélesebb hornyot adj meg.</p>`,
  model: `
<h2>5. 3D modell</h2>
<p>Egy ujjal forgasd, két ujjal nagyítsd, dupla koppintással állítsd vissza a nézetet.</p>
<p>Az STL fájlt nyisd meg a szeletelő programban (PrusaSlicer, Cura, Bambu Studio, OrcaSlicer). A modell milliméterben van és már nyomtatási helyzetben áll: a képernyőhöz érő oldala kerül a tálcára.</p>
<p>Érdemes először egy próbát nyomtatni, és a képernyőn a sablonra téve összevetni az eredetivel.</p>`,
};
