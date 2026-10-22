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
  voiceFor(p, key, fallback) {
    if (this.deckChoice.voice === false) return null;
    const line = VOICE_LINES[key] ?? fallback;
    return line ? { key: VOICE_LINES[key] ? key : null, line, by: p.id, skipped: false } : null;
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
    if (!p || !p.role) return false;
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
    let n = 1;
    while (this.players.some((p) => p.name === `Bot ${n}`)) n++;
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
    // Erst möglichst viele Zahlen loswerden; hohe Werte als Reserve halten.
    const numbers = [...groups.values(), ...p.hand.filter((c) => c.kind === 'number').map((c) => [c])]
      .sort((a, b) => b.length - a.length || (this.lower ? b[0].value - a[0].value : a[0].value - b[0].value));
    const specials = p.hand.filter((c) => c.kind === 'special').map((c) => [c]);
    const happy = p.hand.find((c) => c.ability === 'luckyJester');
    const sad = p.hand.find((c) => c.ability === 'sadJester');
    const combos = happy && sad && others.length >= 2 ? [[happy, sad]] : [];
    for (const cards of [...combos, ...numbers, ...specials]) {
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
    if (!combo && cards[0].ability === 'zenBuff' && !opp(choice.target)) return { error: 'Wähle, wer Džanas Zen-Vibes erhalten soll.' };
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
      if (resonanceBonusTriggered) {
        this.say(`🎵 Farb-Resonanz! ${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value} ${elemIcon} auf ${prevTop}.`);
        this.setLastAction(`${p.name}: Resonanz ${cards[0].value} ${elemIcon}`, '🎵');
        this.triggerChainEvent({
          title: 'Farb-Resonanz!',
          desc: `${p.name} unterbietet mit ${cards[0].value} ${elemIcon} (${elem?.label || cards[0].color}) auf ${prevTop}`,
          emoji: '🎵',
          actor: p.name,
        });
      } else {
        this.say(`${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value}.`);
        this.setLastAction(`${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value} ${elemIcon}`, elemIcon || '🃏');
      }

      // ⚡ Elementar-Kette: 3x dieselbe Farbe in Folge zwingt den/die Nächste*n zum Ziehen
      const cardColor = cards[0].color;
      if (this.colorStreak.color === cardColor) {
        this.colorStreak.count += cards.length;
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
    // Spielerkarten haben lange Texte → im Protokoll nur der Name (Details per Antippen)
    this.say(`${p.name} spielt ${sp.emoji} ${sp.name}${sp.text ? '!' : ': ' + cardText(sp)}`);
    this.setLastAction(`${p.name}: ${sp.name}`, sp.emoji || '✨');
    this.triggerChainEvent({
      title: sp.name,
      desc: cardText(sp) || `${p.name} aktiviert Fähigkeit`,
      emoji: sp.emoji || '✨',
      actor: p.name,
      voice: this.voiceFor(p, sp.key === 'custom' ? null : sp.key, `${sp.name}! ${cardText(sp)}.`),
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
      this.say(`   → 🛡️ Die Null-Zone reinigt den Tisch: Stapel zählt wieder ab 0.`);
    } else if (sp.ability === 'blackHole') {
      this.say(`   → 🕳️ Die Singularität verschlingt alles! Stapel wird verbrannt.`);
      this.pile = [];
      this.top = 0;
      this.lower = false;
      this.triggerNecromancer();
      for (const o of this.active()) {
        if (o !== p && o.hand.length > 0) {
          const idx = Math.floor(Math.random() * o.hand.length);
          const victimCard = o.hand.splice(idx, 1)[0];
          this.say(`   → 🕳️ ${o.name} verliert 1 Karte an das Schwarze Loch!`);
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
        p.hand.push(stolen);
        sortHand(p.hand);
        sortHand(victim.hand);
        this.say(`   → 🥷 ${p.name} stiehlt verdeckt 1 Karte von ${victim.name}!`);
      }
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
          this.say(`🛡️ ${victim.name} wehrt den Göttlichen Blitz mit der Aegis ab!`);
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
      const victim = opp(choice.target);
      if (victim) {
        let discarded = 0;
        for (let i = 0; i < 2 && victim.hand.length > 0; i++) {
          const idx = Math.floor(Math.random() * victim.hand.length);
          const c = victim.hand.splice(idx, 1)[0];
          this.pile.push(c);
          discarded++;
        }
        sortHand(victim.hand);
        this.top = 15;
        this.lower = false;
        this.say(`   → 🧘‍♀️ Džanas Zen-Gong ertönt! ${victim.name} atmet durch und wirft ${discarded} Karten ab. Der Tisch steht auf Boss (15)!`);
      }
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
      this.say(`   → 🎨 Teyas Scribbl-Meisterwerk! Bunte Farbenpracht: Tisch gereinigt, alle Farbregeln aufgehoben!`);
      this.top = 0;
      this.lower = false;
      this.wild = { colors: [...RULES.colors], owner: p.id };
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
          sortHand(o.hand);
          this.say(`   → 🎆 ${o.name} verbrennt ${highest.color} ${highest.value} im Funkenregen!`);
        }
      }
    }
    for (const e of sp.effects ?? []) this.runEffect(p, e, ctx);
    if ((this.hasRole(p, 'junggott') || this.hasRole(p, 'demigod')) && !ctx.again) {
      ctx.again = true;
      this.say(`⚡ ${p.name} (Junger Gott) entfesselt Himmelsblitz: Ist sofort noch einmal dran!`);
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
      this.say(`🛡️ ${t.name} wehrt die Heiße Kartoffel mit der Aegis der Nullifizierung ab – sie fällt in den Ziehstapel!`);
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
        });
        return;
      }
      if (this.blocksWithAegis(t, from)) {
        this.say(`🛡️ ${t.name} wirft die Aegis der Nullifizierung ab – Zieh-Effekt vollständig geblockt!`);
        this.triggerChainEvent({
          title: 'Aegis der Nullifizierung',
          desc: `${t.name} blockt den Angriff vollständig!`,
          emoji: '🛡️',
          actor: t.name,
        });
        return;
      }
      if (!global) {
        const teyaCard = t.hand.find((c) => c.ability === 'teyaScribbl');
        if (teyaCard && !noReflect) {
          const others = this.active().filter((o) => o !== t);
          if (others.length) {
            const protector = others.reduce((max, cur) => cur.hand.length > max.hand.length ? cur : max, others[0]);
            if (protector && protector !== t) {
              this.say(`🎨 Gankoomon-Schutz: ${protector.name} fängt ${n} Strafkarten schützend für ${t.name} ab!`);
              this.triggerChainEvent({
                title: 'Gankoomon-Schutz!',
                desc: `${protector.name} fängt ${n} Strafkarten für ${t.name} ab!`,
                emoji: '🎨',
                actor: protector.name,
              });
              this.draw(protector, n, { global: true, penalty: true, noReflect: true });
              return;
            }
          }
        }
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
          this.say(`🪞 ${t.name} spiegelt den Angriff mit dem Prismatischen Spiegel – ${from.name} zieht ebenfalls ${n}!`);
          this.triggerChainEvent({
            title: 'Prismatischer Spiegel!',
            desc: `${t.name} spiegelt Angriff – ${from.name} zieht ${n}!`,
            emoji: '🪞',
            actor: t.name,
          });
          this.draw(from, n, { global: true, noReflect: true, penalty: true });
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
    let got = 0;
    for (; got < n && this.deck.length; got++) t.hand.push(this.deck.pop());
    sortHand(t.hand);
    if (got && isPenalty) {
      t.stats.drawnCards = (t.stats.drawnCards || 0) + got;
    }
    if (got) this.say(`   → ${t.name} zieht ${got}${got < n ? ' (Stapel leer)' : ''}`);
    if ((this.hasRole(t, 'pechvogel') || this.hasRole(t, 'unlucky')) && from && from !== t && !global && got > 0) {
      this.say(`🐦‍⬛ Geteiltes Pech: Weil ${t.name} zieht, muss ${from.name} auch 1 Karte ziehen!`);
      this.triggerChainEvent({
        title: 'Geteiltes Pech!',
        desc: `${from.name} muss wegen ${t.name} 1 Karte mitziehen!`,
        emoji: '🐦‍⬛',
        actor: t.name,
      });
      this.draw(from, 1, { global: true, noReflect: true, penalty: true });
    }
  }

  // 🛡️ Aegis der Nullifizierung: blockt negative Effekte aus der Hand ab
  blocksWithAegis(t, from) {
    if (!from || t === from) return false;
    const aegis = t.hand.find((c) => c.ability === 'aegis');
    if (!aegis) return false;
    t.hand = t.hand.filter((c) => c !== aegis);
    this.pile.push(aegis);
    return true;
  }

  // 😆 Glücklicher Schelm: verbraucht sich und wirft einen gezielten Angriff zurück
  reflects(t, from) {
    if (!from || t === from) return false;
    const lucky = t.hand.find((c) => c.ability === 'luckyJester');
    if (!lucky) return false;
    t.hand = t.hand.filter((c) => c !== lucky);
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
    if ((this.hasRole(p, 'dorfdepp') || this.hasRole(p, 'fool')) && this.pile.length > 3) {
      const takeCount = 3;
      const burned = this.pile.length - takeCount;
      const taken = this.pile.slice(-takeCount);
      p.stats.pileCards = (p.stats.pileCards || 0) + takeCount;
      p.hand.push(...taken);
      this.say(`🤪 ${p.name} nutzt Bauernschläue: Nimmt nur 3 Karten – ${burned} Karten verbrennen! 🔥`);
      this.setLastAction(`${p.name} nimmt 3 Karten (Bauernschläue)`, '🤪');
      this.triggerChainEvent({
        title: 'Bauernschläue',
        desc: `${p.name} nimmt nur 3 Karten (${burned} verbrannt)!`,
        emoji: '🤪',
        actor: p.name,
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
      });
    } else {
      p.stats.pileCards = (p.stats.pileCards || 0) + this.pile.length;
      this.say(`${p.name} nimmt den Stapel (${this.pile.length} Karten). 😬`);
      this.setLastAction(`${p.name} nimmt Stapel (${this.pile.length} Karten)`, '😬');
      p.hand.push(...this.pile);
    }
    sortHand(p.hand);
    this.pile = [];
    this.top = 0;
    this.lower = false;
    this.colorStreak = { color: null, count: 0 };
    return this.endTurn(p, { skip: 0, again: false });
  }

  isResonant(cards) {
    if (!this.top || !this.pile.length) return false;
    const topCard = this.pile[this.pile.length - 1];
    if (!topCard || !topCard.color) return false;
    return cards.length > 0 && cards.every((c) => c.kind === 'number' && c.color === topCard.color);
  }

  whyNot(cards) {
    const p = this.current();
    if (p && (this.hasRole(p, 'held') || this.hasRole(p, 'hero')) && p.hand.length <= 2 && cards.every((c) => c.kind === 'number')) {
      return null; // 🦸 Heldenmut: Darf jede Zahl auf jede Zahl legen
    }
    if (p && (this.hasRole(p, 'gluecksspieler') || this.hasRole(p, 'gambler')) && cards.every((c) => c.kind === 'number') && this.top > 0) {
      const v = cards[0].value;
      if ((v % 2) !== (this.top % 2)) return null; // 🎲 Gezinkte Würfel: Ungerade auf gerade (oder umgekehrt) klappt immer
    }
    if (cards[0].kind === 'special' || cards.some((c) => c.kind === 'special')) {
      if (cards.length === 1) return null;
      const ab = cards.map((c) => c.ability).sort().join('+');
      return ab === 'luckyJester+sadJester' ? null : 'Specials nur einzeln (Ausnahme: beide Schelme).';
    }
    if (cards.some((c) => c.value !== cards[0].value)) return 'Nur gleiche Zahlen zusammen.';
    const v = cards[0].value;
    if (this.top === 0) return null;
    // ♊ freie Farben: passen auf alles
    if (this.wild && cards.every((c) => this.wild.colors.includes(c.color))) return null;
    // ♊ Sphäre: liegt die Zwillings-Parade oben, geht auch genau 1 drunter
    if (this.pile[this.pile.length - 1]?.ability === 'twins' && v === this.top - 1) return null;

    const resonant = this.isResonant(cards);
    const tol = resonant ? (RULES.resonanceTolerance ?? COLOR_RESONANCE_TOLERANCE) : 0;

    if (this.lower) {
      const maxAllowed = this.top + tol;
      const ok = RULES.equalAllowed ? v <= maxAllowed : (v < this.top || (resonant && v <= maxAllowed));
      return ok ? null : `Muss ${RULES.equalAllowed ? '≤' : '<'} ${this.top} sein${resonant ? ` (Resonanz-Limit: ${maxAllowed})` : ''}.`;
    }
    const minAllowed = Math.max(1, this.top - tol);
    const ok = RULES.equalAllowed ? v >= minAllowed : (v > this.top || (resonant && v >= minAllowed));
    return ok ? null : `Muss ${RULES.equalAllowed ? '≥' : '>'} ${this.top} sein${resonant ? ` (Resonanz-Limit: ${minAllowed})` : ''}.`;
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
    if (!again) this.advance(1 + skip);
    return { ok: true };
  }

  advance(steps) {
    const n = this.players.length;
    if (!this.active().length) return;
    for (let s = 0; s < steps; s++) {
      do { this.turn = (this.turn + this.dir + n) % n; } while (!this.players[this.turn].inGame);
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
      case 'reverse': this.dir *= -1; break;
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
          for (let i = 0; i < e.n; i++) {
            const pool = tradable(p.hand);
            if (!pool.length) break;
            const c = pool[randIdx(pool)];
            p.hand = p.hand.filter((x) => x !== c);
            t.hand.push(c);
          }
          sortHand(t.hand);
        }
        break;
      case 'takePile':
        for (const t of targets) {
          if (this.hasRole(t, 'gott') || this.hasRole(t, 'god')) {
            this.say(`☀️ ${t.name} (Gott) gebietet über die Ordnung – Stapel-Kassieren prallt ab!`);
            continue;
          }
          if (this.blocksWithAegis(t, p)) {
            this.say(`🛡️ ${t.name} blockt den Stapel mit der Aegis der Nullifizierung ab!`);
            continue;
          }
          const who = !global && this.reflects(t, p) ? p : t;
          if (who === p) this.say(`😆 ${t.name} lacht zuletzt – ${p.name} nimmt den Stapel selbst!`);
          who.stats.pileCards = (who.stats.pileCards || 0) + this.pile.length;
          who.hand.push(...this.pile); sortHand(who.hand);
        }
        this.pile = []; this.top = 0; this.lower = false;
        break;
      case 'swap':
        for (const t of targets) {
          if (this.hasRole(t, 'gott') || this.hasRole(t, 'god')) {
            this.say(`☀️ ${t.name} (Gott) steht über irdischem Besitz – Hand-Tausch prallt ab!`);
            continue;
          }
          if ((this.hasRole(t, 'pazifist') || this.hasRole(t, 'pacifist')) && !global && t.hand.length > 3) {
            this.say(`🕊️ ${t.name} (Pazifist) steht unter diplomatischem Schutz – Hand-Tausch prallt ab!`);
            this.triggerChainEvent({
              title: 'Diplomatischer Schutz',
              desc: `${t.name} (Pazifist) wehrt Hand-Tausch ab!`,
              emoji: '🕊️',
              actor: t.name,
            });
            continue;
          }
          if (t.hand.some(isPotato)) { this.say(`🥔 ${t.name} hält die Kartoffel – immun gegen Tausch!`); continue; }
          if (this.blocksWithAegis(t, p)) {
            this.say(`🛡️ ${t.name} blockt den Hand-Tausch mit der Aegis der Nullifizierung ab!`);
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
        const cardName = sacrificed.name || `${sacrificed.color} ${sacrificed.value}`;
        this.say(`💀 ${n.name} (Nekromant) erntet die verbrannte Seelen-Asche und opfert kostenlos ${cardName}!`);
        this.triggerChainEvent({
          title: 'Seelen-Opfer!',
          desc: `${n.name} (Nekromant) verbrennt ${cardName} kostenlos!`,
          emoji: '💀',
          actor: n.name,
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
        role: p.role && (p.id === forId || reveal || this.hasRole(me, 'spion') || this.hasRole(me, 'spy')) ? { key: p.role, ...ROLES[p.role] } : null,
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
  hand.sort((a, b) => (a.kind === b.kind ? (a.value ?? 0) - (b.value ?? 0) : a.kind === 'number' ? -1 : 1));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const randIdx = (a) => Math.floor(Math.random() * a.length);
