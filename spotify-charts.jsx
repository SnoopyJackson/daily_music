// spotify-charts.jsx — SVG chart components for the Spotify Dashboard

/* ── Donut Chart ───────────────────────────────────────────── */
export function DonutChart({ data, size = 200 }) {
  // data: [{ label, value, color }]
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2, cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.55;
  let cumAngle = -Math.PI / 2;

  const slices = data.map(d => {
    const angle = (d.value / total) * Math.PI * 2;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');

    return { ...d, path, pct: Math.round((d.value / total) * 100) };
  });

  return (
    <div className="sp-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="sp-donut-svg">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} opacity={0.85}>
            <title>{s.label}: {s.pct}%</title>
          </path>
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#f0ede6" fontSize="18" fontWeight="700" fontFamily="Georgia, serif">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#666" fontSize="9" fontFamily="'DM Mono', monospace" letterSpacing="0.1em">PLAYS</text>
      </svg>
      <div className="sp-donut-legend">
        {slices.slice(0, 8).map((s, i) => (
          <div key={i} className="sp-donut-legend-item">
            <span className="sp-legend-dot" style={{ background: s.color }} />
            <span className="sp-legend-label">{s.label}</span>
            <span className="sp-legend-pct">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Horizontal Bar Chart ──────────────────────────────────── */
export function HBarChart({ data, color = "#1DB954" }) {
  // data: [{ label, value, sub? }]
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="sp-hbar-list">
      {data.map((d, i) => (
        <div key={i} className="sp-hbar-row">
          <span className="sp-hbar-rank">{i + 1}</span>
          <div className="sp-hbar-info">
            <div className="sp-hbar-top">
              <span className="sp-hbar-label">{d.label}</span>
              <span className="sp-hbar-val">{d.value}</span>
            </div>
            <div className="sp-hbar-track">
              <div className="sp-hbar-fill" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
            </div>
            {d.sub && <span className="sp-hbar-sub">{d.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Hour-of-Day Chart ─────────────────────────────────────── */
const HOUR_LABELS = ['12a','','2a','','4a','','6a','','8a','','10a','','12p','','2p','','4p','','6p','','8p','','10p',''];

export function HourChart({ hours }) {
  const max = Math.max(...hours, 1);
  const hasData = hours.some(h => h > 0);
  if (!hasData) return <p className="sp-chart-empty">No hourly data yet — keep listening!</p>;
  return (
    <div className="sp-hour-chart">
      {hours.map((count, i) => (
        <div key={i} className="sp-hour-col">
          <div className="sp-hour-bar-wrap">
            <div
              className={`sp-hour-bar${count === 0 ? ' sp-hour-empty' : ''}`}
              style={{ height: `${Math.max((count / max) * 100, count > 0 ? 6 : 2)}%` }}
            />
          </div>
          <span className="sp-hour-label">{HOUR_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Day-of-Week Chart ─────────────────────────────────────── */
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DowChart({ dow }) {
  const max = Math.max(...dow, 1);
  const hasData = dow.some(d => d > 0);
  if (!hasData) return <p className="sp-chart-empty">No weekly data yet — keep listening!</p>;
  return (
    <div className="sp-dow-chart">
      {dow.map((count, i) => (
        <div key={i} className="sp-dow-row">
          <span className="sp-dow-label">{DOW_LABELS[i]}</span>
          <div className="sp-dow-track">
            <div
              className={`sp-dow-fill${count === 0 ? ' sp-dow-empty' : ''}`}
              style={{ width: `${Math.max((count / max) * 100, count > 0 ? 4 : 1)}%` }}
            />
          </div>
          <span className="sp-dow-val">{count}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Heatmap (last 12 weeks) ───────────────────────────────── */
export function Heatmap({ activity }) {
  // activity from stats: [{date, minutes}] for 14 days
  // We'll build a wider heatmap from tracker data passed as prop
  // Each cell = 1 day, grouped by week
  if (!activity?.length) return null;
  const max = Math.max(...activity.map(a => a.minutes), 1);

  // Group by week (rows of 7)
  const weeks = [];
  for (let i = 0; i < activity.length; i += 7) {
    weeks.push(activity.slice(i, i + 7));
  }

  return (
    <div className="sp-heatmap">
      <div className="sp-heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="sp-heatmap-week">
            {week.map(d => {
              const intensity = d.minutes > 0 ? Math.max(0.15, d.minutes / max) : 0;
              return (
                <div
                  key={d.date}
                  className="sp-heatmap-cell"
                  style={{ background: intensity > 0 ? `rgba(29,185,84,${intensity})` : '#161616' }}
                  title={`${d.date}: ${d.minutes}m`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="sp-heatmap-labels">
        <span>Less</span>
        <div className="sp-heatmap-scale">
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <div key={v} className="sp-heatmap-cell" style={{ background: v > 0 ? `rgba(29,185,84,${v})` : '#161616' }} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

/* ── Radar Chart ───────────────────────────────────────────── */
export function RadarChart({ data, size = 220 }) {
  // data: [{ label, icon, value }]  — values 0..1
  const n = data.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const R  = size / 2 - 42; // room for labels

  const ang   = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt    = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const polyPts = (scale) => data.map((_, i) => pt(i, scale * R).join(',')).join(' ');

  const valuePts = data.map((d, i) => pt(i, Math.max(0.04, d.value) * R).join(',')).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="sp-radar-svg">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1.0].map(level => (
        <polygon key={level} points={polyPts(level)}
          fill="none"
          stroke={level === 1.0 ? '#2a2a2a' : '#1a1a1a'}
          strokeWidth={level === 1.0 ? 1.5 : 1} />
      ))}

      {/* Axis lines */}
      {data.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#222" strokeWidth="1" />;
      })}

      {/* Grid value labels (25 / 50 / 75) on first axis */}
      {[0.25, 0.5, 0.75].map(level => {
        const [x, y] = pt(0, level * R);
        return (
          <text key={level} x={x + 4} y={y} fill="#444"
            fontSize="7" fontFamily="'DM Mono', monospace" dominantBaseline="middle">
            {Math.round(level * 100)}
          </text>
        );
      })}

      {/* Filled value polygon */}
      <polygon points={valuePts}
        fill="#1DB954" fillOpacity="0.18"
        stroke="#1DB954" strokeWidth="2" strokeLinejoin="round" />

      {/* Dots */}
      {data.map((d, i) => {
        const [x, y] = pt(i, Math.max(0.04, d.value) * R);
        return (
          <circle key={i} cx={x} cy={y} r="3.5"
            fill="#1DB954" stroke="#0a0a0a" strokeWidth="1.5" />
        );
      })}

      {/* Labels */}
      {data.map((d, i) => {
        const a      = ang(i);
        const cosA   = Math.cos(a);
        const sinA   = Math.sin(a);
        const labelR = R + 24;
        const [lx, ly] = pt(i, labelR);
        const anchor   = cosA > 0.2 ? 'start' : cosA < -0.2 ? 'end' : 'middle';
        const baseline = sinA < -0.2 ? 'auto' : sinA > 0.2 ? 'hanging' : 'middle';
        return (
          <text key={i} x={lx} y={ly}
            textAnchor={anchor}
            dominantBaseline={baseline}
            fill="#999"
            fontSize="9"
            fontFamily="'DM Mono', monospace"
            letterSpacing="0.06em">
            {d.icon} {d.label.toUpperCase()}
          </text>
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="2" fill="#2a2a2a" />
    </svg>
  );
}

/* ── Network Graph ─────────────────────────────────────────── */
export function NetworkGraph({ nodes, links, width = 400, height = 300 }) {
  // nodes: [{ id, label, size?, color? }]
  // links: [{ source, target, weight? }]
  if (!nodes?.length) return <p className="sp-chart-empty">Not enough data yet.</p>;

  // Simple circular layout with center attraction for high-connectivity nodes
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) / 2.6;

  // Sort by connectivity — most connected nodes closer to center
  const connectivity = {};
  nodes.forEach(n => { connectivity[n.id] = 0; });
  links.forEach(l => {
    connectivity[l.source] = (connectivity[l.source] || 0) + (l.weight || 1);
    connectivity[l.target] = (connectivity[l.target] || 0) + (l.weight || 1);
  });
  const sorted = [...nodes].sort((a, b) => (connectivity[b.id] || 0) - (connectivity[a.id] || 0));

  // Position nodes in layered rings
  const positioned = {};
  const innerCount = Math.min(Math.ceil(sorted.length / 3), 5);

  sorted.forEach((node, i) => {
    let r, angle;
    if (i < innerCount) {
      r = radius * 0.35;
      angle = (i / innerCount) * Math.PI * 2 - Math.PI / 2;
    } else {
      r = radius * 0.85;
      angle = ((i - innerCount) / (sorted.length - innerCount)) * Math.PI * 2 - Math.PI / 2;
    }
    positioned[node.id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      ...node,
    };
  });

  const maxWeight = Math.max(...links.map(l => l.weight || 1), 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="sp-network-svg">
      {/* Links */}
      {links.map((link, i) => {
        const s = positioned[link.source];
        const t = positioned[link.target];
        if (!s || !t) return null;
        const opacity = Math.max(0.1, (link.weight || 1) / maxWeight * 0.5);
        return (
          <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke="#1DB954" strokeWidth={Math.max(0.5, (link.weight || 1) / maxWeight * 2.5)}
            opacity={opacity} />
        );
      })}
      {/* Nodes */}
      {sorted.map(node => {
        const p = positioned[node.id];
        const sz = node.size || 6;
        return (
          <g key={node.id}>
            <circle cx={p.x} cy={p.y} r={sz} fill={node.color || '#1DB954'} opacity={0.85} />
            <text x={p.x} y={p.y + sz + 10} textAnchor="middle"
              fill="#999" fontSize="8" fontFamily="'DM Mono', monospace">
              {node.label.length > 14 ? node.label.slice(0, 12) + '…' : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
