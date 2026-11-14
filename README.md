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

Jede Strecke besteht aus Abschnitten mit eigenem Charakter: offene Hänge, Waldschneisen, Felsenfelder, Gabelungen (links Sprünge, rechts Buckel oder Felsen), Felsstufen, enge Rinnen, Buckelpisten, Sprunglinien, Grate, Almwiesen mit Hütten, gefrorene Seen mit Glatteis, Gletscherspalten (Brücke oder Sprung) und Bachquerungen.

Dazu kommen fünf Wetterlagen (Sonne, Sonnenuntergang, Nacht mit Stirnlampe, Schneesturm mit Wind, Nebel), drei Tages-Challenges pro Tag und eine lokale Bestenliste.

## Steuerung

| Taste | Am Boden | In der Luft |
|---|---|---|
| ← → / A D | Lenken | Spin |
| ↑ / W | Hocke (schneller) | Frontflip |
| ↓ / S | Bremsen | Backflip |
| Leertaste | Springen (Ollie), vom Rail abspringen | – |
| Q / E | Butter-360 links / rechts | Halten: Mute- / Tail-Grab |
| Shift | Boost (wird durch Tricks aufgeladen) | – |
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
