import { Inject, Injectable } from '@nestjs/common';
import type { Client } from '@openfeature/server-sdk';

import { FLAG_NAMES, type FlagName } from '@coco/flags';

/** The OpenFeature client bound to Coco's provider (see `flags.module.ts`). */
export const FLAG_CLIENT = Symbol('FLAG_CLIENT');

/**
 * The flags a user has on. Code that branches on a flag asks here; it only
 * ever talks to OpenFeature's client, so swapping the provider for a vendor
 * one does not touch a single call site.
 */
@Injectable()
export class FlagsService {
  constructor(@Inject(FLAG_CLIENT) private readonly client: Client) {}

  isEnabled(name: FlagName, userId: bigint): Promise<boolean> {
    return this.client.getBooleanValue(name, false, { targetingKey: userId.toString() });
  }

  /**
   * Every registered flag that is on for this user, for `/auth/me`.
   *
   * One evaluation per flag, each reading the user's preferences: the
   * registry is a handful of short-lived flags by rule, so that is a handful
   * of indexed reads, not worth a cache.
   */
  async activeFor(userId: bigint): Promise<FlagName[]> {
    const values = await Promise.all(FLAG_NAMES.map((name) => this.isEnabled(name, userId)));
    return FLAG_NAMES.filter((_, index) => values[index]);
  }
}
