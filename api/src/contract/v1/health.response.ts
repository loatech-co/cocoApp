import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}

export class ReadinessResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
  @ApiProperty({ enum: ['ok'] })
  db!: 'ok';
}
