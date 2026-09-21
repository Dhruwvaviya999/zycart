'use client';

import { useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AuthError } from '@/components/auth/auth-error';
import { RatingSelector } from '@/components/reviews/rating-selector';
import { toErrorMessage } from '@/services/api';
import { createReview, updateReview } from '@/services/review.service';
import { MAX_REVIEW_IMAGES, type OwnReview, type RatingValue } from '@/types/review';
import { cn } from '@/lib/utils';

const COMMENT_MIN = 10;
const COMMENT_MAX = 2000;
const TITLE_MAX = 120;

interface Fields {
  rating?: string;
  title?: string;
  comment?: string;
  images?: string;
}

interface FormProps {
  productId: string;
  existing?: OwnReview | null;
  onSaved: (review: OwnReview) => void;
  onCancel: () => void;
}

/**
 * Writing or editing a review.
 *
 * One component serves both, because they are the same task with a different
 * starting point — a separate "edit" design would drift from the "write" one
 * and teach the customer the form twice.
 *
 * A bottom sheet on a phone and a centred dialog from `sm` up, matching the
 * cancellation dialog, so the pattern is learned once. The body scrolls
 * independently of the header and footer, which is what keeps the submit button
 * reachable when the keyboard is open on a small screen.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  productId,
  productName,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  /** Present when editing; absent when writing a first review. */
  existing?: OwnReview | null;
  onSaved: (review: OwnReview) => void;
}) {
  const editing = Boolean(existing);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        variant="sheet"
          size="lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <DialogTitle className="text-h4">
              {editing ? 'Edit your review' : 'Write a review'}
            </DialogTitle>
            <DialogDescription className="text-caption mt-1 text-pretty text-muted-foreground">
              {productName}
            </DialogDescription>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="focus-ring -mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/*
          Keyed and mounted only while open, so the form's state comes from its
          props at mount and is thrown away on close. That is what makes
          "edit one review, then write another" start from a clean form without
          an effect syncing props into state behind the scenes.
        */}
        <ReviewForm
          key={existing?.id ?? `new:${productId}`}
          productId={productId}
          existing={existing}
          onSaved={onSaved}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({ productId, existing, onSaved, onCancel }: FormProps) {
  const editing = Boolean(existing);

  const [rating, setRating] = useState<RatingValue | null>(
    (existing?.rating as RatingValue | undefined) ?? null,
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [images, setImages] = useState<string[]>(existing?.images ?? []);
  const [imageDraft, setImageDraft] = useState('');

  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function addImage() {
    const url = imageDraft.trim();
    if (!url) return;

    if (images.length >= MAX_REVIEW_IMAGES) {
      setFields((current) => ({
        ...current,
        images: `You can add up to ${MAX_REVIEW_IMAGES} photos.`,
      }));
      return;
    }

    try {
      // Validated here as well as on the server, so a typo is caught before a
      // round trip rather than coming back as a field error.
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
    } catch {
      setFields((current) => ({ ...current, images: 'That does not look like a valid link.' }));
      return;
    }

    if (images.includes(url)) {
      setFields((current) => ({ ...current, images: 'That photo has already been added.' }));
      return;
    }

    setImages((current) => [...current, url]);
    setImageDraft('');
    setFields((current) => ({ ...current, images: undefined }));
  }

  function validate(): boolean {
    const next: Fields = {};

    if (rating === null) next.rating = 'Please choose a rating.';

    const trimmed = comment.trim();
    if (trimmed.length < COMMENT_MIN) {
      next.comment = `Your review should be at least ${COMMENT_MIN} characters.`;
    } else if (trimmed.length > COMMENT_MAX) {
      next.comment = `Your review should be at most ${COMMENT_MAX} characters.`;
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 0 && trimmedTitle.length < 3) {
      next.title = 'A title should be at least 3 characters, or leave it empty.';
    }

    setFields(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // The guard that makes a double click harmless: the second submit returns
    // before it can create a second review.
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setError(undefined);

    try {
      const draft = {
        rating: rating as RatingValue,
        title: title.trim(),
        comment: comment.trim(),
        images,
      };

      const saved = existing
        ? await updateReview(existing.id, draft)
        : await createReview(productId, draft);

      onSaved(saved);
    } catch (cause) {
      setError(toErrorMessage(cause));
      setSubmitting(false);
    }
  }

  const remaining = COMMENT_MAX - comment.trim().length;

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <fieldset disabled={submitting} className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 p-5">
          <AuthError message={error} />

          <div>
            <RatingSelector
              value={rating}
              onChange={(next) => {
                setRating(next);
                setFields((current) => ({ ...current, rating: undefined }));
              }}
              invalid={Boolean(fields.rating)}
              describedBy="review-rating-error"
            />
            {/* Reserved height, so an error appearing does not jolt the form. */}
            <p
              id="review-rating-error"
              role={fields.rating ? 'alert' : undefined}
              className="text-caption min-h-4 pt-2 font-medium text-destructive"
            >
              {fields.rating ?? ''}
            </p>
          </div>

          <div>
            <label htmlFor="review-title" className="text-small font-medium">
              Add a headline <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="review-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setFields((current) => ({ ...current, title: undefined }));
              }}
              maxLength={TITLE_MAX}
              placeholder="Sum it up in a few words"
              aria-invalid={Boolean(fields.title) || undefined}
              aria-describedby="review-title-error"
              className="mt-2"
            />
            <p
              id="review-title-error"
              role={fields.title ? 'alert' : undefined}
              className="text-caption min-h-4 pt-2 font-medium text-destructive"
            >
              {fields.title ?? ''}
            </p>
          </div>

          <div>
            <label htmlFor="review-comment" className="text-small font-medium">
              Your review
            </label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setFields((current) => ({ ...current, comment: undefined }));
              }}
              rows={5}
              maxLength={COMMENT_MAX}
              placeholder="What did you like or dislike? How did it compare to what you expected?"
              aria-invalid={Boolean(fields.comment) || undefined}
              aria-describedby="review-comment-error review-comment-count"
              className="mt-2"
            />

            <div className="flex items-start justify-between gap-3">
              <p
                id="review-comment-error"
                role={fields.comment ? 'alert' : undefined}
                className="text-caption min-h-4 pt-2 font-medium text-destructive"
              >
                {fields.comment ?? ''}
              </p>

              <p
                id="review-comment-count"
                className={cn(
                  'text-caption shrink-0 pt-2 tabular-nums',
                  remaining < 0 ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {remaining.toLocaleString('en-IN')} left
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="review-image" className="text-small font-medium">
              Photos <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <p className="text-caption mt-1 text-muted-foreground">
              Paste a link to a photo. Up to {MAX_REVIEW_IMAGES}.
            </p>

            <div className="mt-2 flex gap-2">
              <Input
                id="review-image"
                type="url"
                inputMode="url"
                value={imageDraft}
                onChange={(event) => {
                  setImageDraft(event.target.value);
                  setFields((current) => ({ ...current, images: undefined }));
                }}
                onKeyDown={(event) => {
                  // Enter adds the photo instead of submitting the whole form,
                  // which is almost never what is meant from this field.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addImage();
                  }
                }}
                disabled={images.length >= MAX_REVIEW_IMAGES}
                placeholder="https://…"
                aria-invalid={Boolean(fields.images) || undefined}
                aria-describedby="review-image-error"
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="cta"
                onClick={addImage}
                disabled={images.length >= MAX_REVIEW_IMAGES}
              >
                <ImagePlus className="size-4" data-icon="inline-start" aria-hidden />
                Add
              </Button>
            </div>

            <p
              id="review-image-error"
              role={fields.images ? 'alert' : undefined}
              className="text-caption min-h-4 pt-2 font-medium text-destructive"
            >
              {fields.images ?? ''}
            </p>

            {images.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-2">
                {images.map((src) => (
                  <li key={src} className="relative">
                    {/* Plain img: these are arbitrary customer links, which
                        next/image would refuse unless the host is configured. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="size-16 rounded-xl border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setImages((current) => current.filter((it) => it !== src))}
                      className="focus-ring absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
                    >
                      <X className="size-3" aria-hidden />
                      <span className="sr-only">Remove photo</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 p-5 sm:flex-row sm:justify-end">
        <Button type="button" size="cta" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>

        <Button type="submit" size="cta" variant="brand" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
              {editing ? 'Saving…' : 'Posting…'}
            </>
          ) : editing ? (
            'Save changes'
          ) : (
            'Post review'
          )}
        </Button>
      </div>
    </form>
  );
}
