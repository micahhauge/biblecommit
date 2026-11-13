'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ClerkSession } from '@/clerk-session';
import { TimezoneSync } from '@/me';
import { ModeSync } from '@/mode';
import { createQueryClient } from '@/query-client';
import { ServiceWorker } from '@/service-worker';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ClerkSession />
      <TimezoneSync />
      <ModeSync />
      <ServiceWorker />
      {children}
    </QueryClientProvider>
  );
}
