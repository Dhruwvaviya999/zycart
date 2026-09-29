'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toErrorMessage } from '@/services/api';
import { uploadProductImage } from '@/services/admin.service';

/** Mirrors the server's `MAX_IMAGE_BYTES`, so an oversized file is refused before it is sent. */
const MAX_BYTES = 5 * 1024 * 1024;

/** What the file picker offers. The server decides what a file is from its bytes regardless. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

/**
 * Uploads product photos and hands back their URLs.
 *
 * The URLs join the product form's image list exactly as a pasted one would;
 * nothing is attached to the product until the form is saved, which is the
 * change the audit trail records. Files go one at a time, in the order picked,
 * so a failure names the file it belongs to and the ones before it are kept.
 *
 * The size check here is a courtesy that saves sending a file the server would
 * refuse. The type check is the server's alone — it reads the file's own bytes,
 * because a name and a declared type are whatever the uploader said.
 */
export function ImageUploadButton({
  onUploaded,
  remaining,
  disabled,
}: {
  onUploaded: (url: string) => void;
  /** How many more images the product may hold. */
  remaining: number;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string>();

  async function upload(files: File[]) {
    setError(undefined);

    const batch = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(`A product can hold 10 images; only the first ${String(remaining)} were added.`);
    }

    setProgress({ done: 0, total: batch.length });

    for (const [index, file] of batch.entries()) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 5 MB. Resize it and try again.`);
        break;
      }

      try {
        const stored = await uploadProductImage(file);
        onUploaded(stored.url);
        setProgress({ done: index + 1, total: batch.length });
      } catch (cause) {
        setError(`${file.name}: ${toErrorMessage(cause)}`);
        break;
      }
    }

    setProgress(null);
  }

  const busy = progress !== null;

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Cleared so choosing the same file again still fires a change.
          event.target.value = '';
          if (files.length > 0) void upload(files);
        }}
      />

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => input.current?.click()}
        disabled={disabled || busy || remaining <= 0}
      >
        {busy ? (
          <>
            <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden />
            Uploading {progress.done + 1} of {progress.total}…
          </>
        ) : (
          <>
            <Upload className="size-3.5" data-icon="inline-start" aria-hidden />
            Upload images
          </>
        )}
      </Button>

      <p
        role={error ? 'alert' : undefined}
        className={
          error
            ? 'text-caption min-h-4 pt-1.5 font-medium text-destructive'
            : 'text-caption min-h-4 pt-1.5 text-muted-foreground'
        }
      >
        {error ?? 'JPEG, PNG, WebP, GIF or AVIF, up to 5 MB each.'}
      </p>
    </div>
  );
}
