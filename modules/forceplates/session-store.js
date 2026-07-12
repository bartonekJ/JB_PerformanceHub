window.JBForcePlateSessionStore = (() => {
  const StorageKey = 'jb-forceplate-session-state-v2';
  const LegacyStorageKeys = ['jb-forceplate-session-state'];
  const LibrarianApiStorageKey = 'jb-forceplate-librarian-api';
  const AthleteUrl = 'data/Athletes.json';
  const DefaultLibrarianApi = 'http://100.77.57.39:8787';
  const models = window.JBForcePlateModels;

  const fallbackAthletes = [
    {
      athleteId: 0,
      category: '',
      firstName: '',
      lastName: '',
      displayName: 'Anonymous',
      number: 0,
      position: '',
    },
  ];

  function defaultState() {
    return {
      session: models.createSessionConfig(),
      currentAthleteId: 0,
      athletes: fallbackAthletes,
      categories: [],
      rosterSource: 'fallback',
      rosterMessage: 'Anonymous fallback',
      results: [],
    };
  }

  function normalizeAthlete(raw) {
    return {
      athleteId: Number(raw?.athleteId ?? raw?.id ?? 0),
      category: String(raw?.category || ''),
      firstName: String(raw?.firstName || ''),
      lastName: String(raw?.lastName || ''),
      displayName: String(raw?.displayName || raw?.name || ''),
      number: Number(raw?.number ?? raw?.jerseyNumber ?? 0),
      position: String(raw?.position || ''),
    };
  }

  function normalizeCategory(raw) {
    const displayName = String(raw?.displayName || raw?.name || raw?.category || raw || '').trim();
    return {
      categoryId: String(raw?.categoryId || raw?.id || displayName || '').trim(),
      name: displayName,
      displayName,
    };
  }

  function readStoredState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(StorageKey) || 'null');
      if (!parsed || typeof parsed !== 'object') return defaultState();
      const storedSession = parsed.session || {};
      const storedDiscipline = storedSession.disciplineDefinition || {};
      return {
        ...defaultState(),
        ...parsed,
        session: models.createSessionConfig({
          sessionId: storedSession.sessionId,
          active: Boolean(storedSession.active),
          name: storedSession.name || 'ForcePlate Session',
          category: storedSession.category || '',
          createdAt: Number(storedSession.createdAt || Date.now()),
          startedAt: Number(storedSession.startedAt || 0),
          stoppedAt: Number(storedSession.stoppedAt || 0),
          updatedAt: Number(storedSession.updatedAt || Date.now()),
          source: storedSession.source || 'force-plate',
          storageState: storedSession.storageState || {},
          discipline: storedDiscipline.discipline || storedSession.discipline || 'squat_jump',
          disciplineSettings: storedDiscipline.settings || storedSession.disciplineSettings || {},
        }),
        results: [],
      };
    } catch {
      return defaultState();
    }
  }

  function storedPayload(state) {
    return {
      schema: 'jb.forceplate.browser-state.v1',
      session: state.session,
      currentAthleteId: state.currentAthleteId,
    };
  }

  function writeStoredState(state) {
    const payload = JSON.stringify(storedPayload(state));
    try {
      localStorage.setItem(StorageKey, payload);
      LegacyStorageKeys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      localStorage.removeItem(StorageKey);
      localStorage.setItem(StorageKey, payload);
    }
  }

  function readLibrarianApi() {
    return localStorage.getItem(LibrarianApiStorageKey) || DefaultLibrarianApi;
  }

  function writeLibrarianApi(value) {
    localStorage.setItem(LibrarianApiStorageKey, String(value || '').trim());
  }

  function apiUrl(base, path) {
    const url = new URL(String(base || '').trim());
    url.pathname = path;
    url.search = '';
    return url.toString();
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadDirectory(librarianApi = readLibrarianApi()) {
    try {
      const [athleteData, categoryData] = await Promise.all([
        fetchJson(apiUrl(librarianApi, '/api/athletes')),
        fetchJson(apiUrl(librarianApi, '/api/categories')),
      ]);
      const athletes = Array.isArray(athleteData?.athletes)
        ? athleteData.athletes.map(normalizeAthlete).filter((athlete) => athlete.athleteId)
        : [];
      const categories = Array.isArray(categoryData?.categories)
        ? categoryData.categories.map(normalizeCategory).filter((category) => category.displayName)
        : [];
      if (!athletes.length) throw new Error('No athletes');
      return {
        athletes,
        categories,
        source: 'librarian',
        message: `Librarian: ${athletes.length} athletes, ${categories.length} categories`,
      };
    } catch (librarianError) {
      try {
        const response = await fetch(AthleteUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const athletes = Array.isArray(json?.athletes)
          ? json.athletes.map(normalizeAthlete).filter((athlete) => athlete.athleteId)
          : [];
        if (!athletes.length) throw new Error('No local athletes');
        return {
          athletes,
          categories: categories(athletes).map((category) => normalizeCategory(category)),
          source: 'local',
          message: `Local fallback: ${athletes.length} athletes`,
        };
      } catch {
        return {
          athletes: fallbackAthletes,
          categories: [],
          source: 'fallback',
          message: `Anonymous fallback (${librarianError.message})`,
        };
      }
    }
  }

  async function loadAthletes() {
    return (await loadDirectory()).athletes;
  }

  function categories(athletes, explicitCategories = []) {
    return [
      ...new Set([
        ...(explicitCategories || []).map((category) => category.displayName || category.name || '').filter(Boolean),
        ...(athletes || []).map((athlete) => athlete.category).filter(Boolean),
      ]),
    ];
  }

  function athleteById(state, athleteId = state.currentAthleteId) {
    return state.athletes.find((athlete) => String(athlete.athleteId) === String(athleteId)) ?? state.athletes[0];
  }

  function beginSession(state) {
    const now = Date.now();
    state.session = models.createSessionConfig({
      name: state.session.name,
      category: state.session.category,
      active: true,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      discipline: state.session.disciplineDefinition.discipline,
      disciplineSettings: state.session.disciplineDefinition.settings,
    });
    state.results = [];
    writeStoredState(state);
  }

  function stopSession(state) {
    state.session.active = false;
    state.session.stoppedAt = Date.now();
    state.session.updatedAt = state.session.stoppedAt;
    writeStoredState(state);
  }

  function discardSession(state) {
    state.session = models.createSessionConfig({
      name: state.session.name,
      category: state.session.category,
      discipline: state.session.disciplineDefinition.discipline,
      disciplineSettings: state.session.disciplineDefinition.settings,
    });
    state.results = [];
    writeStoredState(state);
  }

  return {
    athleteById,
    categories,
    defaultState,
    discardSession,
    beginSession,
    loadDirectory,
    loadAthletes,
    readLibrarianApi,
    readStoredState,
    stopSession,
    writeLibrarianApi,
    writeStoredState,
  };
})();
