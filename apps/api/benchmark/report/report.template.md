# Proval benchmark

{{runTable}}

{{progressTable}}

{{statusTable}}

## Review speed by size

{{groupTable}}

Latency and token statistics use completed attempts. Group latency is the median of the PR medians.

## PR result

{{caseTable}}

Size uses added plus deleted lines. S up to 100, M up to 500, L up to 2000, XL above 2000. BZ means zero text change. A dash means unavailable data.

<details>
<summary>Phase timing and token usage</summary>

### Phase timing

{{phaseTable}}

Preparation is outside review timing. Parallel review is wall time across the sub agent group.

### Token usage

{{tokenTable}}

Values are medians per completed attempt and include compression usage. Request count includes successful sender calls.

</details>

## Non completed attempt

{{issueTable}}

Elapsed time here can include partial execution and is excluded from the speed summary.
