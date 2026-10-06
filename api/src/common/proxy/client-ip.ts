import type { NextFunction, Request, Response } from 'express';
import { isIP } from 'node:net';

/**
 * Who is calling, seen from behind LiteSpeed.
 *
 * ── Why `trust proxy` ──────────────────────────────────────────────────────
 * In production the API is not reached directly: LiteSpeed accepts the
 * connection and hands the request to the Node process (through `lsnode`, on
 * a local socket). Without `trust proxy`, Express takes `req.ip` from that
 * socket, so every request looks like it comes from the same place —or from
 * nowhere, on a Unix socket—. The rate limiter keys on `req.ip`, so ten failed
 * logins from anyone blocked the login of everyone for a minute, and
 * `audit_log` stored the same address for every event.
 *
 * LiteSpeed appends the address it saw to `X-Forwarded-For`. With one trusted
 * hop Express takes the LAST entry, which is the one LiteSpeed wrote; whatever
 * a client puts in the header itself lands to the left of it and is ignored.
 *
 * ── Why a number and not `true` ────────────────────────────────────────────
 * `true` trusts the whole header, and its first entry is whatever the client
 * typed: the limiter would be keyed on a value the attacker chooses. The count
 * is the number of proxies in front of the API. One is LiteSpeed; if a CDN is
 * ever put in front, it becomes two (`TRUST_PROXY_HOPS`).
 */
const DEFAULT_TRUST_PROXY_HOPS = 1;

export function trustProxyHops(value: string | undefined): number {
  return value === undefined ? DEFAULT_TRUST_PROXY_HOPS : Number(value);
}

/** How many proxy-header samples a process logs before going quiet. */
const SAMPLES = 20;

/**
 * Temporary diagnosis, OFF unless `LOG_PROXY_HEADERS=true`: confirms in
 * production what the hop count above assumes, without ssh.
 *
 * It logs the SHAPE of the headers, never an address: an IP is personal
 * data, and what decides the hop count is how many entries arrive and which
 * one matches `X-Real-IP`, not their values. Only the first requests of each
 * process, so leaving it on by mistake cannot flood the log.
 */
export function proxyHeadersProbe(
  enabled: boolean,
  log: (entry: Record<string, unknown>) => void,
): (req: Request, res: Response, next: NextFunction) => void {
  let left = enabled ? SAMPLES : 0;

  return (req, _res, next) => {
    if (left > 0) {
      left -= 1;
      log({ context: 'proxy', msg: 'proxy_headers', ...proxyHeadersShape(req) });
    }
    next();
  };
}

export function proxyHeadersShape(req: Request): Record<string, unknown> {
  const forwarded = headerValue(req.headers['x-forwarded-for'])
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const realIp = headerValue(req.headers['x-real-ip']).trim();
  const socket = req.socket.remoteAddress;

  return {
    socket: socket === undefined ? 'none' : `ipv${String(isIP(socket))}`,
    forwardedEntries: forwarded.length,
    realIpPresent: realIp !== '',
    realIpIsLastForwarded: realIp !== '' && forwarded.at(-1) === realIp,
    realIpIsFirstForwarded: realIp !== '' && forwarded[0] === realIp,
    reqIpIsLastForwarded: req.ip !== undefined && forwarded.at(-1) === req.ip,
    reqIpPresent: req.ip !== undefined,
  };
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(',') : (value ?? '');
}
