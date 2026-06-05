// spotify-tracker.js — Local listening data accumulator
// Stores daily listening stats in localStorage, built from the recently-played API.
// Data gets richer each time the dashboard is opened.

const TRACKER_KEY = 'spotify_listening_v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(TRACKER_KEY)) || fresh();
  } catch { return fresh(); }
}

function fresh() {
  return { days: {}, knownArtists: [], lastProcessedAt: '', hours: new Array(24).fill(0), dow: new Array(7).fill(0) };
}

function save(data) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const d of Object.keys(data.days)) {
    if (d < cutoffStr) delete data.days[d];
  }
  if (data.knownArtists.length > 5000) {
    data.knownArtists = data.knownArtists.slice(-5000);
  }
  localStorage.setItem(TRACKER_KEY, JSON.stringify(data));
}

export function ingestRecentlyPlayed(items) {
  if (!items?.length) return load();

  const data = load();
  if (!data.hours) data.hours = new Array(24).fill(0);
  if (!data.dow) data.dow = new Array(7).fill(0);
  const lastProcessed = data.lastProcessedAt || '';

  const sorted = [...items]
    .filter(i => i?.played_at && i?.track?.id)
    .sort((a, b) => a.played_at.localeCompare(b.played_at));

  let newest = lastProcessed;

  for (const item of sorted) {
    if (item.played_at <= lastProcessed) continue;

    const track = item.track;
    const date = item.played_at.slice(0, 10);

    if (!data.days[date]) {
      data.days[date] = { ms: 0, plays: 0, _t: [], _a: [], _al: [], newA: 0 };
    }

    const day = data.days[date];
    day.plays++;
    day.ms += track.duration_ms || 0;

    // Track hour-of-day and day-of-week
    const playedDate = new Date(item.played_at);
    const hour = playedDate.getHours();
    const dow = playedDate.getDay();
    data.hours[hour] = (data.hours[hour] || 0) + 1;
    data.dow[dow] = (data.dow[dow] || 0) + 1;

    if (!day._t.includes(track.id)) day._t.push(track.id);

    const albumId = track.album?.id;
    if (albumId && !day._al.includes(albumId)) day._al.push(albumId);

    for (const a of (track.artists || [])) {
      if (a.id && !day._a.includes(a.id)) day._a.push(a.id);
      if (a.id && !data.knownArtists.includes(a.id)) {
        data.knownArtists.push(a.id);
        day.newA++;
      }
    }

    if (item.played_at > newest) newest = item.played_at;
  }

  if (newest > lastProcessed) data.lastProcessedAt = newest;
  save(data);
  return data;
}

export function getOverviewStats(trackerData) {
  const data = trackerData || load();
  const days = data.days || {};
  const today = new Date().toISOString().slice(0, 10);
  const todayData = days[today];

  // Week (last 7 days)
  let weekMs = 0, weekPlays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (days[key]) { weekMs += days[key].ms; weekPlays += days[key].plays; }
  }

  // Month
  const monthKey = today.slice(0, 7);
  let monthMs = 0, monthPlays = 0;
  const monthArtists = new Set();
  const monthAlbums = new Set();
  let monthNewArtists = 0;
  for (const [d, day] of Object.entries(days)) {
    if (d.startsWith(monthKey)) {
      monthMs += day.ms;
      monthPlays += day.plays;
      day._a?.forEach(id => monthArtists.add(id));
      day._al?.forEach(id => monthAlbums.add(id));
      monthNewArtists += day.newA || 0;
    }
  }

  // All tracked time
  let totalMs = 0, totalPlays = 0;
  for (const day of Object.values(days)) {
    totalMs += day.ms;
    totalPlays += day.plays;
  }
  const trackedDays = Object.keys(days).length;

  // Streak
  let streak = 0;
  const sd = new Date();
  if (!days[sd.toISOString().slice(0, 10)]?.plays) {
    sd.setDate(sd.getDate() - 1);
  }
  while (days[sd.toISOString().slice(0, 10)]?.plays > 0) {
    streak++;
    sd.setDate(sd.getDate() - 1);
  }

  // Activity last 14 days
  const activity = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = days[key];
    activity.push({
      date: key,
      day: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      num: d.getDate(),
      minutes: Math.round((day?.ms || 0) / 60000),
      tracks: day?.plays || 0,
    });
  }
  const maxActivityMin = Math.max(...activity.map(a => a.minutes), 1);

  return {
    today: {
      minutes: Math.round((todayData?.ms || 0) / 60000),
      tracks: todayData?.plays || 0,
      uniqueTracks: todayData?._t?.length || 0,
      uniqueArtists: todayData?._a?.length || 0,
    },
    week: { minutes: Math.round(weekMs / 60000), tracks: weekPlays },
    month: {
      minutes: Math.round(monthMs / 60000),
      tracks: monthPlays,
      artists: monthArtists.size,
      albums: monthAlbums.size,
      newArtists: monthNewArtists,
    },
    allTime: { minutes: Math.round(totalMs / 60000), tracks: totalPlays, days: trackedDays },
    avgDailyMinutes: trackedDays > 0 ? Math.round(totalMs / 60000 / trackedDays) : 0,
    streak,
    activity,
    maxActivityMin,
    totalKnownArtists: data.knownArtists?.length || 0,
    hours: data.hours || new Array(24).fill(0),
    dow: data.dow || new Array(7).fill(0),
  };
}
