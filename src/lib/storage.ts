"use client";

// Supabase Storage 업로드 유틸.
// base64를 DB에 직접 저장하던 방식을 대체해 DB 용량 폭증 방지.
// 버킷은 사전에 Supabase 대시보드에서 public으로 생성돼 있어야 한다.

import { supabase } from "@/lib/supabase";

export type UploadBucket = "avatars" | "knowledge-images";

/**
 * data URL(base64) 또는 File을 Supabase Storage에 업로드 후 public URL 반환.
 * 파일 경로는 `${auth_user_id}/${timestamp}.${ext}`.
 */
export async function uploadToStorage(
  bucket: UploadBucket,
  fileOrDataUrl: File | string,
  ext = "jpg"
): Promise<{ url: string | null; error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return { url: null, error: "로그인이 필요합니다" };

  let blob: Blob;
  let finalExt = ext;
  if (typeof fileOrDataUrl === "string") {
    // data URL → Blob
    const res = await fetch(fileOrDataUrl);
    blob = await res.blob();
    const mime = blob.type || "image/jpeg";
    finalExt = mime.split("/")[1]?.split(";")[0] || ext;
  } else {
    blob = fileOrDataUrl;
    const mime = fileOrDataUrl.type || "image/jpeg";
    finalExt = mime.split("/")[1]?.split(";")[0] || ext;
  }

  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${finalExt}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    cacheControl: "31536000",
    upsert: false,
    contentType: blob.type || `image/${finalExt}`,
  });
  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

/**
 * 이전에 업로드한 이미지 삭제. URL에서 path를 역산해 제거.
 * 다른 유저의 이미지를 못 지우도록 RLS가 보호.
 */
export async function deleteFromStorage(bucket: UploadBucket, publicUrl: string): Promise<void> {
  try {
    // URL에서 object path 추출: https://.../storage/v1/object/public/{bucket}/{path}
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    const { error } = await supabase.storage.from(bucket).remove([path]);
    // 실패해도 호출자 흐름은 안 막지만, 고아 파일 누적 추적용으로 흔적은 남김.
    if (error) console.warn(`[deleteFromStorage] ${bucket}/${path}:`, error.message);
  } catch (e) {
    console.warn(`[deleteFromStorage] ${bucket}:`, e);
  }
}
