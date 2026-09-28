'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AiError, AiUnavailable } from '@/components/ai/ai-error';
import { AiInput } from '@/components/ai/ai-input';
import { AiLoading } from '@/components/ai/ai-loading';
import { AiMessage } from '@/components/ai/ai-message';
import { AiSuggestions } from '@/components/ai/ai-suggestions';
import { useAiStore } from '@/store/ai-store';
import { cn } from '@/lib/utils';

/**
 * The conversation itself, and the only implementation of it.
 *
 * The desktop panel, the mobile sheet and `/ai-shopping` all render this
 * component over the same store, so there is one chat in ZyCart rather than
 * three that have to be kept in step. What differs between them is width and
 * chrome, which is what `variant` decides — not behaviour.
 */
interface AiChatProps {
  variant?: 'panel' | 'page';
  /** Called when the customer follows a link out, so a panel can close itself. */
  onNavigate?: () => void;
  autoFocus?: boolean;
  className?: string;
}

export function AiChat({
  variant = 'panel',
  onNavigate,
  autoFocus = false,
  className,
}: AiChatProps) {
  const messages = useAiStore((state) => state.messages);
  const status = useAiStore((state) => state.status);
  const error = useAiStore((state) => state.error);
  const availability = useAiStore((state) => state.availability);
  const send = useAiStore((state) => state.send);
  const retry = useAiStore((state) => state.retry);
  const stop = useAiStore((state) => state.stop);
  const ensureAvailability = useAiStore((state) => state.ensureAvailability);

  const bottom = useRef<HTMLDivElement>(null);
  const busy = status === 'sending';
  const unavailable = availability === 'unavailable';

  useEffect(() => {
    void ensureAvailability();
  }, [ensureAvailability]);

  /**
   * Follows the conversation down as it grows. `block: 'end'` on a sentinel
   * rather than setting `scrollTop`, so it works the same whether the scroll
   * container is the panel or the page.
   */
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy, error]);

  if (unavailable) {
    return (
      <div className={cn('flex flex-1 items-center justify-center', className)}>
        <AiUnavailable />
      </div>
    );
  }

  const isPage = variant === 'page';

  /**
   * The page gives the conversation a reading-width column, centred, the way
   * every chat product does at full width — a bubble at one edge of a 1200px
   * card and a reply at the other is a tennis match, not a conversation. The
   * panel is already narrow, so there the column is simply the panel.
   */
  const column = isPage ? 'mx-auto w-full max-w-3xl' : undefined;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {/*
        A flex column rather than a block, so the empty state can fill the
        leftover height with `flex-1` — `h-full` plus the container's own
        padding would overflow by exactly that padding and conjure a scrollbar
        for a screen with nothing to scroll.
      */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain',
          isPage ? 'px-4 py-6 sm:px-6' : 'px-4 py-4',
        )}
      >
        {messages.length === 0 ? (
          isPage ? (
            // With a whole page of room, the greeting sits in the middle of it
            // like an invitation rather than clinging to the top-left corner.
            <div
              className={cn(
                'flex flex-1 flex-col items-center justify-center py-6 text-center',
                column,
              )}
            >
              <span
                className="grid size-12 place-items-center rounded-2xl bg-brand-subtle text-brand"
                aria-hidden
              >
                <Sparkles className="size-6" />
              </span>

              <h3 className="text-h3 mt-5">Hi — I&rsquo;m ZyCart AI.</h3>
              <p className="text-small mt-2 max-w-md text-pretty text-muted-foreground">
                Tell me what you&rsquo;re looking for and I&rsquo;ll find it in the ZyCart
                catalogue. I can compare products, and add them to your cart once you&rsquo;re
                signed in.
              </p>

              <p className="text-label mt-8 text-muted-foreground">Try asking</p>
              <AiSuggestions
                onPick={send}
                disabled={busy}
                className="mt-3 max-w-lg justify-center"
              />
            </div>
          ) : (
            <div className="py-2">
              <span
                className="grid size-10 place-items-center rounded-xl bg-brand-subtle text-brand"
                aria-hidden
              >
                <Sparkles className="size-5" />
              </span>

              <h3 className="text-h4 mt-4">Hi — I&rsquo;m ZyCart AI.</h3>
              <p className="text-small mt-1.5 text-pretty text-muted-foreground">
                Tell me what you&rsquo;re looking for and I&rsquo;ll find it in the ZyCart
                catalogue. I can compare products, and add them to your cart once you&rsquo;re
                signed in.
              </p>

              <p className="text-label mt-6 text-muted-foreground">Try asking</p>
              <AiSuggestions onPick={send} disabled={busy} className="mt-3" />
            </div>
          )
        ) : (
          <div className={cn(isPage ? 'space-y-6' : 'space-y-5', column)}>
            {messages.map((message) => (
              <AiMessage key={message.id} message={message} onNavigate={onNavigate} />
            ))}
          </div>
        )}

        {/*
          The assistant's replies are announced as they arrive rather than
          silently replacing the screen for anyone not watching it.
        */}
        <div aria-live="polite" aria-atomic="false" className={cn('mt-5 space-y-4', column)}>
          {busy && <AiLoading />}
          {error && !busy && <AiError message={error} onRetry={retry} onLeave={onNavigate} />}
        </div>

        <div ref={bottom} aria-hidden />
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-border bg-background',
          isPage ? 'px-4 py-3 sm:px-6' : 'p-3',
        )}
      >
        <div className={column}>
          <AiInput onSend={send} onStop={stop} busy={busy} autoFocus={autoFocus} />

          <p className="text-caption mt-2 px-1 text-center text-muted-foreground">
            ZyCart AI answers from the live catalogue. Checkout and payment stay with you.
          </p>
        </div>
      </div>
    </div>
  );
}
