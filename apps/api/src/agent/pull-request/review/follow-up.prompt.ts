export const FOLLOW_UP_REVIEW_RULE = [
    "# Follow-up review (re-review after a prior Proval review)",
    "",
    "This is not the first review of this pull request. A prior Proval review already exists.",
    "You may still inspect the full PR diff when needed for regressions or consistency.",
    "Prefer findings that are new or clearly worsened since the prior review.",
    "Do not republish the same Main Issues or inline comments that the prior review already raised when the underlying problem is unchanged.",
    "If an old finding is still true but unchanged, omit it rather than repeating it.",
    "Keep the Overview shorter than a first review. Focus on what matters now rather than restating the whole PR.",
    "If a Prior Proval review summary is provided below, treat it as already posted feedback to avoid duplicating.",
].join("\n");

export const FOLLOW_UP_PLAN_HINT = [
    "# Follow-up planning hint",
    "",
    "A prior Proval review already ran on this pull request.",
    "Still cover changed files, but bias units toward paths and behaviors that likely changed since then or that need a regression check.",
    "Do not plan as if this were a brand new PR with no prior feedback.",
].join("\n");
