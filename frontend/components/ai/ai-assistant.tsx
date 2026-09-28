'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Eraser, Maximize2, Sparkles, X } from 'lucide-react';
import { AiChat } from '@/components/ai/ai-chat';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useAiStore } from '@/store/ai-store';

/**
 * The assistant panel: a right-side sheet on desktop, near-full-screen on phones.
 *
 * The widths are the point. At `sm` and up it is a 27rem (432px) column that
 * sits beside the page instead of covering it, so a customer can keep reading a
 * product while they ask about it. Below `sm` it takes the full width, because a
 * 420px panel on a 360px phone is a panel with 60px of page behind it — and a
 * conversation squeezed into a floating box is the thing this is not.
 *
 * `h-dvh` rather than `h-screen`: on mobile Safari `100vh` is the viewport
 * *without* the browser chrome, so a full-height sheet pushes its own input
 * under the address bar. `dvh` tracks the space that is actually visible, which
 * is what keeps the composer reachable when the keyboard opens.
 */
export function AiAssistant() {
  const open = useAiStore((state) => state.open);
  const setOpen = useAiStore((state) => state.setOpen);
  const clear = useAiStore((state) => state.clear);
  const hasMessages = useAiStore((state) => state.messages.length > 0);
  const availability = useAiStore((state) => state.availability);

  // The full-screen page renders this same conversation, so from there the
  // button would be a door into the room you are already in.
  const pathname = usePathname();
  const onFullPage = pathname === '/ai-shopping';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-slot="ai-panel"
        /*
         * The `data-[side=right]:` prefixes are load-bearing, not decoration.
         *
         * `SheetContent` sets its own width through that same variant
         * (`data-[side=right]:w-3/4`, `data-[side=right]:sm:max-w-sm`), and a
         * variant compiles to a compound selector — so a plain `w-full` here
         * loses to it on specificity and the panel silently renders at three
         * quarters width with a 24rem cap. Matching the variant is what makes
         * these win.
         */
        className="flex h-dvh flex-col gap-0 bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:w-[27rem] data-[side=right]:sm:max-w-[27rem]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand"
            aria-hidden
          >
            <Sparkles className="size-4" />
          </span>

          <div className="min-w-0 flex-1">
            <SheetTitle className="text-small leading-tight font-semibold">ZyCart AI</SheetTitle>
            <SheetDescription className="text-caption flex items-center gap-1.5">
              {availability === 'available' && (
                <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              )}
              Your shopping assistant
            </SheetDescription>
          </div>

          {hasMessages && (
            <button
              type="button"
              onClick={clear}
              className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear this conversation"
              title="Clear conversation"
            >
              <Eraser className="size-4" aria-hidden />
            </button>
          )}

          {!onFullPage && (
            <Link
              href="/ai-shopping"
              onClick={() => setOpen(false)}
              className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Open ZyCart AI in full screen"
              title="Open full screen"
            >
              <Maximize2 className="size-4" aria-hidden />
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close ZyCart AI"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {/* Focused on open, because the customer opened it to type. */}
        <AiChat onNavigate={() => setOpen(false)} autoFocus />
      </SheetContent>
    </Sheet>
  );
}
