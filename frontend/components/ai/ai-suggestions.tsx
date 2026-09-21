'use client';

import { cn } from '@/lib/utils';

/**
 * Openers, and a quiet statement of what the assistant can actually do.
 *
 * Every one of these maps to something it can really answer — searching,
 * filtering by rating, comparing. None of them promise a capability that does
 * not exist, because a suggestion chip that fails is worse than no chip.
 */
export const AI_SUGGESTIONS = [
  'Find running shoes under ₹3,000',
  'Show me highly rated headphones',
  'Help me find a laptop for work',
  'What is trending right now?',
] as const;

interface AiSuggestionsProps {
  onPick: (suggestion: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AiSuggestions({ onPick, disabled = false, className }: AiSuggestionsProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {AI_SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onPick(suggestion)}
          className="focus-ring text-small rounded-full border border-border px-3 py-1.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-subtle hover:text-brand disabled:opacity-50"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
