# Audio Visualizer Studio — implementační plán

> Pracovní název produktu. Tento plán je připraven jako podklad pro rozpad do Taigy a následnou implementaci po ověření trackeru.

**Cíl:** Vytvořit webovou kreativní aplikaci pro hudební producenty, která po nahrání MP3 generuje živou hudební vizualizaci, umožní její úpravu a později exportuje hotové video pro sociální sítě. Cílové doručení MVP je webová aplikace dostupná přes privátní Tailscale tunnel/Serve target; veřejné vystavení do Internetu není pro MVP požadováno.

**Nejmenší hodnotná dodávka:** Lokální React editor bez účtů a bez serverového ukládání. Uživatel nahraje MP3, přehraje ji, zvolí vizualizační scénu, upraví její energii/citlivost/pohyb/hustotu/záře, zvolí paletu a vidí plynulý náhled reagující na hudbu.

**Architektura:** React řídí aplikaci a editor, samostatný Canvas/WebGL runtime vykresluje každý snímek a Web Audio API analyzuje zvuk. Renderovací vrstva nesmí být závislá na React re-renderu. Export bude navržen jako oddělená služba: nejprve lokální zachycení náhledu, později přesný produkční render přes FFmpeg worker.

**Pracovní stack:** React, TypeScript, Vite, Zustand nebo ekvivalentní malý store, Web Audio API, PixiJS/WebGL pro 2D scény a částicové efekty, CSS design tokens, vlastní glassmorphism komponenty, automatizované testy pro čistou logiku a manuální browser QA pro audio/rendering.

## Produktové rozhodnutí

### Cílový uživatel
Hudební producent, který má vlastní skladbu a chce rychle vytvořit vizuální podkres pro YouTube, TikTok, Instagram/Reels nebo vlastní promo. Nechce se učit komplexní video editor; potřebuje dobrý výsledek během několika minut.

### Formáty
18:9 zůstává podporovaný jako vlastní široký preset, ale nebude jediný interní formát. Protože cílem jsou různé sociální sítě, renderer musí od začátku pracovat s exportním profilem:

- široký preset pro YouTube;
- vertikální preset pro TikTok, Reels a Shorts;
- čtvercový/portrétní preset pro feed;
- vlastní preset 18:9;
- scéna se nesmí implementovat pro jedno pevné rozlišení.

Přesné exportní rozlišení, FPS, kodek a bitrate budou konfigurovatelné přes `ExportProfile`, ne natvrdo v jednotlivých scénách.

### MVP v rozsahu

- drag-and-drop nebo výběr jedné MP3;
- lokální zpracování bez uploadu na server;
- načtení názvu a délky skladby;
- play/pause, posun a hlasitost;
- analýza frekvenčního spektra a časové amplitudy;
- minimálně čtyři vizualizační scény;
- výběr barevné palety;
- smysluplné parametry scény: Energy, Sensitivity, Motion, Density, Glow, Background;
- náhled reagující na aktuálně přehrávanou pozici;
- resize a přepínání formátového profilu bez rozbití scény;
- fullscreen náhled;
- srozumitelné chyby pro neplatný soubor, nepodporovaný formát, nepovolený audio context a selhání inicializace rendereru;
- lokální zapamatování nastavení projektu, pokud to nebude vyžadovat persistenci samotného MP3 souboru.

### Mimo MVP

- účty, autentizace a veřejné profily;
- cloudové ukládání skladeb nebo projektů;
- playlisty a více skladeb v jednom projektu;
- timeline s více scénami;
- texty, titulky, loga a watermark editor;
- automatické publikování na sociální sítě;
- AI generování scén;
- desítky technických parametrů;
- produkční MP4 export;
- serverová renderovací fronta.

## Technický návrh

### Audio engine

1. Přijmout `File` pouze přes explicitní input/drop zone.
2. Vytvořit lokální object URL; soubor neodesílat na server.
3. Připojit HTMLAudioElement do AudioContext.
4. Vést signál přes `AnalyserNode` a řídit přehrávání přes oddělený audio engine.
5. V každém render ticku připravit normalizovaná data:
   - `frequencyBins`;
   - `bassEnergy`;
   - `midEnergy`;
   - `trebleEnergy`;
   - `rms/volume`;
   - `beatPulse` jako jednoduchá vyhlazená odezva, nikoli slib přesné beat detekce.
6. Na user gesture odemknout AudioContext a při chybě zobrazit akční návod.
7. Při výměně skladby bezpečně uvolnit object URL, audio element a analyser.

### Render runtime

React nebude renderovat 60× za sekundu. Runtime bude mít samostatné rozhraní:

```text
mount(canvas, options)
update(audioFrame, deltaTime, settings)
resize(width, height, devicePixelRatio)
setSettings(settings)
destroy()
```

Každá scéna musí být deterministická pro stejnou konfiguraci a audio frame. Interní scéna může být postavená na PixiJS, WebGL shaderech nebo kombinaci; editor na tom nesmí záviset.

První scény:

1. `Spectrum` — frekvenční sloupce nebo radiální spektrum.
2. `Waveform` — organická vlnová linie se světelnou stopou.
3. `Orbital` — částice/prstence reagující na energii.
4. `FluidGlow` — pomalé tekuté světlo a mlhy; vhodný kandidát pro shader.

### Stav projektu

Minimální doménový model:

```text
Project
- name
- audioMetadata
- activeSceneId
- sceneSettings
- palette
- canvasProfile
- playbackPreferences
```

Stav rozdělit na:

- `audioState` — file metadata, playback state, duration, current time;
- `visualState` — active scene, scene parameters, random seed;
- `paletteState` — background, primary, secondary, accent;
- `canvasState` — aspect ratio, logical size, preview scale;
- `projectState` — project name and persistence metadata.

File object není vhodné slepě serializovat do localStorage. Pokud bude potřeba zachovat MP3 po refreshi, rozhodnout mezi IndexedDB a explicitním opětovným výběrem souboru; v MVP je přípustné vyžádat si po refreshi nové nahrání.

### UI a design systém

Layout editoru:

- levý panel: audio, scény, palety, formát;
- střed: dominantní preview canvas;
- pravý panel: inspector aktivní scény;
- spodní lišta: playback a časová osa.

Glassmorphism používat na ovládacích panelech, ne přes celý canvas:

- tmavé studiové pozadí;
- průsvitné panely;
- jemný border a malý shadow;
- blur používat střídmě kvůli výkonu;
- kontrast ovládacích prvků musí zůstat čitelný;
- barevná atmosféra se může odvozovat od aktivní palety;
- ovládání musí být použitelné i bez hoveru a na úzké obrazovce.

### Exportní hranice

MVP nemusí mít hotový export, ale renderer nesmí být navržen tak, aby ho znemožnil.

První exportní spike:

- `canvas.captureStream(fps)`;
- připojení audio streamu z Web Audio API;
- kombinace audio/video tracků;
- MediaRecorder jako rychlá lokální cesta;
- ověřit dostupné MIME typy a jasně oznámit nepodporovaný formát.

Produkční export:

- serverový render worker s FFmpeg;
- přesný audio/video sync;
- MP4/H.264 pro širokou kompatibilitu;
- exportní fronta, progress a opakování selhané úlohy;
- object storage až ve fázi, kdy bude cloudový projekt skutečně potřeba.

`ffmpeg.wasm` se do MVP nezařazuje kvůli velikosti, paměti a mobilnímu výkonu.

## Backlog pro Taigu

Poznámka: aktuální Taiga MCP server je připojený a cílový projekt je zapsaný v Taize jako projekt 19 `Audio Visualizer Studio`. Níže uvedený rozpad je synchronizovaný s Taigou; tracker je autoritativní pro IDs, stavy, vztahy a důkazy. Deployment target je privátní Tailscale tunnel/Serve web application stream.

Pracovní název Taiga projektu: `Audio Visualizer Studio`.

### Epic 1 — Produktový základ a editor shell

**US-001: Jako producent chci otevřít prázdný hudební projekt**

Akceptace:
- aplikace zobrazí editor ve výchozím stavu;
- jasně ukáže drop zone pro MP3;
- preview má určený formát a prázdný stav;
- žádný nefunkční export nebo falešné tlačítko se nezobrazuje jako hotová funkce.

Úkoly:
- založit React + TypeScript + Vite strukturu;
- zavést lint, typecheck, test runner a build check;
- vytvořit AppShell se třemi panely a spodní playback lištou;
- vytvořit design tokens pro tmavý studiový vzhled;
- vytvořit přístupný GlassPanel, Button, IconButton, Tabs, Slider a Select;
- ověřit responsive chování na desktopu a úzké viewport šířce.

### Epic 2 — Lokální MP3 a playback

**US-002: Jako producent chci nahrát vlastní MP3 bez uploadu na server**

Akceptace:
- přijme se MP3 přes file picker i drag-and-drop;
- při úspěchu se zobrazí název a délka;
- soubor neopustí prohlížeč;
- při odmítnutí souboru je zobrazena akční chyba;
- při výměně souboru se starý object URL uvolní.

Úkoly:
- implementovat AudioUploader;
- validovat MIME typ a základní příponu;
- implementovat lokální object URL lifecycle;
- přidat audio metadata loading states;
- otestovat neplatný, prázdný a velmi krátký soubor.

**US-003: Jako producent chci skladbu ovládat**

Akceptace:
- play/pause funguje po user gesture;
- lze posouvat v čase;
- čas aktuální/délka se zobrazují správně;
- hlasitost neovlivní výpočet vizualizace nečekaným způsobem;
- při konci skladby se stav vrátí do předvídatelného stavu.

Úkoly:
- vytvořit AudioEngine API;
- oddělit playback clock od React UI;
- přidat seek a volume controls;
- řešit suspend/resume AudioContext;
- přidat testy stavových přechodů playbacku.

### Epic 3 — Analýza zvuku

**US-004: Jako vizualizace potřebuji stabilní audio data**

Akceptace:
- renderer dostává normalizované frekvenční a časové hodnoty;
- data jsou vyhlazená proti blikání;
- bass/mid/treble reagují odlišně;
- výkon analýzy nezpůsobí viditelné sekání ovládacího rozhraní.

Úkoly:
- vytvořit AnalyserNode adapter;
- definovat `AudioFrame` typ;
- implementovat smoothing a energy bands;
- navrhnout jednoduchý beat pulse bez tvrzení o přesné beat detekci;
- přidat debug overlay dostupný pouze v development režimu;
- otestovat normalizaci na tichém i hlasitém signálu.

### Epic 4 — Scénový systém a čtyři MVP scény

**US-005: Jako producent chci přepínat mezi vizuálními styly**

Akceptace:
- scény lze přepnout bez reloadu stránky;
- přepnutí neuvolní audio stav;
- aktivní scéna je vizuálně zřetelná;
- neaktivní renderer je bezpečně zničen nebo pozastaven;
- resize a různé poměry stran nerozbíjejí kompozici.

Úkoly:
- vytvořit scene registry;
- vytvořit společné scene runtime rozhraní;
- implementovat Spectrum;
- implementovat Waveform;
- implementovat Orbital;
- implementovat FluidGlow nebo jeho zjednodušenou MVP variantu;
- ověřit lifecycle `mount/update/resize/destroy`.

**US-006: Jako producent chci upravit intenzitu vizualizace**

Akceptace:
- každá scéna nabízí jen relevantní nastavení;
- změny se projeví v preview bez ztráty playbacku;
- parametry mají rozumný rozsah a výchozí hodnotu;
- reset vrátí scénu do výchozího stavu.

Úkoly:
- definovat schema parametrů scén;
- vytvořit InspectorPanel;
- vytvořit slider/input binding s validací;
- implementovat preset defaulty a reset;
- ukládat stav parametrů v project store.

### Epic 5 — Palety a vizuální identita

**US-007: Jako producent chci změnit barvy vizualizace**

Akceptace:
- jsou dostupné minimálně čtyři předpřipravené palety;
- paleta mění pozadí, hlavní efekt i akcent;
- kontrast textů a ovládání zůstane čitelný;
- preview nepůsobí jako rozbitý layout při dlouhých názvech palet.

Úkoly:
- definovat palette schema;
- vytvořit PalettePicker;
- napojit palety na všechny čtyři scény;
- doplnit kontrastní kontrolu pro UI tokeny;
- ověřit dark mode jako výchozí a případný light mode jako pozdější rozšíření.

### Epic 6 — Formátové profily a preview

**US-008: Jako producent chci připravit vizualizaci pro různé platformy**

Akceptace:
- 18:9 je dostupný jako vlastní preset;
- existuje široký, vertikální a feed preset;
- scéna používá logical canvas a správně se přepočítá;
- při přepnutí formátu se neztratí scéna, paleta ani playback;
- preview jasně ukazuje aktivní poměr stran.

Úkoly:
- definovat `ExportProfile` a `CanvasProfile` typy;
- implementovat profil picker;
- implementovat resize pipeline s device pixel ratio;
- přidat safe-area/padding pravidla pro budoucí text/logo overlay;
- otestovat přepínání profilů během přehrávání.

### Epic 7 — Lokální projektový stav a odolnost

**US-009: Jako producent nechci po běžné chybě přijít o nastavení**

Akceptace:
- změna scény/palety/parametrů se projeví konzistentně;
- při refreshi je chování jasně popsáno, pokud MP3 nelze obnovit;
- aplikace nikdy tiše nepoužije staré nebo prázdné nastavení;
- chyba rendereru nabídne reload/reset akci.

Úkoly:
- definovat persistovaný project schema;
- rozhodnout localStorage versus IndexedDB pro MVP;
- implementovat verzi schema a migraci nebo explicitní invalidaci;
- přidat ErrorBoundary a renderer recovery;
- přidat loading/empty/error stavy.

### Epic 8 — Exportní seam a technický spike

**US-010: Jako tým chceme ověřit, že náhled lze později exportovat**

Akceptace:
- renderer lze spustit se stejným profilem mimo běžný UI layout;
- audio a video clock mají definovaný zdroj pravdy;
- je zdokumentováno, které MIME typy jsou dostupné v ověřeném browseru;
- případné selhání exportu je explicitní, bez tichého fallbacku.

Úkoly:
- navrhnout `ExportAdapter` rozhraní;
- provést krátký `canvas.captureStream` + MediaRecorder spike;
- otestovat audio/video track combination;
- dokumentovat WebM/local export boundary;
- připravit rozhodnutí pro serverový FFmpeg export.

Tento epic není podmínkou pro dokončení vizualizačního MVP, ale je podmínkou pro to, aby se později nemusel renderer přepisovat.

### Epic 10 — Private Tailscale Web Delivery

**US-012: Jako provozovatel chci webovou aplikaci dostupnou přes privátní Tailscale tunnel**

Akceptace:
- aplikace má zdokumentovaný bind address, port, SPA fallback a statické assety;
- povolené zařízení v tailnetu otevře aplikaci přes Tailscale hostname/Serve target;
- veřejná URL není pro MVP nutná;
- lokální MP3 zůstává v prohlížeči;
- přístupová a síťová tvrzení jsou označena PASS/OPEN podle skutečného testu.

Úkoly:
- definovat web serving contract pro Tailscale target;
- nakonfigurovat production/static serving;
- provést browser smoke přes Tailscale hostname.

**US-013: Jako provozovatel chci opakovatelný a pozorovatelný Tailscale deployment**

Akceptace:
- existuje runbook pro build, start, Tailscale Serve/tunnel, hostname, port a health check;
- startup log neobsahuje secrets a health/readiness odpověď je jednoznačná;
- existuje restart/rollback postup bez poškození nesouvisející konfigurace.

Úkoly:
- sepsat private deployment runbook a environment contract;
- přidat health/readiness endpoint a startup diagnostics;
- definovat restart, rollback a bezpečnou změnu konfigurace.

**US-014: Jako tým chceme ověřit privátní access boundary a failure modes**

Akceptace:
- autorizované zařízení v tailnetu aplikaci otevře;
- nechtěné veřejné vystavení je ověřeno nebo zůstává explicitně OPEN;
- ACL/firewall předpoklady jsou zdokumentované;
- výpadek Tailscale, aplikace nebo health checku má akční diagnostiku.

Úkoly:
- ověřit access z autorizovaného zařízení a browser behavior;
- ověřit nechtěné public exposure a zdokumentovat ACL assumptions;
- zapsat tunnel/app failure diagnostics a release gate.

Tento Epic je součástí cílového deploymentu webové aplikace, ale jeho PASS vyžaduje skutečné Tailscale zařízení, hostname a síťový/browser test.

### Epic 9 — QA, výkon a release gate

**US-011: Jako uživatel chci plynulý a srozumitelný nástroj**

Akceptace:
- build, typecheck a lint jsou zelené;
- každá scéna má ověřený lifecycle;
- audio chyby jsou reprodukovatelné a akční;
- žádný render loop neaktualizuje React stav na každý frame;
- běžný MP3 náhled je použitelný na desktopu i mobilním viewportu;
- aplikace nepředstírá hotový export, pokud není skutečně ověřený.

Úkoly:
- unit testy audio normalizace a project store;
- component testy uploaderu a inspectoru;
- browser smoke test nahrání → play → změna scény → změna palety;
- performance profilování render loopu;
- accessibility kontrola klávesnice, focusu, kontrastu a labelů;
- build artifact a release checklist.

## Doporučené pořadí implementace

1. Založit projekt a ověřit toolchain.
2. Vytvořit design system a editor shell s prázdným preview.
3. Přidat lokální MP3 uploader.
4. Přidat playback a lifecycle AudioContext.
5. Přidat normalizovaný AudioFrame.
6. Implementovat scene registry a první Spectrum scénu.
7. Přidat další tři scény.
8. Přidat inspector, palety a reset/defaulty.
9. Přidat formátové profily včetně 18:9.
10. Přidat persistenci a chybové stavy.
11. Provést exportní spike bez slibu produkčního MP4.
12. Připravit web serving a Tailscale deployment contract.
13. Provést skutečný Tailscale access/public-boundary smoke test.
14. Provést QA, výkonovou kontrolu a připravit demo MVP.

## Verification gates

### Gate A — Toolchain

- čistý install dependency;
- typecheck PASS;
- lint PASS;
- test runner se spustí;
- production build PASS.

### Gate B — Audio

- MP3 se načte lokálně;
- play/pause/seek funguje;
- neplatný soubor vrací jasnou chybu;
- AudioContext se aktivuje pouze po user gesture;
- object URL se při výměně/reloadu uklízí.

### Gate C — Renderer

- Spectrum reaguje na audio;
- scény se přepínají bez ztráty audio stavu;
- resize a profily fungují;
- žádný React state update není napojený přímo na každý frame.

### Gate D — UX

- producent pochopí první krok bez dokumentace;
- ovládací panely jsou čitelné ve glassmorphism stylu;
- mobile viewport nezpůsobí nepoužitelný inspector;
- empty/loading/error stavy jsou hotové.

### Gate E — MVP release

- build a testy PASS;
- manuální browser smoke PASS;
- výkonová kontrola zdokumentována;
- export označen jako OPEN/PARTIAL, pokud nebyl skutečně ověřen;
- žádné tvrzení o MP4 nebo podpoře všech platforem bez fyzického ověření.

## Rizika a rozhodnutí

1. **18:9 versus sociální sítě:** 18:9 je vlastní preset, nikoli univerzální výstup. Neuzamknout renderer na jednu velikost.
2. **WebGL výkon:** blur, částice a vysoký device pixel ratio mohou přetížit mobil. Přidat quality scale a rozumný fallback pouze jako explicitní volbu, ne tichý downgrade.
3. **Audio synchronizace:** preview clock a budoucí export clock musí mít popsaný zdroj pravdy.
4. **MP4 export:** browser-only cesta nemusí dát konzistentní MP4. Produkční cesta bude pravděpodobně FFmpeg worker.
5. **Persistence MP3:** project settings lze uložit, samotný File object ne. MVP musí jasně říct, co po refreshi zůstane.
6. **Glassmorphism:** backdrop blur držet jen na panelech; jinak hrozí náklady na GPU a ztráta kontrastu.
7. **Scope:** nejdříve ověřit kvalitu čtyř scén, ne množství funkcí.

## Aktuální stav a blokace

- lokální pracovní kořen `/home/jolanda/Projekty` existuje;
- pracovní složka tohoto projektu je `/home/jolanda/Projekty/audio-visualizer-studio`;
- Taiga MCP server je připojený přes izolované SDK a fresh readback vrací projekt 19;
- Taiga graph je zapsaný a ověřený: 5 Wiki, 5 links, 3 Epics, 11 Stories a 37 Tasks;
- Epic 38 / ref 39 `Private Tailscale Web Delivery` má Stories 1129–1131 a Tasks 400–408;
- project description a všech 5 Wiki stránek obsahují Tailscale deployment objective;
- Tailscale deployment je zatím plánovací stream: skutečný hostname, autorizované zařízení, browser/network smoke, public-boundary check a health/restart evidence jsou OPEN/NOT RUN;
- zdrojová implementace, package manifest, testy a production build ještě neexistují;
- další implementační krok je Taiga Task ref 11, poté se deployment Tasks vykonávají nad skutečným webovým buildem.

## První implementační krok po odblokování Taigy

Vytvořit základní React/TypeScript/Vite toolchain a prázdný editor shell. Nezačínat shadery ani exportem. Nejprve musí existovat ověřená aplikace s testovatelným layoutem, design tokeny a jasným audio upload flow.
