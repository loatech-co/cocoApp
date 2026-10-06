import { ApiProperty } from '@nestjs/swagger';

export class Liveness {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
  /** Short SHA of the deployed commit, or `unknown` without a repository. */
  @ApiProperty({ example: 'a1b2c3d' })
  version!: string;
}

export class Readiness {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
  @ApiProperty({ enum: ['ok'] })
  db!: 'ok';
}

export class Preferences {
  /** Whether this user keeps accounts at all. */
  accountsEnabled!: boolean;
}

/** A receipt's record, without the file itself. */
export class Receipt {
  id!: number;
  /** Order among the transaction's receipts. */
  position!: number;
  fileName!: string;
  mimeType!: string;
  sizeBytes!: number;
  /** Whether the file is actually in the store. */
  isAvailable!: boolean;
}

export class Tag {
  id!: number;
  name!: string;
  color!: string | null;
}
