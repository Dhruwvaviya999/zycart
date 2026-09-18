'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/**
 * Which icon shows is decided by CSS from the `dark` class on <html>, not by
 * React state — so there is no hydration flash and no mounted flag to track.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle colour theme"
      className={cn(
        'focus-ring relative inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted',
        className,
      )}
    >
      <Sun
        className="size-[18px] scale-100 rotate-0 transition-transform duration-300 ease-brand dark:scale-0 dark:-rotate-90"
        aria-hidden
      />
      <Moon
        className="absolute size-[18px] scale-0 rotate-90 transition-transform duration-300 ease-brand dark:scale-100 dark:rotate-0"
        aria-hidden
      />
    </button>
  );
}
