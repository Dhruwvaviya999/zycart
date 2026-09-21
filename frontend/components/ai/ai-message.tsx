'use client';

import { Check, Sparkles } from 'lucide-react';
import { AiComparisonTable } from '@/components/ai/ai-comparison';
import { AiProductCard } from '@/components/ai/ai-product-card';
import { AiText } from '@/components/ai/ai-text';
import type { AiMessage as AiMessageModel } from '@/types/ai';
import { cn } from '@/lib/utils';

/**
 * One turn of the conversation.
 *
 * The customer's words sit in a bubble; the assistant's sit on the panel, where
 * there is room for product cards and a comparison table underneath. Those are
 * rendered from the structured data the server sent with the reply, not from
 * anything parsed out of the reply itself — so a card's price is the
 * catalogue's price whatever the sentence above it says.
 */
interface AiMessageProps {
  message: AiMessageModel;
  onNavigate?: () => void;
}

export function AiMessage({ message, onNavigate }: AiMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="text-small max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-pretty text-brand-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  const comparedIds = new Set(message.comparison?.productIds ?? []);

  // Products already laid out as table columns are not repeated as cards above
  // it — the same product twice reads as two products.
  const cards = message.comparison
    ? message.products.filter((product) => !comparedIds.has(product.id))
    : message.products;

  return (
    <div className="flex gap-2.5">
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand"
        aria-hidden
      >
        <Sparkles className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1 space-y-3">
        <AiText text={message.content} className="text-small text-pretty" />

        {message.comparison && (
          <AiComparisonTable comparison={message.comparison} products={message.products} />
        )}

        {cards.length > 0 && (
          <ul className="space-y-2">
            {cards.map((product, index) => (
              <li key={product.id}>
                <AiProductCard product={product} index={index} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}

        {/*
          What the assistant actually did, separate from what it said.

          Rendered from the server's own record of the write, so it appears only
          when the cart really changed — the assistant cannot produce this by
          claiming something was added.
        */}
        {message.actions.map((action) => (
          <p
            key={`${action.productId}-${action.selectedSize ?? ''}-${action.selectedColor ?? ''}`}
            className={cn(
              'text-caption flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 font-medium text-success',
            )}
          >
            <Check className="size-3.5 shrink-0" aria-hidden />
            <span>
              Added to your cart: {action.productName}
              {action.selectedSize ? `, size ${action.selectedSize}` : ''}
              {action.selectedColor ? `, ${action.selectedColor}` : ''}
              {action.quantity > 1 ? ` × ${String(action.quantity)}` : ''}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
