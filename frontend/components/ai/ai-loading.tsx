import { Sparkles } from 'lucide-react';

/**
 * What the assistant shows while it works.
 *
 * A model call plus its catalogue lookups is seconds, not milliseconds, so this
 * carries the whole wait. It says what is happening in words rather than
 * spinning: three dots with no label is indistinguishable from a page that has
 * stopped working.
 *
 * `aria-live="polite"` rather than `assertive` — a screen reader hears it at
 * the next natural pause instead of having the customer's own words cut off.
 */
export function AiLoading() {
  return (
    <div className="flex items-center gap-2.5" role="status" aria-live="polite">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
        <Sparkles className="size-3.5" aria-hidden />
      </span>

      <span className="text-small text-muted-foreground">ZyCart AI is thinking</span>

      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${String(index * 180)}ms`, animationDuration: '1.1s' }}
          />
        ))}
      </span>
    </div>
  );
}
