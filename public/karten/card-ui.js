import { cardText, CHARACTERS, COLOR_ELEMENTS, BASIC_SPECIALS } from '/shared/cards.js';
import { SERVER } from '/js/net.js';

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
  if (c.fullArt) el.classList.add('full');
  if (isCustom) el.classList.add('custom');
  if (isChar) el.classList.add('character');
  const art = document.createElement('div');
  art.className = 'art';

  // Mitgelieferte Bilder (/karten/…) kommen von der Webseite, hochgeladene vom Spielserver
  const src = isCustom
    ? (arts[c.owner]?.art || c.art)
    : (typeof c.art === 'string' && (c.art.startsWith('/karten/') ? c.art : SERVER + c.art));

  if (src) {
    // Erst prüfen, ob das Bild existiert – bei Erfolg Text entfernen und Hintergrund setzen
    const probe = new Image();
    probe.onload = () => {
      art.style.backgroundImage = `url("${src}")`;
      art.textContent = '';
      el.classList.add('has-art');
    };
    probe.src = src;
  }
  art.textContent = c.emoji || (isCustom ? '🎨' : '✨');

  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<b></b><i></i>`;
  label.querySelector('b').textContent = c.title ? `${c.name} · ${c.title}` : c.name;

  // Bei Full-Art Karten kein sperriges "Passiv (aus der Hand): " auf die Karte drucken, um das Artwork nicht zu verdecken
  const rawText = cardText(c);
  const displayText = c.fullArt ? rawText.replace(/^Passiv\s*(\([^)]*\))?:\s*/i, '') : rawText;
  label.querySelector('i').textContent = displayText;
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

  if (isPassive) {
    el.classList.add('passive-guard');
    // Kein störendes card-shield-badge mehr, damit das Artwork frei bleibt!
  }

  const desc = cardText(c);
  const byText = c.by ? ` (von ${c.by})` : '';
  const titleText = c.title ? ` · ${c.title}` : '';
  el.title = `${c.emoji || (isCustom ? '💣' : '✨')} ${c.name}${titleText}${byText}\n${desc}`;
  return el;
}
