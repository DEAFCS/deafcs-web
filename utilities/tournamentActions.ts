// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { toast } from "~/components/ui/toast";
import { generateMutation } from "~/graphql/graphqlGen";

/**
 * Free-agent and draft actions ship with the registration migration, so zeus
 * only types them once `yarn codegen` has run against that schema — the
 * selection is asserted rather than inferred until it has.
 */
export async function runTournamentAction(
  client: { mutate: (options: Record<string, any>) => Promise<any> },
  mutation: Record<string, any>,
  failureTitle: string,
): Promise<Record<string, any> | null> {
  try {
    const { data } = await client.mutate({
      mutation: generateMutation(mutation as any),
    });
    return (data as Record<string, any>) ?? null;
  } catch (error: unknown) {
    toast({
      title: failureTitle,
      description: error instanceof Error ? error.message : String(error),
      variant: "destructive",
    });
    return null;
  }
}
