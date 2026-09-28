import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { AiChat } from '@/components/ai/ai-chat';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { Container } from '@/components/layout/container';

export const metadata: Metadata = {
  title: 'AI Shopping',
  description:
    'Describe what you need and ZyCart AI will find it in the catalogue — with live prices, ratings and availability.',
};

/**
 * The assistant with the whole page to itself.
 *
 * It exists because the panel is the right shape for asking about the product
 * you are looking at, and the wrong shape for a longer conversation: comparison
 * tables and a run of product cards want more than 27rem. The homepage CTA
 * needed a destination too, and sending it to a page that opens a panel is a
 * worse answer than sending it to a page that *is* the conversation.
 *
 * It is not a second chat. `AiChat` and the store behind it are the same ones
 * the panel uses, so a conversation started in one continues in the other and
 * there is only ever one implementation to keep correct.
 */
export default function AiShoppingPage() {
  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'AI Shopping' }]} />

      <div className="mt-6 flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>

        <div className="min-w-0">
          <h1 className="text-h2">AI Shopping</h1>
          <p className="text-small mt-1 max-w-xl text-pretty text-muted-foreground">
            Ask for what you need — answers come from the live catalogue.
          </p>
        </div>
      </div>

      {/*
        A bounded height rather than a growing page: the composer stays put at
        the bottom of the conversation, as it does in the panel, instead of
        drifting further down with every reply. The height is the viewport minus
        the chrome above and below the card (navbar, heading, page padding), so
        the whole conversation is on screen without the page itself scrolling —
        clamped so a short phone viewport still gets a usable window and a tall
        desktop one does not become a canyon. No padding on the card: the chat
        owns its own gutters, so the scroll area and the composer's top border
        reach the card's edges instead of floating inside a second frame.
      */}
      <div className="mt-5 flex h-[clamp(26rem,calc(100dvh-18.5rem),46rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface/40">
        <AiChat variant="page" />
      </div>
    </Container>
  );
}
