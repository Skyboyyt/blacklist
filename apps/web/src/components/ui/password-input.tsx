'use client';

import { PASSWORD_MIN_CODE_POINTS, codePointLength, normalizePassword } from '@blacklist/contracts';
import { useState, type InputHTMLAttributes, type KeyboardEvent, type Ref } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icon';
import { controlClasses } from './input-styles';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly autoComplete: 'current-password' | 'new-password';
  readonly ref?: Ref<HTMLInputElement>;
  /** For new passwords: show the length requirement with a live character count. */
  readonly showRequirement?: boolean;
  /** Minimum length shown with the requirement (members 12, staff 8; ADR 0016). */
  readonly minimum?: number;
}

/**
 * Password field with an accessible show/hide toggle. Paste, autofill and password
 * managers work normally. The value lives only in the input element: component
 * state keeps at most a character count, and nothing is logged or stored.
 */
export function PasswordInput({
  className,
  showRequirement = false,
  minimum = PASSWORD_MIN_CODE_POINTS,
  onKeyDown,
  onKeyUp,
  onChange,
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [length, setLength] = useState(0);

  // getModifierState is reliable for physical keyboards; on-screen keyboards simply never show the hint.
  const trackCaps = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState('CapsLock'));
  const capsId = rest.id ? `${rest.id}-caps` : undefined;
  const met = length >= minimum;

  return (
    <div>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(controlClasses, 'h-11 pr-12', className)}
          onKeyDown={(e) => {
            trackCaps(e);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            trackCaps(e);
            onKeyUp?.(e);
          }}
          onChange={(e) => {
            if (showRequirement) setLength(codePointLength(normalizePassword(e.target.value)));
            onChange?.(e);
          }}
          onBlur={() => setCapsLock(false)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-controls={rest.id}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} className="size-5" />
        </button>
      </div>
      {capsLock ? (
        <p id={capsId} className="mt-1 flex items-center gap-1 text-xs text-warning">
          <Icon name="info" className="size-3.5" />
          Caps Lock is on
        </p>
      ) : null}
      {showRequirement ? (
        // Updated silently (no live region) so screen readers are not interrupted on every keystroke.
        <p
          className={cn('mt-1 flex items-center gap-1 text-xs', met ? 'text-positive' : 'text-muted')}
          data-requirement={met ? 'met' : 'unmet'}
        >
          <Icon name={met ? 'check' : 'info'} className="size-3.5" />
          At least {minimum} characters ({length}/{minimum})
        </p>
      ) : null}
    </div>
  );
}
