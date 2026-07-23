# Lokal testen

Anleitung, um yt-pro komplett lokal auf dem Mac zu starten und zu testen,
bevor etwas auf die NAS/Cloudflare Pages deployed wird.

## 1. Einmalige Voraussetzungen prüfen

`.env` im Projekt-Root muss für den lokalen Test folgende Werte enthalten
(nicht die Produktionswerte!):

```
CORS_ORIGINS=https://app.yt-pro.de,http://localhost:3000
# COOKIE_DOMAIN auskommentiert/leer lassen - nur für echte Subdomain-Deploys nötig
```

`frontend/.env.local` muss auf das lokale Backend zeigen:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

> Existiert `frontend/.env.local` noch nicht: `cp frontend/.env.example frontend/.env.local`
> und danach den Wert wie oben anpassen (die Beispieldatei enthält einen
> Platzhalter, keine funktionierende URL).

## 2. Backend starten

Im Projekt-Root (`/Users/thorben.holkenbrink/yt-pro/yt-pro`):

```
docker compose -f "docker-compose copy.yml" up -d --build
```

Prüfen:

```
curl http://localhost:8000/api/health
```

Erwartete Ausgabe: `{"status":"ok"}`

Nach jeder Backend-Code-Änderung (auch Migrationen) diesen Befehl erneut
ausführen - `--build` baut nur neu, wenn sich etwas geändert hat.

Logs bei Problemen:

```
docker compose -f "docker-compose copy.yml" logs api --tail=50
```

## 3. Frontend starten

In einem zweiten Terminal-Tab:

```
cd frontend
npm install
npm run dev
```

Läuft dann auf `http://localhost:3000`. Wichtig: Nach jeder Änderung an
`.env.local` muss `npm run dev` neu gestartet werden (Ctrl+C, dann erneut
`npm run dev`) - Next.js liest `NEXT_PUBLIC_*`-Variablen nur beim Start ein.

## 4. Login

`http://localhost:3000` öffnen und mit den Werten aus `.env`
(`ADMIN_USERNAME` / `ADMIN_PASSWORD`) einloggen.

---

## Checkliste: was wurde zuletzt geändert und wie testen

### Login-Redirect
- Ausgeloggt `http://localhost:3000/` aufrufen → sollte auf `/login` landen.
- Eingeloggt `http://localhost:3000/` aufrufen → sollte direkt auf
  `/download` landen.

### Qualität
- Einstellungen → Download → Standardqualität auf **1080p** stellen.
- Neuen Download starten: Schritt 1 (URL einfügen) sollte 1080p schon
  vorausgewählt zeigen; Schritt 2 (Vorschau) übernimmt das.
- Nach Abschluss in der Mediathek prüfen, dass die Datei wirklich in 1080p
  vorliegt (nicht 720p).

### Playlist-Analyse
- Einen YouTube-Playlist-Link (idealerweise mit mehreren Videos) einfügen
  und analysieren. Sollte jetzt zügig durchlaufen statt endlos zu laden.
- Mehrere Video-Links (je Zeile einer) einfügen und analysieren - läuft
  jetzt parallel statt nacheinander.

### Mediathek
- Filterzeile: nur noch "Alle / Neu / Angesehen / Heruntergeladen", keine
  zweite Zeile mehr.
- Eine Playlist herunterladen → sollte in der Mediathek als **ein
  Ordner-Eintrag** (📁 mit Playlist-Name) erscheinen, nicht als einzelne
  Karten. Ordner antippen → zeigt die enthaltenen Videos, "← Zurück"
  bringt zur Übersicht.
- Ist eine automatische Quelle (`Einstellungen → Quellen`) eingerichtet:
  deren heruntergeladene Videos sollten sich ebenfalls in einem Ordner
  (benannt nach der Quelle) sammeln, auch über mehrere Läufe hinweg.
- Einzelne (nicht aus einer Playlist stammende) Videos weiterhin direkt als
  Karte sichtbar.
- Media-Karte prüfen: Play/Restart als Icons nebeneinander, kein "Als
  angesehen markieren"-Button mehr, keine "Begonnen"/"Manuell"-Badges,
  Offline-Button als Icon, in der Metazeile kein "- -" mehr wenn z. B. die
  Dauer fehlt.

### Aktivität
- Unter "Abgeschlossen / Fehlgeschlagen" sollte pro Eintrag ein
  Löschen-Button (✕) erscheinen, mit Bestätigungsdialog. Nach Löschen ist
  der Eintrag weg und die zugehörige Datei sollte auf der NAS/im
  Temp-Verzeichnis entfernt sein.

### Konto
- Einstellungen → Konto sollte den eingeloggten Benutzernamen anzeigen.

### Popups
- Kurz einen Lösch-Dialog, den Sortier-Sheet und (falls noch nicht
  gesehen) den rechtlichen Hinweis / iOS-Speicherhinweis öffnen - sollten
  spürbar mehr Weißraum/Abstand haben als vorher.

### Dateistruktur auf der NAS (wichtigster Punkt, unbedingt real prüfen)
Nach einem Playlist-Download ins Temp-Verzeichnis des Containers schauen:

```
docker compose -f "docker-compose copy.yml" exec api sh -c "ls -la /data/temp"
```

Erwartet:
- Ein Ordner, benannt nach dem Playlist-Titel (bzw. dem Quellen-Namen bei
  automatischen Downloads), **enthält alle zugehörigen Video-Dateien**.
- Ein einzeln (nicht aus einer Playlist) heruntergeladenes Video liegt
  weiterhin in seinem eigenen Ordner.

### Offline-Wiedergabe (aus der vorherigen Session)
- Mediathek → "Für Offline speichern" auf einem Video → DevTools → Network
  → Offline aktivieren → Video sollte trotzdem abspielen.

---

## Alles zurücksetzen / neu starten

```
docker compose -f "docker-compose copy.yml" down
docker compose -f "docker-compose copy.yml" up -d --build
```

`down` behält die benannten Volumes (Datenbank, Dateien) - für einen
komplett leeren Zustand zusätzlich `-v` anhängen (löscht dann aber auch
alle lokal heruntergeladenen Test-Videos und Nutzerdaten).

## Bekannte Stolperfallen

- **"Anmeldung fehlgeschlagen"**: fast immer `CORS_ORIGINS` in `.env` oder
  `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` falsch - siehe
  Abschnitt 1.
- **Änderung an `.env`/`.env.local` wirkt nicht**: Container bzw.
  `npm run dev` neu starten, beides liest Env-Variablen nur beim Start.
- **`docker-compose copy.yml`**: nicht versioniert (lokale Kopie mit
  `build:` statt `image:`), nur für lokale Tests gedacht - für den echten
  NAS-Deploy weiterhin `docker-compose.yml` verwenden.
