import { Injectable } from '@nestjs/common';

import { HealthRepository } from './health.repository';
import { ServiceUnavailableError } from '../../common/errors/domain-error';

/** `/health`: the process answers. Nothing else is checked. */
export interface LivenessPayload {
  status: 'ok';
}

/** `/ready`: the process can serve requests, because it reaches the database. */
export interface ReadinessPayload {
  status: 'ok';
  db: 'ok';
}

@Injectable()
export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  /**
   * Liveness never touches the database: an unreachable database is a reason
   * to stop sending traffic (`/ready`), not proof that the process is dead.
   * Mixing the two makes a database outage look like a crashed API.
   */
  live(): LivenessPayload {
    return { status: 'ok' };
  }

  async ready(): Promise<ReadinessPayload> {
    if (!(await this.repository.isDatabaseReachable())) {
      throw new ServiceUnavailableError('La base de datos no responde.');
    }
    return { status: 'ok', db: 'ok' };
  }
}
