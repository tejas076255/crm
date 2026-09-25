'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const BroadcastDetailContent = dynamic(
  () => import('@/components/broadcasts/broadcast-detail-content'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    ),
  },
);

export default function BroadcastDetailPage() {
  return <BroadcastDetailContent />;
}
