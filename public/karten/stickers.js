// Sticker aus der WhatsApp-Gruppe „Coding“ (22.10.2026). Dateien: /karten/sticker/<id>.webp
// mood steuert, wo sie im Spiel auftauchen:
//   rage  – jemand muss den Stapel nehmen / strafziehen und regt sich auf
//   sad   – jemand verliert oder sitzt auf einem Riesenstapel
//   win   – Sieg, starker Zug
//   love  – nett gemeint
//   laugh – Schadenfreude der anderen
//   misc  – Kult, nur für Chat & Profilbild
export const STICKERS = [
  { id: '52', name: 'Franzosen!!!', mood: 'rage' },
  { id: '22', name: 'Rote Augen', mood: 'rage' },
  { id: '24', name: 'Starr-Blick', mood: 'rage' },
  { id: '06', name: 'Patrick', mood: 'rage' },
  { id: '36', name: 'Wütender Schwamm', mood: 'rage' },
  { id: '13', name: 'Schock', mood: 'rage' },
  { id: '38', name: 'Schockkatze', mood: 'rage' },
  { id: '23', name: 'Seitenblick-Affe', mood: 'laugh' },
  { id: '18', name: 'Katzen-Starren', mood: 'laugh' },
  { id: '29', name: 'Moai', mood: 'laugh' },
  { id: '09', name: 'Thomas', mood: 'laugh' },
  { id: '14', name: 'Lachtränen', mood: 'laugh' },
  { id: '19', name: 'Weinende Katze', mood: 'sad' },
  { id: '49', name: 'Weinender Thaddäus', mood: 'sad' },
  { id: '05', name: 'Traurig grün', mood: 'sad' },
  { id: '01', name: 'Lama', mood: 'sad' },
  { id: '50', name: 'Facepalm im Dunkeln', mood: 'sad' },
  { id: '11', name: 'Ameise geht', mood: 'sad' },
  { id: '39', name: 'Daumen hoch', mood: 'win' },
  { id: '08', name: 'Brille hoch', mood: 'win' },
  { id: '10', name: 'Steve', mood: 'win' },
  { id: '30', name: 'Hacker-Gorilla', mood: 'win' },
  { id: '37', name: 'Herz brennt', mood: 'win' },
  { id: '53', name: 'Selbstzufrieden', mood: 'win' },
  { id: '34', name: 'Genau mein Plan', mood: 'win' },
  { id: '55', name: 'Cooles M&M', mood: 'win' },
  { id: '40', name: 'Erschaffung', mood: 'win' },
  { id: '03', name: 'Blume für dich', mood: 'love' },
  { id: '04', name: 'Herz', mood: 'love' },
  { id: '51', name: 'Rote Bäckchen', mood: 'love' },
  { id: '57', name: 'Enten-Deal', mood: 'love' },
  { id: '35', name: 'Vögelchen', mood: 'love' },
  { id: '54', name: 'Zu Fielmann', mood: 'misc' },
  { id: '33', name: 'Füße Lutschen', mood: 'misc' },
  { id: '02', name: 'Nur Cola heute', mood: 'misc' },
  { id: '12', name: 'Hund', mood: 'misc' },
  { id: '15', name: 'Thaddäus', mood: 'misc' },
  { id: '16', name: 'Fischturm', mood: 'misc' },
  { id: '17', name: 'Bauch', mood: 'misc' },
  { id: '28', name: 'Katze', mood: 'misc' },
  { id: '32', name: 'Tänzer', mood: 'misc' },
  { id: '07', name: 'Ronaldo', mood: 'misc' },
  { id: '31', name: 'Merz', mood: 'misc' },
  { id: '47', name: 'Trump mit Öhrchen', mood: 'misc' },
  { id: '48', name: 'Trump mit Tape', mood: 'misc' },
  { id: '20', name: 'Club 1', mood: 'misc' },
  { id: '21', name: 'Club 2', mood: 'misc' },
  { id: '25', name: 'Club 3', mood: 'misc' },
  { id: '27', name: 'Club 4', mood: 'misc' },
  { id: '41', name: 'Club 5', mood: 'misc' },
  { id: '42', name: 'Club 6', mood: 'misc' },
  { id: '43', name: 'Club 7', mood: 'misc' },
  { id: '56', name: 'Club 8', mood: 'misc' },
];
export const STICKER_IDS = new Set(STICKERS.map((s) => s.id));
export const stickerUrl = (id) => `/karten/sticker/${id}.webp`;
export const randomSticker = (...moods) => {
  const pool = STICKERS.filter((s) => moods.includes(s.mood));
  return pool[Math.floor(Math.random() * pool.length)];
};
// Chat-Nachricht „:st:52:“ = Sticker 52
export const stickerMsg = (id) => `:st:${id}:`;
export const parseSticker = (text) => {
  const m = /^:st:(\d\d):$/.exec(String(text ?? ''));
  return m && STICKER_IDS.has(m[1]) ? m[1] : null;
};
