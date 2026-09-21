'use client';

import { Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AiAssistant } from '@/components/ai/ai-assistant';
import { useAiStore } from '@/store/ai-store';

/**
 * The assistant's one entry point, mounted once for the whole storefront.
 *
 * A small pill in the bottom corner, not a glowing orb: it sits below the
 * navbar in the visual hierarchy and well below the cart, which is still the
 * control a shopper needs most. It does not pulse, float or animate on a timer —
 * the reason to open it should be that you have a question, not that something
 * moved.
 *
 * It renders nothing at all when this deployment has no assistant, so a store
 * without one has no control that fails when tapped.
 *
 * Hidden on `/ai-shopping`, where the conversation is already the page.
 */
export function AiLauncher() {
  const availability = useAiStore((state) => state.availability);
  const open = useAiStore((state) => state.open);
  const openAssistant = useAiStore((state) => state.openAssistant);
  const ensureAvailability = useAiStore((state) => state.ensureAvailability);
  const pathname = usePathname();

  useEffect(() => {
    void ensureAvailability();
  }, [ensureAvailability]);

  if (availability !== 'available') return null;

  const onDedicatedPage = pathname === '/ai-shopping';

  return (
    <>
      {!onDedicatedPage && (
        <button
          type="button"
          data-slot="ai-launcher"
          onClick={() => openAssistant()}
          aria-expanded={open}
          className="focus-ring text-small fixed right-4 bottom-4 z-30 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background font-medium shadow-lg transition-colors hover:bg-surface max-sm:size-11 sm:right-6 sm:bottom-6 sm:px-4"
        >
          <Sparkles className="size-4 text-brand" aria-hidden />
          <span className="max-sm:sr-only">Ask ZyCart AI</span>
        </button>
      )}

      <AiAssistant />
    </>
  );
}
