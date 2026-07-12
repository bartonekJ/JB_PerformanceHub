const state = {
  rows: [],
  source: '',
  viewMode: 'total',
  forceMode: 'net',
  discipline: 'squat_jump',
  metricSource: 'fw',
  analyzeResult: null,
  adjustedLandmarks: { total: null, left: null, right: null },
  traceLibrary: [],
  resultLibrary: [],
  resultTraceBins: new Map(),
  activeTraceId: null,
  activeResultId: null,
  settingsTab: 'traces',
  cursorIndex: -1,
  overlays: {
    velocity: false,
    power: false,
    displacement: false,
    asymmetry: false,
    bodyweight: false,
    powerMode: 'propulsive',
  },
  view: null,
  dragging: null,
  chartStyle: null,
  focusEnabled: true,
  focusWindow: null,
  selectedLandmark: null,
  appTab: 'measure',
  measurePanelTab: 'session',
  measurementPoll: {
    timer: 0,
    lastFetchedRevision: 0,
    lastStateText: '',
    active: false,
  },
  session: window.JBForcePlateSessionStore.readStoredState(),
  results: {
    packages: [],
    folderPackages: [],
    selectedKey: '',
    folderName: '',
  },
  realtime: {
    yMin: 0,
    yMax: 2000,
    samples: [],
    leftSamples: [],
    rightSamples: [],
    pxPerSecond: 160,
    playing: false,
    sourceIndex: 0,
    lastFrameMs: 0,
    frameTimer: 0,
    autoY: true,
    totalPeak: 0,
    reviewMode: false,
    cursorMs: 0,
    renderBuffer: {
      enabled: true,
      lagMs: 20,
      cursorMs: 0,
      raf: 0,
      lastFrameMs: 0,
    },
    historyMs: 10 * 60 * 1000,
    warmupUntilMs: 0,
    warmupLatestLeft: NaN,
    warmupLatestRight: NaN,
    recordStartBoardMs: NaN,
    detector: {
      activeFlight: null,
      segments: [],
      lastScanMs: -Infinity,
      contactArmed: false,
      lastContactMs: -Infinity,
      discipline: '',
      phase: 'idle',
      emptySinceMs: -Infinity,
      dropLandingMs: NaN,
      dropContactStartMs: NaN,
      dropContactPeak: 0,
    },
    live: false,
    liveAbort: [],
    stopUrls: [],
    liveStartMs: 0,
    liveLatestLeft: NaN,
    liveLatestRight: NaN,
    debug: {
      left: null,
      right: null,
    },
    debugHud: {
      visible: true,
      ageOpen: false,
      syncOpen: false,
    },
  },
};

const chart = document.getElementById('chart');
const ctx = chart.getContext('2d');
const realtimeChart = document.getElementById('realtimeChart');
const realtimeCtx = realtimeChart.getContext('2d');
const sessionPreviewChart = document.getElementById('sessionPreviewChart');
const sessionPreviewCtx = sessionPreviewChart.getContext('2d');
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const landmarkDebugEl = document.getElementById('landmarkDebug');
const SettingsStorageKey = 'jb-forceplate-analyzer-settings';
const PresetStorageKey = 'jb-forceplate-analyzer-presets';
const ActivePresetStorageKey = 'jb-forceplate-analyzer-active-preset';
const MeasureLayoutStorageKey = 'jb-forceplate-measure-layout';
const GravityMs2 = 9.80665;
const SessionTraceBinaryMagic = 'JBFPTR1\n';
const JbBinaryPackageMagic = 'JBBIN01\n';
const SessionTraceBinaryColumns = ['left_net_n', 'right_net_n', 'total_net_n', 'left_abs_n', 'right_abs_n', 'total_abs_n'];
const DefaultChartStyle = {
  chartBg: '#373734',
  chartOutline: '#70685c',
  leftColor: '#8fdb00',
  leftOpacity: 0.7,
  leftLine: 'solid',
  rightColor: '#f02a14',
  rightOpacity: 0.75,
  rightLine: 'solid',
  totalColor: '#d1d1d1',
  totalOpacity: 1,
  totalLine: 'solid',
  cursorButton: '#292929',
  cursorText: '#878787',
  cursorLine: '#171717',
  cursorOpacity: 1,
  cursorLineStyle: 'dash',
  xAxisColor: '#000000',
  xAxisText: '#000000',
  xAxisOpacity: 0.35,
  xAxisStyle: 'solid',
  zeroColor: '#000000',
  zeroOpacity: 1,
  zeroStyle: 'dash',
  landmarkOpacity: 0.55,
  landmarkStyle: 'dot',
  adjustedOpacity: 0.65,
  adjustedStyle: 'dash',
  landmarkDrop: '#e6e6e6',
  landmarkImpact: '#ff8240',
  landmarkTrough: '#aa78ff',
  landmarkDrive: '#ff9309',
  landmarkTakeoff: '#aeff00',
  landmarkLanding: '#bbff00',
  landmarkLandingPeak: '#647416',
  landmarkJumpEnd: '#ff9309',
  hGuideColor: '#ff9309',
  hGuideOpacity: 1,
  hGuideStyle: 'dot',
};
const DefaultSettingsPreset = {
  name: 'Default',
  values: {
    contactThreshold: 50,
    sustainMs: 20,
    minFlightMs: 80,
    onsetSearchMs: 450,
    onsetSlopeN: 8,
    onsetSustainMs: 80,
    boxHeightCm: 26,
  },
};

const controls = {
  chartPanel: document.getElementById('chartPanel'),
  endpoint: document.getElementById('endpoint'),
  loadEndpoint: document.getElementById('loadEndpoint'),
  fileInput: document.getElementById('fileInput'),
  exportCsv: document.getElementById('exportCsv'),
  loadSessionLibrary: document.getElementById('loadSessionLibrary'),
  resetView: document.getElementById('resetView'),
  appTabMeasure: document.getElementById('appTabMeasure'),
  appTabAnalyze: document.getElementById('appTabAnalyze'),
  appTabResults: document.getElementById('appTabResults'),
  measureView: document.getElementById('measureView'),
  analyzeView: document.getElementById('analyzeView'),
  resultsView: document.getElementById('resultsView'),
  sessionMeasurePanel: document.getElementById('sessionMeasurePanel'),
  realtimePanel: document.getElementById('realtimePanel'),
  sessionLeaderboardPanel: document.getElementById('sessionLeaderboardPanel'),
  measureSplitterMain: document.getElementById('measureSplitterMain'),
  measureSplitterControls: document.getElementById('measureSplitterControls'),
  measureSplitterCurrent: document.getElementById('measureSplitterCurrent'),
  measurePanelTabSession: document.getElementById('measurePanelTabSession'),
  measurePanelTabRealtime: document.getElementById('measurePanelTabRealtime'),
  sessionPane: document.getElementById('sessionPane'),
  realtimePane: document.getElementById('realtimePane'),
  sessionPreviewFitAll: document.getElementById('sessionPreviewFitAll'),
  sessionPreviewFitJump: document.getElementById('sessionPreviewFitJump'),
  sessionStats: document.getElementById('sessionStats'),
  sessionLeaderboard: document.getElementById('sessionLeaderboard'),
  resultsSessionSelect: document.getElementById('resultsSessionSelect'),
  resultsPickFolder: document.getElementById('resultsPickFolder'),
  resultsFolderInput: document.getElementById('resultsFolderInput'),
  sessionLibraryFileInput: document.getElementById('sessionLibraryFileInput'),
  resultsRefresh: document.getElementById('resultsRefresh'),
  resultsSummary: document.getElementById('resultsSummary'),
  resultsList: document.getElementById('resultsList'),
  realtimeFitVertical: document.getElementById('realtimeFitVertical'),
  realtimeReset: document.getElementById('realtimeReset'),
  realtimePlay: document.getElementById('realtimePlay'),
  realtimeLive: document.getElementById('realtimeLive'),
  realtimeScrub: document.getElementById('realtimeScrub'),
  realtimeStart: document.getElementById('realtimeStart'),
  realtimeStop: document.getElementById('realtimeStop'),
  realtimeSpeed: document.getElementById('realtimeSpeed'),
  realtimeAutoY: document.getElementById('realtimeAutoY'),
  realtimeRenderBuffer: document.getElementById('realtimeRenderBuffer'),
  realtimeRenderLagMs: document.getElementById('realtimeRenderLagMs'),
  librarianApi: document.getElementById('librarianApi'),
  syncRoster: document.getElementById('syncRoster'),
  rosterStatus: document.getElementById('rosterStatus'),
  cacheStatus: document.getElementById('cacheStatus'),
  clearSessionCache: document.getElementById('clearSessionCache'),
  sessionAthlete: document.getElementById('sessionAthlete'),
  sessionBegin: document.getElementById('sessionBegin'),
  sessionCategory: document.getElementById('sessionCategory'),
  sessionName: document.getElementById('sessionName'),
  sessionState: document.getElementById('sessionState'),
  measureDiscipline: document.getElementById('measureDiscipline'),
  measureBoxSetting: document.getElementById('measureBoxSetting'),
  measureWeighingSetting: document.getElementById('measureWeighingSetting'),
  slaveEndpoint: document.getElementById('slaveEndpoint'),
  realtimeIntervalMs: document.getElementById('realtimeIntervalMs'),
  realtimeSampleRate: document.getElementById('realtimeSampleRate'),
  realtimeWarmupMs: document.getElementById('realtimeWarmupMs'),
  realtimeAthlete: document.getElementById('realtimeAthlete'),
  realtimeCategory: document.getElementById('realtimeCategory'),
  realtimeDiscipline: document.getElementById('realtimeDiscipline'),
  realtimeSegmentList: document.getElementById('realtimeSegmentList'),
  realtimeExportSelected: document.getElementById('realtimeExportSelected'),
  measureBoxHeightCm: document.getElementById('measureBoxHeightCm'),
  measureTraceWindowMs: document.getElementById('measureTraceWindowMs'),
  measureWeighingMs: document.getElementById('measureWeighingMs'),
  sessionStop: document.getElementById('sessionStop'),
  sessionDiscard: document.getElementById('sessionDiscard'),
  measurementStart: document.getElementById('measurementStart'),
  measurementStop: document.getElementById('measurementStop'),
  fitHorizontal: document.getElementById('fitHorizontal'),
  fitVertical: document.getElementById('fitVertical'),
  fitAll: document.getElementById('fitAll'),
  fitJump: document.getElementById('fitJump'),
  viewTotal: document.getElementById('viewTotal'),
  viewLeft: document.getElementById('viewLeft'),
  viewRight: document.getElementById('viewRight'),
  modeNet: document.getElementById('modeNet'),
  modeAbs: document.getElementById('modeAbs'),
  forceToggle: document.getElementById('forceToggle'),
  overlayVelocity: document.getElementById('overlayVelocity'),
  overlayPower: document.getElementById('overlayPower'),
  overlayPowerMode: document.getElementById('overlayPowerMode'),
  overlayDisplacement: document.getElementById('overlayDisplacement'),
  overlayAsymmetry: document.getElementById('overlayAsymmetry'),
  overlayBodyweight: document.getElementById('overlayBodyweight'),
  disciplineSelect: document.getElementById('disciplineSelect'),
  detectAll: document.getElementById('detectAll'),
  clearAdjusted: document.getElementById('clearAdjusted'),
  metricsFw: document.getElementById('metricsFw'),
  metricsAdjusted: document.getElementById('metricsAdjusted'),
  contactThreshold: document.getElementById('contactThreshold'),
  sustainMs: document.getElementById('sustainMs'),
  minFlightMs: document.getElementById('minFlightMs'),
  onsetSearchMs: document.getElementById('onsetSearchMs'),
  onsetSlopeN: document.getElementById('onsetSlopeN'),
  onsetSustainMs: document.getElementById('onsetSustainMs'),
  boxHeightCm: document.getElementById('boxHeightCm'),
  settingsPreset: document.getElementById('settingsPreset'),
  presetName: document.getElementById('presetName'),
  savePreset: document.getElementById('savePreset'),
  settingsTabLandmarks: document.getElementById('settingsTabLandmarks'),
  settingsTabTraces: document.getElementById('settingsTabTraces'),
  landmarkSettingsPane: document.getElementById('landmarkSettingsPane'),
  traceLibraryPane: document.getElementById('traceLibraryPane'),
  traceLibraryList: document.getElementById('traceLibraryList'),
  clearTraceLibrary: document.getElementById('clearTraceLibrary'),
};

function setStatus(text) {
  statusEl.textContent = text;
}

function closeCustomSelects(except = null) {
  document.querySelectorAll('.customSelect.open').forEach((item) => {
    if (item !== except) item.classList.remove('open');
  });
}

function syncCustomSelect(select) {
  const shell = select.closest('.customSelect');
  if (!shell) return;
  const button = shell.querySelector('.customSelectButton');
  const list = shell.querySelector('.customSelectList');
  const selected = select.selectedOptions[0] || select.options[select.selectedIndex] || select.options[0];
  button.textContent = selected?.textContent || '';
  button.disabled = select.disabled;
  shell.classList.toggle('disabled', select.disabled);
  list.innerHTML = [...select.options].map((option) => `
    <button
      class="customSelectOption${option.selected ? ' selected' : ''}"
      type="button"
      data-value="${escapeHtml(option.value)}"
      ${option.disabled ? 'disabled' : ''}
    >${escapeHtml(option.textContent)}</button>
  `).join('');
}

function enhanceSelect(select) {
  if (select.dataset.enhanced === 'custom') return;
  select.dataset.enhanced = 'custom';
  const shell = document.createElement('div');
  shell.className = select.classList.contains('analyzeDisciplineField')
    ? 'customSelect analyzeDisciplineField'
    : 'customSelect';
  const button = document.createElement('button');
  button.className = 'customSelectButton';
  button.type = 'button';
  const list = document.createElement('div');
  list.className = 'customSelectList';

  select.parentNode.insertBefore(shell, select);
  shell.appendChild(select);
  shell.appendChild(button);
  shell.appendChild(list);
  select.classList.add('nativeSelect');

  button.addEventListener('click', () => {
    if (select.disabled) return;
    const isOpen = shell.classList.contains('open');
    closeCustomSelects(shell);
    shell.classList.toggle('open', !isOpen);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCustomSelects();
      button.blur();
    }
  });
  list.addEventListener('click', (event) => {
    const optionButton = event.target.closest('.customSelectOption');
    if (!optionButton || optionButton.disabled) return;
    select.value = optionButton.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    closeCustomSelects();
    syncCustomSelect(select);
  });
  select.addEventListener('change', () => syncCustomSelect(select));
  new MutationObserver(() => syncCustomSelect(select)).observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected', 'label'],
  });
  syncCustomSelect(select);
}

function enhanceSelectControls() {
  document.querySelectorAll('select').forEach(enhanceSelect);
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.customSelect')) closeCustomSelects();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCustomSelects();
  });
}

function syncCustomSelects() {
  document.querySelectorAll('select[data-enhanced="custom"]').forEach(syncCustomSelect);
}

function applyMeasureLayout(layout = storageRead(MeasureLayoutStorageKey, {})) {
  const leaderboardWidth = clamp(Number(layout.leaderboardWidth) || 360, 240, 720);
  const sessionPanelWidth = clamp(Number(layout.sessionPanelWidth) || 480, 360, 720);
  const currentPanelHeight = clamp(Number(layout.currentPanelHeight) || 230, 150, 520);
  controls.measureView.style.setProperty('--leaderboard-panel-width', `${leaderboardWidth}px`);
  controls.measureView.style.setProperty('--session-panel-width', `${sessionPanelWidth}px`);
  controls.measureView.style.setProperty('--current-panel-height', `${currentPanelHeight}px`);
}

function readMeasureLayout() {
  const style = getComputedStyle(controls.measureView);
  return {
    leaderboardWidth: Number.parseFloat(style.getPropertyValue('--leaderboard-panel-width')) || 360,
    sessionPanelWidth: Number.parseFloat(style.getPropertyValue('--session-panel-width')) || 480,
    currentPanelHeight: Number.parseFloat(style.getPropertyValue('--current-panel-height')) || 230,
  };
}

function writeMeasureLayout(layout) {
  storageWrite(MeasureLayoutStorageKey, layout);
  applyMeasureLayout(layout);
  drawSessionPreview();
  drawRealtime();
}

function beginMeasureResize(kind, event) {
  event.preventDefault();
  const startX = event.clientX;
  const start = readMeasureLayout();
  document.body.classList.add('resizingMeasure');

  const onMove = (moveEvent) => {
    const delta = moveEvent.clientX - startX;
    const next = { ...start };
    if (kind === 'main') {
      next.leaderboardWidth = clamp(start.leaderboardWidth - delta, 240, 720);
    } else {
      next.leaderboardWidth = clamp(start.leaderboardWidth + delta, 240, 720);
      next.sessionPanelWidth = clamp(start.sessionPanelWidth - delta, 360, 720);
    }
    applyMeasureLayout(next);
    drawSessionPreview();
    drawRealtime();
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.classList.remove('resizingMeasure');
    storageWrite(MeasureLayoutStorageKey, readMeasureLayout());
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp, { once: true });
}

function beginMeasureVerticalResize(event) {
  event.preventDefault();
  const startY = event.clientY;
  const start = readMeasureLayout();
  document.body.classList.add('resizingMeasureVertical');

  const onMove = (moveEvent) => {
    const delta = moveEvent.clientY - startY;
    const next = {
      ...start,
      currentPanelHeight: clamp(start.currentPanelHeight - delta, 150, 520),
    };
    applyMeasureLayout(next);
    drawSessionPreview();
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.classList.remove('resizingMeasureVertical');
    storageWrite(MeasureLayoutStorageKey, readMeasureLayout());
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp, { once: true });
}

function renderRealtimeRunState() {
  controls.realtimeStart.classList.toggle('active', state.realtime.live);
  controls.realtimeStart.disabled = state.realtime.live;
  controls.realtimeStart.textContent = state.realtime.live ? 'In Progress' : 'START';
  controls.realtimeStop.disabled = !state.realtime.live && !state.realtime.stopUrls.length;
}

function renderMeasurementRunState() {
  controls.measurementStart.classList.toggle('active', state.measurementPoll.active);
  controls.measurementStart.textContent = state.measurementPoll.active ? 'In Progress' : 'START';
}

function setMeasurePanelTab(tab) {
  state.measurePanelTab = tab;
  controls.measureView.classList.toggle('realtimeMode', tab === 'realtime');
  controls.measurePanelTabSession.classList.toggle('active', tab === 'session');
  controls.measurePanelTabRealtime.classList.toggle('active', tab === 'realtime');
  controls.sessionPane.classList.toggle('active', tab === 'session');
  controls.realtimePane.classList.toggle('active', tab === 'realtime');
  controls.sessionMeasurePanel.classList.toggle('active', tab === 'session');
  controls.realtimePanel.classList.toggle('active', tab === 'realtime');
  controls.sessionLeaderboardPanel.classList.toggle('active', tab === 'session');
  controls.measureSplitterMain.classList.toggle('active', tab === 'session');
  controls.measureSplitterControls.classList.add('active');
  if (tab === 'session') {
    drawSessionPreview();
  } else {
    drawRealtime();
  }
}

function renderSessionControls() {
  const sessionStore = window.JBForcePlateSessionStore;
  const models = window.JBForcePlateModels;
  const sessionState = state.session;
  const session = sessionState.session;
  const discipline = session.disciplineDefinition.discipline;
  const settings = session.disciplineDefinition.settings;
  const categories = sessionStore.categories(sessionState.athletes, sessionState.categories);
  const selectedCategory = session.category || '';
  const selectedAthleteId = String(sessionState.currentAthleteId || '');

  controls.librarianApi.value = sessionStore.readLibrarianApi();
  controls.rosterStatus.textContent = sessionState.rosterMessage || 'Roster not loaded';
  controls.rosterStatus.classList.toggle('ok', sessionState.rosterSource === 'librarian');
  controls.rosterStatus.classList.toggle('warn', sessionState.rosterSource !== 'librarian');
  controls.sessionName.value = session.name;
  controls.sessionState.textContent = session.active
    ? `Active ${session.startedAt ? new Date(session.startedAt).toLocaleTimeString() : ''}`.trim()
    : 'Idle';
  controls.sessionState.classList.toggle('active', session.active);
  controls.sessionBegin.classList.toggle('active', session.active);
  controls.sessionBegin.textContent = session.active ? 'In Progress' : 'Begin';

  controls.sessionCategory.innerHTML = [
    '<option value="">All groups</option>',
    ...categories.map((category) =>
      `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join('');
  controls.sessionCategory.value = selectedCategory;
  if (controls.realtimeCategory) {
    controls.realtimeCategory.innerHTML = controls.sessionCategory.innerHTML;
    controls.realtimeCategory.value = controls.sessionCategory.value;
  }

  const visibleAthletes = selectedCategory
    ? sessionState.athletes.filter((athlete) => athlete.category === selectedCategory)
    : sessionState.athletes;
  controls.sessionAthlete.innerHTML = visibleAthletes.map((athlete) => {
    const label = [
      athlete.number ? `#${athlete.number}` : '',
      models.athleteDisplayName(athlete),
      athlete.position ? `(${athlete.position})` : '',
    ].filter(Boolean).join(' ');
    return `<option value="${athlete.athleteId}">${escapeHtml(label)}</option>`;
  }).join('');
  if (visibleAthletes.some((athlete) => String(athlete.athleteId) === selectedAthleteId)) {
    controls.sessionAthlete.value = selectedAthleteId;
  } else if (visibleAthletes.length) {
    sessionState.currentAthleteId = visibleAthletes[0].athleteId;
    controls.sessionAthlete.value = String(visibleAthletes[0].athleteId);
  }
  if (controls.realtimeAthlete) {
    controls.realtimeAthlete.innerHTML = controls.sessionAthlete.innerHTML;
    controls.realtimeAthlete.value = controls.sessionAthlete.value;
  }

  controls.measureDiscipline.value = discipline;
  controls.realtimeDiscipline.value = discipline;
  controls.measureBoxHeightCm.value = settings.boxHeightCm ?? controls.measureBoxHeightCm.value;
  controls.measureTraceWindowMs.value = settings.traceWindowMs ?? controls.measureTraceWindowMs.value;
  controls.measureWeighingMs.value = settings.weighingMs ?? controls.measureWeighingMs.value;
  if (controls.realtimeExportSelected) {
    controls.realtimeExportSelected.textContent = session.active ? 'Add selected to session' : 'Export selected';
  }
  renderDisciplineSettings(discipline);
  syncCustomSelects();
}

function renderDisciplineSettings(discipline = controls.measureDiscipline.value) {
  const isDropJump = discipline === 'drop_jump';
  const isJump = ['squat_jump', 'countermovement_jump', 'drop_jump'].includes(discipline);
  controls.measureBoxSetting.classList.toggle('hidden', !isDropJump);
  controls.measureWeighingSetting.classList.toggle('hidden', !isJump);
}

function sessionDisciplineSettings(discipline = controls.measureDiscipline.value) {
  const settings = {
    traceWindowMs: Number(controls.measureTraceWindowMs.value) || 6000,
  };
  if (['squat_jump', 'countermovement_jump', 'drop_jump'].includes(discipline)) {
    settings.weighingMs = Number(controls.measureWeighingMs.value) || 3500;
  }
  if (discipline === 'drop_jump') {
    settings.boxHeightCm = Number(controls.measureBoxHeightCm.value) || 0;
  }
  return settings;
}

function syncSessionMetaFromControls() {
  state.session.session.name = controls.sessionName.value.trim() || 'ForcePlate Session';
  state.session.session.category = controls.sessionCategory.value;
  state.session.session.updatedAt = Date.now();
  window.JBForcePlateSessionStore.writeStoredState(state.session);
  updateCacheStatus();
}

function syncCurrentAthleteFromControls(athleteId = controls.sessionAthlete.value) {
  state.session.currentAthleteId = Number(athleteId) || 0;
  window.JBForcePlateSessionStore.writeStoredState(state.session);
  renderSessionControls();
}

function applySessionCategory(category) {
  state.session.session.category = category;
  const athletes = category
    ? state.session.athletes.filter((athlete) => athlete.category === category)
    : state.session.athletes;
  if (athletes.length &&
      !athletes.some((athlete) => String(athlete.athleteId) === String(state.session.currentAthleteId))) {
    state.session.currentAthleteId = athletes[0].athleteId;
  }
  state.session.session.updatedAt = Date.now();
  window.JBForcePlateSessionStore.writeStoredState(state.session);
  renderSessionControls();
  updateCacheStatus();
}

function syncDisciplineSettingsFromControls() {
  const discipline = controls.measureDiscipline.value;
  state.session.session.disciplineDefinition = {
    discipline,
    disciplineLabel: window.JBForcePlateModels.disciplineDefinition(discipline).label,
    settings: sessionDisciplineSettings(discipline),
  };
  state.session.session.updatedAt = Date.now();
  window.JBForcePlateSessionStore.writeStoredState(state.session);
  updateCacheStatus();
}

function applyMeasureDiscipline(discipline) {
  const settings = window.JBForcePlateModels.disciplineDefinition(discipline).settings || {};
  controls.measureDiscipline.value = discipline;
  controls.realtimeDiscipline.value = discipline;
  controls.disciplineSelect.value = discipline;
  controls.measureTraceWindowMs.value = settings.traceWindowMs ?? controls.measureTraceWindowMs.value;
  controls.measureWeighingMs.value = settings.weighingMs ?? controls.measureWeighingMs.value;
  controls.measureBoxHeightCm.value = settings.boxHeightCm ?? controls.measureBoxHeightCm.value;
  controls.boxHeightCm.value = controls.measureBoxHeightCm.value;
  renderDisciplineSettings(discipline);
  syncCustomSelect(controls.measureDiscipline);
  syncCustomSelect(controls.realtimeDiscipline);
  syncCustomSelect(controls.disciplineSelect);
  syncDisciplineSettingsFromControls();
  resetRealtimeDetector(false);
  setDiscipline(discipline);
}

async function refreshRosterFromLibrarian() {
  const sessionStore = window.JBForcePlateSessionStore;
  const librarianApi = controls.librarianApi.value.trim();
  sessionStore.writeLibrarianApi(librarianApi);
  controls.rosterStatus.textContent = 'Loading roster...';
  controls.rosterStatus.classList.remove('ok', 'warn');
  const directory = await sessionStore.loadDirectory(librarianApi);
  state.session.athletes = directory.athletes;
  state.session.categories = directory.categories;
  state.session.rosterSource = directory.source;
  state.session.rosterMessage = directory.message;
  if (!directory.athletes.some((athlete) => String(athlete.athleteId) === String(state.session.currentAthleteId))) {
    state.session.currentAthleteId = directory.athletes[0]?.athleteId ?? 0;
  }
  if (state.session.session.category) {
    const validCategories = sessionStore.categories(directory.athletes, directory.categories);
    if (!validCategories.includes(state.session.session.category)) {
      state.session.session.category = '';
    }
  }
  sessionStore.writeStoredState(state.session);
  renderSessionControls();
  return directory;
}

function currentSessionPackage() {
  return {
    session: state.session.session,
    results: state.session.results,
  };
}

function metricResultPayload() {
  const scope = metricScope();
  const marks = metricLandmarks();
  return {
    scope,
    source: state.metricSource,
    metrics: TraceEngine.computeMetrics(
      state.rows,
      scope,
      marks,
      state.discipline,
      { boxHeightCm: Number(controls.boxHeightCm.value) || DefaultSettingsPreset.values.boxHeightCm },
    ),
  };
}

function traceHashPayload() {
  return {
    source: state.source,
    discipline: state.discipline,
    rows: state.rows.map((row) => ({
      t_ms: row.t_ms,
      left_net_n: row.left_net_n,
      right_net_n: row.right_net_n,
      total_net_n: row.total_net_n,
      left_abs_n: row.left_abs_n,
      right_abs_n: row.right_abs_n,
      total_abs_n: row.total_abs_n,
    })),
  };
}

function rawTracePayload() {
  return {
    schema: 'jb.forceplate.raw-trace.v1',
    source: state.source,
    sampleIntervalMs: sampleIntervalMs(state.rows),
    rowCount: state.rows.length,
    firstMs: state.rows[0]?.t_ms ?? 0,
    lastMs: state.rows.at(-1)?.t_ms ?? 0,
    rows: state.rows.map((row) => ({ ...row })),
  };
}

function traceLandmarkHeader(rawTrace) {
  const first = rawTrace?.rows?.[0] || {};
  return Object.fromEntries(
    Object.entries(first).filter(([key]) =>
      key.endsWith('_index') || key.endsWith('_ms') || key.includes('landmark')
    ),
  );
}

function traceFileName(traceId) {
  return `${traceId}.jbfpbin`;
}

function rawTraceFromRowsMeta(rows, meta = {}) {
  return {
    schema: 'jb.forceplate.raw-trace.v1',
    source: meta.source || '',
    sampleIntervalMs: meta.sampleIntervalMs || sampleIntervalMs(rows),
    rowCount: rows.length,
    firstMs: rows[0]?.t_ms ?? meta.firstMs ?? 0,
    lastMs: rows.at(-1)?.t_ms ?? meta.lastMs ?? 0,
    traceId: meta.traceId || '',
    traceHash: meta.traceHash || '',
    resultId: meta.resultId || '',
    fileName: meta.fileName || '',
    rows,
  };
}

function encodeSessionTraceBinary(rawTrace, result = {}) {
  const rows = rawTrace?.rows || [];
  const traceIdValue = result.traceRef?.traceId || result.traceHash || result.resultId || '';
  const header = {
    schema: 'jb.forceplate.trace-bin.v1',
    source: rawTrace.source || '',
    sampleIntervalMs: rawTrace.sampleIntervalMs || sampleIntervalMs(rows),
    rowCount: rows.length,
    firstMs: rawTrace.firstMs ?? rows[0]?.t_ms ?? 0,
    lastMs: rawTrace.lastMs ?? rows.at(-1)?.t_ms ?? 0,
    columns: SessionTraceBinaryColumns,
    landmarks: traceLandmarkHeader(rawTrace),
    traceId: traceIdValue,
    fileName: result.traceRef?.fileName || traceFileName(traceIdValue),
    resultId: result.resultId || '',
    traceHash: result.traceHash || '',
  };
  const encoder = new TextEncoder();
  const magicBytes = encoder.encode(SessionTraceBinaryMagic);
  const headerBytes = encoder.encode(JSON.stringify(header));
  const headerPrefixBytes = magicBytes.length + 4;
  const dataOffset = headerPrefixBytes + headerBytes.length;
  const padBytes = (4 - (dataOffset % 4)) % 4;
  const bytesPerRow = SessionTraceBinaryColumns.length * 4;
  const buffer = new ArrayBuffer(dataOffset + padBytes + rows.length * bytesPerRow);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes.set(magicBytes, 0);
  view.setUint32(magicBytes.length, headerBytes.length, true);
  bytes.set(headerBytes, headerPrefixBytes);
  let offset = dataOffset + padBytes;
  rows.forEach((row) => {
    SessionTraceBinaryColumns.forEach((key) => {
      view.setFloat32(offset, Number(row[key]) || 0, true);
      offset += 4;
    });
  });
  return {
    header,
    blob: new Blob([buffer], { type: 'application/octet-stream' }),
  };
}

function decodeSessionTraceBinary(buffer) {
  const decoder = new TextDecoder();
  const bytes = new Uint8Array(buffer);
  const magic = decoder.decode(bytes.slice(0, SessionTraceBinaryMagic.length));
  if (magic !== SessionTraceBinaryMagic) throw new Error('Invalid ForcePlate trace binary');
  const view = new DataView(buffer);
  const headerLength = view.getUint32(SessionTraceBinaryMagic.length, true);
  const headerStart = SessionTraceBinaryMagic.length + 4;
  const header = JSON.parse(decoder.decode(bytes.slice(headerStart, headerStart + headerLength)));
  const columns = Array.isArray(header.columns) && header.columns.length ? header.columns : SessionTraceBinaryColumns;
  const dataOffsetRaw = headerStart + headerLength;
  const dataOffset = dataOffsetRaw + ((4 - (dataOffsetRaw % 4)) % 4);
  const rows = [];
  let offset = dataOffset;
  const rowCount = Number(header.rowCount) || 0;
  const dt = Number(header.sampleIntervalMs) || 4;
  const firstMs = Number(header.firstMs) || 0;
  for (let index = 0; index < rowCount; index += 1) {
    const row = { t_ms: firstMs + index * dt };
    columns.forEach((key) => {
      row[key] = view.getFloat32(offset, true);
      offset += 4;
    });
    rows.push(row);
  }
  if (rows[0] && header.landmarks) Object.assign(rows[0], header.landmarks);
  return rawTraceFromRowsMeta(rows, header);
}

async function sha256Text(text) {
  if (!crypto?.subtle) {
    return `fallback-${text.length}-${Date.now()}`;
  }
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function currentLandmarkSnapshot() {
  return {
    total: {
      detected: detectedLandmarksFor('total'),
      adjusted: state.adjustedLandmarks.total,
    },
    left: {
      detected: detectedLandmarksFor('left'),
      adjusted: state.adjustedLandmarks.left,
    },
    right: {
      detected: detectedLandmarksFor('right'),
      adjusted: state.adjustedLandmarks.right,
    },
  };
}

async function updateCacheStatus() {
  try {
    const pending = await window.JBForcePlateSessionArchive.pendingSessions();
    const resultCount = pending.reduce((sum, item) => sum + (item.results?.length || 0), 0);
    const currentResultCount = state.session.results?.length || 0;
    const currentSuffix = currentResultCount ? `, current session ${currentResultCount} result(s)` : '';
    if (pending.length) {
      controls.cacheStatus.textContent = `Local cache: ${pending.length} unexported session(s), ${resultCount} result(s)${currentSuffix}`;
      controls.cacheStatus.classList.add('dirty');
    } else {
      controls.cacheStatus.textContent = `Local cache: clear${currentSuffix}`;
      controls.cacheStatus.classList.remove('dirty');
    }
  } catch (error) {
    controls.cacheStatus.textContent = `Local cache unavailable: ${error.message}`;
    controls.cacheStatus.classList.add('dirty');
  }
}

async function clearLocalSessionCache() {
  const pending = await window.JBForcePlateSessionArchive.pendingSessions();
  const allSessions = await window.JBForcePlateSessionArchive.listSessions();
  const resultCount = allSessions.reduce((sum, item) => sum + (item.results?.length || 0), 0);
  const message = [
    'Clear local ForcePlate session cache?',
    '',
    `This removes ${allSessions.length} cached session(s), ${resultCount} result(s) from this browser.`,
    `Unexported right now: ${pending.length} session(s).`,
    '',
    'Exported package files and Librarian data are untouched.',
  ].join('\n');
  if (!window.confirm(message)) return;

  stopMeasurementStatusPolling();
  await stopRealtimeStream('');
  resetRealtimeSimulation();
  await window.JBForcePlateSessionArchive.clearSessions();
  window.JBForcePlateSessionStore.discardSession(state.session);
  state.resultLibrary = [];
  state.activeResultId = null;
  state.analyzeResult = null;
  renderSessionControls();
  renderSessionLeaderboard();
  renderTraceLibrary();
  renderMetrics();
  drawSessionPreview();
  await updateCacheStatus();
  await loadResultsSources();
  setStatus('Local session cache cleared');
}

async function warnAboutPendingSessions() {
  const pending = await window.JBForcePlateSessionArchive.pendingSessions();
  if (!pending.length) return;
  const resultCount = pending.reduce((sum, item) => sum + (item.results?.length || 0), 0);
  setStatus(`WARNING: ${pending.length} unexported local session(s), ${resultCount} result(s) in browser cache`);
}

function resultMatchesAthlete(result, athlete) {
  const athleteId = Number(athlete?.athleteId || state.session.currentAthleteId || 0);
  const athleteName = athlete ? window.JBForcePlateModels.athleteDisplayName(athlete) : '';
  const resultAthleteId = Number(result.athleteId || result.athleteSnapshot?.athleteId || 0);
  if (athleteId) return resultAthleteId === athleteId;
  return result.athleteName === athleteName;
}

function nextSessionAttemptNumber(discipline, athlete, results = state.session.results) {
  return results.filter((result) => {
    const resultDiscipline = result.disciplineDefinition?.discipline || result.discipline;
    return resultDiscipline === discipline && resultMatchesAthlete(result, athlete);
  }).length + 1;
}

async function saveCurrentTraceResult() {
  if (!state.rows.length) {
    return { saved: false, reason: 'empty' };
  }
  if (!state.session.session.active) {
    return { saved: false, reason: 'inactive' };
  }
  const session = state.session.session;
  const athlete = window.JBForcePlateSessionStore.athleteById(state.session);
  const athleteId = Number(athlete?.athleteId || state.session.currentAthleteId || 0);
  const athleteName = athlete ? window.JBForcePlateModels.athleteDisplayName(athlete) : '';
  const discipline = session.disciplineDefinition.discipline;
  const settings = session.disciplineDefinition.settings;
  const attemptNumber = nextSessionAttemptNumber(discipline, athlete);
  const attemptCode = `${realtimeDisciplineShortLabel(discipline)}_${String(attemptNumber).padStart(2, '0')}`;
  const traceHash = await sha256Text(JSON.stringify(traceHashPayload()));
  const rawTrace = rawTracePayload();
  const traceId = traceHash;
  const metrics = metricResultPayload();
  const result = window.JBForcePlateModels.createSessionResult({
    sessionId: session.sessionId,
    athlete,
    category: session.category,
    discipline,
    disciplineSettings: {
      ...settings,
      attemptNumber,
      attemptCode,
      attemptLabel: attemptCode,
    },
    rawTrace,
    traceHash,
    traceRef: {
      traceId,
      fileName: traceFileName(traceId),
      source: state.source,
      rowCount: rawTrace.rowCount,
      firstMs: rawTrace.firstMs,
      lastMs: rawTrace.lastMs,
      sampleIntervalMs: rawTrace.sampleIntervalMs,
    },
    metrics,
    landmarks: currentLandmarkSnapshot(),
  });
  if (state.session.results.some((item) => item.traceHash === traceHash)) {
    return { saved: false, reason: 'duplicate' };
  }
  state.session.results.push(result);
  session.updatedAt = Date.now();
  session.storageState = {
    ...(session.storageState || {}),
    exportedAt: 0,
    syncedAt: 0,
  };
  const savedPackage = await window.JBForcePlateSessionArchive.saveSession(currentSessionPackage());
  state.session.session = savedPackage.session;
  state.session.results = savedPackage.results;
  window.JBForcePlateSessionStore.writeStoredState(state.session);
  renderSessionControls();
  await updateCacheStatus();
  renderSessionLeaderboard();
  drawSessionPreview();
  setStatus(`Auto-saved result ${state.session.results.length}: ${result.athleteName}`);
  return { saved: true, result };
}

async function autosaveLoadedTrace() {
  const outcome = await saveCurrentTraceResult();
  if (outcome.saved || outcome.reason === 'inactive') return outcome;
  if (outcome.reason === 'duplicate') {
    setStatus('Trace loaded, already saved in current session');
    return outcome;
  }
  return outcome;
}

function exportFileName(sessionPackage) {
  const session = sessionPackage.session;
  const date = new Date(session.startedAt || session.createdAt || Date.now())
    .toISOString()
    .slice(0, 10);
  const name = String(session.name || 'ForcePlate_Session')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'ForcePlate_Session';
  return `JBFP_${date}_${name}_${session.sessionId}.json`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportableSessionPackage(sessionPackage) {
  return {
    ...sessionPackage,
    results: (sessionPackage.results || []).map((result) => {
      const {
        rawTrace: _rawTrace,
        traceData: _traceData,
        trace: _trace,
        ...rest
      } = result;
      return rest;
    }),
  };
}

async function sha256Buffer(buffer) {
  if (!crypto?.subtle) {
    return `fallback-${buffer.byteLength}-${Date.now()}`;
  }
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function encodeJbBinaryPackage(sessionPackage, options = {}) {
  const encoder = new TextEncoder();
  const traceBuffers = [];
  const traces = [];
  for (const result of sessionPackage.results || []) {
    const inlineRawTrace = result.rawTrace || result.traceData || result.trace || null;
    const rawTrace = inlineRawTrace || await window.JBForcePlateSessionArchive.loadTrace(result.traceRef?.traceId);
    if (!rawTrace?.rows?.length) continue;
    const traceId = result.traceRef?.traceId || result.traceHash || result.resultId;
    const fileName = result.traceRef?.fileName || traceFileName(traceId);
    const encoded = encodeSessionTraceBinary(rawTrace, {
      ...result,
      traceRef: {
        ...(result.traceRef || {}),
        traceId,
        fileName,
      },
    });
    const buffer = await encoded.blob.arrayBuffer();
    traceBuffers.push(buffer);
    traces.push({
      traceId,
      resultId: result.resultId || '',
      traceHash: result.traceHash || '',
      fileName,
      byteLength: buffer.byteLength,
    });
  }

  const payloadLength = traceBuffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const payload = new Uint8Array(payloadLength);
  let payloadOffset = 0;
  traceBuffers.forEach((buffer) => {
    payload.set(new Uint8Array(buffer), payloadOffset);
    payloadOffset += buffer.byteLength;
  });

  const manifest = {
    schema: 'jb.performance.binary-package.v1',
    version: 1,
    packageType: options.packageType || 'forceplate_session',
    createdAt: Date.now(),
    compression: 'none',
    encryption: 'none',
    payloadSha256: await sha256Buffer(payload.buffer),
    sessionPackage: exportableSessionPackage(sessionPackage),
    traces,
  };
  const magicBytes = encoder.encode(JbBinaryPackageMagic);
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const buffer = new ArrayBuffer(magicBytes.length + 4 + manifestBytes.length + payload.byteLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set(magicBytes, 0);
  view.setUint32(magicBytes.length, manifestBytes.length, true);
  bytes.set(manifestBytes, magicBytes.length + 4);
  bytes.set(payload, magicBytes.length + 4 + manifestBytes.length);
  const session = sessionPackage.session || {};
  const date = new Date(session.startedAt || session.createdAt || Date.now())
    .toISOString()
    .slice(0, 10);
  const name = String(options.name || session.name || 'Session')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'Session';
  return {
    manifest,
    blob: new Blob([buffer], { type: 'application/octet-stream' }),
    fileName: `JB_${date}_${name}_${session.sessionId || 'session'}.jbbin`,
  };
}

async function decodeJbBinaryPackage(buffer) {
  const decoder = new TextDecoder();
  const bytes = new Uint8Array(buffer);
  const magic = decoder.decode(bytes.slice(0, JbBinaryPackageMagic.length));
  if (magic !== JbBinaryPackageMagic) throw new Error('Invalid JB binary package');
  const view = new DataView(buffer);
  const manifestLength = view.getUint32(JbBinaryPackageMagic.length, true);
  const manifestStart = JbBinaryPackageMagic.length + 4;
  const manifestEnd = manifestStart + manifestLength;
  const manifest = JSON.parse(decoder.decode(bytes.slice(manifestStart, manifestEnd)));
  if (manifest.schema !== 'jb.performance.binary-package.v1') {
    throw new Error('Unsupported JB binary package schema');
  }
  if (manifest.payloadSha256 && crypto?.subtle) {
    const actualHash = await sha256Buffer(buffer.slice(manifestEnd));
    if (actualHash !== manifest.payloadSha256) {
      throw new Error('JB binary payload checksum mismatch');
    }
  }
  const traceBins = new Map();
  let offset = manifestEnd;
  for (const trace of manifest.traces || []) {
    const length = Number(trace.byteLength) || 0;
    if (length <= 0 || offset + length > buffer.byteLength) {
      throw new Error('Corrupt JB binary trace block');
    }
    const rawTrace = decodeSessionTraceBinary(buffer.slice(offset, offset + length));
    [
      trace.fileName,
      trace.fileName?.replace(/\.jbfpbin$/i, ''),
      trace.traceId,
      trace.traceHash,
      trace.resultId,
      rawTrace.fileName,
      rawTrace.fileName?.replace(/\.jbfpbin$/i, ''),
      rawTrace.traceId,
      rawTrace.traceHash,
      rawTrace.resultId,
    ].filter(Boolean).forEach((key) => traceBins.set(key, rawTrace));
    offset += length;
  }
  return {
    manifest,
    sessionPackage: manifest.sessionPackage,
    traceBins,
  };
}

async function exportTraceBinaryFiles(sessionPackage) {
  let exported = 0;
  for (const result of sessionPackage.results || []) {
    const inlineRawTrace = result.rawTrace || result.traceData || result.trace || null;
    const rawTrace = inlineRawTrace || await window.JBForcePlateSessionArchive.loadTrace(result.traceRef?.traceId);
    if (!rawTrace?.rows?.length) continue;
    const traceId = result.traceRef?.traceId || result.traceHash || result.resultId;
    const fileName = result.traceRef?.fileName || traceFileName(traceId);
    const { blob } = encodeSessionTraceBinary(rawTrace, result);
    downloadBlob(blob, fileName);
    exported += 1;
  }
  return exported;
}

async function exportCurrentSessionPackage() {
  if (!state.session.results.length) {
    setStatus('Session has no results to export');
    return false;
  }
  const exportedAt = Date.now();
  const exportPackage = currentSessionPackage();
  exportPackage.session = {
    ...exportPackage.session,
    updatedAt: exportedAt,
    storageState: {
      ...(exportPackage.session.storageState || {}),
      exportedAt,
    },
  };
  const exportedPackage = await window.JBForcePlateSessionArchive.saveSession(exportPackage);
  state.session.session = exportedPackage.session;
  state.session.results = exportedPackage.results;
  window.JBForcePlateSessionStore.writeStoredState(state.session);
  const jbPackage = await encodeJbBinaryPackage(exportedPackage);
  downloadBlob(jbPackage.blob, jbPackage.fileName);
  await updateCacheStatus();
  await loadResultsSources();
  setStatus(`Session export prepared: ${jbPackage.fileName} (${jbPackage.manifest.traces.length} trace block(s))`);
  return true;
}

function realtimeExportFileBase() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/, 'Z');
  return `JBFP_realtime_${stamp}`;
}

function estimateRealtimeBaseline(rows) {
  const baselineRows = rows.filter((row) => row.t_ms <= 150);
  const sourceRows = baselineRows.length >= 3 ? baselineRows : rows.slice(0, Math.min(12, rows.length));
  const median = (values) => {
    const sorted = values.filter(finite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    left: median(sourceRows.map((row) => row.left_abs_n)),
    right: median(sourceRows.map((row) => row.right_abs_n)),
    total: median(sourceRows.map((row) => row.total_abs_n)),
  };
}

function realtimeChannelRows(samples, startMs, endMs, guardMs = 80) {
  return samples
    .filter((sample) => sample.tMs >= startMs - guardMs && sample.tMs <= endMs + guardMs)
    .map((sample) => ({ tMs: sample.tMs, value: sample.value }))
    .sort((a, b) => a.tMs - b.tMs);
}

function realtimeInterpolatedValue(samples, tMs, maxGapMs = 40) {
  if (!samples.length) return NaN;
  if (tMs <= samples[0].tMs) {
    return Math.abs(samples[0].tMs - tMs) <= maxGapMs ? samples[0].value : NaN;
  }
  for (let index = 1; index < samples.length; index += 1) {
    const prev = samples[index - 1];
    const next = samples[index];
    if (tMs > next.tMs) continue;
    const gapMs = next.tMs - prev.tMs;
    if (gapMs <= 0 || gapMs > maxGapMs) return NaN;
    const ratio = (tMs - prev.tMs) / gapMs;
    return prev.value + (next.value - prev.value) * ratio;
  }
  const last = samples.at(-1);
  return Math.abs(tMs - last.tMs) <= maxGapMs ? last.value : NaN;
}

function realtimeRowsForSegment(segment, paddingMs = 100) {
  const startMs = Math.max(0, segment.startMs - paddingMs);
  const endMs = segment.endMs + paddingMs;
  const sampleMs = realtimeSampleIntervalMs();
  const leftSamples = realtimeChannelRows(state.realtime.leftSamples, startMs, endMs);
  const rightSamples = realtimeChannelRows(state.realtime.rightSamples, startMs, endMs);
  if (leftSamples.length < 2 || rightSamples.length < 2) return [];
  const firstMs = Math.max(startMs, leftSamples[0].tMs, rightSamples[0].tMs);
  const lastMs = Math.min(endMs, leftSamples.at(-1).tMs, rightSamples.at(-1).tMs);
  const maxGapMs = Math.max(40, sampleMs * 6);
  const rows = [];
  for (let tMs = firstMs; tMs <= lastMs + sampleMs / 2; tMs += sampleMs) {
    const left = realtimeInterpolatedValue(leftSamples, tMs, maxGapMs);
    const right = realtimeInterpolatedValue(rightSamples, tMs, maxGapMs);
    if (!finite(left) || !finite(right)) continue;
    rows.push({
      t_ms: tMs,
      left_abs_n: left,
      right_abs_n: right,
      total_abs_n: left + right,
      left_net_n: left,
      right_net_n: right,
      total_net_n: left + right,
    });
  }
  if (rows.length < 2) return [];
  const originMs = rows[0].t_ms;
  rows.forEach((row) => {
    row.t_ms = Math.max(0, row.t_ms - originMs);
  });
  const baseline = estimateRealtimeBaseline(rows);
  rows.forEach((row) => {
    row.left_net_n = row.left_abs_n - baseline.left;
    row.right_net_n = row.right_abs_n - baseline.right;
    row.total_net_n = row.total_abs_n - baseline.total;
  });
  return rows;
}

async function exportSelectedRealtimeSegments() {
  const segments = state.realtime.detector.segments.filter((segment) => segment.checked);
  if (!segments.length) {
    setStatus('No selected realtime jumps to export');
    return false;
  }
  const athlete = window.JBForcePlateSessionStore.athleteById(state.session);
  const category = controls.realtimeCategory?.value || controls.sessionCategory?.value ||
    state.session.session.category || athlete?.category || '';
  const exportedAt = Date.now();
  const activeSession = state.session.session.active;
  const sessionId = activeSession
    ? state.session.session.sessionId
    : window.JBForcePlateModels.createId('rt-session');
  const fileBase = realtimeExportFileBase();
  const sessionPackage = {
    schema: 'jb.forceplate.session-package.v1',
    savedAt: exportedAt,
    session: activeSession
      ? state.session.session
      : window.JBForcePlateModels.createSessionConfig({
        sessionId,
        active: false,
        name: 'Realtime Export',
        category,
        createdAt: exportedAt,
        startedAt: exportedAt,
        stoppedAt: exportedAt,
        updatedAt: exportedAt,
        discipline: realtimeDetectorDiscipline(),
        disciplineSettings: {
          source: 'realtime',
          exportPaddingMs: 100,
          realtimeRateHz: Math.round(1000 / realtimeSampleIntervalMs()),
        },
        storageState: {
          localSavedAt: exportedAt,
          exportedAt,
          syncedAt: 0,
        },
      }),
    results: [],
  };

  let exportedTraceCount = 0;
  const existingResults = activeSession ? [...state.session.results] : [];
  for (const segment of segments) {
    const rows = realtimeRowsForSegment(segment, 100);
    if (rows.length < 2) continue;
    const resultOrder = sessionPackage.results.length;
    const attemptNumber = activeSession
      ? nextSessionAttemptNumber(segment.discipline, athlete, [...existingResults, ...sessionPackage.results])
      : sessionPackage.results.filter((result) =>
        result.discipline === segment.discipline && resultMatchesAthlete(result, athlete)).length + 1;
    const attemptCode = `${segment.shortLabel}_${String(attemptNumber).padStart(2, '0')}`;
    const attemptLabel = `${attemptCode}_${Math.round(segment.flightHeightCm || 0)}cm`;
    const resultId = window.JBForcePlateModels.createId('rt-result');
    const traceHash = await sha256Text(JSON.stringify({
      discipline: segment.discipline,
      rows: rows.map((row) => [
        Math.round(row.t_ms * 1000) / 1000,
        Math.round(row.left_abs_n * 10) / 10,
        Math.round(row.right_abs_n * 10) / 10,
        Math.round(row.total_abs_n * 10) / 10,
      ]),
    }));
    if (activeSession && state.session.results.some((result) => result.traceHash === traceHash)) {
      continue;
    }
    const traceId = traceHash;
    const fileName = `${fileBase}_${attemptLabel}.jbfpbin`;
    const rawTrace = rawTraceFromRowsMeta(rows, {
      source: 'realtime',
      sampleIntervalMs: sampleIntervalMs(rows),
      traceId,
      traceHash,
      resultId,
      fileName,
      firstMs: 0,
      lastMs: rows.at(-1)?.t_ms ?? 0,
    });
    const result = window.JBForcePlateModels.createSessionResult({
      resultId,
      sessionId,
      measuredAt: exportedAt + resultOrder,
      athlete,
      category,
      discipline: segment.discipline,
      disciplineSettings: {
        source: 'realtime',
        attemptNumber,
        attemptCode,
        attemptLabel,
        exportPaddingMs: 100,
        flightMs: segment.flightMs,
        flightHeightCm: segment.flightHeightCm,
      },
      rawTrace,
      traceHash,
      traceRef: {
        traceId,
        fileName,
        source: 'realtime',
        rowCount: rawTrace.rowCount,
        firstMs: rawTrace.firstMs,
        lastMs: rawTrace.lastMs,
        sampleIntervalMs: rawTrace.sampleIntervalMs,
      },
      metrics: null,
      landmarks: {
        source: 'realtime-detector',
        flightStartMs: segment.flightStartMs,
        landingMs: segment.landingMs,
        exportStartMs: segment.startMs - 100,
        exportEndMs: segment.endMs + 100,
      },
    });
    sessionPackage.results.push(result);
    exportedTraceCount += 1;
  }

  if (!sessionPackage.results.length) {
    setStatus('Selected realtime jumps had no exportable samples');
    return false;
  }
  if (activeSession) {
    state.session.results.push(...sessionPackage.results);
    state.session.session.updatedAt = Date.now();
    state.session.session.storageState = {
      ...(state.session.session.storageState || {}),
      exportedAt: 0,
      syncedAt: 0,
    };
    const savedPackage = await window.JBForcePlateSessionArchive.saveSession(currentSessionPackage());
    state.session.session = savedPackage.session;
    state.session.results = savedPackage.results;
    window.JBForcePlateSessionStore.writeStoredState(state.session);
    renderSessionControls();
    renderSessionLeaderboard();
    drawSessionPreview();
    await updateCacheStatus();
    setStatus(`Realtime added to session: ${sessionPackage.results.length} jump(s), ${exportedTraceCount} trace block(s)`);
    return true;
  }
  const jbPackage = await encodeJbBinaryPackage(sessionPackage, { name: fileBase });
  downloadBlob(jbPackage.blob, jbPackage.fileName);
  setStatus(`Realtime export prepared: ${sessionPackage.results.length} jump(s), ${exportedTraceCount} trace block(s)`);
  return true;
}

function sessionPackageLabel(sessionPackage, sourceLabel) {
  const session = sessionPackage.session || {};
  const resultCount = sessionPackage.results?.length || 0;
  const startedAt = session.startedAt || session.createdAt || session.updatedAt || sessionPackage.savedAt;
  const date = startedAt ? new Date(startedAt).toLocaleString() : 'no date';
  return `${sourceLabel}: ${session.name || 'Unnamed session'} (${resultCount}) - ${date}`;
}

function isSessionPackage(value) {
  return Boolean(value?.session?.sessionId && Array.isArray(value.results));
}

function metricValue(metrics, labels) {
  const wanted = new Set(labels.map((label) => String(label).toLowerCase()));
  for (const item of metrics || []) {
    if (!Array.isArray(item) || item[0] === '__section') continue;
    for (let index = 0; index < item.length - 1; index += 2) {
      if (wanted.has(String(item[index]).toLowerCase())) {
        return item[index + 1];
      }
    }
  }
  return '-';
}

function currentPreviewMetrics() {
  if (!state.rows.length) return [];
  try {
    return metricResultPayload().metrics || [];
  } catch (error) {
    return [];
  }
}

function renderSessionStats() {
  const metrics = currentPreviewMetrics();
  const lastResult = state.session.results.at(-1);
  const athleteRecord = window.JBForcePlateSessionStore.athleteById(state.session);
  const athlete = lastResult?.athleteName ||
      (athleteRecord ? window.JBForcePlateModels.athleteDisplayName(athleteRecord) : '') ||
      'No athlete';
  const jersey = athleteRecord?.number || athleteRecord?.jersey || '';
  const category = lastResult?.category || athleteRecord?.category || state.session.session.category || '';
  const primary = ['Jump Height', metricValue(metrics, ['Flight Time', 'Jump Height', 'Height'])];
  const stats = [
    ['ToV + D', metricValue(metrics, ['ToV + D'])],
    ['DIS', metricValue(metrics, ['DIS'])],
    ['Peak Propulsive Power', metricValue(metrics, ['Peak Propulsive Power', 'Peak Power'])],
    ['Peak Force', metricValue(metrics, ['Peak Force'])],
  ];
  controls.sessionStats.innerHTML = `
    <h3>Current Measurement</h3>
    <div class="sessionCurrentGrid">
      <div class="sessionAthleteCard">
        <div class="sessionAthletePortrait" aria-hidden="true"></div>
        <div>
          <span>Athlete</span>
          <strong>${escapeHtml(athlete)}</strong>
          <small>${escapeHtml([jersey ? `#${jersey}` : '', category].filter(Boolean).join('  '))}</small>
        </div>
      </div>
      <div class="sessionStat sessionStatPrimary">
        <span>${escapeHtml(primary[0])}</span>
        <strong>${escapeHtml(primary[1])}</strong>
      </div>
      ${stats.map(([label, value]) => `
        <div class="sessionStat">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSessionLeaderboard() {
  const results = [...(state.session.results || [])];
  if (!results.length) {
    controls.sessionLeaderboard.innerHTML = '<div class="traceEmpty">No session results yet.</div>';
    renderSessionStats();
    return;
  }
  const ranked = results
    .map((result, index) => ({
      result,
      index,
      score: `${resultRawRowCount(result)} samples`,
    }))
    .sort((a, b) => (b.result.measuredAt || 0) - (a.result.measuredAt || 0));
  controls.sessionLeaderboard.innerHTML = ranked.map((item, rank) => `
    <div class="leaderboardItem">
      <strong>${rank + 1}</strong>
      <div>
        <strong>${escapeHtml(item.result.athleteName || 'Unknown athlete')}</strong>
        <span>${escapeHtml(window.JBForcePlateModels.DisciplineDefinitions[item.result.discipline]?.label || item.result.discipline || '')}</span>
      </div>
      <strong>${escapeHtml(item.score)}</strong>
    </div>
  `).join('');
  renderSessionStats();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderResultsPage() {
  const selected = state.results.packages.find((item) => item.key === controls.resultsSessionSelect.value)
    || state.results.packages[0];
  if (!selected) {
    controls.resultsSummary.innerHTML = '<div class="resultsEmpty">No saved sessions in cache. Load a results folder to inspect exported sessions.</div>';
    controls.resultsList.innerHTML = '';
    return;
  }

  state.results.selectedKey = selected.key;
  controls.resultsSessionSelect.value = selected.key;
  const session = selected.package.session || {};
  const results = selected.package.results || [];
  const storage = session.storageState || {};
  controls.resultsSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(session.name || 'Unnamed session')}</strong>
      <span>${escapeHtml(selected.sourceLabel)}</span>
    </div>
    <div>${results.length} result(s)</div>
    <div>${escapeHtml(session.category || 'No group')}</div>
    <div>${storage.exportedAt ? 'Exported' : 'Local cache'}</div>
  `;
  controls.resultsList.innerHTML = results.map((result, index) => {
    const disciplineId = result.disciplineDefinition?.discipline || result.discipline;
    const discipline = (disciplineId ? window.JBForcePlateModels.disciplineDefinition(disciplineId)?.label : '')
      || result.disciplineDefinition?.disciplineLabel
      || disciplineId
      || 'Discipline';
    const measuredAt = result.measuredAt ? new Date(result.measuredAt).toLocaleString() : '';
    const rawTrace = result.rawTrace || result.traceData || result.trace || {};
    const rowCount = rawTrace.rowCount || rawTrace.rows?.length || result.traceRef?.rowCount || 0;
    const span = finite(rawTrace.firstMs) && finite(rawTrace.lastMs)
      ? `${Math.round(rawTrace.firstMs)}-${Math.round(rawTrace.lastMs)} ms`
      : result.traceRef ? `${Math.round(result.traceRef.firstMs || 0)}-${Math.round(result.traceRef.lastMs || 0)} ms` : '-';
    return `
      <article class="resultCard">
        <header>
          <div>
            <strong>${index + 1}. ${escapeHtml(result.athleteName || 'Unknown athlete')}</strong>
            <span>${escapeHtml(discipline)}</span>
          </div>
          <time>${escapeHtml(measuredAt)}</time>
        </header>
        <div class="resultMetrics">
          <div><span>Athlete ID</span><strong>${escapeHtml(result.athleteId || '-')}</strong></div>
          <div><span>Category</span><strong>${escapeHtml(result.category || '-')}</strong></div>
          <div><span>Samples</span><strong>${escapeHtml(rowCount || '-')}</strong></div>
          <div><span>Trace</span><strong>${escapeHtml(span)}</strong></div>
        </div>
      </article>
    `;
  }).join('');
}

function renderResultsOptions() {
  const previousKey = state.results.selectedKey || controls.resultsSessionSelect.value;
  controls.resultsSessionSelect.innerHTML = '';
  if (!state.results.packages.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Cache: empty';
    controls.resultsSessionSelect.appendChild(option);
    syncCustomSelect(controls.resultsSessionSelect);
    renderResultsPage();
    return;
  }
  state.results.packages.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.key;
    option.textContent = item.label;
    controls.resultsSessionSelect.appendChild(option);
  });
  controls.resultsSessionSelect.value = state.results.packages.some((item) => item.key === previousKey)
    ? previousKey
    : state.results.packages[0].key;
  syncCustomSelect(controls.resultsSessionSelect);
  renderResultsPage();
}

async function loadResultsSources() {
  const cachePackages = await window.JBForcePlateSessionArchive.listSessions();
  state.results.packages = [
    ...cachePackages.map((sessionPackage) => ({
      key: `cache:${sessionPackage.session.sessionId}`,
      sourceLabel: 'Cache',
      package: sessionPackage,
      label: sessionPackageLabel(sessionPackage, 'Cache'),
    })),
    ...state.results.folderPackages,
  ];
  renderResultsOptions();
}

async function parseResultsFiles(files, folderName = '') {
  const loaded = [];
  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    try {
      const sourceLabel = folderName || 'Folder';
      if (lowerName.endsWith('.jbbin')) {
        const decoded = await decodeJbBinaryPackage(await file.arrayBuffer());
        if (!isSessionPackage(decoded.sessionPackage)) continue;
        loaded.push({
          key: `folder-jbbin:${file.name}:${decoded.sessionPackage.session.sessionId}`,
          sourceLabel,
          package: decoded.sessionPackage,
          label: sessionPackageLabel(decoded.sessionPackage, sourceLabel),
        });
        continue;
      }
      if (!lowerName.endsWith('.json')) continue;
      const parsed = JSON.parse(await file.text());
      if (!isSessionPackage(parsed)) continue;
      loaded.push({
        key: `folder:${file.name}:${parsed.session.sessionId}`,
        sourceLabel,
        package: parsed,
        label: sessionPackageLabel(parsed, sourceLabel),
      });
    } catch (error) {
      console.warn(`Skipping results file ${file.name}: ${error.message}`);
    }
  }
  loaded.sort((a, b) => (b.package.session.updatedAt || b.package.savedAt || 0) - (a.package.session.updatedAt || a.package.savedAt || 0));
  state.results.folderPackages = loaded;
  state.results.folderName = folderName;
  await loadResultsSources();
  setStatus(loaded.length ? `Loaded ${loaded.length} session file(s) from results folder` : 'No ForcePlate session files found in selected folder');
}

async function pickResultsFolder() {
  if (window.showDirectoryPicker) {
    try {
      const directory = await window.showDirectoryPicker();
      const files = [];
      for await (const entry of directory.values()) {
        const lowerName = entry.name.toLowerCase();
        if (entry.kind !== 'file' || (!lowerName.endsWith('.jbbin') && !lowerName.endsWith('.json'))) continue;
        files.push(await entry.getFile());
      }
      await parseResultsFiles(files, directory.name);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
      setStatus(`Folder picker unavailable: ${error.message}`);
    }
  }
  controls.resultsFolderInput.click();
}

async function initializeSessionControls() {
  renderSessionControls();
  await restoreCurrentSessionFromArchive();
  const directory = await refreshRosterFromLibrarian();
  setStatus(directory.message);
  await updateCacheStatus();
  await warnAboutPendingSessions();
}

async function restoreCurrentSessionFromArchive() {
  const sessionId = state.session.session?.sessionId;
  if (!sessionId) return;
  try {
    const archived = await window.JBForcePlateSessionArchive.loadSession(sessionId);
    if (!archived) return;
    state.session.results = Array.isArray(archived.results) ? archived.results : [];
    state.session.session.storageState = {
      ...(state.session.session.storageState || {}),
      ...(archived.session?.storageState || {}),
    };
    renderSessionControls();
    renderSessionLeaderboard();
    drawSessionPreview();
  } catch (error) {
    setStatus(`Session restore warning: ${error.message}`);
  }
}

function finite(value) {
  return Number.isFinite(value);
}

function numberOrNaN(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha = 1) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!match) return hex;
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  return `rgba(${r},${g},${b},${clamp(Number(alpha), 0, 1)})`;
}

function dashForStyle(style, ratio = 1) {
  if (style === 'dash') return [9 * ratio, 6 * ratio];
  if (style === 'dot') return [2 * ratio, 5 * ratio];
  return [];
}

function settingControls() {
  return [
    controls.contactThreshold,
    controls.sustainMs,
    controls.minFlightMs,
    controls.onsetSearchMs,
    controls.onsetSlopeN,
    controls.onsetSustainMs,
    controls.boxHeightCm,
  ];
}

function readSettingValues() {
  return {
    contactThreshold: Number(controls.contactThreshold.value) || DefaultSettingsPreset.values.contactThreshold,
    sustainMs: Number(controls.sustainMs.value) || DefaultSettingsPreset.values.sustainMs,
    minFlightMs: Number(controls.minFlightMs.value) || DefaultSettingsPreset.values.minFlightMs,
    onsetSearchMs: Number(controls.onsetSearchMs.value) || DefaultSettingsPreset.values.onsetSearchMs,
    onsetSlopeN: Number(controls.onsetSlopeN.value) || DefaultSettingsPreset.values.onsetSlopeN,
    onsetSustainMs: Number(controls.onsetSustainMs.value) || DefaultSettingsPreset.values.onsetSustainMs,
    boxHeightCm: Number(controls.boxHeightCm.value) || DefaultSettingsPreset.values.boxHeightCm,
  };
}

function applySettingValues(values) {
  controls.contactThreshold.value = values.contactThreshold ?? DefaultSettingsPreset.values.contactThreshold;
  controls.sustainMs.value = values.sustainMs ?? DefaultSettingsPreset.values.sustainMs;
  controls.minFlightMs.value = values.minFlightMs ?? DefaultSettingsPreset.values.minFlightMs;
  controls.onsetSearchMs.value = values.onsetSearchMs ?? DefaultSettingsPreset.values.onsetSearchMs;
  controls.onsetSlopeN.value = values.onsetSlopeN ?? DefaultSettingsPreset.values.onsetSlopeN;
  controls.onsetSustainMs.value = values.onsetSustainMs ?? DefaultSettingsPreset.values.onsetSustainMs;
  controls.boxHeightCm.value = values.boxHeightCm ?? DefaultSettingsPreset.values.boxHeightCm;
}

function storageRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function storageWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // LocalStorage can be disabled in some browsers; analyzer still works without persistence.
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function setAppTab(tab) {
  state.appTab = tab;
  controls.appTabMeasure.classList.toggle('active', tab === 'measure');
  controls.appTabAnalyze.classList.toggle('active', tab === 'analyze');
  controls.appTabResults.classList.toggle('active', tab === 'results');
  controls.measureView.classList.toggle('active', tab === 'measure');
  controls.analyzeView.classList.toggle('active', tab === 'analyze');
  controls.resultsView.classList.toggle('active', tab === 'results');
  if (tab === 'analyze') {
    draw();
  } else if (tab === 'measure') {
    if (state.measurePanelTab === 'session') {
      drawSessionPreview();
    } else {
      drawRealtime();
    }
  } else if (tab === 'results') {
    loadResultsSources().catch((error) => setStatus(`Results load error: ${error.message}`));
  }
}

function rowsToCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => {
      const value = row[header];
      if (value === undefined || value === null || Number.isNaN(value)) return '';
      return String(value);
    }).join(','));
  });
  return `${lines.join('\n')}\n`;
}

function exportCurrentCsv() {
  if (!state.rows.length) {
    setStatus('No trace to export');
    return;
  }
  const blob = new Blob([rowsToCsv(state.rows)], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = URL.createObjectURL(blob);
  link.download = `forceplate_trace_${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  setStatus('CSV exported');
}

function savedPresets() {
  const presets = storageRead(PresetStorageKey, []);
  return Array.isArray(presets) ? presets : [];
}

function renderPresetOptions() {
  const active = localStorage.getItem(ActivePresetStorageKey) || 'last';
  const presets = savedPresets();
  controls.settingsPreset.innerHTML = [
    '<option value="last">Last used</option>',
    '<option value="default">Default</option>',
    ...presets.map((preset) => `<option value="user:${encodeURIComponent(preset.name)}">${escapeHtml(preset.name)}</option>`),
  ].join('');
  controls.settingsPreset.value = [...controls.settingsPreset.options].some((option) => option.value === active)
    ? active
    : 'last';
  syncCustomSelect(controls.settingsPreset);
}

function applyPresetSelection() {
  const selected = controls.settingsPreset.value;
  if (selected === 'default') {
    applySettingValues(DefaultSettingsPreset.values);
    controls.presetName.value = DefaultSettingsPreset.name;
  } else if (selected.startsWith('user:')) {
    const name = decodeURIComponent(selected.slice(5));
    const preset = savedPresets().find((item) => item.name === name);
    if (preset) {
      applySettingValues(preset.values);
      controls.presetName.value = preset.name;
    }
  } else {
    const last = storageRead(SettingsStorageKey, DefaultSettingsPreset.values);
    applySettingValues(last);
    controls.presetName.value = '';
  }
  localStorage.setItem(ActivePresetStorageKey, selected);
  storageWrite(SettingsStorageKey, readSettingValues());
  draw();
}

function persistCurrentSettings() {
  storageWrite(SettingsStorageKey, readSettingValues());
  localStorage.setItem(ActivePresetStorageKey, controls.settingsPreset.value || 'last');
}

function saveCurrentPreset() {
  const fallbackName = controls.settingsPreset.value.startsWith('user:')
    ? decodeURIComponent(controls.settingsPreset.value.slice(5))
    : `Preset ${savedPresets().length + 1}`;
  const name = (controls.presetName.value || fallbackName).trim();
  if (!name) return;

  const presets = savedPresets().filter((preset) => preset.name !== name);
  presets.push({ name, values: readSettingValues() });
  presets.sort((a, b) => a.name.localeCompare(b.name));
  storageWrite(PresetStorageKey, presets);
  localStorage.setItem(ActivePresetStorageKey, `user:${encodeURIComponent(name)}`);
  renderPresetOptions();
  controls.settingsPreset.value = `user:${encodeURIComponent(name)}`;
  controls.presetName.value = name;
  setStatus(`Preset saved: ${name}`);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = numberOrNaN(parts[index]);
    });
    return row;
  });
}

const TraceBinaryMagic = 0x31425446;
const TraceBinaryLandmarkNames = [
  'total_takeoff_index',
  'total_landing_index',
  'left_onset_index',
  'left_unweighting_min_index',
  'left_propulsive_start_index',
  'left_takeoff_index',
  'left_landing_index',
  'right_onset_index',
  'right_unweighting_min_index',
  'right_propulsive_start_index',
  'right_takeoff_index',
  'right_landing_index',
  'total_onset_index',
  'total_unweighting_min_index',
  'total_propulsive_start_index',
  'total_takeoff2_index',
  'total_landing2_index',
  'left_drop_landing_index',
  'left_impact_peak_index',
  'left_contact_trough_index',
  'left_start_concentric_index',
  'left_drive_off_peak_index',
  'left_flight_landing_index',
  'left_landing_peak_index',
  'right_drop_landing_index',
  'right_impact_peak_index',
  'right_contact_trough_index',
  'right_start_concentric_index',
  'right_drive_off_peak_index',
  'right_flight_landing_index',
  'right_landing_peak_index',
  'total_drop_landing_index',
  'total_impact_peak_index',
  'total_contact_trough_index',
  'total_start_concentric_index',
  'total_drive_off_peak_index',
  'total_flight_landing_index',
  'total_landing_peak_index',
  'left_jump_end_index',
  'right_jump_end_index',
  'total_jump_end_index',
];
const TraceBinaryDiscipline = {
  0: 'squat_jump',
  1: 'countermovement_jump',
  2: 'drop_jump',
  3: 'balance',
  4: 'max_force',
  5: 'scale',
};

function decodeFwTraceBinary(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 32 || view.getUint32(0, true) !== TraceBinaryMagic) {
    throw new Error('Invalid trace binary');
  }
  const headerSize = view.getUint16(16, true);
  const sampleSize = view.getUint16(18, true);
  const sampleCount = view.getUint16(20, true);
  const intervalMs = view.getUint16(22, true) || 4;
  const leftCount = view.getUint16(24, true);
  const rightCount = view.getUint16(26, true);
  const discipline = TraceBinaryDiscipline[view.getUint8(29)] ?? '';
  const leftBaselineN = view.getFloat32(8, true);
  const rightBaselineN = view.getFloat32(12, true);
  const minHeaderSize = 32 + TraceBinaryLandmarkNames.length * 2;
  if (headerSize < minHeaderSize || sampleSize < 4 || view.byteLength < headerSize + sampleCount * sampleSize) {
    throw new Error('Incomplete trace binary');
  }

  const landmarks = {};
  let landmarkOffset = 32;
  TraceBinaryLandmarkNames.forEach((name) => {
    landmarks[name] = view.getInt16(landmarkOffset, true);
    landmarkOffset += 2;
  });

  const rows = [];
  for (let i = 0; i < sampleCount; i++) {
    const offset = headerSize + i * sampleSize;
    const leftNet = view.getInt16(offset, true);
    const rightNet = view.getInt16(offset + 2, true);
    const hasLeft = i < leftCount;
    const hasRight = i < rightCount;
    const row = {
      index: i,
      t_ms: i * intervalMs,
      left_net_n: hasLeft ? leftNet : NaN,
      right_net_n: hasRight ? rightNet : NaN,
      total_net_n: hasLeft && hasRight ? leftNet + rightNet : NaN,
      left_abs_n: hasLeft ? Math.round(leftNet + leftBaselineN) : NaN,
      right_abs_n: hasRight ? Math.round(rightNet + rightBaselineN) : NaN,
      total_abs_n: hasLeft && hasRight
        ? Math.round(leftNet + leftBaselineN + rightNet + rightBaselineN)
        : NaN,
      ...landmarks,
    };
    rows.push(row);
  }
  return { rows, discipline };
}

function traceId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function renderTraceLibrary() {
  if (!state.resultLibrary.length) {
    controls.traceLibraryList.innerHTML = '<div class="traceEmpty">No session results loaded</div>';
    return;
  }

  controls.traceLibraryList.innerHTML = state.resultLibrary.map((item) => {
    const result = item.result;
    const settings = result.disciplineSettings || result.disciplineDefinition?.settings || {};
    const disciplineId = result.disciplineDefinition?.discipline || result.discipline;
    const discipline = (disciplineId ? window.JBForcePlateModels.disciplineDefinition(disciplineId)?.label : '')
      || result.disciplineDefinition?.disciplineLabel
      || disciplineId
      || 'Discipline';
    const attemptCode = settings.attemptCode || settings.attemptLabel || '';
    const ftHeight = finite(settings.flightHeightCm) ? `${settings.flightHeightCm.toFixed(1)} cm` : '';
    const measuredAt = result.measuredAt ? new Date(result.measuredAt).toLocaleString() : '';
    return `
    <button class="traceItem${item.id === state.activeResultId ? ' active' : ''}" type="button" data-result-id="${item.id}">
      <div class="traceItemName">${escapeHtml(result.athleteName || 'Unknown athlete')}</div>
      ${attemptCode ? `<div class="traceItemAttempt">${escapeHtml(attemptCode)}${ftHeight ? `<span>FT height ${escapeHtml(ftHeight)}</span>` : ''}</div>` : ''}
      <div class="traceItemMeta">${escapeHtml(discipline)}${measuredAt ? ` | ${escapeHtml(measuredAt)}` : ''}</div>
    </button>
  `;
  }).join('');
}

async function loadSessionLibrary() {
  controls.sessionLibraryFileInput.click();
}

async function loadSessionLibraryFiles(files) {
  const loadedPackages = [];
  const traceBins = new Map();
  let decodedTraceCount = 0;
  const addTraceBinKeys = (file, rawTrace) => {
    const stem = file.name.replace(/\.jbfpbin$/i, '');
    const normalizedStem = stem.replace(/\s+\(\d+\)$/i, '');
    [
      file.name,
      stem,
      normalizedStem,
      rawTrace.fileName,
      rawTrace.fileName?.replace(/\.jbfpbin$/i, ''),
      rawTrace.traceId,
      rawTrace.traceHash,
      rawTrace.resultId,
    ].filter(Boolean).forEach((key) => traceBins.set(key, rawTrace));
  };
  for (const file of [...(files ?? [])]) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.jbbin')) {
      try {
        const decoded = await decodeJbBinaryPackage(await file.arrayBuffer());
        decoded.traceBins.forEach((rawTrace, key) => traceBins.set(key, rawTrace));
        decodedTraceCount += decoded.manifest.traces?.length || 0;
        if (isSessionPackage(decoded.sessionPackage)) {
          loadedPackages.push({
            key: `jbbin:${file.name}:${decoded.sessionPackage.session.sessionId}`,
            sourceLabel: file.name,
            package: decoded.sessionPackage,
          });
        }
      } catch (error) {
        console.warn(`Skipping JB binary package ${file.name}: ${error.message}`);
      }
      continue;
    }
    if (lowerName.endsWith('.jbfpbin')) {
      try {
        const rawTrace = decodeSessionTraceBinary(await file.arrayBuffer());
        addTraceBinKeys(file, rawTrace);
        decodedTraceCount += 1;
      } catch (error) {
        console.warn(`Skipping trace bin ${file.name}: ${error.message}`);
      }
      continue;
    }
    if (!lowerName.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(await file.text());
      if (!isSessionPackage(parsed)) continue;
      loadedPackages.push({
        key: `file:${file.name}:${parsed.session.sessionId}`,
        sourceLabel: file.name,
        package: parsed,
      });
    } catch (error) {
      console.warn(`Skipping session file ${file.name}: ${error.message}`);
    }
  }
  state.resultTraceBins = traceBins;
  state.resultLibrary = loadedPackages.flatMap((item) => {
    const session = item.package.session || {};
    return (item.package.results || []).map((result, index) => ({
      id: `${item.key}:${result.resultId || index}`,
      sourceKey: item.key,
      sourceLabel: item.sourceLabel,
      session,
      result,
      index,
    }));
  });
  state.resultLibrary.sort((a, b) => (b.result.measuredAt || 0) - (a.result.measuredAt || 0));
  if (state.resultLibrary.length) {
    await activateSessionResult(state.resultLibrary[0].id);
  } else {
    state.activeResultId = null;
    state.analyzeResult = null;
    renderTraceLibrary();
    renderMetrics();
  }
  const traceSuffix = decodedTraceCount ? `, ${decodedTraceCount} trace bin(s)` : '';
  setStatus(state.resultLibrary.length ? `Loaded ${state.resultLibrary.length} result(s) from selected session file(s)${traceSuffix}` : 'No session results found in selected file(s)');
}

function setSettingsTab(tab) {
  state.settingsTab = tab;
  const showLandmarks = tab === 'landmarks';
  controls.settingsTabLandmarks.classList.toggle('active', showLandmarks);
  controls.settingsTabTraces.classList.toggle('active', !showLandmarks);
  controls.landmarkSettingsPane.classList.toggle('hidden', !showLandmarks);
  controls.traceLibraryPane.classList.toggle('hidden', showLandmarks);
}

function applyAnalyzeDiscipline(discipline) {
  if (!discipline || discipline === 'scale') return;
  state.discipline = discipline;
  if ([...controls.disciplineSelect.options].some((option) => option.value === discipline)) {
    controls.disciplineSelect.value = discipline;
    syncCustomSelect(controls.disciplineSelect);
  }
  if ([...controls.measureDiscipline.options].some((option) => option.value === discipline)) {
    controls.measureDiscipline.value = discipline;
    renderDisciplineSettings(discipline);
    syncCustomSelect(controls.measureDiscipline);
  }
}

function activateTrace(traceIdValue) {
  const trace = state.traceLibrary.find((item) => item.id === traceIdValue);
  if (!trace) return;
  state.activeTraceId = trace.id;
  state.activeResultId = null;
  state.analyzeResult = null;
  loadRows(trace.rows, trace.name);
  renderTraceLibrary();
}

async function activateSessionResult(resultIdValue) {
  const item = state.resultLibrary.find((entry) => entry.id === resultIdValue);
  if (!item) return;
  const rows = await resultRawRows(item.result);
  const discipline = item.result.disciplineDefinition?.discipline || item.result.discipline;
  applyAnalyzeDiscipline(discipline);
  state.activeResultId = item.id;
  state.activeTraceId = null;
  state.analyzeResult = item;
  if (rows.length) {
    loadRows(rows, `${item.sourceLabel}: ${item.result.athleteName || 'Unknown athlete'}`);
    state.activeResultId = item.id;
    state.analyzeResult = item;
  } else if (item.result.traceRef) {
    state.rows = [];
    state.source = `${item.sourceLabel}: missing trace bin`;
    draw();
    setStatus(`Selected result has no loaded trace bin: ${item.result.traceRef.fileName || item.result.traceRef.traceId || 'trace'}`);
  }
  renderTraceLibrary();
  renderMetrics();
  if (rows.length) setStatus(`Selected result: ${item.result.athleteName || 'Unknown athlete'}`);
}

function resultRawRowCount(result) {
  return result?.rawTrace?.rowCount
    || result?.rawTrace?.rows?.length
    || result?.traceData?.rowCount
    || result?.traceData?.rows?.length
    || result?.trace?.rowCount
    || result?.trace?.rows?.length
    || result?.traceRef?.rowCount
    || 0;
}

async function resultRawRows(result) {
  const inlineRows = result?.rawTrace?.rows
    || result?.traceData?.rows
    || result?.trace?.rows
    || null;
  if (inlineRows?.length) return inlineRows;
  const traceRef = result?.traceRef || {};
  const importedTrace = state.resultTraceBins.get(traceRef.traceId)
    || state.resultTraceBins.get(result?.traceHash)
    || state.resultTraceBins.get(result?.resultId)
    || state.resultTraceBins.get(traceRef.fileName)
    || null;
  if (importedTrace?.rows?.length) return importedTrace.rows;
  const cachedTrace = await window.JBForcePlateSessionArchive.loadTrace(traceRef.traceId);
  return cachedTrace?.rows || [];
}

async function loadCsvFiles(files) {
  const fileList = [...(files ?? [])].filter((file) => file);
  if (!fileList.length) return;
  const loaded = [];
  for (const file of fileList) {
    const rows = parseCsv(await file.text());
    if (!rows.length) continue;
    const existing = state.traceLibrary.find((item) => item.name === file.name);
    const trace = {
      id: existing?.id ?? traceId(),
      name: file.name,
      rows,
    };
    if (existing) {
      Object.assign(existing, trace);
    } else {
      state.traceLibrary.push(trace);
    }
    loaded.push(trace);
  }
  if (!loaded.length) {
    setStatus('No valid CSV files loaded');
    renderTraceLibrary();
    return;
  }
  setSettingsTab('traces');
  activateTrace(loaded[0].id);
  setStatus(`${loaded.length} CSV file${loaded.length === 1 ? '' : 's'} loaded`);
}

function sampleIntervalMs(rows) {
  if (rows.length < 2) return 4;
  const dt = rows[1].t_ms - rows[0].t_ms;
  return finite(dt) && dt > 0 ? dt : 4;
}

function averageColumn(rows, key, start, end) {
  let sum = 0;
  let count = 0;
  for (let index = Math.max(0, start); index < Math.min(rows.length, end); index += 1) {
    const value = rows[index]?.[key];
    if (finite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count ? sum / count : NaN;
}

function bodyWeightForOverlay(rows, absKey, marks) {
  if (state.discipline === 'drop_jump' && marks?.landing >= 0) {
    const dtMs = sampleIntervalMs(rows);
    const start = Math.min(rows.length, marks.landing + Math.round(1000 / dtMs));
    const end = Math.min(rows.length, start + Math.round(800 / dtMs));
    const postLanding = averageColumn(rows, absKey, start, end);
    if (finite(postLanding) && postLanding > 1) return postLanding;
  }
  const end = marks && marks.onset > 30 ? marks.onset - 10 : Math.min(rows.length, 250);
  const start = Math.max(0, end - 300);
  const ready = averageColumn(rows, absKey, start, end);
  if (finite(ready) && ready > 1) return ready;
  return averageColumn(rows, absKey, 0, Math.min(rows.length, 250));
}

function firstFinite(...values) {
  return values.find((value) => finite(value) && value >= 0) ?? -1;
}

function landmarksFor(prefix, rows) {
  const first = rows[0] ?? {};
  if (state.discipline === 'drop_jump') {
    const dropLanding = firstFinite(first[`${prefix}_drop_landing_index`], first[`${prefix}_onset_index`]);
    const contactTrough = firstFinite(first[`${prefix}_contact_trough_index`], first[`${prefix}_unweighting_min_index`]);
    const driveOffPeak = firstFinite(first[`${prefix}_drive_off_peak_index`], first[`${prefix}_propulsive_start_index`]);
    const flightLanding = firstFinite(first[`${prefix}_flight_landing_index`], first[`${prefix}_landing_index`]);
    return {
      onset: dropLanding,
      min: contactTrough,
      prop: driveOffPeak,
      takeoff: firstFinite(first[`${prefix}_takeoff_index`], first.total_takeoff2_index),
      landing: flightLanding,
      dropLanding,
      impactPeak: firstFinite(first[`${prefix}_impact_peak_index`]),
      contactTrough,
      startConcentric: firstFinite(first[`${prefix}_start_concentric_index`], contactTrough),
      driveOffPeak,
      flightLanding,
      landingPeak: firstFinite(first[`${prefix}_landing_peak_index`]),
      jumpEnd: firstFinite(first[`${prefix}_jump_end_index`]),
    };
  }
  if (prefix === 'total') {
    return {
      onset: firstFinite(first.total_onset_index),
      min: firstFinite(first.total_unweighting_min_index),
      prop: firstFinite(first.total_propulsive_start_index),
      takeoff: firstFinite(first.total_takeoff2_index, first.total_takeoff_index),
      landing: firstFinite(first.total_landing2_index, first.total_landing_index),
      jumpEnd: firstFinite(first.total_jump_end_index),
    };
  }
  return {
    onset: firstFinite(first[`${prefix}_onset_index`]),
    min: firstFinite(first[`${prefix}_unweighting_min_index`]),
    prop: firstFinite(first[`${prefix}_propulsive_start_index`]),
    takeoff: firstFinite(first[`${prefix}_takeoff_index`]),
    landing: firstFinite(first[`${prefix}_landing_index`]),
    jumpEnd: firstFinite(first[`${prefix}_jump_end_index`]),
  };
}

function currentLandmarkPrefix() {
  return state.viewMode;
}

function landmarkSettings() {
  return {
    contactThresholdN: Number(controls.contactThreshold.value) || 50,
    sustainMs: Number(controls.sustainMs.value) || 20,
    minFlightMs: Number(controls.minFlightMs.value) || 80,
    onsetSearchMs: Number(controls.onsetSearchMs.value) || 450,
    onsetSlopeN: Number(controls.onsetSlopeN.value) || 8,
    onsetSustainMs: Number(controls.onsetSustainMs.value) || 80,
  };
}

function metricLandmarks() {
  const scope = metricScope();
  const adjusted = state.adjustedLandmarks[scope.landmarkPrefix];
  if (state.metricSource === 'adjusted' && adjusted) return adjusted;
  return detectedLandmarksFor(scope.landmarkPrefix);
}

function hasLandmarkValue(marks) {
  return TraceEngine.landmarkKeys(state.discipline).some((key) => finite(marks?.[key]) && marks[key] >= 0);
}

function detectedLandmarksFor(prefix) {
  const fw = landmarksFor(prefix, state.rows);
  if (state.discipline !== 'drop_jump' && hasLandmarkValue(fw)) return fw;
  return TraceEngine.detectLandmarks(state.rows, prefix, landmarkSettings(), state.discipline);
}

function editableLandmarks(prefix) {
  return state.adjustedLandmarks[prefix] ?? detectedLandmarksFor(prefix);
}

function ensureAdjustedLandmarks(prefix) {
  if (!state.adjustedLandmarks[prefix]) {
    state.adjustedLandmarks[prefix] = { ...editableLandmarks(prefix) };
  }
  return state.adjustedLandmarks[prefix];
}

function syncLandmarkAliases(marks, key, value) {
  marks[key] = value;
  if (state.discipline !== 'drop_jump') return;
  const aliases = {
    onset: ['dropLanding'],
    dropLanding: ['onset'],
    min: ['contactTrough'],
    contactTrough: ['min'],
    prop: ['driveOffPeak'],
    driveOffPeak: ['prop'],
    landing: ['flightLanding'],
    flightLanding: ['landing'],
  };
  (aliases[key] ?? []).forEach((alias) => {
    marks[alias] = value;
  });
}

function columnSet() {
  const mode = state.forceMode;
  return {
    left: mode === 'net' ? 'left_net_n' : 'left_abs_n',
    right: mode === 'net' ? 'right_net_n' : 'right_abs_n',
    total: mode === 'net' ? 'total_net_n' : 'total_abs_n',
  };
}

function seriesForView() {
  const columns = columnSet();
  const style = state.chartStyle || DefaultChartStyle;
  if (state.viewMode === 'left') {
    return [{ key: columns.left, color: style.leftColor, opacity: style.leftOpacity, lineStyle: style.leftLine, label: 'LEFT' }];
  }
  if (state.viewMode === 'right') {
    return [{ key: columns.right, color: style.rightColor, opacity: style.rightOpacity, lineStyle: style.rightLine, label: 'RIGHT' }];
  }
  return [
    { key: columns.left, color: style.leftColor, opacity: style.leftOpacity, lineStyle: style.leftLine, label: 'LEFT' },
    { key: columns.right, color: style.rightColor, opacity: style.rightOpacity, lineStyle: style.rightLine, label: 'RIGHT' },
    { key: columns.total, color: style.totalColor, opacity: style.totalOpacity, lineStyle: style.totalLine, label: 'TOTAL' },
  ];
}

function maxColumn(rows, key, start, end) {
  let max = NaN;
  for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
    const value = rows[i][key];
    if (finite(value) && (!finite(max) || value > max)) max = value;
  }
  return max;
}

function metricScope() {
  if (state.viewMode === 'left') {
    return {
      landmarkPrefix: 'left',
      netKey: 'left_net_n',
      absKey: 'left_abs_n',
      asymmetry: false,
    };
  }
  if (state.viewMode === 'right') {
    return {
      landmarkPrefix: 'right',
      netKey: 'right_net_n',
      absKey: 'right_abs_n',
      asymmetry: false,
    };
  }
  return {
    landmarkPrefix: 'total',
    netKey: 'total_net_n',
    absKey: 'total_abs_n',
    asymmetry: true,
  };
}

function renderMetrics() {
  const selectedResult = state.analyzeResult?.result || null;
  const metrics = state.rows.length
    ? TraceEngine.computeMetrics(
      state.rows,
      metricScope(),
      metricLandmarks(),
      state.discipline,
      { boxHeightCm: Number(controls.boxHeightCm.value) || DefaultSettingsPreset.values.boxHeightCm },
    )
    : selectedResult?.metrics?.metrics || [];
  const groups = [];
  let currentGroup = { title: '', metrics: [] };

  metrics.forEach((metric) => {
    const [label, value] = metric;
    if (label === '__section') {
      if (currentGroup.title || currentGroup.metrics.length) {
        groups.push(currentGroup);
      }
      currentGroup = { title: value, metrics: [] };
      return;
    }
    currentGroup.metrics.push(metric);
  });
  if (currentGroup.title || currentGroup.metrics.length) groups.push(currentGroup);

  metricsEl.innerHTML = `
    ${renderAnalyzeIdentityCards(selectedResult)}
    ${groups.map((group) => `
    <section class="metricGroup">
      ${group.title ? `<h3>${escapeHtml(group.title)}</h3>` : ''}
      <div class="metricGroupGrid">
        ${group.metrics.map(renderMetric).join('')}
      </div>
    </section>
  `).join('')}
  `;
  renderLandmarkDebug();
}

function analyzeDisciplineLabel(result) {
  const disciplineId = result?.disciplineDefinition?.discipline || result?.discipline || state.discipline;
  return (disciplineId ? window.JBForcePlateModels.disciplineDefinition(disciplineId)?.label : '')
    || result?.disciplineDefinition?.disciplineLabel
    || disciplineId
    || '';
}

function renderAnalyzeIdentityCards(result) {
  const athlete = result?.athleteSnapshot || null;
  const athleteName = result?.athleteName
    || (athlete ? window.JBForcePlateModels.athleteDisplayName(athlete) : '')
    || 'No athlete';
  const jersey = athlete?.number || athlete?.jersey || '';
  const category = result?.category || athlete?.category || state.session.session.category || '';
  const discipline = analyzeDisciplineLabel(result);
  return `
    <section class="analyzeDisciplineCard">
      <span>Discipline</span>
      <strong>${escapeHtml(discipline || '-')}</strong>
    </section>
    <section class="sessionAthleteCard analyzeAthleteCard">
      <div class="sessionAthletePortrait" aria-hidden="true"></div>
      <div>
        <span>Athlete</span>
        <strong>${escapeHtml(athleteName)}</strong>
        <small>${escapeHtml([jersey ? `#${jersey}` : '', category].filter(Boolean).join('  '))}</small>
      </div>
    </section>
  `;
}

function renderMetric(metric) {
  const pairs = [];
  for (let i = 0; i < metric.length; i += 2) {
    if (metric[i]) pairs.push([metric[i], metric[i + 1]]);
  }
  const splitClass = pairs.length > 1 ? ' metricSplit' : '';
  return `<div class="metric${splitClass}">
    ${pairs.map(([itemLabel, itemValue]) => `
      <div>
        <div class="label">${escapeHtml(itemLabel)}</div>
        <div class="value">${escapeHtml(itemValue)}</div>
      </div>
    `).join('')}
  </div>`;
}

function indexMs(index) {
  return finite(index) && index >= 0 && index < state.rows.length ? state.rows[index].t_ms : NaN;
}

function formatMs(value) {
  return finite(value) ? `${Math.round(value)} ms` : '-';
}

function renderLandmarkDebug() {
  if (!state.rows.length) {
    landmarkDebugEl.innerHTML = '';
    return;
  }
  const prefix = currentLandmarkPrefix();
  const fw = detectedLandmarksFor(prefix);
  const adjusted = state.adjustedLandmarks[prefix];
  landmarkDebugEl.innerHTML = TraceEngine.landmarkKeys(state.discipline).map((key) => {
    const fwMs = indexMs(fw[key]);
    const adjustedMs = adjusted ? indexMs(adjusted[key]) : NaN;
    const delta = finite(fwMs) && finite(adjustedMs) ? adjustedMs - fwMs : NaN;
    const deltaText = finite(delta) ? `${delta >= 0 ? '+' : ''}${Math.round(delta)} ms` : '-';
    return `<div class="debugItem"><strong>${key}</strong>DET ${formatMs(fwMs)}<br>ADJ ${formatMs(adjustedMs)}<br>DELTA ${deltaText}</div>`;
  }).join('');
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  chart.width = Math.max(1, Math.floor(chart.clientWidth * ratio));
  chart.height = Math.max(1, Math.floor(chart.clientHeight * ratio));
}

function resizeRealtimeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  realtimeChart.width = Math.max(1, Math.floor(realtimeChart.clientWidth * ratio));
  realtimeChart.height = Math.max(1, Math.floor(realtimeChart.clientHeight * ratio));
}

function resizeSessionPreviewCanvas() {
  const ratio = window.devicePixelRatio || 1;
  sessionPreviewChart.width = Math.max(1, Math.floor(sessionPreviewChart.clientWidth * ratio));
  sessionPreviewChart.height = Math.max(1, Math.floor(sessionPreviewChart.clientHeight * ratio));
}

function sessionPreviewView() {
  if (!state.rows.length) return null;
  if (state.focusWindow) {
    return viewForRange(state.rows, state.focusWindow.startMs, state.focusWindow.endMs);
  }
  return autoView(state.rows);
}

function sessionPreviewPlotRect(width, height) {
  return {
    left: 44,
    top: 14,
    right: Math.max(45, width - 14),
    bottom: Math.max(15, height - 34),
  };
}

function sessionPreviewX(tMs, view, rect) {
  return rect.left + ((tMs - view.xMin) / (view.xMax - view.xMin || 1)) * (rect.right - rect.left);
}

function sessionPreviewY(value, view, rect) {
  return rect.top + (1 - ((value - view.yMin) / (view.yMax - view.yMin || 1))) * (rect.bottom - rect.top);
}

function drawSessionPreviewLine(rows, line, view, width, height, ratio) {
  if (!rows.length || !view) return;
  const rect = sessionPreviewPlotRect(width, height);

  sessionPreviewCtx.save();
  sessionPreviewCtx.strokeStyle = hexToRgba(line.color, line.opacity);
  sessionPreviewCtx.lineWidth = 1.5 * ratio;
  sessionPreviewCtx.setLineDash(dashForStyle(line.lineStyle, ratio));
  sessionPreviewCtx.beginPath();
  let moved = false;
  rows.forEach((row) => {
    const value = row[line.key];
    if (!finite(value) || row.t_ms < view.xMin || row.t_ms > view.xMax) return;
    const x = sessionPreviewX(row.t_ms, view, rect);
    const y = sessionPreviewY(value, view, rect);
    if (!moved) {
      sessionPreviewCtx.moveTo(x * ratio, y * ratio);
      moved = true;
    } else {
      sessionPreviewCtx.lineTo(x * ratio, y * ratio);
    }
  });
  sessionPreviewCtx.stroke();
  sessionPreviewCtx.restore();
}

function drawSessionPreviewAxes(view, width, height, ratio, style) {
  const rect = sessionPreviewPlotRect(width, height);
  sessionPreviewCtx.save();
  sessionPreviewCtx.strokeStyle = hexToRgba(style.xAxisColor, style.xAxisOpacity);
  sessionPreviewCtx.fillStyle = hexToRgba(style.xAxisText, 0.68);
  sessionPreviewCtx.font = `${10 * ratio}px Trebuchet MS, Arial, sans-serif`;
  sessionPreviewCtx.lineWidth = ratio;
  sessionPreviewCtx.textAlign = 'right';
  sessionPreviewCtx.textBaseline = 'middle';
  sessionPreviewCtx.setLineDash(dashForStyle(style.xAxisStyle, ratio));
  sessionPreviewCtx.beginPath();
  sessionPreviewCtx.moveTo(rect.left * ratio, rect.top * ratio);
  sessionPreviewCtx.lineTo(rect.left * ratio, rect.bottom * ratio);
  sessionPreviewCtx.stroke();
  sessionPreviewCtx.beginPath();
  sessionPreviewCtx.moveTo(rect.left * ratio, rect.bottom * ratio);
  sessionPreviewCtx.lineTo(rect.right * ratio, rect.bottom * ratio);
  sessionPreviewCtx.stroke();

  const tickStepN = 50;
  const majorStepN = 250;
  const forceStart = Math.ceil(view.yMin / tickStepN) * tickStepN;
  for (let value = forceStart; value <= view.yMax; value += tickStepN) {
    const y = sessionPreviewY(value, view, rect);
    if (y < rect.top || y > rect.bottom) continue;
    const major = value % majorStepN === 0;
    const tickLen = major ? 18 : 8;
    sessionPreviewCtx.beginPath();
    sessionPreviewCtx.moveTo((rect.left - tickLen) * ratio, y * ratio);
    sessionPreviewCtx.lineTo(rect.left * ratio, y * ratio);
    sessionPreviewCtx.stroke();
    if (major) {
      sessionPreviewCtx.fillText(`${Math.round(value)}`, (rect.left - tickLen - 5) * ratio, y * ratio);
    }
  }

  sessionPreviewCtx.textAlign = 'center';
  sessionPreviewCtx.textBaseline = 'alphabetic';
  const timeStep = 200;
  const timeStart = Math.ceil(view.xMin / timeStep) * timeStep;
  for (let t = timeStart; t <= view.xMax; t += timeStep) {
    const x = sessionPreviewX(t, view, rect);
    if (x < rect.left || x > rect.right) continue;
    const major = t % 1000 === 0;
    sessionPreviewCtx.beginPath();
    sessionPreviewCtx.moveTo(x * ratio, rect.bottom * ratio);
    sessionPreviewCtx.lineTo(x * ratio, (rect.bottom + (major ? 10 : 5)) * ratio);
    sessionPreviewCtx.stroke();
    if (major) {
      sessionPreviewCtx.fillText(`${Math.round(t)} ms`, x * ratio, (height - 7) * ratio);
    }
  }
  sessionPreviewCtx.setLineDash([]);
  sessionPreviewCtx.restore();
}

function drawSessionPreviewLandmark(index, label, color, view, width, height, ratio, lane = 0, lineStyle = 'dot') {
  if (!finite(index) || index < 0 || index >= state.rows.length) return;
  const tMs = state.rows[index]?.t_ms;
  if (!finite(tMs) || tMs < view.xMin || tMs > view.xMax) return;
  const rect = sessionPreviewPlotRect(width, height);
  const x = sessionPreviewX(tMs, view, rect);
  sessionPreviewCtx.save();
  sessionPreviewCtx.strokeStyle = color;
  sessionPreviewCtx.fillStyle = color;
  sessionPreviewCtx.lineWidth = 1.2 * ratio;
  sessionPreviewCtx.setLineDash(dashForStyle(lineStyle, ratio));
  sessionPreviewCtx.beginPath();
  sessionPreviewCtx.moveTo(x * ratio, rect.top * ratio);
  sessionPreviewCtx.lineTo(x * ratio, rect.bottom * ratio);
  sessionPreviewCtx.stroke();
  sessionPreviewCtx.setLineDash([]);
  sessionPreviewCtx.font = `${10 * ratio}px Trebuchet MS, Arial, sans-serif`;
  sessionPreviewCtx.fillText(label, (x + 4) * ratio, (rect.bottom - 20) * ratio);
  sessionPreviewCtx.restore();
}

function drawSessionPreviewFwLandmarks(view, width, height, ratio, style) {
  const fwMarks = landmarksFor('total', state.rows);
  const marks = hasLandmarkValue(fwMarks)
    ? fwMarks
    : TraceEngine.detectLandmarks(state.rows, 'total', landmarkSettings(), state.discipline);
  const mark = (index, label, color, lane) => drawSessionPreviewLandmark(
    index,
    label,
    hexToRgba(color, style.landmarkOpacity),
    view,
    width,
    height,
    ratio,
    lane,
    style.landmarkStyle,
  );

  if (state.discipline === 'drop_jump') {
    mark(marks.dropLanding, 'drop', style.landmarkDrop, 0);
    mark(marks.impactPeak, 'impact', style.landmarkImpact, 1);
    mark(marks.contactTrough, 'trough', style.landmarkTrough, 2);
    mark(marks.driveOffPeak, 'drive', style.landmarkDrive, 3);
    mark(marks.takeoff, 'takeoff', style.landmarkTakeoff, 0);
    mark(marks.flightLanding, 'landing', style.landmarkLanding, 1);
    mark(marks.landingPeak, 'peak', style.landmarkLandingPeak, 2);
    mark(marks.jumpEnd, 'end', style.landmarkJumpEnd, 3);
  } else {
    mark(marks.onset, 'onset', style.landmarkDrop, 0);
    mark(marks.min, 'min', style.landmarkTrough, 1);
    mark(marks.prop, 'prop', style.landmarkDrive, 2);
    mark(marks.takeoff, 'takeoff', style.landmarkTakeoff, 0);
    mark(marks.landing, 'landing', style.landmarkLanding, 1);
    mark(marks.jumpEnd, 'end', style.landmarkJumpEnd, 2);
  }
}

function drawSessionPreview() {
  resizeSessionPreviewCanvas();
  const ratio = window.devicePixelRatio || 1;
  const width = sessionPreviewChart.clientWidth || 1;
  const height = sessionPreviewChart.clientHeight || 1;
  const style = state.chartStyle || DefaultChartStyle;
  const view = sessionPreviewView();

  sessionPreviewCtx.clearRect(0, 0, sessionPreviewChart.width, sessionPreviewChart.height);
  sessionPreviewCtx.fillStyle = style.chartBg;
  sessionPreviewCtx.fillRect(0, 0, width * ratio, height * ratio);
  sessionPreviewCtx.strokeStyle = style.chartOutline;
  sessionPreviewCtx.strokeRect(0.5 * ratio, 0.5 * ratio, (width - 1) * ratio, (height - 1) * ratio);

  if (!state.rows.length || !view) {
    sessionPreviewCtx.fillStyle = hexToRgba(style.xAxisText, 0.72);
    sessionPreviewCtx.font = `${16 * ratio}px Trebuchet MS, Arial, sans-serif`;
    sessionPreviewCtx.textAlign = 'center';
    sessionPreviewCtx.textBaseline = 'middle';
    sessionPreviewCtx.fillText('Waiting for measurement', (width / 2) * ratio, (height / 2) * ratio);
    renderSessionStats();
    return;
  }

  const columns = columnSet();
  const lines = [
    { key: columns.left, color: style.leftColor, opacity: style.leftOpacity, lineStyle: style.leftLine },
    { key: columns.right, color: style.rightColor, opacity: style.rightOpacity, lineStyle: style.rightLine },
    { key: columns.total, color: style.totalColor, opacity: style.totalOpacity, lineStyle: style.totalLine },
  ];
  const rect = sessionPreviewPlotRect(width, height);
  const zeroY = sessionPreviewY(0, view, rect);
  drawSessionPreviewAxes(view, width, height, ratio, style);
  sessionPreviewCtx.save();
  sessionPreviewCtx.strokeStyle = hexToRgba(style.zeroColor, 0.72);
  sessionPreviewCtx.setLineDash(dashForStyle(style.zeroStyle, ratio));
  sessionPreviewCtx.beginPath();
  sessionPreviewCtx.moveTo(rect.left * ratio, zeroY * ratio);
  sessionPreviewCtx.lineTo(rect.right * ratio, zeroY * ratio);
  sessionPreviewCtx.stroke();
  sessionPreviewCtx.restore();
  lines.forEach((line) => drawSessionPreviewLine(state.rows, line, view, width, height, ratio));
  drawSessionPreviewFwLandmarks(view, width, height, ratio, style);
  renderSessionStats();
}

function realtimeY(value) {
  const height = realtimeChart.clientHeight || 1;
  const top = 12;
  const zeroY = Math.max(24, height - 62);
  return zeroY - (value / state.realtime.yMax) * (zeroY - top);
}

function realtimeNowMs() {
  const candidates = [
    state.realtime.samples.at(-1)?.tMs,
    state.realtime.leftSamples.at(-1)?.tMs,
    state.realtime.rightSamples.at(-1)?.tMs,
  ].filter(finite);
  return candidates.length ? Math.max(...candidates) : 0;
}

function realtimeRenderBufferEnabled() {
  return Boolean(controls.realtimeRenderBuffer?.checked);
}

function realtimeRenderLagMs() {
  return clamp(Number(controls.realtimeRenderLagMs?.value) || 0, 0, 1000);
}

function realtimeRenderTargetMs() {
  return Math.max(0, realtimeNowMs() - realtimeRenderLagMs());
}

function realtimeDisplayNowMs() {
  if (state.realtime.reviewMode) return state.realtime.cursorMs;
  if (state.realtime.live && state.realtime.renderBuffer.enabled) {
    return state.realtime.renderBuffer.cursorMs;
  }
  return realtimeNowMs();
}

function syncRealtimeRenderBufferControls() {
  state.realtime.renderBuffer.enabled = realtimeRenderBufferEnabled();
  state.realtime.renderBuffer.lagMs = realtimeRenderLagMs();
  if (controls.realtimeRenderLagMs) {
    controls.realtimeRenderLagMs.disabled = !state.realtime.renderBuffer.enabled;
  }
  updateRealtimeScrubControl();
}

function stopRealtimeRenderLoop() {
  if (state.realtime.renderBuffer.raf) {
    cancelAnimationFrame(state.realtime.renderBuffer.raf);
    state.realtime.renderBuffer.raf = 0;
  }
  state.realtime.renderBuffer.lastFrameMs = 0;
}

function realtimeRenderFrame(nowMs) {
  if (!state.realtime.live || !state.realtime.renderBuffer.enabled) {
    stopRealtimeRenderLoop();
    drawRealtime();
    return;
  }

  const targetMs = realtimeRenderTargetMs();
  const currentMs = state.realtime.renderBuffer.cursorMs;
  if (!finite(currentMs) || currentMs <= 0 || currentMs > targetMs || targetMs - currentMs > 600) {
    state.realtime.renderBuffer.cursorMs = targetMs;
  } else {
    const elapsedMs = state.realtime.renderBuffer.lastFrameMs
      ? nowMs - state.realtime.renderBuffer.lastFrameMs
      : 0;
    state.realtime.renderBuffer.cursorMs = Math.min(targetMs, currentMs + Math.max(0, elapsedMs));
  }
  state.realtime.renderBuffer.lastFrameMs = nowMs;
  drawRealtime();
  state.realtime.renderBuffer.raf = requestAnimationFrame(realtimeRenderFrame);
}

function startRealtimeRenderLoop() {
  stopRealtimeRenderLoop();
  syncRealtimeRenderBufferControls();
  if (!state.realtime.live || !state.realtime.renderBuffer.enabled) return;
  state.realtime.renderBuffer.cursorMs = realtimeRenderTargetMs();
  state.realtime.renderBuffer.raf = requestAnimationFrame(realtimeRenderFrame);
}

function drawRealtimeFromReceiver() {
  if (state.realtime.live && state.realtime.renderBuffer.enabled) return;
  drawRealtime();
}

function realtimeVisibleSpanMs() {
  const width = realtimeChart.clientWidth || 1;
  return Math.ceil((width / state.realtime.pxPerSecond) * 1000);
}

function updateRealtimeScrubControl() {
  if (!controls.realtimeScrub) return;
  const scrubWrap = controls.realtimeScrub.closest('.realtimeScrub');
  if (scrubWrap) {
    scrubWrap.hidden = state.realtime.live && state.realtime.renderBuffer.enabled;
  }
  const latest = realtimeNowMs();
  const earliest = Math.min(
    ...[
      state.realtime.samples[0]?.tMs,
      state.realtime.leftSamples[0]?.tMs,
      state.realtime.rightSamples[0]?.tMs,
    ].filter(finite),
  );
  const min = finite(earliest) ? Math.floor(earliest) : 0;
  const max = Math.max(min, Math.ceil(latest));
  controls.realtimeScrub.min = String(min);
  controls.realtimeScrub.max = String(max);
  controls.realtimeScrub.value = String(Math.round(realtimeDisplayNowMs()));
  controls.realtimeLive.classList.toggle('active', !state.realtime.reviewMode);
}

function setRealtimeReviewCursor(ms) {
  const latest = realtimeNowMs();
  state.realtime.cursorMs = clamp(Number(ms) || 0, 0, Math.max(0, latest));
  state.realtime.reviewMode = state.realtime.cursorMs < latest - 30;
  updateRealtimeScrubControl();
  drawRealtime();
}

function returnRealtimeLive() {
  state.realtime.reviewMode = false;
  state.realtime.cursorMs = realtimeNowMs();
  updateRealtimeScrubControl();
  drawRealtime();
}

function drawRealtimeLine(samples, key, color, opacity, now = realtimeNowMs()) {
  if (samples.length < 2) return;
  const style = state.chartStyle || DefaultChartStyle;
  const ratio = window.devicePixelRatio || 1;
  const width = realtimeChart.clientWidth || 1;
  const nowX = width - 14;
  realtimeCtx.save();
  realtimeCtx.strokeStyle = hexToRgba(color, opacity);
  realtimeCtx.lineWidth = 1.5 * ratio;
  realtimeCtx.setLineDash(dashForStyle(style.totalLine, ratio));
  realtimeCtx.beginPath();
  let moved = false;
  samples.forEach((sample) => {
    const x = nowX - ((now - sample.tMs) / 1000) * state.realtime.pxPerSecond;
    const value = key ? sample[key] : sample.value;
    const y = realtimeY(value);
    if (x < -20 || x > width + 20 || !finite(y)) return;
    if (!moved) {
      realtimeCtx.moveTo(x * ratio, y * ratio);
      moved = true;
    } else {
      realtimeCtx.lineTo(x * ratio, y * ratio);
    }
  });
  realtimeCtx.stroke();
  realtimeCtx.restore();
}

function realtimeVisibleSamples() {
  if (state.realtime.samples.length < 2 &&
      state.realtime.leftSamples.length < 2 &&
      state.realtime.rightSamples.length < 2) {
    return state.realtime.samples;
  }
  const now = realtimeDisplayNowMs();
  const spanMs = realtimeVisibleSpanMs();
  return buildRealtimeTotalSamples(now).filter((sample) => now - sample.tMs <= spanMs);
}

function realtimeVisibleSideSamples(samples, now = realtimeDisplayNowMs()) {
  const spanMs = realtimeVisibleSpanMs() + 100;
  return samples.filter((sample) => sample.tMs <= now && now - sample.tMs <= spanMs);
}

function buildRealtimeTotalSamples(now = realtimeDisplayNowMs(), visibleOnly = true) {
  if (!state.realtime.leftSamples.length && !state.realtime.rightSamples.length) {
    if (!visibleOnly) return state.realtime.samples;
    const spanMs = realtimeVisibleSpanMs() + 100;
    return state.realtime.samples.filter((sample) => sample.tMs <= now && now - sample.tMs <= spanMs);
  }
  const spanMs = realtimeVisibleSpanMs() + 100;
  const events = [
    ...state.realtime.leftSamples
      .filter((sample) => sample.tMs <= now && (!visibleOnly || now - sample.tMs <= spanMs))
      .map((sample) => ({ ...sample, side: 'left' })),
    ...state.realtime.rightSamples
      .filter((sample) => sample.tMs <= now && (!visibleOnly || now - sample.tMs <= spanMs))
      .map((sample) => ({ ...sample, side: 'right' })),
  ].sort((a, b) => a.tMs - b.tMs || (a.side === 'left' ? -1 : 1));
  const totalSamples = [];
  let left = NaN;
  let right = NaN;
  events.forEach((event) => {
    if (event.side === 'left') {
      left = event.value;
    } else {
      right = event.value;
    }
    const total = (finite(left) ? left : 0) + (finite(right) ? right : 0);
    totalSamples.push({ tMs: event.tMs, total });
    if (finite(total)) {
      state.realtime.totalPeak = Math.max(state.realtime.totalPeak, total);
    }
  });
  return totalSamples;
}

function realtimeDisciplineLabel(discipline) {
  return window.JBForcePlateModels.disciplineDefinition(discipline)?.label || discipline || 'Jump';
}

function realtimeDisciplineShortLabel(discipline) {
  const map = {
    countermovement_jump: 'CMJ',
    squat_jump: 'SJ',
    drop_jump: 'DJ',
    balance: 'Bal',
    max_force: 'MaxF',
  };
  return map[discipline] || realtimeDisciplineLabel(discipline);
}

function realtimeDetectorContactThreshold() {
  return Number(DefaultSettingsPreset.values.contactThreshold) || 50;
}

function realtimeDetectorArmThreshold() {
  return 250;
}

function realtimeWarmupMs() {
  return clamp(Number(controls.realtimeWarmupMs?.value) || 0, 0, 30000);
}

function realtimeIsWarmingUp() {
  return state.realtime.live && performance.now() < state.realtime.warmupUntilMs;
}

function realtimeDetectorDiscipline() {
  return controls.realtimeDiscipline?.value || controls.measureDiscipline?.value || 'countermovement_jump';
}

function resetRealtimeDetector(keepSegments = false) {
  state.realtime.detector = {
    activeFlight: null,
    segments: keepSegments ? state.realtime.detector.segments : [],
    lastScanMs: -Infinity,
    contactArmed: false,
    lastContactMs: -Infinity,
    discipline: realtimeDetectorDiscipline(),
    phase: 'idle',
    emptySinceMs: -Infinity,
    dropLandingMs: NaN,
    dropContactStartMs: NaN,
    dropContactPeak: 0,
  };
  renderRealtimeSegments();
}

function ensureRealtimeDetectorDiscipline() {
  const discipline = realtimeDetectorDiscipline();
  if (state.realtime.detector.discipline === discipline) return discipline;
  resetRealtimeDetector(false);
  return discipline;
}

function addRealtimeSegment(flightStartMs, landingMs, options = {}) {
  const discipline = options.discipline || realtimeDetectorDiscipline();
  const preMs = options.preMs ?? (discipline === 'drop_jump' ? 650 : 1100);
  const postMs = options.postMs ?? (discipline === 'drop_jump' ? 1200 : 1400);
  const startMs = Math.max(0, options.startMs ?? (flightStartMs - preMs));
  const endMs = options.endMs ?? (landingMs + postMs);
  const flightMs = Math.max(0, landingMs - flightStartMs);
  const flightHeightCm = (9.80665 * (flightMs / 1000) ** 2 / 8) * 100;
  const duplicate = state.realtime.detector.segments.some((segment) =>
    Math.abs(segment.flightStartMs - flightStartMs) < 120 || Math.abs(segment.landingMs - landingMs) < 120
  );
  if (duplicate) return;
  state.realtime.detector.segments.push({
    id: `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    discipline,
    startMs,
    endMs,
    flightStartMs,
    landingMs,
    dropLandingMs: options.dropLandingMs ?? null,
    flightMs,
    flightHeightCm,
    checked: true,
    label: realtimeDisciplineLabel(discipline),
    shortLabel: realtimeDisciplineShortLabel(discipline),
  });
  renderRealtimeSegments();
}

function renderRealtimeSegments() {
  if (!controls.realtimeSegmentList) return;
  const segments = state.realtime.detector.segments;
  if (!segments.length) {
    controls.realtimeSegmentList.innerHTML = '<div class="realtimeSegmentSummary"><strong>No detected jumps</strong><small>Realtime detector is waiting for flight phases.</small></div>';
    return;
  }
  const selected = segments.filter((segment) => segment.checked);
  const byDiscipline = segments.reduce((counts, segment) => {
    counts[segment.shortLabel] = (counts[segment.shortLabel] || 0) + 1;
    return counts;
  }, {});
  const selectedMs = selected.reduce((sum, segment) => sum + Math.max(0, segment.endMs - segment.startMs), 0);
  const names = Object.entries(byDiscipline).map(([name, count]) => `${count} ${name}`).join(', ');
  controls.realtimeSegmentList.innerHTML = `
    <div class="realtimeSegmentSummary">
      <strong>${segments.length} detected | ${selected.length} selected</strong>
      <small>${escapeHtml(names)}</small>
      <small>Selected window ${(selectedMs / 1000).toFixed(1)} s</small>
    </div>
  `;
}

function processRealtimeSimpleJumpDetector(sample, discipline) {
  const detector = state.realtime.detector;
  const threshold = realtimeDetectorContactThreshold();
  const armThreshold = realtimeDetectorArmThreshold();
  const minFlightMs = Number(DefaultSettingsPreset.values.minFlightMs) || 80;
  const airborne = sample.total <= threshold;

  if (sample.total >= armThreshold) {
    detector.contactArmed = true;
    detector.lastContactMs = sample.tMs;
  }
  if (airborne && !detector.activeFlight && detector.contactArmed) {
    detector.activeFlight = { startMs: sample.tMs, lastMs: sample.tMs };
  } else if (airborne && detector.activeFlight) {
    detector.activeFlight.lastMs = sample.tMs;
  } else if (!airborne && detector.activeFlight) {
    const flightMs = detector.activeFlight.lastMs - detector.activeFlight.startMs;
    const hadRecentContact = detector.lastContactMs < detector.activeFlight.startMs
      && detector.activeFlight.startMs - detector.lastContactMs <= 2000;
    if (flightMs >= minFlightMs && hadRecentContact) {
      addRealtimeSegment(detector.activeFlight.startMs, sample.tMs, { discipline });
    }
    detector.activeFlight = null;
    detector.contactArmed = sample.total >= armThreshold;
  }
}

function processRealtimeDropJumpDetector(sample) {
  const detector = state.realtime.detector;
  const threshold = realtimeDetectorContactThreshold();
  const armThreshold = realtimeDetectorArmThreshold();
  const minFlightMs = Number(DefaultSettingsPreset.values.minFlightMs) || 80;
  const airborne = sample.total <= threshold;

  if (airborne) {
    if (!finite(detector.emptySinceMs)) detector.emptySinceMs = sample.tMs;
    if (detector.phase === 'dropContact') {
      const contactMs = sample.tMs - detector.dropContactStartMs;
      const validContact = contactMs >= 80 && contactMs <= 900 && detector.dropContactPeak >= armThreshold;
      if (validContact) {
        detector.phase = 'takeoffFlight';
        detector.activeFlight = { startMs: sample.tMs, lastMs: sample.tMs };
      } else if (contactMs > 900) {
        detector.phase = 'idle';
        detector.activeFlight = null;
        detector.dropLandingMs = NaN;
        detector.dropContactStartMs = NaN;
        detector.dropContactPeak = 0;
      }
    } else if (detector.phase === 'takeoffFlight' && detector.activeFlight) {
      detector.activeFlight.lastMs = sample.tMs;
    } else if (detector.phase !== 'takeoffFlight') {
      detector.phase = 'waitingDropContact';
    }
    return;
  }

  if (detector.phase === 'waitingDropContact' || detector.phase === 'idle') {
    const emptyBeforeContactMs = finite(detector.emptySinceMs) ? sample.tMs - detector.emptySinceMs : 0;
    if (emptyBeforeContactMs >= 120 && sample.total >= armThreshold) {
      detector.phase = 'dropContact';
      detector.dropLandingMs = sample.tMs;
      detector.dropContactStartMs = sample.tMs;
      detector.dropContactPeak = sample.total;
    }
    return;
  }

  if (detector.phase === 'dropContact') {
    detector.dropContactPeak = Math.max(detector.dropContactPeak, sample.total);
    return;
  }

  if (detector.phase === 'takeoffFlight' && detector.activeFlight) {
    const flightMs = detector.activeFlight.lastMs - detector.activeFlight.startMs;
    const validFlight = flightMs >= minFlightMs && flightMs <= 1000;
    if (validFlight) {
      addRealtimeSegment(detector.activeFlight.startMs, sample.tMs, {
        discipline: 'drop_jump',
        dropLandingMs: detector.dropLandingMs,
        startMs: Math.max(0, detector.dropLandingMs - 100),
        endMs: sample.tMs + 1200,
      });
    }
    detector.phase = 'idle';
    detector.activeFlight = null;
    detector.emptySinceMs = -Infinity;
    detector.dropLandingMs = NaN;
    detector.dropContactStartMs = NaN;
    detector.dropContactPeak = 0;
  }
}

function processRealtimeDetectorSample(sample) {
  if (!sample || !finite(sample.total)) return;
  if (sample.tMs < state.realtime.detector.lastScanMs) return;
  const discipline = ensureRealtimeDetectorDiscipline();
  if (discipline === 'countermovement_jump' || discipline === 'squat_jump') {
    processRealtimeSimpleJumpDetector(sample, discipline);
  } else if (discipline === 'drop_jump') {
    processRealtimeDropJumpDetector(sample);
  }
  state.realtime.detector.lastScanMs = sample.tMs;
}

function scanRealtimeDetector(sample = null) {
  if (sample) {
    processRealtimeDetectorSample(sample);
    return;
  }
  state.realtime.samples.forEach(processRealtimeDetectorSample);
}

function drawRealtimeSegments(now, width, height, ratio, style) {
  const spanMs = realtimeVisibleSpanMs();
  const visibleStart = now - spanMs;
  const nowX = width - 14;
  const top = 12;
  const bottom = Math.max(36, height - 50);
  const segments = state.realtime.detector.segments.filter((segment) =>
    segment.endMs >= visibleStart && segment.startMs <= now
  );
  if (!segments.length) return;
  realtimeCtx.save();
  segments.forEach((segment) => {
    const segmentIndex = state.realtime.detector.segments.indexOf(segment) + 1;
    const x1 = nowX - ((now - segment.startMs) / 1000) * state.realtime.pxPerSecond;
    const x2 = nowX - ((now - segment.endMs) / 1000) * state.realtime.pxPerSecond;
    const left = clamp(Math.min(x1, x2), 0, width);
    const right = clamp(Math.max(x1, x2), 0, width);
    if (right - left < 3) return;
    const checkboxX = left + 8;
    const checkboxY = top + 8;
    const checkboxSize = 15;
    realtimeCtx.fillStyle = segment.checked
      ? 'rgba(255,147,9,0.10)'
      : 'rgba(255,255,255,0.05)';
    realtimeCtx.strokeStyle = segment.checked
      ? hexToRgba(style.hGuideColor, 0.72)
      : 'rgba(255,255,255,0.25)';
    realtimeCtx.lineWidth = 1.5 * ratio;
    realtimeCtx.setLineDash(dashForStyle('dash', ratio));
    realtimeCtx.fillRect(left * ratio, top * ratio, (right - left) * ratio, (bottom - top) * ratio);
    realtimeCtx.strokeRect(left * ratio, top * ratio, (right - left) * ratio, (bottom - top) * ratio);
    realtimeCtx.setLineDash([]);
    realtimeCtx.fillStyle = segment.checked ? hexToRgba(style.hGuideColor, 0.94) : 'rgba(255,255,255,0.18)';
    realtimeCtx.strokeStyle = segment.checked ? hexToRgba(style.hGuideColor, 0.94) : 'rgba(255,255,255,0.45)';
    realtimeCtx.lineWidth = 1.4 * ratio;
    realtimeCtx.fillRect(checkboxX * ratio, checkboxY * ratio, checkboxSize * ratio, checkboxSize * ratio);
    realtimeCtx.strokeRect(checkboxX * ratio, checkboxY * ratio, checkboxSize * ratio, checkboxSize * ratio);
    if (segment.checked) {
      realtimeCtx.strokeStyle = '#1d1205';
      realtimeCtx.lineWidth = 2 * ratio;
      realtimeCtx.beginPath();
      realtimeCtx.moveTo((checkboxX + 3.5) * ratio, (checkboxY + 8) * ratio);
      realtimeCtx.lineTo((checkboxX + 6.5) * ratio, (checkboxY + 11) * ratio);
      realtimeCtx.lineTo((checkboxX + 12) * ratio, (checkboxY + 4) * ratio);
      realtimeCtx.stroke();
    }
    realtimeCtx.fillStyle = segment.checked ? hexToRgba(style.hGuideColor, 0.95) : 'rgba(255,255,255,0.55)';
    realtimeCtx.font = `${36 * ratio}px Trebuchet MS, Arial, sans-serif`;
    realtimeCtx.textAlign = 'left';
    realtimeCtx.textBaseline = 'top';
    realtimeCtx.fillText(`${segmentIndex}. ${segment.shortLabel}`, (left + 30) * ratio, (top + 6) * ratio);
    realtimeCtx.font = `${15 * ratio}px Trebuchet MS, Arial, sans-serif`;
    realtimeCtx.fillText(
      `FT ${Math.round(segment.flightMs)} ms | ${segment.flightHeightCm.toFixed(1)} cm`,
      (left + 32) * ratio,
      (top + 46) * ratio,
    );
  });
  realtimeCtx.restore();
}

function realtimeSegmentHitAt(clientX, clientY) {
  const rect = realtimeChart.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const now = realtimeDisplayNowMs();
  const width = realtimeChart.clientWidth || 1;
  const nowX = width - 14;
  const top = 12;
  const checkboxSize = 15;
  return state.realtime.detector.segments.find((segment) => {
    const x1 = nowX - ((now - segment.startMs) / 1000) * state.realtime.pxPerSecond;
    const x2 = nowX - ((now - segment.endMs) / 1000) * state.realtime.pxPerSecond;
    const left = clamp(Math.min(x1, x2), 0, width);
    const checkboxX = left + 8;
    const checkboxY = top + 8;
    return x >= checkboxX && x <= checkboxX + checkboxSize && y >= checkboxY && y <= checkboxY + checkboxSize;
  });
}

function realtimeHudHitAt(clientX, clientY) {
  const rect = realtimeChart.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x >= 58 && x <= 73 && y >= 18 && y <= 33) return 'hud';
  if (!state.realtime.debugHud.visible) return null;
  if (x >= 160 && x <= 180 && y >= 112 && y <= 132) return 'age';
  const syncY = state.realtime.debugHud.ageOpen ? 218 : 138;
  if (x >= 128 && x <= 148 && y >= syncY - 4 && y <= syncY + 16) return 'sync';
  return null;
}

function beginRealtimePan(event) {
  if (event.button === 0) {
    const hudHit = realtimeHudHitAt(event.clientX, event.clientY);
    if (hudHit) {
      if (hudHit === 'hud') {
        state.realtime.debugHud.visible = !state.realtime.debugHud.visible;
      } else if (hudHit === 'age') {
        state.realtime.debugHud.ageOpen = !state.realtime.debugHud.ageOpen;
      } else if (hudHit === 'sync') {
        state.realtime.debugHud.syncOpen = !state.realtime.debugHud.syncOpen;
      }
      drawRealtime();
      return;
    }
    const hit = realtimeSegmentHitAt(event.clientX, event.clientY);
    if (hit) {
      hit.checked = !hit.checked;
      renderRealtimeSegments();
      drawRealtime();
    }
    return;
  }
  if (event.button !== 2) return;
  event.preventDefault();
  const startX = event.clientX;
  const startCursorMs = realtimeDisplayNowMs();
  state.realtime.reviewMode = true;
  realtimeChart.classList.add('dragging');
  const onMove = (moveEvent) => {
    const deltaPx = moveEvent.clientX - startX;
    const deltaMs = -(deltaPx / Math.max(1, state.realtime.pxPerSecond)) * 1000;
    setRealtimeReviewCursor(startCursorMs + deltaMs);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    realtimeChart.classList.remove('dragging');
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp, { once: true });
}

function updateRealtimeAutoY() {
  if (!state.realtime.autoY) return;
  const visible = realtimeVisibleSamples();
  if (!visible.length) return;
  const values = [];
  visible.forEach((sample) => {
    if (finite(sample.total)) values.push(sample.total);
  });
  if (!values.length) return;
  const max = Math.max(...values, state.realtime.totalPeak || 0, 0);
  const targetMax = Math.max(800, max * 1.16 + 120);
  state.realtime.yMin = 0;
  state.realtime.yMax += (targetMax - state.realtime.yMax) * 0.18;
}

function drawRealtimeForceAxis(width, ratio, style) {
  const zeroY = realtimeY(0);
  const axisX = 44;
  const top = 12;
  const tickStepN = 50;
  const majorStepN = 250;
  const maxTick = Math.ceil(state.realtime.yMax / tickStepN) * tickStepN;

  realtimeCtx.save();
  realtimeCtx.strokeStyle = hexToRgba(style.xAxisColor, style.xAxisOpacity);
  realtimeCtx.fillStyle = hexToRgba(style.xAxisText, 0.72);
  realtimeCtx.lineWidth = ratio;
  realtimeCtx.font = `${11 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'right';
  realtimeCtx.textBaseline = 'middle';
  realtimeCtx.beginPath();
  realtimeCtx.moveTo(axisX * ratio, top * ratio);
  realtimeCtx.lineTo(axisX * ratio, zeroY * ratio);
  realtimeCtx.stroke();

  for (let value = 0; value <= maxTick; value += tickStepN) {
    const y = realtimeY(value);
    if (y < top - 1 || y > zeroY + 1) continue;
    const major = value % majorStepN === 0;
    const tickLen = major ? 18 : 8;
    realtimeCtx.beginPath();
    realtimeCtx.moveTo((axisX - tickLen) * ratio, y * ratio);
    realtimeCtx.lineTo(axisX * ratio, y * ratio);
    realtimeCtx.stroke();
    if (major && value > 0) {
      realtimeCtx.fillText(`${value}`, (axisX - tickLen - 5) * ratio, y * ratio);
    }
  }
  realtimeCtx.restore();
}

function drawRealtimePeakLine(width, ratio, style) {
  const peak = state.realtime.totalPeak || 0;
  if (peak <= 0) return;
  const y = realtimeY(peak);
  if (!finite(y)) return;
  const label = `${Math.round(peak)} N`;

  realtimeCtx.save();
  realtimeCtx.strokeStyle = hexToRgba(style.hGuideColor, 0.88);
  realtimeCtx.fillStyle = hexToRgba(style.hGuideColor, 1);
  realtimeCtx.lineWidth = ratio;
  realtimeCtx.setLineDash(dashForStyle('dot', ratio));
  realtimeCtx.beginPath();
  realtimeCtx.moveTo(0, y * ratio);
  realtimeCtx.lineTo(width * ratio, y * ratio);
  realtimeCtx.stroke();
  realtimeCtx.setLineDash([]);
  realtimeCtx.font = `${12 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'left';
  realtimeCtx.textBaseline = 'bottom';
  realtimeCtx.fillText(label, 54 * ratio, (y - 5) * ratio);
  realtimeCtx.restore();
}

function drawRealtimeCurrentForceLabel(width, ratio) {
  const current = buildRealtimeTotalSamples(realtimeDisplayNowMs()).at(-1)?.total;
  if (!finite(current)) return;
  const zeroY = realtimeY(0);
  const y = clamp(realtimeY(current), 14, zeroY - 10);
  const label = `${Math.round(current)} N`;
  const x = Math.min(width - 42, 82);
  const boxW = 62;
  const boxH = 20;

  realtimeCtx.save();
  realtimeCtx.font = `${12 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'center';
  realtimeCtx.textBaseline = 'middle';
  realtimeCtx.fillStyle = 'rgba(0,0,0,0.36)';
  realtimeCtx.fillRect((x - boxW / 2) * ratio, (y - boxH / 2) * ratio, boxW * ratio, boxH * ratio);
  realtimeCtx.fillStyle = '#ffffff';
  realtimeCtx.fillText(label, x * ratio, y * ratio);
  realtimeCtx.restore();
}

function realtimeDebugLine(label, stats, nowMs) {
  if (!stats || !stats.count) return `${label}: waiting`;
  const recentEvents = (stats.events || []).filter((event) => nowMs - event.tMs <= 250);
  const recentGapMs = recentEvents.length
    ? recentEvents.reduce((sum, event) => sum + event.gapMs, 0) / recentEvents.length
    : stats.recentGapMs;
  const recentDrops = recentEvents.reduce((sum, event) => sum + event.drops, 0);
  const ageMs = nowMs - stats.lastArrivalMs;
  return `${label}: ${stats.rate.toFixed(0)} Hz gap ${recentGapMs.toFixed(1)} ms drop ${recentDrops} age ${ageMs.toFixed(0)} ms`;
}

function updateRealtimeAgeTrail(stats, nowMs) {
  if (!stats || !stats.count) return;
  if (stats.lastAgeTrailMs && nowMs - stats.lastAgeTrailMs < 50) return;
  const ageMs = nowMs - stats.lastArrivalMs;
  stats.ageTrail = [ageMs, ...(stats.ageTrail || [])].slice(0, 80);
  stats.lastAgeTrailMs = nowMs;
}

function drawRealtimeCheckbox(x, y, checked, ratio) {
  const size = 15;
  realtimeCtx.save();
  realtimeCtx.fillStyle = checked ? 'rgba(255,147,9,0.95)' : 'rgba(0,0,0,0.28)';
  realtimeCtx.strokeStyle = checked ? 'rgba(255,147,9,0.95)' : 'rgba(255,255,255,0.48)';
  realtimeCtx.lineWidth = 1.3 * ratio;
  realtimeCtx.fillRect(x * ratio, y * ratio, size * ratio, size * ratio);
  realtimeCtx.strokeRect(x * ratio, y * ratio, size * ratio, size * ratio);
  if (checked) {
    realtimeCtx.strokeStyle = '#1d1205';
    realtimeCtx.lineWidth = 2 * ratio;
    realtimeCtx.beginPath();
    realtimeCtx.moveTo((x + 3.5) * ratio, (y + 8) * ratio);
    realtimeCtx.lineTo((x + 6.5) * ratio, (y + 11) * ratio);
    realtimeCtx.lineTo((x + 12) * ratio, (y + 4) * ratio);
    realtimeCtx.stroke();
  }
  realtimeCtx.restore();
}

function drawRealtimeDisclosure(x, y, open, ratio) {
  realtimeCtx.save();
  realtimeCtx.fillStyle = 'rgba(255,147,9,0.82)';
  realtimeCtx.beginPath();
  if (open) {
    realtimeCtx.moveTo((x + 1) * ratio, (y + 3) * ratio);
    realtimeCtx.lineTo((x + 11) * ratio, (y + 3) * ratio);
    realtimeCtx.lineTo((x + 6) * ratio, (y + 10) * ratio);
  } else {
    realtimeCtx.moveTo((x + 3) * ratio, (y + 1) * ratio);
    realtimeCtx.lineTo((x + 10) * ratio, (y + 6) * ratio);
    realtimeCtx.lineTo((x + 3) * ratio, (y + 11) * ratio);
  }
  realtimeCtx.closePath();
  realtimeCtx.fill();
  realtimeCtx.restore();
}

function drawRealtimeAgeTrail(nowMs, ratio, yTop = 100, maxRowsOverride = Infinity) {
  const leftStats = state.realtime.debug.left;
  const rightStats = state.realtime.debug.right;
  const leftTrail = leftStats?.ageTrail || [];
  const rightTrail = rightStats?.ageTrail || [];
  if (!leftTrail.length && !rightTrail.length) return;

  const xLeft = 58;
  const xRight = 124;
  const rowH = 14;
  const maxRows = Math.max(1, Math.floor(((realtimeChart.clientHeight || 1) - yTop - 24) / rowH));
  const rows = Math.min(maxRows, maxRowsOverride, Math.max(leftTrail.length, rightTrail.length));

  realtimeCtx.save();
  realtimeCtx.font = `${12 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'left';
  realtimeCtx.textBaseline = 'top';
  realtimeCtx.fillStyle = 'rgba(255,255,255,0.50)';
  realtimeCtx.fillText('L age', xLeft * ratio, yTop * ratio);
  realtimeCtx.fillText('R age', xRight * ratio, yTop * ratio);
  for (let i = 0; i < rows; i++) {
    const y = yTop + 16 + i * rowH;
    const alpha = 0.50 - 0.34 * (i / Math.max(1, rows - 1));
    realtimeCtx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    const leftValue = leftTrail[i];
    const rightValue = rightTrail[i];
    if (finite(leftValue)) realtimeCtx.fillText(`${Math.round(leftValue)}`, xLeft * ratio, y * ratio);
    if (finite(rightValue)) realtimeCtx.fillText(`${Math.round(rightValue)}`, xRight * ratio, y * ratio);
  }
  realtimeCtx.restore();
}

function realtimeSyncDebugLines(nowMs) {
  const left = state.realtime.debug.left;
  const right = state.realtime.debug.right;
  const firstDelta = finite(left?.firstBoardTMs) && finite(right?.firstBoardTMs)
    ? left.firstBoardTMs - right.firstBoardTMs
    : NaN;
  const lastDelta = finite(left?.lastBoardTMs) && finite(right?.lastBoardTMs)
    ? left.lastBoardTMs - right.lastBoardTMs
    : NaN;
  const leftAge = left?.lastArrivalMs ? nowMs - left.lastArrivalMs : NaN;
  const rightAge = right?.lastArrivalMs ? nowMs - right.lastArrivalMs : NaN;
  return [
    `first board L-R: ${finite(firstDelta) ? `${firstDelta.toFixed(1)} ms` : '-'}`,
    `last board L-R: ${finite(lastDelta) ? `${lastDelta.toFixed(1)} ms` : '-'}`,
    `record t0: ${finite(state.realtime.recordStartBoardMs) ? `${Math.round(state.realtime.recordStartBoardMs)} ms` : '-'}`,
    `age L/R: ${finite(leftAge) ? Math.round(leftAge) : '-'} / ${finite(rightAge) ? Math.round(rightAge) : '-'} ms`,
  ];
}

function drawRealtimeDebugHud(width, ratio) {
  const nowMs = performance.now();
  const hud = state.realtime.debugHud;
  const checkboxX = 58;
  const checkboxY = 18;

  realtimeCtx.save();
  drawRealtimeCheckbox(checkboxX, checkboxY, hud.visible, ratio);
  realtimeCtx.font = `${16 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'left';
  realtimeCtx.textBaseline = 'top';
  realtimeCtx.fillStyle = 'rgba(255,255,255,0.50)';
  realtimeCtx.fillText('HUD', (checkboxX + 22) * ratio, (checkboxY - 1) * ratio);
  realtimeCtx.restore();

  if (!hud.visible) return;

  const leftText = realtimeDebugLine('L', state.realtime.debug.left, nowMs);
  const rightText = realtimeDebugLine('R', state.realtime.debug.right, nowMs);
  const intervalText = `poll ${streamIntervalMs()} ms`;
  const syncY = 116;

  realtimeCtx.save();
  realtimeCtx.font = `${16 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'left';
  realtimeCtx.textBaseline = 'top';
  realtimeCtx.fillStyle = 'rgba(255,255,255,0.50)';
  realtimeCtx.fillText(intervalText, 58 * ratio, 42 * ratio);
  realtimeCtx.fillText(leftText, 58 * ratio, 66 * ratio);
  realtimeCtx.fillText(rightText, 58 * ratio, 90 * ratio);

  realtimeCtx.font = `${12 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillText('L age', 58 * ratio, syncY * ratio);
  realtimeCtx.fillText('R age', 124 * ratio, syncY * ratio);
  drawRealtimeDisclosure(164, syncY + 1, hud.ageOpen, ratio);

  const syncHeaderY = hud.ageOpen ? 218 : syncY + 22;
  realtimeCtx.fillStyle = 'rgba(255,147,9,0.62)';
  realtimeCtx.fillText('Sync debug', 58 * ratio, syncHeaderY * ratio);
  drawRealtimeDisclosure(132, syncHeaderY + 1, hud.syncOpen, ratio);

  if (hud.syncOpen) {
    realtimeCtx.fillStyle = 'rgba(255,255,255,0.45)';
    realtimeSyncDebugLines(nowMs).forEach((line, index) => {
      realtimeCtx.fillText(line, 58 * ratio, (syncHeaderY + 18 + index * 14) * ratio);
    });
  }
  realtimeCtx.restore();

  updateRealtimeAgeTrail(state.realtime.debug.left, nowMs);
  updateRealtimeAgeTrail(state.realtime.debug.right, nowMs);
  if (hud.ageOpen) drawRealtimeAgeTrail(nowMs, ratio, syncY + 16, 6);
}

function drawRealtimeWarmupOverlay(width, height, ratio) {
  if (!realtimeIsWarmingUp()) return;
  const remainingMs = Math.max(0, state.realtime.warmupUntilMs - performance.now());
  realtimeCtx.save();
  realtimeCtx.fillStyle = 'rgba(0,0,0,0.18)';
  realtimeCtx.fillRect(0, 0, width * ratio, height * ratio);
  realtimeCtx.fillStyle = 'rgba(255,246,228,0.88)';
  realtimeCtx.font = `${Math.min(64, Math.max(32, width / 16)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'center';
  realtimeCtx.textBaseline = 'middle';
  realtimeCtx.fillText('Preparing Realtime Stream', (width / 2) * ratio, (height / 2 - 16) * ratio);
  realtimeCtx.font = `${18 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillStyle = 'rgba(255,147,9,0.92)';
  realtimeCtx.fillText(`${(remainingMs / 1000).toFixed(1)} s`, (width / 2) * ratio, (height / 2 + 26) * ratio);
  realtimeCtx.restore();
}

function drawRealtimeTimeAxis(width, height, ratio, style) {
  const now = realtimeDisplayNowMs();
  const nowX = width - 14;
  const axisY = Math.max(36, height - 50);
  const tickStepMs = 250;
  const majorStepMs = 1000;
  const visibleMs = Math.ceil((width / state.realtime.pxPerSecond) * 1000);
  const firstTick = Math.floor((now - visibleMs) / tickStepMs) * tickStepMs;

  realtimeCtx.save();
  realtimeCtx.strokeStyle = hexToRgba(style.xAxisColor, style.xAxisOpacity);
  realtimeCtx.fillStyle = hexToRgba(style.xAxisText, 0.68);
  realtimeCtx.setLineDash(dashForStyle(style.xAxisStyle, ratio));
  realtimeCtx.font = `${11 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'center';
  realtimeCtx.textBaseline = 'top';
  realtimeCtx.beginPath();
  realtimeCtx.moveTo(0, axisY * ratio);
  realtimeCtx.lineTo(width * ratio, axisY * ratio);
  realtimeCtx.stroke();

  for (let tick = firstTick; tick <= now; tick += tickStepMs) {
    const x = nowX - ((now - tick) / 1000) * state.realtime.pxPerSecond;
    if (x < 0 || x > width) continue;
    const major = tick % majorStepMs === 0;
    realtimeCtx.beginPath();
    realtimeCtx.moveTo(x * ratio, axisY * ratio);
    realtimeCtx.lineTo(x * ratio, (axisY + (major ? 10 : 5)) * ratio);
    realtimeCtx.stroke();
    if (major) {
      const rel = Math.round((tick - now) / 1000);
      realtimeCtx.fillText(`${rel}s`, x * ratio, (axisY + 13) * ratio);
    }
  }
  realtimeCtx.restore();
}

function drawRealtime() {
  resizeRealtimeCanvas();
  updateRealtimeAutoY();
  const ratio = window.devicePixelRatio || 1;
  const width = realtimeChart.clientWidth || 1;
  const height = realtimeChart.clientHeight || 1;
  const style = state.chartStyle || DefaultChartStyle;
  realtimeCtx.clearRect(0, 0, realtimeChart.width, realtimeChart.height);
  realtimeCtx.fillStyle = style.chartBg;
  realtimeCtx.fillRect(0, 0, width * ratio, height * ratio);
  realtimeCtx.strokeStyle = style.chartOutline;
  realtimeCtx.strokeRect(0.5 * ratio, 0.5 * ratio, (width - 1) * ratio, (height - 1) * ratio);

  const zeroY = realtimeY(0);
  drawRealtimeTimeAxis(width, height, ratio, style);
  drawRealtimeForceAxis(width, ratio, style);

  realtimeCtx.save();
  realtimeCtx.strokeStyle = hexToRgba(style.zeroColor, style.zeroOpacity);
  realtimeCtx.setLineDash(dashForStyle(style.zeroStyle, ratio));
  realtimeCtx.beginPath();
  realtimeCtx.moveTo(0, zeroY * ratio);
  realtimeCtx.lineTo(width * ratio, zeroY * ratio);
  realtimeCtx.stroke();
  realtimeCtx.fillStyle = hexToRgba(style.xAxisText, 0.72);
  realtimeCtx.font = `${11 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'left';
  realtimeCtx.textBaseline = 'bottom';
  realtimeCtx.fillText('0 N', 8 * ratio, (zeroY - 4) * ratio);
  realtimeCtx.restore();

  const nowX = width - 14;
  realtimeCtx.save();
  realtimeCtx.strokeStyle = hexToRgba(style.cursorLine, style.cursorOpacity);
  realtimeCtx.setLineDash(dashForStyle(style.cursorLineStyle, ratio));
  realtimeCtx.beginPath();
  realtimeCtx.moveTo(nowX * ratio, 0);
  realtimeCtx.lineTo(nowX * ratio, (zeroY + 28) * ratio);
  realtimeCtx.stroke();
  realtimeCtx.restore();

  const now = realtimeDisplayNowMs();
  const leftLine = state.realtime.leftSamples.length
    ? realtimeVisibleSideSamples(state.realtime.leftSamples, now)
    : state.realtime.samples;
  const rightLine = state.realtime.rightSamples.length
    ? realtimeVisibleSideSamples(state.realtime.rightSamples, now)
    : state.realtime.samples;
  const totalLine = buildRealtimeTotalSamples(now);
  drawRealtimeSegments(now, width, height, ratio, style);
  drawRealtimeLine(leftLine, state.realtime.leftSamples.length ? null : 'left', style.leftColor, style.leftOpacity, now);
  drawRealtimeLine(rightLine, state.realtime.rightSamples.length ? null : 'right', style.rightColor, style.rightOpacity, now);
  drawRealtimeLine(totalLine, 'total', style.totalColor, style.totalOpacity, now);
  drawRealtimePeakLine(width, ratio, style);
  drawRealtimeCurrentForceLabel(width, ratio);
  drawRealtimeDebugHud(width, ratio);
  drawRealtimeWarmupOverlay(width, height, ratio);
  updateRealtimeScrubControl();
}

function realtimeSampleFromRow(row, fallbackTMs) {
  return {
    tMs: finite(row.t_ms) ? row.t_ms : fallbackTMs,
    left: finite(row.left_abs_n) ? row.left_abs_n : NaN,
    right: finite(row.right_abs_n) ? row.right_abs_n : NaN,
    total: finite(row.total_abs_n) ? row.total_abs_n : NaN,
  };
}

function appendRealtimeSample(sample) {
  if (finite(sample.total)) {
    state.realtime.totalPeak = Math.max(state.realtime.totalPeak, sample.total);
  }
  state.realtime.samples.push(sample);
  if (!state.realtime.reviewMode) state.realtime.cursorMs = sample.tMs;
  scanRealtimeDetector(sample);
}

function parseRealtimeCsvLine(line) {
  const parts = line.split(',');
  if (parts.length < 4 || parts[0] === 't_ms') return null;
  const sample = {
    tMs: numberOrNaN(parts[0]),
    left: numberOrNaN(parts[1]),
    right: numberOrNaN(parts[2]),
    total: numberOrNaN(parts[3]),
  };
  return finite(sample.tMs) ? sample : null;
}

function parseLocalRealtimeCsvLine(line) {
  const parts = line.split(',');
  if (parts.length < 3 || parts[0] === 't_ms') return null;
  const sample = {
    boardTMs: numberOrNaN(parts[0]),
    side: numberOrNaN(parts[1]),
    absN: numberOrNaN(parts[2]),
    seq: numberOrNaN(parts[3]),
    frameHz: numberOrNaN(parts[4]),
    streamSeq: numberOrNaN(parts[5]),
  };
  return finite(sample.side) && finite(sample.absN) ? sample : null;
}

function resetRealtimeDebug() {
  state.realtime.debug = {
    left: null,
    right: null,
  };
}

function updateRealtimeDebug(localSample) {
  const key = localSample.side === 0 ? 'left' : 'right';
  const nowMs = performance.now();
  let stats = state.realtime.debug[key];
  if (!stats) {
    stats = {
      count: 0,
      drops: 0,
      lastStreamSeq: NaN,
      lastBoardTMs: NaN,
      lastArrivalMs: 0,
      firstBoardTMs: NaN,
      maxGapMs: 0,
      events: [],
      recentGapMs: 0,
      recentDrops: 0,
      recentAgeMs: 0,
      ageTrail: [],
      lastAgeTrailMs: 0,
      startedMs: nowMs,
      rate: 0,
    };
    state.realtime.debug[key] = stats;
  }

  const boardGapMs = finite(localSample.boardTMs) && finite(stats.lastBoardTMs)
    ? localSample.boardTMs - stats.lastBoardTMs
    : NaN;
  const arrivalGapMs = stats.lastArrivalMs > 0 ? nowMs - stats.lastArrivalMs : 0;
  const gapMs = finite(boardGapMs) && boardGapMs >= 0 ? boardGapMs : arrivalGapMs;
  if (gapMs > 0) {
    stats.maxGapMs = Math.max(stats.maxGapMs, gapMs);
  }
  let dropped = 0;
  if (finite(localSample.streamSeq) && finite(stats.lastStreamSeq)) {
    const delta = localSample.streamSeq - stats.lastStreamSeq;
    if (delta > 1) {
      dropped = delta - 1;
      stats.drops += dropped;
    }
  }
  stats.lastStreamSeq = localSample.streamSeq;
  stats.lastBoardTMs = localSample.boardTMs;
  stats.lastArrivalMs = nowMs;
  stats.count++;
  stats.events.push({ tMs: nowMs, gapMs, drops: dropped, ageMs: 0 });
  const recentSince = nowMs - 250;
  stats.events = stats.events.filter((event) => event.tMs >= recentSince);
  if (stats.events.length) {
    stats.recentGapMs =
      stats.events.reduce((sum, event) => sum + event.gapMs, 0) / stats.events.length;
    stats.recentDrops = stats.events.reduce((sum, event) => sum + event.drops, 0);
    stats.recentAgeMs =
      stats.events.reduce((sum, event) => sum + (nowMs - event.tMs), 0) / stats.events.length;
  }
  if (!finite(stats.firstBoardTMs) && finite(localSample.boardTMs)) {
    stats.firstBoardTMs = localSample.boardTMs;
  }
  const elapsedS = finite(localSample.boardTMs) && finite(stats.firstBoardTMs) && localSample.boardTMs > stats.firstBoardTMs
    ? Math.max(0.001, (localSample.boardTMs - stats.firstBoardTMs) / 1000)
    : Math.max(0.001, (nowMs - stats.startedMs) / 1000);
  stats.rate = stats.count / elapsedS;
}

function appendLocalRealtimeSample(localSample) {
  if (!state.realtime.liveStartMs) {
    state.realtime.liveStartMs = performance.now();
  }
  updateRealtimeDebug(localSample);
  const warmingUp = realtimeIsWarmingUp();
  const boardTMs = finite(localSample.boardTMs)
    ? localSample.boardTMs
    : performance.now() - state.realtime.liveStartMs;
  if (warmingUp) {
    if (localSample.side === 0) {
      state.realtime.warmupLatestLeft = localSample.absN;
    } else if (localSample.side === 1) {
      state.realtime.warmupLatestRight = localSample.absN;
    }
    return;
  }
  if (!finite(state.realtime.recordStartBoardMs)) {
    state.realtime.recordStartBoardMs = boardTMs;
  }
  const tMs = Math.max(0, boardTMs - state.realtime.recordStartBoardMs);
  if (localSample.side === 0) {
    state.realtime.liveLatestLeft = localSample.absN;
    state.realtime.leftSamples.push({ tMs, value: localSample.absN });
  } else if (localSample.side === 1) {
    state.realtime.liveLatestRight = localSample.absN;
    state.realtime.rightSamples.push({ tMs, value: localSample.absN });
  }
  if (finite(state.realtime.liveLatestLeft) && finite(state.realtime.liveLatestRight)) {
    const totalSample = {
      tMs,
      left: state.realtime.liveLatestLeft,
      right: state.realtime.liveLatestRight,
      total: state.realtime.liveLatestLeft + state.realtime.liveLatestRight,
    };
    state.realtime.samples.push(totalSample);
    state.realtime.totalPeak = Math.max(state.realtime.totalPeak, totalSample.total);
    scanRealtimeDetector(totalSample);
  }
  if (!state.realtime.reviewMode) state.realtime.cursorMs = tMs;
}

function trimRealtimeSamples() {
  if (!state.realtime.samples.length &&
      !state.realtime.leftSamples.length &&
      !state.realtime.rightSamples.length) {
    return;
  }
  const now = realtimeNowMs();
  const keepMs = state.realtime.historyMs;
  state.realtime.samples = state.realtime.samples.filter((sample) => now - sample.tMs <= keepMs);
  state.realtime.leftSamples = state.realtime.leftSamples.filter((sample) => now - sample.tMs <= keepMs);
  state.realtime.rightSamples = state.realtime.rightSamples.filter((sample) => now - sample.tMs <= keepMs);
  state.realtime.detector.segments = state.realtime.detector.segments.filter((segment) => now - segment.endMs <= keepMs);
}

function realtimeFrame() {
  if (!state.realtime.playing) return;
  const nowMs = performance.now();
  if (!state.realtime.lastFrameMs) {
    state.realtime.lastFrameMs = nowMs;
  }
  const elapsedMs = nowMs - state.realtime.lastFrameMs;
  state.realtime.lastFrameMs = nowMs;

  if (state.rows.length) {
    const latestT = state.realtime.samples.at(-1)?.tMs ?? state.rows[0].t_ms ?? 0;
    const targetT = latestT + elapsedMs;
    while (state.realtime.sourceIndex < state.rows.length) {
      const row = state.rows[state.realtime.sourceIndex];
      const rowT = finite(row.t_ms) ? row.t_ms : state.realtime.sourceIndex * 4;
      if (state.realtime.samples.length && rowT > targetT) break;
      const sample = realtimeSampleFromRow(row, rowT);
      appendRealtimeSample(sample);
      state.realtime.sourceIndex++;
    }
    if (state.realtime.sourceIndex >= state.rows.length) {
      state.realtime.sourceIndex = 0;
      state.realtime.samples = [];
      resetRealtimeDetector(false);
      state.realtime.lastFrameMs = nowMs;
      drawRealtime();
      state.realtime.frameTimer = window.setTimeout(
        () => requestAnimationFrame(realtimeFrame),
        1000 / 30,
      );
      return;
    }
  }

  trimRealtimeSamples();
  drawRealtime();
  state.realtime.frameTimer = window.setTimeout(
    () => requestAnimationFrame(realtimeFrame),
    1000 / 30,
  );
}

function setRealtimePlaying(playing) {
  if (playing) void stopRealtimeStream();
  state.realtime.playing = playing;
  controls.realtimePlay.classList.toggle('active', playing);
  if (playing) {
    if (!state.rows.length) {
      setStatus('Load CSV first for realtime simulation');
      state.realtime.playing = false;
      controls.realtimePlay.classList.remove('active');
      return;
    }
    resetRealtimeSimulation();
    state.realtime.lastFrameMs = 0;
    window.clearTimeout(state.realtime.frameTimer);
    realtimeFrame();
    setStatus('Realtime CSV simulation');
  } else {
    window.clearTimeout(state.realtime.frameTimer);
    setStatus('Realtime paused');
  }
}

function streamIntervalMs() {
  return clamp(Number(controls.realtimeIntervalMs.value) || 1, 1, 1000);
}

function realtimeSampleIntervalMs() {
  return clamp(Number(controls.realtimeSampleRate?.value) || 4, 2, 4);
}

function localRealtimeStreamUrl(baseValue) {
  const endpoint = baseValue.trim() || 'http://192.168.4.1/trace.csv';
  const url = new URL(endpoint, window.location.href);
  url.pathname = '/local_realtime.csv';
  url.search = '';
  url.searchParams.set('interval', String(streamIntervalMs()));
  return url.toString();
}

function localBoardUrl(baseValue, path) {
  const endpoint = baseValue.trim() || 'http://192.168.4.1/trace.csv';
  const url = new URL(endpoint, window.location.href);
  url.pathname = path;
  url.search = '';
  return url.toString();
}

function localBatchUrl(baseValue, afterSeq) {
  const url = new URL(localBoardUrl(baseValue, '/local_batch.bin'));
  url.searchParams.set('after', String(afterSeq));
  url.searchParams.set('max', '64');
  return url.toString();
}

function localBatchStartUrl(baseValue, sync = false) {
  const url = new URL(localBoardUrl(baseValue, '/local_batch_start'));
  if (sync) url.searchParams.set('sync', '1');
  url.searchParams.set('sampleMs', String(realtimeSampleIntervalMs()));
  return url.toString();
}

function localBatchStopUrl(baseValue, sync = false) {
  const url = new URL(localBoardUrl(baseValue, '/local_batch_stop'));
  if (sync) url.searchParams.set('sync', '1');
  return url.toString();
}

function realtimeStreamUrl() {
  const endpoint = controls.endpoint.value.trim() || 'http://192.168.4.1/trace.csv';
  const url = new URL(endpoint, window.location.href);
  url.pathname = '/realtime.csv';
  url.search = '';
  return url.toString();
}

async function stopRealtimeStream(statusText = 'Realtime stopped') {
  stopRealtimeRenderLoop();
  const aborts = Array.isArray(state.realtime.liveAbort)
    ? state.realtime.liveAbort
    : [state.realtime.liveAbort].filter(Boolean);
  aborts.forEach((abort) => abort.abort());
  state.realtime.liveAbort = [];
  state.realtime.live = false;
  await sendRealtimeStopUrls();
  renderRealtimeRunState();
  if (statusText) setStatus(statusText);
}

async function sendRealtimeStopUrls() {
  const urls = [...state.realtime.stopUrls];
  state.realtime.stopUrls = [];
  if (!urls.length) return;
  await Promise.allSettled(urls.map((url) => fetch(url, { cache: 'no-store' })));
}

function abortableDelay(ms, abort) {
  return new Promise((resolve) => {
    if (abort.signal.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    abort.signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function decodeRealtimeBatch(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 24) throw new Error('short batch header');
  const magic = view.getUint32(0, true);
  if (magic !== 0x31425046) throw new Error('bad batch magic');
  const version = view.getUint8(4);
  if (version !== 1) throw new Error(`batch v${version}`);
  const side = view.getUint8(5);
  const sampleSize = view.getUint16(6, true);
  const sampleCount = view.getUint16(8, true);
  const firstSeq = view.getUint32(20, true);
  const samples = [];
  let offset = 24;
  for (let i = 0; i < sampleCount; i++) {
    if (offset + sampleSize > view.byteLength) break;
    samples.push({
      side,
      streamSeq: view.getUint32(offset, true),
      boardTMs: view.getUint32(offset + 4, true),
      seq: view.getUint32(offset + 8, true),
      absN: view.getInt16(offset + 12, true),
      frameHz: view.getUint16(offset + 14, true),
    });
    offset += sampleSize;
  }
  return { firstSeq, samples };
}

async function startRealtimeBoard(baseValue, sync = false) {
  const startUrl = localBatchStartUrl(baseValue, sync);
  const stopUrl = localBatchStopUrl(baseValue, sync);
  const response = await fetch(startUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${startUrl}: HTTP ${response.status}`);
  state.realtime.stopUrls.push(stopUrl);
}

async function pollRealtimeBatchLoop(baseValue, abort) {
  let afterSeq = 0;
  while (state.realtime.live && !abort.signal.aborted) {
    const response = await fetch(localBatchUrl(baseValue, afterSeq), {
      cache: 'no-store',
      signal: abort.signal,
    });
    if (!response.ok) throw new Error(`${localBatchUrl(baseValue, afterSeq)}: HTTP ${response.status}`);
    const batch = decodeRealtimeBatch(await response.arrayBuffer());
    batch.samples.forEach((sample) => {
      appendLocalRealtimeSample(sample);
      afterSeq = sample.streamSeq;
    });
    trimRealtimeSamples();
    drawRealtimeFromReceiver();
    if (batch.samples.length < 64) {
      await abortableDelay(streamIntervalMs(), abort);
    }
  }
}

async function consumeLocalRealtimeStream(url, abort) {
  let pending = '';
  let lastDrawMs = 0;
  const response = await fetch(url, { cache: 'no-store', signal: abort.signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  if (!response.body) throw new Error(`${url}: stream body unavailable`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (state.realtime.live) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    lines.forEach((line) => {
      const sample = parseLocalRealtimeCsvLine(line.trim());
      if (sample) appendLocalRealtimeSample(sample);
    });
    trimRealtimeSamples();
    const nowMs = performance.now();
    if (nowMs - lastDrawMs > 16) {
      drawRealtimeFromReceiver();
      lastDrawMs = nowMs;
    }
  }
}

async function startRealtimeStream() {
  setRealtimePlaying(false);
  await stopRealtimeStream('');
  resetRealtimeSimulation();

  const masterAbort = new AbortController();
  const slaveAbort = new AbortController();
  state.realtime.liveAbort = [masterAbort, slaveAbort];
  state.realtime.live = true;
  state.realtime.liveStartMs = performance.now();
  state.realtime.warmupUntilMs = state.realtime.liveStartMs + realtimeWarmupMs();
  state.realtime.recordStartBoardMs = NaN;
  state.realtime.warmupLatestLeft = NaN;
  state.realtime.warmupLatestRight = NaN;
  syncRealtimeRenderBufferControls();
  renderRealtimeRunState();
  startRealtimeRenderLoop();
  setStatus(`Batch realtime sync ${streamIntervalMs()} ms`);

  try {
    await startRealtimeBoard(controls.endpoint.value, true);
    state.realtime.stopUrls.push(localBatchStopUrl(controls.slaveEndpoint.value));
    await Promise.all([
      pollRealtimeBatchLoop(controls.endpoint.value, masterAbort),
      pollRealtimeBatchLoop(controls.slaveEndpoint.value, slaveAbort),
    ]);
  } catch (error) {
    masterAbort.abort();
    slaveAbort.abort();
    await sendRealtimeStopUrls();
    if (error.name !== 'AbortError') {
      setStatus(`Realtime error: ${error.message}`);
    }
  } finally {
    stopRealtimeRenderLoop();
    state.realtime.live = false;
    state.realtime.liveAbort = [];
    renderRealtimeRunState();
    drawRealtime();
  }
}

function resetRealtimeSimulation() {
  stopRealtimeRenderLoop();
  state.realtime.samples = [];
  state.realtime.leftSamples = [];
  state.realtime.rightSamples = [];
  state.realtime.reviewMode = false;
  state.realtime.cursorMs = 0;
  state.realtime.sourceIndex = 0;
  state.realtime.lastFrameMs = 0;
  state.realtime.yMin = 0;
  state.realtime.yMax = 2000;
  state.realtime.totalPeak = 0;
  state.realtime.liveStartMs = 0;
  state.realtime.warmupUntilMs = 0;
  state.realtime.recordStartBoardMs = NaN;
  state.realtime.warmupLatestLeft = NaN;
  state.realtime.warmupLatestRight = NaN;
  state.realtime.liveLatestLeft = NaN;
  state.realtime.liveLatestRight = NaN;
  state.realtime.renderBuffer.cursorMs = 0;
  state.realtime.renderBuffer.lastFrameMs = 0;
  state.realtime.stopUrls = [];
  resetRealtimeDetector(false);
  resetRealtimeDebug();
  updateRealtimeScrubControl();
  drawRealtime();
}

function autoView(rows) {
  return viewForRange(rows);
}

function viewForRange(rows, xMin = -Infinity, xMax = Infinity) {
  const series = seriesForView();
  const values = [0];
  rows.forEach((row) => {
    if (!finite(row.t_ms) || row.t_ms < xMin || row.t_ms > xMax) return;
    series.forEach((line) => {
      const value = row[line.key];
      if (finite(value)) values.push(value);
    });
  });
  const tMin = rows[0]?.t_ms ?? 0;
  const tMax = rows[rows.length - 1]?.t_ms ?? 1;
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  const yPad = Math.max(20, (yMax - yMin) * 0.08);
  yMin -= yPad;
  yMax += yPad;
  return { xMin: tMin, xMax: tMax, yMin, yMax };
}

function fitAllView() {
  state.view = autoView(state.rows);
  draw();
}

function fitHorizontalView() {
  const next = autoView(state.rows);
  state.view = {
    ...(state.view ?? next),
    xMin: next.xMin,
    xMax: next.xMax,
  };
  draw();
}

function fitVerticalView() {
  const base = state.view ?? autoView(state.rows);
  const next = viewForRange(state.rows, base.xMin, base.xMax);
  state.view = {
    ...base,
    yMin: next.yMin,
    yMax: next.yMax,
  };
  draw();
}

function defaultFocusWindow() {
  const rows = state.rows;
  if (!rows.length) return { startMs: 0, endMs: 1 };
  const firstT = rows[0]?.t_ms ?? 0;
  const lastT = rows[rows.length - 1]?.t_ms ?? firstT + 1;
  const span = Math.max(1, lastT - firstT);
  const marks = selectedLandmarks();
  const detectedMarks = TraceEngine.detectLandmarks(rows, currentLandmarkPrefix(), landmarkSettings(), state.discipline);
  const startFromMark = indexMs(firstFinite(marks.onset, marks.dropLanding));
  const jumpEndMs = indexMs(firstFinite(marks.jumpEnd, detectedMarks.jumpEnd));
  const landingMs = indexMs(firstFinite(marks.landing, marks.flightLanding, detectedMarks.landing, detectedMarks.flightLanding));
  const startMs = finite(startFromMark) ? startFromMark - 100 : firstT + span * 0.35;
  const endMs = finite(jumpEndMs) ? jumpEndMs : finite(landingMs) ? landingMs + 1000 : startMs + span * 0.3;
  return normalizeFocusWindow({
    startMs: clamp(startMs, firstT, lastT),
    endMs: clamp(endMs, firstT, lastT),
  });
}

function normalizeFocusWindow(windowValue) {
  const rows = state.rows;
  const firstT = rows[0]?.t_ms ?? 0;
  const lastT = rows[rows.length - 1]?.t_ms ?? firstT + 1;
  let startMs = clamp(windowValue.startMs, firstT, lastT);
  let endMs = clamp(windowValue.endMs, firstT, lastT);
  if (endMs < startMs) [startMs, endMs] = [endMs, startMs];
  if (endMs === startMs) endMs = clamp(startMs + 1, firstT, lastT);
  return { startMs, endMs };
}

function ensureFocusWindow() {
  if (!state.focusWindow) {
    state.focusWindow = defaultFocusWindow();
    return;
  }
  state.focusWindow = normalizeFocusWindow(state.focusWindow);
}

function toggleFocusWindow() {
  state.focusEnabled = !state.focusEnabled;
  controls.fitJump.classList.toggle('active', state.focusEnabled);
  if (state.focusEnabled) ensureFocusWindow();
  draw();
}

function chartRect() {
  return { left: 42, top: 22, right: chart.width - 24, bottom: chart.height - 34 };
}

function xPixel(t) {
  const r = chartRect();
  return r.left + (t - state.view.xMin) * (r.right - r.left) / (state.view.xMax - state.view.xMin || 1);
}

function yPixel(value) {
  const r = chartRect();
  return r.top + (state.view.yMax - value) * (r.bottom - r.top) / (state.view.yMax - state.view.yMin || 1);
}

function tAtPixel(x) {
  return tAtPixelInView(x, state.view);
}

function tAtPixelInView(x, view) {
  const r = chartRect();
  return view.xMin + (x - r.left) * (view.xMax - view.xMin) / (r.right - r.left || 1);
}

function valueAtPixel(y) {
  return valueAtPixelInView(y, state.view);
}

function valueAtPixelInView(y, view) {
  const r = chartRect();
  return view.yMax - (y - r.top) * (view.yMax - view.yMin) / (r.bottom - r.top || 1);
}

function focusEdgeAtPixel(pos) {
  if (!state.view || !state.focusEnabled || !state.focusWindow) return null;
  const r = chartRect();
  const ratio = window.devicePixelRatio || 1;
  if (pos.y < r.top || pos.y > r.bottom) return null;
  const startX = xPixel(state.focusWindow.startMs);
  const endX = xPixel(state.focusWindow.endMs);
  const hitPx = 9 * ratio;
  if (Math.abs(pos.x - startX) <= hitPx) return 'focusStart';
  if (Math.abs(pos.x - endX) <= hitPx) return 'focusEnd';
  return null;
}

function landmarkAtPixel(pos) {
  if (!state.view || !state.rows.length) return null;
  const r = chartRect();
  const ratio = window.devicePixelRatio || 1;
  if (pos.y < r.top || pos.y > r.bottom) return null;
  const prefix = currentLandmarkPrefix();
  const marks = editableLandmarks(prefix);
  const hitPx = 8 * ratio;
  let best = null;
  let bestDistance = Infinity;
  TraceEngine.landmarkKeys(state.discipline).forEach((key) => {
    const index = marks[key];
    if (!finite(index) || index < 0 || index >= state.rows.length) return;
    const distance = Math.abs(pos.x - xPixel(state.rows[index].t_ms));
    if (distance <= hitPx && distance < bestDistance) {
      bestDistance = distance;
      best = { prefix, key, index };
    }
  });
  return best;
}

function drawLine(rows, line) {
  const ratio = window.devicePixelRatio || 1;
  ctx.strokeStyle = hexToRgba(line.color, line.opacity);
  ctx.lineWidth = 2 * ratio;
  ctx.setLineDash(dashForStyle(line.lineStyle, ratio));
  ctx.beginPath();
  let started = false;
  rows.forEach((row) => {
    const t = row.t_ms;
    const value = row[line.key];
    if (!finite(t) || !finite(value)) return;
    const x = xPixel(t);
    if (x < 0 || x > chart.width + 20) return;
    const y = yPixel(value);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

function overlayLandmarks() {
  if (state.metricSource === 'adjusted' && state.adjustedLandmarks.total) {
    return state.adjustedLandmarks.total;
  }
  return detectedLandmarksFor('total');
}

function overlayKinematics() {
  if (!state.rows.length) return null;
  const marks = overlayLandmarks();
  const bw = bodyWeightForOverlay(state.rows, 'total_abs_n', marks);
  const massKg = finite(bw) && bw > 1 ? bw / GravityMs2 : NaN;
  if (!finite(massKg) || massKg <= 1) return null;
  const dt = sampleIntervalMs(state.rows) / 1000;
  const startIndex = finite(marks?.onset) && marks.onset >= 0 ? marks.onset : 0;
  const propStartIndex = finite(marks?.prop) && marks.prop >= 0
    ? marks.prop
    : (finite(marks?.min) && marks.min >= 0 ? marks.min : startIndex);
  const takeoffIndex = finite(marks?.takeoff) && marks.takeoff >= 0 ? marks.takeoff : state.rows.length;
  const powerEndIndex = takeoffIndex > propStartIndex
    ? takeoffIndex
    : state.rows.length;
  const isDropJump = state.discipline === 'drop_jump';
  const boxHeightM = finite(Number(controls.boxHeightCm?.value)) ? Number(controls.boxHeightCm.value) / 100 : NaN;
  const initialVelocity = isDropJump && finite(boxHeightM) && boxHeightM > 0
    ? -Math.sqrt(2 * GravityMs2 * boxHeightM)
    : 0;
  let velocity = initialVelocity;
  let displacement = 0;
  let propulsiveVelocity = isDropJump ? initialVelocity : 0;
  const rows = state.rows.map((row, index) => {
    const net = row.total_net_n;
    const abs = row.total_abs_n;
    if (index >= startIndex && finite(net) && finite(abs)) {
      const accelerationForce = isDropJump ? abs - bw : net;
      velocity += (accelerationForce / massKg) * dt;
      displacement += velocity * dt;
    }
    if (index >= propStartIndex && index < powerEndIndex && finite(net) && finite(abs)) {
      const accelerationForce = isDropJump ? abs - bw : net;
      propulsiveVelocity += (accelerationForce / massKg) * dt;
    }
    const propulsivePower = index >= propStartIndex && index < powerEndIndex && finite(abs)
      ? abs * propulsiveVelocity
      : NaN;
    const netPower = index >= startIndex && finite(abs) ? abs * velocity : NaN;
    const brakingPower = index >= startIndex && index < propStartIndex && finite(netPower) && netPower < 0
      ? -netPower
      : NaN;
    const totalAbs = row.total_abs_n;
    const landingIndex = finite(marks?.landing) && marks.landing >= 0 ? marks.landing : -1;
    const hasAsymmetryContact = (index >= startIndex && index < takeoffIndex) ||
      (landingIndex >= 0 && index >= landingIndex);
    const asymmetry = hasAsymmetryContact && finite(row.left_abs_n) && finite(row.right_abs_n) &&
        finite(totalAbs) && Math.abs(totalAbs) > 1
      ? ((row.left_abs_n - row.right_abs_n) / totalAbs) * 100
      : NaN;
    return {
      t_ms: row.t_ms,
      velocity_mps: velocity,
      displacement_cm: displacement * 100,
      force_x_bw: finite(abs) && finite(bw) && bw > 1 ? abs / bw : NaN,
      asymmetry_pct: asymmetry,
      power_propulsive_w: propulsivePower,
      power_braking_w: brakingPower,
      power_net_w: netPower,
      power_propulsive_w_per_kg: finite(propulsivePower) ? propulsivePower / massKg : NaN,
      power_braking_w_per_kg: finite(brakingPower) ? brakingPower / massKg : NaN,
      power_net_w_per_kg: finite(netPower) ? netPower / massKg : NaN,
    };
  });
  return { bodyWeightN: bw, massKg, marks, rows };
}

function drawOverlayCurve(overlay, key, color, label, lineStyle = 'solid', labelSlot = 0) {
  if (!overlay?.rows?.length) return;
  const r = chartRect();
  const ratio = window.devicePixelRatio || 1;
  const values = overlay.rows
    .filter((row) => finite(row.t_ms) && row.t_ms >= state.view.xMin && row.t_ms <= state.view.xMax)
    .map((row) => row[key])
    .filter(finite);
  const maxAbs = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (!finite(maxAbs) || maxAbs <= 0) return;
  const zeroY = yPixel(0);
  const amplitude = Math.max(24 * ratio, (r.bottom - r.top) * 0.3);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8 * ratio;
  ctx.setLineDash(dashForStyle(lineStyle, ratio));
  ctx.beginPath();
  let started = false;
  overlay.rows.forEach((row) => {
    const value = row[key];
    if (!finite(row.t_ms) || !finite(value)) return;
    const x = xPixel(row.t_ms);
    if (x < r.left - 20 || x > r.right + 20) return;
    const y = zeroY - (value / maxAbs) * amplitude;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = `${11 * ratio}px Arial`;
  ctx.fillText(label, r.right - 116 * ratio, r.top + (18 + labelSlot * 16) * ratio);
  ctx.restore();
}

function powerOverlayConfig() {
  if (state.overlays.powerMode === 'braking') {
    return {
      key: 'power_braking_w',
      relKey: 'power_braking_w_per_kg',
      label: 'PWR BRAKE',
      tooltip: 'Braking Power',
    };
  }
  if (state.overlays.powerMode === 'net') {
    return {
      key: 'power_net_w',
      relKey: 'power_net_w_per_kg',
      label: 'PWR NET',
      tooltip: 'Net Power',
    };
  }
  return {
    key: 'power_propulsive_w',
    relKey: 'power_propulsive_w_per_kg',
    label: 'PWR PROP',
    tooltip: 'Propulsive Power',
  };
}

function drawDerivedOverlays() {
  if (!state.overlays.velocity && !state.overlays.power && !state.overlays.displacement &&
      !state.overlays.asymmetry && !state.overlays.bodyweight) {
    return;
  }
  const overlay = overlayKinematics();
  if (!overlay) return;
  let slot = 0;
  if (state.overlays.velocity) {
    drawOverlayCurve(overlay, 'velocity_mps', 'rgba(72,199,255,0.88)', 'VEL', 'solid', slot++);
  }
  if (state.overlays.power) {
    const power = powerOverlayConfig();
    drawOverlayCurve(overlay, power.key, 'rgba(255,207,74,0.82)', power.label, 'solid', slot++);
  }
  if (state.overlays.displacement) {
    drawOverlayCurve(overlay, 'displacement_cm', 'rgba(190,130,255,0.78)', 'DISP', 'solid', slot++);
  }
  if (state.overlays.asymmetry) {
    drawOverlayCurve(overlay, 'asymmetry_pct', 'rgba(255,117,95,0.78)', 'ASYM', 'solid', slot++);
  }
  if (state.overlays.bodyweight) {
    drawOverlayCurve(overlay, 'force_x_bw', 'rgba(108,255,170,0.76)', 'xBW', 'solid', slot++);
  }
}

function drawLabel(text, x, y, color) {
  const ratio = window.devicePixelRatio || 1;
  ctx.font = `${12 * ratio}px Arial`;
  const width = ctx.measureText(text).width;
  const px = Math.max(46, Math.min(x, chart.width - width - 18));
  const py = Math.max(18, Math.min(y, chart.height - 22));
  ctx.fillStyle = color;
  ctx.fillText(text, px, py);
}

function drawVMark(index, label, color, rowOffset, lineStyle = 'dash') {
  if (!finite(index) || index < 0 || index >= state.rows.length) return;
  const x = xPixel(state.rows[index].t_ms);
  const r = chartRect();
  if (x < r.left || x > r.right) return;
  const ratio = window.devicePixelRatio || 1;
  ctx.strokeStyle = color;
  ctx.setLineDash(dashForStyle(lineStyle, ratio));
  ctx.beginPath();
  ctx.moveTo(x, r.top);
  ctx.lineTo(x, r.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  drawLabel(label, x + 5, r.bottom - 20, color);
}

function drawAdjustedMark(index, label, color, rowOffset, selected, lineStyle = 'solid') {
  if (!finite(index) || index < 0 || index >= state.rows.length) return;
  const x = xPixel(state.rows[index].t_ms);
  const r = chartRect();
  if (x < r.left || x > r.right) return;
  const ratio = window.devicePixelRatio || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = (selected ? 2.5 : 1.5) * ratio;
  ctx.setLineDash(dashForStyle(lineStyle, ratio));
  ctx.beginPath();
  ctx.moveTo(x, r.top);
  ctx.lineTo(x, r.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = ratio;
  drawLabel(`adj ${label}`, x + 5, r.top + 18, color);
}

function drawHMark(value, color, labelAbove, lineStyle = 'dash') {
  if (!finite(value)) return;
  const y = yPixel(value);
  const r = chartRect();
  if (y < r.top || y > r.bottom) return;
  const ratio = window.devicePixelRatio || 1;
  ctx.strokeStyle = color;
  ctx.setLineDash(dashForStyle(lineStyle, ratio));
  ctx.beginPath();
  ctx.moveTo(r.left, y);
  ctx.lineTo(r.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawLabel(`${Math.round(value)} N`, r.left + 6, y + (labelAbove ? -6 : 16), color);
}

function drawContactThreshold() {
  if (state.forceMode !== 'abs') return;
  const style = state.chartStyle || DefaultChartStyle;
  const value = landmarkSettings().contactThresholdN;
  const y = yPixel(value);
  const r = chartRect();
  if (y < r.top || y > r.bottom) return;
  const color = hexToRgba(style.hGuideColor, style.hGuideOpacity);
  ctx.strokeStyle = color;
  ctx.setLineDash(dashForStyle(style.hGuideStyle, window.devicePixelRatio || 1));
  ctx.beginPath();
  ctx.moveTo(r.left, y);
  ctx.lineTo(r.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawLabel(`contact ${Math.round(value)} N`, r.left + 6, y - 6, color);
}

function selectedLandmarks() {
  return editableLandmarks(currentLandmarkPrefix());
}

function selectedPrimaryKey() {
  const columns = columnSet();
  return state.viewMode === 'left' ? columns.left : state.viewMode === 'right' ? columns.right : columns.total;
}

function isSelectedLandmark(key) {
  return state.selectedLandmark?.prefix === currentLandmarkPrefix() && state.selectedLandmark.key === key;
}

function drawAxis() {
  const r = chartRect();
  const style = state.chartStyle || DefaultChartStyle;
  const ratio = window.devicePixelRatio || 1;
  ctx.strokeStyle = hexToRgba(style.xAxisColor, style.xAxisOpacity);
  ctx.fillStyle = hexToRgba(style.xAxisText, 0.75);
  ctx.font = `${10 * (window.devicePixelRatio || 1)}px Arial`;
  ctx.setLineDash(dashForStyle(style.xAxisStyle, ratio));
  const firstTick = Math.ceil(state.view.xMin / 5) * 5;
  for (let t = firstTick; t <= state.view.xMax; t += 5) {
    const x = xPixel(t);
    const major = t % 100 === 0;
    ctx.beginPath();
    ctx.moveTo(x, r.bottom);
    ctx.lineTo(x, r.bottom + (major ? 12 : 6));
    ctx.stroke();
    if (major) ctx.fillText(`${t} ms`, x + 2, chart.height - 5);
  }
  ctx.setLineDash([]);
}

function cursorValues(row) {
  const columns = columnSet();
  const parts = [];
  const labels = [
    ['L', columns.left],
    ['R', columns.right],
    ['T', columns.total],
  ];
  labels.forEach(([label, key]) => {
    const value = row[key];
    if (finite(value)) parts.push(`${label} ${Math.round(value)} N`);
  });
  return parts.join('  ');
}

function cursorOverlayValues(index) {
  if (!state.overlays.velocity && !state.overlays.power && !state.overlays.displacement &&
      !state.overlays.asymmetry && !state.overlays.bodyweight) {
    return [];
  }
  const overlay = overlayKinematics();
  const sample = overlay?.rows?.[index];
  if (!sample) return [];
  const lines = [];
  if (state.overlays.velocity && finite(sample.velocity_mps)) {
    lines.push(`Velocity ${sample.velocity_mps.toFixed(2)} m/s`);
  }
  if (state.overlays.power) {
    const power = powerOverlayConfig();
    const value = sample[power.key];
    if (finite(value)) {
      const powerPerMass = finite(sample[power.relKey]) ? sample[power.relKey].toFixed(1) : '-';
      lines.push(`${power.tooltip} ${Math.round(value)} W`);
      lines.push(`Relative ${powerPerMass} W/kg`);
    }
  }
  if (state.overlays.displacement && finite(sample.displacement_cm)) {
    lines.push(`Displacement ${sample.displacement_cm.toFixed(1)} cm`);
  }
  if (state.overlays.asymmetry && finite(sample.asymmetry_pct)) {
    lines.push(`Asymmetry ${sample.asymmetry_pct.toFixed(1)} %`);
  }
  if (state.overlays.bodyweight && finite(sample.force_x_bw)) {
    lines.push(`Force ${sample.force_x_bw.toFixed(2)} xBW`);
  }
  return lines;
}

function drawCursorTooltip(lines, x, y, color) {
  const filtered = lines.filter(Boolean);
  if (!filtered.length) return;
  const ratio = window.devicePixelRatio || 1;
  ctx.save();
  ctx.font = `${12 * ratio}px Arial`;
  const paddingX = 8 * ratio;
  const paddingY = 6 * ratio;
  const lineHeight = 16 * ratio;
  const width = Math.max(...filtered.map((line) => ctx.measureText(line).width)) + paddingX * 2;
  const height = filtered.length * lineHeight + paddingY * 2;
  const px = Math.max(46 * ratio, Math.min(x, chart.width - width - 14 * ratio));
  const py = Math.max(16 * ratio, Math.min(y, chart.height - height - 36 * ratio));
  ctx.fillStyle = 'rgba(0,0,0,0.46)';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = ratio;
  ctx.beginPath();
  ctx.roundRect(px, py, width, height, 5 * ratio);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  filtered.forEach((line, index) => {
    ctx.fillText(line, px + paddingX, py + paddingY + index * lineHeight);
  });
  ctx.restore();
}

function cursorIndexAtPixel(x) {
  if (!state.rows.length) return -1;
  const t = tAtPixel(x);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < state.rows.length; i++) {
    const distance = Math.abs(state.rows[i].t_ms - t);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

function ensureCursorIndex() {
  if (!state.rows.length) {
    state.cursorIndex = -1;
    return;
  }
  state.cursorIndex = clamp(state.cursorIndex, 0, state.rows.length - 1);
}

function cursorHandleRect() {
  if (!state.rows.length || state.cursorIndex < 0 || state.cursorIndex >= state.rows.length) return null;
  const row = state.rows[state.cursorIndex];
  const x = xPixel(row.t_ms);
  const r = chartRect();
  const ratio = window.devicePixelRatio || 1;
  const width = 56 * ratio;
  const height = 24 * ratio;
  return {
    x: x - width / 2,
    y: r.bottom + 10 * ratio,
    width,
    height,
    tipX: x,
    tipY: r.bottom,
  };
}

function isCursorHit(pos) {
  const rect = cursorHandleRect();
  const r = chartRect();
  const ratio = window.devicePixelRatio || 1;
  const onTimeline = pos.x >= r.left && pos.x <= r.right &&
      pos.y >= r.bottom - 8 * ratio && pos.y <= r.bottom + 38 * ratio;
  if (!rect) return onTimeline;
  const pad = 8 * ratio;
  const onHandle = pos.x >= rect.x - pad && pos.x <= rect.x + rect.width + pad &&
      pos.y >= rect.y - 14 * ratio && pos.y <= rect.y + rect.height + pad;
  return onHandle || onTimeline;
}

function drawTimeCursor() {
  if (!state.rows.length || state.cursorIndex < 0 || state.cursorIndex >= state.rows.length) return;
  const style = state.chartStyle || DefaultChartStyle;
  const row = state.rows[state.cursorIndex];
  const x = xPixel(row.t_ms);
  const r = chartRect();
  if (x < r.left || x > r.right) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  ctx.strokeStyle = hexToRgba(style.cursorLine, style.cursorOpacity);
  ctx.lineWidth = 1.5 * ratio;
  ctx.setLineDash(dashForStyle(style.cursorLineStyle, ratio));
  ctx.beginPath();
  ctx.moveTo(x, r.top);
  ctx.lineTo(x, r.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = ratio;
  const handle = cursorHandleRect();
  if (!handle) return;
  const radius = 4 * ratio;
  const roof = 8 * ratio;
  ctx.fillStyle = hexToRgba(style.cursorButton, 0.94);
  ctx.strokeStyle = hexToRgba(style.cursorLine, 0.95);
  ctx.beginPath();
  ctx.moveTo(handle.tipX, handle.tipY);
  ctx.lineTo(handle.tipX - roof, handle.y);
  ctx.lineTo(handle.x + radius, handle.y);
  ctx.quadraticCurveTo(handle.x, handle.y, handle.x, handle.y + radius);
  ctx.lineTo(handle.x, handle.y + handle.height - radius);
  ctx.quadraticCurveTo(handle.x, handle.y + handle.height, handle.x + radius, handle.y + handle.height);
  ctx.lineTo(handle.x + handle.width - radius, handle.y + handle.height);
  ctx.quadraticCurveTo(handle.x + handle.width, handle.y + handle.height, handle.x + handle.width, handle.y + handle.height - radius);
  ctx.lineTo(handle.x + handle.width, handle.y + radius);
  ctx.quadraticCurveTo(handle.x + handle.width, handle.y, handle.x + handle.width - radius, handle.y);
  ctx.lineTo(handle.tipX + roof, handle.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = style.cursorText;
  ctx.font = `${11 * ratio}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(row.t_ms)} ms`, handle.x + handle.width / 2, handle.y + handle.height / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  drawCursorTooltip(
    [cursorValues(row), ...cursorOverlayValues(state.cursorIndex)],
    x + 8 * ratio,
    r.top + 34 * ratio,
    'rgb(180,180,180)',
  );
}

function drawFocusWindowOverlay() {
  if (!state.focusEnabled || !state.focusWindow) return;
  ensureFocusWindow();
  const r = chartRect();
  const ratio = window.devicePixelRatio || 1;
  const startX = clamp(xPixel(state.focusWindow.startMs), r.left, r.right);
  const endX = clamp(xPixel(state.focusWindow.endMs), r.left, r.right);
  const leftX = Math.min(startX, endX);
  const rightX = Math.max(startX, endX);

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  if (leftX > r.left) ctx.fillRect(r.left, r.top, leftX - r.left, r.bottom - r.top);
  if (rightX < r.right) ctx.fillRect(rightX, r.top, r.right - rightX, r.bottom - r.top);
  ctx.strokeStyle = 'rgba(255,147,9,0.9)';
  ctx.lineWidth = 1.5 * ratio;
  ctx.setLineDash([]);
  [leftX, rightX].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, r.top);
    ctx.lineTo(x, r.bottom);
    ctx.stroke();
  });
  ctx.restore();
}

function draw() {
  resizeCanvas();
  ctx.clearRect(0, 0, chart.width, chart.height);
  const style = state.chartStyle || DefaultChartStyle;
  if (controls.chartPanel) controls.chartPanel.style.borderColor = style.chartOutline;
  chart.style.background = style.chartBg;
  ctx.fillStyle = style.chartBg;
  ctx.fillRect(0, 0, chart.width, chart.height);

  if (!state.rows.length) {
    drawLabel('Load a trace CSV', 50, 50, '#fff6e4');
    renderMetrics();
    return;
  }

  if (!state.view) state.view = autoView(state.rows);
  ensureCursorIndex();
  const prefix = currentLandmarkPrefix();
  const marks = detectedLandmarksFor(prefix);
  const adjustedMarks = state.adjustedLandmarks[prefix];
  const metricMarks = metricLandmarks();
  const key = selectedPrimaryKey();
  const takeoffMax = maxColumn(state.rows, key, Math.max(0, metricMarks.onset), Math.max(0, metricMarks.takeoff));
  const landingMax = maxColumn(state.rows, key, Math.max(0, metricMarks.landing), Math.max(0, metricMarks.landing + Math.round(250 / sampleIntervalMs(state.rows))));
  const r = chartRect();
  const landmarkStyle = state.chartStyle || DefaultChartStyle;
  const fwMark = (color) => hexToRgba(color, landmarkStyle.landmarkOpacity);
  const adjMark = (color) => hexToRgba(color, landmarkStyle.adjustedOpacity);

  const zeroColor = hexToRgba(landmarkStyle.zeroColor, landmarkStyle.zeroOpacity);
  ctx.strokeStyle = zeroColor;
  ctx.setLineDash(dashForStyle(landmarkStyle.zeroStyle, window.devicePixelRatio || 1));
  ctx.beginPath();
  ctx.moveTo(r.left, yPixel(0));
  ctx.lineTo(r.right, yPixel(0));
  ctx.stroke();
  ctx.setLineDash([]);
  drawLabel('0 N', r.left + 6, yPixel(0) - 6, hexToRgba(landmarkStyle.zeroColor, 0.8));

  drawHMark(takeoffMax, hexToRgba(landmarkStyle.hGuideColor, landmarkStyle.hGuideOpacity), true, landmarkStyle.hGuideStyle);
  drawHMark(landingMax, hexToRgba(landmarkStyle.landmarkLandingPeak, landmarkStyle.hGuideOpacity), false, landmarkStyle.hGuideStyle);
  drawContactThreshold();

  if (state.discipline === 'drop_jump') {
    drawVMark(marks.dropLanding, 'drop landing', fwMark(landmarkStyle.landmarkDrop), 0, landmarkStyle.landmarkStyle);
    drawVMark(marks.impactPeak, 'impact', fwMark(landmarkStyle.landmarkImpact), 1, landmarkStyle.landmarkStyle);
    drawVMark(marks.contactTrough, 'trough', fwMark(landmarkStyle.landmarkTrough), 2, landmarkStyle.landmarkStyle);
    drawVMark(marks.driveOffPeak, 'drive-off', fwMark(landmarkStyle.landmarkDrive), 3, landmarkStyle.landmarkStyle);
    drawVMark(marks.takeoff, 'takeoff', fwMark(landmarkStyle.landmarkTakeoff), 0, landmarkStyle.landmarkStyle);
    drawVMark(marks.flightLanding, 'landing', fwMark(landmarkStyle.landmarkLanding), 1, landmarkStyle.landmarkStyle);
    drawVMark(marks.landingPeak, 'landing peak', fwMark(landmarkStyle.landmarkLandingPeak), 2, landmarkStyle.landmarkStyle);
    drawVMark(marks.jumpEnd, 'jump end', fwMark(landmarkStyle.landmarkJumpEnd), 3, landmarkStyle.landmarkStyle);
  } else {
    drawVMark(marks.onset, 'onset', fwMark(landmarkStyle.landmarkDrop), 0, landmarkStyle.landmarkStyle);
    drawVMark(marks.min, 'min', fwMark(landmarkStyle.landmarkTrough), 1, landmarkStyle.landmarkStyle);
    drawVMark(marks.prop, 'prop', fwMark(landmarkStyle.landmarkDrive), 2, landmarkStyle.landmarkStyle);
    drawVMark(marks.takeoff, 'takeoff', fwMark(landmarkStyle.landmarkTakeoff), 0, landmarkStyle.landmarkStyle);
    drawVMark(marks.landing, 'landing', fwMark(landmarkStyle.landmarkLanding), 1, landmarkStyle.landmarkStyle);
    drawVMark(marks.jumpEnd, 'jump end', fwMark(landmarkStyle.landmarkJumpEnd), 2, landmarkStyle.landmarkStyle);
  }
  if (adjustedMarks) {
    if (state.discipline === 'drop_jump') {
      drawAdjustedMark(adjustedMarks.dropLanding, 'drop', adjMark(landmarkStyle.landmarkDrop), 3, isSelectedLandmark('dropLanding'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.impactPeak, 'impact', adjMark(landmarkStyle.landmarkImpact), 4, isSelectedLandmark('impactPeak'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.contactTrough, 'trough', adjMark(landmarkStyle.landmarkTrough), 5, isSelectedLandmark('contactTrough'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.driveOffPeak, 'drive', adjMark(landmarkStyle.landmarkDrive), 6, isSelectedLandmark('driveOffPeak'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.takeoff, 'takeoff', adjMark(landmarkStyle.landmarkTakeoff), 3, isSelectedLandmark('takeoff'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.flightLanding, 'land', adjMark(landmarkStyle.landmarkLanding), 4, isSelectedLandmark('flightLanding'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.landingPeak, 'peak', adjMark(landmarkStyle.landmarkLandingPeak), 5, isSelectedLandmark('landingPeak'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.jumpEnd, 'end', adjMark(landmarkStyle.landmarkJumpEnd), 6, isSelectedLandmark('jumpEnd'), landmarkStyle.adjustedStyle);
    } else {
      drawAdjustedMark(adjustedMarks.onset, 'onset', adjMark(landmarkStyle.landmarkDrop), 3, isSelectedLandmark('onset'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.min, 'min', adjMark(landmarkStyle.landmarkTrough), 4, isSelectedLandmark('min'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.prop, 'prop', adjMark(landmarkStyle.landmarkDrive), 5, isSelectedLandmark('prop'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.takeoff, 'takeoff', adjMark(landmarkStyle.landmarkTakeoff), 3, isSelectedLandmark('takeoff'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.landing, 'landing', adjMark(landmarkStyle.landmarkLanding), 4, isSelectedLandmark('landing'), landmarkStyle.adjustedStyle);
      drawAdjustedMark(adjustedMarks.jumpEnd, 'jump end', adjMark(landmarkStyle.landmarkJumpEnd), 5, isSelectedLandmark('jumpEnd'), landmarkStyle.adjustedStyle);
    }
  }

  seriesForView().forEach((line) => drawLine(state.rows, line));
  drawDerivedOverlays();
  drawAxis();
  drawTimeCursor();
  drawFocusWindowOverlay();

  const caption = state.viewMode === 'total'
    ? `Blue LEFT, red RIGHT, green TOTAL. ${state.forceMode.toUpperCase()} ${state.discipline.replace('_', ' ').toUpperCase()}`
    : `${state.viewMode.toUpperCase()} ${state.forceMode.toUpperCase()} ${state.discipline.replace('_', ' ').toUpperCase()}`;
  drawLabel(caption, r.left + 6, r.top + 16, hexToRgba(landmarkStyle.xAxisText, 0.85));
  renderMetrics();
}

function setViewMode(mode) {
  state.viewMode = mode;
  state.view = autoView(state.rows);
  controls.viewTotal.classList.toggle('active', mode === 'total');
  controls.viewLeft.classList.toggle('active', mode === 'left');
  controls.viewRight.classList.toggle('active', mode === 'right');
  draw();
}

function setForceMode(mode) {
  state.forceMode = mode;
  state.view = autoView(state.rows);
  controls.modeNet.classList.toggle('active', mode === 'net');
  controls.modeAbs.classList.toggle('active', mode === 'abs');
  controls.forceToggle.classList.toggle('net', mode === 'net');
  controls.forceToggle.classList.toggle('abs', mode === 'abs');
  draw();
}

function setOverlayEnabled(name, enabled) {
  state.overlays[name] = enabled;
  controls.overlayVelocity.classList.toggle('active', state.overlays.velocity);
  controls.overlayPower.classList.toggle('active', state.overlays.power);
  controls.overlayPowerMode.classList.toggle('active', state.overlays.power);
  controls.overlayDisplacement.classList.toggle('active', state.overlays.displacement);
  controls.overlayAsymmetry.classList.toggle('active', state.overlays.asymmetry);
  controls.overlayBodyweight.classList.toggle('active', state.overlays.bodyweight);
  draw();
}

function cyclePowerOverlayMode() {
  const modes = ['propulsive', 'braking', 'net'];
  const currentIndex = modes.indexOf(state.overlays.powerMode);
  state.overlays.powerMode = modes[(currentIndex + 1) % modes.length];
  const labels = {
    propulsive: 'PROP',
    braking: 'BRAKE',
    net: 'NET',
  };
  controls.overlayPowerMode.textContent = labels[state.overlays.powerMode];
  controls.overlayPowerMode.classList.toggle('active', state.overlays.power);
  draw();
}

function setMetricSource(source) {
  state.metricSource = source;
  controls.metricsFw.classList.toggle('active', source === 'fw');
  controls.metricsAdjusted.classList.toggle('active', source === 'adjusted');
  draw();
}

function setDiscipline(discipline) {
  state.discipline = discipline;
  state.adjustedLandmarks = { total: null, left: null, right: null };
  state.focusWindow = null;
  state.selectedLandmark = null;
  state.metricSource = discipline === 'drop_jump' ? 'adjusted' : 'fw';
  controls.metricsFw.classList.toggle('active', state.metricSource === 'fw');
  controls.metricsAdjusted.classList.toggle('active', state.metricSource === 'adjusted');
  detectAllLandmarks(false);
  if (state.focusEnabled) ensureFocusWindow();
  setStatus(`Mode: ${discipline.replace('_', ' ')}`);
  draw();
}

function detectAdjustedLandmarks(prefix) {
  return TraceEngine.detectLandmarks(state.rows, prefix, landmarkSettings(), state.discipline);
}

function detectAllLandmarks(shouldDraw = true) {
  if (!state.rows.length) return;
  const prefix = currentLandmarkPrefix();
  state.adjustedLandmarks[prefix] = detectAdjustedLandmarks(prefix);
  setStatus(`Adjusted ${prefix} landmarks detected`);
  if (shouldDraw) draw();
}

function clearAdjustedLandmarks() {
  const prefix = currentLandmarkPrefix();
  state.adjustedLandmarks[prefix] = null;
  if (state.selectedLandmark?.prefix === prefix) state.selectedLandmark = null;
  if (state.metricSource === 'adjusted') setMetricSource('fw');
  setStatus(`Adjusted ${prefix} landmarks cleared`);
  draw();
}

function loadRows(rows, source) {
  state.rows = rows;
  state.source = source;
  state.analyzeResult = null;
  state.activeResultId = null;
  state.adjustedLandmarks = { total: null, left: null, right: null };
  state.focusWindow = null;
  state.selectedLandmark = null;
  state.metricSource = state.discipline === 'drop_jump' ? 'adjusted' : 'fw';
  state.cursorIndex = state.rows.length ? 0 : -1;
  controls.metricsFw.classList.toggle('active', state.metricSource === 'fw');
  controls.metricsAdjusted.classList.toggle('active', state.metricSource === 'adjusted');
  state.view = autoView(state.rows);
  if (state.focusEnabled) ensureFocusWindow();
  if (state.discipline === 'drop_jump') {
    state.adjustedLandmarks.total = TraceEngine.detectLandmarks(state.rows, 'total', landmarkSettings(), state.discipline);
  }
  setStatus(`${source}: ${state.rows.length} samples`);
  draw();
  drawSessionPreview();
  renderSessionLeaderboard();
}

function loadCsvText(text, source) {
  state.activeTraceId = null;
  loadRows(parseCsv(text), source);
  renderTraceLibrary();
}

function endpointWithPath(endpoint, path) {
  const url = new URL(endpoint);
  url.pathname = path;
  url.search = '';
  return url.toString();
}

function appApiUrl(path, params = {}) {
  const url = new URL(endpointWithPath(controls.endpoint.value.trim(), path));
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function startMeasurementFromApp() {
  await stopRealtimeStream('');
  syncSessionMetaFromControls();
  syncDisciplineSettingsFromControls();
  const discipline = state.session.session.disciplineDefinition.discipline;
  const settings = state.session.session.disciplineDefinition.settings || {};
  setStatus(`Measurement START -> ${discipline}`);
  const response = await fetch(appApiUrl('/api/measurement/start', {
    discipline,
    traceWindowMs: settings.traceWindowMs,
    weighingMs: settings.weighingMs,
  }), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  state.measurementPoll.lastFetchedRevision = 0;
  startMeasurementStatusPolling();
  setMeasurePanelTab('session');
  setStatus(`Measurement started: ${window.JBForcePlateModels.disciplineDefinition(discipline).label}`);
}

async function stopMeasurementFromApp() {
  await stopRealtimeStream('');
  stopMeasurementStatusPolling();
  setStatus('Measurement STOP -> /api/measurement/stop');
  const response = await fetch(appApiUrl('/api/measurement/stop'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  setStatus('Measurement stopped, loading trace');
  await loadEndpoint();
}

function stopMeasurementStatusPolling() {
  if (state.measurementPoll.timer) {
    clearInterval(state.measurementPoll.timer);
    state.measurementPoll.timer = 0;
  }
  state.measurementPoll.active = false;
  renderMeasurementRunState();
}

function startMeasurementStatusPolling() {
  stopMeasurementStatusPolling();
  state.measurementPoll.active = true;
  renderMeasurementRunState();
  state.measurementPoll.lastStateText = '';
  state.measurementPoll.timer = setInterval(() => {
    pollMeasurementStatus().catch((error) => {
      stopMeasurementStatusPolling();
      setStatus(`Measurement status error: ${error.message}`);
    });
  }, 450);
}

async function pollMeasurementStatus() {
  const response = await fetch(appApiUrl('/api/measurement/status'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const status = await response.json();
  const stateText = status.instruction || status.state || 'Measuring';
  if (stateText !== state.measurementPoll.lastStateText) {
    state.measurementPoll.lastStateText = stateText;
    setStatus(`Measurement: ${stateText}`);
  }
  const revision = Number(status.revision) || 0;
  if (status.traceReady && revision && revision !== state.measurementPoll.lastFetchedRevision) {
    state.measurementPoll.lastFetchedRevision = revision;
    stopMeasurementStatusPolling();
    setStatus('Measurement complete, loading trace');
    await loadEndpoint();
    renderSessionControls();
  } else if (!status.active && status.results && !status.traceReady) {
    setStatus('Measurement complete, waiting for trace');
  }
}

function applyTraceDiscipline(discipline) {
  applyAnalyzeDiscipline(discipline);
}

async function loadEndpoint() {
  await stopRealtimeStream('');
  const url = controls.endpoint.value.trim();
  const binaryUrl = endpointWithPath(url, '/trace.bin');
  setStatus(`Loading ${binaryUrl}`);
  try {
    const binaryResponse = await fetch(binaryUrl, { cache: 'no-store' });
    if (!binaryResponse.ok) throw new Error(`HTTP ${binaryResponse.status}`);
    const decoded = decodeFwTraceBinary(await binaryResponse.arrayBuffer());
    state.activeTraceId = null;
    applyTraceDiscipline(decoded.discipline);
    loadRows(decoded.rows, binaryUrl);
    renderTraceLibrary();
    await autosaveLoadedTrace();
    return;
  } catch (binaryError) {
    const csvUrl = endpointWithPath(url, '/trace.csv');
    setStatus(`Binary unavailable, loading ${csvUrl}`);
    const response = await fetch(csvUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    loadCsvText(await response.text(), csvUrl);
    await autosaveLoadedTrace();
  }
}

function pointerPosition(event) {
  const rect = chart.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  return {
    x: (event.clientX - rect.left) * ratio,
    y: (event.clientY - rect.top) * ratio,
  };
}

function zoomRange(min, max, factor, center) {
  const left = center - min;
  const right = max - center;
  return {
    min: center - left * factor,
    max: center + right * factor,
  };
}

function beginDrag(event) {
  if (!state.view) return;
  if (event.button === 0 || event.button === 2) {
    event.preventDefault();
    const pos = pointerPosition(event);
    const landmarkHit = event.button === 0 ? landmarkAtPixel(pos) : null;
    const focusEdge = event.button === 0 ? focusEdgeAtPixel(pos) : null;
    const mode = event.button === 2 ? 'rightZoom' : landmarkHit ? 'landmark' : focusEdge ?? (isCursorHit(pos) ? 'cursor' : 'pan');
    if (mode === 'cursor') {
      state.cursorIndex = cursorIndexAtPixel(pos.x);
    } else if (mode === 'landmark') {
      state.selectedLandmark = { prefix: landmarkHit.prefix, key: landmarkHit.key };
      const adjusted = ensureAdjustedLandmarks(landmarkHit.prefix);
      syncLandmarkAliases(adjusted, landmarkHit.key, landmarkHit.index);
      state.metricSource = 'adjusted';
      controls.metricsFw.classList.toggle('active', false);
      controls.metricsAdjusted.classList.toggle('active', true);
      setStatus(`Adjusting ${landmarkHit.prefix} ${landmarkHit.key}`);
    }
    chart.classList.add('dragging');
    chart.classList.toggle('focusDragging', mode === 'focusStart' || mode === 'focusEnd');
    chart.classList.toggle('landmarkDragging', mode === 'landmark');
    state.dragging = {
      start: pos,
      last: pos,
      view: { ...state.view },
      mode,
    };
    draw();
  }
}

function updateDrag(event) {
  if (!state.dragging) return;
  event.preventDefault();
  const pos = pointerPosition(event);
  const start = state.dragging.start;
  const base = state.dragging.view;

  if (state.dragging.mode === 'landmark') {
    const selected = state.selectedLandmark;
    if (selected) {
      const adjusted = ensureAdjustedLandmarks(selected.prefix);
      syncLandmarkAliases(adjusted, selected.key, cursorIndexAtPixel(pos.x));
    }
  } else if (state.dragging.mode === 'focusStart' || state.dragging.mode === 'focusEnd') {
    const t = clamp(tAtPixel(pos.x), state.rows[0]?.t_ms ?? 0, state.rows[state.rows.length - 1]?.t_ms ?? 1);
    ensureFocusWindow();
    if (state.dragging.mode === 'focusStart') {
      state.focusWindow = normalizeFocusWindow({ ...state.focusWindow, startMs: t });
    } else {
      state.focusWindow = normalizeFocusWindow({ ...state.focusWindow, endMs: t });
    }
  } else if (state.dragging.mode === 'cursor') {
    state.cursorIndex = cursorIndexAtPixel(pos.x);
  } else if (state.dragging.mode === 'pan') {
    const t0 = tAtPixelInView(start.x, base);
    const t1 = tAtPixelInView(pos.x, base);
    const v0 = valueAtPixelInView(start.y, base);
    const v1 = valueAtPixelInView(pos.y, base);
    state.view = {
      xMin: base.xMin + (t0 - t1),
      xMax: base.xMax + (t0 - t1),
      yMin: base.yMin + (v0 - v1),
      yMax: base.yMax + (v0 - v1),
    };
  } else {
    const dx = pos.x - start.x;
    const dy = pos.y - start.y;
    const xFactor = Math.exp(-dx / 260);
    const yFactor = Math.exp(-dy / 260);
    const xCenter = tAtPixelInView(start.x, base);
    const yCenter = valueAtPixelInView(start.y, base);
    const xNext = zoomRange(base.xMin, base.xMax, xFactor, xCenter);
    const yNext = zoomRange(base.yMin, base.yMax, yFactor, yCenter);
    state.view = {
      ...state.view,
      xMin: xNext.min,
      xMax: xNext.max,
      yMin: yNext.min,
      yMax: yNext.max,
    };
  }
  draw();
}

function endDrag() {
  state.dragging = null;
  chart.classList.remove('dragging');
  chart.classList.remove('focusDragging');
  chart.classList.remove('landmarkDragging');
}

function updateHoverCursor(event) {
  if (state.dragging) return;
  const pos = pointerPosition(event);
  const landmarkHit = landmarkAtPixel(pos);
  chart.classList.toggle('landmarkHover', Boolean(landmarkHit));
  chart.classList.toggle('focusHover', !landmarkHit && Boolean(focusEdgeAtPixel(pos)));
}

controls.loadEndpoint.addEventListener('click', () => {
  loadEndpoint().catch((error) => setStatus(`Load error: ${error.message}`));
});
controls.exportCsv.addEventListener('click', exportCurrentCsv);
controls.appTabMeasure.addEventListener('click', () => setAppTab('measure'));
controls.appTabAnalyze.addEventListener('click', () => setAppTab('analyze'));
controls.appTabResults.addEventListener('click', () => setAppTab('results'));
controls.measurePanelTabSession.addEventListener('click', () => setMeasurePanelTab('session'));
controls.measurePanelTabRealtime.addEventListener('click', () => setMeasurePanelTab('realtime'));
controls.sessionPreviewFitAll.addEventListener('click', () => {
  state.focusWindow = null;
  drawSessionPreview();
});
controls.sessionPreviewFitJump.addEventListener('click', () => {
  ensureFocusWindow();
  drawSessionPreview();
});
controls.resultsSessionSelect.addEventListener('change', renderResultsPage);
controls.resultsRefresh.addEventListener('click', () => {
  loadResultsSources().catch((error) => setStatus(`Results refresh error: ${error.message}`));
});
controls.resultsPickFolder.addEventListener('click', () => {
  pickResultsFolder().catch((error) => setStatus(`Results folder error: ${error.message}`));
});
controls.resultsFolderInput.addEventListener('change', async () => {
  await parseResultsFiles([...controls.resultsFolderInput.files], 'Folder');
  controls.resultsFolderInput.value = '';
});
controls.realtimeFitVertical.addEventListener('click', () => {
  state.realtime.yMin = 0;
  state.realtime.yMax = 2000;
  drawRealtime();
});
controls.realtimeReset.addEventListener('click', () => {
  resetRealtimeSimulation();
  setStatus('Realtime reset');
});
controls.realtimeLive.addEventListener('click', returnRealtimeLive);
controls.realtimeScrub.addEventListener('input', () => {
  setRealtimeReviewCursor(Number(controls.realtimeScrub.value));
});
controls.realtimeStart.addEventListener('click', () => {
  startRealtimeStream().catch((error) => setStatus(`Realtime start error: ${error.message}`));
});
controls.realtimeStop.addEventListener('click', async () => {
  await stopRealtimeStream('Realtime stopped');
  drawRealtime();
});
controls.realtimePlay.addEventListener('click', () => setRealtimePlaying(!state.realtime.playing));
controls.realtimeSpeed.addEventListener('input', () => {
  state.realtime.pxPerSecond = Number(controls.realtimeSpeed.value) || 160;
  drawRealtime();
});
controls.realtimeAutoY.addEventListener('change', () => {
  state.realtime.autoY = controls.realtimeAutoY.checked;
  drawRealtime();
});
controls.realtimeRenderBuffer.addEventListener('change', () => {
  syncRealtimeRenderBufferControls();
  if (state.realtime.renderBuffer.enabled) {
    startRealtimeRenderLoop();
  } else {
    stopRealtimeRenderLoop();
    state.realtime.renderBuffer.cursorMs = realtimeNowMs();
    drawRealtime();
  }
});
controls.realtimeRenderLagMs.addEventListener('change', () => {
  syncRealtimeRenderBufferControls();
  if (state.realtime.live && state.realtime.renderBuffer.enabled) {
    state.realtime.renderBuffer.cursorMs = realtimeRenderTargetMs();
  }
  drawRealtime();
});
controls.realtimeExportSelected.addEventListener('click', () => {
  exportSelectedRealtimeSegments().catch((error) => setStatus(`Realtime export error: ${error.message}`));
});
realtimeChart.addEventListener('pointerdown', beginRealtimePan);
realtimeChart.addEventListener('contextmenu', (event) => event.preventDefault());
controls.measureSplitterMain.addEventListener('pointerdown', (event) => beginMeasureResize('main', event));
controls.measureSplitterControls.addEventListener('pointerdown', (event) => beginMeasureResize('controls', event));
controls.measureSplitterCurrent.addEventListener('pointerdown', beginMeasureVerticalResize);
controls.sessionBegin.addEventListener('click', () => {
  syncSessionMetaFromControls();
  syncDisciplineSettingsFromControls();
  window.JBForcePlateSessionStore.beginSession(state.session);
  renderSessionControls();
  updateCacheStatus();
  setStatus(`Session started: ${state.session.session.name}`);
});
controls.sessionStop.addEventListener('click', async () => {
  stopMeasurementStatusPolling();
  window.JBForcePlateSessionStore.stopSession(state.session);
  if (state.session.results.length) {
    const savedPackage = await window.JBForcePlateSessionArchive.saveSession(currentSessionPackage());
    state.session.session = savedPackage.session;
    state.session.results = savedPackage.results;
  }
  window.JBForcePlateSessionStore.writeStoredState(state.session);
  renderSessionLeaderboard();
  renderSessionControls();
  await updateCacheStatus();
  if (state.session.results.length) {
    await exportCurrentSessionPackage();
  } else {
    setStatus('Session stopped');
  }
});
controls.sessionDiscard.addEventListener('click', async () => {
  stopMeasurementStatusPolling();
  await stopRealtimeStream('');
  resetRealtimeSimulation();
  window.JBForcePlateSessionStore.discardSession(state.session);
  renderSessionControls();
  await updateCacheStatus();
  setStatus('Session discarded');
});
controls.syncRoster.addEventListener('click', () => {
  refreshRosterFromLibrarian()
    .then((directory) => setStatus(directory.message))
    .catch((error) => setStatus(`Roster sync error: ${error.message}`));
});
controls.clearSessionCache.addEventListener('click', () => {
  clearLocalSessionCache().catch((error) => setStatus(`Cache clear error: ${error.message}`));
});
controls.librarianApi.addEventListener('change', () => {
  window.JBForcePlateSessionStore.writeLibrarianApi(controls.librarianApi.value);
});
controls.sessionName.addEventListener('change', () => syncSessionMetaFromControls());
controls.sessionCategory.addEventListener('change', () => {
  applySessionCategory(controls.sessionCategory.value);
});
controls.sessionAthlete.addEventListener('change', () => {
  syncCurrentAthleteFromControls(controls.sessionAthlete.value);
});
controls.realtimeCategory.addEventListener('change', () => {
  applySessionCategory(controls.realtimeCategory.value);
});
controls.realtimeAthlete.addEventListener('change', () => {
  syncCurrentAthleteFromControls(controls.realtimeAthlete.value);
});
controls.measurementStart.addEventListener('click', () => {
  startMeasurementFromApp().catch((error) => setStatus(`Measurement start error: ${error.message}`));
});
controls.measurementStop.addEventListener('click', () => {
  stopMeasurementFromApp().catch((error) => setStatus(`Measurement stop error: ${error.message}`));
});
controls.measureDiscipline.addEventListener('change', () => {
  applyMeasureDiscipline(controls.measureDiscipline.value);
});
controls.realtimeDiscipline.addEventListener('change', () => {
  applyMeasureDiscipline(controls.realtimeDiscipline.value);
});
controls.measureBoxHeightCm.addEventListener('input', () => {
  controls.boxHeightCm.value = controls.measureBoxHeightCm.value;
  syncDisciplineSettingsFromControls();
  persistCurrentSettings();
  draw();
});
controls.measureTraceWindowMs.addEventListener('change', () => syncDisciplineSettingsFromControls());
controls.measureWeighingMs.addEventListener('change', () => syncDisciplineSettingsFromControls());
controls.fileInput.addEventListener('change', async () => {
  await loadCsvFiles(controls.fileInput.files);
  controls.fileInput.value = '';
});
controls.loadSessionLibrary.addEventListener('click', () => {
  loadSessionLibrary().catch((error) => setStatus(`Session library error: ${error.message}`));
});
controls.sessionLibraryFileInput.addEventListener('change', async () => {
  await loadSessionLibraryFiles(controls.sessionLibraryFileInput.files);
  controls.sessionLibraryFileInput.value = '';
});
controls.resetView.addEventListener('click', () => {
  fitAllView();
});
controls.fitHorizontal.addEventListener('click', fitHorizontalView);
controls.fitVertical.addEventListener('click', fitVerticalView);
controls.fitAll.addEventListener('click', fitAllView);
controls.fitJump.addEventListener('click', toggleFocusWindow);
controls.settingsTabLandmarks.addEventListener('click', () => setSettingsTab('landmarks'));
controls.settingsTabTraces.addEventListener('click', () => setSettingsTab('traces'));
controls.traceLibraryList.addEventListener('click', (event) => {
  const item = event.target.closest('.traceItem');
  if (!item) return;
  if (item.dataset.resultId) {
    activateSessionResult(item.dataset.resultId).catch((error) => setStatus(`Result load error: ${error.message}`));
    return;
  }
  activateTrace(item.dataset.traceId);
});
controls.clearTraceLibrary.addEventListener('click', () => {
  state.resultLibrary = [];
  state.activeResultId = null;
  state.analyzeResult = null;
  renderTraceLibrary();
  renderMetrics();
  setStatus('Session library cleared');
});
controls.viewTotal.addEventListener('click', () => setViewMode('total'));
controls.viewLeft.addEventListener('click', () => setViewMode('left'));
controls.viewRight.addEventListener('click', () => setViewMode('right'));
controls.modeNet.addEventListener('click', () => setForceMode('net'));
controls.modeAbs.addEventListener('click', () => setForceMode('abs'));
controls.overlayVelocity.addEventListener('click', () => setOverlayEnabled('velocity', !state.overlays.velocity));
controls.overlayPower.addEventListener('click', () => setOverlayEnabled('power', !state.overlays.power));
controls.overlayPowerMode.addEventListener('click', cyclePowerOverlayMode);
controls.overlayDisplacement.addEventListener('click', () => setOverlayEnabled('displacement', !state.overlays.displacement));
controls.overlayAsymmetry.addEventListener('click', () => setOverlayEnabled('asymmetry', !state.overlays.asymmetry));
controls.overlayBodyweight.addEventListener('click', () => setOverlayEnabled('bodyweight', !state.overlays.bodyweight));
controls.disciplineSelect.addEventListener('change', () => {
  setDiscipline(controls.disciplineSelect.value);
  if (controls.measureDiscipline.value === controls.disciplineSelect.value) {
    renderDisciplineSettings(controls.disciplineSelect.value);
    syncDisciplineSettingsFromControls();
  }
  syncCustomSelect(controls.disciplineSelect);
});
controls.detectAll.addEventListener('click', detectAllLandmarks);
controls.clearAdjusted.addEventListener('click', clearAdjustedLandmarks);
controls.metricsFw.addEventListener('click', () => setMetricSource('fw'));
controls.metricsAdjusted.addEventListener('click', () => setMetricSource('adjusted'));
settingControls().forEach((control) => {
  control.addEventListener('input', () => {
    controls.settingsPreset.value = 'last';
    persistCurrentSettings();
    draw();
  });
});
controls.settingsPreset.addEventListener('change', applyPresetSelection);
controls.savePreset.addEventListener('click', saveCurrentPreset);

chart.addEventListener('pointerdown', beginDrag);
chart.addEventListener('pointermove', updateHoverCursor);
window.addEventListener('pointermove', updateDrag);
window.addEventListener('pointerup', endDrag);
chart.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', () => {
  draw();
  drawRealtime();
  drawSessionPreview();
});
window.addEventListener('error', (event) => {
  setStatus(`UI error: ${event.message || 'unknown error'}`);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  setStatus(`UI async error: ${reason?.message || reason || 'unknown error'}`);
});
window.addEventListener('beforeunload', (event) => {
  if (!controls.cacheStatus.classList.contains('dirty')) return;
  event.preventDefault();
  event.returnValue = '';
});

state.chartStyle = { ...DefaultChartStyle };
controls.fitJump.classList.toggle('active', state.focusEnabled);
enhanceSelectControls();
renderPresetOptions();
applyPresetSelection();
applyMeasureLayout();
setSettingsTab('traces');
renderTraceLibrary();
initializeSessionControls().catch((error) => setStatus(`Athletes load error: ${error.message}`));
loadResultsSources().catch((error) => setStatus(`Results load error: ${error.message}`));
setMeasurePanelTab('session');
syncRealtimeRenderBufferControls();
renderRealtimeRunState();
renderMeasurementRunState();
setAppTab('measure');
draw();
drawRealtime();
drawSessionPreview();
loadEndpoint().catch((error) => setStatus(`Load error: ${error.message}`));
