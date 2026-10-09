import { describe, expect, it } from 'vitest';

import { SECTIONS, ADMIN_SECTIONS } from '@/shared/lib/sections';

/**
 * What someone who is not an administrator sees in the rail.
 *
 * The rail is presentation, not access control —the one that really decides
 * is the API's RolesGuard—, and that is why hiding something here protects
 * nothing: it only stops saying it exists. Hiding what is also each account's
 * OWN leaves that person with no way to reach their things.
 */
describe('The rail sections', () => {
  it('Cost centers is there for everyone', () => {
    // Each account has its own tree and is born with a template: the first
    // thing it will want to do is adjust it. It sat under «Administración»,
    // where non-admins did not see it —even though `/cost-centers` never
    // went through `RequireAdmin`, so they could still open it by typing the
    // address.
    const paths = SECTIONS.map((s) => s.to);

    expect(paths).toContain('/cost-centers');
    expect(ADMIN_SECTIONS.map((s) => s.to)).not.toContain('/cost-centers');
  });

  it('and does not depend on any preference', () => {
    // `requires` is for what may not exist —the accounts, which are turned off
    // from Settings—. A category tree always exists: without it there is
    // nowhere to classify a movement.
    const costCenters = SECTIONS.find((s) => s.to === '/cost-centers');

    expect(costCenters).toBeDefined();
    expect(costCenters?.requires).toBeUndefined();
  });

  it('in Administration only what administers OTHER people remains', () => {
    // It is what makes an administrator one. What administers one's own
    // things —the tree, the settings, the password— does not belong to that group.
    expect(ADMIN_SECTIONS.map((s) => s.to)).toEqual(['/admin', '/admin/audit-log']);
  });
});
