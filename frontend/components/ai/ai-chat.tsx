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

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          variant === 'page' ? 'px-1 py-2' : 'px-4 py-4',
        )}
      >
        {messages.length === 0 ? (
          <div className="py-2">
            <span
              className="grid size-10 place-items-center rounded-xl bg-brand-subtle text-brand"
              aria-hidden
            >
              <Sparkles className="size-5" />
            </span>

            <h3 className="text-h4 mt-4">Hi — I&rsquo;m ZyCart AI.</h3>
            <p className="text-small mt-1.5 text-pretty text-muted-foreground">
              Tell me what you&rsquo;re looking for and I&rsquo;ll find it in the ZyCart catalogue.
              I can compare products, and add them to your cart once you&rsquo;re signed in.
            </p>

            <p className="text-label mt-6 text-muted-foreground">Try asking</p>
            <AiSuggestions onPick={send} disabled={busy} className="mt-3" />
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) => (
              <AiMessage key={message.id} message={message} onNavigate={onNavigate} />
            ))}
          </div>
        )}

        {/*
          The assistant's replies are announced as they arrive rather than
          silently replacing the screen for anyone not watching it.
        */}
        <div aria-live="polite" aria-atomic="false" className="mt-5 space-y-4">
          {busy && <AiLoading />}
          {error && !busy && <AiError message={error} onRetry={retry} onLeave={onNavigate} />}
        </div>

        <div ref={bottom} aria-hidden />
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-border bg-background',
          variant === 'page' ? 'pt-3' : 'p-3',
        )}
      >
        <AiInput onSend={send} onStop={stop} busy={busy} autoFocus={autoFocus} />

        <p className="text-caption mt-2 px-1 text-center text-muted-foreground">
          ZyCart AI answers from the live catalogue. Checkout and payment stay with you.
        </p>
      </div>
    </div>
  );
}
