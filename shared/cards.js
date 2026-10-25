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
  reset:   { name: 'Reset',  emoji: '🔄', effects: [{ type: 'reset' }], art: '/karten/art/reset.svg', fullArt: true },
  burn:    { name: 'Feuer',  emoji: '🔥', effects: [{ type: 'burn' }, { type: 'again' }], art: '/karten/art/feuer.svg', fullArt: true },
  lower:   { name: 'Unter',  emoji: '⬇️', effects: [{ type: 'lower' }], art: '/karten/art/unter.svg', fullArt: true },
  reverse: { name: 'Wende',  emoji: '🔁', effects: [{ type: 'reverse' }], art: '/karten/art/wende.svg', fullArt: true },
  skip:    { name: 'Stopp',  emoji: '🛑', effects: [{ type: 'skip', n: 1 }], art: '/karten/art/stopp.jpg', fullArt: true },
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
  ayleen: {art: '/karten/art/ayleen_tauschboerse_clean.jpg', fullArt: true,
    name: 'Ayleen', title: 'Die Tauschbörse', by: 'Ayleen', emoji: '💱',
            effects: [{ type: 'swap', target: 'fewest' }] },
  louis:  { name: 'Luis',   title: 'Der Dreizack', by: 'Luis', emoji: '🔱', art: '/karten/art/louis.jpg', fullArt: true,
            effects: [{ type: 'give', n: 3, target: 'next' }],
            short: 'Gib 3 Karten an den Nächsten (bei ≤5 Handkarten nur 2).',
            text: 'Der Dreizack: Gib 3 Karten an die nächste Person am Tisch ab. Hast du jedoch 5 oder weniger Handkarten, darfst du nur 2 Karten abgeben!' },
  bernd: {art: '/karten/art/bernd_delivery_concept_1792311089773.jpg', fullArt: true,
    name: 'Bernd', title: 'Der Lieferdienst', by: 'Bernd', emoji: '🚚',
            effects: [{ type: 'takePile', target: 'next' }],
            short: 'Nächste Person bekommt den Stapel, darf aber 2 verschiedene Zahlen ablegen.',
            text: 'Lieferdienst: Die nächste Person am Tisch bekommt den kompletten Stapel geliefert, erhält aber fettes Trinkgeld: Sie darf in ihrem nächsten Zug zwei verschiedene Zahlen auf einmal ablegen!' },
  niclas: {art: '/karten/art/turbo_abreise.jpg', fullArt: true,
    name: 'Niclas', title: 'Der Turbo', by: 'Niclas', emoji: '🏎️',
            effects: [{ type: 'skip', n: 2 }] },
  andre:  { name: 'Souveränin des Äthers', title: 'Herrin des Äthers', by: 'NoRevanell Morningstar', emoji: '👑', art: '/karten/art/andre.jpg', fullArt: true,
            effects: [{ type: 'reset' }, { type: 'draw', n: 1, target: 'all' }] },
  floris: { name: 'Flo', title: 'Kernelflow-Fabrik', by: 'Floris', emoji: '🌰',
            effects: [{ type: 'boss' }, { type: 'skip', n: 1 }],
            art: '/karten/art/kernelflow_factory_concept_1792311087512.jpg', fullArt: true },
  jonas:  {art: '/karten/art/jonas_spielleiter_concept_1792311387993.jpg', fullArt: true,
    name: 'Jonas', title: 'Der Spielleiter', by: 'Jonas', emoji: '🎮',
            effects: [{ type: 'rotate' }] },
  maxime: {art: '/karten/art/maxime_zug.jpg', fullArt: true,
    name: 'Maxime', title: 'Der Orient-Express', by: 'Maxime', emoji: '🚂',
            effects: [{ type: 'draw', n: 2, target: 'prev' }] },
};

// ─────────────────────────────────────────────────────────────
// ROLLENKARTEN – Geheimrollen für den Spielmodus „Werwolf-UNO“ / Rollen-Modus.
// Jede Person zieht zu Beginn eine verdeckte Rolle mit passivem Trait.
// ─────────────────────────────────────────────────────────────
export const ROLES = {
  dorfdepp:  { name: 'Dorfdepp',    emoji: '🤡', cards: +1, weight: 3, ability: 'fool', text: 'Startet mit +1 Karte. Bauernschläue: Muss er den Stapel nehmen, nimmt er höchstens 2 Karten auf – der Rest verbrennt!' },
  pechvogel: { name: 'Pechvogel',   emoji: '🐦‍⬛', cards: 0,  weight: 4, ability: 'unlucky', text: 'Geteiltes Pech: Zwingt dich jemand zum Ziehen, zieht der Angreifer 1 Karte mit.' },
  buerger:   { name: 'Bürger*in',   emoji: '🧑', cards: 0,  weight: 5, ability: 'citizen', text: 'Bürgergeld: Musst du den Stapel kassieren, erhältst du sofort 1 Spezialkarte aus dem Deck als Solidaritäts-Ausgleich!' },
  held:      { name: 'Held*in',     emoji: '🦸', cards: -1, weight: 3, ability: 'hero', text: 'Startet mit -1 Karte. Heldenmut: Hast du nur noch 1 oder 2 Karten, darfst du jede beliebige Zahl legen!' },
  junggott:  { name: 'Junger Gott', emoji: '⚡', cards: -2, weight: 2, ability: 'demigod', text: 'Startet mit -2 Karten. Himmelsblitz: Darf nach dem Legen einer Spezialkarte sofort eine passende Zahlenkarte nachlegen (Extra-Zug)!' },
  gott:      { name: 'Gott',        emoji: '☀️', cards: -2, weight: 1, ability: 'god', text: 'Startet mit -2 Karten. Göttliche Majestät: Vollständig immun gegen Hand-Tausch! Gezielte Zieh-Angriffe prallen ab und treffen den Angreifer.' },
  alchemist: { name: 'Alchemist',   emoji: '🧪', cards: 0,  weight: 4, ability: 'alchemist', text: 'Transmutation: Legst du zwei gleiche Zahlenkarten, wird deine niedrigste Karte automatisch kostenlos mit verbrannt!' },
  spion:     { name: 'Spion',       emoji: '🕵️‍♂️', cards: 0,  weight: 3, ability: 'spy', text: 'Geheimdienst: Sieht als Einziger am Tisch die geheimen Rollen aller anderen Spieler*innen!' },
  berserker: { name: 'Berserker',   emoji: '🪓', cards: 0,  weight: 3, ability: 'berserk', text: 'Blutrausch: Muss er den Stapel nehmen, zerhackt er ihn: Die Hälfte verbrennt, nur der Rest landet auf der Hand!' },
  pazifist:  { name: 'Pazifist',    emoji: '🕊️', cards: -1, weight: 3, ability: 'pacifist', text: 'Diplomatischer Schutz: Solange du mehr als 3 Karten hast, prallen alle gezielten Zieh- und Tauschangriffe an dir ab.' },
  magier:    { name: 'Erzmagier',   emoji: '🧙‍♂️', cards: -1, weight: 3, ability: 'mage', text: 'Arkane Schatzkammer: Startet mit 3 Spezialkarten (statt 2)! Meister der arkanen Künste.' },
  nekromant: { name: 'Nekromant',   emoji: '💀', cards: 0,  weight: 3, ability: 'necromancer', text: 'Seelen-Opfer: Verbrennt ein Stapel oder eine Karte (Burn/Loch/Phönix/Ruben), erntet er die Seelen und opfert 1 eigene Handkarte kostenlos!' },
  gluecksspieler: { name: 'Glücksspieler', emoji: '🎲', cards: 0, weight: 3, ability: 'gambler', text: 'Gezinkte Würfel: Darf jede ungerade Zahl auf eine gerade Zahl legen (und umgekehrt), völlig ungeachtet des Werts!' },
  mimik:          { name: 'Mimik', emoji: '🦎', cards: 0, weight: 3, ability: 'mimic', text: 'Chamäleon-Spiegel: Wählt zu Spielbeginn eine geheime Zielperson, erfährt deren verdeckte Rolle und übernimmt dauerhaft deren passive Fähigkeit!' },
  meisterschuetze:{ name: 'Meisterschütze', emoji: '🏹', cards: 0, weight: 3, ability: 'marksman', text: 'Präzisions-Schuss: Zielt auf Schwachstellen: Steht der Tisch auf ≥ 12 oder liegt ein Boss (16), darf er jede beliebige Zahl legen und muss bei Boss-Karten niemals den Stapel nehmen!' },
  feldsanitaeter: { name: 'Feldsanitäter', emoji: '🩹', cards: 0, weight: 3, ability: 'medic', text: 'Erste Hilfe: Muss jemand am Tisch ≥ 3 Strafkarten ziehen oder den Stapel kassieren, darf der Feldsanitäter sofort 1 eigene Handkarte kostenlos als Hilfsgüter abwerfen!' },
  anarchist:      { name: 'Anarchist', emoji: '🧨', cards: 0, weight: 3, ability: 'anarchist', text: 'Entropie-Spiegel: Wird eine 7 oder 13 gelegt, kehrt er sofort die Spielrichtung um! Zwingt ihn jemand zum Ziehen, entscheidet ein Münzwurf: Kopf = Strafe verdoppelt, Zahl = halbiert!' },
};

// ─────────────────────────────────────────────────────────────
// KARTEN VON SPIELER*INNEN mit eigenen Regeln.
// Die Logik dazu steht in server/cards/game.js (Suche nach „ability“).
// needs: welche Auswahl man beim Ausspielen trifft – 'target' (eine Person), 'colors2' (zwei Farben)
// ─────────────────────────────────────────────────────────────
export const PLAYER_CARDS = {
  kartoffel: {art: '/karten/art/kartoffel.jpg', fullArt: true,
    name: 'Heiße Kartoffel', title: 'Glühend frische Glut', emoji: '🥔', ability: 'potato', needs: 'target',
    text: 'Kann nicht abgelegt, nur weitergereicht werden (nie zurück an die Person, von der du sie hast). '
      + 'Wer sie bekommt, zieht 3. Wer sie hält, ist immun gegen Tausch, zieht aber bei Zieh-Effekten das Dreifache. '
      + 'Ist sie deine letzte Karte: Du gewinnst, alle anderen ziehen 3.',
  },
  zwillinge: {art: '/karten/art/zwillinge.jpg', fullArt: true,
    name: 'Zwillings-Parade', title: 'Blick der zwei Welten', emoji: '♊', by: 'NoRevanell Morningstar', ability: 'twins', needs: 'colors2',
    text: 'Aktiv: Wähle 2 Farben – bis du wieder dran bist, passen sie auf jede Karte. '
      + 'Sphäre: Solange sie oben liegt, darf man auch 1 drunter legen. '
      + 'Passiv: Sollst du ziehen, wird sie automatisch abgeworfen – je die Hälfte ziehen deine beiden Sitznachbar*innen.',
  },
  aegis: {art: '/karten/art/aegis_karte.jpg', fullArt: true,
    name: 'Aegis der Nullifizierung', title: 'Goldener Schutzschild', emoji: '🛡️', by: 'NoRevanell Morningstar', ability: 'aegis',
    text: 'Passiv (aus der Hand) & Aktiv: Blockt Angriffe (oder reinigt den Tisch auf 0) und hüllt dich in einen goldenen Nachhall, der dich bis zu deinem nächsten Zug vor allen weiteren Angriffen schützt!',
  },
  spiegel: {art: '/karten/art/spiegel_concept_art_1792311111830.jpg', fullArt: true,
    name: 'Prismatischer Spiegel', title: 'Echo der Realität', emoji: '🪞', by: 'NoRevanell Morningstar', ability: 'mirror',
    text: 'Passiv (aus der Hand): Zwingt dich jemand zum Ziehen, wirfst du den Spiegel ab: Der Angreifer zieht den vollen Strafwert, du selbst dämpfst die Strafe auf zwei Drittel (aufgerundet)!',
  },
  schwarzes_loch: {art: '/karten/art/schwarzes_loch_art_fullbleed_1792268415209.jpg', fullArt: true,
    name: 'Schwarzes Loch', title: 'Singularität', emoji: '🕳️', by: 'NoRevanell Morningstar', ability: 'blackHole',
    text: 'Aktiv: Verschlingt und verbrennt den gesamten Ablagestapel (Tisch wird auf 0 gereinigt). Alle anderen Spieler*innen müssen sofort 1 Handkarte opfern – bevorzugt eine Spezialkarte, sofern vorhanden!',
  },
  zeitstopp: {art: '/karten/art/zeitstopp_concept_art_1792268419416.jpg', fullArt: true,
    name: 'Chronos-Siegel', title: 'Herr der Zeit', emoji: '⏳', by: 'NoRevanell Morningstar', ability: 'timestop',
    text: 'Aktiv: Friere die Zeit ein! Du bist sofort noch einmal dran und darfst eine beliebige Karte legen (Tisch-Zahl wird ignoriert).',
  },
  dieb: {art: '/karten/art/dieb.jpg', fullArt: true,
    name: 'Meisterdieb', title: 'Schatten-Griff', emoji: '🥷', by: 'NoRevanell Morningstar', ability: 'thief', needs: 'target',
    text: 'Aktiv: Wähle eine Person. Stiehl verdeckt 1 zufällige Karte aus ihrer Hand und vernichte sie im Schatten (ohne deine Hand zu belasten)!',
  },
  gluecklich: {art: '/karten/art/schelm_glueck.jpg', fullArt: true,
    name: 'Glücklicher Schelm', title: 'Wer zuletzt lacht', emoji: '😆', by: 'Luis/Pilzi', ability: 'luckyJester',
    text: 'Passiv: Spielt jemand gezielt eine Karte gegen dich, fliegt der ganze Effekt automatisch zurück (nicht bei Effekten gegen alle). '
      + 'Zusammen mit dem Traurigen Schelm legbar: „Lachen und Weinen“.',
  },
  traurig: {art: '/karten/art/schelm_trauer.jpg', fullArt: true,
    name: 'Trauriger Schelm', title: 'Geteiltes Leid', emoji: '😢', by: 'Luis/Pilzi', ability: 'sadJester', needs: 'target',
    text: 'Wähle jemanden: zieht so viele Karten, wie du danach noch auf der Hand hast. '
      + 'Zusammen mit dem Glücklichen Schelm legbar: „Lachen und Weinen“.',
  },
  gluecksspiel: {art: '/karten/art/gluecksspiel_concept_1792268416618.jpg', fullArt: true,
    name: 'Kriege 4 oder verliere 4', emoji: '🪙', ability: 'gamble',
    text: 'Münzwurf: Entweder du ziehst 4 Karten – oder du wirst 4 Karten los. 50 : 50.',
  },
  portal: {art: '/karten/art/portal_arch_concept_art_1792311107815.jpg', fullArt: true,
    name: 'Dimensionsportal', title: 'Riss im Raumzeitgefüge', emoji: '🌀', by: 'NoRevanell Morningstar', ability: 'portal',
    text: 'Aktiv: Öffnet ein Portal in die Tiefen des Decks: Ziehe sofort die nächste Spezialkarte direkt auf die Hand (oder 2 normale Karten, falls keine mehr da ist).',
  },
  phoenix: {
    name: 'Phönix-Asche', title: 'Wiedergeburt aus Flammen', emoji: '🐦‍🔥', by: 'NoRevanell Morningstar', ability: 'phoenix',
    art: '/karten/art/feuer_concept_1792268060503.jpg', fullArt: true,
    text: 'Passiv (aus der Hand): Musst du den Stapel kassieren, verbrennt der gesamte Stapel stattdessen zu Asche! Du wirfst den Phönix ab und ziehst 1 frische Karte vom Deck.',
  },
  himmelszorn: {art: '/karten/art/blitz.jpg', fullArt: true,
    name: 'Göttlicher Blitz', title: 'Zorn des Pantheons', emoji: '⚡', by: 'NoRevanell Morningstar', ability: 'divineWrath', needs: 'target',
    text: 'Aktiv: Wähle eine Person. Sie wird vom Blitz getroffen: Besitzt sie Spezialkarten, verbrennt eine davon im Stapel – andernfalls muss sie 2 Karten ziehen!',
  },
  zeitschleife: {art: '/karten/art/ouroboros.jpg', fullArt: true,
    name: 'Ouroboros', title: 'Ewige Zeitschleife', emoji: '♾️', by: 'NoRevanell Morningstar', ability: 'timeloop',
    short: 'Letzte Spezialkarte zurück; letzte 2 Zahlen an 2 Mitspieler.',
    text: 'Aktiv: Die Schlange beißt sich in den Schwanz! Du nimmst die letzte Spezialkarte aus dem Ablagestapel zurück auf deine Hand – und die letzten zwei gespielten Zahlen wandern an zwei zufällige Mitspieler!',
  },
  erdbeben: {art: '/karten/art/erdbeben.jpg', fullArt: true,
    name: 'Tektonischer Schock', title: 'Erdebrecher', emoji: '🌋', by: 'NoRevanell Morningstar', ability: 'earthquake',
    text: 'Aktiv: Erschüttert das Spielbrett! Der Tisch wird auf 0 bereinigt und alle Spieler*innen mit mehr als 5 Karten müssen 1 Handkarte abwerfen.',
  },
  kettenfluch: {art: '/karten/art/kettenfluch.jpg', fullArt: true,
    name: 'Kettenfluch', title: 'Fesseln des Äthers', emoji: '⛓️', by: 'NoRevanell Morningstar', ability: 'chainCurse', needs: 'target',
    text: 'Aktiv: Wähle eine Person. Magische Ketten umschlingen sie: Sie muss sofort 2 Strafkarten vom Ziehstapel ziehen!',
  },
  pizza_hunger: {art: '/karten/art/pizza.jpg', fullArt: true,
    name: 'Pizza-Raid', title: 'Jung & Hungrig', emoji: '🍕', by: 'Jung & Hungrig Club', ability: 'pizzaRaid',
    text: 'Aktiv: Jemand hat Pizza bestellt! Der Tisch wird auf 0 bereinigt. Alle Spieler*innen mit mehr als 3 Karten werfen sofort 1 Handkarte als Bezahlung auf den Stapel ab.',
  },
  dzana_zen: {art: '/karten/art/zen_gong.jpg', fullArt: true,
    name: 'Džanas Zen-Gong', title: 'Chaotic Good Vibes', emoji: '🔔', by: 'Džana vWbB', ability: 'zenBuff',
    short: 'Wirf 2 niedrigste Zahlen ab; Tisch steht auf 15.',
    text: 'Aktiv: Tief durchatmen: Du wirfst deine 2 niedrigsten Zahlenkarten kostenlos ab (hast du keine Zahlen, beliebige Karten) – dafür wird der Stapel auf den Boss-Wert 15 gesetzt!',
  },
  fee_trick: {art: '/karten/art/fee_trick.jpg', fullArt: true,
    name: 'Feen-Streich', title: 'Queen of Fairies', emoji: '🧚‍♀️', by: 'Fay (Queen of Fairies)', ability: 'fairyTrick', needs: 'target',
    text: 'Aktiv: Wähle ein Ziel. Die Feen vertauschen die Vorzeichen: Stiehl 1 Spezialkarte aus ihrer Hand – hat sie keine, muss sie 2 Strafkarten ziehen!',
  },
  andre_mentor: {art: '/karten/art/sanctuary.jpg', fullArt: true,
    name: 'Sanctuary-Protokoll', title: 'Der Gruppenleiter', emoji: '🏛️', by: 'André', ability: 'sanctuary',
    text: 'Aktiv: Baut einen Safe Space auf! Der Tisch wird auf 0 gereinigt. Die Person am Tisch mit den MEISTEN Handkarten darf sofort 2 Karten kostenlos abwerfen (Aufbau-Hilfe).',
  },
  adrian_muster: {art: '/karten/art/adrian_concept_focused_1792311343359.jpg', fullArt: true,
    name: 'Die Musterlösung', title: 'Chef-Dekret', emoji: '📋', by: 'Adrian', ability: 'masterSolution',
    text: 'Aktiv: „Herr Adrian hat gesprochen!“ Der Tisch wird auf 0 gereinigt und du bist sofort noch einmal dran. Alle anderen mit mehr als 3 Handkarten ziehen 1 Karte (Musterlösung nicht vorbereitet!).',
  },
  cookie_chaos: {art: '/karten/art/cookie.jpg', fullArt: true,
    name: 'Der Cookie-Crunch', title: 'Musterbrecherin', emoji: '🍪', by: 'Amelie', ability: 'cookieCrunch',
    text: 'Aktiv: Cookie stiftet herrliches Chaos! Die Spielrichtung wird sofort invertiert, alle reichen 1 Handkarte nach links weiter und der Tischwert wird unberechenbar neu ausgewürfelt (1–15).',
  },
  teya_scribbl: {art: '/karten/art/scribbl.jpg', fullArt: true,
    name: 'Scribbl-Meisterwerk', title: 'Nachwuchs-Talent', emoji: '🎨', by: 'Teya', ability: 'teyaScribbl',
    text: 'Aktiv: Bunte Farbenpracht! Der Tisch wird auf 0 bereinigt und lädt die Farb-Resonanz sofort auf Stufe 3 auf (die nächste Farbkarte zündet direkt die Elementar-Überladung!). Alle Farbregeln bleiben für diese Runde als Joker aufgehoben.',
  },
  ayleen_observer: {art: '/karten/art/beobachterin_final2.jpg', fullArt: true,
    name: 'Stille Beobachterin', title: 'Workshop-Fokus', emoji: '👀', by: 'Ayleen', ability: 'ayleenObserver',
    text: 'Aktiv: Ayleen nutzt die Verwirrung der Älteren! Der Tischstapel wird um 5 Punkte gesenkt (mind. 1) und sie darf sofort 1 Handkarte unbemerkt mit ablegen.',
  },
  niclas_turbo: {art: '/karten/art/niclas_turbo_concept_1792311378048.jpg', fullArt: true,
    name: 'Turbo-Abreise', title: 'Der Turbo', emoji: '🏎️', by: 'Niclas', ability: 'turboDash',
    text: 'Aktiv: Niclas ist schon im Flugzeug! Überspringt sofort die nächsten 2 Personen am Tisch. Wer überholt wird, muss 1 Strafkarte ziehen (zu langsam!).',
  },
  ruben_firework: {art: '/karten/art/ruben_feuerwerk_clean.jpg', fullArt: true,
    name: 'Pyrotechnik-Knall', title: 'Das Feuerwerk', emoji: '🎆', by: 'Ruben', ability: 'fireworkBlast',
    text: 'Aktiv: Zündet das große Club-Feuerwerk! Der Tischstapel detoniert vollständig (verbrennt auf 0). Alle Spieler*innen am Tisch müssen gleichzeitig ihre höchste Zahlenkarte verbrennen!',
  },
  igel: {art: '/karten/art/shaymin_card.jpg', fullArt: true,
    name: 'Igel der Blätter', title: 'Raschelndes Laub', emoji: '🦔', by: 'NoRevanell Morningstar',
    effects: [{ type: 'again' }, { type: 'draw', n: 2, target: 'next' }],
    art: '/karten/art/shaymin_card.jpg', fullArt: true,
    text: 'Aktiv: Raschelndes Laub! Du bist sofort noch einmal dran und legst noch ein Blatt ab. Die nächste Person am Tisch muss 2 Strafkarten ziehen.',
  },
  optimus: {art: '/karten/art/optimus.jpg', fullArt: true,
    name: 'Optimus Prime', title: 'Autobots, Roll Out!', emoji: '🚛', by: 'NoRevanell Morningstar',
    effects: [{ type: 'reverse' }, { type: 'draw', n: 2, target: 'next' }],
    art: '/karten/art/optimus.jpg', fullArt: true,
    text: 'Aktiv: Autobots, Roll Out! Die Spielrichtung kehrt sich sofort um. Wer in der neuen Richtung im Weg steht, wird überrollt und muss 2 Karten ziehen!',
  },
  rucksack: {art: '/karten/art/rucksack.svg', fullArt: true,
    name: 'Der Rucksack', title: 'Schweres Gepäck', emoji: '🎒', by: 'Bernd',
    effects: [{ type: 'takePile', target: 'random' }],
    art: '/karten/art/rucksack.svg', fullArt: true,
    text: 'Aktiv: Schweres Gepäck! Eine zufällige Person am Tisch bekommt den gesamten Ablagestapel aufgebürdet!',
  },
  schleim: {art: '/karten/art/schleim.svg', fullArt: true,
    name: 'Schleim', title: 'Rimuru Tempest', emoji: '💧', by: 'Rimuru Tempest', ability: 'slimeGluttony',
    text: 'Aktiv: Gluttony! Der Schleim verschlingt die oberste Karte des Tischstapels in seinen Magenraum! Der Tischwert wird auf den vorherigen Wert zurückgesetzt (oder 0 gereinigt) und du bist sofort noch einmal dran.',
  },
  daemonenkoenig: {art: '/karten/art/daemonenkoenig.svg', fullArt: true,
    name: 'Dämonenkönig', title: 'Anos Voldigoad', emoji: '👑', by: 'Anos Voldigoad', ability: 'anosLogic',
    text: 'Aktiv: Venuzdonoa! Zerstört alle Spielregeln: Der Dämonenkönig passt auf jede beliebige Karte. Solange er oben liegt, verpuffen alle Spezial-Effekte – die nächste Person MUSS eine reguläre Zahlenkarte legen oder den Stapel fressen!',
  },
  drache: {art: '/karten/art/drache.svg', fullArt: true,
    name: 'Drache', title: 'Smaug der Goldene', emoji: '🐉', by: 'Smaug', ability: 'dragonHoard',
    text: 'Aktiv: Drachenhort! Smaug schmilzt den gesamten aktuellen Tischstapel zu Gold ein (Stapel verbrennt auf 0). Wer den Drachen geweckt hat (die nächste Person), muss 3 Strafkarten ziehen!',
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
  aegis:           'Blockt Angriff oder Tisch auf 0 – schützt mit Nachhall bis zum eigenen Zug.',
  spiegel:         'Gegner zieht volle Strafe; du ziehst zwei Drittel.',
  schwarzes_loch:  'Stapel auf 0. Alle anderen opfern 1 Handkarte (bevorzugt eine Spezialkarte).',
  zeitstopp:       'Stapel auf 0 – du bist sofort nochmal dran und darfst alles legen.',
  dieb:            'Klau 1 Handkarte von einer Person und vernichte sie im Schatten.',
  gluecklich:      'Bleibt auf der Hand: Der nächste gezielte Angriff gegen dich fliegt zurück.',
  traurig:         'Eine Person deiner Wahl zieht so viele Karten, wie du noch hast.',
  gluecksspiel:    'Münzwurf: Du ziehst 4 Karten – oder wirst 4 los.',
  portal:          'Hol dir die nächste Spezialkarte aus dem Stapel auf die Hand.',
  phoenix:         'Bleibt auf der Hand: Musst du den Stapel nehmen, verbrennt er stattdessen.',
  himmelszorn:     'Ziel verliert 1 Spezialkarte – hat es keine, zieht es 2.',
  zeitschleife:    'Letzte Spezialkarte zurück; letzte 2 Zahlen an 2 Mitspieler.',
  erdbeben:        'Stapel auf 0. Wer mehr als 5 Karten hat, verliert 1.',
  kettenfluch:     'Eine Person deiner Wahl zieht 2 Karten.',
  pizza_hunger:    'Stapel auf 0. Wer mehr als 3 Karten hat, wirft 1 ab.',
  dzana_zen:       'Wirf 2 niedrigste Zahlen ab – dafür steht der Stapel auf 15.',
  fee_trick:       'Klau einer Person 1 Spezialkarte – hat sie keine, zieht sie 2.',
  andre_mentor:    'Stapel auf 0. Wer die meisten Karten hat, wirft 2 ab.',
  adrian_muster:   'Stapel auf 0, du bist nochmal dran. Alle anderen mit mehr als 3 Karten ziehen 1.',
  cookie_chaos:    'Richtung dreht sich, alle geben 1 Karte weiter, der Stapel bekommt einen Zufallswert.',
  teya_scribbl:    'Stapel auf 0 und nächste Farbkarte zündet direkt die Farb-Überladung Stufe 3.',
  ayleen_observer: 'Stapel sinkt um 5 und du wirst 1 zufällige Karte los.',
  niclas_turbo:    'Die nächsten 2 Personen setzen aus und ziehen je 1.',
  ruben_firework:  'Stapel verbrennt. Alle verlieren ihre höchste Zahlenkarte.',
  igel:            'Du bist nochmal dran und legst ein Blatt ab – die nächste Person zieht 2 Karten.',
  optimus:         'Richtung dreht sich um. Nächste Person zieht 2 Karten.',
  rucksack:        'Zufällige Person nimmt den Stapel.',
  schleim:         'Verschlingt die oberste Karte; Tisch fällt zurück; du bist nochmal dran.',
  daemonenkoenig:  'Passt auf alles. Spezial-Effekte verpuffen; nächste Person muss Zahl legen.',
  drache:          'Stapel verbrennt zu Gold; nächste Person zieht 3 Karten.',
};
for (const [k, short] of Object.entries(CARD_SHORT)) if (PLAYER_CARDS[k]) PLAYER_CARDS[k].short = short;

const ROLE_SHORT = {
  dorfdepp:       '+1 Karte. Musst du den Stapel nehmen, nimmst du maximal 2 – der Rest verbrennt.',
  pechvogel:      '0 Startkarten. Lässt dich jemand ziehen, zieht er 1 mit.',
  buerger:        'Nimmst du den Stapel, erhältst du 1 Spezialkarte als Ausgleich.',
  held:           '−1 Karte. Mit nur noch 1–2 Karten darfst du jede Zahl legen.',
  junggott:       '−2 Karten. Nach jeder Spezialkarte bist du nochmal dran.',
  gott:           '−2 Karten. Vollständig immun gegen Hand-Tausch! Gezielte Zieh-Angriffe prallen ab.',
  alchemist:      'Legst du ein Pärchen, wirst du zusätzlich deine niedrigste Karte los.',
  spion:          'Du siehst die geheimen Rollen aller anderen.',
  berserker:      '0 Startkarten. Musst du den Stapel nehmen, verbrennt die Hälfte davon.',
  pazifist:       '−1 Karte. Solange du mehr als 3 Karten hast, prallen Zieh- und Tausch-Angriffe ab.',
  magier:         '−1 Karte. Du startest mit 3 Spezialkarten statt 2.',
  nekromant:      'Verbrennt ein Stapel, wirst du 1 eigene Karte los.',
  gluecksspieler: 'Du darfst ungerade auf gerade legen (und umgekehrt), egal wie hoch.',
  mimik:          'Kopiert verdeckt die Rolle einer Zielperson und erfährt deren Identität.',
  meisterschuetze:'Darf bei Tisch ≥ 12 jede Zahl legen; nimmt bei Bossen nie den Stapel.',
  feldsanitaeter: 'Zieht jemand ≥ 3 Karten oder nimmt Stapel, wirfst du 1 Karte gratis ab.',
  anarchist:      'Dreht bei 7 oder 13 die Richtung um; würfelt Zieh-Strafen (doppelt/halb).',
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
  ayleen:  'Tauschbörse! Du tauschst deine ganze Hand mit der Person, die am wenigsten Karten hat. Sorry!',
  aylen:   'Tauschbörse! Du tauschst deine ganze Hand mit der Person, die am wenigsten Karten hat. Sorry!',
  louis:   'Der Dreizack! Die nächste Person bekommt drei Karten von dir geschenkt. Gern geschehen.',
  luis:    'Der Dreizack! Die nächste Person bekommt drei Karten von dir geschenkt. Gern geschehen.',
  bernd:   'Lieferdienst! Die nächste Person bekommt den kompletten Stapel geliefert. Trinkgeld nicht vergessen.',
  niclas:  'Turbo! Die nächsten zwei Leute setzen aus. Niclas ist schon weg.',
  andre:   'Die Souveränin des Äthers betritt den Tisch, Stapel auf 0, alle anderen ziehen eine pädagogisch wertvolle Ehrfurchtskarte!',
  floris:  'Der Boss! Zählt als sechzehn, höher geht es nicht. Und die nächste Person setzt aus.',
  jonas:   'Plot-Twist vom Spielleiter! Die Richtung dreht sich, und du tauschst deine Hand mit der Person, die am meisten Karten hat.',
  maxime:  'Wien-Berlin-Express! Die nächste Person setzt aus und zieht zwei Karten. Zug verpasst.',
  // Club-Karten
  kartoffel:       'Heiße Kartoffel! Wer sie fängt, zieht drei Karten. Schnell weiterwerfen!',
  zwillinge:       'Blick der zwei Welten! Zwillings-Parade ruft zwei Farben aus – die passen jetzt auf ausnahmslos jede Karte!',
  aegis:           'Der goldene Schild der Athena! Vollständiger Schutz und Nachhall bis zu deinem nächsten Zug!',
  spiegel:         'Spieglein, Spieglein! Der Angreifer zieht die volle Strafe, du dämpfst auf zwei Drittel!',
  schwarzes_loch:  'Schwarzes Loch! Der Stapel ist weg, und alle anderen opfern eine Karte – bevorzugt Spezialkarten! Schlürf.',
  zeitstopp:       'Zeitstopp! Stapel auf null, und du bist sofort nochmal dran. Alle anderen: eingefroren.',
  dieb:            'Meisterdieb! Eine gegnerische Handkarte verschwindet spurlos im Schatten. Taschen zuhalten!',
  gluecklich:      'Glücklicher Schelm! Wer zuletzt lacht, lacht am besten – dein Angriff fliegt postwendend zurück!',
  traurig:         'Trauriger Schelm! Geteiltes Leid ist halbes Leid – nimm all meine Tränen und zieh so viele Karten, wie ich noch auf der Hand habe!',
  gluecksspiel:    'Alles auf eine Karte! Die Münze fliegt … vier Karten ziehen oder vier verschenken? Jubeln oder weinen!',
  portal:          'Ein Riss im Raumzeitgefüge! Das Dimensionsportal öffnet sich und beamt die nächste Spezialkarte direkt auf deine Hand!',
  phoenix:         'Wiedergeburt aus Flammen! Die Phönix-Asche lodert auf – der Tischstapel verbrennt zu Asche und du ziehst frisch vom Deck!',
  himmelszorn:     'Göttlicher Blitz! Zeus zielt genau – Spezialkarte verbrannt, oder zieh gefälligst zwei!',
  zeitschleife:    'Die Schlange beißt sich in den Schwanz! Ouroboros dreht die Zeit zurück – Spezialkarte für dich und eine alte Zahl für jemand anderen!',
  erdbeben:        'Tektonischer Schock! Der ganze Tisch wackelt, Stapel weg – und wer zu viele Karten hortet, lässt eine fallen!',
  kettenfluch:     'Kettenfluch! Magische Ketten rasseln – zwei Strafkarten für das gefesselte Opfer! Klirr.',
  pizza_hunger:    'Pizza ist da! Tisch auf null bereinigt – wer mehr als drei Karten hat, zahlt sofort ein Stück Handkarte ab!',
  dzana_zen:       'Gooong! Tief durchatmen: Zwei Handkarten fallen lassen, mentaler Druck weg – aber der Tisch steht jetzt auf Boss-Wert 15!',
  fee_trick:       'Feen-Streich! Verzaubert und bestohlen – Spezialkarte weg, oder zwei Strafkarten für dich!',
  andre_mentor:    'Safe Space vom Gruppenleiter! Stapel auf null – und wer am meisten leidet, kriegt heute pädagogische Soforthilfe.',
  adrian_muster:   'Herr Adrian hat gesprochen! Stapel auf null und nochmal dran. Wer die Musterlösung nicht vorbereitet hat, zieht eine Karte!',
  cookie_chaos:    'Cookie-Crunch! Richtung dreht sich, alle geben eine Karte weiter, und der Stapel bekommt eine Zufallszahl. Chaos!',
  teya_scribbl:    'Scribbl-Meisterwerk! Teyas bunte Farbpalette explodiert – Stapel auf null und die nächste Karte zündet direkt die Farb-Überladung Stufe 3!',
  ayleen_observer: 'Stille Beobachterin! Der Stapel sinkt um fünf, und eine deiner Karten verschwindet unauffällig.',
  niclas_turbo:    'Turbo-Abreise! Die nächsten zwei setzen aus und ziehen je eine Karte. Zu langsam!',
  ruben_firework:  'Großes Feuerwerk! Der Stapel explodiert, und alle verlieren ihre höchste Zahlenkarte. Ooooh!',
  jester_combo:    'Lachen und Weinen! Eine Person mischt ihre ganze Hand neu, die andere zieht drei.',
  igel:            'Raschelndes Laub – der Igel der Blätter rollt an! Du bist nochmal dran und die nächste Person zieht zwei Karten.',
  optimus:         'Autobots, Roll Out! Die Richtung kehrt sich um – und wer im Weg steht, zieht zwei Karten!',
  rucksack:        'Schweres Gepäck! Eine zufällige Person bekommt den gesamten Stapel aufgebürdet!',
  schleim:         'Ich bin kein böser Schleim! Slurp – und weg ist die Karte!',
  daemonenkoenig:  'Glaubst du wirklich, ich müsste mich an deine Spielregeln halten, nur weil es Spielregeln sind?!',
  drache:          'Meine Schuppen sind wie eine Rüstung, meine Zähne wie Schwerter, mein Atem der Tod!',
};

// ─────────────────────────────────────────────────────────────
// KARTENAUSWAHL – der Host entscheidet vor dem Spiel, was mit drin ist.
// DEFAULT_DECK ist das „Grundspiel“: wenig Karten, leicht zu verstehen.
// Selbstgebaute Bomben der Spieler*innen sind immer dabei.
// ─────────────────────────────────────────────────────────────
export const DEFAULT_DECK = {
  voice: true,   // KI-Ansage bei Spezialkarten
  specials: ['reset', 'burn', 'lower', 'reverse', 'skip', 'joker', 'rucksack', 'adrian_muster', 'ruben_firework', 'andre', 'kartoffel', 'gluecksspiel'],
  roles: ['buerger', 'dorfdepp', 'pechvogel', 'held', 'spion'],
};

export const DEFAULT_DECK_PLUS = {
  voice: true,
  specials: [...new Set(['reset', 'burn', 'lower', 'reverse', 'skip', 'joker', 'rucksack', 'adrian_muster', 'ruben_firework', 'andre', 'kartoffel', 'gluecksspiel', ...Object.keys(CHARACTERS)])],
  roles: ['buerger', 'dorfdepp', 'pechvogel', 'held', 'spion', 'berserker', 'magier'],
};

export const SPECIAL_GROUPS = [
  { key: 'basis', name: 'Grundkarten', hint: 'Einfache Effekte – perfekt zum Einstieg.', cards: BASIC_SPECIALS },
  { key: 'charaktere', name: 'Charakterkarten', hint: 'Club-Leute mit je 1–2 Effekten.', cards: CHARACTERS },
  { key: 'club', name: 'Club-Karten', hint: 'Von Mitgliedern erfunden – stärker und wilder.', cards: PLAYER_CARDS },
];

// Alle wählbaren Spezialkarten als flache Liste (für Auswahl-Fenster & Almanach)
export function specialCatalog() {
  return SPECIAL_GROUPS.flatMap((g) => Object.entries(g.cards).map(([key, c]) => ({
    key, group: g.key,
    name: c.name,
    title: c.title || null,
    emoji: c.emoji, by: c.by || c.character || null,
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
