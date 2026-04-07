<h1 align="center">⚔️ Royale Draft</h1>

<p align="center">
  <strong>Esports-Grade Real-Time Multiplayer Clash Royale Draft Builder</strong>
</p>

<p align="center">
  <a href="https://royale-ban-draft-production.up.railway.app/"><strong>Live Demo</strong></a>
</p>

---

## 📌 Overview

**Royale Draft** is a real-time multiplayer web application that lets two players connect instantly and draft Clash Royale decks using a competitive "pick and ban" format. 

Built with WebSockets and designed completely mobile-first, it features zero-friction room joining, active sync, procedural audio feedback, and a premium "glassmorphism" UI modeled after modern game clients.

## ✨ Key Features

* **Instant Multiplayer (Socket.IO):** 2-tap zero-friction flow. Player 1 creates a room, shares the link, and Player 2 joins instantly to start the draft.
* **Full Card Pool:** 110 accurate Clash Royale cards with HD assets, precise elixir costs, and assigned rarities.
* **Advanced Filtering & Sorting:** Rapidly filter the live grid by Elixir cost (`1` through `7+`), Rarity, and Category (Troop, Spell, Building). Alphabetical and Elixir-based sorting.
* **Competitive Draft Flow:** 28 total steps. Each player alternates banning 2 cards, then alternates picking 8 cards to form their final decks.
* **Opponent Intent Tracking:** Real-time visual pulses show exactly which card your opponent is hovering over across the network.
* **Procedural Sound Engine:** Custom Web Audio API synthesizers dynamically generate high-quality sound effects for hovers, selections, and turn changes directly within the browser.
* **Premium UI/UX:**
  * Animated "card shimmer" for Epic, Legendary, and Champion cards.
  * Contextual screen-edge glows to visually notify players when it's their turn to act.
  * Responsive, mobile-first grid layout that scales beautifully from 4k monitors down to small phones.

## 🛠️ Tech Stack

* **Backend:** Node.js, Express, Socket.IO
* **Frontend:** Vanilla HTML5, CSS3 (Custom Design System tokens), Vanilla JavaScript (ES6+)
* **Deployment:** Hosted on Railway

## 🚀 Playing Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/emaraitchmsc/royale-ban-draft.git
   cd royale-ban-draft
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser. Open a second incognito window to act as Player 2.

## 🤝 Credits
Card data and imagery sourced dynamically via [RoyaleAPI](https://royaleapi.com/).
