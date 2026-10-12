import type { Ref, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from './input-styles';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly ref?: Ref<HTMLSelectElement>;
}

/**
 * Native select: the most accessible option on every platform (including mobile
 * pickers and screen readers). A custom listbox is only justified for rich options.
 */
export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(controlClasses, 'h-11 appearance-auto pr-8', className)} {...rest}>
      {children}
    </select>
  );
}
