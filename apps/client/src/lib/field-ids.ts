let seq = 0;

/** Stable unique id for form controls when the parent does not pass `id`. */
export function nextFieldControlId(prefix = 'field') {
    return `${prefix}-${++seq}`;
}
