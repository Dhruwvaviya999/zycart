'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportSubscribers } from '@/services/admin.service';
import { toErrorMessage } from '@/services/api';

/**
 * The newsletter export, as a button.
 *
 * ## Why this fetches rather than links
 *
 * A plain link to the endpoint would show an operator a page of raw JSON
 * whenever the export failed — an expired session, a server fault — where this
 * can say what went wrong in place, beside the button they pressed. And the
 * file is built on request, so there is a moment worth showing a spinner for.
 *
 * ## What is in the file is the server's business
 *
 * Which addresses, which columns and the signed unsubscribe link on every row
 * are all decided by the API. Nothing here filters, reorders or reshapes the
 * file; it is handed to the browser exactly as it arrived.
 */
export function SubscriberExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function download() {
    // The guard that makes a double-click one file rather than two.
    if (busy) return;

    setBusy(true);
    setError(undefined);

    try {
      const { blob, filename } = await exportSubscribers();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename.endsWith('.csv') ? filename : fallbackName();
      document.body.append(link);
      link.click();
      link.remove();

      // Released a moment after the click rather than in the same breath: the
      // browser starts a download asynchronously, and a URL revoked before it
      // has been read can leave the operator with a failed download instead of
      // a file.
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button size="sm" variant="brand" onClick={() => void download()} disabled={busy}>
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden />
        ) : (
          <Download className="size-3.5" data-icon="inline-start" aria-hidden />
        )}
        {busy ? 'Preparing…' : 'Export CSV'}
      </Button>

      {error && (
        <p role="alert" className="text-caption max-w-64 text-right text-pretty text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The name the server would have given the file.
 *
 * The API names it in `Content-Disposition`, but a script can only read that
 * header when the API shares the storefront's origin — as it does when
 * deployed. Cross-origin, as in development, the header is not exposed and
 * the name never arrives, so this follows the server's own pattern and the
 * file is called the same thing either way.
 */
function fallbackName(): string {
  return `zycart-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
}
