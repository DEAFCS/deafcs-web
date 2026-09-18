import { computed, ref } from "vue";
import { defineStore, acceptHMRUpdate } from "pinia";
import gql from "graphql-tag";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import socket from "~/web-sockets/Socket";

export type WebsiteRestrictionStatus = {
  active: boolean;
  reason: string | null;
  expiresAt: string | null;
  permanent: boolean;
};

const EMPTY_STATUS: WebsiteRestrictionStatus = {
  active: false,
  reason: null,
  expiresAt: null,
  permanent: false,
};

export const useWebsiteRestrictionStore = defineStore(
  "website-restriction",
  () => {
    const status = ref<WebsiteRestrictionStatus>({ ...EMPTY_STATUS });
    const known = ref(false);
    const loading = ref(false);
    let started = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const isRestricted = computed(() => status.value.active);

    function setStatus(next?: Partial<WebsiteRestrictionStatus> | null) {
      status.value = { ...EMPTY_STATUS, ...(next ?? {}) };
      known.value = true;

      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = undefined;
      }
      if (status.value.active && status.value.expiresAt) {
        const delay = new Date(status.value.expiresAt).getTime() - Date.now();
        if (delay <= 0) {
          status.value = { ...EMPTY_STATUS };
        } else {
          expiryTimer = setTimeout(() => void refresh(), Math.min(delay + 500, 2_147_000_000));
        }
      }
    }

    async function refresh() {
      if (loading.value) return;
      loading.value = true;
      try {
        const response = await getGraphqlClient().query({
          query: gql`
            query WebsiteRestrictionStatus {
              websiteRestrictionStatus {
                active
                reason
                expiresAt
                permanent
              }
            }
          `,
          fetchPolicy: "network-only",
        });
        setStatus(response.data.websiteRestrictionStatus);
      } catch {
        // A transient network/auth failure must not turn a known restriction
        // off. Server-side enforcement remains authoritative meanwhile.
      } finally {
        loading.value = false;
      }
    }

    function start() {
      if (started) return;
      started = true;
      socket.listen("account:restriction-status", (next) => {
        setStatus(next as WebsiteRestrictionStatus);
      });
      void refresh();
    }

    return { status, known, loading, isRestricted, refresh, start };
  },
);

if (import.meta.hot) {
  import.meta.hot.accept(
    acceptHMRUpdate(useWebsiteRestrictionStore, import.meta.hot),
  );
}
