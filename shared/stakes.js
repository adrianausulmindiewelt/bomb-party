// Einsatz der Runde: Vor dem Start stimmen alle am Tisch ab, was der Gewinner bekommt
// und was der Verlierer machen muss. Eigene Ideen kann jeder dazuschreiben.
// Alles rein sozial – am Spiel selbst ändert der Einsatz nichts.

export const STAKE_LIMITS = {
  textMax: 80,          // Zeichen pro Idee
  perPlayer: 3,         // eigene Ideen pro Person und Kategorie
  totalCustom: 24,      // eigene Ideen pro Tisch und Kategorie
};

export const STAKE_DEFAULTS = {
  reward: [
    '👑 Trägt bis zum nächsten Spiel den Titel „Club-Champion“',
    '🎯 Sucht die Bestrafung für die nächste Runde aus',
    '🎤 Wählt das Thema für den Vortrag des Verlierers',
    '🎵 Darf beim nächsten Clubabend den ersten Song aussuchen',
    '👏 Bekommt Standing Ovations von allen am Tisch',
    '📜 Darf eine eigene Bonus-Regel für die nächste Runde erfinden',
    '🍫 Erste Wahl bei den Snacks',
    '📸 Ehrenplatz in der Club-Story',
    '💬 Darf dem Verlierer einen Satz für den Gruppenchat diktieren',
    '🪑 Sucht sich beim nächsten Clubabend den besten Platz aus',
  ],
  punish: [
    '📱 1 Minute Brainrot gucken – ohne wegzuschauen',
    '📱 2 Minuten Brainrot gucken – ohne wegzuschauen',
    '🎓 Hält beim nächsten Clubabend einen Blitz-Workshop',
    '🎤 Hält beim nächsten Clubabend einen lustigen Kurzvortrag (Thema vom Gewinner)',
    '🥔 Sprachnachricht in den Gruppenchat: Liebeserklärung an eine Kartoffel',
    '💃 15 Sekunden Siegestanz für den Gewinner',
    '🙇 Macht jedem am Tisch ein ehrliches Kompliment',
    '🤡 Spielt die nächste Runde mit komischer Stimme',
    '😶 Darf in der nächsten Runde im Chat nur Emojis schreiben',
    '🖼️ Gewinner sucht 24 Stunden lang dein Profilbild aus',
    '🎶 Singt 20 Sekunden ein Lied nach Wahl des Gewinners',
    '🏋️ 10 Liegestütze (oder 20 Kniebeugen)',
    '👑 Erklärt 1 Minute lang als „Ausreden-König“, warum er verloren hat',
  ],
};

export const STAKE_KINDS = ['reward', 'punish'];
