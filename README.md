# timleonhardt.de

Statische Spiele-Seite auf GitHub Pages (Branch `main`, Root-Ordner).

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite mit der Spieleauswahl. Leitet alte Einladungslinks (`/?room=…`) und Homescreen-Apps zu Peak Rush weiter. |
| `peak-rush/` | **Peak Rush**, 3D-Ski-Arcade (früher Gipfelrausch). Quelle liegt lokal im Ordner `Desktop/Game`. Details in `peak-rush/README.md`. |
| `spinward/` | **Spinward**, Ein-Knopf-Spiel (früher Umlauf). |
| `stone-cold/` | **Stone Cold**, Rutsch-Puzzle mit 30 Leveln (früher Rutschpartie), eine Datei. Die Level stammen aus `stone-cold/tools/levelgen.py` (Generator und Löser mit denselben Regeln wie das Spiel). |
| `hearthvale/` | **Hearthvale**, Farm und Siedlung in einem Tal: Karte, Siedler, Produktionsketten, Tal der Woche. ES-Module in `hearthvale/js/` (data, world, sim, render, main). |
| `plot-twist/` | **Plot Twist**, Aufbau-Strategie mit Tagesdorf (früher Dorfplan), eine Datei. |
| `gipfelrausch/`, `umlauf/`, `rutschpartie/`, `dorfplan/` | Nur Weiterleitungen auf die neuen Adressen, damit alte Links und Einladungen funktionieren. |
| `lb.js`, `lb-config.js` | Gemeinsame Online-Bestenliste für alle Spiele (Supabase). Setup: `leaderboard-setup.sql`. |
| `CNAME`, `.nojekyll` | Domain und Pages-Einstellung, nicht löschen. |

## Peak Rush aktualisieren

Die Dateien des Spiels nach `peak-rush/` kopieren, **nicht** ins Root (dort liegt die Startseite) und nicht nach `gipfelrausch/` (dort liegt nur die Weiterleitung).

## Bestenlisten

Alle Spiele nutzen `lb.js` mit den Werten aus `lb-config.js` (Supabase Project URL und Publishable Key). Die Datenbank richtet `leaderboard-setup.sql` ein; neue Listen bekommen dort eine Zeile in `lb_boards` (mehr oder weniger ist besser, erlaubter Wertebereich). Einträge löschen: Supabase → Table Editor → `lb_scores`.

| Liste | Wert |
|---|---|
| `spinward` | Funken |
| `stone-cold` | Sterne, bei Gleichstand weniger Züge über Ideal |
| `plot-twist:day:JJJJ-MM-TT`, `plot-twist` | Punkte im Tagesdorf, pro Tag und für alle Zeiten |
| `peak-rush:race3:<karte>`, `peak-rush:slalom3:<karte>` | Zeit in Millisekunden, weniger ist besser |
| `peak-rush:freestyle3:<park>`, `peak-rush:lawine` | Punkte bzw. Meter |
| `hearthvale:week:JJJJ-wNN`, `hearthvale` | Talwert nach einem Jahr (28 Tage), Tal der Woche und für alle Zeiten |
