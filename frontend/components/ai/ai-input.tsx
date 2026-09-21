'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The composer.
 *
 * A textarea rather than an input, because "I need something warm for Delhi in
 * December under ₹6,000" does not fit on one line and should not scroll away as
 * it is typed. It grows to a ceiling and then scrolls, so the conversation
 * above never disappears behind it on a phone.
 */
interface AiInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  /** Focus on mount — right for a panel that just opened, wrong on page load. */
  autoFocus?: boolean;
}

const MAX_HEIGHT = 120;

export function AiInput({
  onSend,
  onStop,
  busy,
  disabled = false,
  autoFocus = false,
}: AiInputProps) {
  const [value, setValue] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Re-measured from scratch each time: reading `scrollHeight` without first
  // collapsing the box measures the height it already has, so it could only
  // ever grow.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;

    element.style.height = 'auto';
    element.style.height = `${String(Math.min(element.scrollHeight, MAX_HEIGHT))}px`;
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || busy || disabled) return;

    onSend(trimmed);
    setValue('');
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 transition-colors focus-within:border-brand/40"
    >
      <label htmlFor="ai-input" className="sr-only">
        Ask ZyCart AI
      </label>

      <textarea
        id="ai-input"
        ref={textarea}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter writes a new line — the convention every
          // chat surface shares, and the one people's hands already know.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={disabled ? 'The assistant is unavailable' : 'Describe what you need...'}
        className="text-small max-h-[7.5rem] w-full resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />

      {busy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className="focus-ring grid size-9 shrink-0 place-items-center rounded-xl border border-border transition-colors hover:bg-muted"
        >
          <Square className="size-3.5 fill-current" aria-hidden />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className={cn(
            'focus-ring grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
            'bg-brand text-brand-foreground hover:bg-[color-mix(in_oklch,var(--brand),black_9%)]',
            'disabled:bg-muted disabled:text-muted-foreground',
          )}
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}
