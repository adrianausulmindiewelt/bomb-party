// „TOPP DAS!“ im Browser: Lobby, Bomben-Karten-Baukasten, Tisch.

import { CARD_BRAND, EFFECTS, TARGETS, MAX_EFFECTS_PER_CARD, ROLES, CHARACTERS, BASIC_SPECIALS, PLAYER_CARDS, JESTER_COMBO, RULES, describe, cardText, validateEffects, COLOR_ELEMENTS, DEFAULT_DECK, DEFAULT_DECK_PLUS, SPECIAL_GROUPS, specialCatalog } from '/shared/cards.js';
import { fileToAvatar } from '/js/avatar.js';
import { cardEl } from './card-ui.js';
import { connect, SERVER } from '/js/net.js';
import { sound } from './audio.js';
import { MEME_SOUNDS, MemeEvents } from './meme-sounds.js';
const memeEvents = new MemeEvents();
import { loadDeckPreset, saveDeckPreset } from './deck-preset.js';
import { getBotAvatar } from './bot-avatar.js';

const $ = (id) => document.getElementById(id);
let saved = {};
try { saved = JSON.parse(localStorage.getItem('karten-profile') || '{}') || {}; } catch { saved = {}; }

// ── Steuerleiste (BGM, SFX, Vibration, Vollbild, Almanach) ──
const btnBgm = $('toggle-bgm');
const btnSfx = $('toggle-sfx');
const btnVib = $('toggle-vib');
const btnFs = $('toggle-fullscreen');
const btnAlmanach = $('open-almanach');
const modalAlmanach = $('almanach-modal');
const closeAlmanach = $('almanach-close');
const almanachContent = $('almanach-content');

function updateAudioUI() {
  if (btnBgm) {
    btnBgm.classList.toggle('muted', !sound.bgmEnabled);
    btnBgm.textContent = sound.bgmEnabled ? '🎵' : '🔇';
  }
  if (btnSfx) {
    btnSfx.classList.toggle('muted', !sound.sfxEnabled);
    btnSfx.textContent = sound.sfxEnabled ? '🔊' : '🔈';
  }
}
if (btnBgm) btnBgm.onclick = () => { sound.toggleBGM(); updateAudioUI(); };
if (btnSfx) btnSfx.onclick = () => { sound.toggleSFX(); if (!sound.sfxEnabled) stopVoice(); updateAudioUI(); updateMemeUI(); };
updateAudioUI();


// ── Meme-Soundboard: Vorschau und Download direkt im Spiel ──
const memeModal = $('meme-modal');
function updateMemeUI() {
  $('meme-enabled').checked = sound.memes.enabled;
  $('meme-volume').value = Math.round(sound.memes.volume * 100);
  $('meme-volume-value').textContent = `${Math.round(sound.memes.volume * 100)} %`;
  $('meme-muted-note').hidden = sound.sfxEnabled && sound.memes.enabled && sound.memes.volume > 0;
  $('open-memes').classList.toggle('muted', !sound.memes.enabled);
  document.querySelectorAll('[data-meme-preview]').forEach((b) => {
    b.disabled = !sound.sfxEnabled || !sound.memes.enabled || !sound.memes.volume;
  });
}
$('meme-list').innerHTML = MEME_SOUNDS.map((s) => `
  <article class="funke-card meme-clip">
    <div><b>${s.emoji} ${s.name}</b><p>${s.use}</p></div>
    <div class="funke-row">
      <button class="funke-btn funke-btn--ghost funke-btn--sm" type="button" data-meme-preview="${s.id}" aria-label="${s.name} anhören" aria-pressed="false">▶ Anhören</button>
      <a class="funke-btn funke-btn--ghost funke-btn--sm" href="${s.file}" download="${s.id}.mp3">↓ MP3</a>
    </div>
  </article>`).join('');
$('open-memes').onclick = () => { memeModal.hidden = false; updateMemeUI(); $('meme-close').focus(); };
function closeMemes() { memeModal.hidden = true; sound.memes.stop(); $('open-memes').focus(); }
$('meme-close').onclick = closeMemes;
memeModal.onclick = (e) => { if (e.target === memeModal) closeMemes(); };
$('meme-unmute').onclick = () => {
  if (!sound.sfxEnabled) sound.toggleSFX();
  sound.memes.setEnabled(true);
  if (!sound.memes.volume) sound.memes.setVolume(0.65);
  updateAudioUI(); updateMemeUI();
};
$('meme-enabled').onchange = (e) => { sound.memes.setEnabled(e.target.checked); updateMemeUI(); };
$('meme-volume').oninput = (e) => { sound.memes.setVolume(Number(e.target.value) / 100); updateMemeUI(); };
let memePlayingId = null;
sound.memes.onPlay = (id) => {
  memePlayingId = id;
  for (const b of document.querySelectorAll('[data-meme-preview]')) {
    const playing = b.dataset.memePreview === id;
    b.textContent = playing ? '■ Stoppen' : '▶ Anhören';
    b.setAttribute('aria-pressed', String(playing));
  }
  $('meme-playback-note').textContent = id ? `${MEME_SOUNDS.find((s) => s.id === id)?.name} läuft …` : '';
};
$('meme-list').onclick = async (e) => {
  const b = e.target.closest('[data-meme-preview]');
  if (!b) return;
  if (memePlayingId === b.dataset.memePreview) return sound.memes.stop();
  sound.unlock();
  try { await sound.ctx?.resume(); } catch {}
  $('meme-playback-note').textContent = 'Sound lädt …';
  if (!await sound.memes.play(b.dataset.memePreview, { preview: true })) {
    $('meme-playback-note').textContent = 'Der Sound konnte gerade nicht gestartet werden. Bitte noch einmal versuchen.';
  }
};
memeModal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeMemes(); }
  if (e.key !== 'Tab') return;
  const items = [...memeModal.querySelectorAll('button:not(:disabled),input,a[href]')];
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ── Vibration / Haptik ────────────────────────────────────
let vibEnabled = localStorage.getItem('karten-vib') !== 'false';
function updateVibUI() {
  if (btnVib) {
    btnVib.classList.toggle('muted', !vibEnabled);
    btnVib.textContent = vibEnabled ? '📳' : '📴';
  }
}
export function vibrate(pattern) {
  if (vibEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}
if (btnVib) {
  btnVib.onclick = () => {
    vibEnabled = !vibEnabled;
    localStorage.setItem('karten-vib', vibEnabled);
    updateVibUI();
    if (vibEnabled) vibrate(40);
  };
  updateVibUI();
}

// ── Vollbildmodus ─────────────────────────────────────────
function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}
function updateFsUI() {
  if (btnFs) btnFs.textContent = isFullscreen() ? '🗗' : '⛶';
}
function toggleFullscreen() {
  if (!isFullscreen()) {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}
if (btnFs) btnFs.onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', updateFsUI);
document.addEventListener('webkitfullscreenchange', updateFsUI);
updateFsUI();

// ── Club-Almanach & Galerie ───────────────────────────────
let activeTab = 'active';
let currentAlmanachItems = [];
function renderAlmanachTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.almanach-tabs .tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (!almanachContent) return;
  almanachContent.innerHTML = '';

  let items = [];
  if (tab === 'active') {
    // Nur was in diesem Spiel wirklich drin ist – kurz erklärt
    const choice = view?.deckChoice ?? DEFAULT_DECK;
    items = [
      ...(view?.customCards ?? []).map((c) => ({
        emoji: '💣', art: c.art || arts[c.owner]?.art || null, name: c.name,
        title: 'Selbstgebaute Bombe', by: `von ${c.by}`, text: c.text || describe(c.effects ?? []),
        categoryGlyph: '🎨', categoryTitle: 'Spieler-Karte',
        card: { kind: 'special', key: 'custom', name: c.name, title: 'Selbstgebaute Bombe', emoji: c.emoji || '💣', art: c.art || arts[c.owner]?.art || null, fullArt: !!(c.art || arts[c.owner]?.art), effects: c.effects, owner: c.owner, by: c.by, text: c.text },
      })),
      ...specialCatalog().filter((c) => choice.specials.includes(c.key)).map((c) => {
        const isPassive = ['aegis', 'mirror', 'phoenix', 'luckyJester'].includes(c.ability);
        const isBasic = !!BASIC_SPECIALS?.[c.key];
        const isChar = c.group === 'charaktere';
        const glyph = isChar ? '🎭' : isPassive ? '🛡️' : isBasic ? '⚡' : '✨';
        const catTitle = isChar ? 'Charakterkarte' : isPassive ? 'Passiver Schutz' : isBasic ? 'Aktionskarte' : 'Spezialkarte';
        const fullCard = SPECIAL_GROUPS.find((g) => g.key === c.group)?.cards[c.key] || c;
        return {
          emoji: c.emoji || '✨', name: c.name,
          title: SPECIAL_GROUPS.find((g) => g.key === c.group)?.name ?? 'Spezialkarte', by: '', text: c.short,
          categoryGlyph: glyph, categoryTitle: catTitle,
          card: { ...fullCard, key: c.key, kind: 'special' },
        };
      }),
      ...choice.roles.filter((k) => ROLES[k]).map((k) => ({
        emoji: ROLES[k].emoji, name: ROLES[k].name, title: 'Geheime Rolle', by: '', text: ROLES[k].short ?? ROLES[k].text,
        categoryGlyph: '👑', categoryTitle: 'Geheime Rolle', isRole: true,
      })),
    ];
  } else if (tab === 'club') {
    const liveCustom = (view?.customCards ?? []).map((c) => ({
      emoji: c.emoji || '💣',
      art: c.art || arts[c.owner]?.art || null,
      name: c.name,
      title: 'Selbstgebaute Bombe (Live am Tisch)',
      by: `Erschaffen von: ${c.by}`,
      text: c.text || describe(c.effects ?? []),
      categoryGlyph: '🎨', categoryTitle: 'Spieler-Karte',
      card: { kind: 'special', key: 'custom', name: c.name, title: 'Selbstgebaute Bombe', emoji: c.emoji || '💣', art: c.art || arts[c.owner]?.art || null, fullArt: !!(c.art || arts[c.owner]?.art), effects: c.effects, owner: c.owner, by: c.by, text: c.text },
    }));
    items = [
      ...liveCustom,
      ...Object.entries(PLAYER_CARDS).map(([k, c]) => {
        const isPassive = ['aegis', 'mirror', 'phoenix', 'luckyJester'].includes(c.ability);
        return {
          emoji: c.emoji || '✨',
          art: c.art || null,
          name: c.name,
          title: c.title || 'Spezialkarte',
          by: c.by ? `Urheber: ${c.by}` : '',
          text: c.text,
          categoryGlyph: isPassive ? '🛡️' : '✨',
          categoryTitle: isPassive ? 'Passiver Schutz' : 'Spezialkarte',
          card: { ...c, key: k, kind: 'special' },
        };
      }),
    ];
  } else if (tab === 'characters') {
    items = Object.entries(CHARACTERS).map(([k, ch]) => ({
      emoji: ch.emoji || '🎭',
      art: ch.art || null,
      name: ch.character || ch.name,
      title: ch.title || (ch.character ? ch.name : 'Charakter'),
      by: ch.by ? `Club-Mitglied: ${ch.by}` : 'Club-Mitglied',
      text: describe(ch.effects ?? []),
      categoryGlyph: '🎭', categoryTitle: 'Charakterkarte',
      card: { ...ch, key: k, kind: 'special' },
    }));
  } else if (tab === 'specials') {
    items = Object.entries(BASIC_SPECIALS).map(([k, s]) => ({
      emoji: s.emoji || '💣',
      art: s.art || null,
      name: s.name,
      title: 'Standard-Special',
      by: 'Grundspiel',
      text: describe(s.effects ?? []),
      categoryGlyph: '⚡', categoryTitle: 'Aktionskarte',
      card: { ...s, key: k, kind: 'special' },
    }));
  } else if (tab === 'custom') {
    const list = view?.customCards ?? [];
    if (!list.length) {
      almanachContent.innerHTML = `
        <div class="almanach-empty">
          <div style="font-size: 2.8rem; margin-bottom: 10px;">🎨</div>
          <div style="font-size: 1.05rem; font-weight: 700; color: #fff; margin-bottom: 6px;">Noch keine selbstgebauten Karten am Tisch</div>
          <p style="font-size: 0.85rem; margin: 0; line-height: 1.4;">Hake in der Lobby bei Schritt 2 <b>„Eigene Bombe zeichnen & bauen“</b> an, um spontan deine eigene Karte mit individuellem Namen, Artwork & Effekten zu erschaffen!</p>
        </div>
      `;
      return;
    }
    items = list.map((c) => ({
      emoji: c.emoji || '💣',
      art: c.art || arts[c.owner]?.art || null,
      name: c.name,
      title: 'Selbstgebaute Bombe',
      by: `Erschaffen von: ${c.by}`,
      text: c.text || describe(c.effects ?? []),
      categoryGlyph: '🎨',
      categoryTitle: 'Spieler-Karte',
      card: { kind: 'special', key: 'custom', name: c.name, title: 'Selbstgebaute Bombe', emoji: c.emoji || '💣', art: c.art || arts[c.owner]?.art || null, fullArt: !!(c.art || arts[c.owner]?.art), effects: c.effects, owner: c.owner, by: c.by, text: c.text },
    }));
  } else if (tab === 'roles') {
    items = Object.entries(ROLES).map(([k, r]) => ({
      emoji: r.emoji || '👑',
      name: r.name,
      title: r.cards === 0 ? 'Standard-Hand (10 Karten)' : `${r.cards > 0 ? '+' : ''}${r.cards} Handkarten zum Start (${10 + r.cards} Karten)`,
      by: 'Geheime Rolle',
      text: r.text,
      categoryGlyph: '👑',
      categoryTitle: 'Geheime Rolle',
      isRole: true,
    }));
  } else if (tab === 'elements') {
    items = [
      {
        emoji: '🎵',
        name: 'Farb-Resonanz',
        title: 'Toleranz-Vorteil (Gleiche Farbe)',
        by: 'Passive Grundmechanik',
        categoryGlyph: '💎',
        categoryTitle: 'Farbsynergie',
        text: 'Legst du eine Zahlenkarte derselben Farbe auf die oberste Tischkarte, darfst du den geforderten Wert um bis zu 2 Punkte UNTERBIETEN (z. B. eine blaue 8 auf eine blaue 10)! Bei aktiver „Unter“-Karte darfst du um bis zu 2 Punkte überbieten. Karten mit aktivem Resonanz-Bonus leuchten in deiner Hand magisch auf.',
        card: { kind: 'number', value: 8, color: '#3dc6ff' },
      },
      {
        emoji: '👯',
        name: 'Kombi-Ablage (Paare)',
        title: 'Doppelschlag (Gleicher Zahlenwert)',
        by: 'Reguläre Spielmechanik',
        categoryGlyph: '💎',
        categoryTitle: 'Kombi-Ablage',
        text: 'Besitzt du zwei Karten mit demselben Zahlenwert (z. B. zwei 7er oder zwei 9er beliebiger Farbe), darfst du beide zusammen in einem einzigen Zug ablegen! Deine Hand verkleinert sich blitzschnell um 2 Karten auf einmal.',
        card: { kind: 'number', value: 7, color: '#ffd23d' },
      },
      {
        emoji: '⛓️⚡',
        name: 'Farb-Überladung',
        title: 'Elementar-Kette (3× gleiche Farbe)',
        by: 'Kettenreaktion am Tisch',
        categoryGlyph: '💎',
        categoryTitle: 'Elementar-Kette',
        text: 'Werden 3× hintereinander Karten derselben Farbe gelegt (auch über mehrere Personen hinweg), entlädt sich das Spielfeld! Die nächste Person am Tisch muss sofort 1 Strafkarte vom Ziehstapel ziehen. Götter werfen diesen Blitz karmisch auf den Verursacher zurück.',
        card: { kind: 'number', value: 9, color: '#ff3d7f' },
      },
      {
        emoji: '🔥',
        name: 'Rubin-Feuer',
        title: 'Element des Feuers (Rubin)',
        by: 'Rubin-Edelstein',
        categoryGlyph: '💎',
        categoryTitle: 'Element',
        text: 'Feurige Spielfreude. Kann für Farb-Resonanzen und feurige Überladungsketten genutzt werden.',
        card: { kind: 'number', value: 8, color: '#ff3d7f' },
      },
      {
        emoji: '❄️',
        name: 'Saphir-Eis',
        title: 'Element des Eises (Saphir)',
        by: 'Saphir-Edelstein',
        categoryGlyph: '💎',
        categoryTitle: 'Element',
        text: 'Eiskalte Berechnung. Resonanzfähig mit allen blauen Saphir-Karten.',
        card: { kind: 'number', value: 10, color: '#3dc6ff' },
      },
      {
        emoji: '⚡',
        name: 'Topas-Blitz',
        title: 'Element des Blitzes (Topas)',
        by: 'Topas-Edelstein',
        categoryGlyph: '💎',
        categoryTitle: 'Element',
        text: 'Geladene Dynamik. Resonanzfähig mit allen gelben Topas-Karten.',
        card: { kind: 'number', value: 7, color: '#ffd23d' },
      },
      {
        emoji: '🌿',
        name: 'Smaragd-Natur',
        title: 'Element der Natur (Smaragd)',
        by: 'Smaragd-Edelstein',
        categoryGlyph: '💎',
        categoryTitle: 'Element',
        text: 'Wachsende Stärke. Resonanzfähig mit allen grünen Smaragd-Karten.',
        card: { kind: 'number', value: 12, color: '#5cff8a' },
      },
    ];
  }

  currentAlmanachItems = items;
  almanachContent.innerHTML = items.map((it, idx) => {
    const canExpand = !!it.card && !it.isRole;
    return `
    <div class="almanach-card ${canExpand ? 'can-expand' : 'no-expand'}" data-idx="${idx}" ${canExpand ? 'title="Klicken: Karte in voller Spielgröße ansehen"' : ''}>
      ${it.categoryGlyph ? `<div class="almanach-corner-badge" title="${it.categoryTitle || ''}">${it.categoryGlyph}</div>` : ''}
      <div class="almanach-card-top">
        <div class="almanach-emoji" ${it.art ? `style="background-image: url('${it.art}'); background-size: cover; background-position: center; border-radius: 8px; width: 44px; height: 44px;"` : ''}>${it.art ? '' : it.emoji}</div>
        <div class="almanach-meta">
          <div class="almanach-name">${it.name}</div>
          <div class="almanach-title">${it.title}</div>
          ${it.by ? `<div class="almanach-by">${it.by}</div>` : ''}
        </div>
      </div>
      <div class="almanach-text">${it.text || ''}</div>
      ${canExpand ? `
      <div class="almanach-expand-bar">
        <span class="expand-label">🃏 Spielkarte in Originalgröße</span>
        <span class="expand-chevron">▼</span>
      </div>
      <div class="almanach-foldout" hidden>
        <div class="almanach-card-stage"></div>
      </div>
      ` : ''}
    </div>
  `;
  }).join('');
}

if (almanachContent) {
  almanachContent.addEventListener('click', (e) => {
    // Wenn jemand direkt auf die bereits ausgeklappte Spielkarte klickt, nicht zuklappen
    if (e.target.closest('.almanach-card-stage')) return;

    const cardBox = e.target.closest('.almanach-card');
    if (!cardBox) return;

    const foldout = cardBox.querySelector('.almanach-foldout');
    if (!foldout) return;

    const idx = parseInt(cardBox.dataset.idx, 10);
    const it = currentAlmanachItems?.[idx];
    if (!it || !it.card) return;

    const isOpening = foldout.hidden;
    foldout.hidden = !isOpening;
    cardBox.classList.toggle('is-expanded', isOpening);

    if (isOpening) {
      const stage = foldout.querySelector('.almanach-card-stage');
      if (stage && !stage.children.length) {
        const liveCard = cardEl(it.card, arts);
        stage.append(liveCard);
      }
    }
  });
}

if (btnAlmanach && modalAlmanach) {
  btnAlmanach.onclick = () => {
    modalAlmanach.hidden = false;
    renderAlmanachTab(activeTab);
  };
  if (closeAlmanach) closeAlmanach.onclick = () => { modalAlmanach.hidden = true; };
  modalAlmanach.onclick = (e) => {
    if (e.target === modalAlmanach) modalAlmanach.hidden = true;
  };
  document.querySelectorAll('.almanach-tabs .tab-btn').forEach((b) => {
    b.onclick = () => renderAlmanachTab(b.dataset.tab);
  });
}

// ── Branding ─────────────────────────────────────────────
document.title = CARD_BRAND.title;
$('title').textContent = CARD_BRAND.title;
$('tagline').textContent = CARD_BRAND.tagline;
// Musik direkt beim Öffnen versuchen (klappt sonst beim ersten Tippen)
sound.unlock();

let legacyProfile = {};
try { legacyProfile = JSON.parse(localStorage.getItem('profile') || '{}') || {}; } catch { legacyProfile = {}; }
let avatar = saved.avatar || legacyProfile.avatar || null;
$('name').value = saved.name || legacyProfile.name || '';
$('room').value = new URLSearchParams(location.search).get('raum') || '';
function showAvatar() {
  const ctx = $('avatar-preview').getContext('2d');
  ctx.fillStyle = '#3a3760'; ctx.fillRect(0, 0, 160, 160);
  if (!avatar) { ctx.font = '64px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🙂', 80, 84); return; }
  const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, 160, 160); img.src = avatar;
}
showAvatar();
$('avatar-input').onchange = async (e) => { if (e.target.files[0]) { avatar = await fileToAvatar(e.target.files[0]); showAvatar(); } };

// ── 2 · Zeichenfläche ────────────────────────────────────
const draw = $('draw');
const dctx = draw.getContext('2d');
let pen = '#111';
let drawn = false;
function clearDraw() { dctx.fillStyle = '#fff'; dctx.fillRect(0, 0, 300, 300); drawn = false; }
clearDraw();
if (saved.art) { const i = new Image(); i.onload = () => { dctx.drawImage(i, 0, 0, 300, 300); drawn = true; updateSteps(); }; i.src = saved.art; }
for (const c of ['#111', '#ff3d7f', '#3dc6ff', '#ffd23d', '#5cff8a', '#b47cff', '#ff8a3d', '#fff']) {
  const b = document.createElement('button');
  b.type = 'button'; b.style.background = c;
  b.onclick = () => { pen = c; document.querySelectorAll('#pens button').forEach((x) => x.classList.toggle('active', x === b)); };
  if (c === pen) b.classList.add('active');
  $('pens').append(b);
}
let last = null;
const pos = (e) => { const r = draw.getBoundingClientRect(); return [(e.clientX - r.left) * 300 / r.width, (e.clientY - r.top) * 300 / r.height]; };
draw.addEventListener('pointerdown', (e) => { draw.setPointerCapture(e.pointerId); last = pos(e); stroke(last); });
draw.addEventListener('pointermove', (e) => { if (last) stroke(pos(e)); });
draw.addEventListener('pointerup', () => { last = null; updateSteps(); });
function stroke(p) {
  dctx.strokeStyle = pen; dctx.lineWidth = pen === '#fff' ? 24 : 8; dctx.lineCap = 'round';
  dctx.beginPath(); dctx.moveTo(...last); dctx.lineTo(...p); dctx.stroke();
  last = p; drawn = true;
}
$('draw-clear').onclick = () => { clearDraw(); updateSteps(); };
$('draw-upload').onchange = async (e) => {
  if (!e.target.files[0]) return;
  const i = new Image();
  i.onload = () => { dctx.drawImage(i, 0, 0, 300, 300); drawn = true; updateSteps(); };
  i.src = await fileToAvatar(e.target.files[0]);
};

// ── 2 · Effekt-Baukasten ─────────────────────────────────
$('special-name').value = saved.specialName || '';
let effects = validateEffects(saved.effects) ?? [{ type: 'give', n: 2, target: 'next' }];

function renderEffects() {
  const box = $('effects');
  box.innerHTML = '';
  for (let i = 0; i < MAX_EFFECTS_PER_CARD; i++) {
    const e = effects[i];
    const row = document.createElement('div');
    row.className = 'fx-row';
    const type = select(
      [['', i === 0 ? '— Effekt wählen —' : '+ zweiter Effekt (optional)'], ...Object.entries(EFFECTS)
        .filter(([k]) => k === e?.type || !effects.some((x) => x.type === k)).map(([k, d]) => [k, d.label])],
      e?.type ?? '',
      (v) => {
        if (!v) effects.splice(i, 1);
        else {
          const d = EFFECTS[v];
          effects[i] = { type: v, ...(d.n && { n: d.n[0] }), ...(d.targets && { target: d.targets[0] }) };
        }
        renderEffects();
      });
    row.append(type);
    if (e && EFFECTS[e.type].n) {
      const [lo, hi] = EFFECTS[e.type].n;
      row.append(select(range(lo, hi).map((n) => [n, `${n}×`]), e.n, (v) => { e.n = Number(v); renderEffects(); }));
    }
    if (e && EFFECTS[e.type].targets) {
      row.append(select(EFFECTS[e.type].targets.map((t) => [t, TARGETS[t]]), e.target, (v) => { e.target = v; renderEffects(); }));
    }
    box.append(row);
    if (!e) break;
  }
  $('special-desc').textContent = effects.length ? '💣 ' + describe(effects) : 'Optional: Wähle Effekte oder spiele direkt ohne eigene Bombe mit.';
  updateSteps();
}

// Häkchen an den Schritten, sobald sie fertig sind
function updateSteps() {
  $('step-you').classList.toggle('done', Boolean($('name').value.trim()));
  draw.parentElement.classList.toggle('drawn', drawn);
  $('step-card').classList.toggle('done', drawn && Boolean($('special-name').value.trim()) && effects.length > 0);
}
$('name').addEventListener('input', updateSteps);
$('special-name').addEventListener('input', updateSteps);
renderEffects();

function select(options, value, onChange) {
  const s = document.createElement('select');
  for (const [v, t] of options) { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); }
  s.value = value;
  s.onchange = () => onChange(s.value);
  return s;
}
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

// ── 3 · Beitreten ────────────────────────────────────────
const socket = connect('/karten');
let me = null, view = null, arts = {};
let selected = new Set();
let focus = 0;

// Feste Spieler-ID: überlebt Neuladen, Sperrbildschirm und Funkloch
const pid = localStorage.getItem('karten-pid') || (crypto.randomUUID?.() ?? String(Math.random()).slice(2));
localStorage.setItem('karten-pid', pid);
let lastJoin = null;

function join(roomName) {
  const name = $('name').value.trim();
  if (!name) {
    $('error').textContent = '👆 Erst deinen Namen eingeben.';
    $('step-you').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('step-you').classList.remove('shake'); void $('step-you').offsetWidth; $('step-you').classList.add('shake');
    $('name').focus?.({ preventScroll: true });
    return;
  }
  $('error').textContent = '';
  const specialName = $('special-name').value.trim();
  // Eigene Bombe ist optional: Nur mitsenden, wenn vollständig gestaltet
  const hasCard = drawn && Boolean(specialName) && effects.length > 0;
  const art = hasCard ? draw.toDataURL('image/jpeg', 0.75) : null;
  const special = hasCard ? { name: specialName, art, effects } : null;
  localStorage.setItem('karten-profile', JSON.stringify({ name, avatar, art, specialName: hasCard ? specialName : '', effects: hasCard ? effects : [] }));
  lastJoin = { pid, name, avatar, room: roomName, deckChoice: loadDeckPreset(), special };
  socket.emit('join', lastJoin, (res) => {
    if (res.error) { $('error').textContent = res.error; return; }
    me = res.id;
    lastJoin.room = res.room;
    clearInterval(tablePoll);
    history.replaceState(null, '', `?raum=${res.room}`);
    $('lobby').hidden = true;
    $('bg').hidden = true;
    $('table').hidden = false;
    sound.unlock();
    if (sound.bgmEnabled) sound.startBGM();
    initControls();
  });
}
$('bot-add').onclick = () => act('bot-add', null);
$('bot-remove').onclick = () => {
  const bot = [...(view?.players ?? [])].reverse().find((p) => p.bot);
  if (bot) act('bot-remove', bot.id);
};
$('join').onclick = () => join($('room').value.trim() || `tisch-${Math.floor(Math.random() * 900 + 100)}`);

// Offene Tische anzeigen (alle 3 Sekunden aktualisiert)
async function loadTables() {
  try {
    const list = await (await fetch(SERVER + '/api/karten/tables')).json();
    const box = $('tables');
    box.innerHTML = '';
    if (!list.length) box.innerHTML = '<p class="hint">Noch kein Tisch offen – eröffne einen! 👇</p>';
    for (const t of list) {
      const full = t.players.length >= t.max;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbl' + (full ? ' full' : '');
      b.innerHTML = '<span class="ic"></span><span class="tx"><b></b><small></small></span><span class="go"></span>';
      b.querySelector('.ic').textContent = t.state === 'playing' ? '🔥' : '🃏';
      b.querySelector('b').textContent = `${t.id} · ${t.players.length}/${t.max}`;
      b.querySelector('small').textContent = (t.state === 'playing' ? 'läuft – du steigst nächste Runde ein · ' : 'wartet auf Start · ') + t.players.join(', ');
      b.querySelector('.go').textContent = full ? 'voll' : 'Beitreten';
      b.onclick = () => join(t.id);
      box.append(b);
    }
  } catch { $('tables').innerHTML = '<p class="hint">Server wacht gerade auf … ⏳</p>'; }
}
const tablePoll = setInterval(loadTables, 3000);
loadTables();
// Nach automatischem Neuladen (neue Version) direkt wieder an den Tisch
const autojoin = sessionStorage.getItem('karten-autojoin');
if (autojoin) { sessionStorage.removeItem('karten-autojoin'); setTimeout(() => join(autojoin), 400); }
// Direktlink ?raum=xyz → Feld vorausfüllen
if ($('room').value) $('join').textContent = `➡️ ${$('room').value} beitreten`;

socket.on('arts', (a) => { arts = a; if (view) render(); });
let lastSeenLog = null;
let lastSeenChainId = 0;
let chainTimeout = null;

// 🗣️ KI-Ansage: fertige MP3 aus /karten/voice/, sonst spricht der Browser selbst
let voiceAudio = null;
function stopVoice() {
  sound.memes.setSpeaking(false);
  if (voiceAudio) { voiceAudio.pause(); voiceAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (sound.bgmGain && sound.ctx) sound.bgmGain.gain.setTargetAtTime(sound.bgmEnabled ? 0.35 : 0, sound.ctx.currentTime, 0.2);
}
function hideChainBanner() {
  const banner = $('chain-banner');
  banner.classList.remove('show');
  setTimeout(() => { if (!banner.classList.contains('show')) banner.hidden = true; }, 350);
}
function speak(voice, done) {
  stopVoice();
  if (!sound.sfxEnabled) return done(3000);          // Sound aus → nur lesen
  sound.memes.setSpeaking(true);
  if (sound.bgmGain && sound.ctx) sound.bgmGain.gain.setTargetAtTime(sound.bgmEnabled ? 0.08 : 0, sound.ctx.currentTime, 0.1);
  const finish = () => { stopVoice(); done(600); };
  const browserVoice = () => {
    if (!('speechSynthesis' in window)) return done(4000);
    const u = new SpeechSynthesisUtterance(voice.line);
    u.lang = 'de-DE'; u.rate = 1.1; u.pitch = 1.1;
    u.onend = finish; u.onerror = finish;
    speechSynthesis.speak(u);
  };
  if (!voice.key) return browserVoice();
  const a = new Audio(`/karten/voice/${voice.key}.mp3`);
  voiceAudio = a;
  a.onended = finish;
  a.onerror = () => { if (voiceAudio === a) browserVoice(); };
  a.play().catch(() => { if (voiceAudio === a) { voiceAudio = null; done(4500); } });
}

function showChainBanner(evt) {
  if (!evt) return;
  if (evt.id === lastSeenChainId) {
    // Gleiche Ansage, aber jetzt übersprungen → bei allen sofort aufhören
    if (evt.voice?.skipped && !$('chain-banner').hidden) { stopVoice(); clearTimeout(chainTimeout); hideChainBanner(); }
    return;
  }
  lastSeenChainId = evt.id;
  stopVoice();
  const banner = $('chain-banner');
  if (!banner) return;

  const iconEl = $('chain-icon');
  const actorEl = $('chain-actor');
  const titleEl = $('chain-title');
  const descEl = $('chain-desc');

  if (iconEl) iconEl.textContent = evt.emoji || '✨';
  if (actorEl) actorEl.textContent = evt.actor ? `👤 ${evt.actor}` : 'EFFEKT';
  if (titleEl) titleEl.textContent = evt.title || 'Karten-Effekt';
  if (descEl) descEl.textContent = evt.desc || '';
  const voice = evt.voice && !evt.voice.skipped && Date.now() - (evt.time || 0) < 8000 ? evt.voice : null;
  $('chain-voice').hidden = !voice;
  $('chain-voice').textContent = voice ? `🗣️ ${voice.line}` : '';
  $('chain-skip').hidden = !(voice && voice.by === me);
  $('chain-skip').onclick = () => { act('voice-skip', null); stopVoice(); clearTimeout(chainTimeout); hideChainBanner(); };

  if (chainTimeout) clearTimeout(chainTimeout);
  banner.hidden = false;
  requestAnimationFrame(() => {
    banner.classList.add('show');
    vibrate([30, 40, 30]);
  });

  const close = (ms) => { clearTimeout(chainTimeout); chainTimeout = setTimeout(hideChainBanner, ms); };
  if (voice) {
    close(12000);                                     // Sicherheitsnetz, falls Audio hängt
    speak(voice, close);
  } else close(3000);
}

socket.on('view', (v) => {
  const meme = memeEvents.observe(v, me);
  if (meme) void sound.memes.play(meme, { priority: v.state === 'over' });
  const myTurnBefore = view?.turn === me;
  view = v;
  if (v.host === me && v.deckChoice) {
    const stored = saveDeckPreset(v.deckChoice);
    if (lastJoin) lastJoin.deckChoice = v.deckChoice;
    $('deck-preset-note').textContent = stored
      ? '✓ Auswahl gespeichert – gilt automatisch für deinen nächsten neuen Tisch in diesem Browser.'
      : 'Die Auswahl gilt an diesem Tisch. Dein Browser erlaubt gerade kein dauerhaftes Speichern.';
  }
  const ids = new Set(v.hand.map((c) => c.id));
  selected = new Set([...selected].filter((id) => ids.has(id)));
  focus = Math.min(focus, Math.max(0, v.hand.length - 1));
  render();

  if (v.chainEvent) {
    showChainBanner(v.chainEvent);
  }

  // Akustische Rückmeldung für Spielereignisse am Tisch
  const lastLog = v.log[v.log.length - 1];
  if (lastLog && lastLog !== lastSeenLog) {
    lastSeenLog = lastLog;
    if (lastLog.includes('nimmt den Stapel')) {
      sound.playTake();
    } else if (lastLog.includes('Phönix-Asche')) {
      sound.playPhoenix();
    } else if (lastLog.includes('Schwarzes Loch') || lastLog.includes('Singularität')) {
      sound.playBlackHole();
    } else if (lastLog.includes('Chronos') || lastLog.includes('Zeit')) {
      sound.playTimestop();
    } else if (lastLog.includes('Aegis') || lastLog.includes('Nullifizierung')) {
      sound.playShield();
    } else if (lastLog.includes('Blitz') || lastLog.includes('Karma')) {
      sound.playThunder();
    } else if (lastLog.includes('Portal')) {
      sound.playPortal();
    } else if (lastLog.includes('Ouroboros') || lastLog.includes('Zeitschleife')) {
      sound.playTimeloop();
    } else if (lastLog.includes('Beben') || lastLog.includes('Tektonischer Schock')) {
      sound.playEarthquake();
    } else if (lastLog.includes('verbrennt') || lastLog.includes('Feuer')) {
      sound.playBurn();
    } else if (lastLog.includes('Kartoffel')) {
      sound.playPotato();
    } else if (lastLog.includes('spielt')) {
      const topCard = v.pile[v.pile.length - 1];
      if (topCard) sound.playCardSound(topCard);
      else sound.playMagicChime();
    } else if (lastLog.includes('Farb-Überladung') || lastLog.includes('Kettenfluch')) {
      sound.playChainCurse();
    } else if (lastLog.includes('Farb-Resonanz')) {
      const topCard = v.pile[v.pile.length - 1];
      sound.playResonance(topCard?.color);
    } else if (lastLog.includes('legt')) {
      sound.playCardSnap();
    }
  }

  if (!myTurnBefore && v.turn === me && v.state === 'playing') {
    vibrate([40, 50, 40]);
    sound.playTurn();
    // Großer Hinweis in der Bildmitte, damit es niemand verpasst
    const sp = document.createElement('div');
    sp.className = 'turn-splash';
    sp.textContent = '🫵 DU BIST DRAN!';
    $('table').append(sp);
    setTimeout(() => sp.remove(), 1600);
  }
  document.title = v.turn === me && v.state === 'playing' ? '🔴 Du bist dran! · Club Bombe' : 'Club Bombe Spiel';
  if (v.state === 'playing' && v.game !== seenGame && v.drawn) { seenGame = v.game; $('ranking').hidden = true; playIntro(v); }
  if (v.state === 'over' && v.ranking && shownRanking !== v.game) { shownRanking = v.game; showRanking(v); }
  showFx(v.fx);
});
let seenGame = 0, shownRanking = 0;
const bubbles = {};
socket.on('disconnect', () => { if (me) toast('📵 Verbindung weg – verbinde neu …'); });
// Nach jedem (Wieder-)Verbinden automatisch zurück an denselben Platz
socket.on('connect', () => {
  if (!lastJoin || !me) return;
  socket.emit('join', lastJoin, (res) => { if (res.ok) toast('✅ Wieder da!'); });
});
// Neue Server-Version? Seite neu laden und automatisch wieder an den Tisch
let knownBuild = null;
socket.on('hello', ({ build }) => {
  if (knownBuild && build !== knownBuild) {
    if (lastJoin) sessionStorage.setItem('karten-autojoin', lastJoin.room);
    location.reload();
    return;
  }
  knownBuild = build;
});

// ── Kartenauswahl vor dem Spiel: Host wählt, alle anderen sehen mit ──
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
let deckShown = '';
function renderDeckModal(force = false) {
  const v = view;
  if (!v) return;
  const canEdit = v.host === me && v.state !== 'playing';
  const choice = v.deckChoice ?? DEFAULT_DECK;
  const key = JSON.stringify([choice, canEdit, v.customCards?.length]);
  if (!force && key === deckShown) return;     // nichts geändert → offene „Mehr“-Felder nicht zuklappen
  deckShown = key;
  const box = $('deck-content');
  const scroll = box.scrollTop;
  const row = (type, k, emoji, name, short, long, on) => `
    <div class="deck-row${on ? ' on' : ''}">
      <label>
        <input type="checkbox" data-type="${type}" data-key="${k}" ${on ? 'checked' : ''} ${canEdit ? '' : 'disabled'} />
        <span class="deck-emoji">${escHtml(emoji)}</span>
        <span class="deck-info"><b>${escHtml(name)}</b><span>${escHtml(short)}</span></span>
      </label>
      ${long && long !== short ? `<details><summary>Original-Text</summary>${escHtml(long)}</details>` : ''}
    </div>`;
  const section = (type, gkey, title, hint, rows, onCount) => `
    <section class="deck-group">
      <header>
        <div><h3>${title} <small>${onCount}/${rows.length}</small></h3><p>${hint}</p></div>
        ${canEdit ? `<div class="deck-quick"><button type="button" data-all="${type}:${gkey}">alle</button><button type="button" data-none="${type}:${gkey}">keine</button></div>` : ''}
      </header>
      ${rows.join('')}
    </section>`;
  const catalog = specialCatalog();
  const own = v.customCards?.length ?? 0;
  box.innerHTML = `
    <p class="deck-summary">Im Spiel: <b>${choice.specials.length} Spezialkarten</b>${own ? ` + <b>${own} eigene Bomben</b>` : ''} · <b>${choice.roles.length} Rollen</b>.
      Jede*r bekommt zum Start 2 Spezialkarten, der Rest liegt im Stapel.</p>
    <div class="deck-row deck-voice${choice.voice !== false ? ' on' : ''}">
      <label>
        <input type="checkbox" id="deck-voice" ${choice.voice !== false ? 'checked' : ''} ${canEdit ? '' : 'disabled'} />
        <span class="deck-emoji">🗣️</span>
        <span class="deck-info"><b>Ansage bei Spezialkarten</b><span>Eine KI-Stimme erklärt allen kurz, was gerade passiert. Wer die Karte legt, kann überspringen.</span></span>
      </label>
    </div>
    ${canEdit
      ? `<div class="deck-quick deck-presets"><button type="button" id="deck-default">↺ Grundspiel</button><button type="button" id="deck-plus">✨ Grundspiel Plus</button><button type="button" id="deck-everything">Alles rein</button></div>`
      : '<p class="deck-note">👑 Nur der Host kann die Auswahl ändern.</p>'}
    ${SPECIAL_GROUPS.map((g) => {
      const list = catalog.filter((c) => c.group === g.key);
      return section('specials', g.key, g.name, g.hint,
        list.map((c) => row('specials', c.key, c.emoji, c.name + (c.by ? ` · von ${c.by}` : ''), c.short, c.long, choice.specials.includes(c.key))),
        list.filter((c) => choice.specials.includes(c.key)).length);
    }).join('')}
    ${section('roles', 'roles', 'Geheime Rollen', 'Jede*r bekommt zufällig eine davon – mindestens 1 muss an sein.',
      Object.entries(ROLES).map(([k, r]) => row('roles', k, r.emoji, r.name, r.short ?? r.text, r.text, choice.roles.includes(k))),
      choice.roles.length)}`;
  box.scrollTop = scroll;
  if (!canEdit) return;

  const send = (next) => act('configure', next);
  const groupKeys = (type, gkey) => type === 'roles' ? Object.keys(ROLES) : catalog.filter((c) => c.group === gkey).map((c) => c.key);
  box.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.onchange = () => {
      const { type, key: k } = cb.dataset;
      const list = new Set(choice[type]);
      if (cb.checked) list.add(k); else list.delete(k);
      if (type === 'roles' && !list.size) { cb.checked = true; return toast('Mindestens 1 Rolle muss dabei sein.'); }
      send({ ...choice, [type]: [...list] });
    };
  });
  box.querySelectorAll('[data-all],[data-none]').forEach((b) => {
    b.onclick = () => {
      const [type, gkey] = (b.dataset.all ?? b.dataset.none).split(':');
      const keys = groupKeys(type, gkey);
      const list = new Set(choice[type]);
      for (const k of keys) b.dataset.all ? list.add(k) : list.delete(k);
      if (type === 'roles' && !list.size) return toast('Mindestens 1 Rolle muss dabei sein.');
      send({ ...choice, [type]: [...list] });
    };
  });
  $('deck-voice').onchange = (e) => send({ ...choice, voice: e.target.checked });
  $('deck-default').onclick = () => send(DEFAULT_DECK);
  $('deck-plus').onclick = () => send(DEFAULT_DECK_PLUS);
  $('deck-everything').onclick = () => send({ specials: catalog.map((c) => c.key), roles: Object.keys(ROLES) });
}
$('deck-btn').onclick = () => { $('deck-modal').hidden = false; renderDeckModal(true); };
$('deck-close').onclick = () => { $('deck-modal').hidden = true; };
$('deck-modal').onclick = (e) => { if (e.target === $('deck-modal')) $('deck-modal').hidden = true; };

// Aktion senden – war der Server „vergesslich“ (Neustart), erst wieder hinsetzen, dann nochmal
function act(event, data, onError = toast) {
  socket.emit(event, data, (res) => {
    if (res.rejoin && lastJoin) {
      return socket.emit('join', lastJoin, (j) => {
        if (!j.ok) return onError(j.error);
        socket.emit(event, data, (again) => again.error && onError(again.error));
      });
    }
    if (res.error) onError(res.error);
    else if (event === 'play') selected.clear();
  });
}

// ── Tisch zeichnen ───────────────────────────────────────
function render() {
  const v = view;
  // Gegenüber am Tisch: alle anderen im Halbkreis, in Spielreihenfolge ab dir
  $('players').innerHTML = '';
  const meIdx = Math.max(0, v.players.findIndex((p) => p.id === me));
  const others = [...v.players.slice(meIdx + 1), ...v.players.slice(0, meIdx)];
  others.forEach((p, i) => {
    const t = others.length === 1 ? 0.5 : i / (others.length - 1);
    const seat = document.createElement('div');
    seat.dataset.id = p.id;
    seat.className = 'seat' + (p.id === v.turn ? ' turn' : '') + (p.inGame || v.state === 'lobby' ? '' : ' out');
    seat.style.left = `${12 + t * 76}%`;
    seat.style.top = `${10 + Math.sin(Math.PI * t) * -6 + 6}%`;
    const face = arts[p.id]?.avatar || (p.bot ? getBotAvatar(p.name || p.id) : null);
    seat.innerHTML = '<div class="face"></div><div class="nm"></div><div class="role"></div><div class="backs"></div>';
    if (face) seat.querySelector('.face').style.backgroundImage = `url("${face}")`;
    else seat.querySelector('.face').textContent = p.name.slice(0, 2).toUpperCase();
    seat.querySelector('.nm').textContent = p.name + (p.id === v.host ? ' 👑' : '');
    if (p.inGame) seat.querySelector('.nm').dataset.count = p.count;
    seat.querySelector('.role').textContent = p.role ? `${p.role.emoji} ${p.role.name}` : p.secret ? '❓ geheim' : (v.state === 'lobby' ? 'wartet …' : 'schaut zu');
    if (!p.connected) seat.querySelector('.role').textContent = '📵 weg …';
    if (p.inGame) {
      const backs = seat.querySelector('.backs');
      const n = Math.min(p.count, 7);
      for (let k = 0; k < n; k++) {
        const m = document.createElement('div');
        m.className = 'mini back-pattern';
        m.style.transform = `rotate(${(k - (n - 1) / 2) * 9}deg)`;
        backs.append(m);
      }
      const b = document.createElement('b'); b.textContent = p.count; backs.append(b);
    } else seat.querySelector('.backs').remove();
    const bb = bubbles[p.id];
    if (bb && bb.until > Date.now()) {
      const b = document.createElement('div');
      b.className = 'bubble';
      b.textContent = bb.text;
      seat.append(b);
    }
    $('players').append(seat);
  });

  // Deine Rolle + Host-Hinweis an den Ärmeln
  const mine = v.players.find((p) => p.id === me);
  $('pov').title = mine?.role ? `${mine.role.emoji} ${mine.role.name}: ${mine.role.text}` : '';

  // Stapel
  $('pile').innerHTML = '';
  if (!v.pile.length) $('pile').innerHTML = '<div class="empty">leer</div>';
  v.pile.forEach((c, i) => {
    const el = cardEl(c, arts);
    el.style.transform = `rotate(${(c.id * 37 % 21) - 10}deg) translate(${i * 3}px, ${i * 2}px)`;
    el.onmouseenter = () => updateExplain(c);
    el.onmouseleave = () => updateExplain(null);
    $('pile').append(el);
  });
  const topCard = v.pile[v.pile.length - 1];
  const topElem = topCard?.color ? COLOR_ELEMENTS[topCard.color] : null;
  const elemTag = topElem ? `  ·  ${topElem.icon} ${topElem.gem}` : '';
  const streak = v.colorStreak;
  const streakElem = streak?.color ? COLOR_ELEMENTS[streak.color] : null;
  const streakTag = streak && streak.count >= 2
    ? `  ·  ⚡ ${streak.count}/3 ${streakElem?.label || 'Kette'} (Überladung droht!)`
    : streak && streak.count === 1 && streakElem
    ? `  ·  ${streakElem.icon} 1/3 Kette`
    : '';
  const dirArrow = v.dir === 1 ? '↻' : '↺';
  $('pile').querySelectorAll('.card').forEach((el) => { el.style.cursor = 'default'; });
  const deckTag = v.state === 'playing' && v.deckCount !== undefined ? `  ·  🎴 ${v.deckCount} im Deck` : '';
  $('pile-info').textContent = v.state === 'playing'
    ? (v.top ? `Zu toppen: ${v.lower ? '≤' : '≥'} ${v.top}` : 'Alles geht!') + (v.sphere && v.top ? ` (oder ${v.top - 1})` : '') + elemTag + streakTag + `  ·  ${v.pileCount} im Stapel` + deckTag + `  ·  ${dirArrow}`
    : v.state === 'over' ? 'Runde vorbei' : `${v.players.length} am Tisch`;

  // Nachziehstapel Visualisierung & Counter
  const deckCardEl = $('deck-card');
  const deckCountEl = $('deck-count');
  if (deckCardEl && deckCountEl) {
    const count = v.deckCount ?? 0;
    deckCountEl.textContent = count;
    deckCardEl.title = `Nachziehstapel: Noch ${count} Karte${count === 1 ? '' : 'n'} im Deck`;
    deckCardEl.classList.toggle('empty', count === 0);
  }

  // ♊ freie Farben als Punkte hinter der Stapel-Info
  if (v.wild && v.state === 'playing') {
    const dots = document.createElement('span');
    dots.className = 'wild-dots';
    dots.title = 'Diese Farben passen gerade auf alles';
    for (const c of v.wild) { const d = document.createElement('i'); d.style.background = c; dots.append(d); }
    $('pile-info').append(' ♊', dots);
  }

  // Letzter Zug Indikator (Last Action Pill über dem Stapel)
  const lastAct = v.lastAction;
  const pillEl = $('last-action-pill');
  if (pillEl) {
    if (lastAct && v.state === 'playing') {
      pillEl.hidden = false;
      const iconEl = $('last-action-icon');
      const textEl = $('last-action-text');
      if (iconEl) iconEl.textContent = lastAct.icon || '🃏';
      if (textEl) textEl.textContent = lastAct.text || '';
    } else {
      pillEl.hidden = true;
    }
  }

  // Log (+ Ticker mit der letzten Aktion fürs Handy)
  $('ticker').textContent = v.log[v.log.length - 1] ?? '';
  $('log').innerHTML = '';
  for (const l of v.log) { const li = document.createElement('li'); li.textContent = l; $('log').append(li); }

  // Hand: Fächer zwischen deinen Händen
  const myTurn = v.turn === me && v.state === 'playing';
  $('hand').innerHTML = '';
  const n = v.hand.length;
  // Flacher Bogen über die verfügbare Breite: so viel Abstand wie möglich, max. 85 % Kartenbreite
  const cw = parseFloat(getComputedStyle($('table')).getPropertyValue('--cw')) || 124;
  const avail = Math.min($('table').clientWidth - 70, 1200);
  const stepX = n > 1 ? Math.min(cw * 0.85, (avail - cw) / (n - 1)) : 0;
  const half = ((n - 1) * stepX + cw) / 2;
  $('pov').style.setProperty('--fan-half', `${Math.max(half, cw)}px`);
  // Gleiche Zahlen zählen für Kombi- / Zwillings-Ablage
  const numberCounts = {};
  for (const c of v.hand) {
    if (c?.kind === 'number' && typeof c.value === 'number') {
      numberCounts[c.value] = (numberCounts[c.value] || 0) + 1;
    }
  }
  const currentSel = selectedCards();
  const selectedNumValue = (currentSel.length > 0 && currentSel[0]?.kind === 'number') ? currentSel[0].value : null;

  v.hand.forEach((c, i) => {
    const el = cardEl(c, arts);
    const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;   // -1 (links) … 1 (rechts)
    el.style.setProperty('--x', `${(i - (n - 1) / 2) * stepX}px`);
    el.style.setProperty('--y', `${t * t * 22}px`);
    el.style.setProperty('--r', `${t * 9}deg`);
    el.style.setProperty('--i', i);
    el.style.setProperty('--hand-n', n);
    el.style.zIndex = i;
    const isPlayable = myTurn && playable([c]);
    const isResonantBonus = myTurn && isPlayable && c.kind === 'number' && topCard?.color === c.color &&
      (!v.lower ? c.value < v.top : c.value > v.top);
    if (selected.has(c.id)) el.classList.add('selected');
    if (myTurn && i === focus && usingPad) el.classList.add('focus');
    if (myTurn && !isPlayable) el.classList.add('dim');
    if (isPlayable) el.classList.add('playable');
    if (isResonantBonus) {
      el.classList.add('resonant');
      el.title = `Farb-Resonanz! Erlaubt ${v.lower ? 'über' : 'unter'} ${v.top} zu legen (-2 Resonanz).`;
      const badge = document.createElement('span');
      badge.className = 'hand-card-badge badge-resonance';
      badge.textContent = '🎵 -2';
      badge.title = 'Farb-Resonanz: Erlaubt 2 Punkte Abweichung auf gleiche Farbe!';
      el.append(badge);
    }
    const myRole = mine?.role;
    if (myTurn && isPlayable && (myRole?.key === 'held' || myRole?.ability === 'hero') && v.hand?.length <= 2 && c.kind === 'number') {
      const badge = document.createElement('span');
      badge.className = 'hand-card-badge badge-hero';
      badge.textContent = '🦸 Held';
      badge.title = 'Heldenmut: Jede beliebige Zahl darf gelegt werden!';
      el.append(badge);
    } else if (myTurn && isPlayable && (myRole?.key === 'gluecksspieler' || myRole?.ability === 'gambler') && v.top > 0 && c.kind === 'number' && (c.value % 2 !== v.top % 2)) {
      const badge = document.createElement('span');
      badge.className = 'hand-card-badge badge-gambler';
      badge.textContent = '🎲 Würfel';
      badge.title = 'Gezinkte Würfel: Ungerade auf gerade und umgekehrt!';
      el.append(badge);
    }

    // 👯 Zwillings- / Kombi-Signal bei gleichen Zahlenwerten
    if (c.kind === 'number' && numberCounts[c.value] > 1) {
      el.classList.add('twin-candidate');
      if (selectedNumValue !== null && c.value === selectedNumValue && !selected.has(c.id)) {
        el.classList.add('twin-companion');
        const badge = document.createElement('span');
        badge.className = 'hand-card-badge badge-twin';
        badge.textContent = '+ Kombi!';
        badge.title = `Kombi-Ablage: Du kannst diese ${c.value} zusammen mit der gewählten abwerfen!`;
        el.append(badge);
      }
    }

    // 🎴 Atmender Fächer: Nachbarkarten weichen sanft zur Seite aus
    el.addEventListener('mouseenter', () => {
      updateExplain(c);
      const nudge = Math.max(16, Math.min(30, 220 / (n || 1)));
      const siblings = $('hand')?.children;
      if (siblings) {
        for (let j = 0; j < siblings.length; j++) {
          if (j < i) siblings[j].style.setProperty('--nudge', `-${nudge}px`);
          else if (j > i) siblings[j].style.setProperty('--nudge', `${nudge}px`);
          else siblings[j].style.setProperty('--nudge', '0px');
        }
      }
    });
    el.addEventListener('mouseleave', () => {
      updateExplain(null);
      const siblings = $('hand')?.children;
      if (siblings) {
        for (let j = 0; j < siblings.length; j++) {
          siblings[j].style.setProperty('--nudge', '0px');
        }
      }
    });

    el.onclick = () => { focus = i; toggle(c); };
    $('hand').append(el);
  });
  $('turn-banner').classList.toggle('show', myTurn);
  $('table').classList.toggle('my-turn', myTurn);

  // Erklärfeld: angetippte oder gehoverte Special-Karte
  updateExplain(null);

  const sel = selectedCards();
  const isLastCard = v.hand.length === 1;
  const isDefenseCard = sel.length === 1 && ['mirror', 'aegis', 'luckyJester'].includes(sel[0]?.ability);
  const isMultiDrop = sel.length > 1 && sel.every((c) => c.kind === 'number' && c.value === sel[0].value);

  if (sel[0]?.ability === 'potato') {
    $('play').textContent = '🥔 Weitergeben';
  } else if (isLastCard && isDefenseCard) {
    $('play').textContent = '🏆 Letzte Karte legen (Sieg!)';
  } else if (isDefenseCard) {
    $('play').textContent = '⚠️ Trotzdem legen';
  } else if (isMultiDrop) {
    $('play').textContent = `🚀 Kombi (${sel.length}x ${sel[0].value}) abwerfen!`;
  } else {
    $('play').textContent = 'Legen ⬆️';
  }

  // Deine Rolle als interaktiver Badge in den Aktions-Knöpfen
  const roleBadge = $('my-role-badge');
  if (roleBadge) {
    if (mine?.role && v.state === 'playing') {
      roleBadge.hidden = false;
      roleBadge.innerHTML = `${mine.role.emoji || '👑'} <span>${mine.role.name}</span>`;
      roleBadge.title = `${mine.role.emoji} ${mine.role.name}:\n${mine.role.text}\n(Klicken für alle Rollen im Almanach)`;
      roleBadge.onclick = () => {
        if (modalAlmanach) {
          modalAlmanach.hidden = false;
          renderAlmanachTab('roles');
        }
      };
    } else {
      roleBadge.hidden = true;
    }
  }

  // Eigener Handkarten-Zähler (in der Aktionsleiste und schwebend über dem Fächer)
  const myCardCountEl = $('my-card-count');
  const povCardCounterEl = $('pov-card-counter');
  const handCount = v.hand?.length ?? 0;
  if (myCardCountEl) {
    if (v.state === 'playing') {
      myCardCountEl.hidden = false;
      myCardCountEl.querySelector('b').textContent = handCount;
      myCardCountEl.title = `Du hast aktuell ${handCount} Karte${handCount === 1 ? '' : 'n'} auf der Hand`;
    } else {
      myCardCountEl.hidden = true;
    }
  }
  if (povCardCounterEl) {
    if (v.state === 'playing') {
      povCardCounterEl.hidden = false;
      povCardCounterEl.innerHTML = `<b>${handCount}</b> Karte${handCount === 1 ? '' : 'n'}`;
    } else {
      povCardCounterEl.hidden = true;
    }
  }

  // Knöpfe
  const isHost = v.host === me;
  $('actions').classList.toggle('setup', v.state !== 'playing');
  $('take').hidden = v.state !== 'playing';
  $('play').hidden = v.state !== 'playing';
  const nChosen = (v.deckChoice?.specials.length ?? 0) + (v.customCards?.length ?? 0);
  $('deck-btn').hidden = v.state === 'playing';
  $('deck-btn').textContent = `🎴 Karten (${nChosen})`;
  if (!$('deck-modal').hidden) renderDeckModal();
  $('bot-add').hidden = !(isHost && v.state !== 'playing');
  $('bot-add').disabled = v.players.length >= RULES.maxPlayers;
  $('bot-remove').hidden = !(isHost && v.state !== 'playing');
  $('bot-remove').disabled = !v.players.some((p) => p.bot);
  $('deck-preset-note').hidden = !isHost || v.state === 'playing';
  $('start').hidden = !(isHost && v.state !== 'playing');
  $('start').textContent = v.state === 'over' ? '🔁 Nochmal' : '▶️ Spiel starten';
  $('start').disabled = v.players.length < 2;
  $('play').disabled = !myTurn || !selected.size || !playable(selectedCards());
  $('take').disabled = !myTurn || !v.pileCount;
  if (v.state === 'over' && v.winner) {
    const w = v.players.find((p) => p.id === v.winner);
    $('pile-info').textContent = `🏆 ${w?.name ?? '?'} gewinnt!`;
  }
}

function updateExplain(hoverCard = null) {
  const sel = selectedCards();
  const isCombo = isJesterCombo(sel);
  const selectedSp = isCombo
    ? { emoji: '😆😢', name: JESTER_COMBO.name, text: JESTER_COMBO.text }
    : sel.length === 1 && sel[0].kind === 'special' ? sel[0] : null;
  const sp = (hoverCard && hoverCard.kind === 'special') ? hoverCard : selectedSp;

  const exp = $('explain');
  if (!exp) return;
  exp.hidden = !sp;
  if (sp) {
    const isHoverOnly = Boolean(hoverCard && hoverCard.kind === 'special' && (!selectedSp || hoverCard.id !== selectedSp.id));
    const isLastCard = view?.hand?.length === 1;
    exp.innerHTML = '<b></b><span></span><small></small>';
    exp.querySelector('b').textContent = `${sp.emoji ?? (sp.key === 'custom' ? '💣' : '✨')} ${sp.name}${sp.title ? ' · ' + sp.title : ''}${sp.by ? ' (von ' + sp.by + ')' : ''}`;
    exp.querySelector('span').textContent = cardText(sp);
    const myTurn = view?.turn === me && view?.state === 'playing';
    exp.querySelector('small').textContent = isHoverOnly
      ? (sp.key === 'custom' ? '✨ Selbstgebaute Bombe' : (sp.by ? `Club-Karte von ${sp.by}` : 'Spezial-Effekt'))
      : sp.ability === 'potato' ? (myTurn ? '→ „Weitergeben“ drücken und Person wählen.' : 'Weitergeben, wenn du dran bist.')
      : sp.ability === 'luckyJester' && !isCombo ? (isLastCard ? '🏆 Letzte Karte! Lege den Schelm ab, um das Spiel zu gewinnen!' : '🛡️ Passiver Schelm: Wirkt automatisch bei Angriffen. (Tipp: Behalte ihn zum Schutz auf der Hand!)')
      : sp.ability === 'mirror' ? (isLastCard ? '🏆 Letzte Karte! Lege den Spiegel ab, um das Spiel zu gewinnen!' : '🛡️ Passiv-Schutz: Spiegelt Zieh-Strafen zurück. (Warnung: Aktiv weggeworfen verpufft die Verteidigung!)')
      : sp.ability === 'aegis' ? (isLastCard ? '🏆 Letzte Karte! Lege die Aegis ab, um das Spiel zu gewinnen!' : (myTurn ? '🛡️ Passiv-Schutz (wehrt Zieh-Strafen & Aussetzen ab)! Aktives Legen setzt nur Tisch auf 0.' : '🛡️ Passiv: Blockt negative Effekte & Aussetzen automatisch ab!'))
      : sp.ability === 'phoenix' ? (isLastCard ? '🏆 Letzte Karte! Verbrennt den Tisch und sichert den Sieg!' : (myTurn ? '🪶 Aktiv: Verbrennt Tischstapel zu Asche & zieht 1 | Passiv: Schützt vor Stapel-Fressen.' : '🪶 Passiv: Verbrennt den Tisch bei Stapel-Fressen!'))
      : myTurn ? 'Passt auf jede Karte → „Legen“ drücken.' : 'Passt auf jede Karte – leg sie, wenn du dran bist.';
  }
}

// Gleiche Logik wie auf dem Server – nur damit man im Browser direkt sieht, was geht
function playable(cards) {
  if (!cards.length) return false;
  if (cards.some((c) => c.kind === 'special')) {
    return cards.length === 1 || isJesterCombo(cards);
  }
  const counts = {};
  for (const c of cards) {
    if (c.kind === 'number') {
      counts[c.value] = (counts[c.value] || 0) + 1;
      if (counts[c.value] > 3) return false;
    }
  }
  if (cards.some((c) => c.value !== cards[0].value)) return false;

  const myRole = view.players?.find((p) => p.id === me)?.role;
  const isHero = myRole?.key === 'held' || myRole?.ability === 'hero';
  if (isHero && view.hand?.length <= 2 && cards.every((c) => c.kind === 'number')) {
    return true; // 🦸 Heldenmut: Darf jede Zahl auf jede Zahl legen
  }

  const isGambler = myRole?.key === 'gluecksspieler' || myRole?.ability === 'gambler';
  if (isGambler && view.top > 0 && cards.every((c) => c.kind === 'number')) {
    const v = cards[0].value;
    if ((v % 2) !== (view.top % 2)) return true; // 🎲 Gezinkte Würfel: Ungerade auf gerade und umgekehrt
  }

  const v = cards[0].value;
  if (!view.top) return true;
  if (view.wild && cards.every((c) => view.wild.includes(c.color))) return true;
  if (view.sphere && v === view.top - 1) return true;

  // Farbresonanz: gleiche Farbe wie Tischkarte erlaubt Abweichung um bis zu 2 Punkte
  const topCard = view.pile?.[view.pile.length - 1];
  const resonant = Boolean(topCard?.color && cards.every((c) => c.kind === 'number' && c.color === topCard.color));
  const tol = resonant ? 2 : 0;

  return view.lower ? v <= (view.top + tol) : v >= Math.max(1, view.top - tol);
}
function isJesterCombo(cards) {
  return cards.length === 2 && cards.map((c) => c.ability).sort().join('+') === 'luckyJester+sadJester';
}
function selectedCards() {
  return (view?.hand || []).filter((c) => selected.has(c.id));
}

function toggle(c) {
  if (selected.has(c.id)) selected.delete(c.id);
  else {
    // Andere Zahl/Special gewählt? Dann neu anfangen statt mischen.
    const cur = selectedCards();
    const jesters = cur.length === 1 && isJesterCombo([cur[0], c]);
    if (cur[0] && !jesters && (c.kind === 'special' || cur[0].kind === 'special' || cur[0].value !== c.value)) selected.clear();
    const curAfter = selectedCards();
    if (c.kind === 'number' && curAfter.filter((x) => x.value === c.value).length >= 3) return; // Triple-Cap
    selected.add(c.id);
  }
  render();
}

async function playSelected() {
  if (!selected.size) return;
  const cards = selectedCards();
  const ids = [...selected];
  const others = view.players.filter((p) => p.inGame && p.id !== me);
  let choice = {};
  if (isJesterCombo(cards)) {
    const a = await pick('😆 Wer mischt die ganze Hand neu?', others);
    if (!a) return;
    const b = await pick('😢 Wer zieht 3?', others.filter((p) => p.id !== a));
    if (!b) return;
    choice = { targets: [a, b] };
  } else if (cards[0].ability === 'potato') {
    let ok = others.filter((p) => p.id !== cards[0].cameFrom);
    if (!ok.length) ok = others;
    const t = await pick('🥔 An wen geht die Kartoffel? (zieht 3)', ok);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'sadJester') {
    const t = await pick('😢 Wer soll mit dir weinen?', others);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'thief') {
    const t = await pick('🥷 Wen möchtest du bestehlen?', others);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'divineWrath') {
    const t = await pick('⚡ Wen soll der Göttliche Blitz treffen?', others);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'chainCurse') {
    const t = await pick('⛓️ Wen soll der Kettenfluch treffen? (zieht 2)', others);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'fairyTrick') {
    const t = await pick('🧚‍♀️ Wen soll der Feen-Streich treffen? (Spezialkarte stehlen oder 2 ziehen)', others);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'twins') {
    const cs = await pickColors();
    if (!cs) return;
    choice = { colors: cs };
  }
  if (cards.length) sound.playCardSound(cards[0]);
  vibrate(25);
  act('play', { ids, choice });
}

// Auswahlfenster: eine Person wählen
function pick(title, people) {
  return new Promise((resolve) => {
    const ov = $('picker');
    ov.hidden = false;
    ov.innerHTML = '<div class="intro-window"><h2></h2><div class="pick-list"></div><button class="cancel">Abbrechen</button></div>';
    ov.querySelector('h2').textContent = title;
    for (const p of people) {
      const b = document.createElement('button');
      b.className = 'pick';
      const face = arts[p.id]?.avatar || (p.bot || p.name?.startsWith('Bot ') ? getBotAvatar(p.name || p.id) : null);
      b.innerHTML = '<span class="pf"></span><b></b><small></small>';
      if (face) b.querySelector('.pf').style.backgroundImage = `url("${face}")`; else b.querySelector('.pf').textContent = p.name.slice(0, 2).toUpperCase();
      b.querySelector('b').textContent = p.name;
      b.querySelector('small').textContent = `${p.count} Karten`;
      b.onclick = () => { ov.hidden = true; resolve(p.id); };
      ov.querySelector('.pick-list').append(b);
    }
    ov.querySelector('.cancel').onclick = () => { ov.hidden = true; resolve(null); };
  });
}
// Auswahlfenster: zwei Farben wählen
function pickColors() {
  return new Promise((resolve) => {
    const ov = $('picker');
    const chosen = [];
    ov.hidden = false;
    ov.innerHTML = '<div class="intro-window"><h2>♊ Wähle zwei Farben</h2><p class="hint">Bis du wieder dran bist, passen sie auf jede Karte.</p><div class="pick-colors"></div><button class="cancel">Abbrechen</button></div>';
    for (const c of RULES.colors) {
      const b = document.createElement('button');
      b.className = 'pick-color';
      b.style.background = c;
      b.onclick = () => {
        if (chosen.includes(c)) return;
        chosen.push(c); b.classList.add('on');
        if (chosen.length === 2) { ov.hidden = true; resolve(chosen); }
      };
      ov.querySelector('.pick-colors').append(b);
    }
    ov.querySelector('.cancel').onclick = () => { ov.hidden = true; resolve(null); };
  });
}
const take = () => { sound.playTake(); vibrate(45); act('take', null); };

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1600);
}

// ── Steuerung: Maus/Touch, Tastatur, Controller ──────────
let usingPad = false;
function initControls() {
  $('play').onclick = playSelected;
  $('take').onclick = take;
  $('start').onclick = () => act('start', null);

  addEventListener('keydown', (e) => {
    if (!view || e.target.tagName === 'INPUT') return;
    const n = view.hand.length;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { focus = (focus + 1) % n; usingPad = true; }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { focus = (focus - 1 + n) % n; usingPad = true; }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { if (view.hand[focus]) toggle(view.hand[focus]); }
    else if (e.code === 'Space' || e.code === 'Enter') playSelected();
    else if (e.code === 'KeyT' || e.code === 'ArrowDown') take();
    else return;
    e.preventDefault();
    render();
  });

  // Controller: Steuerkreuz/Stick = Karte wählen, A = markieren, B = legen, X = Stapel nehmen
  const prev = {};
  (function poll() {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad || !view) continue;
      const press = (name, on) => { const fire = on && !prev[name]; prev[name] = on; return fire; };
      const n = view.hand.length || 1;
      if (press('r', pad.buttons[15]?.pressed || pad.axes[0] > 0.6)) { focus = (focus + 1) % n; usingPad = true; render(); }
      if (press('l', pad.buttons[14]?.pressed || pad.axes[0] < -0.6)) { focus = (focus - 1 + n) % n; usingPad = true; render(); }
      if (press('a', pad.buttons[0]?.pressed) && view.hand[focus]) toggle(view.hand[focus]);
      if (press('b', pad.buttons[1]?.pressed)) playSelected();
      if (press('x', pad.buttons[2]?.pressed)) take();
      if (press('s', pad.buttons[9]?.pressed) && view.host === me) $('start').click();
    }
    requestAnimationFrame(poll);
  })();
}

// ═════════ Intro: Rolle drehen → Erklärung → Special-Karte auslosen ═════════

let introTimers = [];
function playIntro(v) {
  const myRole = v.players.find((p) => p.id === me)?.role;
  if (!myRole) return;
  introTimers.forEach(clearTimeout); introTimers = [];
  const ov = $('intro');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="intro-step" id="step-role">
      <h2>Deine Rolle</h2>
      <div class="reel-window"><div class="reel" id="role-reel"></div></div>
    </div>`;
  // Slot-Walze: viele zufällige Rollen, ganz unten deine
  const keys = Object.keys(ROLES);
  const items = Array.from({ length: 28 }, () => keys[Math.floor(Math.random() * keys.length)]);
  items.push(myRole.key);
  const reel = $('role-reel');
  for (const k of items) {
    const d = document.createElement('div'); d.className = 'reel-item';
    d.textContent = `${ROLES[k].emoji} ${ROLES[k].name}`; reel.append(d);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    reel.style.transform = `translateY(${-(items.length - 1) * 72}px)`;
  }));
  introTimers.push(setTimeout(() => { navigator.vibrate?.(80); showRoleCard(myRole, v); }, 2600));
}

function showRoleCard(role, v) {
  const ov = $('intro');
  ov.innerHTML = `
    <div class="intro-window">
      <div class="big-emoji"></div>
      <h2></h2>
      <p class="role-text"></p>
      <ul>
        <li>🎯 <b>Ziel:</b> Als Erste*r alle Karten loswerden.</li>
        <li>⬆️ Leg <b>gleich hoch oder höher</b> als die oberste Karte – mehrere Gleiche gehen zusammen.</li>
        <li>🗑️ Kannst du nicht? Dann <b>nimmst du den Stapel</b>.</li>
        <li>🏁 Sobald jemand keine Karten mehr hat, ist Schluss. Abgerechnet wird nach Kartenzahl – wer am meisten hat, ist Letzte*r.</li>
        <li>🤫 Deine Rolle ist <b>geheim</b>. Die anderen sehen sie erst am Ende.</li>
      </ul>
      <button class="skip" id="skip-role">Weiter ▶</button>
    </div>`;
  ov.querySelector('.big-emoji').textContent = role.emoji;
  ov.querySelector('h2').textContent = role.name;
  ov.querySelector('.role-text').textContent = role.short ?? role.text;
  $('skip-role').onclick = () => drawSpecial(v);
  introTimers.push(setTimeout(() => { if (!$('intro').hidden && $('skip-role')) drawSpecial(v); }, 9000));
}

function drawSpecial(v) {
  introTimers.forEach(clearTimeout); introTimers = [];
  const ov = $('intro');
  ov.innerHTML = `
    <div class="intro-step">
      <h2>Deine Special-Karte</h2>
      <div class="case-window"><div class="case-marker"></div><div class="case-strip" id="case-strip"></div></div>
      <div id="drawn-explain" class="explain-big"></div>
      <button class="skip" id="skip-intro" hidden>Los geht's ▶</button>
    </div>`;
  // Kisten-Öffnen: Streifen voller möglicher Specials rauscht vorbei und stoppt bei deiner
  // Nur Karten, die in diesem Spiel wirklich drin sind (Auswahl des Hosts + eigene Bomben)
  const chosen = new Set(v.deckChoice?.specials ?? []);
  const pool = [
    ...Object.entries(CHARACTERS).map(([key, c]) => ({ kind: 'special', key, ...c })),
    ...Object.entries(BASIC_SPECIALS).map(([key, c]) => ({ kind: 'special', key, ...c })),
    ...Object.entries(PLAYER_CARDS).map(([key, c]) => ({ kind: 'special', key, effects: [], ...c })),
  ].filter((c) => chosen.has(c.key));
  pool.push(...(v.customCards ?? []).map((c) => ({ kind: 'special', ...c })));
  if (!pool.length) pool.push(v.drawn);
  const strip = $('case-strip');
  const target = 30;
  const cw = 110, gap = 12;
  for (let i = 0; i < target + 4; i++) {
    const c = i === target ? v.drawn : pool[Math.floor(Math.random() * pool.length)];
    const el = cardEl({ ...c, id: 'i' + i }, arts);
    el.style.setProperty('--card-w', cw + 'px');
    if (i === target) el.classList.add('target');
    strip.append(el);
  }
  const winW = strip.parentElement.clientWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    strip.style.transform = `translateX(${winW / 2 - (target * (cw + gap) + cw / 2) + (Math.random() * 40 - 20)}px)`;
  }));
  const tickInt = setInterval(() => sound.playWheelTick(), 130);
  introTimers.push(setTimeout(() => clearInterval(tickInt), 3200));
  introTimers.push(setTimeout(() => {
    clearInterval(tickInt);
    sound.playCardSound(v.drawn);
    navigator.vibrate?.([60, 40, 120]);
    strip.querySelector('.target')?.classList.add('won');
    const ex = $('drawn-explain');
    ex.innerHTML = '<b></b><span></span>';
    ex.querySelector('b').textContent = `${v.drawn.emoji ?? ''} ${v.drawn.name}${v.drawn.title ? ' · ' + v.drawn.title : ''}${v.drawn.by ? ' (gebaut von ' + v.drawn.by + ')' : ''}`;
    ex.querySelector('span').textContent = cardText(v.drawn);
    $('skip-intro').hidden = false;
    $('skip-intro').onclick = closeIntro;
    introTimers.push(setTimeout(closeIntro, 6000));
  }, 3300));
}
function closeIntro() { introTimers.forEach(clearTimeout); introTimers = []; $('intro').hidden = true; }

// ═════════ Abrechnung & Post-Game Reveal ═════════
function showRanking(v) {
  closeIntro();
  sound.playWin();
  const box = $('ranking');
  box.hidden = false;

  const winner = v.ranking?.[0];
  if (winner?.id === me) {
    vibrate([100, 50, 100, 50, 200]);
  } else {
    vibrate([60, 60, 100]);
  }
  const isWinnerBot = winner?.bot || winner?.name?.startsWith('Bot ');
  const winnerAvatar = winner ? (arts[winner.id]?.avatar || (isWinnerBot ? getBotAvatar(winner.name || winner.id) : null)) : null;
  const isHost = v.host === me;

  let awardsHtml = '';
  if (v.awards && v.awards.length) {
    awardsHtml = `
      <div class="post-game-section">
        <div class="section-title">🎖️ Fun Awards der Runde</div>
        <div class="awards-grid">
          ${v.awards.map((a) => {
            const isMe = a.playerIds?.includes(me);
            return `
              <div class="award-card ${isMe ? 'award-me' : ''}">
                <div class="award-icon">${a.emoji}</div>
                <div class="award-body">
                  <div class="award-title">${a.title}</div>
                  <div class="award-recipient">${a.playerName}${isMe ? ' (Du)' : ''}</div>
                  <div class="award-val">${a.valText}</div>
                  <div class="award-desc">${a.desc}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  const rolesHtml = `
    <div class="post-game-section">
      <div class="section-title">🤫 Enthüllte Rollen</div>
      <div class="roles-reveal-grid">
        ${v.ranking.map((r) => {
          const isBot = r.bot || r.name?.startsWith('Bot ');
          const av = arts[r.id]?.avatar || (isBot ? getBotAvatar(r.name || r.id) : null);
          const role = r.role;
          const isMe = r.id === me;
          const faceStyle = av ? `background-image: url("${av}")` : '';
          const faceContent = av ? '' : r.name.slice(0, 2).toUpperCase();
          return `
            <div class="role-reveal-card ${isMe ? 'role-me' : ''}">
              <div class="role-avatar" style="${faceStyle}">${faceContent}</div>
              <div class="role-reveal-info">
                <div class="role-player-name">${r.name}${isMe ? ' <span class="tag-me">Du</span>' : ''}</div>
                ${role ? `
                  <div class="role-badge"><span class="role-badge-emoji">${role.emoji}</span> <b class="role-badge-name">${role.name}</b></div>
                  <div class="role-passive">${role.text || ''}</div>
                ` : '<div class="role-passive">Keine Rolle</div>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  box.innerHTML = `
    <div class="intro-window post-game-window">
      <div class="post-game-header">
        <div class="confetti-crown">🏆</div>
        <h2>Siegerehrung & Reveal</h2>
      </div>

      ${winner ? `
        <div class="winner-hero">
          <div class="winner-avatar" style="${winnerAvatar ? `background-image: url('${winnerAvatar}')` : ''}">
            ${winnerAvatar ? '' : winner.name.slice(0, 2).toUpperCase()}
          </div>
          <div class="winner-info">
            <div class="winner-title">Sieger*in der Runde</div>
            <div class="winner-name">${winner.name}</div>
            <div class="winner-sub">Hat alle Karten triumphal abgelegt!</div>
          </div>
        </div>
      ` : ''}

      ${awardsHtml}

      ${rolesHtml}

      <div class="post-game-section">
        <div class="section-title">🏁 Endplatzierung</div>
        <ol class="rank"></ol>
      </div>

      <p class="hint">${isHost ? 'Du bist Host – starte die nächste Runde direkt hier oder unten.' : 'Der Host startet gleich die nächste Runde.'}</p>
      <div class="post-game-actions">
        ${isHost ? '<button class="skip host-restart" id="btn-next-round">🚀 Nächste Runde</button>' : ''}
        <button class="skip btn-secondary" id="close-ranking">Zum Tisch</button>
      </div>
    </div>
  `;

  const medals = ['🥇', '🥈', '🥉'];
  v.ranking.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.id === me) li.classList.add('me');
    const last = i === v.ranking.length - 1 && v.ranking.length > 1;
    li.innerHTML = '<span class="pos"></span><span class="who"></span><span class="cnt"></span>';
    li.querySelector('.pos').textContent = i === 0 ? '🏆' : last ? '💩' : medals[i] ?? `${i + 1}.`;
    li.querySelector('.who').textContent = `${r.name}${r.role ? ' · ' + r.role.emoji + ' ' + r.role.name : ''}`;
    li.querySelector('.cnt').textContent = i === 0 ? 'keine Karten!' : `${r.count} Karten`;
    box.querySelector('.rank').append(li);
  });

  const btnNext = box.querySelector('#btn-next-round');
  if (btnNext) {
    btnNext.onclick = () => {
      box.hidden = true;
      $('start')?.click();
    };
  }
  $('close-ranking').onclick = () => { box.hidden = true; };
}

// ═════════ Chat ═════════
const QUICK = ['😂', '🔥', '💀', '👏', '😭', '🥔', 'GG', 'Beeil dich 😴'];
let unread = 0;
for (const q of QUICK) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = q;
  b.onclick = () => socket.emit('chat', q);
  document.querySelector('.chat-quick').append(b);
}
$('chat-btn').onclick = () => { $('chat').hidden = !$('chat').hidden; if (!$('chat').hidden) { unread = 0; showUnread(); $('chat-input').focus(); scrollChat(); } };
$('chat-close').onclick = () => { $('chat').hidden = true; };
$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const t = $('chat-input').value.trim();
  if (t) socket.emit('chat', t);
  $('chat-input').value = '';
};
socket.on('chat-history', (list) => { $('chat-list').innerHTML = ''; list.forEach((m) => addChat(m, false)); });
socket.on('chat', (m) => addChat(m, true));

function addChat(m, live) {
  const li = document.createElement('li');
  if (m.id === me) li.className = 'mine';
  li.innerHTML = '<b></b><span></span>';
  li.querySelector('b').textContent = m.name;
  li.querySelector('span').textContent = m.text;
  $('chat-list').append(li);
  while ($('chat-list').children.length > 60) $('chat-list').firstChild.remove();
  scrollChat();
  if (!live) return;
  if ($('chat').hidden && m.id !== me) { unread++; showUnread(); }
  bubble(m);
}
const scrollChat = () => { $('chat-list').scrollTop = $('chat-list').scrollHeight; };
function showUnread() { $('chat-unread').hidden = !unread; $('chat-unread').textContent = unread > 9 ? '9+' : unread; }
// Sprechblase über dem Kopf der Person am Tisch (überlebt das Neuzeichnen bei jedem Zug)
function bubble(m) {
  bubbles[m.id] = { text: m.text.length > 60 ? m.text.slice(0, 57) + '…' : m.text, until: Date.now() + 4500 };
  if (view) render();
  setTimeout(() => view && render(), 4600);
}

// ═════════ Großes Effekt-Banner (z. B. Münzwurf) ═════════
let lastFxId = null;
function showFx(fx) {
  if (!fx || fx.id === lastFxId) return;
  const first = lastFxId === null;
  lastFxId = fx.id;
  if (first) return;                 // beim Beitreten nicht alte Banner zeigen
  const el = $('fx-banner');
  el.textContent = fx.text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  navigator.vibrate?.([40, 30, 40]);
}
