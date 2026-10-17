import { cardText, CHARACTERS, COLOR_ELEMENTS } from '/shared/cards.js';
import { SERVER } from '/js/net.js';

export function cardEl(c, arts = {}) {
  if (!c) return document.createElement('div');
  const el = document.createElement('div');
  el.className = 'card ' + (c.kind || '');
  el.dataset.id = c.id;

  if (c.kind === 'number') {
    const elem = COLOR_ELEMENTS?.[c.color] || { name: '', element: 'neutral', icon: '', gem: '' };
    el.classList.add('element-' + (elem.element || 'neutral'));
    el.style.setProperty('--c', c.color || '#fff');
    el.title = `${c.value} · ${elem.label || elem.name || c.color || ''}`;
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
  const src = isCustom ? (arts[c.owner]?.art || c.art) : (typeof c.art === 'string' && (c.art.startsWith('/karten/') ? c.art : SERVER + c.art));
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
