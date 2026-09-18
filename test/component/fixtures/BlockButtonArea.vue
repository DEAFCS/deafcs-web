<!--
  Minimal reproduction of the Block Player button area in
  pages/players/[id].vue's hero section: an 80/20 row (Friend button left,
  Block icon right), a confirmation step before blocking, and a Blocked
  badge + Unblock action once blocked. Uses a plain boolean for the
  confirmation step instead of the real AlertDialog component -- this
  tests the interaction contract (block requires confirmation, unblock
  does not) rather than the third-party dialog library's own internals.
-->
<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  isSelfProfile: boolean;
  friendRelationship: "none" | "friend" | "outgoing" | "incoming";
  isBlockedByMe: boolean;
}>();

const emit = defineEmits<{
  addFriend: [];
  block: [];
  unblock: [];
}>();

const showConfirm = ref(false);

const canAddFriend = computed(
  () =>
    !props.isSelfProfile &&
    props.friendRelationship === "none" &&
    !props.isBlockedByMe,
);
const canShowBlockAction = computed(() => !props.isSelfProfile);

function requestBlock() {
  showConfirm.value = true;
}
function confirmBlock() {
  emit("block");
  showConfirm.value = false;
}
function unblock() {
  emit("unblock");
}
</script>

<template>
  <div v-if="!isSelfProfile" class="row" data-testid="actions-row">
    <div class="left" data-testid="left-column">
      <button v-if="isBlockedByMe" type="button" disabled data-testid="blocked-badge">
        Blocked
      </button>
      <button v-else-if="canAddFriend" type="button" data-testid="add-friend" @click="emit('addFriend')">
        Add Friend
      </button>
      <button v-else-if="friendRelationship === 'incoming'" type="button" data-testid="friend-incoming" disabled>
        Incoming
      </button>
      <button v-else-if="friendRelationship === 'outgoing'" type="button" data-testid="friend-pending" disabled>
        Pending
      </button>
      <button v-else-if="friendRelationship === 'friend'" type="button" data-testid="friend-badge">
        Friend
      </button>
    </div>
    <div v-if="canShowBlockAction" class="right" data-testid="right-column">
      <button
        type="button"
        data-testid="block-toggle"
        :aria-label="isBlockedByMe ? 'Unblock player' : 'Block player'"
        @click="isBlockedByMe ? unblock() : requestBlock()"
      >
        {{ isBlockedByMe ? "Unblock" : "Block" }}
      </button>
    </div>
  </div>

  <div v-if="showConfirm" data-testid="confirm-dialog">
    <p>Block this player?</p>
    <button type="button" data-testid="confirm-cancel" @click="showConfirm = false">
      Cancel
    </button>
    <button type="button" data-testid="confirm-block" @click="confirmBlock">
      Block Player
    </button>
  </div>
</template>
