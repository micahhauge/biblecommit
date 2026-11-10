'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function CanonTotals() {
  const { data, error } = useQuery({
    queryKey: ['canon', 'totals'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/canon/totals');
      if (error || !data) throw new Error('could not load the canon');
      return data;
    },
  });

  if (error) return <p className="empty">{error.message}</p>;
  if (!data) return <p className="empty">&nbsp;</p>;
  return (
    <p className="empty">
      {data.books} books · {data.chapters.toLocaleString()} chapters · {data.verses.toLocaleString()} verses, waiting.
    </p>
  );
}
