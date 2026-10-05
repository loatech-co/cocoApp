import { ApiProperty } from '@nestjs/swagger';

import { FLAG_NAMES, type FlagName } from '@coco/flags';

export const USER_ROLES = ['admin', 'user'] as const;
export const USER_STATUSES = ['pending', 'active', 'suspended'] as const;

export class Profile {
  id!: number;
  email!: string;
  displayName!: string | null;
  @ApiProperty({ enum: USER_ROLES })
  role!: (typeof USER_ROLES)[number];
  @ApiProperty({ enum: USER_STATUSES })
  status!: (typeof USER_STATUSES)[number];
  createdAt!: Date;
}

/** `GET /auth/me`: the profile and the feature flags on for this user. */
export class Me extends Profile {
  @ApiProperty({ enum: FLAG_NAMES, isArray: true })
  features!: FlagName[];
}

export class Session {
  accessToken!: string;
  /** Seconds until `accessToken` expires. */
  expiresIn!: number;
  user!: Profile;
  /** Native clients only (`X-Coco-Client: native`); the web gets an httpOnly cookie instead. */
  refreshToken?: string;
}

export class Registration {
  /** Whether an administrator must approve the account before it can sign in. */
  pendingApproval!: boolean;
  /** In Spanish: the client shows it as is. */
  message!: string;
}

export class AuditUser {
  email!: string;
  name!: string | null;
}

export class AuditEntry {
  id!: number;
  action!: string;
  entity!: string;
  entityId!: number | null;
  user!: AuditUser | null;
  @ApiProperty({
    description: 'What changed, exactly as it was recorded: not translated to v2 names.',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  changes!: unknown;
  ip!: string | null;
  createdAt!: Date;
}
