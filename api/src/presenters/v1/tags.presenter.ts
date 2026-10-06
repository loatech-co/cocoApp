import type { Tag } from '../../modules/tags/tags.service';

/** v1 lists the tags whole, with their count. A tag itself was already English. */
export interface TagListV1 {
  data: Tag[];
  meta: { total: number };
}

export function tagListV1(tags: Tag[]): TagListV1 {
  return { data: tags, meta: { total: tags.length } };
}
