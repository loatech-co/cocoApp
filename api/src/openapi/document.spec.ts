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

    expect(setupApiDocs(app, 'production')).toBe(false);
  });
});
