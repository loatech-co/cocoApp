import { chosenStore, SupabaseReceiptStore } from './receipt-store';

describe('receipt store', () => {
  const saved = process.env.SOPORTES_STORAGE;
  afterEach(() => {
    if (saved === undefined) delete process.env.SOPORTES_STORAGE;
    else process.env.SOPORTES_STORAGE = saved;
    jest.restoreAllMocks();
  });

  it('defaults to Supabase in production and disk elsewhere; SOPORTES_STORAGE decides when set', () => {
    delete process.env.SOPORTES_STORAGE;
    expect(chosenStore({ NODE_ENV: 'production' })).toBe('supabase');
    expect(chosenStore({ NODE_ENV: 'development' })).toBe('disk');
    process.env.SOPORTES_STORAGE = 'disk';
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

    expect((await store.check()).ok).toBe(false);
  });

  it('a missing object is a null stream, not an error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 400 }));
    const store = new SupabaseReceiptStore('https://x.supabase.co', 'k', 'soportes');

    expect(await store.open('1/none.png')).toBeNull();
  });
});
