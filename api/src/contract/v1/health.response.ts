import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
  /** Short SHA of the deployed commit, or `unknown` without a repository. */
  @ApiProperty({ example: 'a1b2c3d' })
  version!: string;
}

export class ReadinessResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
  @ApiProperty({ enum: ['ok'] })
  db!: 'ok';
}
