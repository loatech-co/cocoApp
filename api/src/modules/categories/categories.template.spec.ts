import { NEW_ACCOUNT_TEMPLATE, type TemplateNode } from './categories.template';
import { MAX_DEPTH } from '../../common/categories/categories.tree';

/**
 * The template an account is born with.
 *
 * It is a hand-edited file, and what is written wrong here does not fail
 * while writing it: it fails when creating someone's account, with the
 * registration done and the user already created in Supabase. By then there
 * is no clean way to retry. That is why these checks run on the data, not on
 * the function that copies it.
 */
function walk(
  nodes: readonly TemplateNode[],
  visit: (node: TemplateNode, level: number) => void,
  level = 1,
): void {
  for (const node of nodes) {
    visit(node, level);
    if (node.children) walk(node.children, visit, level + 1);
  }
}

describe('The template of a new account', () => {
  it('does not go past the three levels the tree allows', () => {
    let deepest = 0;
    walk(NEW_ACCOUNT_TEMPLATE, (_, level) => {
      deepest = Math.max(deepest, level);
    });

    // The service rejects a fourth level when creating the category, so the
    // account would be born half done: with the cost centers in and the extra
    // branch out.
    expect(deepest).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('reaches the categories and not the concepts', () => {
    // The third level is one specific person's commitments —their daughter's
    // school, who rents to them, which day they pay—, and copying them into
    // every new account would hand out private information. If it ever comes
    // in, let it be by a decision and not by an oversight: this test forces
    // deleting it.
    let deepest = 0;
    walk(NEW_ACCOUNT_TEMPLATE, (_, level) => {
      deepest = Math.max(deepest, level);
    });

    expect(deepest).toBe(2);
  });

  it('only the first level says whether it is static', () => {
    // `isStatic` is read from the COST CENTER: set on a category it does
    // nothing, and whoever wrote it there would think they had protected
    // something that is not protected.
    const offenders: string[] = [];
    walk(NEW_ACCOUNT_TEMPLATE, (node, level) => {
      if (level > 1 && node.isStatic !== undefined) offenders.push(node.name);
    });

    expect(offenders).toEqual([]);
  });

  it('no name is empty or repeated among siblings', () => {
    const duplicates: string[] = [];

    const check = (nodes: readonly TemplateNode[]): void => {
      const seen = new Set<string>();
      for (const node of nodes) {
        expect(node.name.trim()).not.toBe('');
        // Two siblings with the same name cannot be told apart in a
        // transaction's dropdown: there is no way to know which was chosen.
        if (seen.has(node.name)) duplicates.push(node.name);
        seen.add(node.name);
        if (node.children) check(node.children);
      }
    };

    check(NEW_ACCOUNT_TEMPLATE);
    expect(duplicates).toEqual([]);
  });

  it('every cost center brings at least one category', () => {
    // An empty cost center is not a starting point: it is a place where
    // nothing can be classified until someone creates something inside.
    for (const costCenter of NEW_ACCOUNT_TEMPLATE) {
      expect(costCenter.children?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
