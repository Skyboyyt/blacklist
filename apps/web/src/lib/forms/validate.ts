/**
 * Client-side form validation with the shared contract schemas. This is UX only
 * (early, accessible feedback); the API validates every request again.
 */
import type { z } from 'zod';

export type FieldErrors = Readonly<Record<string, string>>;

export type ValidationResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly errors: FieldErrors };

/** First error message per top-level field. */
export function validateForm<S extends z.ZodType>(schema: S, input: unknown): ValidationResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** Reads named string fields from a form. Values are passed straight to validation and never stored. */
export function readFields<K extends string>(form: HTMLFormElement, names: readonly K[]): Record<K, string> {
  const data = new FormData(form);
  const out = {} as Record<K, string>;
  for (const name of names) {
    const value = data.get(name);
    out[name] = typeof value === 'string' ? value : '';
  }
  return out;
}

/** Moves focus to the first invalid field so keyboard and screen-reader users land on the problem. */
export function focusFirstError(form: HTMLFormElement, errors: FieldErrors, order: readonly string[]): void {
  const first = order.find((name) => errors[name]);
  if (!first) return;
  const el = form.elements.namedItem(first);
  if (el instanceof HTMLElement) el.focus();
}
