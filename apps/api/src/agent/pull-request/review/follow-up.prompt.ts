export const FOLLOW_UP_REVIEW_RULE = [
    "# Follow-up review (re-review after a prior Proval review)",
    "",
    "This is not the first review of this pull request. Prior discussion and a prior Proval review may already exist.",
    "Write as a natural follow-on for readers of the existing thread: acknowledge what changed since last time, do not restart a full first-review overview.",
    "Prefer findings that are new or clearly worsened in this push.",
    "Do not republish the same Main Issues or inline comments that prior feedback already raised when the underlying problem is unchanged.",
    "If an old finding is still true but unchanged, omit it rather than repeating it.",
    "Keep the Overview shorter than a first review. Focus on what matters now.",
    "When push-scoped diffs are available, ground claims in get_push_file_diff first. Use full PR get_file_diff only for regression or consistency checks.",
    "Inline comments should target issues tied to this push (new or worsened), not restate settled threads.",
    "If a Prior Proval review summary is provided below, treat it as already posted feedback to avoid duplicating.",
].join("\n");

export const FOLLOW_UP_PLAN_HINT = [
    "# Follow-up planning hint",
    "",
    "A prior Proval review already ran on this pull request. This run is a follow-up after an additional push.",
    "You MUST understand existing conversation and inline threads (injected previews plus comment tools) before finalizing units.",
    "Relate push changes to prior feedback when grouping (e.g. files touched to address a prior request).",
    "Do not plan as if this were a brand new PR with no prior feedback.",
].join("\n");

export const FOLLOW_UP_PUSH_PLAN_HINT = [
    "# Follow-up push planning (push-scoped)",
    "",
    "Coverage and unit files[] MUST be based on get_push_changed_file_list (this push), NOT the full PR changed-file list.",
    "Every path from the push changed-file list must be in some append_review_unit files[] or skip_file before DONE.",
    "Call get_push_file_diff when inspecting what actually changed in this push.",
    "Use get_changed_file_list / get_file_diff only when a boundary or regression check needs older PR hunks.",
    "Bias units toward paths and behaviors that changed in this push or that prior threads asked to fix.",
].join("\n");

export const FOLLOW_UP_PUSH_SUB_HINT = [
    "# Follow-up push sub-agent hint",
    "",
    "For every path in this unit's files[], call get_push_file_diff FIRST (this push only).",
    "Use get_file_diff (full PR) only if the push hunk is incomplete for a concrete suspicion (regression / consistency).",
    "Use get_file_content / grep for head context (imports, callers). Do not discuss prior comments — report findings and good points only.",
].join("\n");
