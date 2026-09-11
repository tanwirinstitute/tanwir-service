/**
 * Checkout question some programs use when one purchase can register more
 * than one person — Taqwa for Teens parents buying for their kids, one
 * checkout, one or more names typed into a single free-text answer. Applied
 * starting the 2026-2027 cycle; older course records won't have it, and
 * most Taqwa for Teens purchases still answer with just one name (one
 * enrollee). Add more recognized key spellings here if another program's
 * checkout form asks the same thing under different wording.
 */
const ENROLLEE_NAMES_KEYS = ["Enter Names Below"];

/**
 * Splits a course's "who is this actually for" answer into individual
 * names — the purchaser (whoever's on the student record/receipt) and the
 * actual enrollee(s) aren't the same person when a parent registers more
 * than one child under a single purchase.
 *
 * Checked against real 2026-2027 Taqwa for Teens data: multiple names are
 * separated by a line break, or occasionally the word "and" inline — never
 * a comma, so a comma inside a single name isn't misread as a separator.
 * Returns [] for a course with no such answer (most courses; also most
 * Taqwa for Teens purchases so far — a bare "First Last" answer just means
 * one enrollee, that name, and callers should fall back to the purchaser's
 * own name in that case).
 */
export function enrolleeNames(formResponses: Record<string, string> | undefined): string[] {
  if (!formResponses) return [];
  for (const key of ENROLLEE_NAMES_KEYS) {
    const raw = formResponses[key];
    if (!raw || !raw.trim()) continue;
    return raw
      .split(/\r?\n|\s+\band\b\s+/i)
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return [];
}
