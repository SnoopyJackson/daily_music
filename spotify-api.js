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
