import gql from "graphql-tag";

// Raw GraphQL text, not the Zeus builder: the generated client predates this
// action (it needs a live Hasura codegen run to learn it).
const IS_PLAYER_NAME_AVAILABLE = gql`
  query IsPlayerNameAvailable($name: String!, $steam_id: String) {
    isPlayerNameAvailable(name: $name, steam_id: $steam_id) {
      available
    }
  }
`;

export const PLAYER_NAME_TAKEN_FALLBACK = "That name is already taken";

// True when no other registered player already has this name (case
// ignored). `steamId` is the player being named, so keeping your own
// current name never counts as a clash. Fails open on a network error: the
// API re-checks on submit and a database index backs that up.
export async function isPlayerNameAvailable(
  apollo: { query: (options: Record<string, unknown>) => Promise<any> },
  name: string,
  steamId?: string | null,
): Promise<boolean> {
  try {
    const { data } = await apollo.query({
      query: IS_PLAYER_NAME_AVAILABLE,
      variables: { name, steam_id: steamId ?? null },
      fetchPolicy: "network-only",
    });
    return data?.isPlayerNameAvailable?.available !== false;
  } catch {
    return true;
  }
}

// The API's rejection text, so a race lost at submit reads the same inline.
export function isNameTakenError(error: unknown): boolean {
  const text =
    typeof error === "string"
      ? error
      : String((error as Error)?.message ?? "");
  return text.includes(PLAYER_NAME_TAKEN_FALLBACK);
}
