window.JBForcePlateSessionArchive = (() => {
  const DbName = 'jb-forceplate-ph';
  const DbVersion = 2;
  const SessionStore = 'sessions';
  const TraceStore = 'traces';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DbName, DbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SessionStore)) {
          const store = db.createObjectStore(SessionStore, { keyPath: 'session.sessionId' });
          store.createIndex('updatedAt', 'session.updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(TraceStore)) {
          db.createObjectStore(TraceStore, { keyPath: 'traceId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, callback, storeName = SessionStore) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        result = callback(store);
      });
    } finally {
      db.close();
    }
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function traceRefFromRaw(result, rawTrace) {
    const traceId = result.traceRef?.traceId || result.traceHash || result.resultId;
    return {
      ...(result.traceRef || {}),
      traceId,
      fileName: result.traceRef?.fileName || `${traceId}.jbfpbin`,
      source: rawTrace.source || result.traceRef?.source || '',
      rowCount: rawTrace.rowCount || rawTrace.rows?.length || result.traceRef?.rowCount || 0,
      firstMs: rawTrace.firstMs ?? result.traceRef?.firstMs ?? 0,
      lastMs: rawTrace.lastMs ?? result.traceRef?.lastMs ?? 0,
      sampleIntervalMs: rawTrace.sampleIntervalMs ?? result.traceRef?.sampleIntervalMs ?? 0,
    };
  }

  function detachRawTraces(results) {
    const traces = [];
    const detachedResults = (results || []).map((result) => {
      const rawTrace = result.rawTrace || result.traceData || result.trace || null;
      if (!rawTrace?.rows?.length) return result;
      const traceRef = traceRefFromRaw(result, rawTrace);
      traces.push({
        traceId: traceRef.traceId,
        rawTrace,
        savedAt: Date.now(),
      });
      const {
        rawTrace: _rawTrace,
        traceData: _traceData,
        trace: _trace,
        ...rest
      } = result;
      return {
        ...rest,
        traceRef,
      };
    });
    return { results: detachedResults, traces };
  }

  function normalizePackage(sessionPackage) {
    const now = Date.now();
    const detached = detachRawTraces(sessionPackage.results || []);
    return {
      schema: 'jb.forceplate.session-package.v1',
      savedAt: now,
      session: {
        ...sessionPackage.session,
        updatedAt: now,
        storageState: {
          ...(sessionPackage.session.storageState || {}),
          localSavedAt: now,
        },
      },
      results: detached.results,
      traces: detached.traces,
    };
  }

  async function saveSession(sessionPackage) {
    const normalized = normalizePackage(sessionPackage);
    const { traces, ...sessionOnly } = normalized;
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([SessionStore, TraceStore], 'readwrite');
        transaction.objectStore(SessionStore).put(sessionOnly);
        traces.forEach((trace) => transaction.objectStore(TraceStore).put(trace));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
    return sessionOnly;
  }

  async function clearSessions() {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([SessionStore, TraceStore], 'readwrite');
        transaction.objectStore(SessionStore).clear();
        transaction.objectStore(TraceStore).clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }

  async function loadSession(sessionId) {
    return withStore('readonly', (store) => requestPromise(store.get(sessionId)));
  }

  async function listSessions() {
    const sessions = await withStore('readonly', (store) => requestPromise(store.getAll()));
    return sessions.sort((a, b) => (b.session.updatedAt || 0) - (a.session.updatedAt || 0));
  }

  async function saveTrace(traceId, rawTrace) {
    await withStore('readwrite', (store) => store.put({ traceId, rawTrace, savedAt: Date.now() }), TraceStore);
  }

  async function loadTrace(traceId) {
    if (!traceId) return null;
    const trace = await withStore('readonly', (store) => requestPromise(store.get(traceId)), TraceStore);
    return trace?.rawTrace || null;
  }

  async function pendingSessions() {
    const sessions = await listSessions();
    return sessions.filter((item) => {
      const storage = item.session.storageState || {};
      return !storage.exportedAt && !storage.syncedAt;
    });
  }

  return {
    clearSessions,
    listSessions,
    loadSession,
    loadTrace,
    pendingSessions,
    saveSession,
    saveTrace,
  };
})();
