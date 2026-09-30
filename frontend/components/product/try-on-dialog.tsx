'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Camera, Download, ImagePlus, Loader2, RotateCcw, ShoppingBag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { toErrorMessage } from '@/services/api';
import { createTryOn } from '@/services/try-on.service';
import { PhotoError, preparePhoto } from '@/lib/photo';
import type { Product } from '@/types/product';
import type { TryOnResult, TryOnStatus } from '@/types/try-on';

type Stage =
  | { kind: 'pick' }
  | { kind: 'ready'; photo: Blob; preview: string }
  | { kind: 'working'; photo: Blob; preview: string }
  | { kind: 'done'; photo: Blob; preview: string; result: TryOnResult }
  | { kind: 'failed'; photo: Blob; preview: string; message: string };

interface TryOnDialogProps {
  product: Product;
  /** The colourway chosen on the page, if any. The server checks it against the product. */
  colour?: string;
  status: TryOnStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tries left after a generation, so the button beside the page stays in step. */
  onRemainingChange: (remaining: number) => void;
  /** The page's own add-to-cart, with the page's size and colour rules. */
  onAddToCart: () => Promise<boolean>;
}

/**
 * The virtual fitting room.
 *
 * ## What happens to the photo, in the order it happens
 *
 * It is chosen, redrawn on this device at a sensible size — which also strips
 * its location metadata, see `preparePhoto` — shown back to the customer, and
 * sent once they have ticked the consent box. The preview that comes back is a
 * `data:` URL held in this component's state; closing the dialog drops both.
 * Nothing is written to storage, and the server keeps neither picture.
 *
 * ## Why the result says "preview"
 *
 * It is a model's rendering, not a photograph and not a fit guarantee. It can
 * be wrong about how a size sits, how a fabric falls or exactly how a colour
 * reads on a screen, and the page says so beside the picture rather than in a
 * footnote.
 */
export function TryOnDialog({
  product,
  colour,
  status,
  open,
  onOpenChange,
  onRemainingChange,
  onAddToCart,
}: TryOnDialogProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [consent, setConsent] = useState(false);
  const [photoError, setPhotoError] = useState<string>();
  const [adding, setAdding] = useState(false);

  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  const preview = stage.kind === 'pick' ? null : stage.preview;

  /**
   * The object URL for the chosen photo is released whenever it is replaced
   * and when the dialog goes away, so a customer trying five photos does not
   * leave five copies of themselves in memory.
   */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  /** Abandons a request still running when the dialog is closed or unmounted. */
  useEffect(() => () => inFlight.current?.abort(), []);

  const footwear = /\b(footwear|shoes?)\b/i.test(
    `${product.category.slug} ${product.category.name}`,
  );

  function reset() {
    inFlight.current?.abort();
    setStage({ kind: 'pick' });
    setConsent(false);
    setPhotoError(undefined);
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setPhotoError(undefined);

    try {
      const prepared = await preparePhoto(file);
      setStage({
        kind: 'ready',
        photo: prepared.blob,
        preview: URL.createObjectURL(prepared.blob),
      });
    } catch (cause) {
      setPhotoError(cause instanceof PhotoError ? cause.message : 'This photo could not be used.');
    }
  }

  async function generate() {
    if (stage.kind !== 'ready' && stage.kind !== 'failed') return;
    if (!consent) return;

    const { photo, preview: current } = stage;
    const controller = new AbortController();
    inFlight.current = controller;

    setStage({ kind: 'working', photo, preview: current });

    try {
      const result = await createTryOn(product.slug, photo, colour, controller.signal);
      setStage({ kind: 'done', photo, preview: current, result });
      onRemainingChange(result.remainingToday);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setStage({ kind: 'failed', photo, preview: current, message: toErrorMessage(cause) });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  async function addToCart() {
    setAdding(true);
    const added = await onAddToCart();
    setAdding(false);

    // Either way the page is where the answer is: the bag badge when it
    // worked, the size or colour prompt beside the picker when it did not.
    onOpenChange(false);
    if (added) reset();
  }

  const signedIn = status.remainingToday !== null;
  const outOfTries = signedIn && status.remainingToday === 0 && stage.kind !== 'done';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} variant="sheet" size="xl">
        <div className="flex items-start gap-3 border-b border-border p-5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-h4">Try it on</DialogTitle>
            <DialogDescription className="text-caption mt-0.5 text-muted-foreground">
              {product.brand.name} {product.name}
              {colour ? ` · ${colour}` : ''}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            aria-label="Close"
            className="focus-ring -mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!signedIn ? (
            <SignInPrompt slug={product.slug} />
          ) : outOfTries ? (
            <p className="text-small rounded-xl border border-border bg-surface p-4 text-pretty">
              You have used all {status.dailyLimit} try-ons for today. Your allowance resets at
              midnight (IST).
            </p>
          ) : stage.kind === 'pick' ? (
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  size="cta-lg"
                  variant="outline"
                  onClick={() => galleryInput.current?.click()}
                >
                  <ImagePlus className="size-4" data-icon="inline-start" aria-hidden />
                  Choose a photo
                </Button>
                {/* Opens the front camera on a phone; a file picker elsewhere. */}
                <Button
                  size="cta-lg"
                  variant="outline"
                  onClick={() => cameraInput.current?.click()}
                >
                  <Camera className="size-4" data-icon="inline-start" aria-hidden />
                  Take a photo
                </Button>
              </div>

              <input
                ref={galleryInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  void choose(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="user"
                hidden
                onChange={(event) => {
                  void choose(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />

              {photoError && (
                <p role="alert" className="text-caption mt-3 font-medium text-destructive">
                  {photoError}
                </p>
              )}

              <ul className="text-caption mt-5 space-y-1.5 text-muted-foreground">
                <li>
                  {footwear
                    ? '• A full-length photo with your feet visible works best.'
                    : '• A front-facing photo, from the waist up or full length, works best.'}
                </li>
                <li>• Good light, a plain background and just you in the picture.</li>
                <li>• Your photo is resized on this device before it is sent.</li>
              </ul>
            </div>
          ) : (
            <div>
              <div
                className={stage.kind === 'done' ? 'grid gap-3 sm:grid-cols-2' : 'mx-auto max-w-sm'}
              >
                <Figure src={stage.preview} caption="Your photo" busy={stage.kind === 'working'} />
                {stage.kind === 'done' && (
                  <Figure src={stage.result.image} caption={`With the ${product.name}`} />
                )}
              </div>

              {stage.kind === 'done' ? (
                <>
                  <p className="text-caption mt-4 text-pretty text-muted-foreground">
                    An AI preview, not a photograph: it cannot show exactly how a size fits or a
                    fabric falls, and colours vary between screens. {stage.result.remainingToday} of{' '}
                    {stage.result.dailyLimit} try-ons left today.
                  </p>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Button
                      size="cta"
                      variant="brand"
                      className="flex-1"
                      onClick={() => void addToCart()}
                      disabled={adding}
                    >
                      {adding ? (
                        <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                      ) : (
                        <ShoppingBag className="size-4" data-icon="inline-start" aria-hidden />
                      )}
                      Add to cart
                    </Button>
                    <Button
                      size="cta"
                      variant="outline"
                      render={
                        <a href={stage.result.image} download={`zycart-try-on-${product.slug}`} />
                      }
                    >
                      <Download className="size-4" data-icon="inline-start" aria-hidden />
                      Save
                    </Button>
                    <Button size="cta" variant="outline" onClick={reset}>
                      <RotateCcw className="size-4" data-icon="inline-start" aria-hidden />
                      Another photo
                    </Button>
                  </div>
                </>
              ) : stage.kind === 'working' ? (
                <p
                  role="status"
                  className="text-small mt-4 flex items-center justify-center gap-2 text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Creating your preview — this usually takes 10 to 20 seconds.
                </p>
              ) : (
                <>
                  {stage.kind === 'failed' && (
                    <p
                      role="alert"
                      className="text-small mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 font-medium text-destructive"
                    >
                      {stage.message}
                    </p>
                  )}

                  <label className="focus-within:ring-ring/45 mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg py-1 focus-within:ring-[3px]">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                    />
                    <span className="text-caption text-pretty">
                      This is a photo of me, I am 18 or over, and I agree to it being sent to{' '}
                      {status.processor ?? 'our image AI provider'} to create this preview. ZyCart
                      does not keep my photo or the result.
                    </span>
                  </label>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      size="cta"
                      variant="brand"
                      className="flex-1"
                      onClick={() => void generate()}
                      disabled={!consent}
                    >
                      {stage.kind === 'failed' ? 'Try again' : 'Create my preview'}
                    </Button>
                    <Button size="cta" variant="outline" onClick={reset}>
                      Choose another photo
                    </Button>
                  </div>

                  <p className="text-caption mt-3 text-muted-foreground">
                    {status.remainingToday} of {status.dailyLimit} try-ons left today.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SignInPrompt({ slug }: { slug: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 text-center">
      <p className="text-small font-medium">Sign in to try this on</p>
      <p className="text-caption mx-auto mt-1.5 max-w-sm text-pretty text-muted-foreground">
        Virtual try-on uses your ZyCart account, so your daily try-ons are kept for you.
      </p>
      <Button
        size="cta"
        variant="brand"
        className="mt-4"
        render={<Link href={`/login?redirect=${encodeURIComponent(`/products/${slug}`)}`} />}
      >
        Sign in
      </Button>
    </div>
  );
}

/**
 * One picture with its caption.
 *
 * A plain `<img>`, not `next/image`: both sources are a `blob:` or `data:` URL
 * that exists only in this tab, with nothing for an image optimiser to fetch.
 */
function Figure({ src, caption, busy }: { src: string; caption: string; busy?: boolean }) {
  return (
    <figure>
      <div className="relative overflow-hidden rounded-xl bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption} className="max-h-[55dvh] w-full object-contain" />
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-[2px]">
            <Loader2 className="size-7 animate-spin text-brand" aria-hidden />
          </div>
        )}
      </div>
      <figcaption className="text-caption mt-1.5 text-center text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
