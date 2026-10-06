import type { Me, TokenPair, Profile } from '../../modules/auth/auth.service';

export interface ProfileV1 {
  id: bigint;
  email: string;
  display_name: string | null;
  role: Profile['role'];
  status: Profile['status'];
  created_at: Date;
}

export type MeV1 = ProfileV1 & { features: Me['features'] };

export interface SessionV1 {
  access_token: string;
  expires_in: number;
  user: ProfileV1;
  /** Solo para un cliente nativo. La web nunca lo recibe en el cuerpo. */
  refresh_token?: string;
}

export function profileV1(p: Profile): ProfileV1 {
  return {
    id: p.id,
    email: p.email,
    display_name: p.displayName,
    role: p.role,
    status: p.status,
    created_at: p.createdAt,
  };
}

export function meV1(me: Me): MeV1 {
  return { ...profileV1(me), features: me.features };
}

/** The session; the refresh token goes in the body only for a native client. */
export function sessionV1(tokens: TokenPair, profile: Profile, inBody: boolean): SessionV1 {
  const session: SessionV1 = {
    access_token: tokens.accessToken,
    expires_in: tokens.expiresIn,
    user: profileV1(profile),
  };
  return inBody ? { ...session, refresh_token: tokens.refreshToken } : session;
}
