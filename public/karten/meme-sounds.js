// Kurze, lokal ausgelieferte Meme-Clips. Quellen und Dateidaten: sounds/memes/manifest.json.
export const MEME_SOUNDS = [
  { id: 'bruh', name: 'Bruh', emoji: '🗿', use: 'Wenn jemand den Stapel kassiert' },
  { id: 'vine-boom', name: 'Vine Boom', emoji: '💥', use: 'Bomben, Spiegel und dramatische Spezialkarten' },
  { id: 'yippee', name: 'Yippee', emoji: '🥳', use: 'Dein Sieg oder eine Schelm-Combo' },
  { id: 'six-seven', name: 'Six Seven', emoji: '🤲', use: 'Wenn auf eine 6 eine 7 gelegt wird' },
  { id: 'spongebob-fail', name: 'SpongeBob Fail', emoji: '🧽', use: 'Großer Stapel oder verlorene Runde' },
  { id: 'metal-pipe', name: 'Metal Pipe', emoji: '🔧', use: 'Schwarzes Loch, Erdbeben und Feuerwerk' },
  { id: 'fah', name: 'FAHHH', emoji: '😩', use: 'Die heiße Kartoffel wandert weiter' },
].map((s) => ({ ...s, file: `/karten/sounds/memes/${s.id}.mp3` }));

// Nur bestätigte Zustandswechsel, keine Klicks und keine Wiederholung beim Reconnect.
export class MemeEvents {
  constructor() { this.previous = null; }
  observe(v, me) {
    const previous = this.previous;
    this.previous = { state: v.state, game: v.game, top: v.top, action: actionId(v) };
    if (!previous || previous.game !== v.game) return null;
    if (previous.state === 'playing' && v.state === 'over') {
      return v.winner === me ? 'yippee' : 'spongebob-fail';
    }
    if (v.state !== 'playing' || !v.lastAction || previous.action === actionId(v)) return null;
    const { text = '', icon } = v.lastAction;
    if (['😬', '🤪', '🪓'].includes(icon)) {
      const count = Number(/\((\d+) Karten\)/.exec(text)?.[1] ?? 0);
      return count >= 8 ? 'spongebob-fail' : 'bruh';
    }
    if (icon === '🥔') return 'fah';
    if (icon === '🎭') return 'yippee';
    if (previous.top === 6 && v.top === 7 && / legt (?:\d+× )?7(?:\D|$)/.test(text)) return 'six-seven';
    if (/ legt |: Resonanz /.test(text)) return null;
    if (['🌋', '🎆', '🕳️'].includes(icon) || /Schwarzes Loch|Tektonischer Schock|Pyrotechnik|Feuerwerk/.test(text)) return 'metal-pipe';
    if (['💣', '🪞', '⚡', '🔥', '🔁', '🕳️'].includes(icon)) return 'vine-boom';
    return null;
  }
}
const actionId = (v) => v.lastAction ? JSON.stringify([v.lastAction.time, v.lastAction.text]) : null;
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

export class MemePlayer {
  constructor(sfxEnabled = () => true) {
    this.enabled = read('karten-memes') !== 'false';
    const saved = Number(read('karten-meme-volume') ?? 0.65);
    this.volume = Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.65;
    this.sfxEnabled = sfxEnabled;
    this.buffers = new Map();
    this.source = null;
    this.request = 0;
    this.lastPlayed = -Infinity;
    this.speaking = false;
  }
  attach(ctx, output) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(output);
  }
  setEnabled(enabled) {
    this.enabled = !!enabled;
    write('karten-memes', this.enabled);
    if (!this.enabled) this.stop();
  }
  setVolume(volume) {
    if (!Number.isFinite(Number(volume))) return;
    this.volume = Math.max(0, Math.min(1, Number(volume)));
    write('karten-meme-volume', this.volume);
    this.setSpeaking(this.speaking);
    if (!this.volume) this.stop();
  }
  setSpeaking(speaking) {
    this.speaking = !!speaking;
    // Karten-Erklärungen bleiben im Vordergrund.
    if (this.ctx) this.gain.gain.setTargetAtTime(this.volume * (speaking ? 0.12 : 1), this.ctx.currentTime, 0.04);
  }
  load(id) {
    const clip = MEME_SOUNDS.find((s) => s.id === id);
    if (!clip || !this.ctx) return Promise.resolve(null);
    if (!this.buffers.has(id)) {
      this.buffers.set(id, fetch(clip.file).then((r) => {
        if (!r.ok) throw Error('Meme-Clip nicht erreichbar');
        return r.arrayBuffer();
      }).then((data) => this.ctx.decodeAudioData(data)).catch(() => {
        this.buffers.delete(id); return null; // Synth-SFX laufen auch bei fehlendem Clip weiter.
      }));
    }
    return this.buffers.get(id);
  }
  preload() {
    if (this.preloaded || !this.enabled || !this.sfxEnabled()) return;
    this.preloaded = true;
    for (const s of MEME_SOUNDS) void this.load(s.id);
  }
  stop() {
    this.request++;
    if (this.source) { try { this.source.stop(); } catch {} this.source = null; }
    this.onPlay?.(null);
  }
  async play(id, { preview = false, priority = false } = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.enabled || !this.sfxEnabled()
        || !this.volume || (typeof document !== 'undefined' && document.hidden)) return false;
    if (!MEME_SOUNDS.some((s) => s.id === id)) return false;
    const now = performance.now();
    if (!preview && !priority && now - this.lastPlayed < 2500) return false;
    const request = ++this.request;
    this.lastPlayed = now;
    const buffer = await this.load(id);
    if (!buffer || request !== this.request || !this.enabled || !this.sfxEnabled()
        || !this.volume || (typeof document !== 'undefined' && document.hidden)) return false;
    if (this.source) { try { this.source.stop(); } catch {} }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    this.source = source;
    source.onended = () => {
      if (this.source === source) { this.source = null; this.onPlay?.(null); }
      source.disconnect();
    };
    source.start();
    this.onPlay?.(id);
    source.stop(this.ctx.currentTime + Math.min(buffer.duration, 3.5));
    return true;
  }
}
