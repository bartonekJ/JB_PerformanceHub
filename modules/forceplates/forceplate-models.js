window.JBForcePlateModels = (() => {
  const DeviceIdStorageKey = 'jb-forceplate-device-id';

  const DisciplineDefinitions = [
    {
      id: 'squat_jump',
      label: 'Squat Jump',
      resultKey: 'squatJump',
      settings: {
        traceWindowMs: 6000,
        weighingMs: 3500,
      },
    },
    {
      id: 'countermovement_jump',
      label: 'Countermovement Jump',
      resultKey: 'countermovementJump',
      settings: {
        traceWindowMs: 6000,
        weighingMs: 3500,
      },
    },
    {
      id: 'drop_jump',
      label: 'Drop Jump',
      resultKey: 'dropJump',
      settings: {
        boxHeightCm: 26,
        traceWindowMs: 6000,
        weighingMs: 3500,
      },
    },
    {
      id: 'balance',
      label: 'Balance',
      resultKey: 'balance',
      settings: {
        traceWindowMs: 30000,
      },
    },
    {
      id: 'max_force',
      label: 'Max Force',
      resultKey: 'maxForce',
      settings: {
        traceWindowMs: 10000,
      },
    },
  ];

  function disciplineDefinition(id) {
    return DisciplineDefinitions.find((definition) => definition.id === id) ?? DisciplineDefinitions[0];
  }

  function disciplineSettings(id, overrides = {}) {
    return {
      ...disciplineDefinition(id).settings,
      ...overrides,
    };
  }

  function createId(prefix) {
    const id = crypto?.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return prefix ? `${prefix}_${id}` : id;
  }

  function deviceId() {
    let id = localStorage.getItem(DeviceIdStorageKey);
    if (!id) {
      id = createId('device');
      localStorage.setItem(DeviceIdStorageKey, id);
    }
    return id;
  }

  function athleteDisplayName(athlete) {
    if (!athlete) return 'Anonymous';
    const fullName = [athlete.firstName, athlete.lastName]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
    return String(
      athlete.displayName ||
      athlete.name ||
      fullName ||
      'Anonymous'
    ).trim();
  }

  function createSessionConfig({
    sessionId = createId('session'),
    active = false,
    name = 'ForcePlate Session',
    category = '',
    createdAt = Date.now(),
    startedAt = 0,
    stoppedAt = 0,
    updatedAt = Date.now(),
    source = 'force-plate',
    storageState = {},
    discipline = 'squat_jump',
    disciplineSettings: settings = {},
  } = {}) {
    return {
      schema: 'jb.session.v1',
      sessionId,
      source,
      deviceId: deviceId(),
      active,
      name,
      category,
      createdAt,
      startedAt,
      stoppedAt,
      updatedAt,
      storageState: {
        localSavedAt: storageState.localSavedAt || 0,
        exportedAt: storageState.exportedAt || 0,
        syncedAt: storageState.syncedAt || 0,
      },
      disciplineDefinition: {
        discipline,
        disciplineLabel: disciplineDefinition(discipline).label,
        settings: disciplineSettings(discipline, settings),
      },
    };
  }

  function createSessionResult({
    resultId = createId('result'),
    sessionId,
    measuredAt = Date.now(),
    athlete,
    category = '',
    discipline = 'squat_jump',
    disciplineSettings: settings = {},
    rawTrace = null,
    traceHash = '',
    traceRef = null,
    metrics = null,
    landmarks = null,
  }) {
    return {
      schema: 'jb.forceplate.result.v1',
      resultId,
      sessionId,
      deviceId: deviceId(),
      measuredAt,
      athleteId: Number(athlete?.athleteId || 0),
      athleteName: athleteDisplayName(athlete),
      athleteSnapshot: athlete ? { ...athlete } : null,
      category: category || athlete?.category || '',
      disciplineDefinition: {
        discipline,
        disciplineLabel: disciplineDefinition(discipline).label,
        settings: disciplineSettings(discipline, settings),
      },
      rawTrace,
      traceHash,
      traceRef,
      metrics,
      landmarks,
    };
  }

  return {
    DisciplineDefinitions,
    athleteDisplayName,
    createSessionConfig,
    createId,
    createSessionResult,
    deviceId,
    disciplineDefinition,
    disciplineSettings,
  };
})();
