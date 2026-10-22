import { cardText, CHARACTERS, COLOR_ELEMENTS } from '/shared/cards.js';
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
  const el = document.createElement('div');
  el.className = 'card ' + c.kind;
  el.dataset.id = c.id;

  if (c.kind === 'number') {
    const elem = COLOR_ELEMENTS?.[c.color] || { name: '', element: 'neutral', icon: '', gem: '' };
    el.classList.add('element-' + (elem.element || 'neutral'));
    el.style.setProperty('--c', c.color);
    el.title = `${c.value} · ${elem.label || elem.name || c.color}`;
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
  if (c.fullArt) el.classList.add('full');
  if (isCustom) el.classList.add('custom');
  if (isChar) el.classList.add('character');
  const art = document.createElement('div');
  art.className = 'art';
  // Mitgelieferte Bilder (/karten/…) kommen von der Webseite, hochgeladene vom Spielserver
  const sticker = !isCustom && !isChar && !c.art && STICKER_ART[c.key];
  if (sticker) el.classList.add('sticker-art');
  const src = sticker ? stickerUrl(sticker) : isCustom ? (arts[c.owner]?.art || c.art) : c.art && (c.art.startsWith('/karten/') ? c.art : SERVER + c.art);
  if (src) {
    // Erst prüfen, ob das Bild existiert – sonst bleibt das Emoji stehen
    const probe = new Image();
    probe.onload = () => { art.style.backgroundImage = `url("${src}")`; art.textContent = ''; };
    probe.src = src;
  }
  art.textContent = c.emoji || (isCustom ? '💣' : '✨');
  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<b></b><i></i>`;
  label.querySelector('b').textContent = c.title ? `${c.name} · ${c.title}` : c.name;
  label.querySelector('i').textContent = cardText(c);
  el.append(art, label);

  const desc = cardText(c);
  const byText = c.by ? ` (von ${c.by})` : '';
  const titleText = c.title ? ` · ${c.title}` : '';
  el.title = `${c.emoji || (isCustom ? '💣' : '✨')} ${c.name}${titleText}${byText}\n${desc}`;
  return el;
}
