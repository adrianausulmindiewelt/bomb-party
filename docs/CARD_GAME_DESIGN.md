# 🃏 TOPP DAS! — Ludische Spieldesign- & Didaktik-Leitplanken

Dieses Dokument hält die verbindlichen Design- und Architekturprinzipien für das Kartenspiel (*TOPP DAS!*) und zukünftige Minigames fest, basierend auf den Kern-Entscheidungen von NoRevanell.

---

## 1. Das Freiwilligkeits- & Pacing-Axiom
- **Keine Zwangskreation:** Das Erstellen neuer Karten darf niemals eine verpflichtende Bedingung sein, um am Spiel teilzunehmen. Das Spiel muss standardmäßig mit dem bestehenden Kartendeck flüssig spielbar sein.
- **Kreative Option:** Das Hinzufügen eigener Karten ist ein mächtiges, kreatives Feature, bleibt aber stets freiwillig, um den Spielfluss und individuelle Spielstile nicht zu hemmen.

---

## 2. Vertrags-Treue & Aktives Balancing (Anti-Strafen-Doktrin)
- **Vertragstreue bei Rollen:** Jede Rolle muss exakt die Effekte und Fähigkeiten ausführen, die im Text versprochen werden (z. B. Erzmagier zieht verlässlich 3 Startkarten).
- **Aktive Ressourcen statt passiver Strafen:** Wenn Rollen (wie der Nekromant) balanciert werden, dürfen sie nicht durch rein passive Nachteile (wie erzwungenes Kartenziehen) bestraft werden, da sich dies demotivierend anfühlt. Stattdessen werden **aktive taktische Entscheidungen** etabliert:
  - *Beispiel Nekromant (Seelen-Opfer):* Um eine Karte gezielt aus dem Friedhof zu beschwören, muss aktiv eine eigene Handkarte geopfert werden.

---

## 3. Didaktische Transparenz-Architektur
- **Keine Black Boxes:** Alle Spielmechaniken müssen für alle Spieler – insbesondere für neurodivergente und neue Clubmitglieder – sofort einsehbar sein.
- **Dynamischer Live-Almanach:** Spontan im Spiel hinzugefügte Karten werden automatisch und in Echtzeit in den Almanach integriert und verfügen über Hover-Tooltips.
- **Echtzeit-Zustände:**
  - Der Füllstand des Nachziehstapels wird live als 3D-Deckcounter angezeigt.
  - Ketten- und Farbreaktionen (Farb-Resonanz, Farb-Überladung) sind im Almanach und über den Ketten-Banner (`triggerChainEvent`) transparent nachvollziehbar.

---

## 4. Anti-Bloat-Prinzip (Game Flow > Spreadsheet Math)
- **Keine Tabellenrechnerei:** Wenn einfache Handkarten-Logik und Zyklen ein Problem organisch lösen, werden keine künstlichen Schwellenwerte oder komplexen Berechnungen eingeführt.
- **Kontinuierliche Zyklen:** Zählerketten (wie Farbüberladungen) setzen sich nach dem Auslösen auf 1 zurück (nicht auf 0), um tote Runden zu vermeiden und sofortige Anschluss-Resonanzen zu ermöglichen.
