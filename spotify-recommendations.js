// spotify-recommendations.js — Filter user's artists/tracks by challenge criteria

/**
 * Given a challenge and the user's library (top artists, top tracks, playlist tracks),
 * return matching artists and tracks for the challenge.
 */
export function getRecommendationsForChallenge(challenge, { topArtists = [], topTracks = [], playlistTracks = [] }) {
  if (!challenge) return { artists: [], tracks: [] };

  const type = challenge.type;
  const title = challenge.title || '';

  // Deduplicate all artists from top + playlists
  const allArtistMap = {};
  for (const a of topArtists) {
    if (a?.id) allArtistMap[a.id] = a;
  }
  for (const t of [...topTracks, ...playlistTracks]) {
    for (const a of (t?.artists ?? [])) {
      if (a?.id && !allArtistMap[a.id]) {
        allArtistMap[a.id] = { id: a.id, name: a.name, genres: [], images: [], _fromPlaylist: true };
      }
    }
  }
  const allArtists = Object.values(allArtistMap);

  // Deduplicate all tracks
  const allTrackMap = {};
  for (const t of [...topTracks, ...playlistTracks]) {
    if (t?.id && !allTrackMap[t.id]) allTrackMap[t.id] = t;
  }
  const allTracks = Object.values(allTrackMap);

  let matchedArtists = [];
  let matchedTracks = [];

  switch (type) {
    case 'letter': {
      const letter = extractLetter(title);
      if (letter) {
        matchedArtists = allArtists.filter(a => a.name?.toUpperCase().startsWith(letter));
        matchedTracks = allTracks.filter(t => (t.artists ?? []).some(a => a.name?.toUpperCase().startsWith(letter)));
      }
      break;
    }
    case 'alphabet_song': {
      const letter = extractLetter(title);
      if (letter) {
        matchedTracks = allTracks.filter(t => t.name?.toUpperCase().startsWith(letter));
        // Get artists from matching tracks
        const artistIds = new Set();
        matchedTracks.forEach(t => (t.artists ?? []).forEach(a => {
          if (a.id && !artistIds.has(a.id)) {
            artistIds.add(a.id);
            const full = allArtistMap[a.id];
            if (full) matchedArtists.push(full);
          }
        }));
      }
      break;
    }
    case 'genre': {
      const genre = extractGenre(title);
      if (genre) {
        const genreLower = genre.toLowerCase();
        matchedArtists = allArtists.filter(a =>
          (a.genres ?? []).some(g => g.toLowerCase().includes(genreLower) || genreLower.includes(g.toLowerCase()))
        );
        const matchedArtistIds = new Set(matchedArtists.map(a => a.id));
        matchedTracks = allTracks.filter(t =>
          (t.artists ?? []).some(a => matchedArtistIds.has(a.id))
        );
      }
      break;
    }
    case 'decade': {
      // Can't filter by decade without release_date on tracks from playlists
      // But top tracks have album info
      const decade = extractDecade(title);
      if (decade) {
        matchedTracks = allTracks.filter(t => {
          const year = parseInt(t.album?.release_date?.slice(0, 4));
          return year >= decade && year < decade + 10;
        });
        const artistIds = new Set();
        matchedTracks.forEach(t => (t.artists ?? []).forEach(a => {
          if (a.id && !artistIds.has(a.id)) {
            artistIds.add(a.id);
            const full = allArtistMap[a.id];
            if (full) matchedArtists.push(full);
          }
        }));
      }
      break;
    }
    case 'collab': {
      matchedTracks = allTracks.filter(t => (t.artists ?? []).length > 1 || t.name?.toLowerCase().includes('feat'));
      break;
    }
    case 'solo': {
      // Solo vs band — for solo, artists with 1-word or known solo patterns
      // Too complex to reliably determine, so just show all top artists
      matchedArtists = allArtists.slice(0, 20);
      break;
    }
    default: {
      // For mood, instrument, bpm, country, nolanguage, debut, liveonly
      // We can't reliably filter locally, show top artists as starting point
      matchedArtists = allArtists.slice(0, 15);
      break;
    }
  }

  // Sort: prioritize top artists (those with popularity/images) over playlist-only ones
  matchedArtists.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  return {
    artists: matchedArtists.slice(0, 20),
    tracks: matchedTracks.slice(0, 20),
  };
}

function extractLetter(title) {
  // "Letter "B" Day" or "Songs Starting with "B""
  const m = title.match(/[""]([A-Z])[""]/) || title.match(/"([A-Z])"/);
  return m ? m[1] : null;
}

function extractGenre(title) {
  // "Black Metal Only" → "Black Metal"
  return title.replace(/ Only$/i, '').trim();
}

function extractDecade(title) {
  // "60s Time Capsule" → 1960
  const m = title.match(/(\d{2})s/);
  if (!m) return null;
  const short = parseInt(m[1]);
  return short >= 40 ? 1900 + short : 2000 + short;
}
