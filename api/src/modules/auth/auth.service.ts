import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { FlagName } from '@coco/flags';

import { PasswordService } from './password.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { UsersRepository } from './users.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticationError, ForbiddenError } from '../../common/errors/domain-error';
import type { Prisma, User } from '../../generated/prisma/client';
import { CategoriesService } from '../categories/categories.service';

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** A user's public profile, as the service hands it out (the domain). */
export interface Profile {
  id: bigint;
  email: string;
  displayName: string | null;
  role: User['role'];
  status: User['status'];
  createdAt: Date;
}

/** What `/auth/me` answers: the profile plus the flags on for this user (step 7.8). */
export type Me = Profile & { features: FlagName[] };

/** What the controller needs to answer and set the cookie. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * The app's authentication.
 *
 * ── Who does what after moving to Supabase Auth ──────────────────────────────
 * Supabase stores the credentials, checks them, and issues and rotates the
 * tokens. Everything that belongs to the PRODUCT and that Supabase does not
 * model stays here:
 *
 *   · Approval by an admin. Every account is born `pending` and cannot sign in
 *     until someone activates it. Supabase would accept any account with a
 *     confirmed email.
 *   · The audit log. Every sign-in, sign-out and failure is recorded with IP
 *     and agent, which in a finance app is part of the product.
 *   · Immediate revocation, through `sessions_valid_from`.
 *   · The password policy, which is stricter than Supabase's.
 *
 * What WAS lost, and is worth knowing: the login's resistance to timing
 * attacks. An equivalent argon2 used to be spent when the email did not
 * exist, so the response time would not give away which emails have an
 * account. Verification now happens inside Supabase and that control is no
 * longer ours. Registration keeps the equivalent: Supabase is always called,
 * whether the email exists or not, and the answer is identical in both cases.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly initialAdminEmail: string | null;

  constructor(
    private readonly users: UsersRepository,
    private readonly categories: CategoriesService,
    private readonly supabase: SupabaseAuthService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.initialAdminEmail =
      config.get<string>('BOOTSTRAP_ADMIN_EMAIL')?.trim().toLowerCase() || null;
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Creates the account in Supabase and its profile here, as `pending`.
   *
   * It ALWAYS returns the same result, whether the email exists or not.
   * Answering "that email is already registered" would turn this endpoint into
   * an oracle for finding out who has an account. Since every account waits
   * for approval, the legitimate user loses nothing: they wait either way.
   *
   * The exception is `BOOTSTRAP_ADMIN_EMAIL`, which is born admin and active.
   * It is done this way, and not "the first sign-up wins", because if the app
   * were deployed before the owner signed up, anyone would walk off with the
   * panel.
   */
  async register(
    input: { email: string; password: string; displayName: string },
    context: RequestContext,
  ): Promise<{ isPendingApproval: boolean }> {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();

    // The policy is ALWAYS checked, before looking at whether the email
    // exists: if it were only checked for new emails, the response time would
    // give them away.
    await this.passwords.requireStrong(input.password, { email, displayName });

    // Decided BEFORE Supabase, and for every email, so the timing gives
    // nothing away: once any admin exists the database refuses the app a
    // second one (ADR 0027), and the bootstrap address signs up like anyone
    // else, pending approval. Asking afterwards would leave a credential in
    // Supabase with no profile.
    const isInitialAdmin = this.initialAdminEmail === email && !(await this.users.hasAnyAdmin());

    // Supabase is called whether the email exists or not, so the response
    // takes the same time in both cases. It returns null if it already existed.
    const authId = await this.supabase.createUser(email, input.password);

    if (!authId) {
      this.logger.warn('Sign-up attempt with an email that already exists.');
      return { isPendingApproval: true };
    }

    const user = await this.createProfileOrUndo(authId, {
      authId,
      email,
      displayName,
      role: isInitialAdmin ? 'admin' : 'user',
      status: isInitialAdmin ? 'active' : 'pending',
      approvedAt: isInitialAdmin ? new Date() : null,
      // Explicit, not the engine's DEFAULT. The guard compares this value
      // against the `iat` of the token Supabase issues; if Postgres's clock
      // set one and Supabase's the other, a few milliseconds of skew between
      // the clocks would invalidate legitimate sessions.
      sessionsValidFrom: toSecond(new Date()),
    });

    /*
      ── The account is born with its structure ────────────────────────────
      Cost centers belong to each account and are not shared, so a brand-new
      account has NONE: on signing in, Cost centers was empty and a
      transaction's sheet had nowhere to classify anything. The template is
      copied —the first two levels, frozen— and from then on the tree is
      theirs.

      It is done here and not on approval because the row already exists here,
      and because a rejected account takes its categories with it through the
      cascading delete: nothing is left dangling.

      ── And if it fails, the account is created anyway ────────────────────
      Seeding is a convenience; signing up is the operation. Failing here would
      leave the person with their user already created in Supabase —so
      retrying would be useless, the email «already exists»— and with no
      profile, which is the one state there is no way out of alone. The tree
      can be filled later from `POST /categories/seed`.
    */
    try {
      await this.categories.seedNewAccount(user.id);
    } catch (error) {
      this.logger.error(
        `Could not seed the template for account ${user.id}: ${(error as Error).message}`,
      );
    }

    await this.audit.record({
      userId: user.id,
      entity: 'users',
      entityId: user.id,
      action: 'auth.register',
      changes: { role: user.role, status: user.status },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { isPendingApproval: user.status === 'pending' };
  }

  /**
   * Creates the profile of a credential that was just created in Supabase,
   * and if that fails, deletes the credential again. Left behind, it would be
   * the one state with no way out: retrying says «already exists» and there
   * is no profile to approve. Two bootstraps racing, or a legacy row with the
   * same email, are what still get here.
   */
  private async createProfileOrUndo(authId: string, data: Prisma.UserCreateInput): Promise<User> {
    try {
      return await this.users.create(data);
    } catch (error) {
      try {
        await this.supabase.deleteUser(authId);
      } catch (undoError) {
        this.logger.error(
          `Profile creation failed and its Supabase credential could not be deleted: ${(undoError as Error).message}`,
        );
      }
      throw error;
    }
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  /**
   * Checks the credentials against Supabase and opens a session.
   *
   * Deliberate order: the password first, THEN the account's status. That way
   * the specific messages ("pending approval", "suspended") are only seen by
   * someone who has already shown they know the password. The other way
   * round, anyone could find out which emails have an account.
   */
  async signIn(
    input: { email: string; password: string },
    context: RequestContext,
  ): Promise<{ tokens: TokenPair; profile: Profile }> {
    const email = normalizeEmail(input.email);
    const session = await this.supabase.signIn(email, input.password);

    if (!session) {
      await this.audit.record({
        entity: 'users',
        action: 'auth.login_failed',
        changes: { reason: 'invalid_credentials' },
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new AuthenticationError('Correo o contraseña incorrectos.', {
        code: 'invalid_credentials',
      });
    }

    const user = await this.users.findByAuthId(session.authId);

    if (!user) {
      // The account exists in Supabase but has no profile here. It happens
      // when it was created from the Supabase dashboard, skipping the app's
      // sign-up. Without a profile there is no role or status, so nothing can
      // be authorized.
      this.logger.error(`Supabase account ${session.authId} has no profile in the app.`);
      throw new ForbiddenError('Tu cuenta no está habilitada. Contacta al administrador.', {
        code: 'account_not_enabled',
      });
    }

    this.requireUsableAccount(user);

    // If the revocation mark ended up ahead of the token Supabase just issued,
    // it is lowered to it. It happens when signing in again in the same second
    // every session was closed: without this, the login would look fine and
    // the next request would get a 401.
    //
    // Lowering it can only revive tokens issued in THAT second, and only when
    // someone has just shown they know the password. Anything before that
    // second stays dead.
    const signedInAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const stamp = user.sessionsValidFrom > signedInAt ? signedInAt : user.sessionsValidFrom;

    const updated = await this.users.update(user.id, {
      lastLoginAt: new Date(),
      sessionsValidFrom: stamp,
    });

    await this.audit.record({
      userId: updated.id,
      entity: 'users',
      entityId: updated.id,
      action: 'auth.login',
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { tokens: toTokenPair(session), profile: profileOf(updated) };
  }

  // ── Session ────────────────────────────────────────────────────────────────

  async refresh(
    refreshToken: string,
    _context: RequestContext,
  ): Promise<{ tokens: TokenPair; profile: Profile }> {
    const session = await this.supabase.refresh(refreshToken);
    if (!session)
      throw new AuthenticationError('La sesión expiró. Vuelve a entrar.', {
        code: 'session_expired',
      });

    const user = await this.users.findByAuthId(session.authId);
    if (!user)
      throw new AuthenticationError('La sesión ya no es válida.', { code: 'session_revoked' });

    // The status is checked on refresh too: a suspended account must not be
    // able to stretch its session forever by trading one token for another.
    //
    // Here it is 401 and not 403, unlike the login. At login the person has
    // just shown they know the password and deserves to know WHY they cannot
    // get in. On refresh nobody is watching: it is the client renewing in the
    // background, and a 401 tells it "this session died, send them to sign in
    // again". A 403 would leave it retrying against a session that will not
    // come back.
    if (user.status !== 'active') {
      throw new AuthenticationError('La sesión ya no es válida.', { code: 'session_revoked' });
    }

    return { tokens: toTokenPair(session), profile: profileOf(user) };
  }

  async signOut(refreshToken: string | undefined, context: RequestContext): Promise<void> {
    if (!refreshToken) return;

    const session = await this.supabase.refresh(refreshToken);
    await this.supabase.signOut(refreshToken);

    if (!session) return;
    const user = await this.users.findByAuthId(session.authId);
    if (!user) return;

    await this.audit.record({
      userId: user.id,
      entity: 'users',
      entityId: user.id,
      action: 'auth.logout',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /** Signs out on every device, at once. */
  async signOutEverywhere(userId: bigint, context: RequestContext): Promise<void> {
    await this.revokeAllSessions(userId);
    await this.audit.record({
      userId,
      entity: 'users',
      entityId: userId,
      action: 'auth.logout_all',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  // ── Password ───────────────────────────────────────────────────────────────

  /**
   * A password change by the user themselves.
   *
   * It requires the current one: if the access token were enough, whoever
   * stole one could take over the account by changing it. When done it closes
   * every session — the attacker's included, if there is one.
   */
  async changePassword(
    userId: bigint,
    input: { currentPassword: string; newPassword: string },
    context: RequestContext,
  ): Promise<void> {
    const user = await this.users.findByIdOrThrow(userId);
    if (!user.authId) {
      throw new ForbiddenError('Esta cuenta no tiene credenciales gestionadas.', {
        code: 'credentials_not_managed',
      });
    }

    if (!(await this.supabase.isPasswordCorrect(user.email, input.currentPassword))) {
      throw new AuthenticationError('La contraseña actual no es correcta.', {
        code: 'wrong_current_password',
      });
    }

    await this.passwords.requireStrong(input.newPassword, {
      email: user.email,
      displayName: user.displayName ?? undefined,
    });

    await this.supabase.changePassword(user.authId, input.newPassword);
    await this.revokeAllSessions(userId);

    await this.audit.record({
      userId,
      entity: 'users',
      entityId: userId,
      action: 'auth.password_changed',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async getProfile(userId: bigint): Promise<Profile> {
    return profileOf(await this.users.findByIdOrThrow(userId));
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /**
   * Cuts the sessions on BOTH sides.
   *
   * `sessionsValidFrom` takes effect on the next request without going to the
   * network, and it is what makes suspending an account instant. Revoking in
   * Supabase too is what stops a stolen refresh token from still being traded
   * for new tokens. Doing only one of the two leaves a hole: the first without
   * the second allows refreshing forever; the second without the first leaves
   * the current access token alive until it expires.
   */
  async revokeAllSessions(userId: bigint): Promise<void> {
    const user = await this.users.update(userId, {
      sessionsValidFrom: toNextSecond(new Date()),
    });

    if (user.authId) {
      await this.supabase.signOutEverywhere(user.authId);
    }
  }

  private requireUsableAccount(user: User): void {
    if (user.status === 'pending') {
      throw new ForbiddenError(
        'Tu cuenta está pendiente de aprobación. Te avisaremos cuando esté lista.',
        { code: 'account_pending_approval' },
      );
    }
    if (user.status === 'suspended') {
      throw new ForbiddenError('Tu cuenta está suspendida. Contacta al administrador.', {
        code: 'account_suspended',
      });
    }
  }
}

/** Lowercase and trimmed: `Ana@X.com ` and `ana@x.com` are the same account. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function profileOf(user: User): Profile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

/**
 * Truncates an instant to the second. Every comparison with
 * `sessionsValidFrom` happens in this unit because a JWT's `iat` has no more
 * precision: if milliseconds were stored here, a token issued in the same
 * second would look OLDER than its own session and the guard would reject it
 * the moment it was born.
 */
function toSecond(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / 1000) * 1000);
}

/**
 * The first instant a new session can have to count as later than a
 * revocation: the NEXT second.
 *
 * Pointing at the current second would leave alive the tokens issued in that
 * same second —exactly the window someone with a stolen token needs—, so it
 * rounds up. The price is an edge of under a second when signing in again,
 * which `signIn` handles.
 */
function toNextSecond(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / 1000) * 1000 + 1000);
}

function toTokenPair(session: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): TokenPair {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
  };
}
