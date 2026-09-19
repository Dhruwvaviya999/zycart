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

      <div className="mt-7 flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>

        <div>
          <h1 className="text-h2">AI Shopping</h1>
          <p className="text-body mt-2 max-w-xl text-pretty text-muted-foreground">
            Describe what you need the way you would to a friend. ZyCart AI searches the real
            catalogue, so every price, rating and stock figure it shows you is the live one.
          </p>
        </div>
      </div>

      {/*
        A bounded height rather than a growing page: the composer stays put at
        the bottom of the conversation, as it does in the panel, instead of
        drifting further down with every reply. `dvh` so the mobile browser's
        chrome cannot push it out of reach, and capped in rem so that on a tall
        desktop screen the composer still lands above the fold rather than one
        scroll below the heading that introduced it.
      */}
      <div className="mt-6 flex h-[min(32rem,62dvh)] flex-col rounded-2xl border border-border bg-surface/40 p-3 sm:p-4 lg:h-[min(34rem,60dvh)]">
        <AiChat variant="page" />
      </div>

      <p className="text-caption mt-5 max-w-2xl text-pretty text-muted-foreground">
        ZyCart AI can search, explain and compare products, and add them to your cart once you are
        signed in. It cannot place an order or take a payment — checkout stays with you.
      </p>
    </Container>
  );
}
