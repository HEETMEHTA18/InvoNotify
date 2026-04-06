type CibilMeterProps = {
  score: number;
  size?: number;
  compact?: boolean;
};

const MIN_SCORE = 300;
const MAX_SCORE = 900;

function clampScore(value: number) {
  const safe = Number.isFinite(value) ? value : 650;
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(safe)));
}

function scoreToAngle(score: number) {
  return -180 + ((score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)) * 180;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const radians = (Math.PI / 180) * angleDeg;
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians),
  };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export function CibilMeter({ score, size = 180, compact = false }: CibilMeterProps) {
  const safeScore = clampScore(score);
  const center = size / 2;
  const radius = size * 0.38;
  const strokeWidth = Math.max(8, Math.round(size * 0.07));

  const segments = [
    { from: 300, to: 650, color: "#ea580c" },
    { from: 650, to: 700, color: "#f59e0b" },
    { from: 700, to: 750, color: "#eab308" },
    { from: 750, to: 900, color: "#16a34a" },
  ];

  const needleAngle = scoreToAngle(safeScore);
  const needleTip = polarToCartesian(center, center, radius - strokeWidth * 0.5, needleAngle);
  const dialHeight = compact ? size * 0.62 : size * 0.68;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={dialHeight} viewBox={`0 0 ${size} ${dialHeight}`} role="img" aria-label={`CIBIL score ${safeScore}`}>
        {segments.map((segment) => {
          const startAngle = scoreToAngle(segment.from);
          const endAngle = scoreToAngle(segment.to);
          return (
            <path
              key={`${segment.from}-${segment.to}`}
              d={arcPath(center, center, radius, startAngle, endAngle)}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}

        <line
          x1={center}
          y1={center}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="#1f2937"
          strokeWidth={Math.max(2, Math.round(strokeWidth * 0.32))}
          strokeLinecap="round"
        />
        <circle cx={center} cy={center} r={Math.max(4, Math.round(strokeWidth * 0.4))} fill="#1f2937" />

        {!compact ? (
          <>
            <text x={center} y={center + 26} textAnchor="middle" fontSize="30" fontWeight="700" fill="#111827">
              {safeScore}
            </text>
            <text x={center} y={center + 46} textAnchor="middle" fontSize="11" fill="#6b7280">
              CIBIL Score
            </text>
          </>
        ) : null}

        {!compact ? (
          <>
            <text x={center - radius} y={center + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {MIN_SCORE}
            </text>
            <text x={center + radius} y={center + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {MAX_SCORE}
            </text>
          </>
        ) : null}
      </svg>
      {compact ? <div className="-mt-1 text-sm font-semibold text-gray-900">{safeScore}</div> : null}
    </div>
  );
}
