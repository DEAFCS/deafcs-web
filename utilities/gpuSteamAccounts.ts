// DEAFCS: steam_accounts also holds Steam Presence bots (role 'friends').
// The GPU render pool is only the role 'gpu' rows, the ones the API's
// claim_free_steam_account hands out, so every GPU pool list and count
// filters on it. (Upstream 5Stack lists every row.)
export const GPU_STEAM_ACCOUNT_ROLE = "gpu";

export const gpuSteamAccountsWhere = {
  role: { _eq: GPU_STEAM_ACCOUNT_ROLE },
};
