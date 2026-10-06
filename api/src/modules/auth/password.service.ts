import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { derivesFromPersonalData, evaluatePolicy } from './password.policy';
import { ValidationError } from '../../common/errors/domain-error';

/**
 * Password policy.
 *
 * ── Why it still exists after moving to Supabase Auth ────────────────────────
 * Supabase stores and checks the credentials, but its default policy is
 * minimal: a length and little else. This one stays because it checks three
 * things Supabase's does not: our own length and composition, that the
 * password does not derive from the person's name or email, and —the one
 * that matters most— that it does not appear in known public breaches.
 *
 * It is checked BEFORE the password is sent to Supabase. If it fails,
 * Supabase never hears of it: the account is never created with a password
 * that is already in an attack dictionary.
 *
 * What NO longer lives here is hashing. The credentials belong to Supabase and
 * this class touches no hash: no argon2, no timing decoys, nothing to verify.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly checkBreaches: boolean;

  constructor(config: ConfigService) {
    // It can be switched off for environments without internet access (CI, tests).
    this.checkBreaches = config.get<string>('CHECK_BREACHED_PASSWORDS', 'true') !== 'false';
  }

  /**
   * Checks a candidate password against the three layers: composition,
   * relation to the account's data, and known breaches.
   */
  async requireStrong(
    password: string,
    personal: { email?: string | undefined; displayName?: string | undefined } = {},
  ): Promise<void> {
    const { isValid, problems } = evaluatePolicy(password);

    if (derivesFromPersonalData(password, personal)) {
      problems.push('No puede contener tu nombre ni tu correo.');
    }

    if (isValid && problems.length === 0 && (await this.appearsInBreaches(password))) {
      problems.push('Esta contraseña aparece en filtraciones públicas conocidas. Elige otra.');
    }

    if (problems.length > 0) {
      throw new ValidationError('La contraseña no cumple los requisitos.', {
        code: 'weak_password',
        details: problems.map((problem) => ({ field: 'password', message: problem })),
      });
    }
  }

  /**
   * Queries Have I Been Pwned with k-anonymity.
   *
   * Only the first 5 characters of the SHA-1 travel: the service returns every
   * suffix that starts that way (hundreds) and the comparison happens here.
   * Neither the password nor its full hash ever leaves this process.
   *
   * It fails OPEN on purpose: if the service is down, sign-up is not blocked.
   * Losing availability over a complementary check would be worse than
   * accepting a password that already passed the other two layers.
   */
  private async appearsInBreaches(password: string): Promise<boolean> {
    if (!this.checkBreaches) return false;

    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) return false;

      const body = await response.text();
      return body.split('\n').some((line) => line.split(':')[0]?.trim().toUpperCase() === suffix);
    } catch {
      this.logger.warn('No se pudo consultar la base de contraseñas filtradas; se omite.');
      return false;
    }
  }
}
