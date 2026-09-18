'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ProductBadgeChip } from '@/components/product/product-badge';
import type { Product } from '@/types/product';
import { cn } from '@/lib/utils';

/**
 * Thumbnail gallery with a pointer-tracked zoom on the active image.
 * Zoom is pointer-only; keyboard and touch users get the plain image.
 */
export function ProductGallery({ product }: { product: Product }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [origin, setOrigin] = useState('50% 50%');
  const [zoomed, setZoomed] = useState(false);

  const active = product.images[activeIndex] ?? product.images[0];
  if (!active) return null;

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
      {product.images.length > 1 && (
        <ul className="no-scrollbar flex gap-3 overflow-x-auto sm:flex-col sm:overflow-visible">
          {product.images.map((image, index) => (
            <li key={image.url + index}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`View image ${index + 1} of ${product.images.length}`}
                aria-current={index === activeIndex}
                className={cn(
                  'focus-ring relative block size-18 shrink-0 overflow-hidden rounded-xl bg-surface ring-1 transition-all sm:size-20',
                  index === activeIndex
                    ? 'ring-2 ring-brand'
                    : 'ring-border/70 hover:ring-foreground/25',
                )}
              >
                <Image src={image.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className="relative aspect-4/5 flex-1 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70"
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 100;
          const y = ((event.clientY - rect.top) / rect.height) * 100;
          setOrigin(`${x}% ${y}%`);
        }}
        onPointerEnter={(event) => event.pointerType === 'mouse' && setZoomed(true)}
        onPointerLeave={() => setZoomed(false)}
      >
        <Image
          key={active.url}
          src={active.url}
          alt={active.alt}
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          style={{ transformOrigin: origin }}
          className={cn(
            'object-cover transition-transform duration-500 ease-brand',
            zoomed && 'scale-[1.7] duration-200',
          )}
        />

        {product.badges.length > 0 && (
          <div className="pointer-events-none absolute top-4 left-4 flex flex-wrap gap-2">
            {product.badges.map((badge) => (
              <ProductBadgeChip key={badge} badge={badge} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
