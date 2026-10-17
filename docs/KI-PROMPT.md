# Prompt zum Mitentwickeln

Diesen Text komplett in deine KI (Claude Code, Cursor, …) kopieren und oben dein Feature eintragen.
Der gleiche Text steht auf der Startseite hinter dem Knopf „Prompt kopieren“.

```text
Ich möchte beim „Club Bombe Spiel“ mitentwickeln:
https://github.com/adrianausulmindiewelt/bomb-party

Mein Feature: <HIER BESCHREIBEN, z. B. „neue Karte ‚Doppelzug': …“>

Bitte arbeite so:
1. Repo klonen (oder meinen Fork, falls ich keine Schreibrechte habe), dann `npm install`.
2. Vom aktuellen `main` einen neuen Branch anlegen: `<meinname>/<kurzes-feature>`.
   Niemals direkt auf `main` und niemals auf fremde Branches pushen.
3. Zuerst README.md, CONTRIBUTING.md und docs/MITMACHEN.md lesen und daran halten.

TABU – diese Dinge NIE ändern, auch nicht „nur zum Testen“:
- `GAME_SERVER_URL` in `shared/config.js` (Adresse des Live-Servers)
- den Port in `server/index.js` (bleibt 3000)
- `vercel.json`, `render.yaml`, `.github/`, `package-lock.json` (außer ich brauche wirklich ein neues Paket)
- keine API-Keys, Passwörter oder `.env`-Dateien committen
Zum Testen: `npm run dev` und http://localhost:3000 öffnen. Dafür braucht es keinen Tunnel und keine Config-Änderung.

Neue Spezialkarte? Alles in `shared/cards.js`:
- Karte in `PLAYER_CARDS` eintragen, Logik in `server/cards/game.js`
- in `CARD_SHORT` einen Satz, was wirklich passiert (für Karte und Kartenauswahl)
- in `VOICE_LINES` einen kurzen, witzigen Ansage-Satz (die Audiodatei erzeugt Adrian später)
- NICHT in `DEFAULT_DECK` aufnehmen – der Host schaltet neue Karten selbst dazu

Regeln für den Code:
- Spiellogik nur auf dem Server (`server/`), der Browser zeigt nur an.
- Der Server darf nie abstürzen: Rechne damit, dass Werte fehlen oder `null` sind, und prüfe das vorher.
- Bestehende Karten und Funktionen nicht umbauen, nur das eigene Feature hinzufügen.
- Für das neue Feature mindestens einen Test in `test/` schreiben.

Bevor du fertig bist:
- `npm test` muss komplett grün sein. Zusätzlich 2 Browserfenster mit localhost:3000 öffnen und eine Runde spielen.
- `git diff main --stat` zeigen und prüfen, dass KEINE der Tabu-Dateien geändert ist.
- Einen kleinen Pull Request gegen `main` öffnen (ein Feature pro PR), mit Beschreibung, was er macht und wie man es testet.
```
