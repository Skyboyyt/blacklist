'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icon';

/**
 * Accessible dialog (focus trap, Escape to close, focus return, aria-modal) from
 * Radix. `side="left"` renders a navigation sheet for small screens.
 * Focus returns to the element that opened the dialog even when it is opened
 * programmatically (no DialogTrigger), so keyboard users never land on <body>.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps {
  readonly title: string;
  readonly description?: string;
  readonly side?: 'center' | 'left';
  readonly children: ReactNode;
  readonly className?: string;
}

export function DialogContent({
  title,
  description,
  side = 'center',
  children,
  className,
}: DialogContentProps) {
  // Captured each time the dialog opens, just before Radix moves focus inside.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <DialogPrimitive.Content
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
        }}
        onCloseAutoFocus={(event) => {
          const target = opener.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
        className={cn(
          'fixed z-50 flex flex-col bg-surface text-text shadow-md focus:outline-none',
          side === 'left'
            ? 'inset-y-0 left-0 w-[min(20rem,85vw)] border-r border-border'
            : 'top-1/2 left-1/2 max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Close"
          >
            <Icon name="close" className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {description ? (
          <DialogPrimitive.Description className="px-4 pt-3 text-sm text-muted">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
