import { ApiProperty } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';

export class AuditUserResponse {
  email!: string;
  name!: string | null;
}

export class AuditEntryResponse {
  id!: number;
  action!: string;
  entity!: string;
  entity_id!: number | null;
  user!: AuditUserResponse | null;
  @ApiProperty({ description: 'What changed, as it was recorded: any JSON value.', nullable: true })
  changes!: Prisma.JsonValue;
  ip!: string | null;
  created_at!: Date;
}
