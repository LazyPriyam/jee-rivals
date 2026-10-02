# ⚡ JEE RIVALS

**JEE Rivals** is a high-octane, competitive multiplayer arena built for JEE Main & Advanced aspirants. Challenge friends in real-time speed duels, climb weekly division leagues, track permanent Elo ratings, and analyze mistakes with step-by-step KaTeX mathematical derivations and diagram crop inspection.

---

## 🚀 Quickstart (Run Locally)

### 1. Launch the Server
```bash
cd "C:\Users\Priyashree Sarkar\Desktop\JEE Rivals"
python start.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser!

### 2. Zero-Friction Authentication
- Pick any aspirant nickname (e.g., `Ramanujan_26`).
- Set a secret 4-digit PIN (e.g., `1234`).
- Choose your combat avatar.
- No email verification or passwords required!

---

## 🔄 Syncing Questions from JEE Test Taker

To push solved questions and diagram crops into JEE Rivals:
```bash
cd "C:\Users\Priyashree Sarkar\Desktop\JEE Test Taker"
python -m jee.cli cloud push
```
- By default, pushes to `http://localhost:8000`.
- To push to a deployed cloud server:
  ```bash
  python -m jee.cli cloud push --url https://your-rivals-domain.onrender.com
  ```

---

## 🎮 Game Modes

### 1. ⚡ Speed Duel (Custom Rooms)
- **Room Codes:** 5-letter codes (e.g., `KVPY4`, `RAMAN`).
- **Live Leaderboard:** Real-time score ticker updating via WebSockets.
- **Scoring:** $+100$ base + up to $+50$ rapid speed bonus, $-25$ for wrong answers.
- **Diagrams:** High-resolution diagram crops rendered inline with zoom support.
- **Keyboard Shortcuts:** Press `1-4` or `A-D` to choose options, `Enter` to lock in.

### 2. 📝 Mock Test Showdown
- Authentic exam conditions with NTA $+4$ / $-1$ marking scheme.
- Blind scores during the test to preserve exam psychology.
- Post-test grand comparative matrix with step-by-step KaTeX derivations.

### 3. 🏆 Weekly Division League & Global Elo
- **Division Tiers:** Bronze $\rightarrow$ Silver $\rightarrow$ Gold $\rightarrow$ Platinum $\rightarrow$ Diamond $\rightarrow$ Master $\rightarrow$ Grandmaster.
- **Sunday Reset:** Weekly RP resets every Sunday at 23:59 UTC with promotion/demotion banners.
- **Subject Elo:** Independent rating tracking for Physics, Chemistry, Mathematics, and Overall.
- **Academic Prestige:** Chapter accuracy radars, speed percentiles, predicted AIR rank brackets, and monthly medal cabinets.

---

## 🌐 Playing with Friends

### Option A: Local WiFi
Anyone on your home WiFi or hotspot can join by opening `http://<YOUR_LOCAL_IP>:8000`.

### Option B: Free Cloudflare / Ngrok Tunnel
```bash
# In another terminal:
cloudflared tunnel --url http://localhost:8000
# or
ngrok http 8000
```
Share the generated HTTPS URL with your friends anywhere in the world!

### Option C: 100% Free Cloud Deployment (Render / Railway)
- Push this repo to GitHub.
- Connect to [Render.com](https://render.com) using the included `Dockerfile` or `render.yaml`.
- Enjoy a permanent 24/7 competitive arena!
