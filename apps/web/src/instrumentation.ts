export async function register() {
  // Node.js 22 partially shims localStorage via --localstorage-file, but when
  // no valid path is given the object exists with non-callable methods.
  // Replace it with a working in-memory store so Next.js SSR doesn't crash.
  const ls = (globalThis as Record<string, unknown>).localStorage as Storage | undefined
  if (typeof ls === 'undefined' || typeof ls?.getItem !== 'function') {
    const store = new Map<string, string>()
    const shim: Storage = {
      getItem:    (k)    => store.get(k) ?? null,
      setItem:    (k, v) => { store.set(k, String(v)) },
      removeItem: (k)    => { store.delete(k) },
      clear:      ()     => { store.clear() },
      key:        (i)    => [...store.keys()][i] ?? null,
      get length()       { return store.size },
    }
    ;(globalThis as Record<string, unknown>).localStorage = shim
  }
}
