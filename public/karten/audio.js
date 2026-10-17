// Web Audio API Sound- & Musik-Engine für „TOPP DAS!“
// Synth-SFX plus lokal gespeicherte Meme-Clips; kein externer Dienst während des Spiels.
import { MemePlayer } from './meme-sounds.js';

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.bgmPlaying = false;
    this.bgmTimer = null;
    this.step = 0;

    // Einstellungen aus localStorage laden
    this.sfxEnabled = localStorage.getItem('topp-das-sfx') !== 'false';
    this.bgmEnabled = localStorage.getItem('topp-das-bgm') !== 'false'; // Musik läuft automatisch, bis man sie ausschaltet

    this.memes = new MemePlayer(() => this.sfxEnabled);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.memes.stop(); });

    // Autoplay Unlock Listener
    this._unlockHandler = () => this.unlock();
    ['pointerdown', 'click', 'touchstart', 'keydown'].forEach((e) => {
      window.addEventListener(e, this._unlockHandler, { passive: true });
    });
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(this.sfxEnabled ? 0.9 : 0, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);
    this.memes.attach(this.ctx, this.sfxGain);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(this.bgmEnabled ? 0.35 : 0, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    // Musik erst starten, wenn der Browser Ton erlaubt – sonst stauen sich die Noten
    if (this.bgmEnabled && this.ctx.state === 'running') this.startBGM();
  }

  // Browser erlauben Ton oft erst nach dem ersten Tippen/Klicken.
  // Wir versuchen es sofort beim Laden und spätestens bei der ersten Berührung.
  unlock() {
    this.init();
    if (!this.ctx) return;
    const go = () => {
      if (this.bgmEnabled && !this.bgmPlaying) this.startBGM();
      if (this.ctx.state === 'running') {
        this.memes.preload();
        ['pointerdown', 'click', 'touchstart', 'keydown'].forEach((e) => window.removeEventListener(e, this._unlockHandler));
      }
    };
    if (this.ctx.state === 'suspended') this.ctx.resume().then(go).catch(() => {});
    else go();
  }

  toggleSFX() {
    this.init();
    this.sfxEnabled = !this.sfxEnabled;
    localStorage.setItem('topp-das-sfx', this.sfxEnabled);
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.sfxEnabled ? 0.9 : 0, this.ctx.currentTime);
    }
    if (!this.sfxEnabled) this.memes.stop();
    if (this.sfxEnabled) this.playCardSnap();
    return this.sfxEnabled;
  }

  toggleBGM() {
    this.init();
    this.bgmEnabled = !this.bgmEnabled;
    localStorage.setItem('topp-das-bgm', this.bgmEnabled);
    if (this.bgmEnabled) {
      if (!this.bgmPlaying) this.startBGM();
      if (this.bgmGain && this.ctx) {
        this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.bgmGain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 0.5);
      }
    } else {
      if (this.bgmGain && this.ctx) {
        this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.bgmGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
      }
      setTimeout(() => { if (!this.bgmEnabled) this.stopBGM(); }, 600);
    }
    return this.bgmEnabled;
  }

  // ─────────────────────────────────────────────────────────────
  // HINTERGRUNDMUSIK (Synthesizer Loop: Chill, atmosphärisch & spannend)
  // ─────────────────────────────────────────────────────────────
  startBGM() {
    if (this.bgmPlaying) return;
    this.init();
    if (!this.ctx) return;
    this.bgmPlaying = true;
    this.step = 0;

    // D-Moll / Dorian Progression: Dm - Bb - Gm - A7
    const chords = [
      [146.83, 220.00, 261.63, 349.23], // Dm (D3, A3, C4, F4)
      [116.54, 174.61, 233.08, 293.66], // Bb (Bb2, F3, Bb3, D4)
      [98.00,  146.83, 196.00, 293.66], // Gm (G2, D3, G3, D4)
      [110.00, 164.81, 220.00, 277.18], // A7 (A2, E3, A3, C#4)
    ];

    const arps = [
      [293.66, 349.23, 440.00, 523.25, 440.00, 349.23], // Dm
      [233.08, 293.66, 349.23, 466.16, 349.23, 293.66], // Bb
      [196.00, 246.94, 293.66, 392.00, 293.66, 246.94], // Gm
      [220.00, 277.18, 329.63, 440.00, 329.63, 277.18], // A7
    ];

    const bpm = 104;
    const stepTime = (60 / bpm) / 4; // 16tel Noten (ca. 144ms)

    const scheduleLoop = () => {
      if (!this.bgmPlaying || !this.ctx) return;
      const bar = Math.floor(this.step / 16) % 4;
      const beat = this.step % 16;
      const now = this.ctx.currentTime;

      // 1. Warmer Flächen-Akkord zu Beginn jedes Takts
      if (beat === 0) {
        this._playPad(chords[bar], now, stepTime * 15.5);
      }

      // 2. Weicher Sub-Bass auf Schlag 1, 7, 10
      if (beat === 0 || beat === 6 || beat === 10) {
        const root = chords[bar][0];
        this._playBass(root, now, stepTime * 3);
      }

      // 3. Arpeggio / Melodietupfer auf ausgewählten 16teln
      if (beat % 2 === 0) {
        const noteIdx = (beat / 2) % arps[bar].length;
        const freq = arps[bar][noteIdx];
        this._playArpNote(freq, now, stepTime * 1.6);
      }

      // 4. Sanfter Rhythmus-Tick (gefiltertes weißes Rauschen)
      if (beat % 4 === 2 || beat === 14) {
        this._playSoftSnare(now);
      }

      this.step++;
      this.bgmTimer = setTimeout(scheduleLoop, stepTime * 1000);
    };

    scheduleLoop();
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) clearTimeout(this.bgmTimer);
    this.bgmTimer = null;
  }

  _playPad(chord, time, duration) {
    if (!this.ctx || !this.bgmGain) return;
    chord.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, time);
      filter.frequency.linearRampToValueAtTime(800, time + duration * 0.5);
      filter.frequency.linearRampToValueAtTime(400, time + duration);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.4);
      gain.gain.setValueAtTime(0.035, time + duration - 0.4);
      gain.gain.linearRampToValueAtTime(0.0001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + duration);
    });
  }

  _playBass(freq, time, duration) {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + duration);
  }

  _playArpNote(freq, time, duration) {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + duration);

    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + duration);
  }

  _playSoftSnare(time) {
    if (!this.ctx || !this.bgmGain) return;
    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, time);
    filter.Q.setValueAtTime(1.2, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.02, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    noise.start(time);
  }

  // ─────────────────────────────────────────────────────────────
  // SOUNDEFFEKTE (SFX) FÜR KARTEN & SYSTEM-AKTIONEN
  // ─────────────────────────────────────────────────────────────

  // Basis-Sound: Knackiges Kartenlegen (Zahlenkarte)
  playCardSnap() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Harmonischer Farb-Resonanz-Akkord (Quinte + Oktave + Glitzern)
  playResonance(color) {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    this.playCardSnap();
    const now = this.ctx.currentTime;

    const baseFreq = color === '#ff3d7f' ? 523.25 // Rubin / Feuer: C5
      : color === '#3dc6ff' ? 659.25             // Saphir / Eis: E5
      : color === '#ffd23d' ? 783.99             // Topas / Blitz: G5
      : 880.0;                                   // Smaragd / Natur: A5

    [baseFreq, baseFreq * 1.5, baseFreq * 2].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.035);

      gain.gain.setValueAtTime(0.001, now + idx * 0.035);
      gain.gain.linearRampToValueAtTime(0.16, now + idx * 0.035 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.035 + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.035);
      osc.stop(now + idx * 0.035 + 0.5);
    });
  }

  // Universelle Sound-Weiche für das Ausspielen einer Karte
  playCardSound(card) {
    if (!card) return this.playCardSnap();
    if (card.kind === 'number') return this.playCardSnap();

    const ab = card.ability;
    if (ab === 'aegis') return this.playShield();
    if (ab === 'blackHole') return this.playBlackHole();
    if (ab === 'timestop') return this.playTimestop();
    if (ab === 'thief') return this.playThief();
    if (ab === 'portal') return this.playPortal();
    if (ab === 'divineWrath') return this.playThunder();
    if (ab === 'phoenix') return this.playPhoenix();
    if (ab === 'timeloop') return this.playTimeloop();
    if (ab === 'earthquake') return this.playEarthquake();
    if (ab === 'potato') return this.playPotato();
    if (ab === 'mirror') return this.playMirror();
    if (ab === 'twins') return this.playTwins();
    if (ab === 'luckyJester' || ab === 'sadJester') return this.playJester();
    if (ab === 'chainCurse') return this.playChainCurse();
    if (ab === 'pizzaRaid') return this.playTake();
    if (ab === 'zenBuff') return this.playMagicChime();
    if (ab === 'fairyTrick') return this.playThief();
    if (ab === 'sanctuary') return this.playShield();
    if (ab === 'masterSolution') return this.playBoss();
    if (ab === 'cookieCrunch') return this.playJester();
    if (ab === 'teyaScribbl') return this.playMagicChime();
    if (ab === 'ayleenObserver') return this.playThief();
    if (ab === 'turboDash') return this.playSkip();
    if (ab === 'fireworkBlast') return this.playBurn();

    // Effekte aus BASIC_SPECIALS & CHARACTERS
    const eff = card.effects?.[0]?.type;
    if (eff === 'burn') return this.playBurn();
    if (eff === 'reset') return this.playReset();
    if (eff === 'swap') return this.playSwap();
    if (eff === 'reverse') return this.playReverse();
    if (eff === 'skip') return this.playSkip();
    if (eff === 'boss') return this.playBoss();
    if (eff === 'takePile') return this.playTake();

    // Standard-Spezialkarten-Sound: Magischer Klang
    this.playMagicChime();
  }

  // 🛡️ Aegis: Kristalline Äther-Barriere
  playShield() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [587.33, 880.00, 1174.66, 1760.00].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);
      gain.gain.setValueAtTime(0.25 - idx * 0.04, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.03);
      osc.stop(now + 0.6);
    });
  }

  // 🕳️ Schwarzes Loch: Tiefes kosmisches Grollen & Gravitationsstrudel
  playBlackHole() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.7);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.7);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.75);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.75);
  }

  // ⏳ Chronos-Siegel: Zeitstopp & Uhrtick
  playTimestop() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Tick 1
    const t1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    t1.type = 'square';
    t1.frequency.setValueAtTime(1400, now);
    g1.gain.setValueAtTime(0.2, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    t1.connect(g1); g1.connect(this.sfxGain);
    t1.start(now); t1.stop(now + 0.04);

    // Freeze Sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(950, now + 0.35);
    gain.gain.setValueAtTime(0.3, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now + 0.08); osc.stop(now + 0.5);
  }

  // 🥷 Meisterdieb: Leises Huschen & Münzklirren
  playThief() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [1200, 1800].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.18, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.2);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + idx * 0.06); osc.stop(now + idx * 0.06 + 0.2);
    });
  }

  // ⚡ Göttlicher Blitz & Gott: Donnerhall & himmlischer Akkord
  playThunder() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Rausch-Donner
    const bufferSize = this.ctx.sampleRate * 0.45;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.45);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);

    // Göttlicher Ton
    const osc = this.ctx.createOscillator();
    const gOsc = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.15);
    gOsc.gain.setValueAtTime(0.3, now);
    gOsc.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gOsc); gOsc.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.4);
  }

  // 🪶 Phönix-Asche: Aufsteigende Flammenharmonien
  playPhoenix() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [261.63, 329.63, 392.00, 523.25, 659.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 0.8, now + idx * 0.05);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + idx * 0.05 + 0.3);
      gain.gain.setValueAtTime(0.2, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + idx * 0.05); osc.stop(now + 0.7);
    });
  }

  // 🌌 Dimensionsportal: Raumzeit-Warp
  playPortal() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.55);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.6);
  }

  // ♾️ Ouroboros / Zeitschleife
  playTimeloop() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.15);
    osc.frequency.linearRampToValueAtTime(400, now + 0.3);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.4);
  }

  // 🌋 Tektonischer Schock / Erdbeben
  playEarthquake() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.5);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.55);
  }

  // 🥔 Heiße Kartoffel: Brutzeln & Hüpfen
  playPotato() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [400, 300, 500, 250].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.25, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.08);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + idx * 0.05); osc.stop(now + idx * 0.05 + 0.08);
    });
  }

  // 🪞 Prismatischer Spiegel
  playMirror() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [880, 1320, 1760].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.2, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.25);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + idx * 0.04); osc.stop(now + idx * 0.04 + 0.25);
    });
  }

  // ♊ Zwillings-Parade: Zweiklang (Quinte)
  playTwins() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 783.99].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now); osc.stop(now + 0.35);
    });
  }

  // ⛓️ Kettenfluch & Farb-Überladung: metallisch rasselnde Ketten + Gong
  playChainCurse() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    [220, 330, 440, 587].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + i * 0.04 + 0.18);

      gain.gain.setValueAtTime(0.001, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.04 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.22);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.22);
    });

    const bass = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bass.type = 'sawtooth';
    bass.frequency.setValueAtTime(110, now);
    bass.frequency.exponentialRampToValueAtTime(45, now + 0.45);

    bassGain.gain.setValueAtTime(0.2, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    bass.connect(bassGain);
    bassGain.connect(this.sfxGain);
    bass.start(now);
    bass.stop(now + 0.45);
  }

  // 😆/😢 Schelm
  playJester() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.3);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.35);
  }

  // 🔥 Feuer / Burn: Verbrennen des Stapels
  playBurn() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.3);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  // 🔄 Reset: Zeitliches Zurückspulen
  playReset() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.25);
  }

  // 🃏 Hand tauschen (Swap)
  playSwap() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 0.05, 0.1].forEach((delay) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, now + delay);
      osc.frequency.exponentialRampToValueAtTime(200, now + delay + 0.06);
      gain.gain.setValueAtTime(0.2, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + delay); osc.stop(now + delay + 0.06);
    });
  }

  // 🔁 Wende (Reverse)
  playReverse() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.linearRampToValueAtTime(700, now + 0.1);
    osc.frequency.linearRampToValueAtTime(300, now + 0.2);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.25);
  }

  // ⏭️ Aussetzen (Skip)
  playSkip() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.15);
  }

  // 👑 Boss (16)
  playBoss() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [261.63, 329.63, 392.00, 523.25].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now); osc.stop(now + 0.5);
    });
  }

  // 🗑️ Stapel kassieren (Dump / Schmerzhafter Plumps)
  playTake() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.38);
  }

  // 🔔 Du bist dran! (Angenehmer Glockenton)
  playTurn() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.3, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + idx * 0.1); osc.stop(now + idx * 0.1 + 0.4);
    });
  }

  // 🎰 Rad / Kistenstreifen Ticken
  playWheelTick() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.025);
  }

  // 🏆 Sieg / Spielende Fanfare
  playWin() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [392.00, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.28, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + idx * 0.12); osc.stop(now + idx * 0.12 + 0.6);
    });
  }

  // Standard Magie-Gong
  playMagicChime() {
    if (!this.sfxEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 660, 880].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.2, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.3);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now + idx * 0.04); osc.stop(now + idx * 0.04 + 0.3);
    });
  }
}

export const sound = new SoundEngine();
