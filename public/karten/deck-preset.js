import { cleanDeckChoice } from '../../shared/cards.js';

const KEY = 'karten-deck-preset-v1';
export function loadDeckPreset(storage = localStorage) {
  try { return cleanDeckChoice(JSON.parse(storage.getItem(KEY))); }
  catch { return null; }
}
export function saveDeckPreset(choice, storage = localStorage) {
  const clean = cleanDeckChoice(choice);
  if (!clean) return false;
  try { storage.setItem(KEY, JSON.stringify(clean)); return true; }
  catch { return false; }
}
