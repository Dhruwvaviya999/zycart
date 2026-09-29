'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Opens the browser's print dialog.
 *
 * Which is also how a PDF is made: every browser's print dialog offers "Save as
 * PDF", and the invoice is laid out for A4. Generating PDFs on the server would
 * mean a headless browser or a PDF library in the API for a document the
 * customer's own browser can already produce faithfully.
 */
export function PrintButton() {
  return (
    <Button size="sm" variant="brand" onClick={() => window.print()}>
      <Printer className="size-3.5" data-icon="inline-start" aria-hidden />
      Print or save as PDF
    </Button>
  );
}
