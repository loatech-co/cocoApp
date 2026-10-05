import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class ProfileResponse {
  id!: number;
  email!: string;
  display_name!: string | null;
  @ApiProperty({ enum: UserRole })
  role!: UserRole;
  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;
  created_at!: Date;
}

export class SessionResponse {
  access_token!: string;
  /** Seconds until `access_token` expires. */
  expires_in!: number;
  user!: ProfileResponse;
  /** Native clients only (`X-Coco-Cliente: nativo`); the web gets an httpOnly cookie instead. */
  refresh_token?: string;
}

export class RegisterResponse {
  /** Whether an administrator must approve the account before it can sign in. */
  pending_approval!: boolean;
  message!: string;
}
