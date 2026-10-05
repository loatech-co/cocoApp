import { Injectable } from '@nestjs/common';

import { HealthRepository } from './health.repository';
import { ServiceUnavailableError } from '../../common/errors/domain-error';

export interface HealthPayload {
  status: 'ok';
  db: 'ok';
}

@Injectable()
export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  async check(): Promise<HealthPayload> {
    if (!(await this.repository.isDatabaseReachable())) {
      throw new ServiceUnavailableError('La base de datos no responde.');
    }
    return { status: 'ok', db: 'ok' };
  }
}
