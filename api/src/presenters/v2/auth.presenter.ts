import type { Me, TokenPair, Profile } from '../../modules/auth/auth.service';

/** v2 bodies of the session and the profile (see `transactions.presenter.ts`). */

export interface SessionV2 {
  accessToken: string;
  expiresIn: number;
  user: Profile;
  /** Only for a native client. The web never gets it in the body. */
  refreshToken?: string;
}

export function profileV2(profile: Profile): Profile {
  return profile;
}

export function meV2(me: Me): Me {
  return me;
}

/** The session; the refresh token goes in the body only for a native client. */
export function sessionV2(
  tokens: TokenPair,
  profile: Profile,
  shouldIncludeRefreshToken: boolean,
): SessionV2 {
  const session: SessionV2 = {
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    user: profileV2(profile),
  };
  return shouldIncludeRefreshToken ? { ...session, refreshToken: tokens.refreshToken } : session;
}
