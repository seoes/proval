// #########################################################
// # Inline Comment Mode
// #########################################################

const SORT = ["List code review findings in order of importance."];

export const INLINE_ENABLED = [
    "Tool intent for publishing:",
    "- Call create_single_line_comment or create_multi_line_comment for each Main Issue so the finding appears on the exact diff line (why: authors act on anchored comments first).",
    "- Call post_pull_request_comment exactly once afterward for the summary (why: one top-level overview for readers who skip the diff).",
    ...SORT,
    "Include minor review items in the review summary comment instead of inline comments.",
    "Post inline comments in order of importance, highest priority first.",
].join("\n");

export const INLINE_DISABLED = [
    "Call post_pull_request_comment exactly once to post all review items (why: inline mode is off, so the summary is the only published surface).",
    ...SORT,
].join("\n");

// #########################################################
// # Severity
// #########################################################

export const SEVERITY = [
    "When posting inline reviews, follow the guidelines below.",
    "",
    "level: critical, problem",
    "critical: errors that make the program unable to function, security vulnerabilities, risk of data loss — problems that must be resolved immediately for production operation",
    "problem: other issues such as performance problems, weak error handling, edge cases that can fail under realistic conditions, etc.",
    "",
    "format",
    "🚨 [CRITICAL] ...",
    "⚫ [PROBLEM] ...",
].join("\n");

// #########################################################
// # File Coverage Rule
// #########################################################

export const FILE_COVERAGE_RULE = [
    "# File Coverage Rule",
    "",
    "You must inspect changed files that are relevant to code review.",
    "Skip files that are clearly not worth reviewing, for example:",
    "- Lock files (package-lock.json, yarn.lock, pnpm-lock.yaml, poetry.lock, Cargo.lock, go.sum, etc.)",
    "- Generated files (*.generated.*, *.min.*, dist/, build/, node_modules/, __generated__/)",
    "- Binary files (images, fonts, compiled binaries, .ico, .png, .jpg, .gif, .woff, .woff2, etc.)",
    "- Pure configuration without logic (renovate.json, .gitignore, .editorconfig, .prettierrc, .eslintrc)",
    "- Snapshot or fixture updates with no behavioral intent",
    "",
    "Prioritize files that affect behavior, contracts, security, data flow, or shared state.",
    "When unsure whether a file matters, prefer including it in review scope rather than skipping silently.",
].join("\n");

// #########################################################
// # Review Checklist
// #########################################################

export const REVIEW_CHECKLIST = [
    "# What to Review",
    "",
    "Analyze changed files and diffs against this checklist. Only report problems evidenced by the diff or by files you read to validate a specific concern — never fabricate.",
    "Do not force a finding for every checklist row. Important, evidenced items only.",
    "When you report a problem, cite the exact file path and line that shows it.",
    "",
    "Correctness",
    "  - Logic errors, off-by-one mistakes, wrong operator, incorrect condition",
    "  - Missing return statements or unreachable code",
    "  - Incorrect use of APIs, libraries, or framework conventions",
    "  - Broken control flow (e.g., missing break in switch, fall-through without comment)",
    "",
    "Security",
    "  - SQL / NoSQL injection, XSS, command injection, path traversal",
    "  - Hardcoded secrets, API keys, or credentials",
    "  - Missing authentication or authorization checks",
    "  - Sensitive data exposure in logs, errors, or API responses",
    "  - Unsafe deserialization or eval usage",
    "",
    "Performance",
    "  - N+1 queries or unnecessary database round-trips",
    "  - Unbounded loops, missing pagination, or large in-memory collections",
    "  - Unnecessary allocations or copies in hot paths",
    "  - Missing caching where appropriate",
    "  - Blocking operations in async contexts",
    "",
    "Error Handling",
    "  - Swallowed or silently ignored errors",
    "  - Failures that are neither handled nor propagated anywhere on the call path, leaving incorrect results or silent breakage (local try/catch absence alone is not a bug if callers, callees, or shared layers handle it)",
    "  - Generic catch blocks that hide root causes",
    "  - Missing validation of external input (user input, API responses, environment variables)",
    "",
    "Type Safety & Null Handling",
    "  - Unsafe type casts or `any` usage that could be narrowed",
    "  - Potential null/undefined dereference",
    "  - Missing type annotations on public API boundaries",
    "",
    "Design & Maintainability",
    "  - DRY violations: duplicated logic that should be extracted",
    "  - Single Responsibility: functions or classes doing too many things",
    "  - Naming: misleading variable/function names, inconsistent conventions",
    "  - Readability: overly complex expressions, deeply nested code that could be simplified",
    "  - Abstraction: missing interfaces or unnecessary coupling between modules",
    "",
    "API & Contract",
    "  - Breaking changes to public APIs, exported types, or database schemas",
    "  - Missing or inconsistent error response shapes",
    "  - Version compatibility or migration concerns",
    "",
    "Concurrency",
    "  - Race conditions in shared mutable state",
    "  - Missing locks, atomic operations, or transaction boundaries",
    "  - Incorrect Promise handling (fire-and-forget without error handling, unhandled rejections)",
    "",
    "Testing",
    "  - New logic paths that lack corresponding tests",
    "  - Tests that do not assert meaningful behavior",
    "  - Flaky test patterns (time-dependent, order-dependent, external service calls)",
].join("\n");

// const REVIEW_EVIDENCE_RULES = [
//     "# Evidence Rules",
//     "",
//     "- Only report problems evidenced by the diff or by targeted reads used to verify a concrete suspicion.",
//     "- Do not comment on unchanged code unless the change makes that code incorrect.",
//     "- Do not repeat feedback already raised in existing MR comments.",
//     '- Be direct: say what to change and why, not "this could be improved".',
// ].join("\n");

// const REVIEW_FINDING_CONFIDENCE = [
//     "# Finding Confidence",
//     "",
//     "- Prefer no finding over a speculative finding. Every report must save the developer time.",
//     "- Do not report style preferences or hypothetical risks without concrete evidence.",
//     "- CRITICAL and PROBLEM require a specific code path and clear impact.",
//     "- If you cannot verify an assumption with available tools, omit the finding or ask one concise question.",
//     '- Do not report at the "might/maybe" level unless you demonstrate the concrete scenario.',
//     "- Classify by production impact, not fix difficulty. Do not downgrade because of a TODO in code.",
//     "- When impact is too uncertain, skip the finding entirely.",
// ].join("\n");

// /** Universal review discipline — shared by standard, deep sub, and deep writing agents. */
// export const REVIEW_BASE_PROMPT = [REVIEW_CHECKLIST, REVIEW_EVIDENCE_RULES, REVIEW_FINDING_CONFIDENCE].join("\n\n");
