import { ApiNotConnectedError } from './types';
/** Only a known absent adapter becomes unavailable; genuine errors retain the safe route boundary. */
export async function optionalFeature<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiNotConnectedError) return null;
    throw error;
  }
}
