window.JBForcePlateModels = (() => {
  const DeviceIdStorageKey = 'jb-forceplate-device-id';

  const DisciplineDefinitions = [
    {
      id: 'squat_jump',
      label: 'Squat Jump',
      resultKey: 'squatJump',
      recordMetric: {
        label: 'SJ',
        order: 20,
        direction: 'max',
        settingKey: 'flightHeightCm',
        metricLabels: ['FLIGHT-TIME HEIGHT', 'FLIGHT TIME HEIGHT', 'TOV'],
        decimals: 1,
        unit: 'cm',
      },
      settings: {
        traceWindowMs: 6000,
        weighingMs: 3500,
      },
    },
    {
      id: 'countermovement_jump',
      label: 'Countermovement Jump',
      resultKey: 'countermovementJump',
      recordMetric: {
        label: 'CMJ',
        order: 10,
        direction: 'max',
        settingKey: 'flightHeightCm',
        metricLabels: ['FLIGHT-TIME HEIGHT', 'FLIGHT TIME HEIGHT', 'TOV'],
        decimals: 1,
        unit: 'cm',
      },
      settings: {
        traceWindowMs: 6000,
        weighingMs: 3500,
      },
    },
    {
      id: 'drop_jump',
      label: 'Drop Jump',
      resultKey: 'dropJump',
      recordMetric: {
        label: 'DJ',
        order: 30,
        direction: 'max',
        valuePaths: ['rsi'],
        metricLabels: ['RSI'],
        decimals: 2,
        unit: '',
      },
      settings: {
        boxHeightCm: 26,
        traceWindowMs: 6000,
        weighingMs: 3500,
      },
    },
    {
      id: 'eyes_closed_balance',
      label: 'Static Balance',
      resultKey: 'staticBalance',
      recordMetric: {
        label: 'Balance',
        order: 40,
        direction: 'min',
        valuePaths: ['meanVelocityMmS', 'closed.meanVelocityMmS', 'open.meanVelocityMmS'],
        metricLabels: ['MEAN VELOCITY'],
        decimals: 1,
        unit: 'mm/s',
      },
      settings: {
        durationSec: 30,
        legMode: 'both',
        visionMode: 'closed',
      },
    },
    {
      id: 'max_force',
      label: 'Max Force',
      resultKey: 'maxForce',
      recordMetric: {
        label: 'Max Force',
        order: 50,
        direction: 'max',
        valuePaths: ['peakForceN', 'maxForceN'],
        metricLabels: ['PEAK FORCE', 'MAX FORCE'],
        decimals: 0,
        unit: 'N',
      },
      settings: {
        traceWindowMs: 10000,
      },
    },
    {
      id: 'scale',
      label: 'Scale',
      resultKey: 'bodyMass',
      settings: {},
    },
  ];

  function normalizeDisciplineId(id) {
    return id === 'balance' ? 'eyes_closed_balance' : id;
  }

  function disciplineDefinition(id) {
    const normalizedId = normalizeDisciplineId(id);
    return DisciplineDefinitions.find((definition) => definition.id === normalizedId) ?? DisciplineDefinitions[0];
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
    athleteMasses = {},
    discipline = 'squat_jump',
    disciplineSettings: settings = {},
  } = {}) {
    const normalizedDiscipline = normalizeDisciplineId(discipline);
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
      athleteMasses: athleteMasses && typeof athleteMasses === 'object'
        ? { ...athleteMasses }
        : {},
      disciplineDefinition: {
        discipline: normalizedDiscipline,
        disciplineLabel: disciplineDefinition(normalizedDiscipline).label,
        settings: disciplineSettings(normalizedDiscipline, settings),
      },
    };
  }

  function createSessionResult({
    resultId = createId('result'),
    sessionId,
    measuredAt = Date.now(),
    athlete,
    bodyMassSnapshot = null,
    category = '',
    discipline = 'squat_jump',
    disciplineSettings: settings = {},
    rawTrace = null,
    traceHash = '',
    traceRef = null,
    metrics = null,
    landmarks = null,
  }) {
    const normalizedDiscipline = normalizeDisciplineId(discipline);
    return {
      schema: 'jb.forceplate.result.v1',
      resultId,
      sessionId,
      deviceId: deviceId(),
      measuredAt,
      athleteId: Number(athlete?.athleteId || 0),
      athleteName: athleteDisplayName(athlete),
      athleteSnapshot: athlete ? { ...athlete } : null,
      bodyMassSnapshot: bodyMassSnapshot ? { ...bodyMassSnapshot } : null,
      category: category || athlete?.category || '',
      disciplineDefinition: {
        discipline: normalizedDiscipline,
        disciplineLabel: disciplineDefinition(normalizedDiscipline).label,
        settings: disciplineSettings(normalizedDiscipline, settings),
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
