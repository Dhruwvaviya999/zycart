'use client';

import { useId, useState } from 'react';
import { formatPrice } from '@/lib/format';
import type { RevenuePoint } from '@/types/admin';
import { cn } from '@/lib/utils';

/**
 * Revenue over the window, drawn as inline SVG.
 *
 * No charting library. ZyCart has none installed, and adding one for a single
 * bar chart would ship a few hundred kilobytes to solve a problem that
 * `<rect>` already solves — with the side effect that theming, focus rings and
 * dark mode would then belong to somebody else's component rather than to the
 * design tokens.
 *
 * It is a chart *and* a table: the bars are for scanning, and the same numbers
 * are in a visually-hidden table underneath for anyone who cannot see them.
 * Neither is a decoration of the other.
 */
export function RevenueChart({ points, days }: { points: RevenuePoint[]; days: number }) {
  const captionId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const max = Math.max(...points.map((point) => point.revenue), 0);
  const total = points.reduce((sum, point) => sum + point.revenue, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 px-6 text-center">
        <p className="text-small font-semibold">No completed sales in this period</p>
        <p className="text-caption mt-1.5 max-w-sm text-pretty text-muted-foreground">
          Revenue appears here once an order is paid online, or a cash-on-delivery order is marked
          delivered.
        </p>
      </div>
    );
  }

  const active = hovered === null ? null : points[hovered];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-price-lg">{formatPrice(total)}</p>
          <p className="text-caption mt-0.5 text-muted-foreground">
            over the last {days} days
          </p>
        </div>

        {/* Reserved height, so hovering does not nudge the chart down. */}
        <p className="text-caption min-h-8 text-right text-muted-foreground">
          {active && (
            <>
              <span className="block font-medium text-foreground">
                {formatPrice(active.revenue)}
              </span>
              {formatDay(active.date)} · {active.orders}{' '}
              {active.orders === 1 ? 'order' : 'orders'}
            </>
          )}
        </p>
      </div>

      <div
        className="mt-4 flex h-40 items-end gap-[3px]"
        onMouseLeave={() => setHovered(null)}
        aria-describedby={captionId}
      >
        {points.map((point, index) => {
          // A day with money always draws something: a 1px sliver reads as
          // "a little", where nothing reads as "none".
          const height = max === 0 ? 0 : Math.max((point.revenue / max) * 100, point.revenue > 0 ? 2 : 0);

          return (
            <div
              key={point.date}
              onMouseEnter={() => setHovered(index)}
              className="flex h-full min-w-0 flex-1 items-end"
            >
              <div
                className={cn(
                  'w-full rounded-t-[3px] transition-colors',
                  hovered === index ? 'bg-brand' : 'bg-brand/45',
                  point.revenue === 0 && 'bg-muted',
                )}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="text-caption mt-2 flex justify-between text-muted-foreground">
        <span>{formatDay(points[0]?.date ?? '')}</span>
        <span>{formatDay(points[points.length - 1]?.date ?? '')}</span>
      </div>

      {/* The same data, for a screen reader. */}
      <table id={captionId} className="sr-only">
        <caption>Revenue per day over the last {days} days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Revenue</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{formatDay(point.date)}</th>
              <td>{formatPrice(point.revenue)}</td>
              <td>{point.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDay(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}
