import { formatDate, num } from "./admin-ui";

export interface LinePoint {
  date: string;
  value: number;
}

interface LineChartProps {
  data: LinePoint[];
  label: string;
  /** CSS colour for the line. Defaults to the brand navy token. */
  stroke?: string;
}

const W = 720;
const H = 240;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 44;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const GRID_LINES = 4;

/**
 * Dependency-free line chart. Renders inline SVG plus a text summary, because
 * the spec requires every chart to be readable without seeing it.
 */
export function LineChart({
  data,
  label,
  stroke = "var(--color-primary)",
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <p className="rounded-md bg-band px-3 py-6 text-center text-sm text-ink-faint">
        No data for this range.
      </p>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const x = (i: number) =>
    data.length === 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (data.length - 1)) * PLOT_W;
  const y = (v: number) => PAD_T + PLOT_H - ((v - min) / span) * PLOT_H;

  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const areaPath = `M ${PAD_L},${PAD_T + PLOT_H} L ${points.split(" ").join(" L ")} L ${(
    x(data.length - 1)
  ).toFixed(1)},${PAD_T + PLOT_H} Z`;

  const first = data[0]!;
  const last = data[data.length - 1]!;
  const midIndex = Math.floor((data.length - 1) / 2);
  const mid = data[midIndex]!;
  const total = values.reduce((sum, v) => sum + v, 0);
  const avg = total / values.length;
  const change = first.value === 0 ? 0 : ((last.value - first.value) / first.value) * 100;
  const direction = change > 2 ? "up" : change < -2 ? "down" : "roughly flat";

  const summary = `${label}: ${num(total)} in total across ${data.length} days, averaging ${num(
    avg,
  )} per day. Peak of ${num(max)}, low of ${num(min)}. Trend is ${direction} - from ${num(
    first.value,
  )} on ${formatDate(first.date)} to ${num(last.value)} on ${formatDate(last.date)}.`;

  const gridValues = Array.from({ length: GRID_LINES + 1 }, (_, i) =>
    min + (span * i) / GRID_LINES,
  );

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{summary}</title>

        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            {(i === GRID_LINES || i === 0) && (
              <text
                x={PAD_L - 8}
                y={y(v) + 4}
                textAnchor="end"
                fontSize={12}
                fill="var(--color-ink-faint)"
              >
                {num(v)}
              </text>
            )}
          </g>
        ))}

        <path d={areaPath} fill={stroke} fillOpacity={0.08} />
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(data.length - 1)} cy={y(last.value)} r={4} fill={stroke} />

        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_T + PLOT_H}
          y2={PAD_T + PLOT_H}
          stroke="var(--color-line-strong)"
          strokeWidth={1}
        />

        <text x={PAD_L} y={H - 16} fontSize={12} fill="var(--color-ink-faint)">
          {formatDate(first.date)}
        </text>
        <text
          x={x(midIndex)}
          y={H - 16}
          fontSize={12}
          textAnchor="middle"
          fill="var(--color-ink-faint)"
        >
          {formatDate(mid.date)}
        </text>
        <text
          x={W - PAD_R}
          y={H - 16}
          fontSize={12}
          textAnchor="end"
          fill="var(--color-ink-faint)"
        >
          {formatDate(last.date)}
        </text>
      </svg>

      <figcaption className="mt-2 text-xs leading-relaxed text-ink-faint">{summary}</figcaption>
    </figure>
  );
}
