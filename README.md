# 🃏 Club Bombe Spiel · 💣 Bomb Party

**Von Wien bis Berlin – ClubApp.** Zwei Multiplayer-Browserspiele, die wir im Workshop gemeinsam bauen.

👉 **Spielen:** https://bomb-party-henna.vercel.app/ (Bomberman: /bomb-party/) · **Mitmachen ohne Code:** [docs/MITMACHEN.md](docs/MITMACHEN.md)

## Bomb Party
Prinzip: Bomberman. Kisten sprengen, Power-ups sammeln, die anderen erwischen.
Der Clou: **Du spielst dich selbst.** Foto hochladen, und dein Gesicht ist die Spielfigur.

- 🌐 läuft im Browser: Laptop, Tablet, Handy, ohne Installation
- 🎮 Tastatur (WASD/Pfeile + Leertaste), **Controller** (Stick + A) oder **Handy-Touch**
- 👥 bis zu 8 Spieler*innen pro Raum, beliebig viele Räume (`?raum=xyz`)
- ⚡ kein Build-Schritt: Datei speichern → Seite neu laden → Änderung sehen

## Loslegen (5 Minuten)

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20 und [Git](https://git-scm.com).

```bash
git clone https://github.com/adrianausulmindiewelt/bomb-party.git
cd bomb-party
npm install
npm run dev
```

Dann im Browser **http://localhost:3000** öffnen.
Das Terminal zeigt außerdem eine Adresse wie `http://192.168.x.x:3000`. Mit der können alle **im selben WLAN** mitspielen, auch mit dem Handy.

> Zum Testen allein: zwei Browserfenster nebeneinander öffnen.

## Wo ist was?

| Datei | Was drin ist | Für wen |
|---|---|---|
| `shared/config.js` | **Name, Farben, Spielregeln** (Tempo, Bomben, Feldgröße …) | alle, ohne Vorwissen |
| `server/game.js` | Die komplette Spiellogik (Bewegung, Bomben, Runden) | Logik-Fans |
| `public/js/render.js` | Wie alles aussieht (Zeichnen aufs Canvas) | Design-Leute |
| `public/js/input.js` | Tastatur, Controller, Touch | Steuerungs-Nerds |
| `public/js/main.js` | Lobby, Verbindung, Spiel-Schleife | — |
| `server/index.js` | Webserver + Multiplayer (Socket.io) | — |
| `test/` | Automatische Tests (`npm test`) | alle vor dem Pull Request |

**So funktioniert Multiplayer hier:** Die Browser schicken nur „ich drücke links/Bombe“.
Der Server rechnet das Spiel 30× pro Sekunde und schickt allen den neuen Zustand.
Die Browser zeichnen ihn nur. Deshalb steckt die Spiellogik **ausschließlich** in `server/game.js`.

## Mitmachen

Siehe **[CONTRIBUTING.md](CONTRIBUTING.md)**. Kurzfassung: Issue aussuchen → Branch → Pull Request.
Ideen für später: **[docs/IDEEN.md](docs/IDEEN.md)**.

## Online stellen (alle spielen von überall)

Das Spiel braucht einen Server, der WebSockets kann. GitHub Pages reicht deshalb **nicht**.
Am einfachsten geht es mit [Render](https://render.com): Repo verbinden. Die Datei `render.yaml` ist schon da, der Free-Plan reicht.
Alternativen: Railway, Fly.io, ein eigener VPS.

## Datenschutz

Fotos werden **nur im Arbeitsspeicher** des Servers gehalten und an die Mitspielenden im selben Raum geschickt.
Sie werden nirgends gespeichert und landen nie im Repo. Verlässt jemand das Spiel, ist das Foto weg.
Im Browser bleibt das eigene Foto im `localStorage`, damit man es nicht jedes Mal neu hochladen muss.

Lizenz: MIT
