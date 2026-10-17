/** The demo build runs on a mock store; every other build talks to the API. */
export const isMockApi = (): boolean => process.env.NEXT_PUBLIC_API_MODE === 'mock';
