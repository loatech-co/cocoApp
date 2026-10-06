/**
 * The structure an account is born with.
 *
 * ── Each account has ITS OWN ────────────────────────────────────────────────
 * Cost centers are not shared between accounts: each `categories` row carries
 * its `user_id` and every query filters by it. This is not a live copy of
 * anybody's structure — it is a starting point copied ONCE, when the account
 * is created, and from then on it is theirs: they rename, add and delete
 * without touching anyone else.
 *
 * ── And it is a SNAPSHOT, not a mirror ──────────────────────────────────────
 * What is below was taken from the real structure of 17 September 2026, and
 * it stayed put. What is created from now on in an account does not appear in
 * the ones that come later: to make it appear, it has to be written here. It
 * is on purpose —a template that stayed alive would turn any experiment into
 * mandatory structure for everybody— and it is why this is a versioned file
 * and not a query.
 *
 * ── Why it reaches the CATEGORIES and not the concepts ──────────────────────
 * Because the first two levels are taxonomy —«Servicios públicos»,
 * «Vehículos»— and the third is one specific person's commitments: the name
 * of their daughter's school, of whoever rents to them, how much and which
 * day they pay. That is not a starting point for anyone else; it is private
 * information that would have been copied into every new account.
 *
 * For the same reason neither the recurrence nor the keywords are copied:
 * both live in the concept, which is the level that does not travel.
 */
export interface TemplateNode {
  name: string;
  /** A lucide name. The only allowed set. */
  icon?: string;
  /**
   * Only on the first level, and only read from there: what hangs from a
   * static cost center is not reclassified from the table or the form.
   */
  isStatic?: boolean;
  children?: readonly TemplateNode[];
}

export const NEW_ACCOUNT_TEMPLATE: readonly TemplateNode[] = [
  {
    name: 'Costos fijos',
    // Static because it is the structure nobody improvises: the rent does not
    // change category on a Tuesday.
    isStatic: true,
    children: [
      { name: 'Educación', icon: 'graduation-cap' },
      { name: 'Vivienda', icon: 'house' },
      { name: 'Familia', icon: 'users' },
      { name: 'Salud y vida', icon: 'heart-pulse' },
      { name: 'Servicios públicos', icon: 'droplet' },
      { name: 'Vehículos', icon: 'car' },
    ],
  },
  {
    name: 'Costos variables',
    children: [{ name: 'Licencias', icon: 'credit-card' }],
  },
];
