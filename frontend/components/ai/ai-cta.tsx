'use client';

import { Sparkles } from 'lucide-react';
import { useAiStore } from '@/store/ai-store';
import { cn } from '@/lib/utils';

/**
 * "Ask ZyCart AI about this product", on the product page.
 *
 * It hands the assistant the product's **id** and nothing else. The server
 * looks the product up and tells the model what it is, which is why the answer
 * is about today's price and stock rather than whatever this page was rendered
 * with — a tab left open for an hour cannot become the source of truth for its
 * own product.
 *
 * It also means the customer never has to copy the product name into a chat box
 * to ask a question about the page they are already on.
 *
 * Renders nothing when the store has no assistant.
 */
interface AiProductCtaProps {
  productId: string;
  productName: string;
  className?: string;
}

export function AiProductCta({ productId, productName, className }: AiProductCtaProps) {
  const availability = useAiStore((state) => state.availability);
  const openAssistant = useAiStore((state) => state.openAssistant);

  if (availability !== 'available') return null;

  return (
    <button
      type="button"
      onClick={() => openAssistant(productId)}
      className={cn(
        'focus-ring text-small inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 font-medium transition-colors hover:border-brand/40 hover:bg-brand-subtle hover:text-brand',
        className,
      )}
    >
      <Sparkles className="size-4 text-brand" aria-hidden />
      Ask ZyCart AI about this product
      <span className="sr-only">: {productName}</span>
    </button>
  );
}
