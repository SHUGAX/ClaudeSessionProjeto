"use client";

/** Thin client for the document API routes (same-origin, cookie-authenticated). */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly reason?: string,
    public readonly status?: number,
  ) {
    super(code);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string } & T;
  if (!res.ok) throw new ApiError(body.error ?? "internal", body.reason, res.status);
  return body;
}

export function createUploadIntent(input: {
  tenant: string;
  filename: string;
  size: number;
  documentType: string;
}) {
  return request<{ documentId: string; signedUrl: string; token: string }>(
    "/api/documents/upload-intent",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function finalizeUpload(documentId: string) {
  return request<{ documentId: string; status: string; duplicateOf: string | null }>(
    `/api/documents/${documentId}/finalize`,
    { method: "POST" },
  );
}

export function processDocument(documentId: string) {
  return request<{ status: "success" | "failed" | "skipped"; errorCode?: string }>(
    `/api/documents/${documentId}/process`,
    { method: "POST" },
  );
}

export function getFileUrl(documentId: string, download = false) {
  return request<{ url: string; mimeType: string | null; expiresIn: number }>(
    `/api/documents/${documentId}/file${download ? "?download=1" : ""}`,
  );
}

/**
 * Uploads directly to private storage using the short-lived signed upload URL
 * (XHR is used for progress reporting).
 */
export function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) xhr.setRequestHeader("apikey", anonKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError("upload_failed"));
    xhr.onerror = () => reject(new ApiError("upload_failed"));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new File([file], file.name, { type: contentType }));
    xhr.send(form);
  });
}
