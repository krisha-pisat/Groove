# Groove — Implementation Log

A record of every feature, fix, and improvement made to the project, in order. Each entry includes the files changed, what was done, and the git command to commit it.

---

## 1. Fix hardcoded localhost URL + untrack .env
**Commit:** `0e1026a`

**Problem:** The frontend called `http://localhost:5000` directly, which broke in production on Vercel because the backend lives on Render. The `.env` file was also accidentally committed.

**Files changed:**
- `src/pages/Room.jsx` — replaced `http://localhost:5000` with `import.meta.env.VITE_API_URL`
- `.gitignore` — added `.env` and `.env.local`

**Git commands:**
```bash
git rm --cached .env
git add src/pages/Room.jsx .gitignore
git commit -m "Fix hardcoded localhost URL and untrack .env"
git push origin main
```

---

## 2. Fix music sync — queue position jump
**Commit:** `18cf63a`

**Problem:** When the host added a song to the queue, the music position jumped back to 0 for all listeners. `updateMusicState({ queue: newQueue })` was resetting `updated_at` without preserving the current playback position.

**Files changed:**
- `src/pages/Room.jsx` — `handlePlayerQueueUpdate` now passes `playback_position: getSyncedPosition()` so position is preserved on queue updates; `addToQueue` fixed to only call `updateMusicState` once

**Git commands:**
```bash
git add src/pages/Room.jsx
git commit -m "Fix sync drift and queue position jump"
git push origin main
```

---

## 3. Fix music sync — cross-device clock mismatch
**Commit:** `ea484f3`

**Problem:** `getSyncedPosition()` compared Device B's `Date.now()` against Device A's `updated_at` timestamp. Since clocks differ across devices, the synced position was wrong.

**Files changed:**
- `src/hooks/useRoomState.js` — added `receivedAt: null` to initial state; `fetchState()` and the realtime callback both set `receivedAt: Date.now()` when data arrives; rewrote `getSyncedPosition()` to use per-device `receivedAt` for elapsed time calculation

**Git commands:**
```bash
git add src/hooks/useRoomState.js
git commit -m "Fix sync: use local receivedAt instead of cross-device clock comparison"
git push origin main
```

---

## 4. Fix music sync — add network latency compensation + periodic resync
**Commit:** `eaede13`

**Problem:** Even after the `receivedAt` fix, the time between Supabase writing `updated_at` and the client receiving the event (network latency) was not accounted for. Also, drift could build up silently over time.

**Files changed:**
- `src/hooks/useRoomState.js` — `getSyncedPosition()` now adds a network latency correction (`receivedAt - updated_at`, capped 0–2 seconds)
- `src/components/MusicPlayer.jsx` — added a periodic resync every 3 seconds: if the local player is more than 1.5 seconds off from the synced position, it seeks to correct

**Git commands:**
```bash
git add src/hooks/useRoomState.js src/components/MusicPlayer.jsx
git commit -m "Compensate for realtime delivery latency in sync position"
git push origin main
```

---

## 5. Make Room UI fully responsive (header, player, queue)
**Commit:** `e707a9a`

**Problem:** The app was designed for desktop only and broke on mobile screens.

**Files changed:**
- `src/pages/Room.jsx` — header uses smaller icon/text on mobile; "Invite Friends" button hidden on mobile (`hidden sm:flex`); tab labels hidden on mobile (icons only)
- `src/components/MusicPlayer.jsx` — restructured layout: song info row → full-width progress bar → controls row; volume hidden on mobile, shown on desktop; compact mobile sizing via Tailwind `md:` breakpoints
- Queue and search result items — added `truncate`, `min-w-0`, smaller padding on mobile

**Git commands:**
```bash
git add src/pages/Room.jsx src/components/MusicPlayer.jsx
git commit -m "Make UI fully responsive for mobile and desktop"
git push origin main
```

---

## 6. Make game, karaoke, and chat panels responsive
**Commit:** `7085619`

**Problem:** Game panels, karaoke panel, and chat had fixed sizes that overflowed on mobile.

**Files changed:**
- `src/components/GamePanel.jsx` — responsive padding (`p-4 md:p-8`)
- `src/components/MusicTriviaGame.jsx` — options grid `grid-cols-1 sm:grid-cols-2`, smaller button padding, `text-sm md:text-base`
- `src/components/GuessTheSongGame.jsx` — question `text-xl md:text-3xl`, input+button stacks vertically on mobile (`flex-col sm:flex-row`)
- `src/components/WyrGame.jsx` — option buttons `min-h-12 py-4 text-sm md:text-base`
- `src/components/PickWhoGame.jsx` — same as WyrGame
- `src/components/KaraokePanel.jsx` — status card uses `flex-wrap gap-3`, icon smaller on mobile, button text shortened on mobile

**Git commands:**
```bash
git add src/components/GamePanel.jsx src/components/MusicTriviaGame.jsx src/components/GuessTheSongGame.jsx src/components/WyrGame.jsx src/components/PickWhoGame.jsx src/components/KaraokePanel.jsx
git commit -m "Make game, karaoke and chat panels responsive for mobile"
git push origin main
```

---

## 7. Fix 406 Supabase error on game session queries
**Status:** Uncommitted

**Problem:** Supabase returns `406 Not Acceptable` when `.single()` is used but zero rows exist (e.g. no active game session). This crashed the game components on load whenever no game was running.

**Files changed:**
- `src/components/GamePanel.jsx`
- `src/components/MusicTriviaGame.jsx`
- `src/components/GuessTheSongGame.jsx`
- `src/components/WyrGame.jsx`
- `src/components/PickWhoGame.jsx`

All five files: removed `.single()`, now use `.limit(1)` and access the result as `sessionRows?.[0] ?? null`

**Git commands:**
```bash
git add src/components/GamePanel.jsx src/components/MusicTriviaGame.jsx src/components/GuessTheSongGame.jsx src/components/WyrGame.jsx src/components/PickWhoGame.jsx
git commit -m "Fix 406 error: replace .single() with .limit(1) array access on game sessions"
git push origin main
```

---

## 8. Game start chat notification
**Status:** Uncommitted

**Problem:** When the host started a game, players in the Chat tab had no idea. They had to manually check the Games tab.

**Files changed:**
- `src/lib/startGame.js` — after a successful game session insert, inserts a `type: 'system'` message into `chat_messages` visible to all room members

Example message shown in chat:
> 🎮 Krisha started Music Trivia! Head to the Games tab to play.

Works for all 4 games: Music Trivia, Guess the Song, Would You Rather, Pick Who.

**Git commands:**
```bash
git add src/lib/startGame.js
git commit -m "Show game start notification in chat for all game types"
git push origin main
```

---

## 9. Fix game session DELETE race condition
**Status:** Uncommitted

**Problem:** When a game ended, every connected client ran `delete().eq('room_code', roomCode)` — deleting all sessions for the room. If the host started a second game while any client's delete was still in-flight, the new game session got wiped immediately after being created. This caused the second game not to launch and the second game start notification not to appear.

**What was wrong:**
```js
// Before — deletes ALL sessions for the room (dangerous)
supabase.from('game_sessions').delete().eq('room_code', roomCode);

// After — deletes only the specific session that just ended
supabase.from('game_sessions').delete().eq('id', payload.new.id);
```

**Files changed:**
- `src/components/GamePanel.jsx` — DELETE now targets `payload.new.id` instead of `room_code`
- `src/lib/startGame.js` — before inserting a new session, deletes any leftover session for that `room_code + game_type` to handle stale data; added `return` on game session insert error; added error logging on chat insert failure

**Git commands:**
```bash
git add src/components/GamePanel.jsx src/lib/startGame.js
git commit -m "Fix game session DELETE race condition causing second game start to fail"
git push origin main
```

---

## 10. start.bat — quick local startup script
**Status:** Uncommitted (new file)

**What it does:** Double-click `start.bat` at the project root to open two terminal windows — one for the Flask backend and one for the Vite frontend — with a 2-second delay so the backend starts first.

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:5000`

**Git commands:**
```bash
git add start.bat
git commit -m "Add start.bat for quick local development startup"
git push origin main
```

---

## Deployment Setup

### Frontend — Vercel
- Auto-deploys on every `git push origin main`
- Environment variable set in Vercel dashboard:
  - `VITE_API_URL` = Render backend URL (e.g. `https://groove-backend-xxxx.onrender.com`)
- Vite bakes env vars at **build time** — changing `VITE_API_URL` in Vercel requires a new deploy to take effect

### Backend — Render
- Deployed using Docker runtime
- Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`
- Auto-deploys on every `git push origin main`
- Free tier spins down after inactivity — first request after sleep takes ~30 seconds

---

## 11. Unread message badge on Chat tab icon
**Status:** Uncommitted

**Problem:** Users on other tabs had no way to know new chat messages had arrived, unless they manually switched to the Chat tab.

**Files changed:**
- `src/pages/Room.jsx` — added `unreadChatCount` state and `activeTabRef` ref; added a Supabase realtime subscription to `chat_messages` that increments the count when a new message arrives and the user is not on the chat tab; resets count to 0 when user switches to chat tab; pink badge overlaid on the chat icon shows the count (capped at `99+`)

**Git commands:**
```bash
git add src/pages/Room.jsx
git commit -m "Add unread message badge on chat tab icon"
git push origin main
```
