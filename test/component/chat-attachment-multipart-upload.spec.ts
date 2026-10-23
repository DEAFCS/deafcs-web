import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatUploadError,
  uploadChatAttachment,
} from "~/utilities/uploadChatAttachment";
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  validateChatAttachment,
} from "~/utilities/chatAttachmentValidation";

// A 107 MB video sent as one request was refused by Cloudflare (100 MB body
// cap) before it reached the api. Chat attachments now go up in parts.

const MB = 1024 * 1024;
const PART = 8 * MB;
const API = "https://api.example.invalid/chat";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PATH = "chat-attachments/76561190000000001/0123456789abcdef.mp4";

// Only size, type, name and slice are read, so a 200 MB file needs no 200 MB.
function fakeFile(size: number, type = "video/mp4") {
  return {
    name: "clip.mp4",
    size,
    type,
    slice: (start: number, end: number) => ({ size: end - start }),
  } as unknown as File;
}

type Put = {
  url: string;
  size: number;
  contentType?: string;
  credentials: boolean;
};

let puts: Put[];
let fetches: Array<{ method: string; url: string; body?: any }>;
let answerPut: (put: Put, index: number) => { status: number; body?: any };
let answerFetch: (method: string, url: string) => any;

beforeEach(() => {
  puts = [];
  fetches = [];
  answerPut = () => ({ status: 200, body: { success: true } });
  answerFetch = (method, url) => {
    if (method === "POST" && url === `${API}/attachments`) {
      const size = fetches[fetches.length - 1].body.size;
      return { id: ID, part_size: PART, parts: Math.ceil(size / PART) };
    }
    if (url.endsWith("/complete")) {
      return { success: true, path: PATH, contentType: "video/mp4" };
    }
    return { success: true };
  };

  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "api.example.invalid" },
  }));
  vi.stubGlobal(
    "$fetch",
    vi.fn(async (url: string, options: { method: string; body?: any }) => {
      fetches.push({ method: options.method, url, body: options.body });
      return answerFetch(options.method, url);
    }),
  );
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      upload: { onprogress?: (event: any) => void } = {};
      withCredentials = false;
      status = 0;
      responseText = "";
      private url = "";
      private headers: Record<string, string> = {};
      private aborted = false;
      onload?: () => void;
      onerror?: () => void;
      onabort?: () => void;
      open(_method: string, url: string) {
        this.url = url;
      }
      setRequestHeader(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
      }
      abort() {
        this.aborted = true;
        this.onabort?.();
      }
      send(body: { size: number }) {
        const put: Put = {
          url: this.url,
          size: body.size,
          contentType: this.headers["content-type"],
          credentials: this.withCredentials,
        };
        const answer = answerPut(put, puts.length);
        puts.push(put);
        setTimeout(() => {
          if (this.aborted) return;
          this.upload.onprogress?.({
            lengthComputable: true,
            loaded: body.size,
            total: body.size,
          });
          if (answer.status === 0) {
            this.onerror?.();
            return;
          }
          this.status = answer.status;
          this.responseText = JSON.stringify(answer.body ?? {});
          this.onload?.();
        }, 0);
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("chat attachment multipart upload", () => {
  it("sends the reported 107 MB video as 13 parts, none near Cloudflare's cap", async () => {
    const size = 107_418_289;
    const progress: number[] = [];

    const result = await uploadChatAttachment(fakeFile(size), (percent) =>
      progress.push(percent),
    );

    expect(result).toEqual({ path: PATH, contentType: "video/mp4" });
    expect(fetches[0]).toEqual({
      method: "POST",
      url: `${API}/attachments`,
      body: { name: "clip.mp4", size, mime_type: "video/mp4" },
    });
    expect(puts.map((put) => put.url)).toEqual(
      Array.from(
        { length: 13 },
        (_, index) => `${API}/attachments/${ID}/parts/${index + 1}`,
      ),
    );
    expect(puts.every((put) => put.size <= PART)).toBe(true);
    expect(puts.reduce((sum, put) => sum + put.size, 0)).toBe(size);
    expect(puts.every((put) => put.contentType === "application/octet-stream")).toBe(true);
    expect(puts.every((put) => put.credentials)).toBe(true);
    expect(fetches[fetches.length - 1]).toMatchObject({
      method: "POST",
      url: `${API}/attachments/${ID}/complete`,
    });
    expect(progress[progress.length - 1]).toBe(100);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it("uploads a 200 MB video in 25 parts", async () => {
    await uploadChatAttachment(fakeFile(200 * MB));

    expect(puts).toHaveLength(25);
    expect(puts.every((put) => put.size === PART)).toBe(true);
  });

  it("keeps the 200 MB limit in the composer", () => {
    expect(MAX_CHAT_ATTACHMENT_BYTES).toBe(200 * MB);
    expect(validateChatAttachment(fakeFile(200 * MB))).toBeNull();
    expect(validateChatAttachment(fakeFile(200 * MB + 1))).toBe("too_large");
  });

  it("discards the upload when a part fails, and never completes it", async () => {
    answerPut = (_put, index) =>
      index === 4
        ? { status: 502, body: { code: "unavailable" } }
        : { status: 200 };

    const failed = uploadChatAttachment(fakeFile(10 * PART));

    await expect(failed).rejects.toEqual(new ChatUploadError("unavailable"));
    expect(puts).toHaveLength(5);
    expect(fetches.some((call) => call.url.endsWith("/complete"))).toBe(false);
    expect(fetches[fetches.length - 1]).toMatchObject({
      method: "DELETE",
      url: `${API}/attachments/${ID}`,
    });
  });

  it("discards the upload when the connection drops", async () => {
    answerPut = (_put, index) => (index === 1 ? { status: 0 } : { status: 200 });

    await expect(uploadChatAttachment(fakeFile(3 * PART))).rejects.toEqual(
      new ChatUploadError("unavailable"),
    );
    expect(fetches[fetches.length - 1].method).toBe("DELETE");
  });

  it("sends a rate-limited part again instead of failing the file", async () => {
    answerPut = (_put, index) =>
      index === 1
        ? { status: 429, body: { code: "rate_limited" } }
        : { status: 200 };

    await expect(uploadChatAttachment(fakeFile(3 * PART))).resolves.toEqual({
      path: PATH,
      contentType: "video/mp4",
    });
    expect(puts.map((put) => put.url.split("/").pop())).toEqual([
      "1",
      "2",
      "2",
      "3",
    ]);
    expect(fetches.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("stops and discards when the composer cancels it", async () => {
    const abort = new AbortController();
    answerPut = (_put, index) => {
      if (index === 2) abort.abort();
      return { status: 200 };
    };

    await expect(
      uploadChatAttachment(fakeFile(10 * PART), undefined, abort.signal),
    ).rejects.toEqual(new ChatUploadError("aborted"));
    expect(puts.length).toBeLessThanOrEqual(3);
    expect(fetches.some((call) => call.url.endsWith("/complete"))).toBe(false);
    expect(fetches[fetches.length - 1].method).toBe("DELETE");
  });

  it("reports a refused file without sending any part", async () => {
    answerFetch = () => {
      throw Object.assign(new Error("Payload Too Large"), {
        status: 413,
        data: { code: "too_large" },
      });
    };

    await expect(uploadChatAttachment(fakeFile(10))).rejects.toEqual(
      new ChatUploadError("too_large"),
    );
    expect(puts).toHaveLength(0);
  });

  it("no longer shows the temporary upload diagnostics", () => {
    const input = fs.readFileSync("components/chat/ChatInput.vue", "utf8");
    const upload = fs.readFileSync("utilities/uploadChatAttachment.ts", "utf8");

    expect(input).not.toMatch(/bytes sent|Diagnostic \(temporary\)/);
    expect(upload).not.toMatch(/console\.log|Diagnostic/);
  });
});
