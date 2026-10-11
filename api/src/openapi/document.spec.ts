import type { INestApplication } from '@nestjs/common';

import { setupApiDocs } from './document';

describe('setupApiDocs', () => {
  it('serves nothing in production', () => {
    // Any use of the app would throw: in production it must not be touched.
    const app = new Proxy({} as INestApplication, {
      get: () => {
        throw new Error('the app was used in production');
      },
    });

    expect(setupApiDocs(app, { NODE_ENV: 'production' })).toBe(false);
  });

  it('reads production through the quotes the server leaves in NODE_ENV', () => {
    const app = new Proxy({} as INestApplication, {
      get: () => {
        throw new Error('the app was used in production');
      },
    });

    expect(setupApiDocs(app, { NODE_ENV: '"production"' })).toBe(false);
    expect(setupApiDocs(app, { NODE_ENV: "'production'" })).toBe(false);
  });
});
