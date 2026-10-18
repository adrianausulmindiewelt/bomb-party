// Kartenspiel „TOPP DAS!“ – Regeln, Effekt-Baukasten und Charakterkarten.
// Diese Datei laden Server UND Browser. Hier passt ihr das Spiel an.

export const CARD_BRAND = {
  title: 'Club Bombe Spiel',
  tagline: 'Leg höher. Oder friss den Stapel.',
};

export const RULES = {
  handSize: 10,          // Karten pro Kopf
  specialsStart: 2,      // Spezialkarten zum Spielstart
  minValue: 1,
  maxValue: 15,
  colors: ['#ff3d7f', '#3dc6ff', '#ffd23d', '#5cff8a'],
  equalAllowed: true,    // darf man die gleiche Zahl legen?
  resonanceTolerance: 2, // Farb-Resonanz: gleiche Farbe auf gleiche Farbe darf um bis zu 2 Punkte unterbieten
  maxPlayers: 8,
  introSeconds: 6,       // so lange laufen Rollen- und Karten-Animation am Anfang
  awaySkipSeconds: 15,   // wer die Verbindung verliert und dran ist, wird danach übersprungen
  awayKickSeconds: 120,  // … und nach so langer Abwesenheit ganz rausgenommen
};

// Die 4 Elemente der Kartenfarben (optische Gestaltung & Resonanz-Zuordnung)
export const COLOR_ELEMENTS = {
  '#ff3d7f': { name: 'Feuer', element: 'fire', icon: '🔥', gem: 'Rubin', label: 'Rubin-Feuer' },
  '#3dc6ff': { name: 'Eis', element: 'ice', icon: '❄️', gem: 'Saphir', label: 'Saphir-Eis' },
  '#ffd23d': { name: 'Blitz', element: 'lightning', icon: '⚡', gem: 'Topas', label: 'Topas-Blitz' },
  '#5cff8a': { name: 'Natur', element: 'nature', icon: '🌿', gem: 'Smaragd', label: 'Smaragd-Natur' },
};
export const COLOR_RESONANCE_TOLERANCE = 2;

// ─────────────────────────────────────────────────────────────
// EFFEKT-BAUKASTEN
// Jede Special-Karte besteht aus 1–2 dieser Effekte. Mehr gibt es nicht.
// So bleibt alles „innerhalb der Grenzen“: nichts Unendliches, kein Sofort-Verlieren.
// n: [min, max] = erlaubter Zahlenbereich · targets: wen es treffen darf
// ─────────────────────────────────────────────────────────────
export const TARGETS = {
  next:   'die nächste Person',
  prev:   'die vorherige Person',
  random: 'eine zufällige Person',
  fewest: 'wer am wenigsten Karten hat',
  most:   'wer am meisten Karten hat',
  all:    'alle anderen',
};

export const EFFECTS = {
  reset:    { label: '🔄 Reset',            text: () => 'Stapel zählt wieder ab 0' },
  burn:     { label: '🔥 Feuer',            text: () => 'Stapel verbrennen' },
  lower:    { label: '⬇️ Unter',            text: () => 'Nächste*r muss niedriger legen' },
  reverse:  { label: '🔁 Richtungswechsel', text: () => 'Spielrichtung umdrehen' },
  again:    { label: '⚡ Nochmal',          text: () => 'Du bist nochmal dran' },
  boss:     { label: '👑 Boss',             text: () => 'Zählt als 16 – die höchste Karte' },
  rotate:   { label: '🌀 Karussell',        text: () => 'Alle geben 1 Karte weiter' },
  skip:     { label: '⏭️ Aussetzen', n: [1, 2], text: (e) => `${e.n} Person${e.n > 1 ? 'en' : ''} aussetzen` },
  give:     { label: '🎁 Abgeben',   n: [1, 3], targets: ['next', 'prev', 'random', 'fewest', 'most'],
              text: (e) => `Gib ${e.n} Karte${e.n > 1 ? 'n' : ''} an ${TARGETS[e.target]}` },
  draw:     { label: '📥 Ziehen lassen', n: [1, 3], targets: Object.keys(TARGETS),
              text: (e) => `${cap(TARGETS[e.target])} ${e.target === 'all' ? 'ziehen' : 'zieht'} ${e.n}` },
  takePile: { label: '🗑️ Stapel kassieren', targets: ['next', 'prev', 'random', 'fewest', 'most'],
              text: (e) => `${cap(TARGETS[e.target])} nimmt den Stapel` },
  swap:     { label: '🃏 Hand tauschen', targets: ['next', 'prev', 'random', 'fewest', 'most'],
              text: (e) => `Tausche deine Hand mit ${TARGETS[e.target]}` },
};
export const MAX_EFFECTS_PER_CARD = 2;

// Standard-Specials – liegen zusammen mit allen anderen Specials im Los-Topf (1 pro Person)
export const BASIC_SPECIALS = {
  reset:   { name: 'Reset',  emoji: '🔄', effects: [{ type: 'reset' }] },
  burn:    { name: 'Feuer',  emoji: '🔥', effects: [{ type: 'burn' }, { type: 'again' }] },
  lower:   { name: 'Unter',  emoji: '⬇️', effects: [{ type: 'lower' }] },
  reverse: { name: 'Wende',  emoji: '🔁', effects: [{ type: 'reverse' }] },
  skip:    { name: 'Stopp',  emoji: '⏭️', effects: [{ type: 'skip', n: 1 }] },
  // Von Spieler*innen gestaltet (Bild in public/karten/art/) – fullArt = Bild füllt die ganze Karte
  joker:   { name: 'Joker',  emoji: '🃏', effects: [{ type: 'again' }], art: '/karten/art/joker.jpg', fullArt: true },
};

// ─────────────────────────────────────────────────────────────
// CHARAKTERKARTEN – jede gibt es einmal im Deck.
// ⚠️ Die Fähigkeiten sind PLATZHALTER. Jede Person denkt sich ihre selbst aus!
// Bild: fertige Karten-Designs nach public/karten/art/<key>.jpg + art/fullArt eintragen,
// oder schnell im Browser unter /karten/editor.html hochladen.
// ─────────────────────────────────────────────────────────────
export const CHARACTERS = {
  adrian: { name: 'Adrian', title: 'Der Chef / Gildenleiter', emoji: '👔',
            effects: [{ type: 'reset' }, { type: 'again' }] },
  ayleen: { name: 'Ayleen', title: 'Die Tauschbörse',  emoji: '💱',
            effects: [{ type: 'swap', target: 'fewest' }] },
  louis:  { name: 'Luis',   title: 'Der Dreizack (Pilzi)', emoji: '🔱', art: '/karten/art/louis.jpg', fullArt: true,
            effects: [{ type: 'give', n: 3, target: 'next' }] },
  bernd:  { name: 'Bernd',  title: 'Der Lieferdienst', emoji: '🚚',
            effects: [{ type: 'takePile', target: 'next' }] },
  niclas: { name: 'Niclas', title: 'Der Turbo',        emoji: '🏎️',
            effects: [{ type: 'skip', n: 2 }] },
  andre:  { name: 'André',  title: 'Souveränin des Äthers', emoji: '⚔️', art: '/karten/art/andre.jpg', fullArt: true,
            effects: [{ type: 'reset' }, { type: 'draw', n: 1, target: 'all' }] },
  ruben:  { name: 'Ruben',  title: 'Das Feuerwerk',    emoji: '🎆',
            effects: [{ type: 'burn' }, { type: 'give', n: 1, target: 'random' }] },
  floris: { name: 'Flo',    title: 'Automations-Pipeline (Kernelflow)', emoji: '⚙️',
            effects: [{ type: 'boss' }, { type: 'skip', n: 1 }] },
  jonas:  { name: 'Jonas',  title: 'Der Spielleiter / P&P-Meister', emoji: '📜',
            effects: [{ type: 'reverse' }, { type: 'swap', target: 'most' }] },
  maxime: { name: 'Maxime', title: 'Wien-Berlin Express', emoji: '🚄',
            effects: [{ type: 'skip', n: 1 }, { type: 'draw', n: 2, target: 'next' }] },
};

// Aliasse für Abwärtskompatibilität und Tippfehler-Resilienz
CHARACTERS.aylen = CHARACTERS.ayleen;
CHARACTERS.luis = CHARACTERS.louis;

// ─────────────────────────────────────────────────────────────
// ROLLEN – zu Spielbeginn zufällig verteilt, für alle sichtbar.
// cards: wie viele Karten mehr (+) oder weniger (−) als normal
// weight: wie häufig (höher = öfter) · Die Rolle sieht nur man selbst – bis zum Spielende
// ─────────────────────────────────────────────────────────────
export const ROLES = {
  dorfdepp:  { name: 'Dorfdepp',    emoji: '🤪', cards: +2, weight: 3, ability: 'fool', text: 'Startet mit +2 Karten. Bauernschläue: Muss er den Stapel fressen, nimmt er maximal 3 – der Rest verbrennt!' },
  pechvogel: { name: 'Pechvogel',   emoji: '🐦‍⬛', cards: +1, weight: 4, ability: 'unlucky', text: 'Startet mit +1 Karte. Geteiltes Pech: Zwingt dich jemand zum Ziehen, zieht der Angreifer 1 Karte mit.' },
  buerger:   { name: 'Bürger*in',   emoji: '🧑', cards: 0,  weight: 5, ability: 'citizen', text: 'Ganz normal: 10 Karten, keine Sonderfähigkeit. Solide Mitte.' },
  held:      { name: 'Held*in',     emoji: '🦸', cards: -1, weight: 3, ability: 'hero', text: 'Startet mit -1 Karte. Heldenmut: Hast du nur noch 1 oder 2 Karten, darfst du jede beliebige Zahl legen!' },
  junggott:  { name: 'Junger Gott', emoji: '⚡', cards: -2, weight: 2, ability: 'demigod', text: 'Startet mit -2 Karten. Himmelsblitz: Darf nach dem Legen einer Spezialkarte sofort eine passende Zahlenkarte nachlegen (Extra-Zug)!' },
  gott:      { name: 'Gott',        emoji: '☀️', cards: -3, weight: 1, ability: 'god', text: 'Startet mit -3 Karten. Göttliche Majestät: Vollständig immun gegen Hand-Tausch und Stapel-Kassieren! Gezielte Zieh-Angriffe prallen ab und treffen den Angreifer.' },
  alchemist: { name: 'Alchemist',   emoji: '🧪', cards: 0,  weight: 4, ability: 'alchemist', text: 'Transmutation: Legst du zwei gleiche Zahlenkarten, wird deine niedrigste Karte automatisch kostenlos mit verbrannt!' },
  spion:     { name: 'Spion',       emoji: '🕵️‍♂️', cards: 0,  weight: 3, ability: 'spy', text: 'Geheimdienst: Sieht als Einziger am Tisch die geheimen Rollen aller anderen Spieler*innen!' },
  berserker: { name: 'Berserker',   emoji: '🪓', cards: +1, weight: 3, ability: 'berserk', text: 'Blutrausch: Muss er den Stapel nehmen, zerhackt er ihn: Die Hälfte verbrennt, nur der Rest landet auf der Hand!' },
  pazifist:  { name: 'Pazifist',    emoji: '🕊️', cards: -1, weight: 3, ability: 'pacifist', text: 'Diplomatischer Schutz: Solange du mehr als 3 Karten hast, prallen alle gezielten Zieh- und Tauschangriffe an dir ab.' },
  magier:    { name: 'Erzmagier',   emoji: '🧙‍♂️', cards: -1, weight: 3, ability: 'mage', text: 'Arkane Schatzkammer: Startet mit 3 Spezialkarten (statt 2)! Meister der arkanen Künste.' },
  nekromant: { name: 'Nekromant',   emoji: '💀', cards: 0,  weight: 3, ability: 'necromancer', text: 'Seelen-Opfer: Verbrennt ein Stapel oder eine Karte (Burn/Loch/Phönix/Ruben), erntet er die Seelen und opfert 1 eigene Handkarte kostenlos!' },
  gluecksspieler: { name: 'Glücksspieler', emoji: '🎲', cards: 0, weight: 3, ability: 'gambler', text: 'Gezinkte Würfel: Darf jede ungerade Zahl auf eine gerade Zahl legen (und umgekehrt), völlig ungeachtet des Werts!' },
};

// ─────────────────────────────────────────────────────────────
// KARTEN VON SPIELER*INNEN mit eigenen Regeln.
// Die Logik dazu steht in server/cards/game.js (Suche nach „ability“).
// needs: welche Auswahl man beim Ausspielen trifft – 'target' (eine Person), 'colors2' (zwei Farben)
// ─────────────────────────────────────────────────────────────
export const PLAYER_CARDS = {
  kartoffel: {
    name: 'Heiße Kartoffel', emoji: '🥔', ability: 'potato', needs: 'target',
    text: 'Kann nicht abgelegt, nur weitergereicht werden (nie zurück an die Person, von der du sie hast). '
      + 'Wer sie bekommt, zieht 3. Wer sie hält, ist immun gegen Tausch, zieht aber bei Zieh-Effekten das Dreifache. '
      + 'Ist sie deine letzte Karte: Du gewinnst, alle anderen ziehen 3.',
  },
  zwillinge: {
    name: 'Zwillings-Parade', title: 'Blick der zwei Welten', emoji: '♊', by: 'NoRevanell Morningstar', ability: 'twins', needs: 'colors2',
    text: 'Aktiv: Wähle 2 Farben – bis du wieder dran bist, passen sie auf jede Karte. '
      + 'Sphäre: Solange sie oben liegt, darf man auch 1 drunter legen. '
      + 'Passiv: Sollst du ziehen, wird sie automatisch abgeworfen – je die Hälfte ziehen deine beiden Sitznachbar*innen.',
  },
  aegis: {
    name: 'Aegis der Nullifizierung', title: 'Goldener Schutzschild', emoji: '🛡️', by: 'NoRevanell Morningstar', ability: 'aegis',
    text: 'Passiv (aus der Hand): Wann immer dich ein negativer Effekt treffen würde (Zieh-Strafen, Stapel kassieren, Hand-Tausch, Aussetzen), wird die Aegis automatisch abgeworfen und der Effekt vollständig annulliert.',
  },
  spiegel: {
    name: 'Prismatischer Spiegel', title: 'Echo der Realität', emoji: '🪞', by: 'NoRevanell Morningstar', ability: 'mirror',
    text: 'Passiv (aus der Hand): Zwingt dich jemand zum Ziehen, wirfst du den Spiegel ab: Du ziehst zwar, aber der Angreifer MUSS dieselbe Anzahl an Karten ebenfalls ziehen!',
  },
  schwarzes_loch: {
    name: 'Schwarzes Loch', title: 'Singularität', emoji: '🕳️', by: 'NoRevanell Morningstar', ability: 'blackHole',
    text: 'Aktiv: Verschlingt und verbrennt den gesamten Ablagestapel (Tisch wird auf 0 gereinigt). Alle anderen Spieler*innen müssen sofort 1 zufällige Handkarte an das Loch opfern!',
  },
  zeitstopp: {
    name: 'Chronos-Siegel', title: 'Herr der Zeit', emoji: '⏳', by: 'NoRevanell Morningstar', ability: 'timestop',
    text: 'Aktiv: Friere die Zeit ein! Du bist sofort noch einmal dran und darfst eine beliebige Karte legen (Tisch-Zahl wird ignoriert).',
  },
  dieb: {
    name: 'Meisterdieb', title: 'Schatten-Griff', emoji: '🥷', by: 'NoRevanell Morningstar', ability: 'thief', needs: 'target',
    text: 'Aktiv: Wähle eine Person. Stiehl verdeckt 1 zufällige Karte aus ihrer Hand und nimm sie auf deine eigene Hand.',
  },
  gluecklich: {
    name: 'Glücklicher Schelm', title: 'Wer zuletzt lacht', emoji: '😆', by: 'Luis/Pilzi', ability: 'luckyJester',
    text: 'Passiv: Spielt jemand gezielt eine Karte gegen dich, fliegt der ganze Effekt automatisch zurück (nicht bei Effekten gegen alle). '
      + 'Zusammen mit dem Traurigen Schelm legbar: „Lachen und Weinen“.',
  },
  traurig: {
    name: 'Trauriger Schelm', title: 'Geteiltes Leid', emoji: '😢', by: 'Luis/Pilzi', ability: 'sadJester', needs: 'target',
    text: 'Wähle jemanden: zieht so viele Karten, wie du danach noch auf der Hand hast. '
      + 'Zusammen mit dem Glücklichen Schelm legbar: „Lachen und Weinen“.',
  },
  gluecksspiel: {
    name: 'Kriege 4 oder verliere 4', emoji: '🪙', ability: 'gamble',
    text: 'Münzwurf: Entweder du ziehst 4 Karten – oder du wirst 4 Karten los. 50 : 50.',
  },
  portal: {
    name: 'Dimensionsportal', title: 'Riss im Raumzeitgefüge', emoji: '🌀', by: 'NoRevanell Morningstar', ability: 'portal',
    text: 'Aktiv: Öffnet ein Portal in die Tiefen des Decks: Ziehe sofort die nächste Spezialkarte direkt auf die Hand (oder 2 normale Karten, falls keine mehr da ist).',
  },
  phoenix: {
    name: 'Phönix-Asche', title: 'Wiedergeburt aus Flammen', emoji: '🐦‍🔥', by: 'NoRevanell Morningstar', ability: 'phoenix',
    text: 'Passiv (aus der Hand): Musst du den Stapel kassieren, verbrennt der gesamte Stapel stattdessen zu Asche! Du wirfst den Phönix ab und ziehst 1 frische Karte vom Deck.',
  },
  himmelszorn: {
    name: 'Göttlicher Blitz', title: 'Zorn des Pantheons', emoji: '⚡', by: 'NoRevanell Morningstar', ability: 'divineWrath', needs: 'target',
    text: 'Aktiv: Wähle eine Person. Sie wird vom Blitz getroffen: Besitzt sie Spezialkarten, verbrennt eine davon im Stapel – andernfalls muss sie 2 Karten ziehen!',
  },
  zeitschleife: {
    name: 'Ouroboros', title: 'Ewige Zeitschleife', emoji: '♾️', by: 'NoRevanell Morningstar', ability: 'timeloop',
    text: 'Aktiv: Greife in den Ablagestapel und hole die zuletzt gespielte Spezialkarte zurück auf deine eigene Hand.',
  },
  erdbeben: {
    name: 'Tektonischer Schock', title: 'Erdebrecher', emoji: '🌋', by: 'NoRevanell Morningstar', ability: 'earthquake',
    text: 'Aktiv: Erschüttert das Spielbrett! Der Tisch wird auf 0 bereinigt und alle Spieler*innen mit mehr als 5 Karten müssen 1 Handkarte abwerfen.',
  },
  kettenfluch: {
    name: 'Kettenfluch', title: 'Fesseln des Äthers', emoji: '⛓️', by: 'NoRevanell Morningstar', ability: 'chainCurse', needs: 'target',
    text: 'Aktiv: Wähle eine Person. Magische Ketten umschlingen sie: Sie muss sofort 2 Strafkarten vom Ziehstapel ziehen!',
  },
  pizza_hunger: {
    name: 'Pizza-Raid', title: 'Jung & Hungrig', emoji: '🍕', by: 'Jung & Hungrig Club', ability: 'pizzaRaid',
    text: 'Aktiv: Jemand hat Pizza bestellt! Der Tisch wird auf 0 bereinigt. Alle Spieler*innen mit mehr als 3 Karten werfen sofort 1 Handkarte als Bezahlung auf den Stapel ab.',
  },
  dzana_zen: {
    name: 'Džanas Zen-Gong', title: 'Chaotic Good Vibes', emoji: '🧘‍♀️', by: 'Džana vWbB', ability: 'zenBuff', needs: 'target',
    text: 'Aktiv: Wähle jemanden. Nimmt den mentalen Druck komplett raus: Die Person wirft 2 Handkarten kostenlos ab – aber der Stapel wird auf 15 („Boss“) gesetzt!',
  },
  fee_trick: {
    name: 'Feen-Streich', title: 'Queen of Fairies', emoji: '🧚‍♀️', by: 'Fay (Queen of Fairies)', ability: 'fairyTrick', needs: 'target',
    text: 'Aktiv: Wähle ein Ziel. Die Feen vertauschen die Vorzeichen: Stiehl 1 Spezialkarte aus ihrer Hand – hat sie keine, muss sie 2 Strafkarten ziehen!',
  },
  andre_mentor: {
    name: 'Sanctuary-Protokoll', title: 'Der Gruppenleiter (André)', emoji: '🏛️', by: 'André (Gruppenleiter)', ability: 'sanctuary',
    text: 'Aktiv: Baut einen Safe Space auf! Der Tisch wird auf 0 gereinigt. Die Person am Tisch mit den MEISTEN Handkarten darf sofort 2 Karten kostenlos abwerfen (Aufbau-Hilfe).',
  },
  adrian_muster: {
    name: 'Die Musterlösung', title: 'Chef-Dekret (Adrian)', emoji: '📋', by: 'Adrian (Chef & Gildenleiter)', ability: 'masterSolution',
    text: 'Aktiv: „Herr Adrian hat gesprochen!“ Der Tisch wird auf 0 gereinigt und du bist sofort noch einmal dran. Alle anderen mit mehr als 3 Handkarten ziehen 1 Karte (Musterlösung nicht vorbereitet!).',
  },
  cookie_chaos: {
    name: 'Der Cookie-Crunch', title: 'Musterbrecherin (Cookie)', emoji: '🍪', by: 'Cookie (Amelie)', ability: 'cookieCrunch',
    text: 'Aktiv: Cookie stiftet herrliches Chaos! Die Spielrichtung wird sofort invertiert, alle reichen 1 Handkarte nach links weiter und der Tischwert wird unberechenbar neu ausgewürfelt (1–15).',
  },
  teya_scribbl: {
    name: 'Scribbl-Meisterwerk', title: 'Nachwuchs-Talent (Teya)', emoji: '🎨', by: 'Teya (12)', ability: 'teyaScribbl',
    text: 'Aktiv: Bunte Farbenpracht! Der Tisch wird auf 0 gesetzt und alle Farbregeln werden für diese Runde ignoriert. Passiv (aus der Hand): Gankoomon-Schutz – wird sie angegriffen, fängt die Person mit den meisten Karten am Tisch den Schaden ab!',
  },
  ayleen_observer: {
    name: 'Stille Beobachterin', title: 'Workshop-Fokus (Ayleen)', emoji: '👀', by: 'Ayleen (13)', ability: 'ayleenObserver',
    text: 'Aktiv: Ayleen nutzt die Verwirrung der Älteren! Der Tischstapel wird um 5 Punkte gesenkt (mind. 1) und sie darf sofort 1 Handkarte unbemerkt mit ablegen.',
  },
  niclas_turbo: {
    name: 'Turbo-Abreise', title: 'Der Turbo (Niclas)', emoji: '🏎️', by: 'Niclas', ability: 'turboDash',
    text: 'Aktiv: Niclas ist schon im Flugzeug! Überspringt sofort die nächsten 2 Personen am Tisch. Wer überholt wird, muss 1 Strafkarte ziehen (zu langsam!).',
  },
  ruben_firework: {
    name: 'Pyrotechnik-Knall', title: 'Das Feuerwerk (Ruben)', emoji: '🎆', by: 'Ruben', ability: 'fireworkBlast',
    text: 'Aktiv: Zündet das große Club-Feuerwerk! Der Tischstapel detoniert vollständig (verbrennt auf 0). Alle Spieler*innen am Tisch müssen gleichzeitig ihre höchste Zahlenkarte verbrennen!',
  },
  igel: {
    name: 'Igel der Blätter', title: 'Raschelndes Laub (Shaymin)', emoji: '🦔', by: 'NoRevanell Morningstar',
    effects: [{ type: 'again' }, { type: 'draw', n: 2, target: 'next' }],
    art: '/karten/art/igel.svg', fullArt: true,
    text: 'Aktiv: Raschelndes Laub! Du bist sofort noch einmal dran und legst noch ein Blatt ab. Die nächste Person am Tisch muss 2 Strafkarten ziehen.',
  },
};
export const JESTER_COMBO = {
  name: 'Lachen und Weinen',
  text: 'Beide Schelme zusammen: Person 1 mischt ihre ganze Hand in den Ziehstapel und zieht gleich viele neu. Person 2 zieht 3.',
};

// ─────────────────────────────────────────────────────────────
// KURZ ERKLÄRT – so steht es auf der Karte und in der Kartenauswahl.
// Ein Satz, was wirklich passiert. Der lange Originaltext bleibt im Almanach.
// Neue Club-Karte? Hier bitte auch eine Kurz-Erklärung eintragen.
// ─────────────────────────────────────────────────────────────
const CARD_SHORT = {
  kartoffel:       'Gib sie an jemanden weiter – die Person zieht 3. Ist sie deine letzte Karte, gewinnst du.',
  zwillinge:       'Wähle 2 Farben: Bis du wieder dran bist, passen sie auf jede Karte.',
  aegis:           'Bleibt auf der Hand und blockt automatisch den nächsten Angriff gegen dich.',
  spiegel:         'Bleibt auf der Hand: Lässt dich jemand ziehen, zieht er dieselbe Anzahl mit.',
  schwarzes_loch:  'Stapel verbrennt. Alle anderen verlieren 1 zufällige Karte.',
  zeitstopp:       'Stapel auf 0 – du bist sofort nochmal dran und darfst alles legen.',
  dieb:            'Klau 1 zufällige Karte von einer Person deiner Wahl.',
  gluecklich:      'Bleibt auf der Hand: Der nächste gezielte Angriff gegen dich fliegt zurück.',
  traurig:         'Eine Person deiner Wahl zieht so viele Karten, wie du noch hast.',
  gluecksspiel:    'Münzwurf: Du ziehst 4 Karten – oder wirst 4 los.',
  portal:          'Hol dir die nächste Spezialkarte aus dem Stapel auf die Hand.',
  phoenix:         'Bleibt auf der Hand: Musst du den Stapel nehmen, verbrennt er stattdessen.',
  himmelszorn:     'Ziel verliert 1 Spezialkarte – hat es keine, zieht es 2.',
  zeitschleife:    'Hol die zuletzt gespielte Spezialkarte zurück auf deine Hand.',
  erdbeben:        'Stapel auf 0. Wer mehr als 5 Karten hat, verliert 1.',
  kettenfluch:     'Eine Person deiner Wahl zieht 2 Karten.',
  pizza_hunger:    'Stapel auf 0. Wer mehr als 3 Karten hat, wirft 1 ab.',
  dzana_zen:       'Eine Person wirft 2 Karten ab – dafür steht der Stapel auf 15.',
  fee_trick:       'Klau einer Person 1 Spezialkarte – hat sie keine, zieht sie 2.',
  andre_mentor:    'Stapel auf 0. Wer die meisten Karten hat, wirft 2 ab.',
  adrian_muster:   'Stapel auf 0, du bist nochmal dran. Alle anderen mit mehr als 3 Karten ziehen 1.',
  cookie_chaos:    'Richtung dreht sich, alle geben 1 Karte weiter, der Stapel bekommt einen Zufallswert.',
  teya_scribbl:    'Stapel auf 0 und Farben egal, bis du wieder dran bist.',
  ayleen_observer: 'Stapel sinkt um 5 und du wirst 1 zufällige Karte los.',
  niclas_turbo:    'Die nächsten 2 Personen setzen aus und ziehen je 1.',
  ruben_firework:  'Stapel verbrennt. Alle verlieren ihre höchste Zahlenkarte.',
  igel:            'Du bist nochmal dran und legst ein Blatt ab – die nächste Person zieht 2 Karten.',
};
for (const [k, short] of Object.entries(CARD_SHORT)) if (PLAYER_CARDS[k]) PLAYER_CARDS[k].short = short;

const ROLE_SHORT = {
  dorfdepp:       '+2 Karten. Musst du den Stapel nehmen, nimmst du nur 3 – der Rest verbrennt.',
  pechvogel:      '+1 Karte. Lässt dich jemand ziehen, zieht er 1 mit.',
  buerger:        'Normale Hand, keine Sonderfähigkeit.',
  held:           '−1 Karte. Mit nur noch 1–2 Karten darfst du jede Zahl legen.',
  junggott:       '−2 Karten. Nach jeder Spezialkarte bist du nochmal dran.',
  gott:           '−3 Karten. Immun gegen Tauschen und Stapel-Kassieren, Zieh-Angriffe prallen zurück.',
  alchemist:      'Legst du ein Pärchen, wirst du zusätzlich deine niedrigste Karte los.',
  spion:          'Du siehst die geheimen Rollen aller anderen.',
  berserker:      '+1 Karte. Musst du den Stapel nehmen, verbrennt die Hälfte davon.',
  pazifist:       '−1 Karte. Solange du mehr als 3 Karten hast, prallen Zieh- und Tausch-Angriffe ab.',
  magier:         '−1 Karte. Du startest mit 3 Spezialkarten statt 2.',
  nekromant:      'Verbrennt ein Stapel, wirst du 1 eigene Karte los.',
  gluecksspieler: 'Du darfst ungerade auf gerade legen (und umgekehrt), egal wie hoch.',
};
for (const [k, short] of Object.entries(ROLE_SHORT)) if (ROLES[k]) ROLES[k].short = short;

// ─────────────────────────────────────────────────────────────
// ANSAGEN – eine KI-Stimme erklärt allen kurz und witzig, was gerade passiert.
// Die Audiodateien liegen in public/karten/voice/<key>.mp3 und werden mit
// `GEMINI_API_KEY=… npm run voices` erzeugt (nur neue oder geänderte Sätze).
// Fehlt eine Datei, spricht der Browser den Satz selbst.
// ─────────────────────────────────────────────────────────────
export const VOICE_LINES = {
  // Grundkarten
  reset:   'Reset! Der Stapel vergisst alles und fängt bei null an. Jetzt geht jede Karte.',
  burn:    'Feuer! Der ganze Stapel geht in Flammen auf – und wer gezündelt hat, ist gleich nochmal dran.',
  lower:   'Unter! Jetzt geht es bergab: Die nächste Person muss gleich oder niedriger legen.',
  reverse: 'Wende! Alles zurück, die Spielrichtung dreht sich um.',
  skip:    'Stopp! Die nächste Person setzt aus. Tja.',
  joker:   'Joker! Du bist einfach nochmal dran. Frechheit siegt.',
  // Charakterkarten
  adrian:  'Der Chef ist da! Stapel auf null – und wer ihn gerufen hat, ist gleich nochmal dran.',
  aylen:   'Tauschbörse! Du tauschst deine ganze Hand mit der Person, die am wenigsten Karten hat. Sorry!',
  louis:   'Der Dreizack! Die nächste Person bekommt drei Karten von dir geschenkt. Gern geschehen.',
  bernd:   'Lieferdienst! Die nächste Person bekommt den kompletten Stapel geliefert. Trinkgeld nicht vergessen.',
  niclas:  'Turbo! Die nächsten zwei Leute setzen aus. Niclas ist schon weg.',
  andre:   'André übernimmt! Stapel auf null, und alle anderen ziehen eine Karte. Pädagogisch wertvoll.',
  ruben:   'Feuerwerk! Der Stapel verbrennt, und eine zufällige Person kriegt eine Karte von dir zugesteckt.',
  floris:  'Der Boss! Zählt als sechzehn, höher geht es nicht. Und die nächste Person setzt aus.',
  jonas:   'Plot-Twist vom Spielleiter! Die Richtung dreht sich, und du tauschst deine Hand mit der Person, die am meisten Karten hat.',
  maxime:  'Wien-Berlin-Express! Die nächste Person setzt aus und zieht zwei Karten. Zug verpasst.',
  // Club-Karten
  kartoffel:       'Heiße Kartoffel! Wer sie fängt, zieht drei Karten. Schnell weiterwerfen!',
  zwillinge:       'Zwillings-Parade! Zwei Farben passen jetzt auf alles – bis du wieder dran bist.',
  aegis:           'Aegis! Der Schild knallt auf den Tisch, der Stapel zählt wieder ab null.',
  spiegel:         'Der Spiegel! Eigentlich wirkt er auf der Hand: Da wirft er Zieh-Angriffe zurück.',
  schwarzes_loch:  'Schwarzes Loch! Der Stapel ist weg, und alle anderen verlieren eine zufällige Karte. Schlürf.',
  zeitstopp:       'Zeitstopp! Stapel auf null, und du bist sofort nochmal dran. Alle anderen: eingefroren.',
  dieb:            'Meisterdieb! Eine Karte wechselt heimlich den Besitzer. Taschen zuhalten!',
  gluecklich:      'Glücklicher Schelm! Eigentlich wirkt er auf der Hand: Er schickt Angriffe zurück.',
  traurig:         'Trauriger Schelm! Das Opfer zieht so viele Karten, wie du noch hast. Geteiltes Leid.',
  gluecksspiel:    'Kriege vier oder verliere vier! Die Münze fliegt … jubeln oder weinen?',
  portal:          'Dimensionsportal! Die nächste Spezialkarte kommt direkt auf deine Hand. Nachschub!',
  phoenix:         'Phönix-Asche! Eigentlich wirkt sie auf der Hand: Musst du den Stapel nehmen, verbrennt er stattdessen.',
  himmelszorn:     'Göttlicher Blitz! Das Ziel verliert eine Spezialkarte – oder zieht zwei, wenn es keine hat.',
  zeitschleife:    'Zeitschleife! Die letzte gespielte Spezialkarte kommt zurück auf deine Hand. Déjà-vu!',
  erdbeben:        'Erdbeben! Stapel auf null, und wer mehr als fünf Karten hat, verliert eine.',
  kettenfluch:     'Kettenfluch! Das Opfer zieht zwei Karten. Klirr.',
  pizza_hunger:    'Pizza-Raid! Stapel auf null, und alle mit mehr als drei Karten zahlen eine Karte für die Pizza.',
  dzana_zen:       'Zen-Gong! Das Ziel wirft zwei Karten ab und atmet durch – aber der Stapel steht jetzt auf fünfzehn.',
  fee_trick:       'Feen-Streich! Du klaust dem Ziel eine Spezialkarte. Hat es keine, zieht es zwei.',
  andre_mentor:    'Safe Space! Stapel auf null, und wer die meisten Karten hat, darf zwei abwerfen.',
  adrian_muster:   'Die Musterlösung! Stapel auf null, du bist nochmal dran, und alle mit mehr als drei Karten ziehen eine.',
  cookie_chaos:    'Cookie-Crunch! Richtung dreht sich, alle geben eine Karte weiter, und der Stapel bekommt eine Zufallszahl. Chaos!',
  teya_scribbl:    'Scribbl-Meisterwerk! Stapel auf null, und Farben sind jetzt egal.',
  ayleen_observer: 'Stille Beobachterin! Der Stapel sinkt um fünf, und eine deiner Karten verschwindet unauffällig.',
  niclas_turbo:    'Turbo-Abreise! Die nächsten zwei setzen aus und ziehen je eine Karte. Zu langsam!',
  ruben_firework:  'Großes Feuerwerk! Der Stapel explodiert, und alle verlieren ihre höchste Zahlenkarte. Ooooh!',
  jester_combo:    'Lachen und Weinen! Eine Person mischt ihre ganze Hand neu, die andere zieht drei.',
  igel:            'Raschelndes Laub – der Igel der Blätter rollt an! Du bist nochmal dran und die nächste Person zieht zwei Karten.',
};

// ─────────────────────────────────────────────────────────────
// KARTENAUSWAHL – der Host entscheidet vor dem Spiel, was mit drin ist.
// DEFAULT_DECK ist das „Grundspiel“: wenig Karten, leicht zu verstehen.
// Selbstgebaute Bomben der Spieler*innen sind immer dabei.
// ─────────────────────────────────────────────────────────────
export const DEFAULT_DECK = {
  voice: true,   // KI-Ansage bei Spezialkarten
  specials: ['reset', 'burn', 'lower', 'reverse', 'skip', 'joker', 'adrian', 'andre', 'kartoffel', 'gluecksspiel'],
  roles: ['buerger', 'dorfdepp', 'pechvogel', 'held', 'spion'],
};

export const SPECIAL_GROUPS = [
  { key: 'basis', name: 'Grundkarten', hint: 'Einfache Effekte – perfekt zum Einstieg.', cards: BASIC_SPECIALS },
  { key: 'charaktere', name: 'Charakterkarten', hint: 'Club-Leute mit je 1–2 Effekten.', cards: CHARACTERS },
  { key: 'club', name: 'Club-Karten', hint: 'Von Mitgliedern erfunden – stärker und wilder.', cards: PLAYER_CARDS },
];

// Alle wählbaren Spezialkarten als flache Liste (für Auswahl-Fenster & Almanach)
export function specialCatalog() {
  return SPECIAL_GROUPS.flatMap((g) => Object.entries(g.cards).map(([key, c]) => ({
    key, group: g.key, name: c.name, title: c.title, emoji: c.emoji, by: c.by,
    short: cardText(c), long: c.text ?? null,
  })));
}

// Prüft die Auswahl des Hosts. Unbekanntes fliegt raus; mindestens 1 Rolle muss bleiben.
export function cleanDeckChoice(choice) {
  const specialKeys = new Set(SPECIAL_GROUPS.flatMap((g) => Object.keys(g.cards)));
  const pick = (list, ok) => [...new Set(Array.isArray(list) ? list : [])].filter((k) => typeof k === 'string' && ok(k));
  const specials = pick(choice?.specials, (k) => specialKeys.has(k));
  const roles = pick(choice?.roles, (k) => k in ROLES);
  if (!roles.length) return null;
  return { voice: choice?.voice !== false, specials, roles };
}

// Text einer Karte: Kurz-Erklärung, sonst eigener Text, sonst automatisch aus den Effekten
export function cardText(c) {
  return c.short ?? c.text ?? describe(c.effects ?? []);
}

export function describe(effects) {
  return effects.map((e) => EFFECTS[e.type]?.text(e) ?? '?').join(' + ');
}

// Prüft eine selbstgebaute Karte. Gibt eine bereinigte Version zurück – oder null.
export function validateEffects(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_EFFECTS_PER_CARD) return null;
  const seen = new Set();
  const clean = [];
  for (const raw of list) {
    const def = EFFECTS[raw?.type];
    if (!def || seen.has(raw.type)) return null;
    seen.add(raw.type);
    const e = { type: raw.type };
    if (def.n) {
      const n = Math.round(Number(raw.n));
      if (!(n >= def.n[0] && n <= def.n[1])) return null;
      e.n = n;
    }
    if (def.targets) {
      if (!def.targets.includes(raw.target)) return null;
      e.target = raw.target;
    }
    clean.push(e);
  }
  return clean;
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }
