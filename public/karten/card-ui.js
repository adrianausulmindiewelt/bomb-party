import { cardText, CHARACTERS, COLOR_ELEMENTS, BASIC_SPECIALS } from '/shared/cards.js';
import { SERVER } from '/js/net.js';
import { stickerUrl } from './stickers.js';

// Spezialkarten ohne eigenes Bild bekommen einen passenden Club-Sticker (WhatsApp-Gruppe „Coding“)
const STICKER_ART = {
  reset: '53', burn: '37', lower: '13', reverse: '06', skip: '54', kartoffel: '24', zwillinge: '57', spiegel: '18',
  schwarzes_loch: '50', zeitstopp: '29', dieb: '23', gluecklich: '14', traurig: '49', gluecksspiel: '10', portal: '40',
  phoenix: '05', himmelszorn: '22', zeitschleife: '09', erdbeben: '38', kettenfluch: '36', pizza_hunger: '17',
  fee_trick: '35', cookie_chaos: '32',
};

export function cardEl(c, arts = {}) {
  if (!c) return document.createElement('div');
  const el = document.createElement('div');
  el.className = 'card ' + (c.kind || '');
  el.dataset.id = c.id;
  if (c.kind === 'number') {
    const elem = COLOR_ELEMENTS?.[c.color] || { name: '', element: 'neutral', icon: '', gem: '', label: 'Zahlenkarte' };
    el.classList.add('element-' + (elem.element || 'neutral'));
    el.style.setProperty('--c', c.color || '#fff');
    el.title = `${elem.icon ? elem.icon + ' ' : ''}${elem.label || elem.name || 'Zahlenkarte'} (${c.value})`;
    el.innerHTML = `
      <div class="corner tl"><span class="corner-val">${c.value}</span><span class="corner-icon">${elem.icon}</span></div>
      <div class="card-center">
        <span class="elem-watermark">${elem.icon}</span>
        <span class="v">${c.value}</span>
        <span class="elem-name">${elem.gem}</span>
      </div>
      <div class="corner br"><span class="corner-val">${c.value}</span><span class="corner-icon">${elem.icon}</span></div>
    `;
    return el;
  }

  // Special-Karte: Bild oben, Name + Fähigkeit unten
  const isCustom = c.key === 'custom';
  const isChar = !!CHARACTERS[c.key];
  if (isCustom) el.classList.add('custom');
  if (isChar) el.classList.add('character');
  const art = document.createElement('div');
  art.className = 'art';
  // Mitgelieferte Bilder (/karten/…) kommen von der Webseite, hochgeladene vom Spielserver
  const sticker = !isCustom && !isChar && !c.art && STICKER_ART[c.key];
  if (sticker) el.classList.add('sticker-art');
  const src = sticker ? stickerUrl(sticker) : isCustom ? (arts[c.owner]?.art || c.art) : (typeof c.art === 'string' && (c.art.startsWith('/karten/') ? c.art : SERVER + c.art));
  if (src) {
    // Erst prüfen, ob das Bild existiert – erst bei erfolgreichem Laden auf Vollbild schalten
    const probe = new Image();
    probe.onload = () => {
      art.style.backgroundImage = `url("${src}")`;
      art.textContent = '';
      if (c.fullArt) el.classList.add('full');
    };
    probe.src = src;
  }
  art.textContent = c.emoji || (isCustom ? '🎨' : '✨');
  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<b></b><i></i>`;
  label.querySelector('b').textContent = c.title ? `${c.name} · ${c.title}` : c.name;
  label.querySelector('i').textContent = cardText(c);
  el.append(art, label);

  // 🏷️ Category-Corner oben rechts (dezent & kompakt, verdeckt kein Zentrums-Motiv)
  const isPassive = ['aegis', 'mirror', 'phoenix', 'luckyJester'].includes(c.ability);
  const isBasic = !!BASIC_SPECIALS?.[c.key];
  const categoryGlyph = isCustom ? '🎨' : isChar ? '🎭' : isPassive ? '🛡️' : isBasic ? '⚡' : '✨';
  const categoryTitle = isCustom ? 'Spieler-Karte' : isChar ? 'Charakterkarte' : isPassive ? 'Passiver Schutz' : isBasic ? 'Aktionskarte' : 'Spezialkarte';

  const cornerTr = document.createElement('div');
  cornerTr.className = 'corner tr special-corner';
  cornerTr.title = categoryTitle;
  cornerTr.innerHTML = `<span class="corner-icon">${categoryGlyph}</span>`;
  el.append(cornerTr);

  if (['aegis', 'mirror', 'phoenix', 'luckyJester'].includes(c.ability)) {
    el.classList.add('passive-guard');
    const badge = document.createElement('span');
    badge.className = 'card-shield-badge';
    badge.textContent = '🛡️ Passiv';
    badge.title = 'Passiver Schutz: Löst bei Gefahr automatisch aus deiner Hand aus!';
    el.append(badge);
  }

  const desc = cardText(c);
  const byText = c.by ? ` (von ${c.by})` : '';
  const titleText = c.title ? ` · ${c.title}` : '';
  el.title = `${c.emoji || (isCustom ? '💣' : '✨')} ${c.name}${titleText}${byText}\n${desc}`;
  return el;
}
