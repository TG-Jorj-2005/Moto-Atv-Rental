import { cn } from "@/lib/utils";

type Series = { name: string; color: string; values: number[] };

// A simple grouped bar chart drawn as SVG on the server (no chart library). It is described for screen readers and
// followed by the same numbers as a table.
export function BarChart({ labels, series, format, title, className }: { labels: string[]; series: Series[]; format: (n: number) => string; title: string; className?: string }) {
  const W = 520;
  const H = 250;
  const pad = { l: 64, r: 10, t: 12, b: 30 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const nice = ticks.at(-1)!;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const groupW = innerW / Math.max(1, labels.length);
  const barW = Math.min(36, (groupW * 0.7) / series.length);
  const y = (v: number) => pad.t + innerH - (v / nice) * innerH;

  return (
    <figure className={cn("space-y-2", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="mx-auto h-auto w-full max-w-3xl text-fg-soft">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.18} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="currentColor">{format(t)}</text>
          </g>
        ))}
        {labels.map((label, i) => {
          const gx = pad.l + i * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={label}>
              {series.map((s, j) => {
                const v = s.values[i] ?? 0;
                return (
                  <rect key={s.name} x={gx + j * barW} y={y(v)} width={barW - 2} height={Math.max(0, pad.t + innerH - y(v))} rx="3" fill={s.color}>
                    <title>{`${s.name}, ${label}: ${format(v)}`}</title>
                  </rect>
                );
              })}
              <text x={pad.l + i * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="currentColor">{label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-fg-soft">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded" style={{ background: s.color }} /> {s.name}</span>)}
      </figcaption>
      <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead><tr><th scope="col">Period</th>{series.map((s) => <th key={s.name} scope="col">{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={l}><th scope="row">{l}</th>{series.map((s) => <td key={s.name}>{format(s.values[i] ?? 0)}</td>)}</tr>)}</tbody>
      </table>
      </div>
    </figure>
  );
}

// Axis ticks 0, step, 2*step ... with a step of 1, 2 or 5 times a power of ten, so that the labels are whole, round
// numbers (counts never show as 2.5) and the last tick is at or above the largest value. At most 6 ticks.
export function niceTicks(max: number): number[] {
  const m = Math.max(max, 1);
  if (m <= 5) return Array.from({ length: Math.ceil(m) + 1 }, (_, i) => i); // small counts: 0, 1, 2, ...
  const raw = m / 4;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  const ticks = [0];
  while (ticks.at(-1)! < m) ticks.push(ticks.at(-1)! + step);
  return ticks;
}
