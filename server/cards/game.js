// „TOPP DAS!“ – die komplette Spiellogik. Läuft nur auf dem Server.
// Spieler*innen haben eine feste ID (pid), die das Handy sich merkt – so kommt man nach
// Sperrbildschirm oder Funkloch wieder auf denselben Platz zurück.
// Jede*r bekommt eine eigene Sicht (view): die eigene Hand ganz, von den anderen nur die Anzahl.

import { randomUUID } from 'node:crypto';
import { STAKE_DEFAULTS, STAKE_KINDS, STAKE_LIMITS } from '../../shared/stakes.js';
import { QUIZ, QUIZ_RULES } from '../../shared/quiz.js';
import { RULES, BASIC_SPECIALS, CHARACTERS, PLAYER_CARDS, JESTER_COMBO, ROLES, EFFECTS, VOICE_LINES, DEFAULT_DECK, cleanDeckChoice, cardText, describe, validateEffects, COLOR_ELEMENTS, COLOR_RESONANCE_TOLERANCE } from '../../shared/cards.js';

let nextCardId = 1;
const card = (props) => ({ id: nextCardId++, ...props });

export class CardRoom {
  constructor(id) {
    this.id = id;
    this.players = [];        // Sitzreihenfolge = Spielreihenfolge im Uhrzeigersinn
    this.state = 'lobby';     // 'lobby' | 'playing' | 'over'
    this.log = [];
    this.game = 0;            // zählt Spiele hoch – der Browser erkennt daran „neues Spiel → Intro zeigen“
    this.deckChoice = { voice: DEFAULT_DECK.voice, specials: [...DEFAULT_DECK.specials], roles: [...DEFAULT_DECK.roles] }; // wählt der Host
    // Einsatz: Optionen + Stimmen für Gewinner-Belohnung und Verlierer-Strafe (bleiben über Runden bestehen)
    this.stakeOptions = {};
    for (const kind of STAKE_KINDS) this.stakeOptions[kind] = STAKE_DEFAULTS[kind].map((text, i) => ({ id: `${kind}-${i}`, text, by: null }));
    this.stakeVotes = { reward: new Map(), punish: new Map() };   // pid → optionId
    this.stakeSeq = 0;
    this.stake = null;        // beim Start festgelegt: { reward: {text, by, votes}, punish: {…} }
    this.reset();
  }

  reset() {
    this.deck = [];
    this.pile = [];
    this.top = 0;             // Wert, der getoppt werden muss (0 = alles geht)
    this.lower = false;       // „Unter“ aktiv: nächste Karte muss ≤ top sein
    this.dir = 1;             // 1 = Uhrzeigersinn, -1 = andersrum
    this.turn = 0;            // Index in this.players
    this.winner = null;
    this.ranking = null;
    this.awards = null;
    this.introUntil = 0;
    this.wild = null;         // Zwillings-Parade: { colors: [a, b], owner } – diese Farben passen auf alles
    this.colorStreak = { color: null, count: 0 }; // Farb-Kette für Elementar-Überladung (3x gleiche Farbe)
    this.lastAction = null;   // Letzter Spielzug für die Info-Pille am Tisch
    this.chainEvent = null;   // Aktiver Chain-Banner (Yu-Gi-Oh / Master Duel Effekt-Popup)
    this.chainEventId = 0;
    this.botPending = null;
    for (const p of this.players || []) {
      delete p.aegisEcho;
      delete p.aegisEchoArmed;
      delete p._lastAegisEcho;
      delete p.trinkgeld;
      delete p.mimicTarget;
      delete p.mimicTargetName;
      delete p.mimicRole;
    }
    this.quiz = null;         // laufende Quizfrage
    this.quizResult = null;   // letzte Auflösung (für das Banner)
    this.quizSeq = 0;
    this.nextQuizAt = 0;
  }

  triggerChainEvent(evt) {
    this.chainEventId = (this.chainEventId || 0) + 1;
    this.chainEvent = { id: this.chainEventId, time: Date.now(), ...evt };
  }

  // 🗣️ KI-Ansage für alle: was die gerade gelegte Spezialkarte macht (abschaltbar in der Kartenauswahl)
  voiceFor(p, key, fallback, secretVoice = null) {
    if (this.deckChoice.voice === false) return null;
    if (secretVoice) {
      return { key: null, line: secretVoice, by: p.id, skipped: false, secret: true };
    }
    const line = VOICE_LINES[key] ?? fallback;
    return line ? { key: VOICE_LINES[key] ? key : null, line, by: p.id, skipped: false } : null;
  }

  // ✨ Geheime Lore-Interaktionen: besondere Sprüche bei bestimmten Karten-Kombos
  checkSecretLoreVoice(cards, pile, p) {
    if (!cards || !cards.length || !pile || !pile.length) return null;
    const sp = cards[0];
    const prev1 = pile[pile.length - 1];
    const prev2 = pile.length >= 2 ? pile[pile.length - 2] : null;

    const isKey = (c, ...keys) => {
      if (!c) return false;
      return keys.some((k) => c.key === k || c.ability === k);
    };

    // 💧 Schleim nach 🐉 Drache (Smaug)
    if (isKey(sp, 'schleim', 'slimeGluttony') && isKey(prev1, 'drache', 'dragonHoard')) {
      return 'Drachen-Verschlinger! Der Schleim schließt ein ewiges Bündnis mit dem Drachen!';
    }

    // 🏹 Meisterschütze auf 🐉 Drache (Smaug)
    if (isKey(prev1, 'drache', 'dragonHoard') && p && (this.hasRole(p, 'meisterschuetze') || this.hasRole(p, 'marksman'))) {
      return 'Der Schwarze Pfeil trifft die kahle Stelle an der linken Brust! Smaug stürzt herab!';
    }

    if (sp.kind !== 'special') return null;

    const isColor = (c, col) => {
      if (!c || !c.color) return false;
      if (col === 'gelb') return c.color === 'gelb' || c.color === '#ffd23d';
      if (col === 'rot') return c.color === 'rot' || c.color === '#ff3d7f';
      if (col === 'blau') return c.color === 'blau' || c.color === '#3dc6ff';
      if (col === 'gruen') return c.color === 'gruen' || c.color === '#5cff8a';
      return c.color === col;
    };

    // ── 1. FARB-VORBEDINGUNGEN (je 2 pro Farbe) ──
    // Gelb 1: 🚛 Optimus Prime nach 2 gelben Karten
    if (isKey(sp, 'optimus') && isColor(prev1, 'gelb') && isColor(prev2, 'gelb')) {
      return 'Bumblebee, sicher die Flanke! Autobots, Transformation und Abmarsch!';
    }
    // Gelb 2: ⚡ Göttlicher Blitz nach 2 gelben Karten
    if (isKey(sp, 'himmelszorn', 'divineWrath') && isColor(prev1, 'gelb') && isColor(prev2, 'gelb')) {
      return 'Doppelte Blitzladung im Gewitter! Zeus entfesselt den göttlichen Donnerkeil!';
    }

    // Rot 1: 🐦‍🔥 Phönix-Asche nach 2 roten Zahlenkarten
    if (isKey(sp, 'phoenix') && isColor(prev1, 'rot') && prev1?.kind === 'number' && isColor(prev2, 'rot') && prev2?.kind === 'number') {
      return 'Aus der doppelten roten Glut neu geboren! Die Asche erwacht zu ewigem Leben!';
    }
    // Rot 2: 🎆 Pyrotechnik-Knall nach 2 roten Karten
    if (isKey(sp, 'ruben_firework', 'fireworkBlast') && isColor(prev1, 'rot') && isColor(prev2, 'rot')) {
      return 'Doppelter roter Funkenflug! Ruben zündet das spektakulärste Club-Feuerwerk!';
    }

    // Blau 1: 🔱 Luis (Der Dreizack) nach 2 blauen Karten
    if (isKey(sp, 'louis', 'luis') && isColor(prev1, 'blau') && isColor(prev2, 'blau')) {
      return 'Doppelte Meeresflut! Poseidons Dreizack beherrscht den Ozean!';
    }
    // Blau 2: 🌀 Dimensionsportal nach 2 blauen Karten
    if (isKey(sp, 'portal') && isColor(prev1, 'blau') && isColor(prev2, 'blau')) {
      return 'Saphirblaue Resonanz! Das Portal reißt einen Riss direkt in eine andere Dimension!';
    }

    // Grün 1: 🦔 Igel der Blätter nach 2 grünen Karten
    if (isKey(sp, 'igel', 'leaves') && isColor(prev1, 'gruen') && isColor(prev2, 'gruen')) {
      return 'Mitten durch das dichte grüne Blätterdickicht! Raschelndes Laub kündigt den Igel an!';
    }
    // Grün 2: 🧘 Džanas Zen-Gong nach 2 grünen Karten
    if (isKey(sp, 'dzana_zen', 'zenBuff', 'zenGong') && isColor(prev1, 'gruen') && isColor(prev2, 'gruen')) {
      return 'Im grünen Bambushain der Ruhe – der Gong ertönt im perfekten Zen!';
    }

    // ── 2. SELTENE CHARAKTER- & KARTEN-INTERAKTIONEN ──
    // 🍪 + 🍕 Club-Gelage: Pizza auf Cookie oder Cookie auf Pizza
    if ((isKey(sp, 'pizza_hunger') && isKey(prev1, 'cookie_chaos')) || (isKey(sp, 'cookie_chaos') && isKey(prev1, 'pizza_hunger'))) {
      return 'Pizza und Cookies auf einmal?! Wer räumt diese gigantische Club-Küche wieder auf?!';
    }

    // 🎨 Teyas Scribbl-Meisterwerk nach 1 Snack (Cookie-Crunch oder Pizza-Raid)
    if (isKey(sp, 'teya_scribbl', 'teyaScribbl') && isKey(prev1, 'cookie_chaos', 'pizza_hunger')) {
      return 'Erst ein Snack zur Stärkung – und jetzt entsteht das nächste Scribbl-Meisterwerk!';
    }

    // ♾️ Ouroboros nach ⏳ Chronos-Siegel (Zeitstopp)
    if (isKey(sp, 'zeitschleife', 'timeloop') && isKey(prev1, 'zeitstopp', 'timestop')) {
      return 'Raumzeit-Paradoxon! Die ewige Schlange beißt Chronos direkt in die Sanduhr!';
    }

    // 🌰 Floris (Kastanie) ↔ 🍄 Luis / Pilzi (Schelme): Waldläufer-Allianz!
    if (isKey(sp, 'floris') && isKey(prev1, 'gluecklich', 'traurig', 'luckyJester', 'sadJester')) {
      return 'Waldläufer-Allianz! Pilze und Kastanien halten im Unterholz zusammen!';
    }
    if (isKey(sp, 'gluecklich', 'traurig', 'luckyJester', 'sadJester') && isKey(prev1, 'floris')) {
      return 'Waldläufer-Allianz! Pilz-Power trifft auf Kastanienstachel!';
    }

    // 🎒 Der Rucksack nach 🚚 Bernd (Lieferdienst)
    if (isKey(sp, 'rucksack') && isKey(prev1, 'bernd')) {
      return 'Lieferung im Rucksack verstaut: Bernd schnallt das schwere Gepäck auf den Rücken!';
    }

    // 📋 Adrian (Musterlösung) nach 🎮 Jonas (Spielleiter)
    if (isKey(sp, 'adrian_muster', 'masterSolution') && isKey(prev1, 'jonas')) {
      return 'Der Spielleiter übergibt an den Chef: Bitte alle mitschreiben, jetzt kommt die Musterlösung!';
    }

    // 🏛️ Sanctuary-Protokoll nach 🌋 Tektonischer Schock
    if (isKey(sp, 'andre_mentor', 'sanctuary') && isKey(prev1, 'erdbeben', 'earthquake')) {
      return 'Nach dem tektonischen Beben: Das Sanctuary-Protokoll baut die sichere Rettungszone auf!';
    }

    // 🎒 Heißer Rucksack: Rucksack auf Heiße Kartoffel
    if (isKey(sp, 'rucksack') && isKey(prev1, 'kartoffel', 'potato')) {
      return 'Vorsicht, Verbrennungsgefahr! Jemand hat die glühend heiße Kartoffel im Rucksack versteckt!';
    }

    // 🔥 Feuer nach 🥔 Heiße Kartoffel
    if (isKey(sp, 'burn') && isKey(prev1, 'kartoffel', 'potato')) {
      return 'Heiße Kartoffel ins offene Lagerfeuer geworfen! Kross gebacken und mundgerecht verbrannt!';
    }

    // 👀 Stille Beobachterin (Ayleen) nach 🥷 Meisterdieb
    if (isKey(sp, 'ayleen_observer', 'ayleenObserver') && isKey(prev1, 'dieb', 'thief')) {
      return 'Erwischt! Die stille Beobachterin hat den Meisterdieb auf frischer Tat ertappt!';
    }

    // 💱 Ayleen (Tauschbörse) nach 🥷 Meisterdieb
    if (isKey(sp, 'ayleen') && isKey(prev1, 'dieb', 'thief')) {
      return 'Erst im Schatten beklaut, dann getauscht: Willkommen auf dem Schwarzmarkt der Tauschbörse!';
    }

    // 🛑 Notbremse im Orient-Express: Stopp nach Maxime
    if (isKey(sp, 'skip') && isKey(prev1, 'maxime')) {
      return 'Notbremse gezogen! Der Orient-Express quietscht funkensprühend zum Stillstand!';
    }

    // 🚂 Maxime (Orient-Express) nach 🏎️ Niclas (Turbo / Turbo-Abreise)
    if (isKey(sp, 'maxime') && isKey(prev1, 'niclas', 'niclas_turbo', 'turboDash')) {
      return 'Wettrennen zwischen Gleis und Rollfeld: Der Orient-Express überholt den Niclas-Turbo!';
    }

    // 🏎️ Niclas (Turbo) nach 🌋 Tektonischer Schock
    if (isKey(sp, 'niclas', 'niclas_turbo', 'turboDash') && isKey(prev1, 'erdbeben', 'earthquake')) {
      return 'Der Boden bebt – nichts wie weg! Niclas startet die Turbinen im Katastrophengebiet!';
    }

    // 👑 Souveränin des Äthers nach 🕳️ Schwarzes Loch
    if (isKey(sp, 'andre') && isKey(prev1, 'schwarzes_loch', 'blackHole')) {
      return 'Das Schwarze Loch weicht: Die Souveränin des Äthers stellt die kosmische Ordnung wieder her!';
    }

    // 🥷 Meisterdieb nach 🧚‍♀️ Feen-Streich
    if (isKey(sp, 'dieb', 'thief') && isKey(prev1, 'fee_trick', 'fairyTrick')) {
      return 'Auf frischer Tat ertappt: Der Meisterdieb schleicht sich an die Feenkönigin heran!';
    }

    // 👑 Dämonenkönig nach 👑 Souveränin des Äthers (André)
    if (isKey(sp, 'daemonenkoenig', 'anosLogic') && isKey(prev1, 'andre')) {
      return 'Audienz der Tyrannen! Die Herrscher von Dämonen und Äther blicken auf den Tisch herab!';
    }
    if (isKey(sp, 'andre') && isKey(prev1, 'daemonenkoenig', 'anosLogic')) {
      return 'Audienz der Tyrannen! Die Herrscher von Dämonen und Äther blicken auf den Tisch herab!';
    }

    // ── 3. SELTENE ZAHLEN-VORBEDINGUNGEN ──
    // ⚡ Göttlicher Blitz auf gelbe Unglückszahl 13
    if (isKey(sp, 'himmelszorn', 'divineWrath') && prev1?.value === 13 && isColor(prev1, 'gelb')) {
      return 'Zorn des Pantheons! Dreizehnfach geladener Blitz zerschmettert das Unglück!';
    }

    // ⛓️ Kettenfluch auf Unglückszahl 13
    if (isKey(sp, 'kettenfluch', 'chainCurse') && prev1?.value === 13) {
      return 'Freitag der Dreizehnte! Bei Unglückszahl 13 schnappen die Äther-Ketten gnadenlos zu!';
    }

    // ⬇️ Unter auf Tischwert 15 (Boss-Höchstwert)
    if (isKey(sp, 'lower') && prev1?.value === 15) {
      return 'Hochmut kommt vor dem Fall! Vom Gipfel der 15 fährt der Fahrstuhl direkt nach unten!';
    }

    // 📋 Die Musterlösung auf Höchstwert 15 (oder Boss 16)
    if (isKey(sp, 'adrian_muster', 'masterSolution') && (prev1?.value === 15 || prev1?.value === 16)) {
      return 'Prüfung mit Auszeichnung bestanden! Adrian legt die Musterlösung auf den Maximalwert!';
    }

    // 🏛️ Sanctuary-Protokoll auf Tiefstwert 1
    if (isKey(sp, 'andre_mentor', 'sanctuary') && prev1?.value === 1) {
      return 'Vom tiefsten Punkt neu aufgebaut: Das Sanctuary-Protokoll bietet sicheren Schutz!';
    }

    // 👑 Floris (Boss 16) auf Zahl 1
    if (isKey(sp, 'floris') && prev1?.value === 1) {
      return 'Vom Tellerwäscher zum Millionär! Von der 1 katapultiert Floris direkt auf die Boss-Ebene!';
    }

    // 🪙 Glücksspiel nach zwei 7ern (7 + 7)
    if (isKey(sp, 'gluecksspiel', 'gamble') && prev1?.value === 7 && prev2?.value === 7) {
      return 'Doppel-Sieben am Spielautomaten! Jackpot-Alarm beim Münzwurf!';
    }

    // ♊ Zwillings-Parade nach einem Zahlen-Pasch (zwei gleiche Zahlen)
    if (isKey(sp, 'zwillinge', 'twins') && prev1?.kind === 'number' && prev2?.kind === 'number' && prev1?.value === prev2?.value) {
      return 'Zwillings-Resonanz! Ein echter Pasch ruft die Zwillings-Parade der zwei Welten herbei!';
    }

    // ♾️ Ouroboros nach einem Zahlen-Pasch
    if (isKey(sp, 'zeitschleife', 'timeloop') && prev1?.kind === 'number' && prev2?.kind === 'number' && prev1?.value === prev2?.value) {
      return 'Die Zwillings-Zeitschleife schließt sich! Ouroboros frisst die Endlosschleife auf!';
    }

    return null;
  }

  // Wer die Karte gelegt hat, darf die Ansage für alle überspringen
  skipVoice(pid) {
    const v = this.chainEvent?.voice;
    if (!v || v.by !== pid) return { error: 'Nur wer die Karte gelegt hat, kann überspringen.' };
    v.skipped = true;
    return { ok: true };
  }

  setLastAction(text, icon = '🃏') {
    this.lastAction = { text, icon, time: Date.now() };
  }

  hasRole(p, roleName) {
    if (!p) return false;
    if (p.mimicRole) {
      if (p.mimicRole === roleName) return true;
      const mr = ROLES[p.mimicRole];
      if (mr?.ability === roleName) return true;
    }
    if (!p.role) return false;
    if (p.role === roleName) return true;
    const r = ROLES[p.role];
    return r?.ability === roleName;
  }

  // ── Leute ──────────────────────────────────────────────────
  addPlayer(pid, { name, avatar, special }) {
    const back = this.players.find((p) => p.id === pid);
    if (back?.bot) return { error: 'Dieser Platz gehört einem Bot.' };
    if (back) {                                   // Wiederkehr nach Verbindungsabbruch
      back.connected = true;
      back.awaySince = 0;
      if (avatar) back.avatar = avatar;
      this.say(`${back.name} ist wieder da.`);
      return { ok: true, rejoined: true };
    }
    if (this.players.length >= RULES.maxPlayers) return { error: 'Tisch ist voll.' };
    const effects = special?.effects ? validateEffects(special.effects) : null;
    const playerSpecial = effects && effects.length ? {
      name: String(special?.name || `${name}s Bombe`).slice(0, 24),
      art: special?.art || null,
      effects,
    } : null;
    this.players.push({
      id: pid, name, avatar, hand: [], role: null, inGame: false, connected: true, awaySince: 0,
      special: playerSpecial,
      stats: { resonance: 0, pileCards: 0, drawnCards: 0, specials: 0 },
    });
    this.say(this.state === 'playing' ? `${name} schaut zu und steigt nächste Runde ein.` : `${name} ist da.`);
    return { ok: true };
  }

  // Bots bleiben echte Mitspieler: dieselben Züge und Regeln, keine fremden Hände.
  addBot(byId) {
    if (this.host()?.id !== byId) return { error: 'Nur der Host kann Bots hinzufügen.' };
    if (this.state === 'playing') return { error: 'Bots nur zwischen den Spielen ändern.' };
    const id = `bot-${randomUUID()}`;
    const available = [];
    for (let i = 1; i <= 8; i++) {
      if (!this.players.some((p) => p.name === `Bot ${i}`)) available.push(i);
    }
    const n = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : this.players.filter((p) => p.bot).length + 1;
    const result = this.addPlayer(id, { name: `Bot ${n}`, avatar: null, special: null });
    if (result.ok) this.players.find((p) => p.id === id).bot = true;
    return result;
  }

  removeBot(byId, botId) {
    if (this.host()?.id !== byId) return { error: 'Nur der Host kann Bots entfernen.' };
    if (this.state === 'playing') return { error: 'Bots nur zwischen den Spielen ändern.' };
    if (!this.players.some((p) => p.id === botId && p.bot)) return { error: 'Bot nicht gefunden.' };
    this.removePlayer(botId);
    return { ok: true };
  }

  playBot() {
    const p = this.current();
    if (this.state !== 'playing' || !p?.bot || Date.now() < this.introUntil) return false;
    const others = this.active().filter((o) => o !== p).sort((a, b) => a.hand.length - b.hand.length);
    const groups = new Map();
    for (const c of p.hand.filter((c) => c.kind === 'number')) {
      if (!groups.has(c.value)) groups.set(c.value, []);
      groups.get(c.value).push(c);
    }
    const cappedGroups = new Map();
    for (const [val, list] of groups.entries()) {
      cappedGroups.set(val, list.slice(0, 3));
    }
    // Erst möglichst viele Zahlen loswerden (maximal 3 pro Zahl); hohe Werte als Reserve halten.
    const numbers = [...cappedGroups.values(), ...p.hand.filter((c) => c.kind === 'number').map((c) => [c])]
      .sort((a, b) => b.length - a.length || (this.lower ? b[0].value - a[0].value : a[0].value - b[0].value));
    const trinkgeldCombos = [];
    if (p.trinkgeld && cappedGroups.size >= 2) {
      const groupArr = [...cappedGroups.values()];
      for (let i = 0; i < groupArr.length; i++) {
        for (let j = i + 1; j < groupArr.length; j++) {
          trinkgeldCombos.push([...groupArr[i], ...groupArr[j]]);
        }
      }
      trinkgeldCombos.sort((a, b) => b.length - a.length);
    }
    const specials = p.hand.filter((c) => c.kind === 'special').map((c) => [c]);
    const happy = p.hand.find((c) => c.ability === 'luckyJester');
    const sad = p.hand.find((c) => c.ability === 'sadJester');
    const combos = happy && sad && others.length >= 2 ? [[happy, sad]] : [];
    for (const cards of [...trinkgeldCombos, ...combos, ...numbers, ...specials]) {
      if (this.whyNot(cards)) continue;
      const c = cards[0];
      const targets = c.ability === 'potato' ? others.filter((o) => o.id !== c.cameFrom) : others;
      const target = targets[0] ?? others[0];
      const colors = [...RULES.colors].sort((a, b) =>
        p.hand.filter((x) => x.color === b).length - p.hand.filter((x) => x.color === a).length).slice(0, 2);
      const result = this.play(p.id, { ids: cards.map((c) => c.id), choice: {
        target: target?.id, targets: others.slice(0, 2).map((o) => o.id), colors,
      } });
      if (result.ok) return true;
    }
    return !!this.take(p.id).ok;
  }

  // Verbindung weg: im laufenden Spiel Platz freihalten, sonst sofort gehen
  disconnect(pid) {
    const p = this.players.find((o) => o.id === pid);
    if (!p) return;
    if (this.state !== 'playing' || !p.inGame) return this.removePlayer(pid);
    p.connected = false;
    p.awaySince = Date.now();
    this.say(`📵 ${p.name} hat die Verbindung verloren …`);
  }

  removePlayer(pid) {
    const i = this.players.findIndex((p) => p.id === pid);
    if (i < 0) return;
    const wasTurn = this.state === 'playing' && i === this.turn;
    const [p] = this.players.splice(i, 1);
    this.say(`${p.name} ist weg.`);
    if (this.state !== 'playing') return;
    this.deck.unshift(...p.hand);
    if (i < this.turn) this.turn--;
    if (this.turn >= this.players.length) this.turn = 0;
    if (this.active().length < 2) return this.finish(this.active()[0] ?? null);
    // Wer jetzt auf dem Platz sitzt, war eigentlich schon „als Nächstes“ dran
    if (wasTurn && this.dir === -1) this.advance(1);
    else if (!this.current().inGame) this.advance(1);
  }

  // Jede Sekunde vom Server aufgerufen: Abwesende überspringen bzw. rausnehmen.
  // Gibt true zurück, wenn sich etwas geändert hat.
  tick(now = Date.now()) {
    if (this.state !== 'playing') return false;
    let changed = false;
    for (const p of [...this.players]) {
      if (!p.connected && now - p.awaySince > RULES.awayKickSeconds * 1000) {
        this.removePlayer(p.id);
        changed = true;
      }
    }
    const cur = this.current();
    if (this.state === 'playing' && cur && !cur.connected && now - cur.awaySince > RULES.awaySkipSeconds * 1000
        && now - (cur.lastSkipped || 0) > RULES.awaySkipSeconds * 1000) {
      cur.lastSkipped = now;
      this.say(`⏭️ ${cur.name} ist nicht da – wird übersprungen.`);
      this.advance(1);
      changed = true;
    }
    changed = this.quizTick(now) || changed;
    const bot = this.current();
    if (this.state === 'playing' && bot?.bot && now >= this.introUntil
        && this.players.some((p) => !p.bot && p.connected)) {
      if (this.botPending?.id !== bot.id) this.botPending = { id: bot.id, due: now + 1500 };
      if (now >= this.botPending.due) {
        this.botPending = null;
        changed = this.playBot() || changed;
      }
    } else this.botPending = null;
    return changed;
  }

  // ── Kartenauswahl (nur Host, nur zwischen den Spielen) ──────
  configure(byId, choice) {
    if (this.state === 'playing') return { error: 'Während des Spiels nicht änderbar.' };
    if (this.host()?.id !== byId) return { error: 'Nur der Host wählt die Karten.' };
    const clean = cleanDeckChoice(choice);
    if (!clean) return { error: 'Mindestens 1 Rolle muss dabei sein.' };
    this.deckChoice = clean;
    return { ok: true };
  }

  // ── Spielstart ────────────────────────────────────────────
  start(byId) {
    if (this.state === 'playing') return { error: 'Läuft schon.' };
    if (this.host()?.id !== byId) return { error: 'Nur der Host startet.' };
    if (this.players.filter((p) => p.connected).length < 2) return { error: 'Mindestens 2 Leute.' };
    this.players = this.players.filter((p) => p.connected);
    this.reset();
    this.stake = this.lockStakes();
    this.state = 'playing';
    this.game++;
    this.log = [];
    this.introUntil = Date.now() + RULES.introSeconds * 1000;
    this.nextQuizAt = this.introUntil + (Number(process.env.QUIZ_FIRST) || QUIZ_RULES.firstAfterSeconds) * 1000;   // QUIZ_FIRST nur zum Testen

    // Deck: nur Zahlenkarten (bei vielen Leuten doppelt). Specials gibt es nur über das Los.
    const copies = this.players.length > 4 ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      for (const color of RULES.colors) {
        for (let v = RULES.minValue; v <= RULES.maxValue; v++) this.deck.push(card({ kind: 'number', value: v, color }));
      }
    }
    shuffle(this.deck);

    // Los-Topf: alle selbstgebauten Bomben + die Spezialkarten, die der Host ausgewählt hat
    const chosen = new Set(this.deckChoice.specials);
    const pick = (obj) => Object.entries(obj).filter(([key]) => chosen.has(key));
    const customCards = this.players
      .filter((p) => p.special && p.special.effects?.length)
      .map((p) => card({ kind: 'special', key: 'custom', owner: p.id, by: p.name, name: p.special.name, emoji: '💣', effects: p.special.effects }));

    const pot = shuffle([
      ...customCards,
      ...pick(CHARACTERS).map(([key, ch]) => card({ kind: 'special', key, name: ch.name, title: ch.title, emoji: ch.emoji, effects: ch.effects, art: ch.art ?? `/card-art/${key}.jpg`, fullArt: !!ch.fullArt })),
      ...pick(BASIC_SPECIALS).map(([key]) => basicCard(key)),
      ...pick(PLAYER_CARDS).map(([key, c]) => card({ kind: 'special', key, effects: [], ...c })),
    ]);

    for (const p of this.players) {
      p.inGame = true;
      p.role = pickRole(this.deckChoice.roles);
      p.stats = { resonance: 0, pileCards: 0, drawnCards: 0, specials: 0 };
      // Ausgeloste Specials: Standardmäßig RULES.specialsStart (2), Erzmagier bekommt 3
      const count = (this.hasRole(p, 'magier') || this.hasRole(p, 'mage')) ? 3 : (RULES.specialsStart || 2);
      const drawnCards = [];
      // Garantierte Club- oder Charakterkarte pro Person (falls im Topf)
      const clubIdx = pot.findIndex((c) => (c.by || c.title) && c.owner !== p.id && !drawnCards.includes(c));
      if (clubIdx >= 0) drawnCards.push(pot.splice(clubIdx, 1)[0]);
      for (let s = drawnCards.length; s < count; s++) {
        const i = pot.findIndex((c) => c.owner !== p.id && !drawnCards.includes(c));
        if (i >= 0) drawnCards.push(pot.splice(i, 1)[0]);
        else if (pot.length) drawnCards.push(pot.pop());
      }
      p.drawn = drawnCards[0] || null;
      p.hand = [...drawnCards];
      const size = Math.max(3, RULES.handSize + (ROLES[p.role]?.cards || 0));
      while (p.hand.length < size && this.deck.length) p.hand.push(this.deck.pop());
      sortHand(p.hand);
    }

    // 🦎 Mimik wählt verdeckt eine Zielperson und übernimmt deren Rolle
    for (const p of this.players) {
      if (this.hasRole(p, 'mimik') || this.hasRole(p, 'mimic')) {
        const others = this.players.filter((o) => o !== p);
        if (others.length > 0) {
          const nonMimics = others.filter((o) => o.role !== 'mimik' && ROLES[o.role]?.ability !== 'mimic');
          const pool = nonMimics.length > 0 ? nonMimics : others;
          const target = pool[Math.floor(Math.random() * pool.length)];
          p.mimicTarget = target.id;
          p.mimicTargetName = target.name;
          p.mimicRole = target.role;
        }
      }
    }
    // Alle verbleibenden Spezialkarten aus dem Los-Topf wandern direkt in das Deck!
    // Dadurch können während des Spiels jederzeit neue Spezialkarten nachgezogen werden.
    this.deck.push(...pot);
    shuffle(this.deck);

    this.turn = Math.floor(Math.random() * this.players.length);
    this.say(`Neues Spiel! ${this.current().name} fängt an.`);
    return { ok: true };
  }

  // ── Züge ───────────────────────────────────────────────────
  // payload: entweder [Karten-IDs] oder { ids, choice: { target, targets, colors } }
  play(id, payload) {
    const cardIds = Array.isArray(payload) ? payload : payload?.ids;
    const choice = (!Array.isArray(payload) && payload?.choice) || {};
    const p = this.current();
    if (this.state !== 'playing' || p?.id !== id) return { error: 'Du bist nicht dran.' };
    if (Date.now() < this.introUntil) return { error: 'Kurz warten – die Lose laufen noch 🎰' };
    if (!Array.isArray(cardIds) || !cardIds.length) return { error: 'Keine Karte gewählt.' };
    const cards = cardIds.map((cid) => p.hand.find((c) => c.id === cid));
    if (cards.some((c) => !c) || new Set(cardIds).size !== cardIds.length) return { error: 'Karte nicht auf deiner Hand.' };
    const why = this.whyNot(cards);
    if (why) return { error: why };

    // 🥔 wird weitergereicht, nicht abgelegt
    if (cards[0].ability === 'potato') return this.passPotato(p, cards[0], choice.target);

    // Auswahl prüfen, BEVOR Karten die Hand verlassen
    const opp = (tid) => this.active().find((o) => o.id === tid && o !== p);
    const combo = cards.length === 2 && cards[0].kind === 'special';
    if (combo && !(opp(choice.targets?.[0]) && opp(choice.targets?.[1]) && choice.targets[0] !== choice.targets[1])) return { error: 'Wähle zwei verschiedene Personen.' };
    if (!combo && cards[0].ability === 'sadJester' && !opp(choice.target)) return { error: 'Wähle, wer mit dir weinen soll.' };
    if (!combo && cards[0].ability === 'thief' && !opp(choice.target)) return { error: 'Wähle, wen du beklauen möchtest.' };
    if (!combo && cards[0].ability === 'divineWrath' && !opp(choice.target)) return { error: 'Wähle, wen der Göttliche Blitz treffen soll.' };
    if (!combo && cards[0].ability === 'chainCurse' && !opp(choice.target)) return { error: 'Wähle, wen der Kettenfluch treffen soll.' };
    if (!combo && cards[0].ability === 'fairyTrick' && !opp(choice.target)) return { error: 'Wähle, wer vom Feen-Streich verzaubert wird.' };
    if (cards[0].ability === 'twins') {
      const cs = choice.colors;
      if (!Array.isArray(cs) || cs.length !== 2 || cs[0] === cs[1] || !cs.every((c) => RULES.colors.includes(c))) return { error: 'Wähle zwei Farben.' };
    }

    const prevTop = this.top;
    const prevLower = this.lower;
    const prevTopCard = this.pile[this.pile.length - 1];
    const isResonantPlay = Boolean(prevTopCard && prevTopCard.color && cards[0].kind === 'number' &&
      cards.every((c) => c.color === prevTopCard.color));
    const resonanceBonusTriggered = isResonantPlay && (
      (!prevLower && cards[0].value < prevTop) ||
      (prevLower && cards[0].value > prevTop)
    );

    const prevCardsOnPile = this.pile.slice();
    const secretVoice = this.checkSecretLoreVoice(cards, prevCardsOnPile, p);

    p.hand = p.hand.filter((c) => !cardIds.includes(c.id));
    this.pile.push(...cards);

    if (cards[0].kind === 'number') {
      if (isResonantPlay) {
        p.stats.resonance = (p.stats.resonance || 0) + cards.length;
      }
      this.top = cards[0].value;
      this.lower = false;
      const elem = COLOR_ELEMENTS[cards[0].color];
      const elemIcon = elem?.icon || '';
      const isHeldenmut = (this.hasRole(p, 'held') || this.hasRole(p, 'hero')) && (p.hand.length <= 2) && prevTop > 0 && (
        (!prevLower && cards[0].value < prevTop) ||
        (prevLower && cards[0].value > prevTop)
      ) && !resonanceBonusTriggered;

      const isMeisterschuetzeHit = (this.hasRole(p, 'meisterschuetze') || this.hasRole(p, 'marksman')) && (prevTop >= 12 || prevTopCard?.value === 16 || prevTopCard?.key === 'floris') && (
        (!prevLower && cards[0].value < prevTop) ||
        (prevLower && cards[0].value > prevTop)
      ) && !resonanceBonusTriggered;

      const isGezinkteWuerfel = (this.hasRole(p, 'gluecksspieler') || this.hasRole(p, 'gambler')) && prevTop > 0 && (
        (!prevLower && cards[0].value < prevTop) ||
        (prevLower && cards[0].value > prevTop)
      ) && !resonanceBonusTriggered && ((cards[0].value % 2) !== (prevTop % 2));

      if (secretVoice) {
        this.say(`✨ Geheime Interaktion: ${secretVoice}`);
        this.triggerChainEvent({
          title: 'Geheime Interaktion!',
          desc: secretVoice,
          emoji: '🏹',
          actor: p.name,
          voice: this.voiceFor(p, null, secretVoice, secretVoice),
        });
      } else if (isHeldenmut) {
        this.say(`🦸 ${p.name} (Held*in) beweist Heldenmut: Ignoriert die Tisch-Zahl!`);
        this.setLastAction(`${p.name}: Heldenmut ${cards[0].value}`, '🦸');
        this.triggerChainEvent({
          title: 'Heldenmut!',
          desc: `${p.name} ignoriert den Tischwert (${cards[0].value} auf ${prevTop})!`,
          emoji: '🦸',
          actor: p.name,
          voice: this.voiceFor(p, null, 'Heldenmut! Ein wahrer Held gibt niemals auf!'),
        });
      } else if (isMeisterschuetzeHit) {
        this.say(`🏹 ${p.name} (Meisterschütze) trifft die Schwachstelle: Ignoriert Tischwert ${prevTop}!`);
        this.setLastAction(`${p.name}: Präzisions-Schuss ${cards[0].value}`, '🏹');
        this.triggerChainEvent({
          title: 'Präzisions-Schuss!',
          desc: `${p.name} zielt auf Schwachstelle (${cards[0].value} auf ${prevTop})!`,
          emoji: '🏹',
          actor: p.name,
          voice: this.voiceFor(p, null, 'Schuss ins Schwarze! Die Schwachstelle ist getroffen!'),
        });
      } else if (isGezinkteWuerfel) {
        this.say(`🎲 ${p.name} (Glücksspieler) hebelt mit gezinkten Würfeln die Regeln aus!`);
        this.setLastAction(`${p.name}: Gezinkte Würfel`, '🎲');
        this.triggerChainEvent({
          title: 'Gezinkte Würfel!',
          desc: `${p.name} hebelt mit gezinkten Würfeln die Regeln aus!`,
          emoji: '🎲',
          actor: p.name,
          voice: this.voiceFor(p, null, 'Gezinkte Würfel! Das Haus gewinnt immer!'),
        });
      } else if (resonanceBonusTriggered) {
        this.say(`🎵 Farb-Resonanz! ${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value} ${elemIcon} auf ${prevTop}.`);
        this.setLastAction(`${p.name}: Resonanz ${cards[0].value} ${elemIcon}`, '🎵');
        this.triggerChainEvent({
          title: 'Farb-Resonanz!',
          desc: `${p.name} unterbietet mit ${cards[0].value} ${elemIcon} (${elem?.label || 'Resonanz'}) auf ${prevTop}`,
          emoji: '🎵',
          actor: p.name,
        });
      } else {
        this.say(`${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value}.`);
        this.setLastAction(`${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value} ${elemIcon}`, elemIcon || '🃏');
      }

      // 🧨 Anarchist: Unglückszahl 7 oder 13 kehrt sofort die Spielrichtung um
      if (cards[0].value === 7 || cards[0].value === 13) {
        const anarchist = this.active().find((o) => this.hasRole(o, 'anarchist'));
        if (anarchist) {
          this.dir *= -1;
          this.say(`🧨 ${anarchist.name} (Anarchist) reagiert auf die Unglückszahl ${cards[0].value}: Entropie dreht die Spielrichtung um!`);
          this.triggerChainEvent({
            title: 'Entropie-Spiegel!',
            desc: `${anarchist.name} kehrt bei ${cards[0].value} die Richtung um!`,
            emoji: '🧨',
            actor: anarchist.name,
            voice: this.voiceFor(anarchist, null, 'Totales Chaos! Vorwärts ist das neue Rückwärts!'),
          });
        }
      }

      // ⚡ Elementar-Kette: 3x dieselbe Farbe in Folge zwingt den/die Nächste*n zum Ziehen
      const cardColor = cards[0].color;
      if (this.colorStreak.color === cardColor || this.colorStreak.color === 'wild') {
        this.colorStreak.count += cards.length;
        if (this.colorStreak.color === 'wild') this.colorStreak.color = cardColor;
      } else {
        this.colorStreak = { color: cardColor, count: cards.length };
      }
      if (this.colorStreak.count >= 3) {
        const nextVictim = this.seatFrom(p, 1);
        if (nextVictim) {
          const elemName = elem?.label || elem?.name || 'Elementar';
          this.say(`⛓️⚡ Farb-Überladung! 3× ${elemName} in Folge – ${nextVictim.name} muss 1 Karte vom Ziehstapel ziehen!`);
          this.triggerChainEvent({
            title: 'Farb-Überladung!',
            desc: `3× ${elemName} in Folge – ${nextVictim.name} zieht 1 Karte!`,
            emoji: '⚡',
            actor: p.name,
          });
          this.colorStreak.count = 1; // Zählt jetzt als 1x – die nächste gleiche Farbe triggert direkt den 2er-Effekt!
          this.draw(nextVictim, 1, { from: p });
        }
      }

      if (cards.length >= 2 && this.hasRole(p, 'alchemist') && p.hand.length > 0) {
        const lowest = p.hand.reduce((min, c) => (c.kind === 'number' && c.value < (min?.value ?? 99) ? c : min), null);
        if (lowest) {
          p.hand = p.hand.filter((c) => c !== lowest);
          this.pile.push(lowest);
          this.say(`🧪 ${p.name} (Alchemist) transmutiert das Paar: Wirft ${lowest.value} zusätzlich ab!`);
          this.triggerChainEvent({
            title: 'Alchemie-Transmutation',
            desc: `${p.name} wirft ${lowest.value} kostenlos ab`,
            emoji: '🧪',
            actor: p.name,
            voice: this.voiceFor(p, null, 'Transmutation! Die niedere Materie zerfällt zu Gold!'),
          });
        }
      }
      return this.endTurn(p, { skip: 0, again: false });
    }

    this.colorStreak = { color: null, count: 0 };
    p.stats.specials = (p.stats.specials || 0) + cards.length;
    const ctx = { skip: 0, again: false };
    if (combo) {
      const [a, b2] = choice.targets.map(opp);
      this.say(`${p.name} spielt 😆😢 ${JESTER_COMBO.name}!`);
      this.setLastAction(`${p.name}: Doppelschelm-Combo!`, '🎭');
      this.triggerChainEvent({
        title: 'Doppelschelm-Combo!',
        desc: `${a.name} mischt neu & ${b2.name} zieht 3!`,
        emoji: '🎭',
        actor: p.name,
        voice: this.voiceFor(p, 'jester_combo'),
      });
      // Person 1: Hand (ohne Kartoffel) in den Ziehstapel mischen, gleich viele neu ziehen
      const keep = a.hand.filter((c) => c.ability === 'potato');
      const old = a.hand.filter((c) => c.ability !== 'potato');
      this.deck.push(...old); shuffle(this.deck);
      a.hand = keep;
      for (let i = 0; i < old.length && this.deck.length; i++) a.hand.push(this.deck.pop());
      sortHand(a.hand);
      this.say(`   → ${a.name} mischt die Hand neu (${old.length} Karten)`);
      this.draw(b2, 3, { from: p });
      return this.endTurn(p, ctx);
    }

    const sp = cards[0];
    if (secretVoice) {
      this.say(`✨ Geheime Interaktion: ${secretVoice}`);
    }
    // Spielerkarten haben lange Texte → im Protokoll nur der Name (Details per Antippen)
    this.say(`${p.name} spielt ${sp.emoji} ${sp.name}${sp.text ? '!' : ': ' + cardText(sp)}`);
    this.setLastAction(`${p.name}: ${sp.name}`, sp.emoji || '✨');
    this.triggerChainEvent({
      title: sp.name,
      desc: secretVoice || cardText(sp) || `${p.name} aktiviert Fähigkeit`,
      emoji: sp.emoji || '✨',
      actor: p.name,
      voice: this.voiceFor(p, sp.key === 'custom' ? null : sp.key, `${sp.name}! ${cardText(sp)}.`, secretVoice),
    });
    if (sp.ability === 'twins') {
      this.wild = { colors: choice.colors, owner: p.id };
      this.say(`   → ♊ Bis ${p.name} wieder dran ist, passen diese 2 Farben auf alles.`);
    } else if (sp.ability === 'gamble') {
      // 🎲 Münzwurf: 4 ziehen oder 4 loswerden (die Kartoffel bleibt immer auf der Hand)
      if (Math.random() < 0.5) {
        this.fx(`🎲 ${p.name}: KRIEGE 4! 😱`);
        this.draw(p, 4, { global: true });
      } else {
        const loose = p.hand.filter((c) => c.ability !== 'potato');
        const gone = shuffle(loose).slice(0, 4);
        p.hand = p.hand.filter((c) => !gone.includes(c));
        this.deck.unshift(...gone);
        this.fx(`🎲 ${p.name}: VERLIERE ${gone.length}! 🥳`);
      }
    } else if (sp.ability === 'sadJester') {
      this.draw(opp(choice.target), p.hand.length, { from: p });
    } else if (sp.ability === 'aegis') {
      this.top = 0;
      this.lower = false;
      p.aegisEcho = true;
      p.aegisEchoArmed = true;
      this.say(`   → 🛡️ Die Null-Zone reinigt den Tisch: Stapel zählt wieder ab 0 und erzeugt einen goldenen Nachhall!`);
    } else if (sp.ability === 'blackHole') {
      this.say(`   → 🕳️ Die Singularität verschlingt alles! Stapel wird verbrannt.`);
      this.pile = [];
      this.top = 0;
      this.lower = false;
      this.triggerNecromancer();
      for (const o of this.active()) {
        if (o !== p && o.hand.length > 0) {
          const specialIdx = o.hand.findIndex((c) => c.kind === 'special');
          let victimCard;
          if (specialIdx >= 0) {
            victimCard = o.hand.splice(specialIdx, 1)[0];
            this.say(`   → 🕳️ ${o.name} verliert Spezialkarte ${victimCard.emoji || ''} ${victimCard.name} an das Schwarze Loch!`);
          } else {
            const idx = Math.floor(Math.random() * o.hand.length);
            victimCard = o.hand.splice(idx, 1)[0];
            this.say(`   → 🕳️ ${o.name} verliert 1 Karte an das Schwarze Loch!`);
          }
          sortHand(o.hand);
        }
      }
    } else if (sp.ability === 'timestop') {
      ctx.again = true;
      this.top = 0;
      this.lower = false;
      this.say(`   → ⏳ Die Zeit steht still! ${p.name} ist sofort noch einmal dran und darf alles legen.`);
    } else if (sp.ability === 'thief') {
      const victim = opp(choice.target);
      if (victim && victim.hand.length > 0) {
        const idx = Math.floor(Math.random() * victim.hand.length);
        const stolen = victim.hand.splice(idx, 1)[0];
        this.pile.push(stolen);
        sortHand(victim.hand);
        this.say(`   → 🥷 ${p.name} stiehlt 1 Karte von ${victim.name} und lässt sie spurlos im Schatten verschwinden!`);
      }
    } else if (sp.ability === 'phoenix') {
      const count = this.pile.length;
      this.pile = [];
      this.top = 0;
      this.lower = false;
      this.say(`   → 🪶 Phönix-Asche entflammt aktiv: Alle ${count} Karten auf dem Tisch verbrennen zu Asche! ${p.name} zieht 1 frische Karte.`);
      this.triggerNecromancer();
      this.draw(p, 1, { global: true });
    } else if (sp.ability === 'portal') {
      const idx = this.deck.findIndex((c) => c.kind === 'special');
      if (idx >= 0) {
        const found = this.deck.splice(idx, 1)[0];
        p.hand.push(found);
        sortHand(p.hand);
        this.say(`   → 🌌 Das Dimensionsportal öffnet sich: ${p.name} zieht ${found.emoji || '✨'} ${found.name} direkt aus dem Deck!`);
      } else {
        this.say(`   → 🌌 Keine Spezialkarten mehr im Deck – ${p.name} zieht stattdessen 2 Karten!`);
        this.draw(p, 2, { global: true });
      }
    } else if (sp.ability === 'divineWrath') {
      const victim = opp(choice.target);
      if (victim) {
        if (this.hasRole(victim, 'gott') || this.hasRole(victim, 'god')) {
          this.say(`☀️ ${victim.name} (Gott) ist immun gegen göttlichen Zorn – der Blitz wirft ${p.name} um (zieht 2)!`);
          this.draw(p, 2, { global: true, penalty: true });
        } else if (this.blocksWithAegis(victim, p)) {
          if (victim._lastAegisEcho) {
            this.say(`🛡️ Der goldene Nachhall der Aegis schützt ${victim.name} vor dem Göttlichen Blitz!`);
          } else {
            this.say(`🛡️ ${victim.name} wehrt den Göttlichen Blitz mit der Aegis ab!`);
          }
        } else {
          const sIdx = victim.hand.findIndex((c) => c.kind === 'special');
          if (sIdx >= 0) {
            const burned = victim.hand.splice(sIdx, 1)[0];
            this.pile.push(burned);
            sortHand(victim.hand);
            this.say(`   → ⚡ Göttlicher Blitz trifft ${victim.name}: Spezialkarte ${burned.name} verbrennt im Stapel!`);
          } else {
            this.say(`   → ⚡ ${victim.name} hat keine Spezialkarten und muss 2 Karten ziehen!`);
            this.draw(victim, 2, { from: p });
          }
        }
      }
    } else if (sp.ability === 'timeloop') {
      const lastSpecial = [...this.pile].reverse().find((c) => c.kind === 'special' && c.id !== sp.id);
      if (lastSpecial) {
        this.pile = this.pile.filter((c) => c !== lastSpecial);
        p.hand.push(lastSpecial);
        sortHand(p.hand);
        this.say(`   → ♾️ Zeitschleife! ${p.name} nimmt ${lastSpecial.emoji || ''} ${lastSpecial.name} zurück auf die Hand!`);
      } else {
        this.say(`   → ♾️ Keine Spezialkarte im Ablagestapel – ${p.name} zieht stattdessen 1 Karte vom Deck.`);
        this.draw(p, 1, { global: true });
      }
      // Ouroboros-Erweiterung: Letzte 2 gespielte Zahlen an 2 zufällige Mitspieler
      const numbersInPile = [...this.pile].filter((c) => c.kind === 'number');
      const numbersToReturn = numbersInPile.slice(-2);
      const others = this.active().filter((o) => o !== p);

      if (numbersToReturn.length > 0 && others.length > 0) {
        if (others.length >= 2 && numbersToReturn.length >= 2) {
          const shuffled = [...others].sort(() => Math.random() - 0.5);
          const [v1, v2] = shuffled;
          const [n1, n2] = numbersToReturn;
          this.pile = this.pile.filter((c) => c !== n1 && c !== n2);
          v1.hand.push(n1);
          v2.hand.push(n2);
          sortHand(v1.hand);
          sortHand(v2.hand);
          this.say(`   → ♾️ Ouroboros dreht die Zeit zurück: ${v1.name} (Zahl ${n1.value}) und ${v2.name} (Zahl ${n2.value}) bekommen alte Zahlen ins Blatt gedrückt!`);
        } else {
          for (const n of numbersToReturn) {
            const target = others[Math.floor(Math.random() * others.length)];
            this.pile = this.pile.filter((c) => c !== n);
            target.hand.push(n);
            sortHand(target.hand);
            this.say(`   → ♾️ Ouroboros dreht die Zeit zurück: ${target.name} bekommt Zahl ${n.value} ins Blatt gedrückt!`);
          }
        }
      }
    } else if (sp.ability === 'earthquake') {
      this.say(`   → 🌋 Tektonischer Schock! Tisch wird gereinigt. Alle mit > 5 Handkarten verlieren 1 Karte.`);
      this.top = 0;
      this.lower = false;
      for (const o of this.active()) {
        if (o.hand.length > 5) {
          const idx = Math.floor(Math.random() * o.hand.length);
          const disc = o.hand.splice(idx, 1)[0];
          this.pile.push(disc);
          sortHand(o.hand);
          this.say(`   → 🌋 ${o.name} verliert eine Karte durch das Beben.`);
        }
      }
    } else if (sp.ability === 'chainCurse') {
      const victim = opp(choice.target);
      if (victim) {
        this.say(`   → ⛓️ Magische Ketten umschlingen ${victim.name}! Muss 2 Karten vom Ziehstapel ziehen.`);
        this.draw(victim, 2, { from: p });
      }
    } else if (sp.ability === 'pizzaRaid') {
      this.say(`   → 🍕 Pizza-Raid für den Club! Der Tisch wird auf 0 gereinigt.`);
      this.top = 0;
      this.lower = false;
      for (const o of this.active()) {
        if (o.hand.length > 3) {
          const idx = Math.floor(Math.random() * o.hand.length);
          const payCard = o.hand.splice(idx, 1)[0];
          this.pile.push(payCard);
          sortHand(o.hand);
          this.say(`   → 🍕 ${o.name} bezahlt 1 Karte für die Club-Pizza!`);
        }
      }
    } else if (sp.ability === 'zenBuff') {
      const numbers = p.hand.filter((c) => c.kind === 'number').sort((a, b) => a.value - b.value);
      const toDiscard = [];
      if (numbers.length >= 2) {
        // Zwingend die beiden niedrigsten Zahlen abwerfen
        toDiscard.push(numbers[0], numbers[1]);
      } else if (numbers.length === 1) {
        // Die 1 Zahl zwingend + 1 beliebige andere Karte (falls vorhanden)
        toDiscard.push(numbers[0]);
        const otherCards = p.hand.filter((c) => c.id !== numbers[0].id);
        if (otherCards.length > 0) toDiscard.push(otherCards[0]);
      } else {
        // Keine Zahlen vorhanden -> bis zu 2 beliebige Karten
        toDiscard.push(...p.hand.slice(0, 2));
      }

      for (const c of toDiscard) {
        const idx = p.hand.findIndex((x) => x.id === c.id);
        if (idx >= 0) {
          p.hand.splice(idx, 1);
          this.pile.push(c);
        }
      }
      sortHand(p.hand);
      this.top = 15;
      this.lower = false;
      this.say(`   → 🧘‍♀️ Džanas Zen-Gong ertönt! ${p.name} atmet durch und wirft ${toDiscard.length} Karte(n) ab (niedrigste Zahlen). Der Tisch steht auf Boss (15)!`);
    } else if (sp.ability === 'fairyTrick') {
      const victim = opp(choice.target);
      if (victim) {
        const sIdx = victim.hand.findIndex((c) => c.kind === 'special');
        if (sIdx >= 0) {
          const stolen = victim.hand.splice(sIdx, 1)[0];
          p.hand.push(stolen);
          sortHand(p.hand);
          sortHand(victim.hand);
          this.say(`   → 🧚‍♀️ Feen-Streich! ${p.name} stiehlt ${stolen.emoji || '✨'} ${stolen.name} aus ${victim.name}s Hand!`);
        } else {
          this.say(`   → 🧚‍♀️ ${victim.name} hat keine Spezialkarten – Feenstaub zwingt zu 2 Strafkarten!`);
          this.draw(victim, 2, { from: p });
        }
      }
    } else if (sp.ability === 'sanctuary') {
      this.say(`   → 🏛️ Sanctuary-Protokoll aktiviert! Der Tisch wird auf 0 gereinigt.`);
      this.top = 0;
      this.lower = false;
      const act = this.active();
      if (act.length > 0) {
        const most = act.reduce((prev, cur) => (cur.hand.length > prev.hand.length ? cur : prev), act[0]);
        let discarded = 0;
        for (let i = 0; i < 2 && most.hand.length > 0; i++) {
          const idx = Math.floor(Math.random() * most.hand.length);
          const c = most.hand.splice(idx, 1)[0];
          this.pile.push(c);
          discarded++;
        }
        sortHand(most.hand);
        this.say(`   → 🏛️ Gruppenleiter-Beistand: ${most.name} (${most.hand.length + discarded} Karten) darf ${discarded} Karten kostenlos abwerfen!`);
      }
    } else if (sp.ability === 'masterSolution') {
      this.say(`   → 📋 Die Musterlösung! Herr Adrian hat gesprochen: Der Tisch wird auf 0 gereinigt.`);
      this.top = 0;
      this.lower = false;
      ctx.again = true;
      for (const o of this.active()) {
        if (o !== p && o.hand.length > 3) {
          this.say(`   → 📋 ${o.name} (${o.hand.length} Karten) hat keine Musterlösung parat: Zieht 1 Strafkarte!`);
          this.draw(o, 1, { from: p, penalty: true });
        }
      }
    } else if (sp.ability === 'cookieCrunch') {
      this.say(`   → 🍪 Der Cookie-Crunch! Cookie stiftet herrliches Chaos am Tisch!`);
      const upcoming = this.seatFrom(p, 1);
      if (this.active().length > 2 && upcoming && (this.hasRole(upcoming, 'buerger') || this.hasRole(upcoming, 'citizen'))) {
        this.buergerNext = upcoming.id;
      }
      this.dir *= -1;
      const act = this.active();
      if (act.length > 1) {
        const given = act.map((o) => {
          const pool = o.hand.filter((c) => c.ability !== 'potato');
          if (!pool.length) return null;
          const idx = Math.floor(Math.random() * pool.length);
          const c = pool[idx];
          o.hand = o.hand.filter((x) => x !== c);
          return c;
        });
        for (let i = 0; i < act.length; i++) {
          const recipient = this.seatFrom(act[i], 1);
          const c = given[i];
          if (c) {
            recipient.hand.push(c);
            sortHand(recipient.hand);
          }
        }
        this.say(`   → 🍪 Alle Handkarten sind einmal im Kreis nach links gewandert!`);
      }
      this.top = Math.floor(Math.random() * 15) + 1;
      this.lower = Math.random() < 0.5;
      this.say(`   → 🍪 Neuer Tischwert: ${this.top} (${this.lower ? '⬇️ Unter' : '⬆️ Über'})!`);
    } else if (sp.ability === 'teyaScribbl') {
      this.say(`   → 🎨 Teyas Scribbl-Meisterwerk! Bunte Farbenpracht: Tisch auf 0 gereinigt und Farb-Resonanz direkt auf Stufe 3 vorgeladen!`);
      this.top = 0;
      this.lower = false;
      this.wild = { colors: [...RULES.colors], owner: p.id };
      this.colorStreak = { color: 'wild', count: 2 };
    } else if (sp.ability === 'ayleenObserver') {
      this.top = Math.max(1, (this.top || 10) - 5);
      this.lower = false;
      if (p.hand.length > 0) {
        const bonusIdx = Math.floor(Math.random() * p.hand.length);
        const bonus = p.hand.splice(bonusIdx, 1)[0];
        this.pile.push(bonus);
        sortHand(p.hand);
        this.say(`   → 👀 Stille Beobachterin: Ayleen senkt den Tisch auf ${this.top} und legt heimlich eine Karte ab!`);
      } else {
        this.say(`   → 👀 Stille Beobachterin: Ayleen senkt den Tisch auf ${this.top}!`);
      }
    } else if (sp.ability === 'turboDash') {
      ctx.skip += 2;
      const s1 = this.seatFrom(p, 1);
      const s2 = this.seatFrom(p, 2);
      const skipped = [...new Set([s1, s2].filter((x) => x && x !== p))];
      this.say(`   → 🏎️ Turbo-Abreise! Niclas überholt ${skipped.map((x) => x.name).join(' & ')} im Tiefflug!`);
      for (const s of skipped) {
        this.draw(s, 1, { from: p, penalty: true });
      }
    } else if (sp.ability === 'fireworkBlast') {
      this.say(`   → 🎆 Pyrotechnischer Knall! Rubens Club-Feuerwerk detoniert vollständig (Tisch verbrennt auf 0)!`);
      this.pile = [];
      this.top = 0;
      this.lower = false;
      this.triggerNecromancer();
      for (const o of this.active()) {
        const numCards = o.hand.filter((c) => c.kind === 'number');
        if (numCards.length > 0) {
          const highest = numCards.reduce((max, cur) => (cur.value > max.value ? cur : max), numCards[0]);
          o.hand = o.hand.filter((c) => c !== highest);
          const elem = highest.color ? COLOR_ELEMENTS[highest.color] : null;
          const cardLabel = elem ? `${elem.icon} ${elem.label} (${highest.value})` : `Zahl ${highest.value}`;
          this.say(`   → 🎆 ${o.name} verbrennt ${cardLabel} im Funkenregen!`);
        }
      }
    } else if (sp.ability === 'slimeGluttony') {
      ctx.again = true;
      if (prevCardsOnPile.length > 0) {
        const swallowed = prevCardsOnPile[prevCardsOnPile.length - 1];
        this.pile = this.pile.filter((c) => c !== swallowed);
        const prevPrev = prevCardsOnPile.length >= 2 ? prevCardsOnPile[prevCardsOnPile.length - 2] : null;
        this.top = prevPrev?.value || 0;
        this.lower = false;
        const swallowedName = swallowed.name || `Zahl ${swallowed.value}`;
        this.say(`   → 💧 Gluttony! Der Schleim verschlingt ${swallowedName} in seinen Magenraum! Tisch fällt auf ${this.top} zurück und ${p.name} ist sofort noch einmal dran!`);
      } else {
        this.top = 0;
        this.lower = false;
        this.say(`   → 💧 Gluttony! Der Tisch ist leer – Schleim reinigt den Tisch auf 0 und ${p.name} ist sofort noch einmal dran!`);
      }
    } else if (sp.ability === 'anosLogic') {
      this.top = 0;
      this.lower = false;
      this.say(`   → 👑 Venuzdonoa! Zerstört alle Spielregeln: Dämonenkönig bricht die Kette – nächste Person MUSS eine reguläre Zahlenkarte legen oder den Stapel fressen!`);
    } else if (sp.ability === 'dragonHoard') {
      const count = this.pile.length;
      this.pile = [];
      this.top = 0;
      this.lower = false;
      this.say(`   → 🐉 Drachenhort! Smaug schmilzt den gesamten Tischstapel (${count} Karten) zu Gold ein (verbrennt auf 0)!`);
      this.triggerNecromancer();
      const nextTarget = this.seatFrom(p, 1);
      if (nextTarget) {
        this.say(`   → 🐉 Smaugs Zorn trifft ${nextTarget.name}: Zieht 3 Strafkarten!`);
        this.draw(nextTarget, 3, { from: p, penalty: true });
      }
    }
    for (const e of sp.effects ?? []) this.runEffect(p, e, ctx);
    if ((this.hasRole(p, 'junggott') || this.hasRole(p, 'demigod')) && !ctx.again) {
      ctx.again = true;
      this.say(`⚡ ${p.name} (Junger Gott) entfesselt Himmelsblitz: Ist sofort noch einmal dran!`);
      this.triggerChainEvent({
        title: 'Himmelsblitz!',
        desc: `${p.name} ist sofort noch einmal dran`,
        emoji: '⚡',
        actor: p.name,
        voice: this.voiceFor(p, null, 'Himmelsblitz! Die Götter dulden keine Pause!'),
      });
    }
    return this.endTurn(p, ctx);
  }

  // 🥔 Weiterreichen: Ziel zieht 3 und bekommt die Kartoffel (nie zurück an die Herkunft)
  passPotato(p, potato, targetId) {
    p.stats.specials = (p.stats.specials || 0) + 1;
    const others = this.active().filter((o) => o !== p);
    const allowed = others.filter((o) => o.id !== potato.cameFrom);
    const valid = allowed.length ? allowed : others;      // zu zweit geht's notfalls doch zurück
    const t = valid.find((o) => o.id === targetId);
    if (!t) return { error: targetId === potato.cameFrom ? 'Nicht zurück an die Person, von der du sie hast!' : 'Wähle, wer die Kartoffel bekommt.' };
    this.setLastAction(`${p.name} → Kartoffel an ${t.name}`, '🥔');
    this.triggerChainEvent({
      title: 'Heiße Kartoffel!',
      desc: `${p.name} wirft Kartoffel an ${t.name} weiter (+3 Strafkarten)`,
      emoji: '🥔',
      actor: p.name,
      voice: this.voiceFor(p, 'kartoffel'),
    });
    if (this.hasRole(t, 'gott') || this.hasRole(t, 'god')) {
      this.say(`☀️ ${t.name} (Gott) verbrennt die Heiße Kartoffel mit heiligem Licht – sie fällt in den Ziehstapel!`);
      p.hand = p.hand.filter((c) => c !== potato);
      delete potato.cameFrom;
      this.deck.unshift(potato);
      return this.endTurn(p, { skip: 0, again: false });
    }
    if (this.blocksWithAegis(t, p)) {
      if (t._lastAegisEcho) {
        this.say(`🛡️ Der goldene Nachhall der Aegis schützt ${t.name} vor der Heißen Kartoffel – sie fällt in den Ziehstapel!`);
      } else {
        this.say(`🛡️ ${t.name} wehrt die Heiße Kartoffel mit der Aegis der Nullifizierung ab – sie fällt in den Ziehstapel!`);
      }
      p.hand = p.hand.filter((c) => c !== potato);
      delete potato.cameFrom;
      this.deck.unshift(potato);
      return this.endTurn(p, { skip: 0, again: false });
    }
    if (this.reflects(t, p)) {
      this.say(`😆 ${t.name} lacht zuletzt – die Kartoffel bleibt bei ${p.name}, und ${p.name} zieht 3!`);
      this.draw(p, 3, { global: true, penalty: true });
      return this.endTurn(p, { skip: 0, again: false });
    }
    p.hand = p.hand.filter((c) => c !== potato);
    this.say(`🥔 ${p.name} reicht die Heiße Kartoffel an ${t.name} weiter!`);
    this.draw(t, 3, { from: p, noReflect: true });
    potato.cameFrom = p.id;
    t.hand.push(potato);
    sortHand(t.hand);
    return this.endTurn(p, { skip: 0, again: false });
  }

  // Zentrales Ziehen – hier greifen alle Reaktionskarten
  draw(t, n, { from = null, global = false, noReflect = false, penalty = false } = {}) {
    if (!t || n <= 0) return;
    const isPenalty = penalty || Boolean(from && t !== from);
    if (from && t !== from) {
      if ((this.hasRole(t, 'gott') || this.hasRole(t, 'god')) && !global) {
        this.say(`☀️ ${t.name} (Gott) ist erhaben – Göttliches Karma zwingt ${from.name}, stattdessen ${n} Karten zu ziehen!`);
        this.triggerChainEvent({
          title: 'Göttliches Karma!',
          desc: `${from.name} zieht stattdessen ${n} Strafkarten!`,
          emoji: '☀️',
          actor: t.name,
          voice: this.voiceFor(t, null, 'Göttliche Majestät! Niedere Flüche prallen an mir ab!'),
        });
        return this.draw(from, n, { global: true, noReflect: true, penalty: true });
      }
      if (this.hasRole(t, 'pazifist') && !global && t.hand.length > 3) {
        this.say(`🕊️ ${t.name} (Pazifist) steht unter diplomatischem Schutz – Zieh-Angriff verpufft!`);
        this.triggerChainEvent({
          title: 'Diplomatischer Schutz',
          desc: `${t.name} (Pazifist) wehrt Zieh-Angriff ab!`,
          emoji: '🕊️',
          actor: t.name,
          voice: this.voiceFor(t, null, 'Diplomatische Immunität! Gewalt ist keine Lösung!'),
        });
        return;
      }
      if (this.blocksWithAegis(t, from)) {
        if (t._lastAegisEcho) {
          this.say(`🛡️ Der goldene Nachhall der Aegis schützt ${t.name} weiterhin – Zieh-Effekt vollständig geblockt!`);
        } else {
          this.say(`🛡️ ${t.name} wirft die Aegis der Nullifizierung ab – Zieh-Effekt vollständig geblockt!`);
        }
        this.triggerChainEvent({
          title: t._lastAegisEcho ? 'Aegis-Nachhall' : 'Aegis der Nullifizierung',
          desc: `${t.name} blockt den Angriff vollständig!`,
          emoji: '🛡️',
          actor: t.name,
        });
        return;
      }
      if (!global) {
        if (!noReflect && this.reflects(t, from)) {
          this.say(`😆 ${t.name} lacht zuletzt – ${from.name} zieht ${n} statt ${t.name}!`);
          this.triggerChainEvent({
            title: 'Glücklicher Schelm!',
            desc: `${t.name} wirft Angriff zurück – ${from.name} zieht ${n}!`,
            emoji: '😆',
            actor: t.name,
          });
          return this.draw(from, n, { global: true, penalty: true });
        }
        const mirror = t.hand.find((c) => c.ability === 'mirror');
        if (mirror && !noReflect) {
          t.hand = t.hand.filter((c) => c !== mirror);
          this.pile.push(mirror);
          const defenderPenalty = Math.max(1, Math.ceil((n * 2) / 3));
          this.say(`🪞 ${t.name} spiegelt den Angriff mit dem Prismatischen Spiegel – ${from.name} zieht die vollen ${n}, ${t.name} dämpft auf zwei Drittel (${defenderPenalty})!`);
          this.triggerChainEvent({
            title: 'Prismatischer Spiegel!',
            desc: `${t.name} spiegelt Angriff – ${from.name} zieht ${n}, ${t.name} dämpft auf ${defenderPenalty}!`,
            emoji: '🪞',
            actor: t.name,
          });
          this.draw(from, n, { global: true, noReflect: true, penalty: true });
          n = defenderPenalty;
        }
        const twins = t.hand.find((c) => c.ability === 'twins');
        if (twins) {
          t.hand = t.hand.filter((c) => c !== twins);
          this.pile.push(twins);
          const half = Math.ceil(n / 2);
          const nbs = [this.seatFrom(t, 1), this.seatFrom(t, -1)];
          this.say(`♊ ${t.name} kontert mit der Zwillings-Parade – ${[...new Set(nbs)].map((x) => x.name).join(' & ')} ziehen je ${half}!`);
          this.triggerChainEvent({
            title: 'Zwillings-Konter!',
            desc: `${t.name} verteilt ${half} Karten an Nachbarn!`,
            emoji: '♊',
            actor: t.name,
          });
          for (const nb of nbs) this.draw(nb, half, { global: true, penalty: true });
          return;
        }
      }
    }
    if (t.hand.some((c) => c.ability === 'potato')) {
      this.say(`🥔 ${t.name} hält die Kartoffel → zieht ${n * 3} statt ${n}!`);
      n *= 3;
    }
    if (this.hasRole(t, 'anarchist') && isPenalty) {
      if (Math.random() < 0.5) {
        n = n * 2;
        this.say(`🧨 ${t.name} (Anarchist) wirft die Münze der Entropie: KOPF! Strafe verdoppelt auf ${n}!`);
        this.triggerChainEvent({
          title: 'Anarchie-Münzwurf: Kopf!',
          desc: `Strafe für ${t.name} verdoppelt auf ${n}!`,
          emoji: '🧨',
          actor: t.name,
          voice: this.voiceFor(t, null, 'Doppeltes Chaos! Kopf verdoppelt den Schmerz!'),
        });
      } else {
        n = Math.max(1, Math.floor(n / 2));
        this.say(`🧨 ${t.name} (Anarchist) wirft die Münze der Entropie: ZAHL! Strafe halbiert auf ${n}!`);
        this.triggerChainEvent({
          title: 'Anarchie-Münzwurf: Zahl!',
          desc: `Strafe für ${t.name} halbiert auf ${n}!`,
          emoji: '🧨',
          actor: t.name,
          voice: this.voiceFor(t, null, 'Reines Glück im Chaos! Zahl halbiert den Schaden!'),
        });
      }
    }
    let got = 0;
    for (; got < n && this.deck.length; got++) t.hand.push(this.deck.pop());
    sortHand(t.hand);
    if (got && isPenalty) {
      t.stats.drawnCards = (t.stats.drawnCards || 0) + got;
      if (got >= 3) {
        this.triggerMedic(t);
      }
    }
    if (got) this.say(`   → ${t.name} zieht ${got}${got < n ? ' (Stapel leer)' : ''}`);
    if ((this.hasRole(t, 'pechvogel') || this.hasRole(t, 'unlucky')) && from && from !== t && !global && got > 0) {
      this.say(`🐦‍⬛ Geteiltes Pech: Weil ${t.name} zieht, muss ${from.name} auch 1 Karte ziehen!`);
      this.triggerChainEvent({
        title: 'Geteiltes Pech!',
        desc: `${from.name} muss wegen ${t.name} 1 Karte mitziehen!`,
        emoji: '🐦‍⬛',
        actor: t.name,
        voice: this.voiceFor(t, null, 'Geteiltes Leid ist doppeltes Pech! Du ziehst mit mir in den Abgrund!'),
      });
      this.draw(from, 1, { global: true, noReflect: true, penalty: true });
    }
  }

  // 🛡️ Aegis der Nullifizierung: blockt negative Effekte aus der Hand ab
  blocksWithAegis(t, from) {
    if (!t || !from || t === from) return false;
    if (t.aegisEcho) {
      t._lastAegisEcho = true;
      return true;
    }
    if (!Array.isArray(t.hand)) return false;
    const aegis = t.hand.find((c) => c?.ability === 'aegis');
    if (!aegis) return false;
    t.hand = t.hand.filter((c) => c !== aegis);
    if (!Array.isArray(this.pile)) this.pile = [];
    this.pile.push(aegis);
    t.aegisEcho = true;
    t.aegisEchoArmed = false;
    t._lastAegisEcho = false;
    return true;
  }

  // 😆 Glücklicher Schelm: verbraucht sich und wirft einen gezielten Angriff zurück
  reflects(t, from) {
    if (!t || !Array.isArray(t.hand) || !from || t === from) return false;
    const lucky = t.hand.find((c) => c?.ability === 'luckyJester');
    if (!lucky) return false;
    t.hand = t.hand.filter((c) => c !== lucky);
    if (!Array.isArray(this.pile)) this.pile = [];
    this.pile.splice(Math.max(0, this.pile.length - 1), 0, lucky);   // unter die oberste Karte
    return true;
  }

  seatFrom(p, step) {
    const n = this.players.length;
    let i = this.players.indexOf(p);
    do { i = (i + step * this.dir + n) % n; } while (!this.players[i].inGame);
    return this.players[i];
  }

  take(id) {
    const p = this.current();
    if (this.state !== 'playing' || p?.id !== id) return { error: 'Du bist nicht dran.' };
    if (Date.now() < this.introUntil) return { error: 'Kurz warten – die Lose laufen noch 🎰' };
    if (!this.pile.length) return { error: 'Der Stapel ist leer – leg einfach was.' };
    const phoenix = p.hand.find((c) => c.ability === 'phoenix');
    if (phoenix) {
      p.hand = p.hand.filter((c) => c !== phoenix);
      const count = this.pile.length;
      this.pile = [];
      this.top = 0;
      this.lower = false;
      this.say(`🪶 ${p.name} wirft Phönix-Asche ab: Alle ${count} Karten auf dem Tisch verbrennen vollständig zu Asche!`);
      this.setLastAction(`${p.name} verbrennt Tisch mit Phönix-Asche`, '🪶');
      this.triggerChainEvent({
        title: 'Phönix-Asche!',
        desc: `${p.name} verbrennt alle ${count} Tischkarten zu Asche!`,
        emoji: '🪶',
        actor: p.name,
      });
      this.triggerNecromancer();
      this.draw(p, 1, { global: true });
      sortHand(p.hand);
      return this.endTurn(p, { skip: 0, again: false });
    }
    const isBoss = this.top === 16 || this.pile[this.pile.length - 1]?.value === 16 || this.pile[this.pile.length - 1]?.key === 'floris';
    if ((this.hasRole(p, 'meisterschuetze') || this.hasRole(p, 'marksman')) && isBoss) {
      this.say(`🏹 ${p.name} (Meisterschütze) weicht dem Boss-Schlag aus: Der Stapel prallt ab und verbrennt auf 0!`);
      this.setLastAction(`${p.name} weicht Boss aus (Meisterschütze)`, '🏹');
      this.triggerChainEvent({
        title: 'Präzisions-Ausweichmanöver',
        desc: `${p.name} weicht dem Boss-Stapel aus – Stapel verbrennt auf 0!`,
        emoji: '🏹',
        actor: p.name,
        voice: this.voiceFor(p, null, 'Schuss ins Schwarze! Ein Meisterschütze beugt sich keinem Boss!'),
      });
      this.pile = [];
      this.top = 0;
      this.lower = false;
      this.colorStreak = { color: null, count: 0 };
      return this.endTurn(p, { skip: 0, again: false });
    }
    if ((this.hasRole(p, 'dorfdepp') || this.hasRole(p, 'fool')) && this.pile.length > 2) {
      const takeCount = 2;
      const burned = this.pile.length - takeCount;
      const taken = this.pile.slice(-takeCount);
      p.stats.pileCards = (p.stats.pileCards || 0) + takeCount;
      p.hand.push(...taken);
      this.say(`🤪 ${p.name} nutzt Bauernschläue: Nimmt nur 2 Karten – ${burned} Karten verbrennen! 🔥`);
      this.setLastAction(`${p.name} nimmt 3 Karten (Bauernschläue)`, '🤪');
      this.triggerChainEvent({
        title: 'Bauernschläue',
        desc: `${p.name} nimmt nur 3 Karten (${burned} verbrannt)!`,
        emoji: '🤪',
        actor: p.name,
        voice: this.voiceFor(p, null, 'Bauernschläue! Der Depp lässt den Stapel brennen!'),
      });
    } else if ((this.hasRole(p, 'berserker') || this.hasRole(p, 'berserk')) && this.pile.length > 2) {
      const takeCount = Math.ceil(this.pile.length / 2);
      const burned = this.pile.length - takeCount;
      const taken = this.pile.slice(-takeCount);
      p.stats.pileCards = (p.stats.pileCards || 0) + takeCount;
      p.hand.push(...taken);
      this.say(`🪓 ${p.name} verfällt in Blutrausch: Nimmt nur ${takeCount} Karten – ${burned} Karten verbrennen! 🔥`);
      this.setLastAction(`${p.name} nimmt halben Stapel (Blutrausch)`, '🪓');
      this.triggerChainEvent({
        title: 'Blutrausch',
        desc: `${p.name} nimmt ${takeCount} Karten (${burned} verbrannt)!`,
        emoji: '🪓',
        actor: p.name,
        voice: this.voiceFor(p, null, 'Blutrausch! Der Stapel wird in Stücke gehackt!'),
      });
    } else {
      p.stats.pileCards = (p.stats.pileCards || 0) + this.pile.length;
      this.say(`${p.name} nimmt den Stapel (${this.pile.length} Karten). 😬`);
      this.setLastAction(`${p.name} nimmt Stapel (${this.pile.length} Karten)`, '😬');
      p.hand.push(...this.pile);
      if (this.hasRole(p, 'buerger') || this.hasRole(p, 'citizen')) {
        this.grantCitizenBonus(p);
      }
    }
    sortHand(p.hand);
    this.triggerMedic(p);
    this.pile = [];
    this.top = 0;
    this.lower = false;
    this.colorStreak = { color: null, count: 0 };
    return this.endTurn(p, { skip: 0, again: false });
  }

  grantCitizenBonus(p) {
    if (!p) return;
    const idx = this.deck.findIndex((c) => c.kind === 'special');
    if (idx >= 0) {
      const found = this.deck.splice(idx, 1)[0];
      p.hand.push(found);
      sortHand(p.hand);
      this.say(`🧑 ${p.name} (Bürger*in) erhält Bürgergeld als Solidaritäts-Ausgleich: Zieht ${found.emoji || '✨'} ${found.name}!`);
      this.triggerChainEvent({
        title: 'Bürgergeld!',
        desc: `${p.name} erhält ${found.emoji || '✨'} ${found.name} als Ausgleich!`,
        emoji: '🧑',
        actor: p.name,
        voice: this.voiceFor(p, null, 'Solidaritäts-Ausgleich! Das Bürgergeld regelt den Schaden!'),
      });
    } else if (this.deck.length > 0) {
      this.say(`🧑 ${p.name} (Bürger*in) erhält Bürgergeld: Zieht 1 Karte vom Deck!`);
      this.draw(p, 1, { global: true });
    }
  }

  isResonant(cards) {
    if (!this.top || !this.pile.length) return false;
    const topCard = this.pile[this.pile.length - 1];
    if (!topCard || !topCard.color) return false;
    return cards.length > 0 && cards.every((c) => c.kind === 'number' && c.color === topCard.color);
  }

  whyNot(cards) {
    const p = this.current();
    const topCard = this.pile[this.pile.length - 1];
    const isAnosOnTop = topCard?.ability === 'anosLogic' || topCard?.key === 'daemonenkoenig';

    if (cards[0].kind === 'special' || cards.some((c) => c.kind === 'special')) {
      if (isAnosOnTop) {
        return 'Venuzdonoa herrscht: Auf den Dämonenkönig dürfen keine Spezialkarten gelegt werden!';
      }
      if (cards.length === 1) return null;
      const ab = cards.map((c) => c.ability).sort().join('+');
      return ab === 'luckyJester+sadJester' ? null : 'Specials nur einzeln (Ausnahme: beide Schelme).';
    }
    const uniqueValues = [...new Set(cards.map((c) => c.value))];
    if (p && p.trinkgeld) {
      if (uniqueValues.length > 2) return 'Mit Trinkgeld maximal 2 verschiedene Zahlen zusammen.';
    } else {
      if (uniqueValues.length > 1) return 'Nur gleiche Zahlen zusammen.';
    }
    const valCounts = {};
    for (const c of cards) {
      if (c.kind === 'number') {
        valCounts[c.value] = (valCounts[c.value] || 0) + 1;
        if (valCounts[c.value] > 3) {
          return 'Maximal 3 Karten derselben Zahl zusammen ablegen.';
        }
      }
    }
    if (isAnosOnTop) {
      return null; // Zahlenkarten dürfen immer auf den Dämonenkönig gelegt werden
    }
    if (p && (this.hasRole(p, 'held') || this.hasRole(p, 'hero')) && p.hand.length <= 2 && cards.every((c) => c.kind === 'number')) {
      return null; // 🦸 Heldenmut: Darf jede Zahl auf jede Zahl legen
    }
    if (p && (this.hasRole(p, 'meisterschuetze') || this.hasRole(p, 'marksman')) && cards.every((c) => c.kind === 'number')) {
      if (this.top >= 12 || topCard?.value === 16 || topCard?.key === 'floris') {
        return null; // 🏹 Präzisions-Schuss: Zielt auf Schwachstellen bei Tisch ≥ 12 oder Boss (16)
      }
    }
    if (p && (this.hasRole(p, 'gluecksspieler') || this.hasRole(p, 'gambler')) && cards.every((c) => c.kind === 'number') && this.top > 0) {
      const v = cards[0].value;
      if ((v % 2) !== (this.top % 2)) return null; // 🎲 Gezinkte Würfel: Ungerade auf gerade (oder umgekehrt) klappt immer
    }
    if (this.top === 0) return null;
    // ♊ freie Farben: passen auf alles
    if (this.wild && cards.every((c) => this.wild.colors.includes(c.color))) return null;
    // ♊ Sphäre: liegt die Zwillings-Parade oben, geht auch genau 1 drunter
    if (this.pile[this.pile.length - 1]?.ability === 'twins' && uniqueValues.some(val => val === this.top - 1)) return null;

    const resonant = this.isResonant(cards);
    const tol = resonant ? (RULES.resonanceTolerance ?? COLOR_RESONANCE_TOLERANCE) : 0;

    const isValid = (val) => {
      if (this.lower) {
        const maxAllowed = this.top + tol;
        return RULES.equalAllowed ? val <= maxAllowed : (val < this.top || (resonant && val <= maxAllowed));
      }
      const minAllowed = Math.max(1, this.top - tol);
      return RULES.equalAllowed ? val >= minAllowed : (val > this.top || (resonant && val >= minAllowed));
    };

    if (uniqueValues.some(isValid)) return null;
    return this.lower
      ? `Muss ${RULES.equalAllowed ? '≤' : '<'} ${this.top} sein${resonant ? ` (Resonanz-Limit: ${this.top + tol})` : ''}.`
      : `Muss ${RULES.equalAllowed ? '≥' : '>'} ${this.top} sein${resonant ? ` (Resonanz-Limit: ${Math.max(1, this.top - tol)})` : ''}.`;
  }

  endTurn(p, { skip, again }) {
    // Gewonnen? Wer zuerst keine Karten mehr hat.
    const out = p.hand.length === 0 ? p : this.active().find((o) => o.hand.length === 0);
    if (out) { this.finish(out); return { ok: true }; }
    // 🥔 Ist die Kartoffel jemandes letzte Karte: Sieg, alle anderen ziehen 3, Kartoffel zurück in den Stapel
    const potatoWin = this.active().find((o) => o.hand.length === 1 && o.hand[0].ability === 'potato');
    if (potatoWin) {
      const potato = potatoWin.hand.pop();
      delete potato.cameFrom;
      this.deck.unshift(potato);
      this.say(`🥔 ${potatoWin.name} hat nur noch die Kartoffel – Sieg! Alle anderen ziehen 3.`);
      for (const o of this.active()) if (o !== potatoWin) this.draw(o, 3, { global: true });
      this.finish(potatoWin);
      return { ok: true };
    }
    delete p.trinkgeld;
    if (!again) this.advance(1 + skip, p);
    return { ok: true };
  }

  advance(steps, fromPlayer = null) {
    const n = this.players.length;
    if (!this.active().length) return;
    if (this.buergerNext) {
      const bIndex = this.players.findIndex((pl) => pl.id === this.buergerNext && pl.inGame);
      this.buergerNext = null;
      if (bIndex >= 0) {
        this.turn = bIndex;
        const bPlayer = this.players[bIndex];
        this.say(`🧑 ${bPlayer.name} (Bürger*in) lässt sich nicht beirren und behält den Zug bei!`);
        if (this.wild && this.current()?.id === this.wild.owner) {
          this.wild = null;
          this.say('♊ Die zwei Welten schließen sich wieder.');
        }
        if (bPlayer?.aegisEcho) {
          if (bPlayer.aegisEchoArmed) {
            delete bPlayer.aegisEcho;
            delete bPlayer.aegisEchoArmed;
            this.say(`🛡️ Der goldene Nachhall der Aegis von ${bPlayer.name} verblasst mit Beginn des Zuges.`);
          } else {
            bPlayer.aegisEchoArmed = true;
          }
        }
        return;
      }
    }
    for (let s = 0; s < steps; s++) {
      do { this.turn = (this.turn + this.dir + n) % n; } while (!this.players[this.turn].inGame);
      const curr = this.players[this.turn];
      if (s < steps - 1 && fromPlayer && curr !== fromPlayer) {
        if (this.blocksWithAegis(curr, fromPlayer)) {
          if (curr._lastAegisEcho) {
            this.say(`🛡️ Der goldene Nachhall der Aegis schützt ${curr.name} vor dem Aussetzen und ist am Zug!`);
          } else {
            this.say(`🛡️ ${curr.name} annulliert das Aussetzen mit der Aegis der Nullifizierung und ist am Zug!`);
          }
          break;
        }
      }
    }
    const curr = this.current();
    if (curr?.aegisEcho) {
      if (curr.aegisEchoArmed) {
        delete curr.aegisEcho;
        delete curr.aegisEchoArmed;
        this.say(`🛡️ Der goldene Nachhall der Aegis von ${curr.name} verblasst mit Beginn des Zuges.`);
      } else {
        curr.aegisEchoArmed = true;
      }
    }
    if (this.wild && this.current()?.id === this.wild.owner) {
      this.wild = null;
      this.say('♊ Die zwei Welten schließen sich wieder.');
    }
  }

  // Spielende: sobald eine Person keine Karten mehr hat. Dann wird abgerechnet –
  // Platz 1 = Sieg, danach nach Kartenzahl. Wer am meisten hat, ist Letzte*r.
  finish(winner) {
    this.state = 'over';
    this.winner = winner?.id ?? null;
    if (winner) this.say(`🏆 ${winner.name} hat keine Karten mehr und gewinnt!`);
    this.ranking = this.active()
      .sort((a, b) => (a === winner ? -1 : b === winner ? 1 : a.hand.length - b.hand.length))
      .map((p) => ({
        id: p.id,
        name: p.name,
        count: p.hand.length,
        role: p.role && { key: p.role, ...ROLES[p.role] },
        stats: { ...(p.stats || {}) },
      }));
    this.awards = this.calculateAwards();
    if (this.stake && this.ranking.length > 1) {
      const most = Math.max(...this.ranking.map((r) => r.count));
      this.stake.winners = this.ranking.filter((r) => r.id === this.winner).map((r) => r.name);
      this.stake.losers = this.ranking.filter((r) => r.count === most && r.id !== this.winner).map((r) => r.name);
    }
    for (const p of [...this.players]) if (!p.connected) this.removePlayer(p.id);
  }

  calculateAwards() {
    const players = this.active();
    if (!players.length) return [];
    const awards = [];

    const categories = [
      {
        id: 'resonance',
        title: 'Kettenkönig',
        emoji: '👑',
        desc: 'Meiste Farbresonanzen gelegt',
        getValue: (p) => p.stats?.resonance ?? 0,
        unit: (n) => `${n}× Resonanz`,
      },
      {
        id: 'pileCards',
        title: 'Stapel-Schlucker',
        emoji: '🍽️',
        desc: 'Meiste Karten vom Tisch gefressen',
        getValue: (p) => p.stats?.pileCards ?? 0,
        unit: (n) => `${n} Karten`,
      },
      {
        id: 'drawnCards',
        title: 'Blitzableiter',
        emoji: '⚡',
        desc: 'Meiste Strafkarten eingesteckt',
        getValue: (p) => p.stats?.drawnCards ?? 0,
        unit: (n) => `${n} Strafkarten`,
      },
      {
        id: 'specials',
        title: 'Pyrotechniker',
        emoji: '💣',
        desc: 'Meiste Spezialkarten gezündet',
        getValue: (p) => p.stats?.specials ?? 0,
        unit: (n) => `${n} gezündet`,
      },
    ];

    for (const cat of categories) {
      let maxVal = 0;
      for (const p of players) {
        const v = cat.getValue(p);
        if (v > maxVal) maxVal = v;
      }
      if (maxVal > 0) {
        const winners = players.filter((p) => cat.getValue(p) === maxVal);
        awards.push({
          id: cat.id,
          title: cat.title,
          emoji: cat.emoji,
          desc: cat.desc,
          value: maxVal,
          valText: cat.unit(maxVal),
          playerIds: winners.map((w) => w.id),
          playerName: winners.map((w) => w.name).join(' & '),
        });
      }
    }
    return awards;
  }

  // ── Effekte aus dem Baukasten ──────────────────────────────
  runEffect(p, e, ctx) {
    const global = e.target === 'all';
    const targets = this.resolveTargets(p, e.target);
    const isPotato = (c) => c.ability === 'potato';
    const tradable = (h) => h.filter((c) => !isPotato(c));
    if (targets.length && EFFECTS[e.type].targets) this.say(`   → trifft ${targets.map((t) => t.name).join(', ')}`);
    switch (e.type) {
      case 'reset': this.top = 0; this.lower = false; break;
      case 'burn': this.pile = []; this.top = 0; this.lower = false; this.triggerNecromancer(); break;
      case 'lower': this.lower = true; break;
      case 'reverse': {
        const upcoming = this.seatFrom(p, 1);
        if (this.active().length > 2 && upcoming && (this.hasRole(upcoming, 'buerger') || this.hasRole(upcoming, 'citizen'))) {
          this.buergerNext = upcoming.id;
        }
        this.dir *= -1;
        break;
      }
      case 'again': ctx.again = true; break;
      case 'boss': this.top = RULES.maxValue + 1; this.lower = false; break;
      case 'skip': ctx.skip += e.n; break;
      case 'draw':
        for (const t of targets) this.draw(t, e.n, { from: p, global });
        break;
      case 'give':
        for (const t of targets) {
          if ((this.hasRole(t, 'gott') || this.hasRole(t, 'god')) && p !== t) { this.say(`☀️ ${t.name} (Gott) weist unerwünschte Gaben zurück!`); continue; }
          if (!global && this.reflects(t, p)) { this.say(`😆 ${t.name} lacht zuletzt – ${p.name} behält die Karten.`); continue; }
          let giveCount = e.n;
          // Luis Dreizack: Bei 5 oder weniger Handkarten nur maximal 2 Karten abgeben
          if (p.hand.length <= 5 && giveCount > 2) {
            giveCount = 2;
          }
          let given = 0;
          for (let i = 0; i < giveCount; i++) {
            const pool = tradable(p.hand);
            if (!pool.length) break;
            const c = pool[randIdx(pool)];
            p.hand = p.hand.filter((x) => x !== c);
            t.hand.push(c);
            given++;
          }
          sortHand(t.hand);
          if (given) {
            this.say(`   → 🔱 Strafkarten: ${t.name} kassiert ${given} Strafkarte(n) von ${p.name}!`);
          }
        }
        break;
      case 'takePile':
        for (const t of targets) {
          if (!t || !t.inGame) continue;
          if (this.blocksWithAegis(t, p)) {
            if (t._lastAegisEcho) {
              this.say(`🛡️ Der goldene Nachhall der Aegis schützt ${t.name} vor dem Stapel!`);
            } else {
              this.say(`🛡️ ${t.name} blockt den Stapel mit der Aegis der Nullifizierung ab!`);
            }
            continue;
          }
          const who = !global && this.reflects(t, p) ? p : t;
          if (!who) continue;
          if (!Array.isArray(who.hand)) who.hand = [];
          if (!who.stats) who.stats = {};
          if (who === p) this.say(`😆 ${t.name} lacht zuletzt – ${p.name} nimmt den Stapel selbst!`);

          const isBoss = this.top === 16 || this.pile[this.pile.length - 1]?.value === 16 || this.pile[this.pile.length - 1]?.key === 'floris';
          if ((this.hasRole(who, 'meisterschuetze') || this.hasRole(who, 'marksman')) && isBoss) {
            this.say(`🏹 ${who.name} (Meisterschütze) weicht dem Boss-Schlag aus: Der Stapel prallt ab und verbrennt auf 0!`);
            this.triggerNecromancer();
            continue;
          }
          const phoenix = who.hand.find((c) => c?.ability === 'phoenix');
          if (phoenix) {
            who.hand = who.hand.filter((c) => c !== phoenix);
            const count = this.pile?.length || 0;
            this.say(`🪶 ${who.name} wirft Phönix-Asche ab: Alle ${count} Karten auf dem Tisch verbrennen vollständig zu Asche!`);
            this.triggerNecromancer();
            this.draw(who, 1, { global: true });
            sortHand(who.hand);
            continue;
          }
          const pileCount = this.pile?.length || 0;
          if ((this.hasRole(who, 'dorfdepp') || this.hasRole(who, 'fool')) && pileCount > 2) {
            const takeCount = 2;
            const burned = pileCount - takeCount;
            const taken = (this.pile || []).slice(-takeCount);
            who.stats.pileCards = (who.stats.pileCards || 0) + takeCount;
            who.hand.push(...taken);
            sortHand(who.hand);
            this.say(`🤪 ${who.name} nutzt Bauernschläue: Nimmt nur 2 Karten – ${burned} Karten verbrennen! 🔥`);
            this.triggerNecromancer();
          } else if ((this.hasRole(who, 'berserker') || this.hasRole(who, 'berserk')) && pileCount > 2) {
            const takeCount = Math.ceil(pileCount / 2);
            const burned = pileCount - takeCount;
            const taken = (this.pile || []).slice(-takeCount);
            who.stats.pileCards = (who.stats.pileCards || 0) + takeCount;
            who.hand.push(...taken);
            sortHand(who.hand);
            this.say(`🪓 ${who.name} verfällt in Blutrausch: Nimmt nur ${takeCount} Karten – ${burned} Karten verbrennen! 🔥`);
            this.triggerNecromancer();
          } else {
            who.stats.pileCards = (who.stats.pileCards || 0) + pileCount;
            if (Array.isArray(this.pile)) who.hand.push(...this.pile);
            sortHand(who.hand);
            if ((this.hasRole(who, 'buerger') || this.hasRole(who, 'citizen')) && pileCount > 0) {
              this.grantCitizenBonus(who);
            }
          }
          if (pileCount > 0) {
            this.triggerMedic(who);
          }

          // LIEFERDIENST-TRINKGELD: Nächste Person darf 2 verschiedene Zahlen ablegen
          if (e.target === 'next' && who !== p) {
            who.trinkgeld = true;
            this.say(`   → 💵 Trinkgeld für ${who.name}: Darf im nächsten Zug zwei verschiedene Zahlen ablegen!`);
          }
        }
        this.pile = []; this.top = 0; this.lower = false;
        break;
      case 'swap':
        for (const t of targets) {
          if (this.hasRole(t, 'gott') || this.hasRole(t, 'god')) {
            this.say(`☀️ ${t.name} (Gott) steht über irdischem Besitz – Hand-Tausch prallt ab!`);
            this.triggerChainEvent({
              title: 'Göttliche Erhabenheit',
              desc: `${t.name} wehrt Hand-Tausch ab!`,
              emoji: '☀️',
              actor: t.name,
              voice: this.voiceFor(t, null, 'Göttliche Erhabenheit! Meine Hand gehört den Göttern!'),
            });
            continue;
          }
          if ((this.hasRole(t, 'pazifist') || this.hasRole(t, 'pacifist')) && !global && t.hand.length > 3) {
            this.say(`🕊️ ${t.name} (Pazifist) steht unter diplomatischem Schutz – Hand-Tausch prallt ab!`);
            this.triggerChainEvent({
              title: 'Diplomatischer Schutz',
              desc: `${t.name} (Pazifist) wehrt Hand-Tausch ab!`,
              emoji: '🕊️',
              actor: t.name,
              voice: this.voiceFor(t, null, 'Diplomatische Immunität! Gewalt ist keine Lösung!'),
            });
            continue;
          }
          if (t.hand.some(isPotato)) { this.say(`🥔 ${t.name} hält die Kartoffel – immun gegen Tausch!`); continue; }
          if (this.blocksWithAegis(t, p)) {
            if (t._lastAegisEcho) {
              this.say(`🛡️ Der goldene Nachhall der Aegis schützt ${t.name} vor dem Hand-Tausch!`);
            } else {
              this.say(`🛡️ ${t.name} blockt den Hand-Tausch mit der Aegis der Nullifizierung ab!`);
            }
            continue;
          }
          if (!global && this.reflects(t, p)) { this.say(`😆 ${t.name} lacht zuletzt – kein Tausch.`); continue; }
          const keepP = p.hand.filter(isPotato);
          const mine = tradable(p.hand);
          p.hand = [...keepP, ...t.hand];
          t.hand = mine;
          sortHand(p.hand); sortHand(t.hand);
        }
        break;
      case 'rotate': {
        const act = this.active();
        const passed = act.map((pl) => {
          const pool = tradable(pl.hand);
          if (!pool.length) return null;
          const c = pool[randIdx(pool)];
          pl.hand = pl.hand.filter((x) => x !== c);
          return c;
        });
        act.forEach((pl, i) => {
          const c = passed[(i - this.dir + act.length) % act.length];
          if (c) { pl.hand.push(c); sortHand(pl.hand); }
        });
        break;
      }
    }
  }

  triggerNecromancer() {
    for (const n of this.active().filter((o) => this.hasRole(o, 'nekromant') || this.hasRole(o, 'necromancer'))) {
      if (n.hand.length > 0) {
        // Opfert bevorzugt eine Zahlenkarte (höchster Wert), sonst eine beliebige Karte
        const numCards = n.hand.filter((c) => c.kind === 'number');
        const sacrificed = numCards.length > 0
          ? numCards.reduce((max, cur) => (cur.value > max.value ? cur : max), numCards[0])
          : n.hand[0];
        n.hand = n.hand.filter((c) => c !== sacrificed);
        sortHand(n.hand);
        const elem = sacrificed.color ? COLOR_ELEMENTS[sacrificed.color] : null;
        const cardName = sacrificed.name || (elem ? `${elem.icon} ${elem.label} (${sacrificed.value})` : `Zahl ${sacrificed.value}`);
        this.say(`💀 ${n.name} (Nekromant) erntet die verbrannte Seelen-Asche und opfert kostenlos ${cardName}!`);
        this.triggerChainEvent({
          title: 'Seelen-Opfer!',
          desc: `${n.name} (Nekromant) verbrennt ${cardName} kostenlos!`,
          emoji: '💀',
          actor: n.name,
          voice: this.voiceFor(n, null, 'Seelen-Opfer! Aus Asche und Rauch entsteht neue Macht!'),
        });
      }
    }
  }

  triggerMedic(victim) {
    if (!victim) return;
    for (const m of this.active().filter((o) => this.hasRole(o, 'feldsanitaeter') || this.hasRole(o, 'medic'))) {
      if (m.hand.length > 0) {
        // Opfert/wirft bevorzugt eine niedrige Zahlenkarte als Hilfsgüter ab, sonst beliebige Karte
        const numCards = m.hand.filter((c) => c.kind === 'number');
        const discarded = numCards.length > 0
          ? numCards.reduce((min, cur) => (cur.value < min.value ? cur : min), numCards[0])
          : m.hand[0];
        m.hand = m.hand.filter((c) => c !== discarded);
        sortHand(m.hand);
        const elem = discarded.color ? COLOR_ELEMENTS[discarded.color] : null;
        const cardName = discarded.name || (elem ? `${elem.icon} ${elem.label} (${discarded.value})` : `Zahl ${discarded.value}`);
        this.say(`🩹 ${m.name} (Feldsanitäter) leistet Erste Hilfe für ${victim.name}: Wirft kostenlos ${cardName} als Hilfsgüter ab!`);
        this.triggerChainEvent({
          title: 'Erste Hilfe!',
          desc: `${m.name} (Feldsanitäter) wirft ${cardName} als Hilfsgüter ab!`,
          emoji: '🩹',
          actor: m.name,
          voice: this.voiceFor(m, null, 'Erste Hilfe ist unterwegs! Sanitäter am Einsatzort!'),
        });
      }
    }
  }

  resolveTargets(p, target) {
    const others = this.active().filter((o) => o !== p);
    if (!target || !others.length) return [];
    const n = this.players.length;
    const seat = (step) => {
      let i = this.players.indexOf(p);
      do { i = (i + step * this.dir + n) % n; } while (!this.players[i].inGame);
      return this.players[i];
    };
    const by = (f) => [others.reduce((a, b) => (f(b.hand.length, a.hand.length) ? b : a))];
    switch (target) {
      case 'next': return [seat(1)];
      case 'prev': return [seat(-1)];
      case 'random': return [others[randIdx(others)]];
      case 'fewest': return by((x, y) => x < y);
      case 'most': return by((x, y) => x > y);
      case 'all': return others;
    }
    return [];
  }

  // ── Was die Browser sehen ─────────────────────────────────
  active() { return this.players.filter((p) => p.inGame); }
  current() { return this.players[this.turn]; }
  host() { return this.players.find((p) => !p.bot && p.connected) ?? this.players.find((p) => !p.bot); }
  say(text) { this.log.push(text); this.log = this.log.slice(-8); }
  // Großes Banner für alle (z. B. Münzwurf-Ergebnis)
  fx(text) { this.lastFx = { id: (this.lastFx?.id ?? 0) + 1, text }; this.say(text); }

  // ── Chat ──────────────────────────────────────────────────
  // ── Quiz: alle ~2 Minuten eine Frage an alle, richtige Antwort = Zufallsbonus ──
  quizTick(now = Date.now()) {
    if (this.state !== 'playing') return false;
    if (this.quiz) {
      const humans = this.players.filter((p) => p.inGame && p.connected && !p.bot);
      const allIn = humans.length && humans.every((p) => this.quiz.answers.has(p.id));
      if (now >= this.quiz.until || allIn) { this.resolveQuiz(); return true; }
      return false;
    }
    if (!this.nextQuizAt || now < this.nextQuizAt) return false;
    const recent = this.quizRecent ?? [];
    let qi;
    do { qi = Math.floor(Math.random() * QUIZ.length); } while (recent.includes(qi) && recent.length < QUIZ.length);
    this.quizRecent = [...recent, qi].slice(-Math.floor(QUIZ.length * 0.8));
    const [question, right, ...wrong] = QUIZ[qi];
    const options = [right, ...wrong].sort(() => Math.random() - 0.5);
    this.quiz = { id: ++this.quizSeq, question, options, correct: options.indexOf(right), until: now + QUIZ_RULES.answerSeconds * 1000, answers: new Map() };
    this.quizResult = null;
    // Bots raten mit (60 % richtig), damit es auch gegen sie spannend ist
    for (const b of this.players.filter((p) => p.bot && p.inGame)) {
      this.quiz.answers.set(b.id, Math.random() < 0.6 ? this.quiz.correct : Math.floor(Math.random() * options.length));
    }
    this.say('🧠 Quizfrage! Wer richtig antwortet, bekommt einen Bonus.');
    return true;
  }

  quizAnswer(pid, { id, idx } = {}) {
    const q = this.quiz;
    if (!q || q.id !== id) return { error: 'Die Frage ist schon vorbei.' };
    const p = this.players.find((o) => o.id === pid && o.inGame);
    if (!p) return { error: 'Du spielst gerade nicht mit.' };
    if (q.answers.has(pid)) return { error: 'Du hast schon geantwortet.' };
    if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return { error: 'Ungültige Antwort.' };
    q.answers.set(pid, idx);
    if (this.quizTick()) return { ok: true };
    return { ok: true };
  }

  resolveQuiz() {
    const q = this.quiz;
    if (!q) return;
    this.quiz = null;
    const winners = this.players.filter((p) => p.inGame && q.answers.get(p.id) === q.correct);
    const results = [];
    for (const p of winners) {
      if (this.state !== 'playing') break;
      results.push({ id: p.id, name: p.name, ...this.quizBonus(p) });
    }
    this.quizResult = { id: q.id, question: q.question, answer: q.options[q.correct], results, nobody: !winners.length };
    this.say(winners.length ? `🧠 Richtig: ${q.options[q.correct]} – ${results.map((r) => `${r.name} ${r.text}`).join(' · ')}` : `🧠 Niemand wusste es: ${q.options[q.correct]}`);
    const j = QUIZ_RULES.jitterSeconds;
    this.nextQuizAt = Date.now() + (QUIZ_RULES.everySeconds + Math.round((Math.random() * 2 - 1) * j)) * 1000;
  }

  quizBonus(p) {
    const others = this.active().filter((o) => o !== p);
    const kinds = ['drop3', 'special', 'punish'];
    if (p.hand.length <= 1) kinds.splice(0, 1);                  // sonst gewinnt man per Quiz
    if (!others.length) kinds.splice(kinds.indexOf('punish'), 1);
    const kind = kinds[Math.floor(Math.random() * kinds.length)] ?? 'special';
    if (kind === 'drop3') {
      const n = Math.min(3, p.hand.length - 1);
      const nums = p.hand.filter((c) => c.kind === 'number').sort((a, b) => b.value - a.value);
      const gone = (nums.length >= n ? nums : p.hand).slice(0, n);
      p.hand = p.hand.filter((c) => !gone.includes(c));
      this.deck.unshift(...gone);
      return { kind, text: `wirft ${n} Karte${n === 1 ? '' : 'n'} ab 🗑️` };
    }
    if (kind === 'special') {
      const pool = [
        ...Object.entries(BASIC_SPECIALS).filter(([k]) => k !== 'joker').map(([key, c]) => card({ kind: 'special', key, ...c })),
        ...Object.entries(PLAYER_CARDS).map(([key, c]) => card({ kind: 'special', key, effects: [], ...c })),
      ];
      const c = pool[Math.floor(Math.random() * pool.length)];
      p.hand.push(c);
      return { kind, text: `bekommt ${c.emoji ?? '✨'} ${c.name}` };
    }
    // Strafe: wer am wenigsten Karten hat (also führt), zieht 3
    const target = others.sort((a, b) => a.hand.length - b.hand.length)[0];
    this.draw(target, 3, { global: true, penalty: true });
    return { kind, text: `lässt ${target.name} 3 Karten ziehen 🎯` };
  }

  // ── Einsatz der Runde ─────────────────────────────────────
  stakeVote(pid, { kind, id } = {}) {
    if (!STAKE_KINDS.includes(kind)) return { error: 'Unbekannte Kategorie.' };
    if (this.state === 'playing') return { error: 'Abgestimmt wird vor der Runde.' };
    const p = this.players.find((o) => o.id === pid && !o.bot);
    if (!p) return { error: 'Nicht am Tisch.' };
    const votes = this.stakeVotes[kind];
    if (id == null || votes.get(pid) === id) votes.delete(pid);          // nochmal tippen = Stimme zurück
    else if (this.stakeOptions[kind].some((o) => o.id === id)) votes.set(pid, id);
    else return { error: 'Diese Option gibt es nicht mehr.' };
    return { ok: true };
  }

  stakeSuggest(pid, { kind, text } = {}) {
    if (!STAKE_KINDS.includes(kind)) return { error: 'Unbekannte Kategorie.' };
    if (this.state === 'playing') return { error: 'Ideen bitte vor der Runde.' };
    const p = this.players.find((o) => o.id === pid && !o.bot);
    if (!p) return { error: 'Nicht am Tisch.' };
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, STAKE_LIMITS.textMax);
    if (clean.length < 3) return { error: 'Etwas länger bitte.' };
    const opts = this.stakeOptions[kind];
    if (opts.some((o) => o.text.toLowerCase() === clean.toLowerCase())) return { error: 'Gibt es schon.' };
    const custom = opts.filter((o) => o.by);
    if (custom.filter((o) => o.byId === pid).length >= STAKE_LIMITS.perPlayer) return { error: `Max. ${STAKE_LIMITS.perPlayer} eigene Ideen pro Kategorie.` };
    if (custom.length >= STAKE_LIMITS.totalCustom) return { error: 'Der Tisch hat genug Ideen.' };
    const id = `${kind}-c${++this.stakeSeq}`;
    opts.push({ id, text: clean, by: p.name, byId: pid });
    this.stakeVotes[kind].set(pid, id);                                  // eigene Idee = eigene Stimme
    return { ok: true };
  }

  // Meiste Stimmen gewinnt, Gleichstand und „keiner hat abgestimmt“ entscheidet der Zufall
  lockStakes() {
    const out = {};
    const present = new Set(this.players.filter((p) => p.connected && !p.bot).map((p) => p.id));
    for (const kind of STAKE_KINDS) {
      const count = new Map();
      for (const [pid, id] of this.stakeVotes[kind]) if (present.has(pid)) count.set(id, (count.get(id) ?? 0) + 1);
      const best = Math.max(0, ...count.values());
      const pool = this.stakeOptions[kind].filter((o) => (count.get(o.id) ?? 0) === best);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      out[kind] = { text: pick.text, by: pick.by, votes: best, random: best === 0 || pool.length > 1 };
      this.stakeVotes[kind].clear();
    }
    return out;
  }

  stakeView(forId) {
    const view = {};
    for (const kind of STAKE_KINDS) {
      const votes = this.stakeVotes[kind];
      const count = new Map();
      for (const id of votes.values()) count.set(id, (count.get(id) ?? 0) + 1);
      view[kind] = this.stakeOptions[kind].map((o) => ({ id: o.id, text: o.text, by: o.by, votes: count.get(o.id) ?? 0 }));
      view[kind + 'Mine'] = votes.get(forId) ?? null;
    }
    return view;
  }

  chatSay(pid, text) {
    const p = this.players.find((o) => o.id === pid);
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!p || !clean) return null;
    const now = Date.now();
    if (now - (p.lastChat || 0) < 700) return null;     // kleine Spam-Bremse
    p.lastChat = now;
    const msg = { id: pid, name: p.name, text: clean, t: now };
    this.chat = [...(this.chat ?? []), msg].slice(-60);
    return msg;
  }

  view(forId) {
    const me = this.players.find((p) => p.id === forId);
    const reveal = this.state === 'over';
    return {
      state: this.state,
      game: this.game,
      introLeft: Math.max(0, this.introUntil - Date.now()),
      host: this.host()?.id,
      deckChoice: this.deckChoice,
      turn: this.state === 'playing' ? this.current()?.id : null,
      winner: this.winner,
      ranking: this.ranking,
      stakes: this.stakeView(forId),
      quiz: this.quiz ? { id: this.quiz.id, question: this.quiz.question, options: this.quiz.options, left: Math.max(0, this.quiz.until - Date.now()), mine: this.quiz.answers.get(forId) ?? null, answered: this.quiz.answers.size } : null,
      quizNextIn: this.state === 'playing' && this.nextQuizAt ? Math.max(0, this.nextQuizAt - Date.now()) : null,
      quizResult: this.quizResult,
      stake: this.stake,
      awards: this.awards ?? [],
      top: this.top, lower: this.lower, dir: this.dir,
      wild: this.wild?.colors ?? null,
      sphere: this.pile[this.pile.length - 1]?.ability === 'twins',
      fx: this.lastFx ?? null,
      colorStreak: this.colorStreak,
      deckCount: this.deck.length,
      pile: this.pile.slice(-4),
      pileCount: this.pile.length,
      lastAction: this.lastAction ?? null,
      chainEvent: this.chainEvent ?? null,
      log: this.log,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, bot: !!p.bot, count: p.hand.length, inGame: p.inGame, connected: p.connected,
        // Rollen sind geheim – man sieht nur die eigene, der Spion sieht alle, und alle am Spielende
        role: p.role && (p.id === forId || reveal || this.hasRole(me, 'spion') || this.hasRole(me, 'spy')) ? {
          key: p.role,
          ...ROLES[p.role],
          ...(p.id === forId && p.mimicRole ? { mimicTarget: p.mimicTargetName, mimicRole: ROLES[p.mimicRole]?.name || p.mimicRole } : {}),
        } : null,
        secret: !!p.role && !(p.id === forId || reveal || this.hasRole(me, 'spion') || this.hasRole(me, 'spy')),
      })),
      hand: me?.hand ?? [],
      drawn: me?.drawn ?? null,      // deine ausgeloste Special-Karte (für die Animation)
      customCards: this.players
        .filter((p) => p.special && p.special.effects?.length)
        .map((p) => ({
          key: 'custom',
          owner: p.id,
          by: p.name,
          name: p.special.name,
          art: p.special.art || null,
          emoji: '💣',
          effects: p.special.effects,
          text: describe(p.special.effects),
        })),
    };
  }

  // Bilder (Avatare + selbstgezeichnete Karten) – getrennt, weil groß
  arts() {
    return Object.fromEntries(this.players.map((p) => [p.id, { avatar: p.avatar, art: p.special?.art ?? null }]));
  }
}

function basicCard(key) {
  const b = BASIC_SPECIALS[key];
  return card({ kind: 'special', key, name: b.name, emoji: b.emoji, effects: b.effects, art: b.art, fullArt: !!b.fullArt });
}

function pickRole(allowed = Object.keys(ROLES)) {
  const entries = Object.entries(ROLES).filter(([key]) => allowed.includes(key));
  let r = Math.random() * entries.reduce((s, [, ro]) => s + ro.weight, 0);
  for (const [key, ro] of entries) { r -= ro.weight; if (r <= 0) return key; }
  return entries[0][0];
}

function sortHand(hand) {
  if (!Array.isArray(hand)) return;
  hand.sort((a, b) => {
    if (!a || !b) return 0;
    return a.kind === b.kind ? (a.value ?? 0) - (b.value ?? 0) : a.kind === 'number' ? -1 : 1;
  });
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const randIdx = (a) => Math.floor(Math.random() * a.length);
