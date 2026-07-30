# 🪙 Flippancy

A tiny, opinionated web app for overthinkers. Two modes, one page, zero accounts.

- **🎯 Decide** — feed it your stuck options, it argues both sides, then makes a call
- **📓 Retro** — daily or weekly check-in so future-you can spot patterns

Built for personal use. No backend, no tracking, no cloud. Everything lives in your browser's localStorage. You can wipe it, export it, or take it with you.

---

## Run it

It's a static site. Open `index.html` in any modern browser. That's it.

```bash
git clone https://github.com/IbadUllahHasan/Flippancy.git
cd Flippancy
open index.html   # macOS
# or just double-click index.html
```

No build step, no `npm install`, no server. If you want it to feel snappier you can serve it with anything (`python -m http.server`, `npx serve`, etc.) but you don't have to.

---

## Features

### Decide
- Add 2–5 options
- Pick a tone — 🌿 Gentle, 🔥 Brutal, 😏 Sarcastic
- Get a pros/cons breakdown per option, then a final pick
- Saves to history, calls out repeat indecision

### Retro
- **Daily** (3 questions) — what went well, what drained you, one small win for tomorrow
- **Weekly** (5 questions) — adds biggest lesson and what to drop / double down on

### History
- One feed for everything
- Export as JSON
- Clear with one click (you'll get a confirm)

### Extras
- 🌗 Dark / light toggle (your choice is remembered)
- 💾 All data in localStorage — survives refreshes, lives only on your machine
- 📤 Export to JSON if you want a backup or to move it

---

## Files

```
index.html   # structure
styles.css   # everything visual
app.js       # all the logic
```

That's the whole app. Three files. You can read the whole thing in one sitting.

---

## Privacy

Nothing leaves your browser. No analytics, no fonts loaded from CDNs, no fetch calls to anywhere. If you want to verify, open DevTools → Network tab and use the app. You'll see zero outbound requests.

---

## Ideas for later

Things you (or I) might add someday — no pressure:

- 📅 Calendar heatmap view for retros
- 🏷 Tags on decisions ("career", "side project", "boring admin")
- ⏰ Optional reminder notifications (would need your permission)
- 📊 "How decisive are you?" weekly stat
- 🔁 Import an exported JSON to sync across machines manually

---

## License

Do whatever you want with it. It's yours.
