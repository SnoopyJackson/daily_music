import { useState, useEffect } from "react";
import SpotifyDashboard from "./SpotifyDashboard.jsx";

const challenges = [
  { type: "letter", emoji: "🔤", label: "Starting Letter", color: "#FF6B35", generate: () => {
    const letters = "ABCDEFGHIJKLMNOPRSTW".split("");
    const l = letters[Math.floor(Math.random() * letters.length)];
    return { title: `Letter "${l}" Day`, desc: `Only listen to bands or artists whose name starts with the letter ${l}`, detail: `Explore acts like every artist beginning with "${l}" — from legends to hidden gems.` };
  }},
  { type: "genre", emoji: "🎸", label: "Genre Dive", color: "#7C3AED", generate: () => {
    const genres = ["Black Metal","Shoegaze","Bossa Nova","Drum & Bass","Neo-Soul","Post-Punk","Ambient Techno","Grunge","Afrobeat","Psychedelic Folk","Doom Metal","Trip-Hop","Chamber Pop","Reggaeton","Free Jazz","Synthwave","Math Rock","Cumbia","Gothic Rock","Emo","Noise Pop","Blues Rock","K-Pop","Flamenco","Industrial"];
    const g = genres[Math.floor(Math.random() * genres.length)];
    return { title: `${g} Only`, desc: `Dedicate today entirely to ${g}`, detail: `Immerse yourself completely in the sounds, textures, and culture of ${g}. Go deep — don't just skim the surface.` };
  }},
  { type: "country", emoji: "🌍", label: "Country Focus", color: "#059669", generate: () => {
    const countries = [["Iceland 🇮🇸","Iceland"],["Japan 🇯🇵","Japan"],["Brazil 🇧🇷","Brazil"],["Nigeria 🇳🇬","Nigeria"],["Jamaica 🇯🇲","Jamaica"],["Sweden 🇸🇪","Sweden"],["Cuba 🇨🇺","Cuba"],["South Korea 🇰🇷","South Korea"],["Ethiopia 🇪🇹","Ethiopia"],["Germany 🇩🇪","Germany"],["Colombia 🇨🇴","Colombia"],["Australia 🇦🇺","Australia"],["Mali 🇲🇱","Mali"],["Portugal 🇵🇹","Portugal"],["Argentina 🇦🇷","Argentina"],["Finland 🇫🇮","Finland"],["Algeria 🇩🇿","Algeria"],["New Zealand 🇳🇿","New Zealand"]];
    const [flag, name] = countries[Math.floor(Math.random() * countries.length)];
    return { title: `${flag} Day`, desc: `Explore music only from ${name} today`, detail: `Discover what makes ${name}'s music scene unique — its rhythms, languages, and sounds that shaped a culture.` };
  }},
  { type: "decade", emoji: "📅", label: "Time Travel", color: "#DC2626", generate: () => {
    const decades = [["the 1960s","60s"],["the 1970s","70s"],["the 1980s","80s"],["the 1990s","90s"],["the 2000s","00s"],["the 1950s","50s"],["the 1940s","40s"]];
    const [full, short] = decades[Math.floor(Math.random() * decades.length)];
    return { title: `${short} Time Capsule`, desc: `Only listen to music released in ${full}`, detail: `Step into ${full} — every track, album, and artist must come from that decade. Feel the era.` };
  }},
  { type: "mood", emoji: "🎭", label: "Mood Mission", color: "#0891B2", generate: () => {
    const moods = [["Melancholic","sad, introspective, and bittersweet"],["Euphoric","uplifting, joyful, and energizing"],["Aggressive","intense, loud, and cathartic"],["Dreamy","hazy, ethereal, and atmospheric"],["Angry","raw, furious, and unfiltered"],["Romantic","tender, longing, and intimate"],["Anxious","tense, nervous, and unsettling"],["Triumphant","powerful, victorious, and inspiring"],["Lonely","isolated, sparse, and quiet"],["Hypnotic","repetitive, trance-like, and meditative"]];
    const [m, desc] = moods[Math.floor(Math.random() * moods.length)];
    return { title: `${m} Vibes Only`, desc: `Every song today must feel ${desc}`, detail: `Curate your entire day around one emotional state: ${m.toLowerCase()}. Let the music match your inner world — or shift it.` };
  }},
  { type: "instrument", emoji: "🎺", label: "Instrument Focus", color: "#B45309", generate: () => {
    const instruments = ["saxophone","violin","cello","trumpet","harp","banjo","accordion","theremin","sitar","organ","flute","harmonica","pedal steel guitar","upright bass","marimba"];
    const i = instruments[Math.floor(Math.random() * instruments.length)];
    return { title: `${i.charAt(0).toUpperCase()+i.slice(1)} Day`, desc: `Only listen to music where the ${i} plays a prominent role`, detail: `Follow the ${i} across genres and eras. Let one instrument be your guide through completely different worlds of sound.` };
  }},
  { type: "solo", emoji: "🧑‍🎤", label: "Solo vs Band", color: "#9333EA", generate: () => {
    const choice = Math.random() > 0.5;
    return choice
      ? { title: "Solo Artists Only", desc: "Only solo artists & singer-songwriters today — no bands", detail: "Explore the intimacy of a single voice and vision. No bands, no groups — just individuals baring it all." }
      : { title: "Bands Only", desc: "Only proper bands today — no solo acts", detail: "Celebrate the alchemy of musicians playing together. Duos, trios, quartets, full orchestras — anything collaborative." };
  }},
  { type: "alphabet_song", emoji: "🔡", label: "Song Letter", color: "#E11D48", generate: () => {
    const letters = "ABCDEFGHIJKLMNOPRSTW".split("");
    const l = letters[Math.floor(Math.random() * letters.length)];
    return { title: `Songs Starting with "${l}"`, desc: `Every song title today must begin with the letter ${l}`, detail: `Hunt down tracks whose title starts with "${l}" — doesn't matter the artist or genre, just find those songs.` };
  }},
  { type: "bpm", emoji: "💓", label: "BPM Rule", color: "#16A34A", generate: () => {
    const bpms = [["Slow & Soulful","under 80 BPM — ballads, ambient, slow jams"],["Mid-tempo","between 90–110 BPM — rock, soul, classic pop"],["High Energy","over 130 BPM — dance, metal, punk, techno"]];
    const [name, desc] = bpms[Math.floor(Math.random() * bpms.length)];
    return { title: `${name} Day`, desc: `Stick to tracks ${desc}`, detail: `Pace your entire day with one tempo. Notice how consistent energy shapes your mood and focus.` };
  }},
  { type: "collab", emoji: "🤝", label: "Collab Hunt", color: "#EA580C", generate: () => {
    return { title: "Collabs Only", desc: "Only listen to tracks featuring guest artists or collaborations", detail: `Seek out every 'feat.', duet, split EP, and unexpected crossover. Today is about chemistry between artists.` };
  }},
  { type: "nolanguage", emoji: "🤫", label: "No English", color: "#7C3AED", generate: () => {
    return { title: "Non-English Day", desc: "Zero English lyrics allowed today", detail: `Explore music in every language except English. Spanish, French, Arabic, Japanese, Swahili — the world is enormous.` };
  }},
  { type: "debut", emoji: "🌱", label: "Debut Albums", color: "#0D9488", generate: () => {
    return { title: "Debut Albums Only", desc: "Only listen to artists' very first albums or EPs today", detail: `There's something raw and unfiltered about a debut. Find the hungrier, scrappier versions of artists you love.` };
  }},
  { type: "liveonly", emoji: "🎤", label: "Live Recordings", color: "#B91C1C", generate: () => {
    return { title: "Live Recordings Only", desc: "Only live albums, concert recordings, and live sessions", detail: `Studio perfection is gone. Today is about energy, mistakes, crowd roars, and the real thing. Live only.` };
  }},
];

const STORAGE_KEY = "musicDailyChallenge_v1";

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function pickRandom(exclude = []) {
  const available = challenges.filter(c => !exclude.includes(c.type));
  const pool = available.length > 0 ? available : challenges;
  const template = pool[Math.floor(Math.random() * pool.length)];
  return { ...template.generate(), type: template.type, emoji: template.emoji, color: template.color, label: template.label };
}

export default function App() {
  const [challenge, setChallenge] = useState(null);
  const [history, setHistory] = useState([]);
  const [rerolled, setRerolled] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // Switch to Spotify tab automatically on OAuth callback
  const [activeTab, setActiveTab] = useState(
    window.location.search.includes("code=") ? "spotify" : "challenge"
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const today = getTodayKey();
      if (saved.date === today && saved.challenge) {
        setChallenge(saved.challenge);
        setAccepted(saved.accepted || false);
        setRerolled(saved.rerolled || 0);
      } else {
        const c = pickRandom();
        setChallenge(c);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, challenge: c, accepted: false, rerolled: 0 }));
      }
      setHistory(JSON.parse(localStorage.getItem(STORAGE_KEY + "_history") || "[]"));
    } catch {
      const c = pickRandom();
      setChallenge(c);
    }
  }, []);

  function saveState(c, acc, r) {
    const today = getTodayKey();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, challenge: c, accepted: acc, rerolled: r }));
  }

  function handleAccept() {
    setAccepted(true);
    saveState(challenge, true, rerolled);
    const h = JSON.parse(localStorage.getItem(STORAGE_KEY + "_history") || "[]");
    const entry = { date: getTodayKey(), ...challenge };
    const updated = [entry, ...h.filter(e => e.date !== getTodayKey())].slice(0, 14);
    localStorage.setItem(STORAGE_KEY + "_history", JSON.stringify(updated));
    setHistory(updated);
  }

  function handleReroll() {
    if (rerolled >= 2) return;
    setAnimating(true);
    setTimeout(() => {
      const usedTypes = history.slice(0, 5).map(h => h.type);
      const c = pickRandom([...usedTypes, challenge?.type]);
      const r = rerolled + 1;
      setChallenge(c);
      setRerolled(r);
      setAccepted(false);
      saveState(c, false, r);
      setAnimating(false);
    }, 500);
  }

  function handleNewDay() {
    setAnimating(true);
    setTimeout(() => {
      const c = pickRandom();
      setChallenge(c);
      setRerolled(0);
      setAccepted(false);
      saveState(c, false, 0);
      setAnimating(false);
    }, 500);
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="root">
      {/* Noise texture overlay */}
      <div className="noise" />

      {/* Header */}
      <header className="header">
        <div className="logo-area">
          <span className="logo-icon">◈</span>
          <span className="logo-text">LISTEN UP</span>
        </div>
        <div className="tab-switcher">
          <button
            className={`tab-btn${activeTab === "challenge" ? " active" : ""}`}
            onClick={() => { setActiveTab("challenge"); setShowHistory(false); }}
          >Challenge</button>
          <button
            className={`tab-btn${activeTab === "spotify" ? " active" : ""}`}
            onClick={() => setActiveTab("spotify")}
          >Spotify</button>
        </div>
        <div className="header-right">
          {activeTab === "challenge" && (
            <button className="history-btn" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? "← Back" : "History"}
            </button>
          )}
        </div>
      </header>

      {activeTab === "spotify" ? (
        <SpotifyDashboard />
      ) : showHistory ? (
        <HistoryPanel history={history} onClose={() => setShowHistory(false)} />
      ) : (
        <main className="main">
          <p className="date-label">{today}</p>
          <p className="subtitle">YOUR LISTENING CHALLENGE</p>

          {/* Card */}
          <div className="card" style={{ opacity: animating ? 0 : 1, transform: animating ? "translateY(16px) scale(0.97)" : "translateY(0) scale(1)", borderColor: challenge?.color || "#fff" }}>
            {challenge && (
              <>
                <div className="card-accent" style={{ background: challenge.color }} />
                <div className="card-top">
                  <span className="emoji">{challenge.emoji}</span>
                  <span className="type-badge" style={{ background: challenge.color + "22", color: challenge.color, borderColor: challenge.color + "44" }}>
                    {challenge.label}
                  </span>
                </div>
                <h1 className="challenge-title">{challenge.title}</h1>
                <p className="challenge-desc">{challenge.desc}</p>
                <div className="divider" />
                <p className="challenge-detail">{challenge.detail}</p>

                {accepted && (
                  <div className="accepted-banner" style={{ borderColor: challenge.color, color: challenge.color }}>
                    ✓ Challenge Accepted
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {!accepted ? (
            <div className="actions">
              <button className="btn btn-primary" style={{ background: challenge?.color }} onClick={handleAccept}>
                Accept Challenge
              </button>
              <button
                className="btn btn-secondary"
                style={{ opacity: rerolled >= 2 ? 0.4 : 1, cursor: rerolled >= 2 ? "not-allowed" : "pointer" }}
                onClick={handleReroll}
                disabled={rerolled >= 2}
              >
                Reroll {rerolled > 0 ? `(${2 - rerolled} left)` : "(×2 max)"}
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="btn btn-outline" onClick={handleNewDay}>
                Try Another Challenge
              </button>
            </div>
          )}

          {/* Challenge types preview */}
          <div className="types">
            {challenges.slice(0, 7).map(c => (
              <span key={c.type} className="type-chip" style={{ background: c.color + "18", color: c.color }}>
                {c.emoji} {c.label}
              </span>
            ))}
            <span className="type-chip">+{challenges.length - 7} more</span>
          </div>
        </main>
      )}
    </div>
  );
}

function HistoryPanel({ history }) {
  if (history.length === 0) {
    return (
      <div className="history-empty">
        <p>No history yet. Accept a challenge first.</p>
      </div>
    );
  }
  return (
    <div className="history-panel">
      <h2 className="history-title">Past Challenges</h2>
      {history.map((h, i) => (
        <div key={i} className="history-item" style={{ borderLeftColor: h.color }}>
          <span className="history-emoji">{h.emoji}</span>
          <div>
            <p className="history-item-title">{h.title}</p>
            <p className="history-item-date">{h.date}</p>
          </div>
        </div>
      ))}
    </div>
  );
}


