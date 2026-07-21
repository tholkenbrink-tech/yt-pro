# Frontend Design Status

This is a polish pass on top of an already-working yt-pro frontend, not a rebuild. It cherry-picks the
pieces of `CLAUDE_CODE_FRONTEND_DESIGN.md` that were genuinely missing and still valuable, without
touching the existing design system, navigation, or the already-implemented video player.

## Player is already implemented (source brief's §32 is moot)

The source design brief was written for a "Version 1, no player" state and ends with "Player Phase 2
handoff notes" (§32) describing how a future prompt should wire up playback. That has already happened:
`VideoPlayer.tsx`, `PictureInPictureButton.tsx`, `ResumePlaybackPrompt.tsx`, `AirPlayHint.tsx`, and the
`/library/[videoId]` route are a complete, working native `<video>` player with PiP and resume support,
covered by `tests/e2e/player.spec.ts`. None of those files were touched in this pass. There is nothing
left to hand off — §32 does not apply, and no speculative "Phase 2" notes are written here for a player
that already exists and works today.

## Screens/components reused as-is (already matched the brief)

- Four-tab navigation (`AppShell.tsx`, `MobileBottomNavigation.tsx`, `DesktopSidebar.tsx`) - bottom bar
  on mobile, sidebar on desktop, already responsive and safe-area aware.
- Design tokens in `app/globals.css` / `tailwind.config.ts` (indigo/violet accent, light/dark/system via
  `lib/theme.ts`), typography scale, spacing, radii.
- Download, Activity, Library, Settings, automatic-sources pages and their API integration
  (`lib/api.ts`, `lib/types.ts`).
- `QualitySelector`, `MediaCard`, `MediaStatusBadge`, `StatusBadge`, `StatusPill`, `DownloadCard`,
  `JobItemCard`, `StorageStrip`, `PlaylistItemList` - kept their existing structure, only extended.
- The player and `/library/[videoId]` detail page - explicitly out of scope, not modified.

## Newly created components

| Component | File | Wired into |
|---|---|---|
| `ToastProvider` / `useToast` | `frontend/components/ToastProvider.tsx` | Mounted once in `app/layout.tsx`, inside `AppShell`. Single-toast-at-a-time, auto-hides after 3s, bottom-center on mobile (floats above the bottom nav via a live `--mobile-nav-height` CSS var), bottom-right on desktop. `aria-live="polite"`. |
| `ConfirmationDialog` | `frontend/components/ConfirmationDialog.tsx` | Focus-trapped modal, Escape/backdrop-click to close, destructive variant uses `--color-error`. Wired into: `DownloadCard.tsx` delete-from-server, `MediaCard.tsx` delete-from-server, `JobItemCard.tsx` cancel-active-job. |
| `Skeleton` | `frontend/components/Skeleton.tsx` | Shimmer block (`.skeleton` in `globals.css`), falls back to a static muted block under `prefers-reduced-motion`. Used in: Download page's analysis-loading state, Activity page's job-list loading state, Library page's card-grid loading state, `StorageStrip`'s loading state. |
| `BottomSheet` | `frontend/components/BottomSheet.tsx` | Shared "sheet" primitive (slide-up, Escape/backdrop close, focus on open). |
| `SortSheet` | `frontend/components/SortSheet.tsx` | Built on `BottomSheet`. Replaces the Mediathek's native `<select>` sort control below `md`; the `<select>` stays on `md+` where there's room. A separate `FilterSheet` was **not** built - see judgment calls below. |
| `BottomActionBar` | `frontend/components/BottomActionBar.tsx` | Sticky bottom action area, floats above the mobile nav via `--mobile-nav-height`, respects `env(safe-area-inset-bottom)`. Used on `/download/preview` for both the single-video primary action and the playlist selection summary + prepare action - this is a new canonical pattern (no pre-existing sticky bar was found in the codebase to reuse, despite the task brief assuming one existed). |

`MobileBottomNavigation.tsx` was extended with a `ResizeObserver` that publishes its own rendered height
(0 on `md+`, where it's `display:none`) as `--mobile-nav-height` on `<html>`, so `Toast` and
`BottomActionBar` float at the correct offset without a hardcoded pixel guess.

## Where each of the 4 required toasts fire

- "Link eingefügt" - `app/download/page.tsx`, after a successful clipboard paste.
- "Download gestartet" - `app/download/preview/page.tsx`, after `api.createJob` succeeds, right before
  navigating to the activity detail page.
- "Datei vom Server gelöscht" - `DownloadCard.tsx` and `MediaCard.tsx`, after the delete confirmation
  dialog is confirmed and `api.deleteHistoryItem` succeeds.
- "Einstellung gespeichert" - `app/settings/page.tsx` (theme), `app/settings/storage/page.tsx`
  (retention + local storage settings), `app/settings/download/page.tsx`,
  `app/settings/player/page.tsx` (all local-settings toggles).

## Confirmation dialogs wired in

- Delete a prepared file from the server (`DownloadCard.tsx`, `MediaCard.tsx`) - destructive styling.
- Cancel an active job (`JobItemCard.tsx`) - destructive styling, confirm label "Ja, abbrechen" /
  cancel label "Weiterlaufen lassen" to avoid two buttons both saying "Abbrechen".
- No bulk "delete multiple" action exists in the app, so per the task's own instruction that case was
  skipped rather than inventing new bulk-selection UI.

## Skeletons added

- Download page: a thumbnail+text skeleton block replaces the plain "Analysiere..." button-only state
  while the URL is being analyzed.
- Activity page: 3 skeleton rows (avatar + two text lines) while jobs are loading.
- Library page: a skeleton grid matching the real `MediaCard` layout (thumbnail + text + action button)
  while items are loading.
- `StorageStrip`: both its `compact` (sidebar) and full variants now show a skeleton instead of
  silently rendering nothing while the first `/api/storage` call is in flight.

## Playlist preview sticky selection bar

`app/download/preview/page.tsx`:
- Added an "Alle auswählen" / "Alle abwählen" toggle above `PlaylistItemList`.
- Added a `BottomActionBar` showing "`N` von `M` ausgewählt" and an estimated total size for the
  selection, with the primary action label changing to "`N` Video(s) vorbereiten".
- The single-video preview's primary action ("Download vorbereiten") was also moved into the same
  `BottomActionBar`, so both flows share one sticky-action pattern.
- **Estimated size caveat**: the analyze API's `PlaylistItemPreview` type has no per-item size field,
  only `PlaylistAnalysis.estimatedTotalSize` for the whole playlist. Per the task's constraint not to
  invent a new API call, the selected-items estimate is `(estimatedTotalSize / itemCount) * selectedCount`
  - an even-split approximation from data the backend already returns, not a fabricated number.

## Copy changes made (before -> after)

| Location | Before | After |
|---|---|---|
| Activity empty state (`app/activity/page.tsx`) | "Keine Vorgänge vorhanden. Starte einen Download unter 'Download'." | Title "Keine aktiven Downloads" + text "Neue Downloads erscheinen hier und laufen auf dem Server weiter." (brief §16) |
| Library empty state (`app/library/page.tsx`) | "Keine Videos gefunden." | Title "Noch keine Videos vorbereitet" + text "Fertige Videos werden hier angezeigt und können auf dein iPhone geladen werden." (brief §16) |
| Download analyze error - invalid URL (`app/download/page.tsx`) | One generic "Analyse fehlgeschlagen. Bitte Link(s) prüfen." for every `ApiError` | Split by real HTTP status the backend already returns: 400 (`InvalidUrlError`/`PlaylistTooLargeError`) -> "Dieser Link wird nicht unterstützt. Bitte füge einen gültigen YouTube-Link ein."; other API errors (502 from `YtdlpError`) -> "Video nicht verfügbar. Das Video wurde möglicherweise entfernt, ist privat oder kann in deiner Region nicht geladen werden."; non-`ApiError` -> unchanged "Netzwerkfehler bei der Analyse." |
| Clipboard paste failure (`app/download/page.tsx`) | Showed "Zugriff auf die Zwischenablage nicht möglich." | Fails silently (brief §6.2: "gracefully fall back without showing a technical error") |
| Storage-full warning (`components/StorageStrip.tsx`, `app/settings/storage/page.tsx`) | "Wenig freier Speicher - ältere Downloads werden ggf. früher gelöscht." / "Zu wenig Speicherplatz. Lösche Videos oder passe die Aufbewahrungsdauer an." | "Zu wenig Speicherplatz." (bold) + "Lösche vorbereitete Dateien oder vergrößere den verfügbaren Speicher." (brief §26, applied in both places) |
| Failed job item, no `errorMessage` from backend (`components/JobItemCard.tsx`) | Nothing shown beyond the "Fehlgeschlagen" status pill | Falls back to "Das Video ist möglicherweise nicht verfügbar oder die Verbindung wurde unterbrochen." (brief §10.6) when the backend didn't supply a specific message |
| Single-video preview primary action (`app/download/preview/page.tsx`) | "Vorbereitung starten" | "Download vorbereiten" (brief §8.4 exact wording) - `tests/e2e/download-preview-redirect.spec.ts` updated to match |

### Copy left unchanged (judgment calls)

- **"Session expired"** (brief §26) - not implemented. There is no session-expiry error path anywhere in
  the current frontend/API (only a wrong-password message on the login form, which is a different
  scenario). Per the task's own instruction not to invent new error paths, this was skipped.
- **"Video nicht verfügbar" on `/library/[videoId]`** - left as the existing "Datei nicht mehr
  verfügbar" / "Das Video wurde vom Server gelöscht oder ist abgelaufen." This is a different, more
  accurate scenario (our own retention deleted the file) than the brief's copy (YouTube-side
  unavailability), so it was judged already-correct rather than a gap.
- **"Worker unavailable"** (brief §26) - not added. The analyze endpoint's 502 can mean either an
  unavailable video or a yt-dlp/worker problem; the frontend has no way to distinguish those from the
  response it gets today, so a separate "worker offline" message would be a guess, not a real mapping.

## FilterSheet decision

Only a `SortSheet` was built (on a shared `BottomSheet` primitive). The Mediathek's status/origin filter
pills already work as horizontally-wrapping pill rows on all breakpoints - converting them into a sheet
would have been forcing a pattern where inline pills already work fine, which the task explicitly said
to avoid. The native `<select>` sort control was the one control that didn't feel native on mobile, so
only that was converted.

## Tested breakpoints / browsers

Full Playwright suite run against all 4 configured device projects (`playwright.config.ts`):
iPhone SE, iPhone 14, iPhone 14 Pro Max (430x932 custom viewport), iPad (gen 7). All against Chromium
(Playwright's default engine for these device profiles), fully mocked API per `tests/e2e/mockApi.ts`.

## Verification results

- `npx tsc --noEmit` - clean.
- `npm run build` - succeeds, all 19 routes compile/prerender.
- `npx next lint` - no warnings or errors.
- `npm run test:unit` (Vitest) - 3 files, 17 tests, all passing.
- `npx playwright test` - 84 tests (21 specs x 4 device projects), all passing, including the updated
  `download-preview-redirect.spec.ts` assertion for the renamed "Download vorbereiten" button.

## Known gaps / follow-ups

- The playlist "estimated total size for selection" is an even-split approximation (see above) - fine
  for now, but would benefit from a real per-item `estimatedFileSize` in the analyze response if the
  backend ever adds one.
- `BottomActionBar`'s clearance above the mobile nav depends on `ResizeObserver` (supported in all
  target browsers here); if it were ever unavailable, the bar would sit at true viewport bottom
  (`--mobile-nav-height` defaults to `0px`) rather than crash.
- No dedicated `FilterSheet` was built (see judgment call above) - if the Mediathek's filter set grows
  significantly, `BottomSheet` is already in place to build one without new plumbing.
- This pass did not touch `settings/sources/*` delete/pause/resume actions - they were out of the
  specified scope (Library/Activity delete + cancel-job only) and were left exactly as they were.
