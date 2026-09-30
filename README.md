<p align="center">
  <img alt="Ember" src="resources/ember.svg" width="96">
</p>

# Ember

Ember ist ein Code-Editor auf Basis von [Visual Studio Code – Open Source („Code - OSS“)](https://github.com/microsoft/vscode).

## Voraussetzungen

| Werkzeug | Version | Hinweis |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | **24.x**, mindestens die Version in [`.nvmrc`](.nvmrc) | Andere Hauptversionen (z. B. 26) werden bei `npm install` abgelehnt. |
| npm | wird mit Node.js installiert | Kein `yarn` verwenden. |
| Python | 3.x | Für native Module (`node-gyp`). |
| Git | aktuell | |
| **macOS:** Xcode Command Line Tools | | `xcode-select --install` |
| **Linux/Windows** | | Siehe [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites) von VS Code. |

### Node.js 24 unter macOS (Homebrew)

Falls schon eine andere Node-Version installiert ist, Node 24 parallel installieren. Die Standardversion bleibt dabei unverändert:

```bash
brew install node@24
```

Dann in jedem Terminal, in dem du an Ember arbeitest, Node 24 vorne in den Pfad setzen:

```bash
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
```

Damit du das nicht jedes Mal eingeben musst, kannst du die Zeile in `~/.zshrc` eintragen. Alternativ geht auch [nvm](https://github.com/nvm-sh/nvm) mit `nvm use` im Projektordner.

Prüfen:

```bash
node -v
```

Die Ausgabe muss mit `v24.` beginnen.

## Ember starten

Alle Befehle im Projektordner ausführen.

**1. Abhängigkeiten installieren.** Beim ersten Mal dauert das einige Minuten:

```bash
npm install
```

**2. Kompilieren:**

```bash
npm run compile
```

**3. Starten:**

```bash
./scripts/code.sh
```

Unter Windows startest du stattdessen `scripts\code.bat`.

Beim ersten Start lädt das Skript Electron und die mitgelieferten Erweiterungen herunter. Danach öffnet sich das Ember-Fenster.

## Entwickeln

Wenn du am Code arbeitest, lass in einem zweiten Terminal den Watch-Modus laufen. Er kompiliert Änderungen automatisch neu:

```bash
npm run watch
```

Danach im Ember-Fenster neu laden (**Cmd+R** unter macOS, **Ctrl+R** unter Windows/Linux) oder Ember mit `./scripts/code.sh` neu starten.

Unit-Tests laufen mit:

```bash
./scripts/test.sh
```

Einzelne Testdateien startest du mit `--run <pfad>`.

## Ember-Konto

Ist in [`product.json`](product.json) ein `emberAccount`-Block mit Supabase-URL und anon-Key konfiguriert, zeigt Ember beim Start eine Anmeldeseite. Neue Konten entstehen nur über GitHub. Bestehende Konten können sich auch mit E-Mail und Passwort anmelden.

## Häufige Probleme

- **`Please use Node.js v24…` bei `npm install`:** Die falsche Node-Version ist aktiv. Mit `node -v` prüfen und den Abschnitt zu Node.js 24 oben befolgen.
- **Das Fenster ist nicht zu sehen:** Es liegt oft hinter anderen Fenstern. Im Dock auf das Ember-Symbol klicken.
- **Nach `git pull` startet Ember nicht mehr:** Erneut `npm install` und `npm run compile` ausführen.

## Lizenz

Ember basiert auf „Code - OSS“. Copyright (c) Microsoft Corporation. Lizenziert unter der [MIT-Lizenz](LICENSE.txt).
