'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { TimezoneSync } from '@/me';
import { createQueryClient } from '@/query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <TimezoneSync />
      {children}
    </QueryClientProvider>
  );
}
