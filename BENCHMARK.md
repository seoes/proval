# Proval agent benchmark

Measures the real Proval review agent with a real model against the frozen
Martian offline review benchmark dataset. Every review runs against a local
Git workspace through MockProvider, so no comment ever leaves the machine.

## Configuration

Model credentials come from `.env.benchmark` at the repo root, see
`.env.benchmark.example`. The file holds `LLM_BASE_URL`, `LLM_API_KEY`,
`LLM_MODEL`, and optionally `LLM_PROVIDER` (default `openai`). Credentials
are never written into any artifact. Recorded config goes through an explicit
safe field list and URLs are stripped of userinfo.

The benchmark supports API key authentication only. OAuth providers,
including xAI OAuth, are not supported. OAuth authorization configured in
the Proval dashboard is not available to the benchmark runner.

Optional `GITHUB_TOKEN` speeds up dataset import. Without it the GitHub API
rate limit allows roughly one import pass per hour.

## Commands

Run from the repo root.

```sh
bun run benchmark import <martianRepoDir>
bun run benchmark prepare [caseId ...]
bun run benchmark run <quick|full> [--batch <id>] [--resume] [--case <id,id...>]
bun run benchmark report <batchId>
bun run benchmark compare <baselineBatchId> <candidateBatchId>
bun run benchmark warm
bun run benchmark list
```

- `import` reads the golden comment files of a pinned Martian dataset commit
  and writes `manifest.json`. Golden comments never enter the workspace or
  any agent input. Re running reuses already resolved entries.
- `prepare` verifies every object, merge base, diff hash, and diff stat in
  the manifest against the local git cache. It never refreshes commit
  identifiers. A missing object fails preparation.
- `warm` sends one tiny request so model warm up stays outside measurement.
- `run` executes a batch. `quick` is five PRs once each (one per project), `full` is all 50 PRs
  three times each (150 planned attempts).
- `report` generates a readable `report.md` from existing batch output.
- `compare` generates `compare-<baseline>.md` in the candidate batch directory.

## Reading a result

Open `apps/api/benchmark/data/output/<batchId>/report.md` in a Markdown preview.
The runner creates it at startup, updates it after each attempt, and refreshes
it when the batch finishes or is gracefully canceled. To regenerate a report
for an existing batch, run `bun run benchmark report <batchId>`.

The report shows the model, planned workload, recorded outcome, review speed
by project and PR size, and a result row for each PR. Phase timing and token
usage are available in an expandable section. A separate table lists every
non completed attempt with its elapsed time and reason. Awaiting result counts
planned reviews without a terminal record, including any active review.

Edit the Markdown template to change the layout or short explanatory text.
The runner fills each named placeholder with a table. Raw JSON remains the
source for reproducibility and comparison.

## Batch execution

The parent process schedules one child process per review attempt, one PR at
a time. Each child owns its workdir, MockProvider, sender, and SQLite
database. The parent owns result bookkeeping and removes the workdir and
database only after the child has exited.

There is no benchmark time limit anywhere. A slow review runs until it
finishes, fails, or is canceled. The child prints a heartbeat with elapsed
time and the current phase every 30 seconds.

Avoid interrupting a benchmark batch whenever possible. If a batch is
interrupted, prefer starting the entire benchmark again as a new batch
instead of using `resume` to continue the unfinished batch.

Cancellation: press Ctrl+C once. The active child is stopped and the attempt
is recorded as `canceled`. Press again to force exit.

Resume: `bun run benchmark run <profile> --batch <id> --resume`. Attempts
that started but never wrote a terminal record are classified as
`interrupted` and stay in the report. Completed attempts are skipped. Failed
or interrupted attempts are retried with a new attempt index and the old
records are preserved. Resume checks the frozen manifest, profile file,
selected profile, case selection, repeat count, seed, agent setting, source
state, model identity, endpoint, Bun version, and machine description against
the original batch. A changed or missing value requires a new batch. Repeat
the original case selection when resuming a subset. Credential rotation does
not invalidate a batch.

Comparison requires the same manifest hash in both batch records and every
completed attempt. A different or missing input identity stops comparison
before a speed change is reported. Model and agent code may differ between
the two batches. Keep the frozen manifest unchanged when testing an agent
change. Even importing the same dataset again can change the manifest hash
through its import timestamp.

## Artifacts

Everything lives under `apps/api/benchmark/data/output/<batchId>/`.

- `run.json` batch metadata with safe reproducibility info and a fixed
  snapshot of the project, line count, and file count for each selected case.
- `result.jsonl` one appended line per attempt lifecycle event.
- `attempt/<runId>/run.json` per attempt metadata, timing, token usage,
  status, and coverage.
- `attempt/<runId>/review.json` posted comments, inline comments, emoji
  evaluation, review units, and sub agent handoffs.
- `attempt/<runId>/event.jsonl` buffered diagnostic events.
- `report.md` and `compare-<baseline>.md` readable Markdown reports.

Attempt status is one of `completed`, `incomplete`, `failed`,
`prepareFailed`, `canceled`, `interrupted`. Incomplete covers step budget
exhaustion, unexplained file coverage gaps, and a missing summary comment.
Zero findings is a valid completed outcome.

Report and comparison grouping use the fixed case snapshot in the batch.
For an older batch without a snapshot, available attempt metadata supplies
the case information. Missing size is shown as `unknown` and missing file
count as `-`, so an interruption cannot be mistaken for zero text change.

Timing fields: `prepareMs` outside the review, then `setupMs`, `planMs`,
`subWallMs`, `writingMs`, `finalizeMs` partitioning `reviewMs`. `subWallMs`
is the parallel group wall time, never the sum of sub agent durations.
Request counts, retries, compressions, and token usage are captured at the
sender boundary so compression requests are included. Request timing there
includes concurrency queue wait, so request duration sums can exceed wall
time.

## Testing

Ordinary `bun test` verifies the runner without a model. A deterministic fake
sender (`BENCHMARK_FAKE_SENDER=scripted|slow|fail|compress-once|
plan-loop-forever|no-handoff`) drives the production flow against a small
local git fixture and checks phase ordering, parallel wall time, compression
accounting, failure records, cancellation, and preparation failure. Report
and compare logic is verified with a deterministic result fixture.

Real model execution is manual. Warm the model first, then run `quick`, and
only run `full` after input identity and metric collection look right. If the
execution environment kills a job, the next resume records it as
`interrupted`, never as successful.
