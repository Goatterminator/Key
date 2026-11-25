// Help texts (Hungarian).

export const INTRO = `
<h2>Kulcsmásoló 3D</h2>
<p>Mérd be a kulcsot – a telefon képernyőjére fektetve, vagy egy fotóról AI segítséggel –, és tölts le belőle egy 3D nyomtatható STL modellt.</p>
<ol>
  <li><b>Fotó</b> a kulcsról egy bankkártya mellett (az AI bejelöli a részeit), <b>vagy kalibrálás</b> egy bankkártyával, ha a kulcsot a képernyőre teszed.</li>
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
  photo: `
<h2>Fotó</h2>
<ol>
  <li>Tedd a kulcsot és egy <b>bankkártyát</b> (vagy személyi igazolványt, jogosítványt – mind 85,60 × 53,98 mm) egymás mellé egy világos, egyszínű lapra. A kulcs feküdjön laposan.</li>
  <li>Fotózd <b>felülről, merőlegesen</b>. A legpontosabb, ha 30–40 cm-ről 2× zoommal fotózol: így kisebb a torzítás. Vaku nélkül, csillogás nélkül.</li>
  <li>Az <b>AI felismerés</b> megkeresi a kártya sarkait és a kulcs két végét. Nagyíts rá (két ujjal), és igazítsd a pontokat: a kártya sarkát ott jelöld, ahol az egyenes élek meghosszabbítása találkozna – a kék keretnek pontosan a kártya szélén kell futnia.</li>
  <li><b>Tovább</b>: az app a kártyából kiszámolja a pontos méretarányt, kiegyenesíti a képet, és az AI bejelöli a kulcs részeit. Ezeket a következő lépésekben a felnagyított fotón ellenőrizd.</li>
</ol>
<h3>AI</h3>
<p>A Claude-os oldalon a beépített Claude elemzi a fotót (kulcs nem kell). Saját weboldalon egy <b>Gemini API kulcsot</b> adhatsz meg az „AI beállítás” alatt; a kulcs csak ezen az eszközön tárolódik. AI nélkül kézzel is bejelölheted a pontokat.</p>
<p>Az AI csak javaslatot tesz: tized milliméterre nem pontos, ezért minden jelölést nézz át nagyítva.</p>`,
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
<p>A rajz a penge keresztmetszetét mutatja nagyítva.</p>
<h3>Szilárdság</h3>
<p>A hornyok gyengítik a pengét, ezért csak annyira mélyek legyenek, amennyire a kulcs eredetije. Ha a nyomtatott kulcs szorul, inkább a szeletelő XY-korrekciójával vékonyíts (lásd a 3D lépés tippjeit). A fej lehet vastagabb (3–4 mm): az app a váll mögött fokozatosan vastagítja, így nem keletkezik gyenge pont a penge tövénél.</p>`,
  model: `
<h2>5. 3D modell</h2>
<p>Egy ujjal forgasd, két ujjal nagyítsd, dupla koppintással állítsd vissza a nézetet.</p>
<p>Az STL fájlt nyisd meg a szeletelő programban (PrusaSlicer, Cura, Bambu Studio, OrcaSlicer). A modell milliméterben van és már nyomtatási helyzetben áll: a képernyőhöz érő oldala kerül a tálcára.</p>
<p>A <b>Szilárdság</b> doboz megmutatja a penge leggyengébb pontját (a 3D nézetben piros gyűrű), és a kiválasztott anyagra becsüli, mekkora csavarást bír. Ez durva becslés – arra jó, hogy lásd, melyik beállítás erősít vagy gyengít.</p>
<p>Érdemes először egy próbát nyomtatni, a képernyőn a sablonra téve összevetni az eredetivel, és <b>nyitott ajtónál</b>, óvatosan kipróbálni. Ha nem fordul könnyedén, ne erőltesd.</p>`,
  strength: `
<h2>Szilárdság</h2>
<p>Kulcs elfordításakor a fejre ható csavarást a penge adja át a zárnak. A nyomtatott műanyag kb. tízszer gyengébb a sárgarézénél, ezért ez a legfontosabb kérdés.</p>
<p>Az app végigméri a pengét, és megkeresi azt a keresztmetszetet, amely a legkevésbé bírja a rá jutó terhelést – ez általában a váll közelében lévő mély bevágás. A <b>becsült törőnyomaték</b> az a csavarás a fejnél, amelynél ott eltörhet (100% kitöltésű nyomtatásnál, a kiválasztott anyaggal). <b>Durva becslés</b>: a valós érték a nyomtatótól, a beállításoktól és a rétegtapadástól is függ.</p>
<p>Összehasonlításul: egy jól járó zárhenger elfordításához jellemzően 0,1–0,3 N·m kell, egy szoruló zárhoz vagy nehezen járó reteszhez ennél több is.</p>
<h3>Mi teszi erősebbé?</h3>
<ul>
  <li><b>Anyag:</b> szénszálas nylon (PA-CF) vagy PC a legjobb, utána nylon és PETG. A PLA hirtelen, figyelmeztetés nélkül törik.</li>
  <li><b>Nyomtatás:</b> 100% kitöltés, 5–6 fal, magasabb fúvóka-hőmérséklet, lapjára fektetve.</li>
  <li><b>Hornyok:</b> csak annyira mélyek legyenek, mint az eredetin – a túl mély horony sokat gyengít.</li>
  <li><b>Vastagabb fej</b> (3–4 mm): a fej nem törik el, és jobban fogható. Az app a váll mögött fokozatosan vastagít, így a penge töve nem gyengül.</li>
</ul>
<h3>Használat</h3>
<ul>
  <li>Először <b>nyitott ajtónál</b> próbáld ki.</li>
  <li>Fújd be a zárat zárspray-vel vagy grafitporral, told be a kulcsot ütközésig, és csak könnyedén fordítsd.</li>
  <li>Ha nem fordul magától: ne erőltesd, ne használj fogót – húzd ki, és pontosíts.</li>
  <li>Tartós használatra a nyomtatott kulcsot inkább mintaként vidd el egy kulcsmásolóhoz.</li>
</ul>`,
};
