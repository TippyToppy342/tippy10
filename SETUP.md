# 🎴 Phase 10 Multiplayer — Setup Guide

This game runs entirely in the browser. You only need:
- A free **Firebase** account (the backend)
- A free **GitHub Pages** or **Netlify** account (hosting, so anyone can visit a URL)

---

## Step 1 — Set Up Firebase (Free, ~5 minutes)

Firebase is Google's free real-time database. It lets players in different states see each other's moves instantly.

1. Go to **https://console.firebase.google.com**
2. Click **Add Project** → name it anything (e.g. `tippy10`) → Continue
3. Disable Google Analytics if you want → **Create Project**
4. In the left sidebar, click **Build → Realtime Database**
5. Click **Create Database**
6. Choose a location (any region) → click **Next**
7. Select **"Start in test mode"** → click **Enable**
   *(This allows reads/writes without login — fine for a private game)*

### Get your config keys:
8. Click the ⚙️ gear icon → **Project Settings**
9. Scroll down to **"Your apps"** → click the `</>` (Web) icon
10. Register app (any nickname) → click **Register App**
11. You'll see a `firebaseConfig` object like:
    ```js
    const firebaseConfig = {
      apiKey: "AIzaSy...",
      authDomain: "phase10-abc.firebaseapp.com",
      databaseURL: "https://phase10-abc-default-rtdb.firebaseio.com",
      projectId: "phase10-abc",
      storageBucket: "phase10-abc.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123:web:abc123"
    };
    ```
12. **Copy these values** into `js/firebase-config.js` in this project.

---

## Step 2 — Update the Config File

Open `js/firebase-config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",          // ← paste yours
  authDomain:        "your-project.firebaseapp.com",
  databaseURL:       "https://your-project-default-rtdb.firebaseio.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234:web:abcdef",
};
```

---

## Step 3 — Host the Game (Free, ~3 minutes)

### Option A: GitHub Pages (Recommended)

1. Create a free account at **https://github.com**
2. Click **New Repository** → name it `phase10` → **Create Repository**
3. Upload all the game files (drag and drop in the GitHub UI)
4. Go to the repo **Settings → Pages**
5. Under Source, select **"Deploy from branch"** → choose `main` → `/root`
6. Click **Save** — your game will be live at:
   `https://YOUR-USERNAME.github.io/phase10`

### Option B: Netlify (Even Easier)

1. Go to **https://netlify.com** → Sign up free
2. Drag your entire `phase10` folder onto the Netlify dashboard
3. You get an instant URL like `https://quirky-name-123.netlify.app`
4. Optionally rename it in Site Settings

---

## Step 4 — Play!

1. Share the URL with your friends in different states
2. One person creates a room (enter a name + room code)
3. Others join using the same room code
4. Host clicks **Start Game** when everyone is in
5. Play Phase 10! 🎉

---

## How to Play (Quick Reference)

| Phase | Requirement |
|-------|-------------|
| 1  | 2 Sets of 3 |
| 2  | 1 Set of 3 + 1 Run of 4 |
| 3  | 1 Set of 4 + 1 Run of 4 |
| 4  | 1 Run of 7 |
| 5  | 1 Run of 8 |
| 6  | 1 Run of 9 |
| 7  | 2 Sets of 4 |
| 8  | 7 Cards of 1 Color |
| 9  | 1 Set of 5 + 1 Set of 2 |
| 10 | 1 Set of 5 + 1 Set of 3 |

**Each turn:**
1. Draw 1 card (from draw pile or discard pile)
2. Optionally lay down your phase (select cards, click "Lay Down Phase")
3. Optionally add cards to any laid-down melds (select 1 card, click a meld)
4. Discard 1 card to end your turn

**Wild cards** can substitute any number/color.  
**Skip cards** skip the next player when discarded.

---

## Seasonal Themes

The game paints itself for the calendar. A season layers on the **Standard**
theme only, and can be turned off in the ⚙ Options panel.

| Season | Window | Look |
|--------|--------|------|
| Julia's Birthday | Jan 29 – Feb 2 | gold, floating balloons |
| Summer Break | May 25 – Sep 3 | tacos, sushi, In-N-Out, MTV beach house |
| 4th of July | Jun 24 – Jul 4 | fireworks, red/white/blue (wins over Summer) |
| Dan Reid's Birthday | Sep 4 – 8 | Dan's photos, name puns, Beyoncé, a taped polaroid on the board |
| Halloween | Oct 15 – Nov 1 | falling pumpkins, orange/purple |
| Meg's Birthday | Nov 13 – 17 | autumn colors, balloons |
| Christmas | Dec 5 – 26 | snowfall, red/green |

**Preview any season on any date** by adding `?season=<id>` to the URL —
`?season=dan`, `?season=halloween`, `?season=off`, etc.

**Birthday takeover:** during a birthday season, a player whose name matches
the guest of honour (Dan / Julia / Meg) gets a full-screen "Happy Birthday"
when round 1 starts.

### Adding a new season

1. Add a row to `SEASONS` in `js/settings.js` (id, date window, banner label,
   particle effect, and `person` if it's a birthday).
2. Add a `body.season-<id>` block in `css/style.css` — at minimum
   `--season-banner-bg`.
3. Optionally add popup jokes to `SEASON_MOMENTS` in `js/game.js`, a photo
   reel to `SEASON_GALLERY` and round-end captions to `SEASON_ROUND_END` in
   `js/ui.js`.

Nothing else needs to change — the engine picks it up.

---

## Getting Someone Back Into a Game

If a player drops mid-game (closed the tab, lost their browser session,
switched devices):

- Their opponents see them go **🔌 disconnected**, with an **Invite back**
  button that copies the room's invite link.
- The invite link (also available from the **Room:** badge in-game and the
  waiting room) looks like `…/index.html?room=CODE`.
- Opening it prefills the room code. Entering **the same name they were
  playing under** drops them back into their seat — same hand, same score,
  same phase — even though the game has already started.

---

## Troubleshooting

- **"Room not found"** — double-check the room code (case-insensitive)
- **Cards not updating** — check Firebase config values are correct; open browser console for errors
- **Database errors** — make sure your Firebase Realtime Database is in "test mode"
- **CORS errors** — make sure you're accessing the game via a proper URL (not `file://`)

---

## File Structure

```
phase10/
├── index.html              ← Main game page
├── css/
│   └── style.css           ← All styles
├── js/
│   ├── firebase-config.js  ← 🔑 YOUR CONFIG GOES HERE
│   ├── cards.js            ← Deck, card rendering, phase rules
│   ├── game.js             ← Game logic + Firebase sync
│   └── ui.js               ← DOM rendering
└── SETUP.md                ← This file
```
