import type { Request } from 'express';

import {
  logsProxyHeaders,
  proxyHeadersProbe,
  proxyHeadersShape,
  trustProxyHops,
} from './client-ip';

function request(headers: Record<string, string>, ip?: string): Request {
  return { headers, ip, socket: { remoteAddress: undefined } } as unknown as Request;
}

describe('client ip behind LiteSpeed', () => {
  it('trusts one proxy unless told otherwise', () => {
    expect(trustProxyHops({})).toBe(1);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
  });

  it('reads the hop count and the probe switch with the quotes the server adds', () => {
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '"1"' })).toBe(1);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: "'2'" })).toBe(2);
    expect(logsProxyHeaders({ LOG_PROXY_HEADERS: '"true"' })).toBe(true);
    expect(logsProxyHeaders({ LOG_PROXY_HEADERS: 'true' })).toBe(true);
    expect(logsProxyHeaders({})).toBe(false);
  });

  it('describes the proxy headers without writing any address', () => {
    const shape = proxyHeadersShape(
      request(
        { 'x-forwarded-for': '198.51.100.7, 203.0.113.9', 'x-real-ip': '203.0.113.9' },
        '203.0.113.9',
      ),
    );

    expect(shape).toEqual({
      socket: 'none',
      forwardedEntries: 2,
      realIpPresent: true,
      realIpIsLastForwarded: true,
      realIpIsFirstForwarded: false,
      reqIpIsLastForwarded: true,
      reqIpPresent: true,
    });
    expect(JSON.stringify(shape)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it('logs nothing unless switched on, and stops after a few samples', () => {
    const next = jest.fn();
    const off = jest.fn();
    proxyHeadersProbe(false, off)(request({}), {} as never, next);
    expect(off).not.toHaveBeenCalled();

    const on = jest.fn();
    const probe = proxyHeadersProbe(true, on);
    for (let i = 0; i < 30; i += 1) probe(request({}), {} as never, next);
    expect(on).toHaveBeenCalledTimes(20);
    expect(next).toHaveBeenCalledTimes(31);
  });
});
