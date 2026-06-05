import { useState, useEffect } from "react";
import { initiateLogin, logout, isLoggedIn, handleCallback } from "./spotify-auth.js";
import {
  getProfile, getTopTracks, getTopArtists,
  getRecentlyPlayed, getNowPlaying, getPlaylists,
  getTopTracksAll, getTopArtistsAll, getPlaylistTracks,
} from "./spotify-api.js";
import { ingestRecentlyPlayed, getOverviewStats } from "./spotify-tracker.js";
import { DonutChart, HBarChart, HourChart, DowChart, Heatmap, NetworkGraph } from "./spotify-charts.jsx";
import { getRecommendationsForChallenge } from "./spotify-recommendations.js";
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

export default function SpotifyDashboard({ challenge }) {
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
  const [recs, setRecs]                   = useState(null);
  const [recsLoading, setRecsLoading]     = useState(false);
  const [library, setLibrary]             = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(false);

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

  // Load full library (used by recommendations + search)
  useEffect(() => {
    if (!loggedIn || !playlists) return;
    setLibraryLoading(true);
    (async () => {
      try {
        const [allArtists, allTracks] = await Promise.all([
          getTopArtistsAll(),
          getTopTracksAll(),
        ]);
        const plItems = playlists?.items?.slice(0, 8) ?? [];
        const playlistTracksArrays = await Promise.all(
          plItems.map(pl => getPlaylistTracks(pl.id, 100).then(r => (r?.items ?? []).map(i => i?.track).filter(Boolean)))
        );
        const allPlaylistTracks = playlistTracksArrays.flat();
        setLibrary({ artists: allArtists, tracks: allTracks, playlistTracks: allPlaylistTracks });
      } catch (err) {
        console.error("Library load error:", err);
        setLibrary({ artists: [], tracks: [], playlistTracks: [] });
      } finally {
        setLibraryLoading(false);
      }
    })();
  }, [loggedIn, playlists]);

  // Load recommendations when challenge is active
  useEffect(() => {
    if (!loggedIn || !challenge || !library) { setRecs(null); return; }
    setRecsLoading(true);
    try {
      const result = getRecommendationsForChallenge(challenge, {
        topArtists: library.artists,
        topTracks: library.tracks,
        playlistTracks: library.playlistTracks,
      });
      setRecs(result);
    } catch (err) {
      console.error("Recommendations error:", err);
      setRecs({ artists: [], tracks: [] });
    } finally {
      setRecsLoading(false);
    }
  }, [loggedIn, challenge, library]);

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

  // Genre donut chart data
  const GENRE_COLORS = ['#1DB954','#FF6B35','#7C3AED','#DC2626','#0891B2','#B45309','#E11D48','#059669','#9333EA','#16A34A'];
  const genreDonut = topGenres.slice(0, 8).map(([genre, count], i) => ({
    label: genre, value: count, color: GENRE_COLORS[i % GENRE_COLORS.length],
  }));

  // Artist bar chart data
  const artistBars = (topArtists?.items ?? []).slice(0, 10).map(a => ({
    label: a.name,
    value: a.popularity ?? 0,
    sub: (a.genres ?? []).slice(0, 2).join(', '),
  }));

  // Artist relationship graph: artists connected by shared genres
  const artistNodes = (topArtists?.items ?? []).slice(0, 10).map((a, i) => ({
    id: a.id,
    label: a.name,
    size: 8 - i * 0.5,
    color: GENRE_COLORS[i % GENRE_COLORS.length],
  }));
  const artistLinks = [];
  const items = (topArtists?.items ?? []).slice(0, 10);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const shared = (items[i].genres ?? []).filter(g => (items[j].genres ?? []).includes(g));
      if (shared.length > 0) {
        artistLinks.push({ source: items[i].id, target: items[j].id, weight: shared.length });
      }
    }
  }

  // Genre connections graph: genres connected when they co-occur on artists
  const genreNodes = [];
  const genreLinkMap = {};
  const allGenres = new Set();
  (topArtists?.items ?? []).forEach(a => {
    const gs = (a.genres ?? []).slice(0, 5);
    gs.forEach(g => allGenres.add(g));
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        const key = [gs[i], gs[j]].sort().join('||');
        genreLinkMap[key] = (genreLinkMap[key] || 0) + 1;
      }
    }
  });
  const topGenreNames = [...allGenres].slice(0, 15);
  topGenreNames.forEach((g, i) => {
    genreNodes.push({ id: g, label: g, size: 6, color: GENRE_COLORS[i % GENRE_COLORS.length] });
  });
  const genreLinks = Object.entries(genreLinkMap)
    .filter(([key]) => {
      const [a, b] = key.split('||');
      return topGenreNames.includes(a) && topGenreNames.includes(b);
    })
    .map(([key, weight]) => {
      const [source, target] = key.split('||');
      return { source, target, weight };
    });

  // Heatmap data (last 8 weeks = 56 days)
  const heatmapData = [];
  for (let i = 55; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = stats.activity?.find(a => a.date === key);
    heatmapData.push({
      date: key,
      minutes: day?.minutes || 0,
    });
  }

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

      {/* Challenge Recommendations */}
      {challenge && (
        <ChallengeRecommendations
          challenge={challenge}
          recs={recs}
          loading={recsLoading}
        />
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

      {/* ── Charts ─────────────────────────────────────────── */}

      {/* Listening Heatmap */}
      <section className="sp-section">
        <h3 className="sp-section-title">Listening Heatmap</h3>
        <Heatmap activity={heatmapData} />
      </section>

      {/* Hour of Day / Day of Week */}
      <div className="sp-charts-row">
        <section className="sp-section sp-chart-half">
          <h3 className="sp-section-title">By Hour of Day</h3>
          <HourChart hours={stats.hours} />
        </section>
        <section className="sp-section sp-chart-half">
          <h3 className="sp-section-title">By Day of Week</h3>
          <DowChart dow={stats.dow} />
        </section>
      </div>

      {/* Genre Distribution / Top Artists Bar */}
      <div className="sp-charts-row">
        <section className="sp-section sp-chart-half">
          <h3 className="sp-section-title">Genre Distribution</h3>
          {genreDonut.length > 0
            ? <DonutChart data={genreDonut} size={180} />
            : <SkeletonList rows={3} />
          }
        </section>
        <section className="sp-section sp-chart-half">
          <h3 className="sp-section-title">Top Artists by Popularity</h3>
          {artistBars.length > 0
            ? <HBarChart data={artistBars} />
            : <SkeletonList rows={5} />
          }
        </section>
      </div>

      {/* ── Network Graphs ─────────────────────────────────── */}

      {/* Artist Relationship */}
      {artistNodes.length > 2 && artistLinks.length > 0 && (
        <section className="sp-section">
          <h3 className="sp-section-title">Artist Relationships</h3>
          <p className="sp-chart-desc">Artists connected by shared genres</p>
          <div className="sp-network-wrap">
            <NetworkGraph nodes={artistNodes} links={artistLinks} width={500} height={320} />
          </div>
        </section>
      )}

      {/* Genre Connections */}
      {genreNodes.length > 2 && genreLinks.length > 0 && (
        <section className="sp-section">
          <h3 className="sp-section-title">Genre Connections</h3>
          <p className="sp-chart-desc">Genres linked through your top artists</p>
          <div className="sp-network-wrap">
            <NetworkGraph nodes={genreNodes} links={genreLinks} width={500} height={320} />
          </div>
        </section>
      )}

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

      {/* Library Search */}
      <LibrarySearch library={library} loading={libraryLoading} />

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

function ChallengeRecommendations({ challenge, recs, loading }) {
  const hasResults = recs && (recs.artists.length > 0 || recs.tracks.length > 0);

  return (
    <div className="sp-recs" style={{ borderColor: challenge.color }}>
      <div className="sp-recs-header">
        <span className="sp-recs-emoji">{challenge.emoji}</span>
        <div>
          <p className="sp-recs-title">Today's Challenge</p>
          <p className="sp-recs-challenge" style={{ color: challenge.color }}>{challenge.title}</p>
          <p className="sp-recs-desc">{challenge.desc}</p>
        </div>
      </div>

      {loading && (
        <div className="sp-recs-loading">
          <div className="sp-spinner" style={{ borderTopColor: challenge.color, width: 20, height: 20 }} />
          <span>Finding matches in your library…</span>
        </div>
      )}

      {!loading && hasResults && (
        <>
          <p className="sp-recs-subtitle">FROM YOUR LIBRARY</p>

          {recs.artists.length > 0 && (
            <div className="sp-recs-section">
              <p className="sp-recs-label">Matching Artists ({recs.artists.length})</p>
              <div className="sp-recs-artist-grid">
                {recs.artists.slice(0, 12).map(artist => (
                  <div key={artist.id} className="sp-recs-artist">
                    {artist.images?.[1]?.url || artist.images?.[0]?.url
                      ? <img className="sp-recs-artist-img" src={artist.images[1]?.url ?? artist.images[0]?.url} alt={artist.name} />
                      : <div className="sp-recs-artist-img sp-recs-artist-placeholder">🎤</div>
                    }
                    <p className="sp-recs-artist-name">{artist.name}</p>
                    {(artist.genres ?? []).length > 0 && (
                      <p className="sp-recs-artist-genre">{artist.genres[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {recs.tracks.length > 0 && (
            <div className="sp-recs-section">
              <p className="sp-recs-label">Matching Tracks ({recs.tracks.length})</p>
              <div className="sp-track-list">
                {recs.tracks.slice(0, 10).map((track, i) => (
                  <div key={track.id || i} className="sp-track-row">
                    <img className="sp-track-img" src={track.album?.images?.[2]?.url ?? track.album?.images?.[0]?.url} alt={track.name} />
                    <div className="sp-track-info">
                      <p className="sp-track-name">{track.name}</p>
                      <p className="sp-track-artist">{(track.artists ?? []).map(a => a.name).join(", ")}</p>
                    </div>
                    <span className="sp-track-meta">{track.duration_ms ? msToMinSec(track.duration_ms) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && recs && !hasResults && (
        <p className="sp-recs-empty">No matches found in your library for this challenge. Time to explore!</p>
      )}
    </div>
  );
}

function LibrarySearch({ library, loading }) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, letter, genre
  const [selectedLetter, setSelectedLetter] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [showResults, setShowResults] = useState(false);

  // Build deduplicated artist list with genres
  const allArtistMap = {};
  if (library) {
    for (const a of (library.artists ?? [])) {
      if (a?.id) allArtistMap[a.id] = a;
    }
    for (const t of [...(library.tracks ?? []), ...(library.playlistTracks ?? [])]) {
      for (const a of (t?.artists ?? [])) {
        if (a?.id && !allArtistMap[a.id]) {
          allArtistMap[a.id] = { id: a.id, name: a.name, genres: [], images: [], _fromPlaylist: true };
        }
      }
    }
  }
  const allArtists = Object.values(allArtistMap);

  // Collect all unique genres
  const genreSet = new Set();
  allArtists.forEach(a => (a.genres ?? []).forEach(g => genreSet.add(g)));
  const allGenres = [...genreSet].sort();

  // All tracks deduplicated
  const allTrackMap = {};
  if (library) {
    for (const t of [...(library.tracks ?? []), ...(library.playlistTracks ?? [])]) {
      if (t?.id && !allTrackMap[t.id]) allTrackMap[t.id] = t;
    }
  }
  const allTracks = Object.values(allTrackMap);

  // Filter
  let filteredArtists = allArtists;
  let filteredTracks = allTracks;

  if (filterType === 'letter' && selectedLetter) {
    const letter = selectedLetter.toUpperCase();
    filteredArtists = allArtists.filter(a => a.name?.toUpperCase().startsWith(letter));
    const matchedIds = new Set(filteredArtists.map(a => a.id));
    filteredTracks = allTracks.filter(t => (t.artists ?? []).some(a => matchedIds.has(a.id)));
  } else if (filterType === 'genre' && selectedGenre) {
    const g = selectedGenre.toLowerCase();
    filteredArtists = allArtists.filter(a =>
      (a.genres ?? []).some(ag => ag.toLowerCase().includes(g) || g.includes(ag.toLowerCase()))
    );
    const matchedIds = new Set(filteredArtists.map(a => a.id));
    filteredTracks = allTracks.filter(t => (t.artists ?? []).some(a => matchedIds.has(a.id)));
  }

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filteredArtists = filteredArtists.filter(a =>
      a.name?.toLowerCase().includes(q) ||
      (a.genres ?? []).some(g => g.toLowerCase().includes(q))
    );
    filteredTracks = filteredTracks.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      (t.artists ?? []).some(a => a.name?.toLowerCase().includes(q)) ||
      t.album?.name?.toLowerCase().includes(q)
    );
  }

  const hasFilter = query.trim() || (filterType === 'letter' && selectedLetter) || (filterType === 'genre' && selectedGenre);
  const hasResults = filteredArtists.length > 0 || filteredTracks.length > 0;

  // Sort filtered artists by popularity
  filteredArtists.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  return (
    <section className="sp-section sp-search-section">
      <h3 className="sp-section-title">Search Your Library</h3>

      {loading && (
        <div className="sp-recs-loading">
          <div className="sp-spinner" style={{ width: 20, height: 20 }} />
          <span>Loading your library…</span>
        </div>
      )}

      {!loading && library && (
        <>
          {/* Search bar */}
          <div className="sp-search-bar">
            <input
              className="sp-search-input"
              type="text"
              placeholder="Search artists, tracks, albums…"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
            />
            <span className="sp-search-count">{allArtists.length} artists · {allTracks.length} tracks</span>
          </div>

          {/* Filter tabs */}
          <div className="sp-search-filters">
            <button className={`sp-filter-tab${filterType === 'all' ? ' active' : ''}`}
              onClick={() => { setFilterType('all'); setSelectedLetter(''); setSelectedGenre(''); setShowResults(true); }}>All</button>
            <button className={`sp-filter-tab${filterType === 'letter' ? ' active' : ''}`}
              onClick={() => { setFilterType('letter'); setShowResults(true); }}>By Letter</button>
            <button className={`sp-filter-tab${filterType === 'genre' ? ' active' : ''}`}
              onClick={() => { setFilterType('genre'); setShowResults(true); }}>By Genre</button>
          </div>

          {/* Letter picker */}
          {filterType === 'letter' && (
            <div className="sp-letter-grid">
              {LETTERS.map(l => {
                const count = allArtists.filter(a => a.name?.toUpperCase().startsWith(l)).length;
                return (
                  <button
                    key={l}
                    className={`sp-letter-btn${selectedLetter === l ? ' active' : ''}${count === 0 ? ' disabled' : ''}`}
                    onClick={() => { setSelectedLetter(selectedLetter === l ? '' : l); setShowResults(true); }}
                    disabled={count === 0}
                  >
                    <span className="sp-letter-char">{l}</span>
                    <span className="sp-letter-count">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Genre picker */}
          {filterType === 'genre' && (
            <div className="sp-genre-picker">
              {allGenres.slice(0, 40).map(g => (
                <button
                  key={g}
                  className={`sp-genre-chip${selectedGenre === g ? ' active' : ''}`}
                  onClick={() => { setSelectedGenre(selectedGenre === g ? '' : g); setShowResults(true); }}
                >{g}</button>
              ))}
            </div>
          )}

          {/* Results */}
          {showResults && hasFilter && (
            <div className="sp-search-results">
              {hasResults ? (
                <>
                  {filteredArtists.length > 0 && (
                    <div className="sp-search-group">
                      <p className="sp-recs-label">Artists ({filteredArtists.length})</p>
                      <div className="sp-recs-artist-grid">
                        {filteredArtists.slice(0, 18).map(artist => (
                          <div key={artist.id} className="sp-recs-artist">
                            {artist.images?.[1]?.url || artist.images?.[0]?.url
                              ? <img className="sp-recs-artist-img" src={artist.images[1]?.url ?? artist.images[0]?.url} alt={artist.name} />
                              : <div className="sp-recs-artist-img sp-recs-artist-placeholder">🎤</div>
                            }
                            <p className="sp-recs-artist-name">{artist.name}</p>
                            {(artist.genres ?? []).length > 0 && (
                              <p className="sp-recs-artist-genre">{artist.genres[0]}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {filteredTracks.length > 0 && (
                    <div className="sp-search-group">
                      <p className="sp-recs-label">Tracks ({filteredTracks.length})</p>
                      <div className="sp-track-list">
                        {filteredTracks.slice(0, 15).map((track, i) => (
                          <div key={track.id || i} className="sp-track-row">
                            <img className="sp-track-img" src={track.album?.images?.[2]?.url ?? track.album?.images?.[0]?.url} alt={track.name} />
                            <div className="sp-track-info">
                              <p className="sp-track-name">{track.name}</p>
                              <p className="sp-track-artist">{(track.artists ?? []).map(a => a.name).join(', ')}</p>
                            </div>
                            <span className="sp-track-meta">{track.duration_ms ? msToMinSec(track.duration_ms) : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="sp-recs-empty">No matches found.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

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
