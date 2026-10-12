import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from './input-styles';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly ref?: Ref<HTMLInputElement>;
}

export function Input({ className, ...rest }: InputProps) {
  return <input className={cn(controlClasses, 'h-11', className)} {...rest} />;
}
