<script lang="ts" setup>
import { ref, computed, provide, onMounted, onBeforeUnmount } from "vue";
import EventEmitter from "eventemitter3";
import { useMatchBackupRounds } from "~/composables/useMatchBackupRounds";
import MatchAdminDock from "~/components/match/MatchAdminDock.vue";
import MatchAdminDockActions from "~/components/match/MatchAdminDockActions.vue";
import MatchServerRebootControl from "~/components/match/MatchServerRebootControl.vue";
import RconCommander from "~/components/servers/RconCommander.vue";
import ServiceLogs from "~/components/ServiceLogs.vue";
import { Button } from "~/components/ui/button";
import DropdownMenuItem from "~/components/ui/dropdown-menu/DropdownMenuItem.vue";
import DropdownMenuSeparator from "~/components/ui/dropdown-menu/DropdownMenuSeparator.vue";
import DropdownMenuSub from "~/components/ui/dropdown-menu/DropdownMenuSub.vue";
import DropdownMenuSubTrigger from "~/components/ui/dropdown-menu/DropdownMenuSubTrigger.vue";
import DropdownMenuSubContent from "~/components/ui/dropdown-menu/DropdownMenuSubContent.vue";
import { e_match_status_enum, e_player_roles_enum } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";
import {
  type MatchCommand,
  resolveRconCommand,
  matchCommandsForStatus,
  effectivePluginRuntime,
} from "~/constants/rconCommands";

const props = defineProps<{
  match: Record<string, any>;
}>();

const commander = new EventEmitter();
provide("commander", commander);

const applicationSettings = useApplicationSettingsStore();

const mounted = ref(false);
const hasLogs = ref(false);
const showConfirmDialog = ref(false);
const showRebootDialog = ref(false);
const pendingCommand = ref<MatchCommand | null>(null);
const executePending = ref<(() => void) | null>(null);

let dockRaf = 0;

onMounted(() => {
  // Mount the teleport only once its target is actually in the DOM.
  // On a fresh load the layout's #main-bottom-dock can mount a frame
  // after this component, and flipping `mounted` while the target is
  // missing makes Vue move the teleport into a null node
  // (moveTeleport -> insertBefore on null).
  const enableTeleport = () => {
    if (document.getElementById("main-bottom-dock")) {
      mounted.value = true;
    } else {
      dockRaf = requestAnimationFrame(enableTeleport);
    }
  };
  enableTeleport();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(dockRaf);
});

const currentMap = computed(() =>
  props.match.match_maps?.find((m: any) => m.is_current_map),
);

const availableCommands = computed<MatchCommand[]>(() =>
  matchCommandsForStatus(currentMap.value?.status),
);

const pluginRuntime = computed(() =>
  effectivePluginRuntime(
    props.match.server_plugin_runtime,
    applicationSettings.gameServerPluginRuntime,
  ),
);

// DEAFCS: RCON is administrator-only (the API refuses everyone else).
const canSendRCONCommands = computed(
  () =>
    useAuthStore().isRoleAbove(e_player_roles_enum.administrator) &&
    [
      e_match_status_enum.Live,
      e_match_status_enum.PickingPlayers,
      e_match_status_enum.Scheduled,
      e_match_status_enum.Veto,
      e_match_status_enum.WaitingForCheckIn,
      e_match_status_enum.WaitingForServer,
    ].includes(props.match.status) &&
    !!props.match.server_id,
);

const canShowLogs = computed(
  () =>
    ![
      e_match_status_enum.Scheduled,
      e_match_status_enum.WaitingForCheckIn,
      e_match_status_enum.PickingPlayers,
      e_match_status_enum.Veto,
    ].includes(props.match.status),
);

// match_map_rounds is gated to finished maps (anti-cheat), so the restorable
// rounds come from the dedicated v_match_map_backup_rounds view instead. Shared
// subscription so this and MatchTabs don't open two identical websockets.
const { backupRounds } = useMatchBackupRounds(
  computed(() => currentMap.value?.id),
);

const restorableRounds = computed(() =>
  backupRounds.value.filter((r: any) => r.has_backup_file && r.round > 0),
);

function runCommand(
  command: MatchCommand,
  send: (cmd: string, arg: string) => void,
) {
  const rconCommand = resolveRconCommand(command.action, pluginRuntime.value);
  if (command.confirm) {
    pendingCommand.value = command;
    executePending.value = () => send(rconCommand, "");
    showConfirmDialog.value = true;
    return;
  }
  send(rconCommand, "");
}
</script>

<template>
  <!-- Teleport resolves its target once, at mount, and never re-resolves it
       on a `disabled` toggle (5Stack WEB #908), so it mounts only once the
       dock exists. -->
  <Teleport v-if="mounted" to="#main-bottom-dock">
    <MatchAdminDock :match="match" :controllable="canSendRCONCommands">
      <template #actions="{ compact }">
        <!-- DEAFCS: the step's recovery controls; the "..." menu stays in the
             match header. -->
        <MatchAdminDockActions :match="match" :compact="compact" />
      </template>

      <template #console>
        <div
          class="h-full min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 sm:gap-4 sm:p-4 overflow-auto lg:overflow-hidden"
        >
          <div
            class="min-w-0 flex flex-col gap-3 lg:min-h-0 lg:overflow-hidden"
          >
            <RconCommander
              v-if="canSendRCONCommands"
              :server-id="match.server_id"
              :online="!!match.is_server_online"
              :match-id="match.id"
              :plugin-runtime="pluginRuntime"
              :compact="true"
              class="lg:flex-1 lg:min-h-0"
            >
              <template #default="{ commander: send }">
                <DropdownMenuItem
                  v-for="command of availableCommands"
                  :key="command.action"
                  :disabled="!match.is_server_online"
                  @click="runCommand(command, send)"
                >
                  {{ $t(command.display) }}
                </DropdownMenuItem>

                <template v-if="restorableRounds.length > 0">
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger :disabled="!match.is_server_online">
                      {{ $t("match.tabs.restore_round") }}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="max-h-80 overflow-y-auto">
                      <DropdownMenuItem
                        v-for="round of restorableRounds"
                        :key="round.round"
                        :disabled="!match.is_server_online"
                        @click="send('restore_round', round.round.toString())"
                      >
                        {{
                          $t("common.round", {
                            number: round.round.toString(),
                          })
                        }}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </template>
              </template>

              <template #footer>
                <MatchServerRebootControl
                  :match="match"
                  variant="menu-item"
                  v-model:open="showRebootDialog"
                />
              </template>
            </RconCommander>

            <div
              v-else
              class="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center h-full"
            >
              <h3 class="font-semibold">
                {{ $t("match.admin_bar.rcon_unavailable") }}
              </h3>
              <p class="text-sm text-muted-foreground">
                {{ $t("match.admin_bar.not_controllable") }}
              </p>
            </div>
          </div>

          <div
            class="min-w-0 flex flex-col gap-2 lg:min-h-0 lg:overflow-hidden"
          >
            <div
              v-if="!canShowLogs || !hasLogs"
              class="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center"
            >
              <h3 class="font-semibold">
                {{ $t("match.tabs.no_logs_title") }}
              </h3>
              <p class="text-sm text-muted-foreground">
                {{ $t("match.tabs.no_logs_description") }}
              </p>
            </div>
            <div
              v-if="canShowLogs"
              v-show="hasLogs"
              class="lg:flex-1 lg:min-h-0"
            >
              <ServiceLogs
                :service="`m-${match.id}`"
                :compact="true"
                @has-logs="hasLogs = $event"
              />
            </div>
          </div>
        </div>
      </template>
    </MatchAdminDock>

    <AlertDialog :open="showConfirmDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t("common.confirm") }}</AlertDialogTitle>
          <AlertDialogDescription class="flex flex-col gap-2">
            <span>{{ $t("common.are_you_sure") }}</span>
            <Badge variant="secondary" class="w-fit">
              {{ pendingCommand?.display ? $t(pendingCommand.display) : "" }}
            </Badge>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showConfirmDialog = false">
            {{ $t("common.cancel") }}
          </AlertDialogCancel>
          <AlertDialogAction
            @click="
              executePending && executePending();
              showConfirmDialog = false;
            "
          >
            {{ $t("common.confirm") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Reboot confirm lives here (not in the RCON dropdown) so it survives
         the dropdown unmounting when the menu closes. -->
    <MatchServerRebootControl
      :match="match"
      variant="dialog"
      v-model:open="showRebootDialog"
    />
  </Teleport>
</template>
