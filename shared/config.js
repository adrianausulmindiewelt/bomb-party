// Diese Datei laden Server UND Browser.
// Hier stellt ihr Branding und Spielregeln ein – ohne den Rest des Codes anzufassen.

export const BRAND = {
  title: 'BOMB PARTY',              // Spielname – ändert ihn!
  tagline: 'Spiel dich selbst.',
  colors: {
    background: '#14121f',
    floor: '#2b2a45',
    floorAlt: '#302f4d',
    wall: '#4b4870',
    wallTop: '#6a66a0',
    crate: '#c98a3d',
    crateEdge: '#8f5d22',
    flame: '#ffb020',
    flameCore: '#fff3c4',
    accent: '#ff3d7f',
    text: '#ffffff',
  },
  // Farben, die Spieler*innen sich aussuchen können
  playerColors: ['#ff3d7f', '#3dc6ff', '#ffd23d', '#5cff8a', '#b47cff', '#ff8a3d', '#ffffff', '#3dffe0'],
};

export const GAME = {
  cols: 15,               // Spielfeld-Breite in Kacheln (ungerade lassen!)
  rows: 13,               // Spielfeld-Höhe in Kacheln (ungerade lassen!)
  maxPlayers: 8,
  tickRate: 30,           // Server-Updates pro Sekunde
  crateDensity: 0.7,      // Anteil Kisten auf freien Feldern (0–1)
  bombFuse: 2.5,          // Sekunden bis zur Explosion
  flameTime: 0.5,         // Sekunden, die das Feuer brennt
  roundOverTime: 3,       // Pause zwischen Runden
  start: { bombs: 1, range: 2, speed: 3.5 },   // Startwerte jeder Figur
  max:   { bombs: 8, range: 8, speed: 6.5 },   // Obergrenzen durch Power-ups
};

// Kachel-Typen im Spielfeld
export const TILE = { EMPTY: 0, WALL: 1, CRATE: 2 };

// Power-ups: was es gibt und wie sie aussehen
export const POWERUPS = {
  bomb:  { icon: '💣', label: '+1 Bombe' },
  fire:  { icon: '🔥', label: '+1 Reichweite' },
  speed: { icon: '👟', label: 'schneller' },
};

// Wo läuft der Spielserver? Leer = gleiche Adresse wie die Webseite (lokal, Tunnel).
// Auf Vercel liegt nur die Webseite – der Server läuft auf Render.
export const GAME_SERVER_URL = 'https://attempting-reaction-chance-acquire.trycloudflare.com'; // übergangsweise Laptop-Tunnel → später Render
