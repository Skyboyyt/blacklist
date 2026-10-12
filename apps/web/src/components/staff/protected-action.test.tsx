import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProtectedAction, type ProtectedActionRequest } from './protected-action';

const request = (title: string): ProtectedActionRequest => ({
  title,
  description: 'd',
  run: async () => undefined,
});

describe('useProtectedAction', () => {
  it('closing a finished action never clears an action started meanwhile', () => {
    const { result } = renderHook(() => useProtectedAction());
    const first = request('first');
    const second = request('second');
    act(() => result.current.start(first));
    act(() => result.current.start(second));
    act(() => result.current.close(first));
    expect(result.current.request).toBe(second);
    act(() => result.current.close(second));
    expect(result.current.request).toBeNull();
  });
});
