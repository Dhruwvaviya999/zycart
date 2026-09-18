import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * ZyCart mark: a cart silhouette whose handle doubles as a stylised Z.
 * Inline SVG so it inherits colour and stays crisp at every size.
 */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="ZyCart home"
      className={cn('focus-ring group inline-flex items-center gap-2 rounded-md', className)}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand text-brand-foreground shadow-sm transition-transform duration-300 ease-brand group-hover:-rotate-6">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden>
          <path
            d="M4 5h2.4l1 4m0 0 1.6 7h8.2l2.3-7H8.4Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.4 11.6h5.6l-5.6 3.2h5.6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="19.5" r="1.5" fill="currentColor" />
          <circle cx="16.5" cy="19.5" r="1.5" fill="currentColor" />
        </svg>
      </span>

      {showWordmark && (
        <span className="text-[1.0625rem] font-semibold tracking-[-0.03em]">ZyCart</span>
      )}
    </Link>
  );
}
