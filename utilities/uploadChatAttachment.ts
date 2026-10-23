// Ported from 5stackgg/web 8ead042 composables/chatAttachmentUploads.ts: the
// file goes up in parts (create, PUT each part, complete), each part a
// request well under Cloudflare's 100 MB body cap. Sent as one request, a
// 107 MB video was refused by Cloudflare before it reached the api.
//
// DEAFCS differences: no room, poster or media metadata on create, and the
// answer is still the S3 key + content type the "lobby:chat" socket send
// takes as `attachment`, so sending works exactly as before. An upload that
// fails or is cancelled after it was created is discarded here, since DEAFCS
// has no upload tray to do it.

export class ChatUploadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ChatUploadError";
  }
}

const apiBase = () => `https://${useRuntimeConfig().public.apiDomain}/chat`;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chatAttachmentUploadUrl(id: string): string {
  return UUID.test(id) ? `${apiBase()}/attachments/${id}` : "";
}

// Must match the api's ChatAttachmentsService.MAX_UPLOADS_PER_PLAYER: it
// answers 429 to a third part from the same player, so uploads share two at
// a time. A 429 can still come from the api pod's own limit, so that part is
// sent again after a pause rather than the file started over.
const PARTS_IN_FLIGHT = 2;
const RATE_LIMIT_RETRIES = 6;
const RATE_LIMIT_BACKOFF_MS = 400;

let partsInFlight = 0;
const waitingForPart: Array<() => void> = [];

async function withPartSlot<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  while (partsInFlight >= PARTS_IN_FLIGHT) {
    await new Promise<void>((resolve) => waitingForPart.push(resolve));
    stopIfAborted(signal);
  }

  partsInFlight++;

  try {
    return await work();
  } finally {
    partsInFlight--;
    waitingForPart.shift()?.();
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ChatUploadError("aborted"));
      },
      { once: true },
    );
  });
}

async function putPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withPartSlot(signal, () =>
        put(url, body, signal, onProgress),
      );
    } catch (error) {
      if (
        !(error instanceof ChatUploadError) ||
        error.code !== "rate_limited" ||
        attempt >= RATE_LIMIT_RETRIES
      ) {
        throw error;
      }

      onProgress(0);
      await pause(RATE_LIMIT_BACKOFF_MS * 2 ** attempt, signal);
    }
  }
}

function stopIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new ChatUploadError("aborted");
  }
}

async function request<T>(
  method: "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  try {
    return await $fetch<T>(`${apiBase()}${path}`, {
      method,
      body,
      credentials: "include",
    });
  } catch (error) {
    const failure = error as { data?: { code?: string }; status?: number };

    throw new ChatUploadError(
      failure?.data?.code ??
        (failure?.status === 413 ? "too_large" : "unavailable"),
    );
  }
}

function errorCode(xhr: XMLHttpRequest): string {
  const fallback = xhr.status === 413 ? "too_large" : "unavailable";

  try {
    const code = JSON.parse(xhr.responseText)?.code;

    return typeof code === "string" ? code : fallback;
  } catch {
    return fallback;
  }
}

// Raw bytes, never a multipart form: a part is one request to the api, kept
// well under Cloudflare's 100 MB body cap. XHR because fetch cannot report
// upload progress; a Blob body always goes with its Content-Length, never
// chunked, and the api refuses a part without one.
function put(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ChatUploadError("aborted"));
      return;
    }

    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();

    xhr.open("PUT", url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };

    xhr.onload = () => {
      signal.removeEventListener("abort", abort);

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }

      reject(new ChatUploadError(errorCode(xhr)));
    };

    xhr.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new ChatUploadError("unavailable"));
    };

    xhr.onabort = () => {
      reject(new ChatUploadError("aborted"));
    };

    signal.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}

export function discardChatAttachment(id: string): void {
  if (!UUID.test(id)) {
    return;
  }

  void request("DELETE", `/attachments/${id}`).catch(() => {
    return;
  });
}

// Uploaded ahead of the actual "lobby:chat" socket send: the chat message
// doesn't exist yet at upload time, so this just stashes the file in S3 and
// returns the key + content type to include as `attachment` on the send.
export async function uploadChatAttachment(
  file: File,
  onProgress?: (percent: number) => void,
  signal: AbortSignal = new AbortController().signal,
): Promise<{ path: string; contentType: string }> {
  const report = (fraction: number) =>
    onProgress?.(Math.min(100, Math.round(fraction * 100)));

  stopIfAborted(signal);

  const created = await request<{
    id: string;
    part_size: number;
    parts: number;
  }>("POST", "/attachments", {
    name: file.name,
    size: file.size,
    mime_type: file.type,
  });

  try {
    stopIfAborted(signal);

    const url = chatAttachmentUploadUrl(created.id);

    if (!url) {
      throw new ChatUploadError("unavailable");
    }

    for (let part = 1; part <= created.parts; part++) {
      const start = (part - 1) * created.part_size;
      const chunk = file.slice(
        start,
        Math.min(start + created.part_size, file.size),
      );

      await putPart(`${url}/parts/${part}`, chunk, signal, (loaded) => {
        report(((start + loaded) / file.size) * 0.98);
      });
    }

    stopIfAborted(signal);

    const uploaded = await request<{ path: string; contentType: string }>(
      "POST",
      `/attachments/${created.id}/complete`,
    );

    report(1);

    return { path: uploaded.path, contentType: uploaded.contentType };
  } catch (error) {
    discardChatAttachment(created.id);
    throw error;
  }
}
