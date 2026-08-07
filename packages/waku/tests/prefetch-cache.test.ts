import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREFETCH_ERROR_TTL,
  PREFETCH_LIMIT,
  PREFETCH_TTL,
  createPrefetchManager,
  type PrefetchOptions,
} from '../src/router/client-utils/prefetch-cache.js';

type PrefetchManager = ReturnType<typeof createPrefetchManager>;

type Elements = Record<string, unknown>;

const pending = () => new Promise<Elements>(() => {});

const settle = async (
  manager: PrefetchManager,
  rscPath: string,
  query: string,
  elements: Elements,
) => {
  let resolveFetch: (value: Elements) => void = () => {};
  manager.prefetch(
    rscPath,
    query,
    () =>
      new Promise<Elements>((resolve) => {
        resolveFetch = resolve;
      }),
    undefined,
  );
  resolveFetch(elements);
  await Promise.resolve();
  await Promise.resolve();
};

const reject = async (
  manager: PrefetchManager,
  rscPath: string,
  query: string,
  options?: PrefetchOptions,
) => {
  let rejectFetch: (reason: unknown) => void = () => {};
  manager.prefetch(
    rscPath,
    query,
    () =>
      new Promise<Elements>((_resolve, rejectPromise) => {
        rejectFetch = rejectPromise;
      }),
    options,
  );
  rejectFetch(new Error('network'));
  await Promise.resolve();
  await Promise.resolve();
};

describe('router prefetch manager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has a positive default ttl', () => {
    expect(PREFETCH_TTL).toBeGreaterThan(0);
  });

  it('dedupes by path and query within the ttl', () => {
    const manager = createPrefetchManager();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    manager.prefetch('/x', 'a=1', fetcher, undefined);
    manager.prefetch('/x', 'a=1', fetcher, undefined);
    manager.prefetch('/x', 'a=2', fetcher, undefined);
    manager.prefetch('/y', 'a=1', fetcher, undefined);
    expect(calls).toBe(3);
  });

  it('expires an entry after its ttl', () => {
    vi.useFakeTimers();
    const manager = createPrefetchManager();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    manager.prefetch('/x', '', fetcher, { ttl: 1000 });
    expect(manager.get('/x', '')).toBeDefined();
    vi.advanceTimersByTime(1001);
    expect(manager.get('/x', '')).toBeUndefined();
    manager.prefetch('/x', '', fetcher, { ttl: 1000 });
    expect(calls).toBe(2);
  });

  it('bounds the cache at PREFETCH_LIMIT, evicting the oldest first', () => {
    const manager = createPrefetchManager();
    for (let i = 0; i < PREFETCH_LIMIT + 5; i += 1) {
      manager.prefetch('/p', String(i), pending, undefined);
    }
    expect(manager.get('/p', '0')).toBeUndefined();
    expect(manager.get('/p', '4')).toBeUndefined();
    expect(manager.get('/p', '5')).toBeDefined();
    expect(manager.get('/p', String(PREFETCH_LIMIT + 4))).toBeDefined();
  });

  it('merges responses for the same rscPath in the store', async () => {
    const manager = createPrefetchManager();
    await settle(manager, '/p', 'q=a', { a: 1 });
    await settle(manager, '/p', 'q=b', { b: 2 });
    expect(manager.getElements('/p')).toEqual({ a: 1, b: 2 });
  });

  it('bounds the store at PREFETCH_LIMIT, evicting the oldest first', async () => {
    const manager = createPrefetchManager();
    for (let i = 0; i < PREFETCH_LIMIT + 5; i += 1) {
      await settle(manager, `/p${i}`, '', { i });
    }
    expect(manager.getElements('/p0')).toBeUndefined();
    expect(manager.getElements('/p4')).toBeUndefined();
    expect(manager.getElements('/p5')).toBeDefined();
    expect(manager.getElements(`/p${PREFETCH_LIMIT + 4}`)).toBeDefined();
    // merging into an existing entry does not evict another one
    await settle(manager, '/p5', 'q=b', { j: 1 });
    expect(manager.getElements('/p5')).toEqual({ i: 5, j: 1 });
    expect(manager.getElements('/p6')).toBeDefined();
  });

  it('mode once skips a route that is already stored or in flight', async () => {
    const manager = createPrefetchManager();
    let fetched = 0;
    let resolveFetch: (value: Elements) => void = () => {};
    const fetcher = () => {
      fetched += 1;
      return new Promise<Elements>((resolve) => {
        resolveFetch = resolve;
      });
    };
    manager.prefetch('/p', 'q=a', fetcher, { mode: 'once' });
    manager.prefetch('/p', 'q=b', fetcher, { mode: 'once' });
    expect(fetched).toBe(1);
    resolveFetch({ a: 1 });
    await Promise.resolve();
    expect(manager.getElements('/p')).toEqual({ a: 1 });
  });

  it('passes the stored entry to the fetcher as the base', async () => {
    const manager = createPrefetchManager();
    await settle(manager, '/p', 'q=a', { a: 1 });
    let received: unknown = 'unset';
    manager.prefetch(
      '/p',
      'q=b',
      (base) => {
        received = base;
        return pending();
      },
      undefined,
    );
    expect(received).toEqual({ a: 1 });
  });

  it('passes no base while the first prefetch is in flight', () => {
    const manager = createPrefetchManager();
    manager.prefetch('/p', 'q=a', pending, { mode: 'always' });
    let received: unknown = 'unset';
    manager.prefetch(
      '/p',
      'q=b',
      (base) => {
        received = base;
        return pending();
      },
      undefined,
    );
    expect(received).toBeUndefined();
  });

  it('releases only an unfulfilled reservation', async () => {
    const manager = createPrefetchManager();
    await reject(manager, '/p', 'q=a');
    expect(manager.getElements('/p')).toBeUndefined();
    await settle(manager, '/p', 'q=b', { a: 1 });
    await reject(manager, '/p', 'q=c');
    expect(manager.getElements('/p')).toEqual({ a: 1 });
  });

  it('has an error ttl shorter than the success ttl', () => {
    expect(PREFETCH_ERROR_TTL).toBeGreaterThan(0);
    expect(PREFETCH_ERROR_TTL).toBeLessThan(PREFETCH_TTL);
  });

  it('does not refetch a rejected key within the error ttl', async () => {
    vi.useFakeTimers();
    const manager = createPrefetchManager();
    await reject(manager, '/x', '');
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    // the hover storm the backoff exists to collapse
    manager.prefetch('/x', '', fetcher, undefined);
    manager.prefetch('/x', '', fetcher, undefined);
    vi.advanceTimersByTime(PREFETCH_ERROR_TTL - 1);
    manager.prefetch('/x', '', fetcher, undefined);
    expect(calls).toBe(0);
  });

  it('retries once the error ttl lapses', async () => {
    vi.useFakeTimers();
    const manager = createPrefetchManager();
    await reject(manager, '/x', '');
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    vi.advanceTimersByTime(PREFETCH_ERROR_TTL + 1);
    manager.prefetch('/x', '', fetcher, undefined);
    expect(calls).toBe(1);
  });

  it('honours a custom errorTtl', async () => {
    vi.useFakeTimers();
    const manager = createPrefetchManager();
    await reject(manager, '/x', '', { errorTtl: 5000 });
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    vi.advanceTimersByTime(4999);
    manager.prefetch('/x', '', fetcher, undefined);
    expect(calls).toBe(0);
    vi.advanceTimersByTime(2);
    manager.prefetch('/x', '', fetcher, undefined);
    expect(calls).toBe(1);
  });

  it('errorTtl 0 records no backoff', async () => {
    const manager = createPrefetchManager();
    await reject(manager, '/x', '', { errorTtl: 0 });
    let calls = 0;
    manager.prefetch(
      '/x',
      '',
      () => {
        calls += 1;
        return pending();
      },
      undefined,
    );
    expect(calls).toBe(1);
  });

  it('never exposes a rejected attempt as a cache entry', async () => {
    const manager = createPrefetchManager();
    await reject(manager, '/x', '');
    // a rejected promise here would become the next navigation's
    // unstable_prefetched
    expect(manager.get('/x', '')).toBeUndefined();
  });

  it('backs off per query, not per path', async () => {
    const manager = createPrefetchManager();
    await reject(manager, '/x', 'a=1');
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    manager.prefetch('/x', 'a=1', fetcher, undefined);
    expect(calls).toBe(0);
    manager.prefetch('/x', 'a=2', fetcher, undefined);
    expect(calls).toBe(1);
  });

  it('lets a stale rejection expire without suppressing the newer attempt', async () => {
    vi.useFakeTimers();
    const manager = createPrefetchManager();
    let rejectFirst: (reason: unknown) => void = () => {};
    manager.prefetch(
      '/x',
      '',
      () =>
        new Promise<Elements>((_resolve, rejectPromise) => {
          rejectFirst = rejectPromise;
        }),
      { ttl: 1000 },
    );
    // the first attempt lapses out of the cache and a second one replaces it
    vi.advanceTimersByTime(1001);
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    manager.prefetch('/x', '', fetcher, { ttl: 1000 });
    expect(calls).toBe(1);
    // the superseded attempt now fails; it must not back off the live one
    rejectFirst(new Error('network'));
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(1001);
    manager.prefetch('/x', '', fetcher, { ttl: 1000 });
    expect(calls).toBe(2);
  });

  it('bounds the failure cache at PREFETCH_LIMIT, evicting the oldest first', async () => {
    const manager = createPrefetchManager();
    for (let i = 0; i < PREFETCH_LIMIT + 5; i += 1) {
      await reject(manager, '/p', String(i));
    }
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return pending();
    };
    // the oldest backoffs were evicted, so those keys prefetch again
    manager.prefetch('/p', '0', fetcher, undefined);
    expect(calls).toBe(1);
    // a recent one is still suppressed
    manager.prefetch('/p', String(PREFETCH_LIMIT + 4), fetcher, undefined);
    expect(calls).toBe(1);
  });

  it('clear() drops recorded backoffs', async () => {
    const manager = createPrefetchManager();
    await reject(manager, '/x', '');
    manager.clear();
    let calls = 0;
    manager.prefetch(
      '/x',
      '',
      () => {
        calls += 1;
        return pending();
      },
      undefined,
    );
    expect(calls).toBe(1);
  });

  it('a prefetch in flight at clear() completes into a detached store', async () => {
    const manager = createPrefetchManager();
    let resolveFetch!: (elements: Elements) => void;
    manager.prefetch(
      '/p',
      '',
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      undefined,
    );
    manager.clear();
    resolveFetch({ a: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.getElements('/p')).toBeUndefined();
    expect(manager.get('/p', '')).toBeUndefined();
  });
});
