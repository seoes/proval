export const HELP_TEXT = `proval, a command line client for a Proval instance

Usage
  proval <command> [arguments] [flags]

Authentication
  proval auth login --url <instance> --token <token>
  proval auth status
  proval auth logout

Repositories
  proval repo list [--match <text>]
  proval repo show <repo>
  proval repo enable <repo>
  proval repo disable <repo>
  proval repo set <repo> <field> <value>

Reviews
  proval review trigger <repo> <iid> [--force]   (needs an API route that is not released yet, see issue #67)

Activities
  proval activity list [--status <status>] [--limit <n>]
  proval activity show <id>
  proval activity log <id>
  proval activity cancel <id> [--yes]
  proval activity retry <id>

Tokens
  proval token                                   (explains why tokens are managed in the dashboard)

Instance
  proval settings get
  proval settings set <field> <true|false>

Flags
  --json    one JSON document, for scripts
  --agent   one JSON object per line, for agents
  --help    this text

A repository may be given as its Proval id or as its path, so "druxt/druxt.js"
and "6" both work.

Credentials come from PROVAL_API_URL and PROVAL_API_TOKEN when both are set,
otherwise from the file written by "proval auth login".
`;
