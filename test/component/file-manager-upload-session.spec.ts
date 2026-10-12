import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/graphql/graphqlGen", () => ({
  generateQuery: (query: unknown) => query,
  generateMutation: (query: unknown) => query,
  generateSubscription: (query: unknown) => query,
}));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({ query: async () => ({ data: { listServerFiles: { items: [] } } }) }),
}));

import { useFileManagerStore } from "../../stores/FileManagerStore";

describe("administrator upload sessions", () => {
  const uploads: Array<{ credentials: boolean; url: string; body: FormData }> = [];

  beforeEach(() => {
    setActivePinia(createPinia());
    uploads.length = 0;
    vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: "test-administrator" } }));
    vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.example.invalid" } }));
    vi.stubGlobal("XMLHttpRequest", class {
      upload = {};
      withCredentials = false;
      status = 201;
      response = "{}";
      url = "";
      onload?: () => void;
      open(_method: string, url: string) { this.url = url; }
      send(body: FormData) {
        uploads.push({ credentials: this.withCredentials, url: this.url, body });
        this.onload?.();
      }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["single", "batch"])("sends the authenticated session for %s uploads to both endpoint types", async (mode) => {
    const store = useFileManagerStore();
    store.nodeId = "test-node";
    const file = new File(["test"], "test.cfg");
    for (const serverId of [null, "test-server"]) {
      store.serverId = serverId;
      if (mode === "single") await store.uploadFiles([file]);
      else await store.uploadFilesWithPaths([{ file, relativePath: file.name }], "");
    }
    expect(uploads.map((upload) => upload.credentials)).toEqual([true, true]);
    expect(uploads.map((upload) => upload.url)).toEqual([
      "https://api.example.invalid/file-manager/upload/test-node",
      "https://api.example.invalid/file-manager/upload/test-node/test-server",
    ]);
    expect(uploads.every((upload) => upload.body.get("filePath") === "test.cfg")).toBe(true);
  });
});
