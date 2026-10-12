'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Accessible tabs (arrow-key navigation, roving focus) from Radix. */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...rest }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px h-11 shrink-0 border-b-2 border-transparent px-3 text-sm font-medium text-muted hover:text-text',
        'data-[state=active]:border-accent data-[state=active]:text-text',
        className,
      )}
      {...rest}
    />
  );
}

export function TabsContent({ className, ...rest }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4 focus-visible:outline-none', className)} {...rest} />;
}
