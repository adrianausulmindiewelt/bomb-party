// „TOPP DAS!“ – die komplette Spiellogik. Läuft nur auf dem Server.
// Spieler*innen haben eine feste ID (pid), die das Handy sich merkt – so kommt man nach
// Sperrbildschirm oder Funkloch wieder auf denselben Platz zurück.
// Jede*r bekommt eine eigene Sicht (view): die eigene Hand ganz, von den anderen nur die Anzahl.

import { RULES, BASIC_SPECIALS, CHARACTERS, PLAYER_CARDS, JESTER_COMBO, ROLES, EFFECTS, cardText, validateEffects, COLOR_ELEMENTS, COLOR_RESONANCE_TOLERANCE } from '../../shared/cards.js';

let nextCardId = 1;
const LAST_CARD_GRACE_MS = 400;   // ☝️ Puffer fürs Netz – angezeigt werden die vollen RULES.lastCardSeconds
const card = (props) => ({ id: nextCardId++, ...props });

export class CardRoom {
  constructor(id) {
    this.id = id;
    this.players = [];        // Sitzreihenfolge = Spielreihenfolge im Uhrzeigersinn
    this.state = 'lobby';     // 'lobby' | 'playing' | 'over'
    this.log = [];
    this.game = 0;            // zählt Spiele hoch – der Browser erkennt daran „neues Spiel → Intro zeigen“
    this.lastCallSeq = 0;     // ☝️ jede „Letzte Karte!“-Chance bekommt eine eigene Nummer
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
  }

  // ── Leute ──────────────────────────────────────────────────
  addPlayer(pid, { name, avatar, special }) {
    const back = this.players.find((p) => p.id === pid);
    if (back) {                                   // Wiederkehr nach Verbindungsabbruch
      back.connected = true;
      back.awaySince = 0;
      if (avatar) back.avatar = avatar;
      this.say(`${back.name} ist wieder da.`);
      return { ok: true, rejoined: true };
    }
    if (this.players.length >= RULES.maxPlayers) return { error: 'Tisch ist voll.' };
    const effects = validateEffects(special?.effects) ?? [{ type: 'reset' }];
    this.players.push({
      id: pid, name, avatar, hand: [], role: null, inGame: false, connected: true, awaySince: 0,
      special: { name: String(special?.name || `${name}s Bombe`).slice(0, 24), art: special?.art || null, effects },
      stats: { resonance: 0, pileCards: 0, drawnCards: 0, specials: 0 },
    });
    this.say(this.state === 'playing' ? `${name} schaut zu und steigt nächste Runde ein.` : `${name} ist da.`);
    return { ok: true };
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
    if (this.expireLastCalls(now)) changed = true;   // Notnagel, falls der genaue Timer nicht gegriffen hat
    const cur = this.current();
    if (this.state === 'playing' && cur && !cur.connected && now - cur.awaySince > RULES.awaySkipSeconds * 1000
        && now - (cur.lastSkipped || 0) > RULES.awaySkipSeconds * 1000) {
      cur.lastSkipped = now;
      this.say(`⏭️ ${cur.name} ist nicht da – wird übersprungen.`);
      this.advance(1);
      changed = true;
    }
    return changed;
  }

  // ── Spielstart ────────────────────────────────────────────
  start(byId) {
    if (this.state === 'playing') return { error: 'Läuft schon.' };
    if (this.host()?.id !== byId) return { error: 'Nur der Host startet.' };
    if (this.players.filter((p) => p.connected).length < 2) return { error: 'Mindestens 2 Leute.' };
    this.players = this.players.filter((p) => p.connected);
    this.reset();
    this.state = 'playing';
    this.game++;
    this.log = [];
    this.introUntil = Date.now() + RULES.introSeconds * 1000;

    // Deck: nur Zahlenkarten (bei vielen Leuten doppelt). Specials gibt es nur über das Los.
    const copies = this.players.length > 4 ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      for (const color of RULES.colors) {
        for (let v = RULES.minValue; v <= RULES.maxValue; v++) this.deck.push(card({ kind: 'number', value: v, color }));
      }
    }
    shuffle(this.deck);

    // Los-Topf: alle selbstgebauten Bomben + Charaktere + Standard-Specials + Spielerkarten
    const pot = shuffle([
      ...this.players.map((p) => card({ kind: 'special', key: 'custom', owner: p.id, by: p.name, name: p.special.name, emoji: '💣', effects: p.special.effects })),
      ...Object.entries(CHARACTERS).map(([key, ch]) => card({ kind: 'special', key, name: ch.name, title: ch.title, emoji: ch.emoji, effects: ch.effects, art: ch.art ?? `/card-art/${key}.jpg`, fullArt: !!ch.fullArt })),
      ...Object.keys(BASIC_SPECIALS).map(basicCard),
      ...Object.entries(PLAYER_CARDS).map(([key, c]) => card({ kind: 'special', key, effects: [], ...c })),
    ]);

    for (const p of this.players) {
      p.inGame = true;
      p.role = pickRole();
      p.lastCall = null;      // ☝️ offene „Letzte Karte!“-Chance { token, until }
      p.saidLast = false;     // ☝️ schon gerufen (gilt, bis man wieder mehr oder weniger als 1 Karte hat)
      p.stats = { resonance: 0, pileCards: 0, drawnCards: 0, specials: 0 };
      // Ausgeloste Specials: Standardmäßig RULES.specialsStart (2), Erzmagier bekommt 3
      const count = p.role === 'magier' ? 3 : (RULES.specialsStart || 2);
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
    const anyone = (tid) => this.active().find((o) => o.id === tid);
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
    if (cards[0].ability === 'excuseKing') {
      const ts = choice.targets;
      if (!(Array.isArray(ts) && anyone(ts[0]) && anyone(ts[1]) && ts[0] !== ts[1])) return { error: 'Wähle zwei verschiedene Personen.' };
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
      } else {
        this.say(`${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value}.`);
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
          this.colorStreak.count = 1; // Zählt jetzt als 1x – die nächste gleiche Farbe triggert direkt den 2er-Effekt!
          this.draw(nextVictim, 1, { from: p });
        }
      }

      if (cards.length >= 2 && p.role === 'alchemist' && p.hand.length > 0) {
        const lowest = p.hand.reduce((min, c) => (c.kind === 'number' && c.value < (min?.value ?? 99) ? c : min), null);
        if (lowest) {
          p.hand = p.hand.filter((c) => c !== lowest);
          this.pile.push(lowest);
          this.say(`🧪 ${p.name} (Alchemist) transmutiert das Paar: Wirft ${lowest.value} zusätzlich ab!`);
        }
      }
      // 🤖 Vibe-Coder*in: genau eine Zahl über dem Tisch → die KI vervollständigt den Zug
      const autocomplete = p.role === 'vibecoder' && prevTop > 0 && !prevLower && cards[0].value === prevTop + 1;
      if (autocomplete) this.say(`🤖 ${p.name} (Vibe-Coder*in): Autocomplete! ${prevTop} → ${cards[0].value} – sofort nochmal dran.`);
      return this.endTurn(p, { skip: 0, again: autocomplete });
    }

    this.colorStreak = { color: null, count: 0 };
    p.stats.specials = (p.stats.specials || 0) + cards.length;
    const ctx = { skip: 0, again: false };
    if (combo) {
      const [a, b2] = choice.targets.map(opp);
      this.say(`${p.name} spielt 😆😢 ${JESTER_COMBO.name}!`);
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
        if (victim.role === 'gott') {
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
    } else if (sp.ability === 'excuseKing') {
      // 👑 Zwei beliebige Personen (auch man selbst) tauschen die Hände – kein Schelm kontert.
      // Gott und die Aegis schützen trotzdem, die Kartoffel bleibt bei der Person, die sie hält.
      const [a, b] = choice.targets.map(anyone);
      const god = [a, b].find((x) => x !== p && x.role === 'gott');
      const shielded = !god && [a, b].find((x) => this.blocksWithAegis(x, p));
      if (god) {
        this.say(`☀️ ${god.name} (Gott) lässt sich auch vom König nichts sagen – kein Tausch!`);
      } else if (shielded) {
        this.say(`🛡️ ${shielded.name} blockt den Königs-Tausch mit der Aegis der Nullifizierung ab!`);
      } else {
        const isPotato = (c) => c.ability === 'potato';
        const restA = a.hand.filter((c) => !isPotato(c));
        a.hand = [...a.hand.filter(isPotato), ...b.hand.filter((c) => !isPotato(c))];
        b.hand = [...b.hand.filter(isPotato), ...restA];
        sortHand(a.hand); sortHand(b.hand);
        this.say(`   → 👑 ${a.name} und ${b.name} tauschen die Hände. Keine Widerrede!`);
      }
    }
    for (const e of sp.effects ?? []) this.runEffect(p, e, ctx);
    if (p.role === 'junggott' && !ctx.again) {
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
    if (t.role === 'gott') {
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
      if (t.role === 'gott' && !global) {
        this.say(`☀️ ${t.name} (Gott) ist erhaben – Göttliches Karma zwingt ${from.name}, stattdessen ${n} Karten zu ziehen!`);
        return this.draw(from, n, { global: true, noReflect: true, penalty: true });
      }
      if (t.role === 'pazifist' && !global && t.hand.length > 3) {
        this.say(`🕊️ ${t.name} (Pazifist) steht unter diplomatischem Schutz – Zieh-Angriff verpufft!`);
        return;
      }
      if (this.blocksWithAegis(t, from)) {
        this.say(`🛡️ ${t.name} wirft die Aegis der Nullifizierung ab – Zieh-Effekt vollständig geblockt!`);
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
              this.draw(protector, n, { global: true, penalty: true, noReflect: true });
              return;
            }
          }
        }
        if (!noReflect && this.reflects(t, from)) {
          this.say(`😆 ${t.name} lacht zuletzt – ${from.name} zieht ${n} statt ${t.name}!`);
          return this.draw(from, n, { global: true, penalty: true });
        }
        const mirror = t.hand.find((c) => c.ability === 'mirror');
        if (mirror && !noReflect) {
          t.hand = t.hand.filter((c) => c !== mirror);
          this.pile.push(mirror);
          this.say(`🪞 ${t.name} spiegelt den Angriff mit dem Prismatischen Spiegel – ${from.name} zieht ebenfalls ${n}!`);
          this.draw(from, n, { global: true, noReflect: true, penalty: true });
        }
        const twins = t.hand.find((c) => c.ability === 'twins');
        if (twins) {
          t.hand = t.hand.filter((c) => c !== twins);
          this.pile.push(twins);
          const half = Math.ceil(n / 2);
          const nbs = [this.seatFrom(t, 1), this.seatFrom(t, -1)];
          this.say(`♊ ${t.name} kontert mit der Zwillings-Parade – ${[...new Set(nbs)].map((x) => x.name).join(' & ')} ziehen je ${half}!`);
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
    if (t.role === 'pechvogel' && from && from !== t && !global && got > 0) {
      this.say(`🐦‍⬛ Geteiltes Pech: Weil ${t.name} zieht, muss ${from.name} auch 1 Karte ziehen!`);
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
      this.triggerNecromancer();
      this.draw(p, 1, { global: true });
      sortHand(p.hand);
      return this.endTurn(p, { skip: 0, again: false });
    }
    if (p.role === 'dorfdepp' && this.pile.length > 3) {
      const takeCount = 3;
      const burned = this.pile.length - takeCount;
      const taken = this.pile.slice(-takeCount);
      p.stats.pileCards = (p.stats.pileCards || 0) + takeCount;
      p.hand.push(...taken);
      this.say(`🤪 ${p.name} nutzt Bauernschläue: Nimmt nur 3 Karten – ${burned} Karten verbrennen! 🔥`);
    } else if (p.role === 'berserker' && this.pile.length > 2) {
      const takeCount = Math.ceil(this.pile.length / 2);
      const burned = this.pile.length - takeCount;
      const taken = this.pile.slice(-takeCount);
      p.stats.pileCards = (p.stats.pileCards || 0) + takeCount;
      p.hand.push(...taken);
      this.say(`🪓 ${p.name} verfällt in Blutrausch: Nimmt nur ${takeCount} Karten – ${burned} Karten verbrennen! 🔥`);
    } else {
      p.stats.pileCards = (p.stats.pileCards || 0) + this.pile.length;
      this.say(`${p.name} nimmt den Stapel (${this.pile.length} Karten). 😬`);
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
    if (p && p.role === 'held' && p.hand.length <= 2 && cards.every((c) => c.kind === 'number')) {
      return null; // 🦸 Heldenmut: Darf jede Zahl auf jede Zahl legen
    }
    if (p && p.role === 'gluecksspieler' && cards.every((c) => c.kind === 'number') && this.top > 0) {
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
    this.watchLastCards();
    return { ok: true };
  }

  // ── ☝️ Letzte Karte! ──────────────────────────────────────
  // Wer auf genau eine Karte kommt, muss innerhalb von RULES.lastCardSeconds „Letzte Karte!“ drücken –
  // sonst zieht er/sie zufällig 3–4 Strafkarten (RULES.lastCardPenalty).
  watchLastCards(now = Date.now()) {
    for (const o of this.active()) {
      if (o.hand.length !== 1) { o.lastCall = null; o.saidLast = false; continue; }
      if (!o.lastCall && !o.saidLast) o.lastCall = { token: ++this.lastCallSeq, until: now + RULES.lastCardSeconds * 1000 + LAST_CARD_GRACE_MS };
    }
  }

  callLast(id, now = Date.now()) {
    const p = this.players.find((o) => o.id === id);
    if (this.state !== 'playing' || !p?.lastCall) return { error: 'Gerade gibt es nichts zu rufen.' };
    if (now > p.lastCall.until) return { error: 'Zu spät! ⏰' };
    p.lastCall = null;
    p.saidLast = true;
    this.say(`☝️ ${p.name}: LETZTE KARTE!`);
    return { ok: true };
  }

  // Abgelaufene Chancen bestrafen. Gibt true zurück, wenn jemand ziehen musste.
  expireLastCalls(now = Date.now()) {
    if (this.state !== 'playing') return false;
    let changed = false;
    for (const o of this.active()) {
      if (!o.lastCall || now < o.lastCall.until) continue;
      o.lastCall = null;
      o.saidLast = true;   // bei leerem Stapel bleibt es bei 1 Karte – dann nicht gleich nochmal
      const [min, max] = RULES.lastCardPenalty;
      const n = min + Math.floor(Math.random() * (max - min + 1));
      this.say(`⏰ ${o.name} hat „Letzte Karte!“ verpennt – ${n} Strafkarten!`);
      this.draw(o, n, { global: true, penalty: true });
      changed = true;
    }
    if (changed) this.watchLastCards(now);
    return changed;
  }

  // Millisekunden bis zur nächsten ablaufenden Chance (oder null) – dafür stellt der Server einen Timer
  nextLastCallIn(now = Date.now()) {
    const due = this.active().filter((o) => o.lastCall).map((o) => o.lastCall.until - now);
    return due.length ? Math.max(0, Math.min(...due)) : null;
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
          if (t.role === 'gott' && p !== t) { this.say(`☀️ ${t.name} (Gott) weist unerwünschte Gaben zurück!`); continue; }
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
          if (t.role === 'gott') {
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
          if (t.role === 'gott') {
            this.say(`☀️ ${t.name} (Gott) steht über irdischem Besitz – Hand-Tausch prallt ab!`);
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
    for (const n of this.active().filter((o) => o.role === 'nekromant')) {
      if (this.deck.length > 0) {
        const soul = this.deck.pop();
        n.hand.push(soul);
        sortHand(n.hand);
        this.say(`💀 ${n.name} (Nekromant) erntet die verbrannte Asche und zieht 1 Karte (${soul.name || soul.value})!`);
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
  host() { return this.players.find((p) => p.connected) ?? this.players[0]; }
  say(text) { this.log.push(text); this.log = this.log.slice(-8); }
  // Großes Banner für alle (z. B. Münzwurf-Ergebnis)
  fx(text) { this.lastFx = { id: (this.lastFx?.id ?? 0) + 1, text }; this.say(text); }

  // ── Chat ──────────────────────────────────────────────────
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
      turn: this.state === 'playing' ? this.current()?.id : null,
      winner: this.winner,
      ranking: this.ranking,
      awards: this.awards ?? [],
      top: this.top, lower: this.lower, dir: this.dir,
      wild: this.wild?.colors ?? null,
      sphere: this.pile[this.pile.length - 1]?.ability === 'twins',
      fx: this.lastFx ?? null,
      colorStreak: this.colorStreak,
      deckCount: this.deck.length,
      pile: this.pile.slice(-4),
      pileCount: this.pile.length,
      log: this.log,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, count: p.hand.length, inGame: p.inGame, connected: p.connected,
        // Rollen sind geheim – man sieht nur die eigene, der Spion sieht alle, und alle am Spielende
        role: p.role && (p.id === forId || reveal || me?.role === 'spion') ? { key: p.role, ...ROLES[p.role] } : null,
        secret: !!p.role && !(p.id === forId || reveal || me?.role === 'spion'),
      })),
      hand: me?.hand ?? [],
      drawn: me?.drawn ?? null,      // deine ausgeloste Special-Karte (für die Animation)
      // ☝️ Nur du siehst deinen Knopf: token = welche Chance, ms = wie lange noch
      lastCall: this.state === 'playing' && me?.lastCall
        ? { token: me.lastCall.token, ms: Math.max(0, me.lastCall.until - LAST_CARD_GRACE_MS - Date.now()) } : null,
    };
  }

  // Bilder (Avatare + selbstgezeichnete Karten) – getrennt, weil groß
  arts() {
    return Object.fromEntries(this.players.map((p) => [p.id, { avatar: p.avatar, art: p.special.art }]));
  }
}

function basicCard(key) {
  const b = BASIC_SPECIALS[key];
  return card({ kind: 'special', key, name: b.name, emoji: b.emoji, effects: b.effects, art: b.art, fullArt: !!b.fullArt });
}

function pickRole() {
  const entries = Object.entries(ROLES);
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
