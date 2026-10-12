'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/**
 * Tooltip for supplementary hints only. Never put essential information in a
 * tooltip: touch devices and many assistive technologies cannot reach it.
 */
export function Tooltip({
  content,
  children,
}: {
  readonly content: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-md bg-text px-2.5 py-1.5 text-xs text-bg shadow-md"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-text" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
