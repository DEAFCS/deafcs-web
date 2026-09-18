<script setup lang="ts">
import TimeAgo from "~/components/TimeAgo.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import FiveStackToolTip from "~/components/FiveStackToolTip.vue";
import {
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  MessageSquareOff,
} from "lucide-vue-next";
import { e_player_roles_enum } from "~/generated/zeus";
</script>

<template>
  <div
    :class="[
      'group relative pl-12 text-[11px] leading-snug',
      isSameSender && isCloseTogether ? 'mt-1' : 'mt-3',
    ]"
  >
    <div v-if="showMeta" class="absolute left-2 top-0">
      <PlayerDisplay
        :player="message.from"
        :avatar-override="liveAvatarUrl"
        size="sm"
        :compact="true"
        :align-top="true"
        :show-online="false"
        :show-elo="false"
        :show-steam-id="false"
        :tooltip="false"
        :linkable="true"
        :show-name="false"
        :show-flag="false"
        :show-role="false"
      />
    </div>

    <div>
      <div
        v-if="showMeta"
        class="flex items-center space-x-1.5 text-muted-foreground text-[10px]"
      >
        <FiveStackToolTip v-if="roleBadge" as-child>
          <template #trigger>
            <component
              :is="roleBadge.icon"
              :class="['h-3 w-3 shrink-0', roleBadge.class]"
            />
          </template>
          <span class="capitalize">
            {{ message.from.role?.replace("_", " ") }}
          </span>
        </FiveStackToolTip>
        <h4 class="font-semibold truncate max-w-[140px]">
          {{ message.from.name }}
        </h4>
        <span class="text-[10px] whitespace-nowrap">
          <time-ago :date="message.timestamp" hide-icon></time-ago>
        </span>
      </div>
      <div v-if="isEditing" class="flex items-start gap-1.5">
        <textarea
          v-model="editDraft"
          rows="2"
          class="flex-1 resize-none rounded border border-border bg-background px-1.5 py-1 text-[11px] leading-snug"
          @keydown.escape="cancelEdit"
          @keydown.enter.exact.prevent="confirmEdit"
        />
        <button
          type="button"
          :title="$t('common.save', 'Save')"
          class="text-emerald-500 hover:text-emerald-400"
          @click="confirmEdit"
        >
          <Check class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          :title="$t('common.cancel')"
          class="text-muted-foreground hover:text-foreground"
          @click="cancelEdit"
        >
          <XIcon class="h-3.5 w-3.5" />
        </button>
      </div>
      <div v-else class="flex items-start gap-1.5">
        <p class="text-[11px] leading-snug break-words whitespace-pre-wrap">
          {{ message.message }}
        </p>
        <div
          v-if="canModerate"
          class="ml-auto hidden shrink-0 items-center gap-1 group-hover:flex"
        >
          <button
            v-if="canEdit"
            type="button"
            :title="$t('common.edit')"
            class="text-muted-foreground hover:text-foreground"
            @click="startEdit"
          >
            <Pencil class="h-3 w-3" />
          </button>
          <button
            type="button"
            :title="$t('chat.mute_player', 'Mute Player')"
            class="text-muted-foreground hover:text-amber-500"
            @click="requestMute"
          >
            <MessageSquareOff class="h-3 w-3" />
          </button>
          <button
            type="button"
            :title="$t('common.delete')"
            class="text-muted-foreground hover:text-destructive"
            @click="requestDelete"
          >
            <Trash2 class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Crown, Shield, ShieldHalf } from "lucide-vue-next";
import gql from "graphql-tag";

// Elevated roles only -- regular (verified_)user and streamer get no
// badge at all next to their name, just the avatar.
const ROLE_BADGE: Record<string, { icon: any; class: string }> = {
  moderator: { icon: ShieldHalf, class: "text-blue-500" },
  match_organizer: { icon: Shield, class: "text-yellow-500" },
  tournament_organizer: { icon: Shield, class: "text-orange-500" },
  administrator: { icon: Crown, class: "text-red-500" },
};

const LIVE_PLAYER_AVATAR_QUERY = gql`
  query LivePlayerAvatarForChat($steamId: bigint!) {
    players_by_pk(steam_id: $steamId) {
      steam_id
      avatar_url
      custom_avatar_url
    }
  }
`;

export default {
  props: {
    message: {
      type: Object,
      required: false,
    },
    previousMessage: {
      type: Object,
      required: false,
    },
    chatType: {
      type: String,
      required: true,
    },
  },
  emits: ["edit-message", "delete-message", "mute-player"],
  data() {
    return {
      // Chat messages embed a snapshot of the sender's avatar_url from
      // send time (chat.service.ts) -- never updated if they change
      // their avatar afterwards. This overrides it with a live lookup
      // once resolved; null (the default) falls straight through to
      // PlayerDisplay's normal player.avatar_url, so there's no flash
      // of a missing avatar while this is in flight.
      liveAvatarUrl: null as string | null,
      isEditing: false,
      editDraft: "",
    };
  },
  created() {
    this.fetchLiveAvatar();
  },
  computed: {
    isSameSender() {
      if (!this.previousMessage) {
        return false;
      }
      return this.message.from.steam_id === this.previousMessage.from.steam_id;
    },
    isCloseTogether() {
      if (!this.isSameSender || !this.previousMessage) {
        return false;
      }
      const previousTimestamp = new Date(this.previousMessage.timestamp);
      const messageTimestamp = new Date(this.message.timestamp);

      messageTimestamp.setMinutes(messageTimestamp.getMinutes() - 5);

      return previousTimestamp > messageTimestamp;
    },
    showMeta() {
      return !this.isSameSender || !this.isCloseTogether;
    },
    roleBadge() {
      return ROLE_BADGE[this.message?.from?.role] ?? null;
    },
    canModerate() {
      return (
        Boolean(this.message?.id) &&
        useAuthStore().isRoleAbove(e_player_roles_enum.administrator)
      );
    },
    canEdit() {
      return this.canModerate && this.chatType === "announcement";
    },
  },
  methods: {
    startEdit() {
      this.editDraft = this.message.message;
      this.isEditing = true;
    },
    cancelEdit() {
      this.isEditing = false;
    },
    confirmEdit() {
      const message = this.editDraft.trim();
      if (!message || message === this.message.message) {
        this.isEditing = false;
        return;
      }
      this.$emit("edit-message", { id: this.message.id, message });
      this.isEditing = false;
    },
    requestDelete() {
      if (!window.confirm(this.$t("chat.confirm_delete_message", "Delete this chat message?"))) {
        return;
      }
      this.$emit("delete-message", { id: this.message.id });
    },
    requestMute() {
      this.$emit("mute-player", {
        player: this.message.from,
        messageId: this.message.id,
      });
    },
    async fetchLiveAvatar() {
      const steamId = this.message?.from?.steam_id;
      if (!steamId) return;
      try {
        const { data } = await (this as any).$apollo.query({
          query: LIVE_PLAYER_AVATAR_QUERY,
          variables: { steamId },
          fetchPolicy: "cache-first",
        });
        const player = data?.players_by_pk;
        if (player) {
          this.liveAvatarUrl =
            player.custom_avatar_url || player.avatar_url || null;
        }
      } catch {
        // Best-effort -- keep the snapshot avatar on any failure
        // (network, permissions, player deleted, etc).
      }
    },
  },
};
</script>
