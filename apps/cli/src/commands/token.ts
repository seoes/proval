import { type CommandContext, UsageError } from "./shared.js";

export async function runTokenCommand(context: CommandContext): Promise<void> {
  const [verb] = context.argumentList;

  // Token management is unreachable by token auth by design, so that a token
  // cannot list, mint or revoke tokens; the scope table has no rule for these
  // routes and the API answers 403. Say so up front instead of failing late.
  if (!verb || verb === "list" || verb === "revoke" || verb === "create") {
    throw new UsageError(
      "Token management needs a session login, because a token may not list, mint or revoke tokens. " +
        "Manage tokens in the dashboard under Settings.",
    );
  }

  throw new UsageError(`unknown command: token ${verb}`);
}
