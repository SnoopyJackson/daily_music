import { getAccessToken, logout } from './spotify-auth.js';

async function apiFetch(endpoint) {
  const token = await getAccessToken();
  if (!token) { logout(); return null; }

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) { logout(); return null; }
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) return null;

  return res.json();
}

export const getProfile = () =>
  apiFetch('/me');

export const getTopTracks = (timeRange = 'medium_term', limit = 20) =>
  apiFetch(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`);

export const getTopArtists = (timeRange = 'medium_term', limit = 10) =>
  apiFetch(`/me/top/artists?time_range=${timeRange}&limit=${limit}`);

export const getRecentlyPlayed = (limit = 10) =>
  apiFetch(`/me/player/recently-played?limit=${limit}`);

export const getNowPlaying = () =>
  apiFetch('/me/player/currently-playing');

export const getPlaylists = (limit = 12) =>
  apiFetch(`/me/playlists?limit=${limit}`);

export const getPlaylistTracks = (playlistId, limit = 50) =>
  apiFetch(`/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(id,name,artists(id,name),album(id,name,images)))`);

export const getTopTracksAll = async () => {
  const [short, medium, long_] = await Promise.all([
    getTopTracks('short_term', 50),
    getTopTracks('medium_term', 50),
    getTopTracks('long_term', 50),
  ]);
  const seen = new Set();
  const all = [];
  for (const list of [short, medium, long_]) {
    for (const t of (list?.items ?? [])) {
      if (t?.id && !seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
  }
  return all;
};

export const getTopArtistsAll = async () => {
  const [short, medium, long_] = await Promise.all([
    getTopArtists('short_term', 50),
    getTopArtists('medium_term', 50),
    getTopArtists('long_term', 50),
  ]);
  const seen = new Set();
  const all = [];
  for (const list of [short, medium, long_]) {
    for (const a of (list?.items ?? [])) {
      if (a?.id && !seen.has(a.id)) { seen.add(a.id); all.push(a); }
    }
  }
  return all;
};

export const searchArtists = (query, limit = 10) =>
  apiFetch(`/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}`);

export const searchTracks = (query, limit = 10) =>
  apiFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
