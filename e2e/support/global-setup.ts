import { ADMIN_EMAIL, login, register } from './accounts';

/**
 * Registers the admin ONCE, before any worker starts.
 *
 * ── Why not in the worker fixture ───────────────────────────────────────────
 * Each worker registered it, and two of them raced: A created the account in
 * GoTrue and was still inserting its profile when B registered the same
 * e-mail. The API answers an existing e-mail with a 2xx «pending» (it does
 * not reveal which e-mails exist), so B went on to log in BEFORE A's profile
 * existed and got a 403 `account_not_enabled`. Registering here, the profile
 * is in place before anyone logs in.
 *
 * Playwright runs this after `webServer` is up. The login at the end makes a
 * broken admin fail here, with its own message, and not in forty journeys.
 */
export default async function globalSetup(): Promise<void> {
  await register(ADMIN_EMAIL, 'Administración');
  const admin = await login(ADMIN_EMAIL);
  await admin.dispose();
}
