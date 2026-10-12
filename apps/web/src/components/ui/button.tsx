import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';
import { Spinner } from './spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and blocks repeat activation (no double submit). */
  readonly loading?: boolean;
  readonly loadingLabel?: string;
}

export function Button({
  variant,
  size,
  loading = false,
  loadingLabel,
  className,
  children,
  disabled,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
