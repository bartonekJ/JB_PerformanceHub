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
      bodyMassKg: 0,
      bodyMassMeasuredAt: 0,
      bodyMassSource: '',
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
      bodyMassKg: Number(raw?.bodyMassKg) >= 10 && Number(raw?.bodyMassKg) <= 300
        ? Number(raw.bodyMassKg)
        : 0,
      bodyMassMeasuredAt: Number(raw?.bodyMassMeasuredAt) || 0,
      bodyMassSource: String(raw?.bodyMassSource || ''),
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
          athleteMasses: storedSession.athleteMasses || {},
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
    return window.JBPerformanceHubConfig?.get('librarianApi')
      || localStorage.getItem(LibrarianApiStorageKey)
      || DefaultLibrarianApi;
  }

  function writeLibrarianApi(value) {
    const normalized = String(value || '').trim();
    window.JBPerformanceHubConfig?.set('librarianApi', normalized);
    localStorage.setItem(LibrarianApiStorageKey, normalized);
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

  function validBodyMassKg(value) {
    const massKg = Number(value);
    return Number.isFinite(massKg) && massKg >= 10 && massKg <= 300 ? massKg : 0;
  }

  function athleteMassSnapshot(state, athleteId = state.currentAthleteId) {
    const id = String(Number(athleteId) || 0);
    const sessionMass = state.session?.athleteMasses?.[id];
    const sessionKg = validBodyMassKg(sessionMass?.bodyMassKg);
    if (sessionKg) return { ...sessionMass, bodyMassKg: sessionKg };
    const athlete = athleteById(state, athleteId);
    const profileKg = validBodyMassKg(athlete?.bodyMassKg);
    if (!profileKg) return null;
    return {
      bodyMassKg: profileKg,
      measuredAt: Number(athlete.bodyMassMeasuredAt) || 0,
      source: athlete.bodyMassSource || 'profile',
      profile: true,
    };
  }

  function setAthleteMassSnapshot(state, athleteId, bodyMassKg, source = 'forceplate', measuredAt = Date.now()) {
    const massKg = validBodyMassKg(bodyMassKg);
    if (!massKg) throw new Error('Body mass must be between 10 and 300 kg');
    const id = String(Number(athleteId) || 0);
    state.session.athleteMasses = {
      ...(state.session.athleteMasses || {}),
      [id]: { bodyMassKg: massKg, measuredAt: Number(measuredAt) || Date.now(), source },
    };
    state.session.updatedAt = Date.now();
    writeStoredState(state);
    return state.session.athleteMasses[id];
  }

  function athleteForMeasurement(state, athleteId = state.currentAthleteId) {
    const athlete = athleteById(state, athleteId);
    if (!athlete) return null;
    const mass = athleteMassSnapshot(state, athleteId);
    if (!mass) return { ...athlete };
    return {
      ...athlete,
      bodyMassKg: mass.bodyMassKg,
      bodyMassMeasuredAt: mass.measuredAt,
      bodyMassSource: mass.source,
    };
  }

  async function updateAthleteBodyMass(state, athleteId, snapshot) {
    const athlete = athleteById(state, athleteId);
    const massKg = validBodyMassKg(snapshot?.bodyMassKg);
    if (!athlete || !Number(athlete.athleteId) || !massKg) {
      throw new Error('A named athlete and a valid measured mass are required');
    }
    const payload = {
      ...athlete,
      bodyMassKg: massKg,
      bodyMassMeasuredAt: Number(snapshot.measuredAt) || Date.now(),
      bodyMassSource: snapshot.source || 'forceplate',
    };
    const response = await fetch(apiUrl(readLibrarianApi(), `/api/athletes/${athlete.athleteId}`), {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
    const updated = normalizeAthlete(json.athlete || payload);
    state.athletes = state.athletes.map((item) =>
      String(item.athleteId) === String(updated.athleteId) ? updated : item);
    writeStoredState(state);
    return updated;
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
      athleteMasses: {},
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
    athleteForMeasurement,
    athleteMassSnapshot,
    categories,
    defaultState,
    discardSession,
    beginSession,
    loadDirectory,
    loadAthletes,
    readLibrarianApi,
    readStoredState,
    stopSession,
    setAthleteMassSnapshot,
    updateAthleteBodyMass,
    writeLibrarianApi,
    writeStoredState,
  };
})();
