# Gipfelrausch

3D-Ski-Arcade im Browser: Three.js, ohne Build-Schritt.

## Starten

Im Ordner `Game` ein Terminal öffnen:

```bash
python3 -m http.server 5173
```

Dann im Browser **http://localhost:5173** öffnen. Wegen der ES-Module funktioniert ein Doppelklick auf `index.html` nicht.

## Modi

| Modus | Worum es geht |
|---|---|
| Zeitfahren | Bestzeit jagen, dein Ghost fährt mit, Medaillen Bronze bis Platin |
| Bot-Rennen | 1–6 Bots mit eigenem Fahrstil, drei Schwierigkeitsstufen |
| Slalom | Durch alle Tore, jedes verpasste Tor kostet 3 s |
| Freestyle | Zwei Snowparks mit Kickern und Rails, Punkte und Combos |
| Lawinen-Flucht | Endlose Strecke, die Lawine wird immer schneller |
| Online | Raum erstellen, Code oder Link teilen, bis zu 8 Spieler |

## Karten

Fünf Karten (Edelweiß-Kar, Sonnenalm, Zirbenwald, Wolfsschlucht, Gletscherkante), jede ein breiter Hang mit mehreren Wegen nach unten. Immer wieder teilt sich die Piste durch Wald- und Felsinseln in zwei oder drei Wege, jeder mit eigenem Charakter:

| Weg | Was dich erwartet |
|---|---|
| Carving-Piste | präpariert, Wellen, am schnellsten |
| Kicker-Linie | zwei, drei Schanzen für Airtime und Tricks |
| Buckelpiste | holprig, aber sicher |
| Felsfeld | Felsen mit einer freien Linie dazwischen |
| Waldschneise | Bäume, eine geschwungene Gasse führt durch |
| Halfpipe-Rinne | Wände links und rechts zum Hochfahren |

Dazu kommen freie Hänge (eigene Linie suchen), Felsterrassen (springen oder die Rampe am Rand), Gletscherspalten und Bäche (Brücke oder Sprung), gefrorene Seen und Almwiesen. Bots nehmen unterschiedliche Wege.

Dazu kommen fünf Wetterlagen (Sonne, Sonnenuntergang, Nacht mit Stirnlampe, Schneesturm mit Wind, Nebel), drei Tages-Challenges pro Tag und eine lokale Bestenliste.

## Auf dem Handy

- **Lenken:** links auf dem Bildschirm wischen (stufenlos). In den Einstellungen gibt es auch *Neigen* (Handy wie ein Lenkrad kippen) oder *Tasten*.
- **Rechts im Daumenbogen:** Sprung, Hocke (in der Luft Frontflip), Bremse (Backflip), Boost und zwei Trick-/Grab-Tasten.
- Grafik steht auf *Auto*: auf Handys ohne Schatten und Kantenglättung, die Auflösung regelt sich nach der Bildrate.
- Im Hochformat wird das Sichtfeld breiter; quer gehalten sieht man am meisten.
- Über *Zum Home-Bildschirm* läuft das Spiel als App im Vollbild. Wechselt man die App, pausiert das Spiel.

## Steuerung

| Taste | Am Boden | In der Luft |
|---|---|---|
| ← → / A D | Lenken (im Rhythmus links/rechts carven gibt Schub) | Spin |
| ↑ / W | Hocke (schneller) | Frontflip |
| ↓ / S | Bremsen | Backflip |
| Leertaste | Springen (Ollie), vom Rail abspringen | – |
| Q / E | Butter-360 links / rechts | Halten: Mute- / Tail-Grab |
| Shift | Boost (wird durch Tricks und saubere Schwünge aufgeladen) | – |
| V | Kamera: Ich-Perspektive an/aus (auch per Knopf oben rechts) | |
| Esc · R · M | Pause · Neustart · Ton | |

Auf Handy und Tablet erscheinen Touch-Buttons.

## Online spielen

Online-Rennen laufen Peer-to-Peer über WebRTC (PeerJS). Einen eigenen Server brauchst du nicht, aber eine Internetverbindung.

- **Gleiches WLAN:** Server mit `python3 -m http.server 5173 --bind 0.0.0.0` starten. Freunde öffnen dann `http://<deine-IP>:5173`.
- **Übers Internet:** Den Ordner auf einen statischen Hoster legen, z. B. Netlify Drop, GitHub Pages oder Cloudflare Pages. Dann den Einladungslink aus der Lobby teilen.

In manchen Netzen (strenge Firmen- oder Mobilfunk-NATs) kann die direkte Verbindung scheitern.

## Dateien

```
index.html        Einstieg, Import-Map für Three.js
css/style.css     Oberfläche und HUD
js/main.js        App, Renderer, Spielschleife, Navigation
js/game.js        Spielrunde: Modi, Wertung, Kamera, Ghost, Lawine
js/course.js      Strecken-Generator mit Abschnitten
js/world.js       3D-Welt: Gelände, Bäume, Felsen, Lift, Hütten, Brücken
js/weather.js     Himmel, Licht, Bergketten, Wolken, Schnee, Wind
js/skier.js       Fahrphysik und Tricks
js/model.js       Fahrerfigur mit Gelenken
js/bot.js         Bot-KI und Referenzzeiten
js/net.js         Online-Räume (PeerJS)
js/ui.js          Menüs, Lobby, Ergebnis, HUD
js/…              Audio, Eingabe, Speicher, Challenges, Medaillen
```

---

# Umlauf (`/umlauf`)

Ein Spiel mit einer Taste unter **https://timleonhardt.de/umlauf/**. Dein Punkt kreist auf einer Bahn, Tippen oder Leertaste dreht die Richtung. Funken sammeln, Splittern ausweichen.

| Datei | Inhalt |
|---|---|
| `umlauf/index.html` | Das ganze Spiel (Canvas, kein Build-Schritt) |
| `umlauf/config.js` | Supabase-URL und Publishable Key für die Online-Bestenliste |
| `umlauf/supabase-setup.sql` | Tabelle und Funktionen, einmal im Supabase SQL Editor ausführen |

Ohne Werte in `config.js` speichert die Bestenliste nur auf dem jeweiligen Gerät. Einträge löschen: in Supabase unter Table Editor → `umlauf_scores`.
