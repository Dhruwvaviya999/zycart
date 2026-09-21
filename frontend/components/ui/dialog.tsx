'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        /* 10% black was not enough scrim to separate a white dialog from a
           white page, and in the dark theme it was barely there at all. This
           is dim enough to say "the page behind is not available" and light
           enough that the page is still recognisably there. */
        'fixed inset-0 isolate z-50 bg-black/35 duration-150 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 dark:bg-black/55',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Dialog shapes.
 *
 * `sheet` exists because four storefront dialogs had each written out the same
 * 200-character class string to be a bottom sheet on a phone and a centred
 * dialog on a desktop — the correct behaviour, expressed four times, with no
 * way to change it in one place. It is the default for anything a shopper
 * opens: a centred box on a 360px screen is a box with its buttons in the
 * middle of the viewport and its content squeezed, while a sheet rises from
 * the thumb.
 *
 * `centered` is the plain dialog, used by the admin console where the viewport
 * is a desktop one. `command` is the search overlay: anchored to the top,
 * because a result list grows downwards and should not push its own input
 * around as it does.
 *
 * Every variant caps its height against the *dynamic* viewport, so no dialog
 * can ever be taller than the screen it opened on — including mobile Safari
 * with its address bar showing.
 */
const dialogContentVariants = cva(
  'fixed z-50 bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
  {
    variants: {
      variant: {
        centered:
          'top-1/2 left-1/2 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-xl p-4 data-open:zoom-in-95 data-closed:zoom-out-95',
        sheet:
          'bottom-0 left-1/2 flex max-h-[90dvh] w-full max-w-full -translate-x-1/2 flex-col gap-0 overflow-hidden rounded-t-3xl data-open:slide-in-from-bottom-4 data-closed:slide-out-to-bottom-4 sm:top-1/2 sm:bottom-auto sm:max-h-[calc(100dvh-4rem)] sm:-translate-y-1/2 sm:rounded-2xl sm:data-open:zoom-in-95 sm:data-open:slide-in-from-bottom-0 sm:data-closed:zoom-out-95 sm:data-closed:slide-out-to-bottom-0',
        command:
          'top-0 left-1/2 flex max-h-[100dvh] w-full max-w-full -translate-x-1/2 flex-col gap-0 overflow-hidden rounded-none border-x-0 border-t-0 data-open:slide-in-from-top-2 sm:top-[8vh] sm:max-h-[84dvh] sm:rounded-2xl sm:border sm:data-open:zoom-in-98',
      },
      size: {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-md',
        lg: 'sm:max-w-lg',
        xl: 'sm:max-w-2xl',
      },
    },
    defaultVariants: { variant: 'centered', size: 'sm' },
  },
);

function DialogContent({
  className,
  children,
  variant = 'centered',
  size = 'sm',
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean;
  }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(dialogContentVariants({ variant, size }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading text-base leading-none font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogContentVariants,
};
