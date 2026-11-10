import { QueryClient } from '@tanstack/react-query';

/** The app's query cache settings, shared with tests so they behave like production. */
export function createQueryClient({ retry = true }: { retry?: boolean } = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, ...(retry ? {} : { retry: false }) },
      mutations: { retry: false },
    },
  });
}
