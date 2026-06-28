import type { ActivityDay } from "../../api/profile";

interface Props {
  activity: ActivityDay[];
}

function buildGrid(activity: ActivityDay[]): { day: string; count: number }[] {
  const map = new Map(activity.map((a) => [a.day, a.messages_sent]));
  const grid: { day: string; count: number }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    grid.push({ day: key, count: map.get(key) ?? 0 });
  }
  return grid;
}

function intensity(count: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(1, count / max);
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ActivityHeatmap({ activity }: Props) {
  const grid = buildGrid(activity);
  const max = Math.max(...grid.map((g) => g.count), 1);

  return (
    <div className="ah-root">
      <h3 className="ah-title">30-Day Activity</h3>
      <div className="ah-grid">
        {grid.map(({ day, count }) => {
          const alpha = intensity(count, max);
          const bg =
            alpha === 0
              ? "var(--color-border)"
              : `rgba(46, 134, 193, ${0.2 + alpha * 0.8})`;
          return (
            <div
              key={day}
              className="ah-cell"
              style={{ background: bg }}
              title={`${shortDate(day)}: ${count} message${count !== 1 ? "s" : ""}`}
              aria-label={`${day}: ${count} messages`}
            />
          );
        })}
      </div>
      <div className="ah-legend">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <div
            key={v}
            className="ah-cell ah-cell--sm"
            style={{
              background: v === 0 ? "var(--color-border)" : `rgba(46,134,193,${0.2 + v * 0.8})`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
