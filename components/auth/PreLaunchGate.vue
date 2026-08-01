<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowUpRight, LoaderCircle, LogOut, ShieldCheck } from "lucide-vue-next";
import { useAuthStore } from "~/stores/AuthStore";
import { useBranding } from "~/composables/useBranding";
import { e_player_roles_enum } from "~/generated/zeus";
import { loginLinks } from "~/utilities/loginLinks";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";
import SteamIcon from "~/components/icons/SteamIcon.vue";
import Logout from "~/layouts/components/Logout.vue";
import TopoBackground from "~/layouts/components/TopoBackground.vue";

const authStore = useAuthStore();
const { brandName, logoUrl } = useBranding();
const signOutOpen = ref(false);

const me = computed(() => authStore.me);
const isLoading = computed(() => !authStore.hasCheckedSession);
const isPending = computed(
  () =>
    authStore.hasCheckedSession &&
    !!me.value?.steam_id &&
    !authStore.isRoleAbove(e_player_roles_enum.verified_user),
);
const displayBrand = computed(() => brandName.value || "DEAFCS");
const displayName = computed(() => me.value?.name || "STEAM USER");
const initials = computed(() =>
  displayName.value
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase(),
);
const avatarSrc = computed(() => {
  const config = useRuntimeConfig();
  return resolveAvatarUrl(
    me.value?.custom_avatar_url ||
      me.value?.avatar_url ||
      me.value?.roster_image_url,
    config.public.apiDomain,
  );
});
const steamLoginHref = computed(() => {
  const redirect =
    typeof window === "undefined" ? "/" : window.location.toString();
  return `${loginLinks.steam}?redirect=${encodeURIComponent(redirect)}`;
});

const signOut = () => {
  signOutOpen.value = true;
};
</script>

<template>
  <div class="prelaunch-gate">
    <TopoBackground animated />

    <div class="prelaunch-vignette" aria-hidden="true"></div>
    <div class="prelaunch-accent prelaunch-accent--top" aria-hidden="true"></div>
    <div class="prelaunch-accent prelaunch-accent--bottom" aria-hidden="true"></div>

    <main
      class="prelaunch-content"
      aria-labelledby="prelaunch-title"
      :aria-busy="isLoading"
    >
      <div class="prelaunch-statusbar" aria-hidden="true">
        <span><i></i> PRIVATE CHANNEL</span>
        <span>DEAFCS.NET <b>//</b> 00.01</span>
      </div>

      <section
        class="prelaunch-panel"
        :class="{ 'prelaunch-panel--pending': isPending }"
      >
        <div class="prelaunch-brand">
          <div class="prelaunch-logo-frame">
            <span class="prelaunch-corner prelaunch-corner--tl"></span>
            <span class="prelaunch-corner prelaunch-corner--br"></span>
            <img
              :src="logoUrl || '/favicon/512.png'"
              :alt="`${displayBrand} logo`"
              class="prelaunch-logo"
            />
          </div>

          <div class="prelaunch-wordmark">
            <p class="prelaunch-kicker">
              <span aria-hidden="true">◆</span>
              PRIVATE PRE-LAUNCH ACCESS
            </p>
            <h1 id="prelaunch-title">
              <span class="prelaunch-wordmark-foreground">{{ displayBrand }}</span>
            </h1>
            <div class="prelaunch-rule" aria-hidden="true">
              <span></span>
            </div>
          </div>
        </div>

        <div
          class="prelaunch-access"
          :class="{ 'prelaunch-access--pending': isPending }"
          role="status"
          aria-live="polite"
        >
          <div v-if="isLoading" class="prelaunch-loading">
            <LoaderCircle class="prelaunch-loading-icon" aria-hidden="true" />
            <span>CHECKING ACCESS</span>
          </div>

          <template v-else-if="isPending">
            <div class="prelaunch-identity">
              <div class="prelaunch-avatar">
                <img
                  v-if="avatarSrc"
                  :src="avatarSrc"
                  :alt="`${displayName} avatar`"
                />
                <span v-else>{{ initials }}</span>
              </div>
              <div class="prelaunch-identity-copy">
                <span class="prelaunch-micro-label">IDENTITY DETECTED</span>
                <strong>{{ displayName }}</strong>
              </div>
            </div>
            <div class="prelaunch-pending-copy">
              <div class="prelaunch-state-title">
                <ShieldCheck aria-hidden="true" />
                ACCESS PENDING
              </div>
              <p>Your account is waiting for verification.</p>
            </div>
            <button
              type="button"
              class="prelaunch-button prelaunch-button--quiet"
              @click="signOut"
            >
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </template>

          <a
            v-else
            :href="steamLoginHref"
            class="prelaunch-button prelaunch-button--steam"
            aria-label="Sign in through Steam"
          >
            <span class="prelaunch-steam-icon"><SteamIcon aria-hidden="true" /></span>
            <span class="prelaunch-button-copy">
              <strong>Sign in through Steam</strong>
              <small>AUTHORIZE WITH YOUR STEAM IDENTITY</small>
            </span>
            <ArrowUpRight class="prelaunch-button-arrow" aria-hidden="true" />
          </a>
        </div>

        <div class="prelaunch-footer-label">
          <span></span>
          {{ displayBrand.toUpperCase() }}.NET
          <span></span>
        </div>
      </section>

      <p class="prelaunch-footer-status">
        <span aria-hidden="true">◆</span>
        AUTHENTICATION REQUIRED <b>//</b> ACCESS CONTROLLED
      </p>
    </main>

    <Logout
      v-if="signOutOpen"
      @update:open="signOutOpen = $event"
    />
  </div>
</template>

<style scoped>
.prelaunch-gate {
  position: relative;
  display: flex;
  min-height: 100svh;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  background: #09090b;
  color: #f5f5f4;
  font-family: "Oxanium", ui-sans-serif, system-ui, sans-serif;
}

.prelaunch-vignette {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 45%, transparent 0, rgb(9 9 11 / 0.08) 40%, rgb(9 9 11 / 0.75) 100%),
    linear-gradient(90deg, rgb(9 9 11 / 0.28), transparent 18%, transparent 82%, rgb(9 9 11 / 0.28));
}

.prelaunch-accent {
  position: fixed;
  z-index: 2;
  width: 22vw;
  max-width: 22rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(255 159 48 / 0.38));
  opacity: 0.7;
  pointer-events: none;
}

.prelaunch-accent--top {
  top: 18%;
  right: 0;
}

.prelaunch-accent--bottom {
  bottom: 18%;
  left: 0;
  transform: rotate(180deg);
}

.prelaunch-content {
  position: relative;
  z-index: 3;
  display: flex;
  width: min(100%, 56rem);
  flex-direction: column;
  align-items: center;
  padding: 2rem 1.25rem;
}

.prelaunch-statusbar,
.prelaunch-footer-status {
  display: flex;
  width: min(100%, 40rem);
  justify-content: space-between;
  gap: 1rem;
  color: rgb(231 229 228 / 0.38);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  line-height: 1.5;
  text-transform: uppercase;
}

.prelaunch-statusbar i {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  margin-right: 0.45rem;
  background: #ff9f30;
  box-shadow: 0 0 0 0.2rem rgb(255 159 48 / 0.08);
  transform: rotate(45deg);
}

.prelaunch-statusbar b,
.prelaunch-footer-status b {
  color: rgb(255 159 48 / 0.55);
  font-weight: 500;
}

.prelaunch-panel {
  display: flex;
  width: min(100%, 35rem);
  flex-direction: column;
  align-items: center;
  padding: clamp(3rem, 9vh, 6rem) 1rem clamp(2.5rem, 7vh, 4.5rem);
  text-align: center;
}

.prelaunch-panel--pending {
  width: min(100%, 52rem);
}

.prelaunch-brand {
  display: flex;
  align-items: center;
  gap: clamp(1.5rem, 5vw, 3rem);
}

.prelaunch-logo-frame {
  position: relative;
  display: grid;
  width: clamp(6rem, 15vw, 8.5rem);
  height: clamp(6rem, 15vw, 8.5rem);
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(231 229 228 / 0.16);
  background: rgb(255 255 255 / 0.015);
  box-shadow: inset 0 0 3rem rgb(0 0 0 / 0.28), 0 0 3rem rgb(255 159 48 / 0.04);
}

.prelaunch-logo {
  width: 70%;
  height: 70%;
  object-fit: contain;
  filter: drop-shadow(0 0 1rem rgb(255 159 48 / 0.2));
}

.prelaunch-corner {
  position: absolute;
  width: 1rem;
  height: 1rem;
  border-color: #ff9f30;
}

.prelaunch-corner--tl {
  top: -1px;
  left: -1px;
  border-top: 2px solid;
  border-left: 2px solid;
}

.prelaunch-corner--br {
  right: -1px;
  bottom: -1px;
  border-right: 2px solid;
  border-bottom: 2px solid;
}

.prelaunch-wordmark {
  min-width: 0;
  text-align: left;
}

.prelaunch-kicker,
.prelaunch-micro-label {
  margin: 0;
  color: rgb(231 229 228 / 0.48);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.23em;
  line-height: 1.5;
}

.prelaunch-kicker span {
  margin-right: 0.4rem;
  color: #ff9f30;
  font-size: 0.55rem;
}

.prelaunch-wordmark h1 {
  position: relative;
  margin: 0.35rem 0 0;
  color: #f5f5f4;
  font-family: "Oxanium", ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(3rem, 9vw, 5.5rem);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 0.9;
  text-transform: uppercase;
  -webkit-text-fill-color: currentColor;
}

.prelaunch-wordmark-foreground {
  display: inline-block;
  color: #f5f5f4;
  -webkit-text-fill-color: #f5f5f4;
}

.prelaunch-rule {
  position: relative;
  width: min(100%, 12rem);
  height: 1px;
  margin-top: 1.1rem;
  background: linear-gradient(90deg, rgb(231 229 228 / 0.32), transparent);
}

.prelaunch-rule span {
  position: absolute;
  top: -0.2rem;
  left: 0.8rem;
  width: 0.4rem;
  height: 0.4rem;
  background: #ff9f30;
  transform: rotate(45deg);
}

.prelaunch-access {
  position: relative;
  display: flex;
  width: min(100%, 24rem);
  min-height: 5.75rem;
  align-items: center;
  justify-content: center;
  margin-top: clamp(2.5rem, 6vh, 4rem);
  padding: 1.25rem;
  border: 1px solid rgb(231 229 228 / 0.13);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.012));
  box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 0.2);
}

.prelaunch-access--pending {
  display: grid;
  width: min(100%, 50rem);
  min-height: 8rem;
  grid-template-columns: minmax(11rem, 1fr) minmax(15rem, 1.35fr) auto;
  align-items: center;
  column-gap: clamp(1.5rem, 4vw, 2.75rem);
  padding: 1.5rem 1.75rem;
  text-align: left;
}

.prelaunch-access::before,
.prelaunch-access::after {
  position: absolute;
  width: 1.2rem;
  height: 1.2rem;
  content: "";
}

.prelaunch-access::before {
  top: -1px;
  left: -1px;
  border-top: 2px solid #ff9f30;
  border-left: 2px solid #ff9f30;
}

.prelaunch-access::after {
  right: -1px;
  bottom: -1px;
  border-right: 2px solid #ff9f30;
  border-bottom: 2px solid #ff9f30;
}

.prelaunch-loading {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: rgb(231 229 228 / 0.58);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.2em;
}

.prelaunch-loading-icon {
  width: 1rem;
  height: 1rem;
  color: #ff9f30;
  animation: prelaunch-spin 1.2s linear infinite;
}

.prelaunch-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 1rem;
  align-self: stretch;
  text-align: left;
}

.prelaunch-identity-copy {
  min-width: 0;
}

.prelaunch-avatar {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgb(255 159 48 / 0.46);
  background: rgb(255 159 48 / 0.08);
  color: #ffb45d;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.prelaunch-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.prelaunch-identity strong {
  display: block;
  margin-top: 0.15rem;
  overflow: hidden;
  color: #f5f5f4;
  font-size: 0.95rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prelaunch-pending-copy {
  min-width: 0;
  margin: 0;
  text-align: left;
}

.prelaunch-state-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #ffb45d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.prelaunch-state-title svg {
  width: 1rem;
  height: 1rem;
}

.prelaunch-pending-copy p {
  margin: 0.4rem 0 0;
  max-width: 24rem;
  color: rgb(231 229 228 / 0.62);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.82rem;
  line-height: 1.5;
}

.prelaunch-button {
  display: inline-flex;
  min-height: 3.25rem;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  border: 1px solid transparent;
  color: #f5f5f4;
  cursor: pointer;
  font-family: inherit;
  text-decoration: none;
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease;
}

.prelaunch-button:focus-visible {
  outline: 2px solid #ffb45d;
  outline-offset: 4px;
}

.prelaunch-button--steam {
  width: 100%;
  justify-content: flex-start;
  padding: 0.55rem 0.65rem;
  border-color: rgb(231 229 228 / 0.16);
  background: rgb(255 255 255 / 0.035);
}

.prelaunch-button--steam:hover {
  border-color: rgb(255 159 48 / 0.65);
  background: rgb(255 159 48 / 0.09);
  transform: translateY(-1px);
}

.prelaunch-steam-icon {
  display: grid;
  width: 2.15rem;
  height: 2.15rem;
  flex: 0 0 auto;
  place-items: center;
  background: transparent;
  color: #fff;
}

.prelaunch-steam-icon svg {
  width: 1.05rem;
  height: 1.05rem;
  fill: #fff;
}

.prelaunch-button-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
}

.prelaunch-button-copy strong {
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.prelaunch-button-copy small {
  overflow: hidden;
  color: rgb(231 229 228 / 0.42);
  font-size: 0.55rem;
  letter-spacing: 0.13em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prelaunch-button-arrow {
  width: 1rem;
  height: 1rem;
  color: #ff9f30;
}

.prelaunch-button--quiet {
  min-height: 2.45rem;
  justify-self: end;
  margin-left: 0;
  padding: 0 0.8rem;
  border-color: rgb(231 229 228 / 0.17);
  background: transparent;
  color: rgb(245 245 244 / 0.74);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}

.prelaunch-button--quiet svg {
  width: 0.9rem;
  height: 0.9rem;
}

.prelaunch-button--quiet:hover {
  border-color: rgb(255 159 48 / 0.55);
  color: #ffb45d;
}

.prelaunch-footer-label {
  display: flex;
  width: min(100%, 15rem);
  align-items: center;
  gap: 0.8rem;
  margin-top: 1.25rem;
  color: rgb(231 229 228 / 0.33);
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.3em;
}

.prelaunch-footer-label span {
  height: 1px;
  flex: 1;
  background: rgb(231 229 228 / 0.15);
}

.prelaunch-footer-status {
  justify-content: center;
  text-align: center;
}

.prelaunch-footer-status span {
  margin-right: 0.35rem;
  color: #ff9f30;
  font-size: 0.5rem;
}

@keyframes prelaunch-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .prelaunch-panel--pending {
    width: min(100%, 42rem);
  }

  .prelaunch-access--pending {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 1.25rem;
    column-gap: 1.5rem;
    padding: 1.4rem;
  }

  .prelaunch-access--pending .prelaunch-identity {
    grid-column: 1;
    grid-row: 1;
  }

  .prelaunch-access--pending .prelaunch-pending-copy {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .prelaunch-access--pending .prelaunch-button--quiet {
    grid-column: 2;
    grid-row: 1;
  }
}

@media (max-width: 640px) {
  .prelaunch-content {
    padding: 1.25rem 1rem;
  }

  .prelaunch-statusbar {
    align-items: center;
    font-size: 0.52rem;
  }

  .prelaunch-statusbar span:last-child {
    display: none;
  }

  .prelaunch-panel {
    padding-top: clamp(2.5rem, 10vh, 4.5rem);
  }

  .prelaunch-brand {
    flex-direction: column;
    gap: 1.5rem;
  }

  .prelaunch-wordmark {
    text-align: center;
  }

  .prelaunch-kicker {
    font-size: 0.58rem;
  }

  .prelaunch-wordmark h1 {
    font-size: clamp(3.2rem, 17vw, 5rem);
  }

  .prelaunch-rule {
    margin-right: auto;
    margin-left: auto;
    background: linear-gradient(90deg, transparent, rgb(231 229 228 / 0.32), transparent);
  }

  .prelaunch-rule span {
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
  }

  .prelaunch-access {
    width: min(100%, 22rem);
  }

  .prelaunch-access--pending {
    display: flex;
    width: min(100%, 22rem);
    min-height: 0;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 1.25rem;
    padding: 1.25rem;
  }

  .prelaunch-access--pending .prelaunch-identity {
    align-self: auto;
  }

  .prelaunch-access--pending .prelaunch-pending-copy {
    width: 100%;
  }

  .prelaunch-access--pending .prelaunch-button--quiet {
    align-self: flex-start;
    justify-self: auto;
  }

  .prelaunch-footer-status {
    width: 100%;
    flex-wrap: wrap;
    justify-content: center;
    font-size: 0.52rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .prelaunch-loading-icon {
    animation: none;
  }

  .prelaunch-button {
    transition: none;
  }
}
</style>
