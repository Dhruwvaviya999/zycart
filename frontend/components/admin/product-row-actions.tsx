'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Boxes, Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { deleteProduct, updateProduct } from '@/services/admin.service';
import type { AdminProductRow } from '@/types/admin';

/**
 * Row actions for a product.
 *
 * Deactivating is the top-level action and deleting is below a separator,
 * because deactivating is what an operator almost always means: it takes the
 * product out of the shop while every order that contains it keeps working.
 * Deleting is offered because the API supports it, marked destructive, and its
 * confirmation says plainly what survives and what does not.
 */
export function ProductRowActions({ product }: { product: AdminProductRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<'visibility' | 'delete' | null>(null);

  const hiding = product.isActive;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${product.name}`}
          className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href={`/admin/products/${product.id}`} />}>
            <Pencil className="size-4 text-muted-foreground" aria-hidden />
            Edit
          </DropdownMenuItem>

          {/* Stock is not editable on the product form from Phase 12, so the
              row has to say where it *is* editable rather than leaving an
              operator to hunt for a field that is no longer there. */}
          <DropdownMenuItem render={<Link href={`/admin/inventory/${product.id}`} />}>
            <Boxes className="size-4 text-muted-foreground" aria-hidden />
            Stock and history
          </DropdownMenuItem>

          {product.slug && (
            <DropdownMenuItem
              render={<Link href={`/products/${product.slug}`} target="_blank" rel="noreferrer" />}
            >
              <Eye className="size-4 text-muted-foreground" aria-hidden />
              View in store
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => setConfirming('visibility')}>
            {hiding ? (
              <EyeOff className="size-4 text-muted-foreground" aria-hidden />
            ) : (
              <Eye className="size-4 text-muted-foreground" aria-hidden />
            )}
            {hiding ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setConfirming('delete')}>
            <Trash2 className="size-4 text-destructive" aria-hidden />
            <span className="text-destructive">Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming === 'visibility'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={hiding ? 'Deactivate this product?' : 'Activate this product?'}
        description={
          hiding ? (
            <>
              <strong>{product.name}</strong> will stop appearing in the shop, in search and in
              filters. Existing orders that contain it are unaffected, and you can activate it again
              at any time.
            </>
          ) : (
            <>
              <strong>{product.name}</strong> will appear in the shop again.
              {product.stock <= 0 && ' It currently has no stock, so it will show as sold out.'}
            </>
          )
        }
        confirmLabel={hiding ? 'Deactivate' : 'Activate'}
        busyLabel="Saving…"
        onConfirm={async () => {
          await updateProduct(product.id, { isActive: !product.isActive });
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete this product?"
        destructive
        description={
          <>
            <strong>{product.name}</strong> will be removed from the catalogue permanently. Past
            orders keep their own copy of it, so order history stays intact — but reviews and the
            product page will be gone. Deactivating instead keeps everything and simply hides it.
          </>
        }
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        onConfirm={async () => {
          await deleteProduct(product.id);
          router.refresh();
        }}
      />
    </>
  );
}
