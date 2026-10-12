import type { Ref, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from './input-styles';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  return <textarea rows={rows} className={cn(controlClasses, 'min-h-24 py-2', className)} {...rest} />;
}
