import { useState, useEffect } from "react";
import { initiateLogin, logout, isLoggedIn, handleCallback } from "./spotify-auth.js";
import {
  getProfile, getTopTracks, getTopArtists,
  getRecentlyPlayed, getNowPlaying, getPlaylists,
} from "./spotify-api.js";
import { ingestRecentlyPlayed, getOverviewStats } from "./spotify-tracker.js";
import "./spotify-dashboard.css";

const TIME_RANGES = [
  { key: "short_term",  label: "4 Weeks" },
  { key: "medium_term", label: "6 Months" },
  { key: "long_term",   label: "All Time" },
];

function msToMinSec(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function fmtMin(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function SpotifyDashboard() {
  const [loggedIn, setLoggedIn]           = useState(isLoggedIn());
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [profile, setProfile]             = useState(null);
  const [nowPlaying, setNowPlaying]       = useState(null);
  const [timeRange, setTimeRange]         = useState("medium_term");
  const [topTracks, setTopTracks]         = useState(null);
  const [topArtists, setTopArtists]       = useState(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState(null);
  const [playlists, setPlaylists]         = useState(null);
  const [stats, setStats]                 = useState(() => getOverviewStats());

  // Handle OAuth callback redirect
  useEffect(() => {
    if (!window.location.search.includes("code=")) return;
    setLoading(true);
    handleCallback()
      .then(success => {
        if (!success) setError("Login failed — the authorization code may have expired. Please try again.");
        setLoggedIn(success);
      })
      .catch((err) => {
        console.error("Spotify callback error:", err);
        setError("Connection to Spotify failed: " + (err.message || "Unknown error"));
      })
      .finally(() => setLoading(false));
  }, []);

  // Load static data on login
  useEffect(() => {
    if (!loggedIn) return;
    Promise.all([
      getProfile(),
      getNowPlaying(),
      getRecentlyPlayed(50),
      getPlaylists(12),
    ]).then(([p, np, rp, pl]) => {
      if (!p && !isLoggedIn()) {
        setLoggedIn(false);
        return;
      }
      setProfile(p);
      setNowPlaying(np);
      setRecentlyPlayed(rp);
      setPlaylists(pl);
      const tracked = ingestRecentlyPlayed(rp?.items);
      setStats(getOverviewStats(tracked));
    }).catch(() => {
      if (!isLoggedIn()) setLoggedIn(false);
    });
  }, [loggedIn]);

  // Reload top tracks/artists when time range changes
  useEffect(() => {
    if (!loggedIn) return;
    setTopTracks(null);
    setTopArtists(null);
    Promise.all([
      getTopTracks(timeRange, 20),
      getTopArtists(timeRange, 10),
    ]).then(([tt, ta]) => {
      if (!tt && !ta && !isLoggedIn()) {
        setLoggedIn(false);
        return;
      }
      setTopTracks(tt ?? { items: [] });
      setTopArtists(ta ?? { items: [] });
    }).catch(() => {
      if (!isLoggedIn()) {
        setLoggedIn(false);
      } else {
        setTopTracks({ items: [] });
        setTopArtists({ items: [] });
      }
    });
  }, [loggedIn, timeRange]);

  // Poll now playing every 30 s
  useEffect(() => {
    if (!loggedIn) return;
    const id = setInterval(() => {
      getNowPlaying().then(setNowPlaying);
    }, 30_000);
    return () => clearInterval(id);
  }, [loggedIn]);

  function handleLogout() {
    logout();
    setLoggedIn(false);
    setProfile(null);
    setNowPlaying(null);
    setTopTracks(null);
    setTopArtists(null);
    setRecentlyPlayed(null);
    setPlaylists(null);
  }

  if (loading) {
    return (
      <div className="sp-loading">
        <div className="sp-spinner" />
        <p className="sp-loading-text">Connecting to Spotify…</p>
      </div>
    );
  }

  if (!loggedIn) return <LoginScreen error={error} />;

  // Derive top genres from top artists
  const genreCount = {};
  (topArtists?.items ?? []).forEach(a =>
    (a.genres ?? []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; })
  );
  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxGenreCount = topGenres[0]?.[1] ?? 1;

  // Derive top albums from top tracks
  const albumMap = {};
  (topTracks?.items ?? []).forEach(track => {
    const album = track.album;
    if (!album?.id) return;
    if (!albumMap[album.id]) {
      albumMap[album.id] = {
        id: album.id,
        name: album.name,
        images: album.images,
        artist: (track.artists ?? []).map(a => a.name).join(", "),
        count: 0,
      };
    }
    albumMap[album.id].count++;
  });
  const topAlbums = Object.values(albumMap).sort((a, b) => b.count - a.count).slice(0, 8);

  // Artist loyalty: how concentrated are your top tracks among few artists?
  const artistIdsInTop = new Set();
  (topTracks?.items ?? []).forEach(t => (t.artists ?? []).forEach(a => { if (a.id) artistIdsInTop.add(a.id); }));
  const totalTopTracks = topTracks?.items?.length || 0;
  const loyalty = totalTopTracks > 1
    ? Math.round((1 - (artistIdsInTop.size - 1) / (totalTopTracks - 1)) * 100)
    : 0;

  return (
    <div className="sp-dashboard">

      {/* Profile bar */}
      {profile && (
        <div className="sp-profile">
          {profile.images?.[0]?.url
            ? <img className="sp-avatar" src={profile.images[0].url} alt={profile.display_name} />
            : <div className="sp-avatar sp-avatar-placeholder">◈</div>
          }
          <div className="sp-profile-info">
            <p className="sp-profile-name">{profile.display_name}</p>
            <p className="sp-profile-sub">
              {(profile.followers?.total ?? 0).toLocaleString()} followers
              {profile.product && ` · ${profile.product}`}
            </p>
          </div>
          <button className="sp-logout-btn" onClick={handleLogout}>Disconnect</button>
        </div>
      )}

      {/* Now Playing */}
      {nowPlaying?.item && (
        <NowPlayingCard track={nowPlaying.item} progress={nowPlaying.progress_ms ?? 0} />
      )}

      {/* Overview Stats */}
      <div className="sp-overview">
        <div className="sp-stat-card">
          <p className="sp-stat-icon">🎧</p>
          <p className="sp-stat-value">{fmtMin(stats.today.minutes)}</p>
          <p className="sp-stat-label">Today</p>
          <p className="sp-stat-sub">{stats.today.tracks} plays · {stats.today.uniqueArtists} artists</p>
        </div>
        <div className="sp-stat-card">
          <p className="sp-stat-icon">📅</p>
          <p className="sp-stat-value">{fmtMin(stats.week.minutes)}</p>
          <p className="sp-stat-label">This Week</p>
          <p className="sp-stat-sub">{stats.week.tracks} plays</p>
        </div>
        <div className="sp-stat-card">
          <p className="sp-stat-icon">📊</p>
          <p className="sp-stat-value">{fmtMin(stats.month.minutes)}</p>
          <p className="sp-stat-label">This Month</p>
          <p className="sp-stat-sub">{stats.month.tracks} plays · {stats.month.artists} artists</p>
        </div>
        <div className="sp-stat-card">
          <p className="sp-stat-icon">🔥</p>
          <p className="sp-stat-value">{stats.streak}</p>
          <p className="sp-stat-label">Day Streak</p>
          <p className="sp-stat-sub">avg {fmtMin(stats.avgDailyMinutes)}/day</p>
        </div>
      </div>

      {/* Listening Activity */}
      {stats.activity.some(a => a.minutes > 0) && (
        <section className="sp-section">
          <h3 className="sp-section-title">Listening Activity</h3>
          <div className="sp-activity-chart">
            {stats.activity.map(a => (
              <div key={a.date} className="sp-activity-col">
                {a.minutes > 0 && <span className="sp-activity-val">{a.minutes}m</span>}
                <div
                  className={`sp-activity-bar${a.minutes === 0 ? " sp-activity-empty" : ""}`}
                  style={{ height: `${Math.max((a.minutes / stats.maxActivityMin) * 100, a.minutes > 0 ? 8 : 3)}%` }}
                />
                <span className="sp-activity-day">{a.day}{a.num}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stats section header */}
      <div className="sp-stats-header">
        <p className="sp-stats-label">YOUR TOP STATS</p>
        <div className="sp-time-tabs">
          {TIME_RANGES.map(r => (
            <button
              key={r.key}
              className={`sp-time-tab${timeRange === r.key ? " active" : ""}`}
              onClick={() => setTimeRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Tracks */}
      <section className="sp-section">
        <h3 className="sp-section-title">Top Tracks</h3>
        {topTracks
          ? <TrackList tracks={topTracks.items} showRank />
          : <SkeletonList rows={10} />
        }
      </section>

      {/* Top Albums */}
      {topAlbums.length > 0 && (
        <section className="sp-section">
          <h3 className="sp-section-title">Top Albums</h3>
          <div className="sp-album-grid">
            {topAlbums.map(album => (
              <div key={album.id} className="sp-album-card">
                {album.images?.[1]?.url
                  ? <img className="sp-album-img" src={album.images[1].url} alt={album.name} />
                  : <div className="sp-album-img sp-album-placeholder">💿</div>
                }
                <p className="sp-album-name">{album.name}</p>
                <p className="sp-album-artist">{album.artist}</p>
                <p className="sp-album-count">{album.count} top track{album.count > 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top Artists */}
      <section className="sp-section">
        <h3 className="sp-section-title">Top Artists</h3>
        {topArtists
          ? (
            <div className="sp-artist-grid">
              {topArtists.items.map((artist, i) => (
                <div key={artist.id} className="sp-artist-card">
                  {artist.images?.[1]?.url
                    ? <img className="sp-artist-img" src={artist.images[1].url} alt={artist.name} />
                    : <div className="sp-artist-img sp-artist-placeholder">🎤</div>
                  }
                  <span className="sp-artist-rank">#{i + 1}</span>
                  <p className="sp-artist-name">{artist.name}</p>
                  <p className="sp-artist-genre">{artist.genres?.[0] ?? "—"}</p>
                </div>
              ))}
            </div>
          )
          : (
            <div className="sp-artist-grid">
              {Array(10).fill(null).map((_, i) => <div key={i} className="sp-skeleton-card" />)}
            </div>
          )
        }
      </section>

      {/* Top Genres */}
      {topGenres.length > 0 && (
        <section className="sp-section">
          <h3 className="sp-section-title">Top Genres</h3>
          <div className="sp-genre-list">
            {topGenres.map(([genre, count], i) => (
              <div key={genre} className="sp-genre-row">
                <span className="sp-genre-rank">{i + 1}</span>
                <span className="sp-genre-name">{genre}</span>
                <div className="sp-genre-bar-track">
                  <div className="sp-genre-bar-fill" style={{ width: `${(count / maxGenreCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Discovery & Loyalty */}
      <div className="sp-discovery">
        <div className="sp-disc-card">
          <p className="sp-disc-value">{stats.month.newArtists}</p>
          <p className="sp-disc-label">New Artists This Month</p>
        </div>
        <div className="sp-disc-card">
          <p className="sp-disc-value">{stats.totalKnownArtists}</p>
          <p className="sp-disc-label">Artists Discovered</p>
        </div>
        <div className="sp-disc-card">
          <p className="sp-disc-value">{loyalty}%</p>
          <p className="sp-disc-label">Artist Loyalty</p>
        </div>
      </div>

      {/* Recently Played */}
      {recentlyPlayed?.items?.length > 0 && (
        <section className="sp-section">
          <h3 className="sp-section-title">Recently Played</h3>
          <div className="sp-track-list">
            {recentlyPlayed.items.filter(item => item.track).slice(0, 10).map((item, i) => (
              <div key={`${item.track.id}-${i}`} className="sp-track-row">
                <img className="sp-track-img" src={item.track.album?.images?.[2]?.url ?? item.track.album?.images?.[0]?.url} alt={item.track.name} />
                <div className="sp-track-info">
                  <p className="sp-track-name">{item.track.name}</p>
                  <p className="sp-track-artist">{(item.track.artists ?? []).map(a => a.name).join(", ")}</p>
                </div>
                <span className="sp-track-meta">
                  {new Date(item.played_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Playlists */}
      {playlists?.items?.length > 0 && (
        <section className="sp-section">
          <h3 className="sp-section-title">Your Playlists</h3>
          <div className="sp-playlist-grid">
            {playlists.items.map(pl => (
              <a
                key={pl.id}
                className="sp-playlist-card"
                href={pl.external_urls?.spotify ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                {pl.images?.[0]?.url
                  ? <img className="sp-playlist-img" src={pl.images[0].url} alt={pl.name} />
                  : <div className="sp-playlist-img sp-playlist-placeholder">♫</div>
                }
                <p className="sp-playlist-name">{pl.name}</p>
                <p className="sp-playlist-count">{pl.tracks?.total ?? 0} tracks</p>
              </a>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function LoginScreen({ error }) {
  const redirectUri = window.location.origin + window.location.pathname.replace(/\/$/, '') + '/';
  return (
    <div className="sp-login">
      <div className="sp-login-icon">♫</div>
      <h2 className="sp-login-title">Spotify Dashboard</h2>
      <p className="sp-login-desc">
        Connect your Spotify account to see your top tracks, artists, genres, and listening stats.
      </p>
      {error && (
        <div style={{ background: '#2a1515', border: '1px solid #5c2020', borderRadius: 2, padding: '10px 16px', marginBottom: 20, width: '100%', maxWidth: 380, boxSizing: 'border-box' }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#e88', margin: 0, lineHeight: 1.5 }}>{error}</p>
        </div>
      )}
      <button className="sp-login-btn" onClick={initiateLogin}>
        Connect Spotify
      </button>
      <div className="sp-login-uri-box">
        <p className="sp-login-uri-label">ADD THIS EXACT URI TO YOUR SPOTIFY APP</p>
        <code className="sp-login-uri">{redirectUri}</code>
        <p className="sp-login-uri-hint">
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">
            Open Spotify Dashboard
          </a>
          {" → your app → Edit Settings → Redirect URIs → Add → Save"}
        </p>
      </div>
    </div>
  );
}

function NowPlayingCard({ track, progress }) {
  const pct = track.duration_ms ? (progress / track.duration_ms) * 100 : 0;
  return (
    <div className="sp-now-playing">
      <p className="sp-now-label">▶ NOW PLAYING</p>
      <div className="sp-now-inner">
        <img
          className="sp-now-img"
          src={track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url}
          alt={track.name}
        />
        <div className="sp-now-info">
          <p className="sp-now-track">{track.name}</p>
          <p className="sp-now-artist">{(track.artists ?? []).map(a => a.name).join(", ")}</p>
          <p className="sp-now-album">{track.album?.name}</p>
          <div className="sp-progress-track">
            <div className="sp-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="sp-now-times">
            <span>{msToMinSec(progress)}</span>
            <span>{msToMinSec(track.duration_ms)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackList({ tracks, showRank }) {
  return (
    <div className="sp-track-list">
      {tracks.map((track, i) => (
        <div key={track.id} className="sp-track-row">
          {showRank && <span className="sp-rank">{i + 1}</span>}
          <img className="sp-track-img" src={track.album?.images?.[2]?.url ?? track.album?.images?.[0]?.url} alt={track.name} />
          <div className="sp-track-info">
            <p className="sp-track-name">{track.name}</p>
            <p className="sp-track-artist">{(track.artists ?? []).map(a => a.name).join(", ")}</p>
          </div>
          <span className="sp-track-meta">{msToMinSec(track.duration_ms)}</span>
        </div>
      ))}
    </div>
  );
}

function SkeletonList({ rows }) {
  return (
    <div className="sp-track-list">
      {Array(rows).fill(null).map((_, i) => (
        <div key={i} className="sp-skeleton-row" />
      ))}
    </div>
  );
}
