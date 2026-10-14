import { describe, it, expect } from 'vitest';
import { optionalFeature } from './availability';
import { ApiNotConnectedError } from './types';
describe('expected feature unavailability stays distinct from real failures', () => {
  it('preserves actual data and only handles the typed not-connected condition', async () => {
    expect(await optionalFeature(async () => ({ actual: 'result' }))).toEqual({ actual: 'result' });
    expect(
      await optionalFeature(async () => {
        throw new ApiNotConnectedError();
      }),
    ).toBeNull();
    await expect(
      optionalFeature(async () => {
        throw new Error('unexpected_test_failure');
      }),
    ).rejects.toThrow('unexpected_test_failure');
  });
});
