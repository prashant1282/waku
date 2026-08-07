// Router-scoped cache of prefetched route trees. Keyed by (rscPath, query) so a
// prefetch for one query is never reused for another, and bounded by a ttl and a
// size limit so hover-prefetching in a long session cannot grow without bound.

type Elements = Record<string | symbol, unknown>;

export type PrefetchMode = 'always' | 'once';

export type PrefetchOptions = {
  /** Default: dedupe by TTL only. `'once'` also skips if this path was already stored. */
  mode?: PrefetchMode;
  /** Milliseconds; defaults to `PREFETCH_TTL`. */
  ttl?: number;
  /**
   * Milliseconds to suppress re-prefetching after a failure; defaults to
   * `PREFETCH_ERROR_TTL`. `0` records no backoff, so the next trigger retries
   * immediately.
   */
  errorTtl?: number;
};

export type PrefetchEntry = {
  promise: Promise<Elements>;
  expireAt: number;
};

type PrefetchCache = Map<string, PrefetchEntry>;

// Negative cache: keys whose last prefetch rejected, mapped to the time the
// suppression lapses. A failed prefetch leaves nothing in PrefetchCache (an
// entry there would hand a rejected promise to the next navigation), so
// without this a route that always fails -- one answering with a document
// location, say -- refetches on every hover.
type PrefetchFailureCache = Map<string, number>;

// Session store of prefetched responses, keyed by rscPath alone. Entries are
// only served under the etag protocol: they paint immutable slots (which
// cannot vary by query) and fall back for a dynamic slot only when the
// server omits it, which proves the stored copy current. A null entry marks
// a route whose first prefetch is still in flight.
type PrefetchedElementsStore = Map<string, Elements | null>;

export const PREFETCH_TTL = 1000 * 60;
// Shorter than PREFETCH_TTL: a failure is often transient (an offline blip),
// so this collapses a burst of hovers without stranding a route that recovers.
export const PREFETCH_ERROR_TTL = 1000 * 10;
export const PREFETCH_LIMIT = 100;

const prefetchCacheKey = (rscPath: string, query: string): string =>
  rscPath + '\0' + query;

const getPrefetch = (
  cache: PrefetchCache,
  key: string,
  now: number,
): PrefetchEntry | undefined => {
  const entry = cache.get(key);
  if (entry && entry.expireAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry;
};

const setPrefetch = (
  cache: PrefetchCache,
  key: string,
  entry: PrefetchEntry,
): void => {
  while (cache.size >= PREFETCH_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
  cache.set(key, entry);
};

const isFailureLive = (
  failures: PrefetchFailureCache,
  key: string,
  now: number,
): boolean => {
  const expireAt = failures.get(key);
  if (expireAt === undefined) {
    return false;
  }
  if (expireAt <= now) {
    failures.delete(key);
    return false;
  }
  return true;
};

const setFailure = (
  failures: PrefetchFailureCache,
  key: string,
  expireAt: number,
): void => {
  while (failures.size >= PREFETCH_LIMIT) {
    const oldest = failures.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    failures.delete(oldest);
  }
  failures.set(key, expireAt);
};

const reservePrefetchedElements = (
  store: PrefetchedElementsStore,
  rscPath: string,
): void => {
  if (store.has(rscPath)) {
    return;
  }
  if (store.size >= PREFETCH_LIMIT) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) {
      store.delete(oldestKey);
    }
  }
  store.set(rscPath, null);
};

const releasePrefetchedElements = (
  store: PrefetchedElementsStore,
  rscPath: string,
): void => {
  if (store.get(rscPath) === null) {
    store.delete(rscPath);
  }
};

const mergePrefetchedElements = (
  store: PrefetchedElementsStore,
  rscPath: string,
  elements: Elements,
): void => {
  reservePrefetchedElements(store, rscPath);
  const existing = store.get(rscPath);
  store.set(rscPath, existing ? { ...existing, ...elements } : elements);
};

type PrefetchManager = {
  prefetch: (
    rscPath: string,
    query: string,
    fetchElements: (base: Elements | undefined) => Promise<Elements>,
    options: PrefetchOptions | undefined,
  ) => void;
  get: (rscPath: string, query: string) => PrefetchEntry | undefined;
  getElements: (rscPath: string) => Elements | undefined;
  clear: () => void;
};

export const createPrefetchManager = (): PrefetchManager => {
  let cache: PrefetchCache = new Map();
  let store: PrefetchedElementsStore = new Map();
  let failures: PrefetchFailureCache = new Map();
  return {
    prefetch: (rscPath, query, fetchElements, options) =>
      startPrefetch(
        cache,
        store,
        failures,
        rscPath,
        query,
        fetchElements,
        options,
      ),
    get: (rscPath, query) =>
      getPrefetch(cache, prefetchCacheKey(rscPath, query), Date.now()),
    getElements: (rscPath) => store.get(rscPath) ?? undefined,
    clear: () => {
      // replace the maps so an in-flight prefetch completes into detached ones
      cache = new Map();
      store = new Map();
      failures = new Map();
    },
  };
};

const startPrefetch = (
  cache: PrefetchCache,
  store: PrefetchedElementsStore,
  failures: PrefetchFailureCache,
  rscPath: string,
  query: string,
  fetchElements: (base: Elements | undefined) => Promise<Elements>,
  options: PrefetchOptions | undefined,
): void => {
  if (options?.mode === 'once' && store.has(rscPath)) {
    return;
  }
  // Dedupe per (path, query), so a repeat trigger within the ttl keeps an
  // already-resolved response instead of replacing it with an in-flight one.
  const key = prefetchCacheKey(rscPath, query);
  const now = Date.now();
  if (getPrefetch(cache, key, now)) {
    return;
  }
  // Back off from a key whose last attempt rejected, per the error ttl.
  if (isFailureLive(failures, key, now)) {
    return;
  }
  const base = store.get(rscPath) ?? undefined;
  const promise = fetchElements(base);
  const entry: PrefetchEntry = {
    promise,
    expireAt: now + (options?.ttl ?? PREFETCH_TTL),
  };
  setPrefetch(cache, key, entry);
  reservePrefetchedElements(store, rscPath);
  promise.then(
    (resolved) => {
      mergePrefetchedElements(store, rscPath, resolved);
    },
    () => {
      // Only the current attempt may record a backoff: a stale one has already
      // been replaced in `cache`, and letting it write would suppress the
      // newer fetch that superseded it.
      if (cache.get(key) === entry) {
        cache.delete(key);
        // Nothing survives in `cache` to dedupe against -- a rejected promise
        // there would surface as the next navigation's `unstable_prefetched`
        // -- so the backoff is recorded separately.
        setFailure(
          failures,
          key,
          Date.now() + (options?.errorTtl ?? PREFETCH_ERROR_TTL),
        );
      }
      releasePrefetchedElements(store, rscPath);
    },
  );
};
