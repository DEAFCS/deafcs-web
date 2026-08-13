<!-- Small <img> wrapper for spots that only have a bare avatar_url string
     to work with (not a full player object PlayerDisplay can take), e.g.
     chat's participants list -- resolves the *current* avatar live instead
     of trusting a possibly-stale snapshot.

     Deliberately plain Options API + this.$apollo.query (matches the
     working pattern already used throughout the codebase, e.g.
     MatchTabs.vue) rather than a Composition API composable + useQuery:
     an earlier version mixed <script setup> with a hand-written setup()
     in the paired Options block, which silently conflicts (script setup
     already generates its own setup()) and broke chat message rendering
     entirely in production. No <script setup> block here at all, to rule
     that class of bug out completely. -->
<script lang="ts">
import gql from "graphql-tag";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";

const LIVE_PLAYER_AVATAR_QUERY = gql`
  query LivePlayerAvatarForImg($steamId: bigint!) {
    players_by_pk(steam_id: $steamId) {
      steam_id
      avatar_url
      custom_avatar_url
    }
  }
`;

export default {
  props: {
    steamId: {
      type: String,
      required: false,
      default: null,
    },
    fallbackUrl: {
      type: String,
      required: false,
      default: null,
    },
    alt: {
      type: String,
      required: false,
      default: "",
    },
    imgClass: {
      type: String,
      required: false,
      default: "",
    },
  },
  data() {
    return {
      liveUrl: null as string | null,
      loadFailed: false,
    };
  },
  computed: {
    src(): string | null {
      if (this.loadFailed) return null;
      // Custom-uploaded avatars are stored as a relative path, not a full
      // URL (PlayerDisplay.vue does the same resolution) -- without this,
      // a custom avatar renders as a broken image while a Steam CDN URL
      // (already absolute) happens to work, which is exactly the
      // inconsistent breakage this was missing.
      const apiDomain = useRuntimeConfig().public.apiDomain;
      return resolveAvatarUrl(this.liveUrl || this.fallbackUrl, apiDomain);
    },
  },
  watch: {
    steamId() {
      this.loadFailed = false;
      this.liveUrl = null;
      this.fetchLiveAvatar();
    },
  },
  created() {
    this.fetchLiveAvatar();
  },
  methods: {
    async fetchLiveAvatar() {
      if (!this.steamId) return;
      try {
        const { data } = await (this as any).$apollo.query({
          query: LIVE_PLAYER_AVATAR_QUERY,
          variables: { steamId: this.steamId },
          fetchPolicy: "cache-first",
        });
        const player = data?.players_by_pk;
        if (player) {
          this.liveUrl = player.custom_avatar_url || player.avatar_url || null;
        }
      } catch {
        // Best-effort -- keep the fallback avatar on any failure.
      }
    },
  },
};
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="alt"
    :class="imgClass"
    draggable="false"
    @error="loadFailed = true"
  />
  <!-- No avatar resolved yet, or it failed to load -- a generic
       silhouette instead of leaving an empty box or a broken-image
       glyph. -->
  <svg
    v-else
    viewBox="0 0 24 24"
    fill="currentColor"
    :class="imgClass"
    class="text-zinc-500 p-[15%]"
  >
    <path
      d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"
    />
  </svg>
</template>
