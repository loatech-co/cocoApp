import { chosenStore, createReceiptStore, SupabaseReceiptStore } from './receipt-store';

describe('receipt store', () => {
  const saved = process.env.RECEIPTS_STORAGE;
  afterEach(() => {
    if (saved === undefined) delete process.env.RECEIPTS_STORAGE;
    else process.env.RECEIPTS_STORAGE = saved;
    jest.restoreAllMocks();
  });

  it('defaults to Supabase in production and disk elsewhere; RECEIPTS_STORAGE decides when set', () => {
    delete process.env.RECEIPTS_STORAGE;
    expect(chosenStore({ NODE_ENV: 'production' })).toBe('supabase');
    expect(chosenStore({ NODE_ENV: 'development' })).toBe('disk');
    process.env.RECEIPTS_STORAGE = 'disk';
    expect(chosenStore({ NODE_ENV: 'production' })).toBe('disk');
  });

  it('talks to the private bucket with the service key, keeping the key’s slash', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const store = new SupabaseReceiptStore('https://x.supabase.co/', 'service-key', 'soportes');

    await store.exists('12/abc.png');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://x.supabase.co/storage/v1/object/soportes/12/abc.png');
    expect(init?.method).toBe('HEAD');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer service-key');
  });

  it('refuses a PUBLIC bucket at start-up', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ public: true }), { status: 200 }));
    const store = new SupabaseReceiptStore('https://x.supabase.co', 'k', 'soportes');

    expect((await store.check()).isReady).toBe(false);
  });

  it('a missing object is a null stream, not an error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 400 }));
    const store = new SupabaseReceiptStore('https://x.supabase.co', 'k', 'soportes');

    expect(await store.open('1/none.png')).toBeNull();
  });

  describe('SupabaseReceiptStore', () => {
    const store = new SupabaseReceiptStore('https://x.supabase.co', 'k', 'soportes');
    const reply = (body: BodyInit | null, status: number) =>
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body, { status }));

    it('names its bucket and host without the key', () => {
      expect(store.describe()).toBe('supabase bucket "soportes" at x.supabase.co');
    });

    it('reports an unreachable bucket and accepts a private one', async () => {
      reply(null, 404);
      expect(await store.check()).toEqual({
        isReady: false,
        detail: 'bucket "soportes": HTTP 404',
      });
      reply(JSON.stringify({ public: false }), 200);
      expect(await store.check()).toEqual({ isReady: true, detail: 'bucket "soportes" (private)' });
    });

    it('never overwrites an object and fails when storage refuses it', async () => {
      const fetchMock = reply(null, 200);
      await store.save('1/a.png', Buffer.from('x'), 'image/png');
      expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>)['x-upsert']).toBe(
        'false',
      );

      reply('duplicate', 409);
      await expect(store.save('1/a.png', Buffer.from('x'), 'image/png')).rejects.toThrow(
        'Storage refused 1/a.png: HTTP 409 duplicate',
      );
    });

    it('streams an object that exists', async () => {
      reply('bytes', 200);
      const stream = await store.open('1/a.png');
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk as Uint8Array));
      expect(Buffer.concat(chunks).toString()).toBe('bytes');
    });

    it('deletes by prefix, skips an empty list and fails loudly', async () => {
      const fetchMock = reply(null, 200);
      await store.remove([]);
      expect(fetchMock).not.toHaveBeenCalled();

      await store.remove(['1/a.png']);
      expect(fetchMock.mock.calls[0]![1]?.body).toBe(JSON.stringify({ prefixes: ['1/a.png'] }));

      reply(null, 500);
      await expect(store.remove(['1/a.png'])).rejects.toThrow('HTTP 500');
    });
  });

  describe('createReceiptStore', () => {
    const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RECEIPTS_BUCKET'] as const;
    const before = keys.map((k) => process.env[k]);
    afterEach(() => {
      keys.forEach((k, i) => {
        if (before[i] === undefined) Reflect.deleteProperty(process.env, k);
        else process.env[k] = before[i];
      });
    });

    it('builds the disk store outside production', () => {
      process.env.RECEIPTS_STORAGE = 'disk';
      expect(createReceiptStore({}).describe()).toMatch(/^disk /);
    });

    it('needs the Supabase url and key to build the bucket store', () => {
      process.env.RECEIPTS_STORAGE = 'supabase';
      Reflect.deleteProperty(process.env, 'SUPABASE_URL');
      expect(() => createReceiptStore({})).toThrow(/needs SUPABASE_URL/);

      process.env.SUPABASE_URL = 'https://x.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
      Reflect.deleteProperty(process.env, 'RECEIPTS_BUCKET');
      expect(createReceiptStore({}).describe()).toContain('"soportes"');
    });
  });
});
