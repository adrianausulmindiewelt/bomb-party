// 🤖 Prozedurale Bot-Avatare für das Club Bombe Kartenspiel.
// Erzeugt klare, unüberladene Roboter-Köpfe mit einheitlicher Mimik,
// aber individuellen, sofort unterscheidbaren Kopffarben und Antennen-Pinökeln.

const BOT_THEMES = [
  { name: 'cyan',     primary: '#00d2ff', dark: '#006b99', accent: '#3df0ff' }, // Bot 1
  { name: 'crimson',  primary: '#ff3366', dark: '#991536', accent: '#ff7090' }, // Bot 2
  { name: 'gold',     primary: '#ffcc00', dark: '#997a00', accent: '#ffe066' }, // Bot 3
  { name: 'emerald',  primary: '#00e676', dark: '#008040', accent: '#69f0ae' }, // Bot 4
  { name: 'purple',   primary: '#b366ff', dark: '#6820b3', accent: '#d49eff' }, // Bot 5
  { name: 'orange',   primary: '#ff8800', dark: '#995200', accent: '#ffaa44' }, // Bot 6
  { name: 'pink',     primary: '#ff3d9a', dark: '#991557', accent: '#ff77be' }, // Bot 7
  { name: 'titanium', primary: '#90a4ae', dark: '#37474f', accent: '#cfd8dc' }, // Bot 8
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function getBotTheme(nameOrId = 'Bot 1') {
  const match = String(nameOrId).match(/\d+/);
  if (match) {
    const idx = (parseInt(match[0], 10) - 1) % BOT_THEMES.length;
    return BOT_THEMES[idx >= 0 ? idx : 0];
  }
  const idx = hashString(String(nameOrId)) % BOT_THEMES.length;
  return BOT_THEMES[idx];
}

export function getBotAvatar(nameOrId = 'Bot 1') {
  const theme = getBotTheme(nameOrId);
  const gradId = `botgrad-${theme.name}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${theme.primary}" />
      <stop offset="100%" stop-color="${theme.dark}" />
    </linearGradient>
  </defs>
  <!-- Runder Hintergrund / Rahmen -->
  <circle cx="50" cy="50" r="48" fill="#18152b" stroke="${theme.primary}" stroke-width="2.5" />

  <!-- Oberer Pinökel: Antennenstab mit leuchtender Kugel -->
  <line x1="50" y1="26" x2="50" y2="15" stroke="${theme.accent}" stroke-width="3.5" stroke-linecap="round" />
  <circle cx="50" cy="13" r="5" fill="${theme.accent}" stroke="#ffffff" stroke-width="1.5" />

  <!-- Seitliche Ohren / Schraubbolzen -->
  <rect x="18" y="46" width="6" height="14" rx="2" fill="${theme.accent}" />
  <rect x="76" y="46" width="6" height="14" rx="2" fill="${theme.accent}" />

  <!-- Roboter-Kopf (Chassis mit Farbverlauf) -->
  <rect x="23" y="26" width="54" height="48" rx="10" fill="url(#${gradId})" stroke="#121020" stroke-width="2" />

  <!-- Dunkler Bildschirm / Gesichtsbereich -->
  <rect x="28" y="32" width="44" height="36" rx="6" fill="#12101e" />

  <!-- Augen -->
  <circle cx="39" cy="46" r="5.5" fill="#ffffff" />
  <circle cx="39" cy="46" r="3" fill="${theme.accent}" />
  <circle cx="40.5" cy="44.5" r="1.2" fill="#ffffff" />

  <circle cx="61" cy="46" r="5.5" fill="#ffffff" />
  <circle cx="61" cy="46" r="3" fill="${theme.accent}" />
  <circle cx="62.5" cy="44.5" r="1.2" fill="#ffffff" />

  <!-- Mund: Lautsprecher-Gitter -->
  <rect x="37" y="58" width="26" height="5" rx="2.5" fill="#26233d" />
  <line x1="42" y1="58.5" x2="42" y2="62.5" stroke="${theme.accent}" stroke-width="1.2" />
  <line x1="47" y1="58.5" x2="47" y2="62.5" stroke="${theme.accent}" stroke-width="1.2" />
  <line x1="52" y1="58.5" x2="52" y2="62.5" stroke="${theme.accent}" stroke-width="1.2" />
  <line x1="57" y1="58.5" x2="57" y2="62.5" stroke="${theme.accent}" stroke-width="1.2" />
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
