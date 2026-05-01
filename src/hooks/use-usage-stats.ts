"use client";

import { useCallback, useEffect, useState } from "react";

export interface UsageStats {
  dbSizeBytes: number;
  storageSizeBytes: number;
  storageObjectCount: number;
  publicTableCount: number;
  fetchedAt: number;
}

// Supabase Free 플랜 한도 — 공식 문서 기준.
// 변동 시 한 곳만 수정하면 UI 진행률 자동 반영.
export const SUPABASE_FREE_LIMITS = {
  dbBytes: 500 * 1024 * 1024,      // 500 MB
  storageBytes: 1024 * 1024 * 1024, // 1 GB
  egressBytesPerMonth: 5 * 1024 * 1024 * 1024, // 5 GB (조회 불가, 표시용)
  edgeFunctionInvocationsPerMonth: 500_000,    // 500K (조회 불가, 표시용)
} as const;

// Vercel Hobby 플랜 한도 — 표시용. 직접 추적은 Vercel API 토큰 필요.
export const VERCEL_HOBBY_LIMITS = {
  bandwidthBytesPerMonth: 100 * 1024 * 1024 * 1024, // 100 GB
  buildMinutesPerMonth: 6000,
} as const;

export function useUsageStats() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      const row = await res.json();
      setStats({
        dbSizeBytes: Number(row.db_size_bytes ?? 0),
        storageSizeBytes: Number(row.storage_size_bytes ?? 0),
        storageObjectCount: Number(row.storage_object_count ?? 0),
        publicTableCount: Number(row.public_table_count ?? 0),
        fetchedAt: Date.now(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
