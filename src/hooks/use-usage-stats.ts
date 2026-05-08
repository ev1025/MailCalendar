"use client";

import { useQuery } from "@tanstack/react-query";

export interface UsageStats {
  dbSizeBytes: number;
  storageSizeBytes: number;
  storageObjectCount: number;
  publicTableCount: number;
  fetchedAt: number;
}

export const SUPABASE_FREE_LIMITS = {
  dbBytes: 500 * 1024 * 1024,
  storageBytes: 1024 * 1024 * 1024,
  egressBytesPerMonth: 5 * 1024 * 1024 * 1024,
  edgeFunctionInvocationsPerMonth: 500_000,
} as const;

export const VERCEL_HOBBY_LIMITS = {
  bandwidthBytesPerMonth: 100 * 1024 * 1024 * 1024,
  buildMinutesPerMonth: 6000,
} as const;

const STALE_TIME = 60 * 1000;
const GC_TIME = 10 * 60 * 1000;

async function fetchUsage(): Promise<UsageStats> {
  const res = await fetch("/api/usage");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const row = await res.json();
  return {
    dbSizeBytes: Number(row.db_size_bytes ?? 0),
    storageSizeBytes: Number(row.storage_size_bytes ?? 0),
    storageObjectCount: Number(row.storage_object_count ?? 0),
    publicTableCount: Number(row.public_table_count ?? 0),
    fetchedAt: Date.now(),
  };
}

export function useUsageStats() {
  const usageQuery = useQuery<UsageStats>({
    queryKey: ["usage-stats"],
    queryFn: fetchUsage,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 0,
  });

  return {
    stats: usageQuery.data ?? null,
    loading: usageQuery.isLoading,
    error: usageQuery.error
      ? usageQuery.error instanceof Error
        ? usageQuery.error.message
        : String(usageQuery.error)
      : null,
    refetch: () => usageQuery.refetch(),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
