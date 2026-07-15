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
  balanceAnalyze: {
    playing: false,
    engaged: false,
    cursorMs: NaN,
    trailMs: 2000,
    fadeMs: 1000,
    heatmapMode: 'off',
    heatmapCacheKey: '',
    heatmapCanvas: null,
    lastFrameMs: 0,
    raf: 0,
    tapEventCacheKey: '',
    tapEvents: [],
    view: {
      fitMode: 'all',
      zoom: 1,
      panX: 0,
      panY: 0,
    },
  },
  appTab: 'measure',
  measurePanelTab: 'session',
  measurementPoll: {
    timer: 0,
    lastFetchedRevision: 0,
    lastStateText: '',
    active: false,
  },
  deviceSettings: {
    timer: 0,
    data: null,
    requestPending: false,
    lastStage: '',
    history: [],
    historyBoard: '',
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
    balanceGlobalSamples: [],
    balanceLoad: [
      { loaded: false, belowCount: 0, segmentId: 0 },
      { loaded: false, belowCount: 0, segmentId: 0 },
    ],
    balanceGlobalSegmentId: 0,
    balanceGlobalValid: false,
    balanceThresholdN: [20, 20],
    balanceTrial: {
      phase: 'idle',
      durationMs: 30000,
      startTMs: NaN,
      endTMs: NaN,
      remainingSec: 0,
      activeSide: '',
      visionMode: 'closed',
      currentVision: 'closed',
      runs: [],
      metrics: null,
      rawTrace: null,
      added: false,
      message: '',
    },
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
    balanceLatestLeft: null,
    balanceLatestRight: null,
    debug: {
      left: null,
      right: null,
    },
    debugHud: {
      visible: true,
      ageOpen: false,
      syncOpen: false,
    },
    runConfig: null,
    preflight: {
      active: false,
      message: '',
      measuredKg: 0,
      currentKg: 0,
      stdKg: 0,
      phase: 'idle',
      remainingSec: 0,
    },
    oledScaleKey: '',
    oledBalanceKey: '',
    runToken: null,
  },
};

const chart = document.getElementById('chart');
const ctx = chart.getContext('2d');
const realtimeChart = document.getElementById('realtimeChart');
const realtimeCtx = realtimeChart.getContext('2d');
const sessionPreviewChart = document.getElementById('sessionPreviewChart');
const sessionPreviewCtx = sessionPreviewChart.getContext('2d');
const deviceFilterChart = document.getElementById('deviceFilterChart');
const deviceFilterCtx = deviceFilterChart.getContext('2d');
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const landmarkDebugEl = document.getElementById('landmarkDebug');
const SettingsStorageKey = 'jb-forceplate-analyzer-settings';
const PresetStorageKey = 'jb-forceplate-analyzer-presets';
const ActivePresetStorageKey = 'jb-forceplate-analyzer-active-preset';
const MeasureLayoutStorageKey = 'jb-forceplate-measure-layout';
const AnalyzeLayoutStorageKey = 'jb-forceplate-analyze-layout';
const GravityMs2 = 9.80665;
const SessionTraceBinaryMagic = 'JBFPTR1\n';
const JbBinaryPackageMagic = 'JBBIN01\n';
const SessionTraceBinaryColumns = ['left_net_n', 'right_net_n', 'total_net_n', 'left_abs_n', 'right_abs_n', 'total_abs_n'];
const BalanceTraceBinaryColumns = [
  ...SessionTraceBinaryColumns,
  'cop_x_mm',
  'cop_y_mm',
  'left_cop_x_mm',
  'left_cop_y_mm',
  'right_cop_x_mm',
  'right_cop_y_mm',
];
let cueAudioContext = null;

function primeCueAudio() {
  if (cueAudioContext) return cueAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  cueAudioContext = new AudioContextClass();
  if (cueAudioContext.state === 'suspended') cueAudioContext.resume().catch(() => {});
  return cueAudioContext;
}

function playPcCue(kind = 'start') {
  const audio = primeCueAudio();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = 'sine';
  oscillator.frequency.value = kind === 'stop' ? 660 : 990;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.24, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.17);
}
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
    analyzeView: document.getElementById('analyzeView'),
    analyzeSplitterSettings: document.getElementById('analyzeSplitterSettings'),
    analyzeSplitterMetrics: document.getElementById('analyzeSplitterMetrics'),
    endpoint: document.getElementById('endpoint'),
    fileInput: document.getElementById('fileInput'),
    exportCsv: document.getElementById('exportCsv'),
    loadSessionLibrary: document.getElementById('loadSessionLibrary'),
    connectedDevices: document.getElementById('connectedDevices'),
  appTabMeasure: document.getElementById('appTabMeasure'),
  appTabAnalyze: document.getElementById('appTabAnalyze'),
  appTabResults: document.getElementById('appTabResults'),
  appTabSettings: document.getElementById('appTabSettings'),
  measureView: document.getElementById('measureView'),
  analyzeView: document.getElementById('analyzeView'),
  resultsView: document.getElementById('resultsView'),
  deviceSettingsView: document.getElementById('deviceSettingsView'),
  deviceBoardSelect: document.getElementById('deviceBoardSelect'),
  deviceConnectionBadge: document.getElementById('deviceConnectionBadge'),
  deviceIdentity: document.getElementById('deviceIdentity'),
  deviceRefresh: document.getElementById('deviceRefresh'),
  deviceWeightKg: document.getElementById('deviceWeightKg'),
  deviceSumCounts: document.getElementById('deviceSumCounts'),
  deviceFrameHz: document.getElementById('deviceFrameHz'),
  deviceSampleHz: document.getElementById('deviceSampleHz'),
  deviceDrdyTimeouts: document.getElementById('deviceDrdyTimeouts'),
  deviceCalibrationState: document.getElementById('deviceCalibrationState'),
  deviceKgPerCount: document.getElementById('deviceKgPerCount'),
  deviceFilterState: document.getElementById('deviceFilterState'),
  deviceNoiseState: document.getElementById('deviceNoiseState'),
  deviceNoiseSummary: document.getElementById('deviceNoiseSummary'),
  deviceSequence: document.getElementById('deviceSequence'),
  deviceChannelRows: document.getElementById('deviceChannelRows'),
  deviceAdcConfig: document.getElementById('deviceAdcConfig'),
  deviceMeasurementState: document.getElementById('deviceMeasurementState'),
  deviceUpdatedAt: document.getElementById('deviceUpdatedAt'),
  deviceMaintenanceStage: document.getElementById('deviceMaintenanceStage'),
  deviceMaintenanceInstruction: document.getElementById('deviceMaintenanceInstruction'),
  deviceMaintenanceDescription: document.getElementById('deviceMaintenanceDescription'),
  deviceCalibrationProgressBar: document.getElementById('deviceCalibrationProgressBar'),
  deviceCalibrationProgressText: document.getElementById('deviceCalibrationProgressText'),
  deviceMaintenanceAction: document.getElementById('deviceMaintenanceAction'),
  deviceKnownMass: document.getElementById('deviceKnownMass'),
  deviceAverageCounts: document.getElementById('deviceAverageCounts'),
  deviceCalibrationMassKg: document.getElementById('deviceCalibrationMassKg'),
  deviceCalibrationWarmupSec: document.getElementById('deviceCalibrationWarmupSec'),
  deviceCalibrationNoiseSec: document.getElementById('deviceCalibrationNoiseSec'),
  deviceCalibrationTargetNoiseG: document.getElementById('deviceCalibrationTargetNoiseG'),
  deviceTare: document.getElementById('deviceTare'),
  deviceCalibrate: document.getElementById('deviceCalibrate'),
  deviceActionMessage: document.getElementById('deviceActionMessage'),
  deviceFilterProfile: document.getElementById('deviceFilterProfile'),
  deviceFilterPreset: document.getElementById('deviceFilterPreset'),
  deviceFilterView: document.getElementById('deviceFilterView'),
  deviceFilterClear: document.getElementById('deviceFilterClear'),
  deviceRawNoise: document.getElementById('deviceRawNoise'),
  deviceFilteredNoise: document.getElementById('deviceFilteredNoise'),
  deviceNoiseReduction: document.getElementById('deviceNoiseReduction'),
  deviceActivePreset: document.getElementById('deviceActivePreset'),
  deviceFilterResponse: document.getElementById('deviceFilterResponse'),
  deviceRecommendedPreset: document.getElementById('deviceRecommendedPreset'),
  deviceCopThreshold: document.getElementById('deviceCopThreshold'),
  deviceVerifiedZero: document.getElementById('deviceVerifiedZero'),
  deviceFilterChart: document.getElementById('deviceFilterChart'),
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
    cacheStatus: document.getElementById('cacheStatus'),
    cacheStatusText: document.getElementById('cacheStatusText'),
  clearSessionCache: document.getElementById('clearSessionCache'),
  deviceState: document.getElementById('deviceState'),
  deviceStateDetail: document.getElementById('deviceStateDetail'),
  sessionAthlete: document.getElementById('sessionAthlete'),
  sessionBegin: document.getElementById('sessionBegin'),
  sessionCategory: document.getElementById('sessionCategory'),
  sessionName: document.getElementById('sessionName'),
  sessionState: document.getElementById('sessionState'),
  measureDiscipline: document.getElementById('measureDiscipline'),
  measureBoxSetting: document.getElementById('measureBoxSetting'),
  measureTraceSetting: document.getElementById('measureTraceSetting'),
  measureBalanceTimeSetting: document.getElementById('measureBalanceTimeSetting'),
  measureBalanceTimeSec: document.getElementById('measureBalanceTimeSec'),
  measureWeighingSetting: document.getElementById('measureWeighingSetting'),
  measureBalanceLegSetting: document.getElementById('measureBalanceLegSetting'),
  measureBalanceLegMode: document.getElementById('measureBalanceLegMode'),
  measureBalanceVisionSetting: document.getElementById('measureBalanceVisionSetting'),
  measureBalanceVisionMode: document.getElementById('measureBalanceVisionMode'),
  slaveEndpoint: document.getElementById('slaveEndpoint'),
  realtimeBalanceLegSetting: document.getElementById('realtimeBalanceLegSetting'),
  realtimeBalanceLegMode: document.getElementById('realtimeBalanceLegMode'),
  realtimeBalanceVisionSetting: document.getElementById('realtimeBalanceVisionSetting'),
  realtimeBalanceVisionMode: document.getElementById('realtimeBalanceVisionMode'),
  realtimeBalanceTimeSetting: document.getElementById('realtimeBalanceTimeSetting'),
  realtimeBalanceTimeSec: document.getElementById('realtimeBalanceTimeSec'),
  balanceTrialSummary: document.getElementById('balanceTrialSummary'),
  balanceResultActions: document.getElementById('balanceResultActions'),
  balanceAddToSession: document.getElementById('balanceAddToSession'),
  balanceRetry: document.getElementById('balanceRetry'),
  balanceDiscard: document.getElementById('balanceDiscard'),
  realtimeIntervalMs: document.getElementById('realtimeIntervalMs'),
  realtimeSampleRate: document.getElementById('realtimeSampleRate'),
  realtimeWarmupMs: document.getElementById('realtimeWarmupMs'),
  realtimeAthlete: document.getElementById('realtimeAthlete'),
  realtimeAthleteMass: document.getElementById('realtimeAthleteMass'),
  realtimeUpdateAthleteMass: document.getElementById('realtimeUpdateAthleteMass'),
  sessionAthleteMass: document.getElementById('sessionAthleteMass'),
  sessionUpdateAthleteMass: document.getElementById('sessionUpdateAthleteMass'),
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
  balancePlaybackControls: document.getElementById('balancePlaybackControls'),
  balancePlay: document.getElementById('balancePlay'),
  balanceHeatmap: document.getElementById('balanceHeatmap'),
  balanceTrailMs: document.getElementById('balanceTrailMs'),
  balanceTrailValue: document.getElementById('balanceTrailValue'),
  balanceFadeMs: document.getElementById('balanceFadeMs'),
  balanceFadeValue: document.getElementById('balanceFadeValue'),
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

function applyAnalyzeLayout(layout = storageRead(AnalyzeLayoutStorageKey, {})) {
  const settingsWidth = clamp(Number(layout.settingsWidth) || 300, 240, 720);
  const metricsHeight = clamp(Number(layout.metricsHeight) || 310, 180, 650);
  controls.analyzeView.style.setProperty('--analyze-settings-width', `${settingsWidth}px`);
  controls.analyzeView.style.setProperty('--analyze-metrics-height', `${metricsHeight}px`);
}

function readAnalyzeLayout() {
  const style = getComputedStyle(controls.analyzeView);
  return {
    settingsWidth: Number.parseFloat(style.getPropertyValue('--analyze-settings-width')) || 300,
    metricsHeight: Number.parseFloat(style.getPropertyValue('--analyze-metrics-height')) || 310,
  };
}

function writeAnalyzeLayout(layout) {
  storageWrite(AnalyzeLayoutStorageKey, layout);
  applyAnalyzeLayout(layout);
  draw();
}

function beginAnalyzeResize(kind, event) {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const start = readAnalyzeLayout();
  document.body.classList.add(kind === 'settings' ? 'resizingMeasure' : 'resizingMeasureVertical');

  const onMove = (moveEvent) => {
    const next = { ...start };
    if (kind === 'settings') {
      next.settingsWidth = clamp(start.settingsWidth - (moveEvent.clientX - startX), 240, 720);
    } else {
      next.metricsHeight = clamp(start.metricsHeight - (moveEvent.clientY - startY), 180, 650);
    }
    applyAnalyzeLayout(next);
    draw();
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.classList.remove('resizingMeasure', 'resizingMeasureVertical');
    writeAnalyzeLayout(readAnalyzeLayout());
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp, { once: true });
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
  renderBalanceTrialControls();
  renderDeviceState();
}

function renderBalanceTrialControls() {
  const trial = state.realtime.balanceTrial;
  const done = isEyesClosedBalance() && trial.phase === 'done' && trial.metrics;
  controls.balanceTrialSummary?.classList.toggle('hidden', !done);
  controls.balanceResultActions?.classList.toggle('hidden', !done);
  if (!done) return;

  const metrics = trial.metrics;
  const sideLabel = trial.activeSide === 'left'
    ? 'Left leg'
    : trial.activeSide === 'right'
      ? 'Right leg'
      : 'Both legs';
  const summary = [
    ['Stance', sideLabel],
    ['Vision', balanceVisionLabel(trial.visionMode)],
    ['Time', `${(trial.durationMs / 1000).toFixed(0)} s`],
  ];
  if (trial.visionMode === 'paired') {
    summary.push(
      ['EO velocity', `${metrics.open.meanVelocityMmS.toFixed(1)} mm/s`],
      ['EC velocity', `${metrics.closed.meanVelocityMmS.toFixed(1)} mm/s`],
      ['Romberg velocity', `${metrics.romberg.meanVelocityRatio.toFixed(2)}x`],
      ['Romberg excursion', `${metrics.romberg.totalExcursionRatio.toFixed(2)}x`],
    );
    if (metrics.open.secondLegTapCount != null) {
      summary.push(
        ['Second Leg Tap · EO', String(metrics.open.secondLegTapCount)],
        ['Second Leg Tap · EC', String(metrics.closed.secondLegTapCount)],
      );
    }
  } else {
    summary.push(
      ['Total excursion', `${metrics.totalExcursionMm.toFixed(1)} mm`],
      ['Mean COP velocity', `${metrics.meanVelocityMmS.toFixed(1)} mm/s`],
      ['ML range', `${metrics.rangeMlMm.toFixed(1)} mm`],
      ['AP range', `${metrics.rangeApMm.toFixed(1)} mm`],
    );
    if (metrics.secondLegTapCount != null) {
      summary.push(['Second Leg Tap', String(metrics.secondLegTapCount)]);
    }
  }
  controls.balanceTrialSummary.innerHTML = summary.map(([label, value]) => `
    <div class="balanceTrialMetric">
      <span>${escapeHtml(label)}</span>
      <strong class="${secondLegTapValueClass(label, value)}">${escapeHtml(value)}</strong>
    </div>
  `).join('');
  controls.balanceAddToSession.disabled = trial.added || !state.session.session.active;
  controls.balanceAddToSession.classList.toggle('added', trial.added);
  controls.balanceAddToSession.textContent = trial.added
    ? 'ADDED TO SESSION'
    : state.session.session.active
      ? 'ADD TO SESSION'
      : 'START SESSION TO ADD';
}

function renderMeasurementRunState() {
  controls.measurementStart.classList.toggle('active', state.measurementPoll.active);
  controls.measurementStart.textContent = state.measurementPoll.active ? 'In Progress' : 'START';
  renderDeviceState();
}

function renderDeviceState() {
  if (!controls.deviceState || !controls.deviceStateDetail) return;
  let title = 'Ready';
  let detail = state.session.session.active ? 'Session active' : 'Awaiting measurement';

  if (state.realtime.live) {
    title = 'Realtime';
    detail = `Streaming ${Math.round(1000 / realtimeSampleIntervalMs())} Hz`;
  } else if (state.measurementPoll.active) {
    title = state.measurementPoll.lastStateText || 'Preparing';
    detail = 'Measurement in progress';
  }

  controls.deviceState.textContent = title;
  controls.deviceStateDetail.textContent = detail;
}

let deviceConnectivityTimer = 0;

function renderConnectedDevices(count) {
  if (!controls.connectedDevices) return;
  const label = count === 2
    ? '2 ForcePlates Connected'
    : count === 1
      ? '1 Plate Connected'
      : 'Disconnected!';
  controls.connectedDevices.textContent = label;
  controls.connectedDevices.classList.toggle('disconnected', count === 0);
}

async function isForcePlateReachable(baseUrl) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1300);
  try {
    const url = `${localBoardUrl(baseUrl, '/local_batch.bin')}?after=0&max=1`;
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function refreshConnectedDevices() {
  const [master, slave] = await Promise.all([
    isForcePlateReachable(controls.endpoint.value),
    isForcePlateReachable(controls.slaveEndpoint.value),
  ]);
  renderConnectedDevices(Number(master) + Number(slave));
}

function startDeviceConnectivityPolling() {
  if (deviceConnectivityTimer) window.clearInterval(deviceConnectivityTimer);
  refreshConnectedDevices();
  deviceConnectivityTimer = window.setInterval(() => {
    refreshConnectedDevices();
  }, 5000);
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
  const balanceDurationSec = Number(settings.durationSec) ||
    (Number(settings.traceWindowMs) > 0 ? Number(settings.traceWindowMs) / 1000 : 30);
  controls.measureBalanceTimeSec.value = balanceDurationSec;
  controls.realtimeBalanceTimeSec.value = balanceDurationSec;
  controls.measureWeighingMs.value = settings.weighingMs ?? controls.measureWeighingMs.value;
  controls.measureBalanceLegMode.value = settings.legMode || 'both';
  controls.realtimeBalanceLegMode.value = controls.measureBalanceLegMode.value;
  controls.measureBalanceVisionMode.value = normalizeBalanceVisionMode(settings.visionMode);
  controls.realtimeBalanceVisionMode.value = controls.measureBalanceVisionMode.value;
  if (controls.realtimeExportSelected) {
    controls.realtimeExportSelected.textContent = session.active ? 'Add selected to session' : 'Export selected';
  }
  renderDisciplineSettings(discipline);
  renderAthleteMassControls();
  renderBalanceTrialControls();
  syncCustomSelects();
}

function currentAthleteMassSnapshot() {
  return window.JBForcePlateSessionStore.athleteMassSnapshot(
    state.session,
    state.session.currentAthleteId,
  );
}

function currentMeasurementAthlete() {
  return window.JBForcePlateSessionStore.athleteForMeasurement(
    state.session,
    state.session.currentAthleteId,
  );
}

function lockCurrentAthleteMassSnapshot() {
  const snapshot = currentAthleteMassSnapshot();
  if (!snapshot?.profile) return snapshot;
  return window.JBForcePlateSessionStore.setAthleteMassSnapshot(
    state.session,
    state.session.currentAthleteId,
    snapshot.bodyMassKg,
    'profile',
    snapshot.measuredAt || Date.now(),
  );
}

function renderAthleteMassControls() {
  const athlete = window.JBForcePlateSessionStore.athleteById(state.session);
  const snapshot = currentAthleteMassSnapshot();
  const profileKg = Number(athlete?.bodyMassKg) || 0;
  const measuredKg = Number(snapshot?.bodyMassKg) || 0;
  const source = snapshot?.profile ? 'profile' : snapshot?.source || '';
  const text = measuredKg
    ? `Body mass ${measuredKg.toFixed(2)} kg · ${source || 'session'}`
    : 'Body mass unknown · it will be measured before START';
  const canUpdate = Boolean(
    Number(athlete?.athleteId) &&
    measuredKg &&
    !snapshot?.profile &&
    Math.abs(profileKg - measuredKg) >= 0.01
  );
  [controls.sessionAthleteMass, controls.realtimeAthleteMass].forEach((control) => {
    if (control) control.textContent = text;
  });
  [controls.sessionUpdateAthleteMass, controls.realtimeUpdateAthleteMass].forEach((control) => {
    if (control) control.classList.toggle('hidden', !canUpdate);
  });
}

async function updateCurrentAthleteProfileMass() {
  const athlete = window.JBForcePlateSessionStore.athleteById(state.session);
  const snapshot = currentAthleteMassSnapshot();
  if (!athlete || !snapshot || snapshot.profile) return;
  [controls.sessionUpdateAthleteMass, controls.realtimeUpdateAthleteMass].forEach((control) => {
    if (control) control.disabled = true;
  });
  try {
    await window.JBForcePlateSessionStore.updateAthleteBodyMass(
      state.session,
      athlete.athleteId,
      snapshot,
    );
    renderSessionControls();
    setStatus(`${window.JBForcePlateModels.athleteDisplayName(athlete)} profile updated: ${snapshot.bodyMassKg.toFixed(2)} kg`);
  } finally {
    [controls.sessionUpdateAthleteMass, controls.realtimeUpdateAthleteMass].forEach((control) => {
      if (control) control.disabled = false;
    });
  }
}

function renderDisciplineSettings(discipline = controls.measureDiscipline.value) {
  const isScale = discipline === 'scale';
  const isDropJump = discipline === 'drop_jump';
  const isJump = ['squat_jump', 'countermovement_jump', 'drop_jump'].includes(discipline);
  const isBalance = discipline === 'eyes_closed_balance';
  controls.measureBoxSetting.classList.toggle('hidden', !isDropJump);
  controls.measureTraceSetting.classList.toggle('hidden', isScale || isBalance);
  controls.measureBalanceTimeSetting.classList.toggle('hidden', !isBalance);
  controls.measureWeighingSetting.classList.toggle('hidden', !isJump);
  controls.measureBalanceLegSetting.classList.toggle('hidden', !isBalance);
  controls.measureBalanceVisionSetting.classList.toggle('hidden', !isBalance);
  controls.realtimeBalanceLegSetting.classList.toggle('hidden', !isBalance);
  controls.realtimeBalanceVisionSetting.classList.toggle('hidden', !isBalance);
  controls.realtimeBalanceTimeSetting.classList.toggle('hidden', !isBalance);
  controls.realtimePanel.classList.toggle('balanceMode', isBalance || isScale);
  if (isBalance) {
    if (!controls.realtimeSampleRate.disabled) {
      controls.realtimeSampleRate.dataset.previousValue = controls.realtimeSampleRate.value;
    }
    controls.realtimeSampleRate.value = '2';
    controls.realtimeSampleRate.disabled = true;
    syncCustomSelect(controls.realtimeSampleRate);
  } else if (controls.realtimeSampleRate.disabled) {
    controls.realtimeSampleRate.disabled = false;
    controls.realtimeSampleRate.value = controls.realtimeSampleRate.dataset.previousValue || '4';
    syncCustomSelect(controls.realtimeSampleRate);
  }
  controls.realtimePlay.classList.toggle('hidden', isBalance || isScale);
  controls.realtimeFitVertical.classList.toggle('hidden', isBalance || isScale);
  controls.realtimeSpeed.closest('label')?.classList.toggle('hidden', isBalance || isScale);
  controls.realtimeAutoY.closest('label')?.classList.toggle('hidden', isBalance || isScale);
  controls.realtimeSegmentList.classList.toggle('hidden', isBalance || isScale);
  controls.realtimeExportSelected.classList.toggle('hidden', isBalance || isScale);
  renderBalanceTrialControls();
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
  if (discipline === 'eyes_closed_balance') {
    settings.legMode = controls.measureBalanceLegMode.value === 'single' ? 'single' : 'both';
    settings.visionMode = normalizeBalanceVisionMode(controls.measureBalanceVisionMode.value);
    settings.durationSec = clamp(Number(controls.measureBalanceTimeSec.value) || 30, 5, 180);
    delete settings.traceWindowMs;
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
  if (discipline !== 'scale') controls.disciplineSelect.value = discipline;
  controls.measureTraceWindowMs.value = settings.traceWindowMs ?? controls.measureTraceWindowMs.value;
  const balanceDurationSec = Number(settings.durationSec) ||
    (Number(settings.traceWindowMs) > 0 ? Number(settings.traceWindowMs) / 1000 : 30);
  controls.measureBalanceTimeSec.value = balanceDurationSec;
  controls.realtimeBalanceTimeSec.value = balanceDurationSec;
  controls.measureWeighingMs.value = settings.weighingMs ?? controls.measureWeighingMs.value;
  controls.measureBoxHeightCm.value = settings.boxHeightCm ?? controls.measureBoxHeightCm.value;
  controls.measureBalanceLegMode.value = settings.legMode || 'both';
  controls.realtimeBalanceLegMode.value = controls.measureBalanceLegMode.value;
  controls.measureBalanceVisionMode.value = normalizeBalanceVisionMode(settings.visionMode);
  controls.realtimeBalanceVisionMode.value = controls.measureBalanceVisionMode.value;
  controls.boxHeightCm.value = controls.measureBoxHeightCm.value;
  renderDisciplineSettings(discipline);
  syncCustomSelect(controls.measureDiscipline);
  syncCustomSelect(controls.realtimeDiscipline);
  if (discipline !== 'scale') syncCustomSelect(controls.disciplineSelect);
  syncCustomSelect(controls.measureBalanceLegMode);
  syncCustomSelect(controls.realtimeBalanceLegMode);
  syncCustomSelect(controls.measureBalanceVisionMode);
  syncCustomSelect(controls.realtimeBalanceVisionMode);
  syncDisciplineSettingsFromControls();
  resetRealtimeDetector(false);
  if (discipline !== 'scale') setDiscipline(discipline);
}

async function refreshRosterFromLibrarian() {
  const sessionStore = window.JBForcePlateSessionStore;
  const librarianApi = sessionStore.readLibrarianApi();
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
  renderSessionStats();
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
  const columns = Array.isArray(rawTrace?.columns) && rawTrace.columns.length
    ? rawTrace.columns
    : SessionTraceBinaryColumns;
  const traceIdValue = result.traceRef?.traceId || result.traceHash || result.resultId || '';
  const header = {
    schema: 'jb.forceplate.trace-bin.v1',
    source: rawTrace.source || '',
    sampleIntervalMs: rawTrace.sampleIntervalMs || sampleIntervalMs(rows),
    rowCount: rows.length,
    firstMs: rawTrace.firstMs ?? rows[0]?.t_ms ?? 0,
    lastMs: rawTrace.lastMs ?? rows.at(-1)?.t_ms ?? 0,
    columns,
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
  const bytesPerRow = columns.length * 4;
  const buffer = new ArrayBuffer(dataOffset + padBytes + rows.length * bytesPerRow);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes.set(magicBytes, 0);
  view.setUint32(magicBytes.length, headerBytes.length, true);
  bytes.set(headerBytes, headerPrefixBytes);
  let offset = dataOffset + padBytes;
  rows.forEach((row) => {
    columns.forEach((key) => {
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
      const cacheStatusText = controls.cacheStatusText || controls.cacheStatus;
      if (pending.length) {
        cacheStatusText.textContent = `Local cache: ${pending.length} unexported session(s), ${resultCount} result(s)${currentSuffix}`;
        controls.cacheStatus.classList.add('dirty');
      } else {
        cacheStatusText.textContent = `Local cache: clear${currentSuffix}`;
        controls.cacheStatus.classList.remove('dirty');
      }
    } catch (error) {
      (controls.cacheStatusText || controls.cacheStatus).textContent = `Local cache unavailable: ${error.message}`;
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
  const athlete = currentMeasurementAthlete();
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
    bodyMassSnapshot: currentAthleteMassSnapshot(),
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
  const athlete = currentMeasurementAthlete();
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
      bodyMassSnapshot: currentAthleteMassSnapshot(),
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
  const lastDiscipline = lastResult?.disciplineDefinition?.discipline || lastResult?.discipline;
  const balanceValues = lastDiscipline === 'eyes_closed_balance' ? lastResult?.metrics?.values : null;
  if (balanceValues) {
    const paired = balanceValues.visionMode === 'paired' && balanceValues.open && balanceValues.closed;
    const stats = paired
      ? [
          ['EO Mean Velocity', `${Number(balanceValues.open.meanVelocityMmS || 0).toFixed(1)} mm/s`],
          ['EC Mean Velocity', `${Number(balanceValues.closed.meanVelocityMmS || 0).toFixed(1)} mm/s`],
          ['Romberg Velocity', `${Number(balanceValues.romberg?.meanVelocityRatio || 0).toFixed(2)} x`],
          ['Romberg Excursion', `${Number(balanceValues.romberg?.totalExcursionRatio || 0).toFixed(2)} x`],
        ]
      : [
          ['Mean COP Velocity', `${Number(balanceValues.meanVelocityMmS || 0).toFixed(1)} mm/s`],
          ['ML Range', `${Number(balanceValues.rangeMlMm || 0).toFixed(1)} mm`],
          ['AP Range', `${Number(balanceValues.rangeApMm || 0).toFixed(1)} mm`],
          ['L / R Load', `${Number(balanceValues.meanLeftPct || 0).toFixed(1)} / ${Number(balanceValues.meanRightPct || 0).toFixed(1)} %`],
        ];
    if (paired && balanceValues.open.secondLegTapCount != null) {
      stats.push(
        ['Second Leg Tap · EO', String(balanceValues.open.secondLegTapCount)],
        ['Second Leg Tap · EC', String(balanceValues.closed.secondLegTapCount)],
      );
    } else if (!paired && balanceValues.secondLegTapCount != null) {
      stats.push(['Second Leg Tap', String(balanceValues.secondLegTapCount)]);
    }
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
          <span>${paired ? 'EC Total Excursion' : 'Total Excursion'}</span>
          <strong>${Number(paired ? balanceValues.closed.totalExcursionMm : balanceValues.totalExcursionMm || 0).toFixed(1)} mm</strong>
        </div>
        ${stats.map(([label, value]) => `
          <div class="sessionStat">
            <span>${escapeHtml(label)}</span>
            <strong class="${secondLegTapValueClass(label, value)}">${escapeHtml(value)}</strong>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }
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
      score: result.metrics?.values?.totalExcursionMm != null
        ? `${Number(result.metrics.values.totalExcursionMm).toFixed(1)} mm`
        : `${resultRawRowCount(result)} samples`,
    }))
    .sort((a, b) => (b.result.measuredAt || 0) - (a.result.measuredAt || 0));
  controls.sessionLeaderboard.innerHTML = ranked.map((item, rank) => `
    <div class="leaderboardItem">
      <strong>${rank + 1}</strong>
      <div>
        <strong>${escapeHtml(item.result.athleteName || 'Unknown athlete')}</strong>
        <span>${escapeHtml(window.JBForcePlateModels.disciplineDefinition(
          item.result.disciplineDefinition?.discipline || item.result.discipline || ''
        ).label)}</span>
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
  setStatus(`Roster: ${directory.athletes.length} athletes`);
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
  if (tab !== 'analyze' && state.balanceAnalyze.playing) {
    stopBalanceAnalyzePlayback();
    syncBalanceAnalyzeControls();
  }
  controls.appTabMeasure.classList.toggle('active', tab === 'measure');
  controls.appTabAnalyze.classList.toggle('active', tab === 'analyze');
  controls.appTabResults.classList.toggle('active', tab === 'results');
  controls.appTabSettings.classList.toggle('active', tab === 'settings');
  controls.measureView.classList.toggle('active', tab === 'measure');
  controls.analyzeView.classList.toggle('active', tab === 'analyze');
  controls.resultsView.classList.toggle('active', tab === 'results');
  controls.deviceSettingsView.classList.toggle('active', tab === 'settings');
  if (tab === 'settings') {
    startDeviceSettingsPolling();
  } else {
    stopDeviceSettingsPolling();
  }
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

function balanceResultDescriptor(result) {
  const settings = result?.disciplineSettings || result?.disciplineDefinition?.settings || {};
  if ((result?.disciplineDefinition?.discipline || result?.discipline) !== 'eyes_closed_balance') return '';
  const stance = settings.legMode === 'single' ? 'Single leg' : 'Both legs';
  const side = settings.legMode === 'single'
    ? settings.activeSide === 'right'
      ? 'Right'
      : settings.activeSide === 'left'
        ? 'Left'
        : 'Auto'
    : '';
  const durationSec = Number(settings.durationSec) || 0;
  const vision = balanceVisionLabel(settings.visionMode || 'closed');
  return [vision, stance, side, durationSec ? `${durationSec}s` : ''].filter(Boolean).join(' · ');
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
    const balanceDetail = disciplineId === 'eyes_closed_balance' ? balanceResultDescriptor(result) : '';
    const attemptDetail = balanceDetail || (ftHeight ? `FT height ${ftHeight}` : '');
    const measuredAt = result.measuredAt ? new Date(result.measuredAt).toLocaleString() : '';
    return `
    <button class="traceItem${item.id === state.activeResultId ? ' active' : ''}" type="button" data-result-id="${item.id}">
      <div class="traceItemName">${escapeHtml(result.athleteName || 'Unknown athlete')}</div>
      ${attemptCode || attemptDetail ? `<div class="traceItemAttempt">${escapeHtml(attemptCode || discipline)}${attemptDetail ? `<span>${escapeHtml(attemptDetail)}</span>` : ''}</div>` : ''}
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

function isBalanceAnalyze() {
  return state.discipline === 'eyes_closed_balance';
}

function balanceAnalyzeDurationMs() {
  return Math.max(0, Number(state.rows.at(-1)?.t_ms) || 0);
}

function stopBalanceAnalyzePlayback() {
  const playback = state.balanceAnalyze;
  playback.playing = false;
  playback.lastFrameMs = 0;
  if (playback.raf) cancelAnimationFrame(playback.raf);
  playback.raf = 0;
}

function resetBalanceAnalyzePlayback({ resetView = false } = {}) {
  stopBalanceAnalyzePlayback();
  const playback = state.balanceAnalyze;
  playback.cursorMs = balanceAnalyzeDurationMs();
  playback.engaged = false;
  playback.tapEventCacheKey = '';
  playback.tapEvents = [];
  playback.heatmapCacheKey = '';
  playback.heatmapCanvas = null;
  if (resetView) {
    playback.view = { fitMode: 'all', zoom: 1, panX: 0, panY: 0 };
  }
  syncBalanceAnalyzeControls();
}

function syncBalanceAnalyzeControls() {
  const playback = state.balanceAnalyze;
  const durationMs = balanceAnalyzeDurationMs();
  const maxEffectMs = durationMs > 0
    ? Math.max(100, Math.ceil(durationMs / 100) * 100)
    : 30000;
  if (!finite(playback.cursorMs)) playback.cursorMs = durationMs;
  playback.cursorMs = clamp(playback.cursorMs, 0, durationMs);
  playback.trailMs = clamp(Math.round(playback.trailMs / 100) * 100, 100, maxEffectMs);
  playback.fadeMs = clamp(Math.round(playback.fadeMs / 100) * 100, 0, playback.trailMs);
  controls.balanceTrailMs.max = String(maxEffectMs);
  controls.balanceTrailMs.value = String(playback.trailMs);
  controls.balanceFadeMs.max = String(playback.trailMs);
  controls.balanceFadeMs.value = String(playback.fadeMs);
  controls.balanceTrailValue.textContent = `${playback.trailMs} ms`;
  controls.balanceFadeValue.textContent = `${playback.fadeMs} ms`;
  controls.balancePlay.textContent = playback.playing ? '❚❚ PAUSE' : '▶ PLAY';
  controls.balancePlay.classList.toggle('active', playback.playing);
  controls.balancePlay.disabled = durationMs <= 0;
  const heatmapModes = balanceAvailableHeatmapModes();
  if (!heatmapModes.includes(playback.heatmapMode)) playback.heatmapMode = 'off';
  const heatmapActive = playback.heatmapMode !== 'off';
  const heatmapSuffix = playback.heatmapMode === 'open' ? 'EO'
    : playback.heatmapMode === 'closed' ? 'EC' : 'OFF';
  controls.balanceHeatmap.textContent = `HEATMAP: ${heatmapSuffix}`;
  controls.balanceHeatmap.title = heatmapActive
    ? `Showing ${heatmapSuffix} COP dwell density · click for next view`
    : 'Show COP dwell heatmap';
  controls.balanceHeatmap.classList.toggle('active', heatmapActive);
  controls.balanceHeatmap.setAttribute('aria-pressed', heatmapActive ? 'true' : 'false');
  controls.balanceHeatmap.disabled = durationMs <= 0;
}

function balanceAvailableHeatmapModes() {
  const hasOpen = state.rows.some((row) =>
    finite(Number(row.eo_cop_x_mm)) && finite(Number(row.eo_cop_y_mm)));
  const hasClosed = state.rows.some((row) =>
    finite(Number(row.ec_cop_x_mm)) && finite(Number(row.ec_cop_y_mm)));
  if (hasOpen || hasClosed) {
    return ['off', ...(hasOpen ? ['open'] : []), ...(hasClosed ? ['closed'] : [])];
  }
  const result = state.analyzeResult?.result || null;
  const settings = result?.disciplineSettings || result?.disciplineDefinition?.settings || {};
  const mode = normalizeBalanceVisionMode(settings.visionMode);
  return ['off', mode === 'open' ? 'open' : 'closed'];
}

function balanceAnalyzePlaybackFrame(frameMs) {
  const playback = state.balanceAnalyze;
  if (!playback.playing || !isBalanceAnalyze() || state.appTab !== 'analyze') {
    stopBalanceAnalyzePlayback();
    syncBalanceAnalyzeControls();
    return;
  }
  if (!playback.lastFrameMs) playback.lastFrameMs = frameMs;
  playback.cursorMs += Math.max(0, frameMs - playback.lastFrameMs);
  playback.lastFrameMs = frameMs;
  const durationMs = balanceAnalyzeDurationMs();
  if (playback.cursorMs >= durationMs) {
    playback.cursorMs = durationMs > 0 ? playback.cursorMs % durationMs : 0;
  }
  syncBalanceAnalyzeControls();
  draw();
  if (playback.playing) playback.raf = requestAnimationFrame(balanceAnalyzePlaybackFrame);
}

function toggleBalanceAnalyzePlayback() {
  const playback = state.balanceAnalyze;
  if (playback.playing) {
    stopBalanceAnalyzePlayback();
    syncBalanceAnalyzeControls();
    return;
  }
  startBalanceAnalyzePlayback();
}

function startBalanceAnalyzePlayback({ restart = false } = {}) {
  const playback = state.balanceAnalyze;
  const durationMs = balanceAnalyzeDurationMs();
  if (durationMs <= 0) return;
  if (restart || !finite(playback.cursorMs) || playback.cursorMs >= durationMs) playback.cursorMs = 0;
  playback.engaged = true;
  playback.playing = true;
  playback.lastFrameMs = 0;
  syncBalanceAnalyzeControls();
  if (playback.raf) cancelAnimationFrame(playback.raf);
  playback.raf = requestAnimationFrame(balanceAnalyzePlaybackFrame);
}

function renderAnalyzeMode() {
  const balance = isBalanceAnalyze();
  controls.analyzeView.classList.toggle('balanceAnalyzeMode', balance);
  controls.viewTotal.closest('.curveTabs')?.classList.toggle('hidden', balance);
  controls.forceToggle.classList.toggle('hidden', balance);
  controls.overlayVelocity.closest('.overlayToggles')?.classList.toggle('hidden', balance);
  controls.balancePlaybackControls.classList.toggle('hidden', !balance);
  controls.detectAll.classList.toggle('hidden', balance);
  controls.clearAdjusted.classList.toggle('hidden', balance);
  controls.metricsFw.classList.toggle('hidden', balance);
  controls.metricsAdjusted.classList.toggle('hidden', balance);
  controls.settingsTabLandmarks.classList.toggle('hidden', balance);
  controls.fitHorizontal.closest('.chartTools')?.classList.remove('hidden');
  controls.fitJump.classList.toggle('hidden', balance);
  chart.classList.toggle('balanceAnalyzeCanvas', balance);
  if (balance && state.settingsTab === 'landmarks') setSettingsTab('traces');
  if (balance) syncBalanceAnalyzeControls();
  else stopBalanceAnalyzePlayback();
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
  renderAnalyzeMode();
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
    draw();
    if (discipline === 'eyes_closed_balance' && state.appTab === 'analyze') {
      startBalanceAnalyzePlayback({ restart: true });
    }
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

function sampledRateHz(rows, timeKey = 't_ms') {
  if (!Array.isArray(rows) || rows.length < 2) return 0;
  const deltas = [];
  const start = Math.max(1, rows.length - 160);
  for (let index = start; index < rows.length; index += 1) {
    const current = Number(rows[index]?.[timeKey]);
    const previous = Number(rows[index - 1]?.[timeKey]);
    const delta = current - previous;
    if (finite(delta) && delta > 0 && delta <= 100) deltas.push(delta);
  }
  if (!deltas.length) return 0;
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  return Math.round(1000 / median);
}

function drawSampleRateLabel(context, width, height, ratio, rows, timeKey = 't_ms') {
  const rateHz = sampledRateHz(rows, timeKey);
  if (!rateHz) return;
  context.save();
  context.fillStyle = 'rgba(255, 255, 255, 0.25)';
  context.font = `900 ${50 * ratio}px Trebuchet MS, Arial, sans-serif`;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.fillText(`${rateHz} Hz`, (width - 32) * ratio, (height - 28) * ratio);
  context.restore();
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
  const balance = isBalanceAnalyze();
  let metrics = [];
  if (balance) {
    metrics = selectedResult?.metrics?.metrics || [];
    if (!metrics.length && state.rows.length) {
      const settings = selectedResult?.disciplineDefinition?.settings || {};
      const durationMs = (Number(settings.durationSec) || 0) * 1000 ||
        (state.rows.at(-1)?.t_ms ?? 0) + sampleIntervalMs(state.rows);
      metrics = balanceMetricsPayload(computeBalanceMetrics({
        rows: state.rows,
        sampleIntervalMs: sampleIntervalMs(state.rows),
      }, durationMs)).metrics;
    }
  } else {
    metrics = state.rows.length
      ? TraceEngine.computeMetrics(
        state.rows,
        metricScope(),
        metricLandmarks(),
        state.discipline,
        { boxHeightCm: Number(controls.boxHeightCm.value) || DefaultSettingsPreset.values.boxHeightCm },
      )
      : selectedResult?.metrics?.metrics || [];
  }
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
  const balanceDetail = balanceResultDescriptor(result);
  return `
    <section class="analyzeDisciplineCard">
      <span>Discipline</span>
      <strong>${escapeHtml(discipline || '-')}</strong>
      ${balanceDetail ? `<small>${escapeHtml(balanceDetail)}</small>` : ''}
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

function secondLegTapValueClass(label, value) {
  if (!String(label).toLowerCase().startsWith('second leg tap')) return '';
  const taps = Math.max(0, Math.round(Number.parseFloat(value) || 0));
  return taps === 0 ? 'secondLegTapGood' : taps === 1 ? 'secondLegTapWarning' : 'secondLegTapBad';
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
        <div class="value ${secondLegTapValueClass(itemLabel, itemValue)}">${escapeHtml(itemValue)}</div>
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
  if (!state.rows.length || isBalanceAnalyze()) {
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
  drawSampleRateLabel(sessionPreviewCtx, width, height, ratio, state.rows);
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
    scale: 'Scale',
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

function drawScaleHud(width, height, ratio, dimBackground = true) {
  const preflight = state.realtime.preflight;
  const measuredKg = Number(preflight.measuredKg) || 0;
  const currentKg = Number(preflight.currentKg) || 0;
  const displayKg = measuredKg || currentKg;
  const done = preflight.phase === 'done';
  const measuring = preflight.phase === 'measuring';
  const loaded = displayKg >= 10;
  const title = done ? 'WEIGHT CAPTURED' : loaded ? 'STAND STILL' : 'STEP ON';
  const athlete = currentMeasurementAthlete();
  const athleteName = window.JBForcePlateModels.athleteDisplayName(athlete);

  realtimeCtx.save();
  if (dimBackground) {
    realtimeCtx.fillStyle = 'rgba(0,0,0,0.52)';
    realtimeCtx.fillRect(0, 0, width * ratio, height * ratio);
  }
  realtimeCtx.textAlign = 'center';
  realtimeCtx.textBaseline = 'middle';
  realtimeCtx.fillStyle = 'rgba(255,246,228,0.68)';
  realtimeCtx.font = `600 ${Math.min(22, Math.max(15, width / 55)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillText(athleteName, (width / 2) * ratio, (height * 0.16) * ratio);

  realtimeCtx.fillStyle = done ? '#8fdb00' : 'rgba(255,147,9,0.98)';
  realtimeCtx.font = `700 ${Math.min(58, Math.max(30, width / 17)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillText(title, (width / 2) * ratio, (height * 0.31) * ratio);

  realtimeCtx.fillStyle = done ? '#8fdb00' : '#fff6e4';
  realtimeCtx.font = `700 ${Math.min(116, Math.max(60, width / 9)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillText(displayKg >= 1 ? `${displayKg.toFixed(2)} kg` : '--.-- kg', (width / 2) * ratio, (height * 0.53) * ratio);

  realtimeCtx.fillStyle = 'rgba(255,246,228,0.72)';
  realtimeCtx.font = `600 ${Math.min(22, Math.max(15, width / 54)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  const instruction = done
    ? 'Use Update Athlete Profile to save this weight'
    : measuring
      ? `Measuring stable weight · ${preflight.remainingSec}s remaining`
      : loaded ? 'Keep completely still' : 'Step on the ForcePlate(s)';
  realtimeCtx.fillText(instruction, (width / 2) * ratio, (height * 0.73) * ratio);

  realtimeCtx.fillStyle = 'rgba(255,246,228,0.52)';
  realtimeCtx.font = `${Math.min(16, Math.max(12, width / 72)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillText(preflight.message || 'Waiting for stable weight...', (width / 2) * ratio, (height * 0.82) * ratio);
  realtimeCtx.restore();
}

function drawRealtimeWarmupOverlay(width, height, ratio) {
  if (state.realtime.preflight.active) {
    drawScaleHud(width, height, ratio, true);
    return;
  }
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

function isEyesClosedBalance() {
  const discipline = state.realtime.live
    ? state.realtime.runConfig?.discipline
    : controls.realtimeDiscipline?.value || state.discipline;
  return discipline === 'eyes_closed_balance';
}

function normalizeBalanceVisionMode(mode) {
  return ['open', 'closed', 'paired'].includes(mode) ? mode : 'closed';
}

function balanceVisionLabel(mode, short = false) {
  const normalized = normalizeBalanceVisionMode(mode);
  if (normalized === 'open') return short ? 'EO' : 'Eyes Open';
  if (normalized === 'paired') return short ? 'EO \u2192 EC' : 'Paired EO \u2192 EC';
  return short ? 'EC' : 'Eyes Closed';
}

function balanceVisionMode() {
  if (state.realtime.live && state.realtime.runConfig?.visionMode) {
    return normalizeBalanceVisionMode(state.realtime.runConfig.visionMode);
  }
  return normalizeBalanceVisionMode(controls.realtimeBalanceVisionMode?.value);
}

function syncBalanceVisionMode(mode = balanceVisionMode()) {
  const normalized = normalizeBalanceVisionMode(mode);
  controls.measureBalanceVisionMode.value = normalized;
  controls.realtimeBalanceVisionMode.value = normalized;
  syncCustomSelect(controls.measureBalanceVisionMode);
  syncCustomSelect(controls.realtimeBalanceVisionMode);
  if (!state.realtime.live) syncDisciplineSettingsFromControls();
  drawRealtime();
  return normalized;
}

function isScaleDiscipline() {
  const discipline = state.realtime.live
    ? state.realtime.runConfig?.discipline
    : controls.realtimeDiscipline?.value || state.discipline;
  return discipline === 'scale';
}

function drawScaleRealtime(width, height, ratio) {
  drawScaleHud(width, height, ratio, false);
  drawSampleRateLabel(
    realtimeCtx,
    width,
    height,
    ratio,
    state.realtime.samples.length ? state.realtime.samples : state.realtime.leftSamples,
    'tMs',
  );
  updateRealtimeScrubControl();
}

function balanceStanceMode() {
  if (state.realtime.live && state.realtime.runConfig?.legMode) {
    return state.realtime.runConfig.legMode === 'single' ? 'single' : 'both';
  }
  return controls.realtimeBalanceLegMode?.value === 'single' ? 'single' : 'both';
}

function syncBalanceStanceMode(mode = balanceStanceMode()) {
  const normalized = mode === 'single' ? 'single' : 'both';
  controls.measureBalanceLegMode.value = normalized;
  controls.realtimeBalanceLegMode.value = normalized;
  syncCustomSelect(controls.measureBalanceLegMode);
  syncCustomSelect(controls.realtimeBalanceLegMode);
  drawRealtime();
}

function syncBalanceDurationSec(value) {
  const durationSec = clamp(Number(value) || 30, 5, 180);
  controls.measureBalanceTimeSec.value = durationSec;
  controls.realtimeBalanceTimeSec.value = durationSec;
  if (state.realtime.live && isEyesClosedBalance()) return durationSec;
  syncDisciplineSettingsFromControls();
  return durationSec;
}

function balanceCopFromSample(sample) {
  const corners = [sample.tlCounts, sample.trCounts, sample.blCounts, sample.brCounts];
  if (!corners.every(finite)) return null;
  const [tl, tr, bl, br] = corners;
  const sum = tl + tr + bl + br;
  if (Math.abs(sum) < 1) return null;
  return {
    x: ((tr + br) - (tl + bl)) / sum,
    y: ((tl + tr) - (bl + br)) / sum,
    sum,
  };
}

function balanceDisplayCop(cop, loadN) {
  if (!cop) return null;
  if (balanceStanceMode() !== 'single') {
    return { x: clamp(cop.x, -1.2, 1.2), y: clamp(cop.y, -1.2, 1.2) };
  }
  const bodyMassKg = Number(state.realtime.runConfig?.bodyMassKg) || 0;
  const bodyWeightN = bodyMassKg * GravityMs2;
  const loadRatio = bodyWeightN > 0 ? Math.max(0, Number(loadN) || 0) / bodyWeightN : 1;
  return {
    x: clamp(cop.x * loadRatio, -1, 1),
    y: clamp(cop.y * loadRatio, -1, 1),
  };
}

function updateBalanceLoadState(side, absN) {
  const index = side === 1 ? 1 : 0;
  const load = state.realtime.balanceLoad[index];
  const enterN = Math.max(10, Number(state.realtime.balanceThresholdN[index]) || 20);
  const exitN = enterN * 0.65;
  if (!load.loaded && absN >= enterN) {
    load.loaded = true;
    load.belowCount = 0;
    load.segmentId++;
  } else if (load.loaded && absN < exitN) {
    load.belowCount++;
    if (load.belowCount >= 8) {
      load.loaded = false;
      load.belowCount = 0;
    }
  } else if (load.loaded) {
    load.belowCount = 0;
  }
  return load;
}

function appendBalanceGlobalSample(tMs) {
  const left = state.realtime.balanceLatestLeft;
  const right = state.realtime.balanceLatestRight;
  const valid = Boolean(left?.copValid && right?.copValid &&
    finite(left.rawCopX) && finite(left.rawCopY) &&
    finite(right.rawCopX) && finite(right.rawCopY));
  if (!valid) {
    state.realtime.balanceGlobalValid = false;
    return;
  }
  if (!state.realtime.balanceGlobalValid) {
    state.realtime.balanceGlobalSegmentId++;
    state.realtime.balanceGlobalValid = true;
  }
  const leftLoad = Math.max(0, left.value || 0);
  const rightLoad = Math.max(0, right.value || 0);
  const total = leftLoad + rightLoad;
  if (total <= 0) return;
  const plateWidthMm = 280;
  const plateHeightMm = 450;
  const gapMm = 20;
  const centerOffset = (plateWidthMm + gapMm) / 2;
  const leftX = -centerOffset + left.rawCopX * plateWidthMm / 2;
  const rightX = centerOffset + right.rawCopX * plateWidthMm / 2;
  const leftY = left.rawCopY * plateHeightMm / 2;
  const rightY = right.rawCopY * plateHeightMm / 2;
  state.realtime.balanceGlobalSamples.push({
    tMs,
    xMm: (leftX * leftLoad + rightX * rightLoad) / total,
    yMm: (leftY * leftLoad + rightY * rightLoad) / total,
    total,
    segmentId: state.realtime.balanceGlobalSegmentId,
  });
}

function latestBalanceSample(samples, now, requireCop = false) {
  for (let index = samples.length - 1; index >= 0; index--) {
    const sample = samples[index];
    if (sample.tMs > now) continue;
    if (!requireCop || (finite(sample.copX) && finite(sample.copY))) return sample;
  }
  return null;
}

function balancePlateRects(width, height) {
  const header = 74;
  const footer = 34;
  const availableH = Math.max(120, height - header - footer);
  const plateWidthMm = 280;
  const plateHeightMm = 450;
  const gapMm = 20;
  const scale = Math.max(0.1, Math.min(
    (width - 70) / (plateWidthMm * 2 + gapMm),
    availableH / plateHeightMm,
  ));
  const w = plateWidthMm * scale;
  const h = plateHeightMm * scale;
  const gap = gapMm * scale;
  const left = (width - (w * 2 + gap)) / 2;
  const y = header + (availableH - h) / 2;
  return {
    rects: [{ x: left, y, w, h }, { x: left + w + gap, y, w, h }],
    scale,
    groupLeft: left,
    groupTop: y,
    groupWidth: w * 2 + gap,
    groupHeight: h,
  };
}

function balancePixel(sample, rect) {
  return {
    x: rect.x + rect.w / 2 + sample.copX * rect.w * 0.5,
    y: rect.y + rect.h / 2 - sample.copY * rect.h * 0.5,
  };
}

function balanceTraceBounds(now) {
  const trial = state.realtime.balanceTrial;
  if (!finite(trial.startTMs) || !['measuring', 'done'].includes(trial.phase)) {
    return { startTMs: Infinity, endTMs: -Infinity };
  }
  return {
    startTMs: trial.startTMs,
    endTMs: trial.phase === 'done' && finite(trial.endTMs) ? trial.endTMs : now,
  };
}

function drawBalancePlate(rect, side, now, ratio, showTrail, emphasized) {
  const { samples, raw, label, color } = side;
  realtimeCtx.save();
  realtimeCtx.fillStyle = emphasized ? 'rgba(21,22,20,0.88)' : 'rgba(21,22,20,0.66)';
  realtimeCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  realtimeCtx.lineWidth = 1.5 * ratio;
  realtimeCtx.fillRect(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
  realtimeCtx.strokeRect(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
  realtimeCtx.strokeStyle = 'rgba(220,205,181,0.12)';
  realtimeCtx.beginPath();
  realtimeCtx.moveTo((rect.x + rect.w / 2) * ratio, rect.y * ratio);
  realtimeCtx.lineTo((rect.x + rect.w / 2) * ratio, (rect.y + rect.h) * ratio);
  realtimeCtx.moveTo(rect.x * ratio, (rect.y + rect.h / 2) * ratio);
  realtimeCtx.lineTo((rect.x + rect.w) * ratio, (rect.y + rect.h / 2) * ratio);
  realtimeCtx.stroke();
  const rightPlate = label.includes('RIGHT');
  realtimeCtx.fillStyle = 'rgba(255,255,255,0.25)';
  realtimeCtx.font = `600 ${20 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = rightPlate ? 'right' : 'left';
  realtimeCtx.textBaseline = 'top';
  realtimeCtx.fillText(
    label,
    (rightPlate ? rect.x + rect.w - 12 : rect.x + 12) * ratio,
    (rect.y + 10) * ratio,
  );
  realtimeCtx.fillStyle = 'rgba(255,246,228,0.72)';
  realtimeCtx.font = `600 ${15 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'right';
  realtimeCtx.textBaseline = 'alphabetic';
  realtimeCtx.fillText(finite(raw?.value) ? `${Math.max(0, raw.value).toFixed(0)} N` : '-- N',
    (rect.x + rect.w) * ratio, (rect.y - 10) * ratio);

  const trace = balanceTraceBounds(now);
  const points = [];
  for (let index = samples.length - 1; index >= 0; index--) {
    const sample = samples[index];
    if (sample.tMs > trace.endTMs) continue;
    if (sample.tMs < trace.startTMs) break;
    if (sample.copValid && finite(sample.copX) && finite(sample.copY)) points.push(sample);
  }
  points.reverse();
  const stride = Math.max(1, Math.ceil(points.length / 700));
  const reduced = points.filter((sample, index) => index % stride === 0 || index === points.length - 1);
  if (showTrail && reduced.length) {
    realtimeCtx.beginPath();
    realtimeCtx.rect(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
    realtimeCtx.clip();
    realtimeCtx.strokeStyle = color;
    realtimeCtx.globalAlpha = 0.58;
    realtimeCtx.lineWidth = 1.8 * ratio;
    realtimeCtx.beginPath();
    let previousSegment = null;
    reduced.forEach((sample) => {
      const point = balancePixel(sample, rect);
      if (previousSegment !== sample.segmentId) realtimeCtx.moveTo(point.x * ratio, point.y * ratio);
      else realtimeCtx.lineTo(point.x * ratio, point.y * ratio);
      previousSegment = sample.segmentId;
    });
    realtimeCtx.stroke();
  }
  realtimeCtx.restore();

  const current = raw?.copValid ? raw : null;
  if (!current || !finite(current.copX) || !finite(current.copY)) return null;
  const marker = balancePixel(current, rect);
  realtimeCtx.save();
  realtimeCtx.shadowColor = color;
  realtimeCtx.shadowBlur = 16 * ratio;
  realtimeCtx.fillStyle = color;
  realtimeCtx.beginPath();
  realtimeCtx.arc(marker.x * ratio, marker.y * ratio, 8 * ratio, 0, Math.PI * 2);
  realtimeCtx.fill();
  realtimeCtx.shadowBlur = 0;
  realtimeCtx.strokeStyle = '#fff';
  realtimeCtx.lineWidth = 2 * ratio;
  realtimeCtx.stroke();
  realtimeCtx.restore();
  return { ...marker, loadN: Math.max(0, current.value || 0) };
}

function drawSecondLegTapRipple(context, rect, eventTMs, cursorTMs, ratio) {
  const lifetimeMs = 680;
  const ageMs = cursorTMs - eventTMs;
  if (ageMs < 0 || ageMs > lifetimeMs) return;
  const progress = clamp(ageMs / lifetimeMs, 0, 1);
  const alpha = (1 - progress) ** 1.35;
  const centerX = (rect.x + rect.w / 2) * ratio;
  const centerY = (rect.y + rect.h / 2) * ratio;
  // Keep the effect in plate space so it follows Balance zoom exactly.
  // At the end of its lifetime the ring radius equals one plate width.
  const maxRadius = rect.w;
  const radius = maxRadius * (0.08 + progress * 0.92) * ratio;

  context.save();
  context.fillStyle = `rgba(240,42,20,${(0.38 * alpha).toFixed(3)})`;
  context.beginPath();
  context.arc(centerX, centerY, Math.max(3, (8 - progress * 3) * ratio), 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = `rgba(240,42,20,${(0.72 * alpha).toFixed(3)})`;
  context.lineWidth = Math.max(1, 1.8 * ratio);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawRealtimeSecondLegTapRipples(layout, trial, now, ratio) {
  if (balanceStanceMode() !== 'single' || !['measuring', 'done'].includes(trial.phase)) return;
  if (!['left', 'right'].includes(trial.activeSide) || !finite(trial.startTMs)) return;
  const secondSideIsRight = trial.activeSide === 'left';
  const samples = secondSideIsRight ? state.realtime.rightSamples : state.realtime.leftSamples;
  const thresholdN = state.realtime.balanceThresholdN[secondSideIsRight ? 1 : 0];
  const events = detectSecondLegTapEvents(samples, {
    forceKey: 'value',
    timeKey: 'tMs',
    thresholdN,
    startMs: trial.startTMs,
    endMs: Math.min(now, trial.endTMs),
  });
  const rect = layout.rects[secondSideIsRight ? 1 : 0];
  events.slice(-3).forEach((eventTMs) => {
    drawSecondLegTapRipple(realtimeCtx, rect, eventTMs, now, ratio);
  });
}

function balanceGlobalPixel(sample, layout) {
  const totalWidthMm = 280 * 2 + 20;
  return {
    x: layout.groupLeft + ((sample.xMm + totalWidthMm / 2) / totalWidthMm) * layout.groupWidth,
    y: layout.groupTop + layout.groupHeight / 2 - (sample.yMm / 450) * layout.groupHeight,
  };
}

function drawBalanceGlobalTrace(layout, now, ratio) {
  const trace = balanceTraceBounds(now);
  const points = state.realtime.balanceGlobalSamples.filter(
    (sample) => sample.tMs >= trace.startTMs && sample.tMs <= trace.endTMs,
  );
  const stride = Math.max(1, Math.ceil(points.length / 900));
  const reduced = points.filter((sample, index) => index % stride === 0 || index === points.length - 1);
  if (reduced.length) {
    realtimeCtx.save();
    realtimeCtx.strokeStyle = 'rgba(255,255,255,0.72)';
    realtimeCtx.lineWidth = 2 * ratio;
    realtimeCtx.beginPath();
    let previousSegment = null;
    reduced.forEach((sample) => {
      const point = balanceGlobalPixel(sample, layout);
      if (previousSegment !== sample.segmentId) realtimeCtx.moveTo(point.x * ratio, point.y * ratio);
      else realtimeCtx.lineTo(point.x * ratio, point.y * ratio);
      previousSegment = sample.segmentId;
    });
    realtimeCtx.stroke();
    realtimeCtx.restore();
  }
  if (!state.realtime.balanceGlobalValid || !points.length) return null;
  const current = points[points.length - 1];
  const point = balanceGlobalPixel(current, layout);
  realtimeCtx.save();
  realtimeCtx.shadowColor = '#fff';
  realtimeCtx.shadowBlur = 18 * ratio;
  realtimeCtx.fillStyle = '#fff';
  realtimeCtx.beginPath();
  realtimeCtx.arc(point.x * ratio, point.y * ratio, 9 * ratio, 0, Math.PI * 2);
  realtimeCtx.fill();
  realtimeCtx.shadowBlur = 0;
  realtimeCtx.strokeStyle = '#171715';
  realtimeCtx.lineWidth = 2 * ratio;
  realtimeCtx.stroke();
  realtimeCtx.restore();
  return point;
}

function drawBalanceTrialHud(width, height, ratio) {
  if (state.realtime.preflight.active) return;
  const trial = state.realtime.balanceTrial;
  if (!['step', 'still', 'transition', 'armed', 'done'].includes(trial.phase)) return;
  const title = trial.phase === 'step'
    ? 'STEP ON'
    : trial.phase === 'transition'
      ? 'CLOSE EYES'
    : trial.phase === 'still' || trial.phase === 'armed'
      ? 'STAND STILL'
      : 'DONE';
  const detail = trial.phase === 'done'
    ? 'Measurement complete · review and add to Session'
    : trial.message;
  realtimeCtx.save();
  realtimeCtx.fillStyle = trial.phase === 'done' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.46)';
  realtimeCtx.fillRect(0, 0, width * ratio, height * ratio);
  realtimeCtx.textAlign = 'center';
  realtimeCtx.textBaseline = 'middle';
  realtimeCtx.fillStyle = trial.phase === 'done' ? '#8fdb00' : '#ff9309';
  realtimeCtx.font = `700 ${Math.min(72, Math.max(38, width / 14)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillText(title, width * 0.5 * ratio, height * 0.43 * ratio);
  realtimeCtx.fillStyle = 'rgba(255,246,228,0.84)';
  realtimeCtx.font = `600 ${Math.min(22, Math.max(14, width / 55)) * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.fillText(detail || '', width * 0.5 * ratio, height * 0.56 * ratio);
  realtimeCtx.restore();
}

function drawEyesClosedBalanceRealtime(width, height, ratio) {
  const now = realtimeDisplayNowMs();
  const single = balanceStanceMode() === 'single';
  const trial = state.realtime.balanceTrial;
  const leftRaw = latestBalanceSample(state.realtime.leftSamples, now);
  const rightRaw = latestBalanceSample(state.realtime.rightSamples, now);
  const leftSide = { samples: state.realtime.leftSamples, raw: leftRaw, label: 'LEFT LEG', color: '#8fdb00' };
  const rightSide = { samples: state.realtime.rightSamples, raw: rightRaw, label: 'RIGHT LEG', color: '#f02a14' };
  const liveActive = (rightRaw?.value || 0) > (leftRaw?.value || 0) ? rightSide : leftSide;
  const active = single && trial.activeSide === 'right'
    ? rightSide
    : single && trial.activeSide === 'left'
      ? leftSide
      : liveActive;
  const sides = [leftSide, rightSide];
  const layout = balancePlateRects(width, height);
  const rects = layout.rects;

  realtimeCtx.fillStyle = 'rgba(255,246,228,0.92)';
  realtimeCtx.font = `600 ${20 * ratio}px Trebuchet MS, Arial, sans-serif`;
  realtimeCtx.textAlign = 'left';
  realtimeCtx.fillText('STATIC BALANCE', 24 * ratio, 24 * ratio);
  realtimeCtx.fillStyle = 'rgba(255,147,9,0.86)';
  realtimeCtx.font = `${13 * ratio}px Trebuchet MS, Arial, sans-serif`;
  const timeLabel = trial.phase === 'measuring'
    ? `${trial.remainingSec}s remaining`
    : trial.phase === 'done'
      ? `${(trial.durationMs / 1000).toFixed(0)}s complete`
      : `${(trial.durationMs / 1000).toFixed(0)}s test`;
  realtimeCtx.fillText(`${balanceVisionLabel(trial.currentVision).toUpperCase()} · ${single ? `SINGLE LEG · AUTO ${active.label}` : 'BOTH LEGS · GLOBAL COP'} · ${timeLabel}`,
    24 * ratio, 50 * ratio);

  const markers = sides.map((side, index) => drawBalancePlate(
    rects[index],
    side,
    now,
    ratio,
    single && side === active,
    single ? side === active : true,
  )).filter(Boolean);
  if (single) drawRealtimeSecondLegTapRipples(layout, trial, now, ratio);
  const globalMarker = single ? null : drawBalanceGlobalTrace(layout, now, ratio);

  const hasSamples = sides.some((side) => side.samples.length);
  const hasCorners = sides.some((side) => side.raw?.hasCorners);
  const message = !hasSamples ? 'WAITING FOR STREAM'
    : !hasCorners ? 'CORNER DATA UNAVAILABLE — UPDATE FORCEPLATE FIRMWARE'
      : single && !markers.length ? 'STEP ON ONE PLATE'
        : !single && !globalMarker ? 'LOAD BOTH PLATES TO START GLOBAL COP' : '';
  if (message) {
    realtimeCtx.fillStyle = 'rgba(255,246,228,0.68)';
    realtimeCtx.font = `600 ${16 * ratio}px Trebuchet MS, Arial, sans-serif`;
    realtimeCtx.textAlign = 'center';
    realtimeCtx.fillText(message, (width / 2) * ratio, (height - 18) * ratio);
  }
  drawBalanceTrialHud(width, height, ratio);
  drawRealtimeWarmupOverlay(width, height, ratio);
  updateRealtimeScrubControl();
}

function drawRealtime() {
  resizeRealtimeCanvas();
  const ratio = window.devicePixelRatio || 1;
  const width = realtimeChart.clientWidth || 1;
  const height = realtimeChart.clientHeight || 1;
  const style = state.chartStyle || DefaultChartStyle;
  realtimeCtx.clearRect(0, 0, realtimeChart.width, realtimeChart.height);
  realtimeCtx.fillStyle = style.chartBg;
  realtimeCtx.fillRect(0, 0, width * ratio, height * ratio);
  realtimeCtx.strokeStyle = style.chartOutline;
  realtimeCtx.strokeRect(0.5 * ratio, 0.5 * ratio, (width - 1) * ratio, (height - 1) * ratio);

  if (isEyesClosedBalance()) {
    drawEyesClosedBalanceRealtime(width, height, ratio);
    return;
  }
  if (isScaleDiscipline()) {
    drawScaleRealtime(width, height, ratio);
    return;
  }

  updateRealtimeAutoY();

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
  drawSampleRateLabel(
    realtimeCtx,
    width,
    height,
    ratio,
    state.realtime.samples.length ? state.realtime.samples : state.realtime.leftSamples,
    'tMs',
  );
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
    tlCounts: numberOrNaN(parts[6]),
    trCounts: numberOrNaN(parts[7]),
    blCounts: numberOrNaN(parts[8]),
    brCounts: numberOrNaN(parts[9]),
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
  const load = updateBalanceLoadState(localSample.side, localSample.absN);
  const rawCop = load.loaded ? balanceCopFromSample(localSample) : null;
  const cop = balanceDisplayCop(rawCop, localSample.absN);
  const sideSample = {
    tMs,
    value: localSample.absN,
    copX: cop?.x ?? NaN,
    copY: cop?.y ?? NaN,
    rawCopX: rawCop?.x ?? NaN,
    rawCopY: rawCop?.y ?? NaN,
    cornerSum: rawCop?.sum ?? NaN,
    copValid: Boolean(rawCop && cop && load.loaded),
    segmentId: load.segmentId,
    rawTlCounts: localSample.rawTlCounts,
    rawTrCounts: localSample.rawTrCounts,
    rawBlCounts: localSample.rawBlCounts,
    rawBrCounts: localSample.rawBrCounts,
    hasCorners: [localSample.tlCounts, localSample.trCounts, localSample.blCounts, localSample.brCounts].every(finite),
  };
  if (localSample.side === 0) {
    state.realtime.liveLatestLeft = localSample.absN;
    state.realtime.balanceLatestLeft = sideSample;
    state.realtime.leftSamples.push(sideSample);
  } else if (localSample.side === 1) {
    state.realtime.liveLatestRight = localSample.absN;
    state.realtime.balanceLatestRight = sideSample;
    state.realtime.rightSamples.push(sideSample);
  }
  if (finite(state.realtime.liveLatestLeft) || finite(state.realtime.liveLatestRight)) {
    // Single ForcePlate is a valid RT configuration. A missing board
    // contributes zero instead of preventing the canonical total trace from
    // being created at all.
    const leftValue = finite(state.realtime.liveLatestLeft) ? state.realtime.liveLatestLeft : 0;
    const rightValue = finite(state.realtime.liveLatestRight) ? state.realtime.liveLatestRight : 0;
    const totalSample = {
      tMs,
      left: leftValue,
      right: rightValue,
      total: leftValue + rightValue,
    };
    state.realtime.samples.push(totalSample);
    state.realtime.totalPeak = Math.max(state.realtime.totalPeak, totalSample.total);
    if (!isScaleDiscipline()) scanRealtimeDetector(totalSample);
    if (isEyesClosedBalance()) appendBalanceGlobalSample(tMs);
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
  state.realtime.balanceGlobalSamples = state.realtime.balanceGlobalSamples.filter((sample) => now - sample.tMs <= keepMs);
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
  url.searchParams.set('max', '24');
  return url.toString();
}

function localBatchStartUrl(baseValue, sync = false, filter = null) {
  const url = new URL(localBoardUrl(baseValue, '/local_batch_start'));
  if (sync) url.searchParams.set('sync', '1');
  const balanceRun = state.realtime.runConfig?.discipline === 'eyes_closed_balance';
  url.searchParams.set('sampleMs', String(balanceRun ? 2 : realtimeSampleIntervalMs()));
  if (filter) {
    url.searchParams.set('filter', filter.enabled ? '1' : '0');
    if (filter.enabled) url.searchParams.set('cutoffHz', String(filter.cutoffHz));
  }
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
  const keepScaleResult = isScaleDiscipline() && state.realtime.preflight.phase === 'done';
  const keepBalanceResult = isEyesClosedBalance() && state.realtime.balanceTrial.phase === 'done';
  const hadScaleOled = Boolean(
    state.realtime.oledScaleKey && !state.realtime.oledScaleKey.startsWith('off:'),
  );
  stopRealtimeRenderLoop();
  const aborts = Array.isArray(state.realtime.liveAbort)
    ? state.realtime.liveAbort
    : [state.realtime.liveAbort].filter(Boolean);
  aborts.forEach((abort) => abort.abort());
  state.realtime.liveAbort = [];
  state.realtime.live = false;
  state.realtime.runToken = null;
  state.realtime.preflight.active = false;
  await sendRealtimeStopUrls();
  if (!keepScaleResult && hadScaleOled) {
    await setOledScaleUi('off', { force: true });
  }
  if (!keepBalanceResult && state.realtime.oledBalanceKey &&
      !state.realtime.oledBalanceKey.startsWith('off:')) {
    await setOledBalanceUi('off', { force: true });
  }
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
  if (version !== 1 && version !== 2 && version !== 3) throw new Error(`batch v${version}`);
  const side = view.getUint8(5);
  const sampleSize = view.getUint16(6, true);
  const sampleCount = view.getUint16(8, true);
  const firstSeq = view.getUint32(20, true);
  const samples = [];
  let offset = 24;
  for (let i = 0; i < sampleCount; i++) {
    if (offset + sampleSize > view.byteLength) break;
    const hasCorners = version >= 2 && sampleSize >= 32;
    const hasUnfilteredCorners = version >= 3 && sampleSize >= 48;
    samples.push({
      side,
      streamSeq: view.getUint32(offset, true),
      boardTMs: view.getUint32(offset + 4, true),
      seq: view.getUint32(offset + 8, true),
      absN: view.getInt16(offset + 12, true),
      frameHz: view.getUint16(offset + 14, true),
      tlCounts: hasCorners ? view.getInt32(offset + 16, true) : NaN,
      trCounts: hasCorners ? view.getInt32(offset + 20, true) : NaN,
      blCounts: hasCorners ? view.getInt32(offset + 24, true) : NaN,
      brCounts: hasCorners ? view.getInt32(offset + 28, true) : NaN,
      rawTlCounts: hasUnfilteredCorners ? view.getInt32(offset + 32, true) : NaN,
      rawTrCounts: hasUnfilteredCorners ? view.getInt32(offset + 36, true) : NaN,
      rawBlCounts: hasUnfilteredCorners ? view.getInt32(offset + 40, true) : NaN,
      rawBrCounts: hasUnfilteredCorners ? view.getInt32(offset + 44, true) : NaN,
    });
    offset += sampleSize;
  }
  return { firstSeq, samples };
}

async function startRealtimeBoard(baseValue, sync = false, filter = null) {
  const startUrl = localBatchStartUrl(baseValue, sync, filter);
  const stopUrl = localBatchStopUrl(baseValue, sync);
  const response = await fetch(startUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${startUrl}: HTTP ${response.status}`);
  state.realtime.stopUrls.push(stopUrl);
}

function realtimeRunSnapshot() {
  const discipline = controls.realtimeDiscipline?.value || 'countermovement_jump';
  return {
    discipline,
    legMode: controls.realtimeBalanceLegMode?.value === 'single' ? 'single' : 'both',
    durationSec: discipline === 'eyes_closed_balance'
      ? clamp(Number(controls.realtimeBalanceTimeSec?.value) || 30, 5, 180)
      : 0,
    visionMode: discipline === 'eyes_closed_balance'
      ? normalizeBalanceVisionMode(controls.realtimeBalanceVisionMode?.value)
      : 'closed',
    athleteId: Number(controls.realtimeAthlete?.value) || 0,
    category: controls.realtimeCategory?.value || '',
    bodyMassKg: 0,
  };
}

function commitRealtimeRunSnapshot(snapshot) {
  state.session.currentAthleteId = snapshot.athleteId;
  state.session.session.category = snapshot.category;
  state.session.session.disciplineDefinition = {
    discipline: snapshot.discipline,
    disciplineLabel: window.JBForcePlateModels.disciplineDefinition(snapshot.discipline).label,
    settings: {
      ...sessionDisciplineSettings(snapshot.discipline),
      ...(snapshot.discipline === 'eyes_closed_balance'
        ? { legMode: snapshot.legMode, durationSec: snapshot.durationSec, visionMode: snapshot.visionMode }
        : {}),
    },
  };
  state.session.session.updatedAt = Date.now();
  if (snapshot.discipline !== 'scale') state.discipline = snapshot.discipline;
  state.realtime.runConfig = snapshot;
  window.JBForcePlateSessionStore.writeStoredState(state.session);
}

function runtimeFilterForDiscipline(discipline) {
  return discipline === 'scale'
    ? { enabled: true, cutoffHz: 1 }
    : discipline === 'eyes_closed_balance'
    ? { enabled: true, cutoffHz: 35 }
    : { enabled: false, cutoffHz: 1 };
}

async function applyRuntimeFilterToBoards(filter) {
  const endpoints = [controls.endpoint.value, controls.slaveEndpoint.value];
  const settled = await Promise.allSettled(endpoints.map(async (baseValue) => {
    const url = new URL(localBoardUrl(baseValue, '/api/settings/filter'));
    url.searchParams.set('persist', '0');
    url.searchParams.set('enabled', filter.enabled ? '1' : '0');
    if (filter.enabled) url.searchParams.set('cutoffHz', String(filter.cutoffHz));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }));
  if (!settled.some((result) => result.status === 'fulfilled')) {
    throw new Error('No ForcePlate accepted the runtime filter');
  }
}

async function setOledScaleUi(phase, { kg = 0, remaining = 0, force = false } = {}) {
  const key = `${phase}:${Number(kg).toFixed(2)}:${Number(remaining) || 0}`;
  if (!force && state.realtime.oledScaleKey === key) return;
  state.realtime.oledScaleKey = key;
  const endpoints = [controls.endpoint.value, controls.slaveEndpoint.value];
  await Promise.allSettled(endpoints.map(async (baseValue) => {
    const url = new URL(localBoardUrl(baseValue, '/api/ui/scale'));
    url.searchParams.set('phase', phase);
    if (phase === 'done') url.searchParams.set('kg', Number(kg).toFixed(2));
    if (phase === 'measure') url.searchParams.set('remaining', String(Number(remaining) || 0));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }));
}

async function setOledBalanceUi(phase, { durationMs = 0, visionMode = 'closed', force = false } = {}) {
  const vision = normalizeBalanceVisionMode(visionMode) === 'open' ? 'open' : 'closed';
  const key = `${phase}:${Math.round(Number(durationMs) || 0)}:${vision}`;
  if (!force && state.realtime.oledBalanceKey === key) return null;
  state.realtime.oledBalanceKey = key;

  if (phase === 'start') {
    const url = new URL(localBoardUrl(controls.endpoint.value, '/api/ui/balance'));
    url.searchParams.set('phase', 'start');
    url.searchParams.set('durationMs', String(Math.round(Number(durationMs) || 30000)));
    url.searchParams.set('delay', '250');
    url.searchParams.set('vision', vision);
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Balance timing: HTTP ${response.status}`);
    return payload;
  }

  const endpoints = [controls.endpoint.value, controls.slaveEndpoint.value];
  await Promise.allSettled(endpoints.map(async (baseValue) => {
    const url = new URL(localBoardUrl(baseValue, '/api/ui/balance'));
    url.searchParams.set('phase', phase);
    url.searchParams.set('vision', vision);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }));
  return null;
}

function resetBalanceTrial() {
  state.realtime.balanceTrial = {
    phase: 'idle',
    durationMs: 30000,
    startTMs: NaN,
    endTMs: NaN,
    remainingSec: 0,
    activeSide: '',
    visionMode: 'closed',
    currentVision: 'closed',
    runs: [],
    metrics: null,
    rawTrace: null,
    added: false,
    message: '',
  };
  state.realtime.oledBalanceKey = '';
}

function prepareRealtimeRecording({ warmupMs = realtimeWarmupMs() } = {}) {
  state.realtime.samples = [];
  state.realtime.leftSamples = [];
  state.realtime.rightSamples = [];
  state.realtime.balanceGlobalSamples = [];
  state.realtime.balanceLoad = [
    { loaded: false, belowCount: 0, segmentId: 0 },
    { loaded: false, belowCount: 0, segmentId: 0 },
  ];
  state.realtime.balanceGlobalSegmentId = 0;
  state.realtime.balanceGlobalValid = false;
  state.realtime.liveLatestLeft = NaN;
  state.realtime.liveLatestRight = NaN;
  state.realtime.balanceLatestLeft = null;
  state.realtime.balanceLatestRight = null;
  state.realtime.recordStartBoardMs = NaN;
  state.realtime.liveStartMs = performance.now();
  state.realtime.warmupUntilMs = state.realtime.liveStartMs + Math.max(0, Number(warmupMs) || 0);
  state.realtime.preflight.active = false;
  state.realtime.preflight.message = '';
  state.realtime.preflight.currentKg = 0;
  state.realtime.preflight.stdKg = 0;
  state.realtime.preflight.phase = 'recording';
  state.realtime.preflight.remainingSec = 0;
  resetBalanceTrial();
  resetRealtimeDetector(false);
  resetRealtimeDebug();
  drawRealtime();
}

async function waitForStableBodyMass(abort) {
  let stableChecks = 0;
  while (state.realtime.live && !abort.signal.aborted) {
    const samples = state.realtime.samples;
    const latestT = samples.at(-1)?.tMs ?? 0;
    const windowSamples = samples.filter((sample) =>
      latestT - sample.tMs <= 3000 && sample.total >= 10 * GravityMs2 && sample.total <= 300 * GravityMs2);
    const values = windowSamples.map((sample) => sample.total / GravityMs2);
    const durationMs = windowSamples.length > 1
      ? windowSamples.at(-1).tMs - windowSamples[0].tMs
      : 0;
    if (values.length >= 80 && durationMs >= 2200) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const range = Math.max(...values) - Math.min(...values);
      state.realtime.preflight.currentKg = mean;
      state.realtime.preflight.stdKg = std;
      state.realtime.preflight.phase = 'still';
      setOledScaleUi('still').catch(() => {});
      state.realtime.preflight.message = `${mean.toFixed(2)} kg · stability σ ${std.toFixed(2)} kg`;
      if (std <= 0.12 && range <= 0.50) stableChecks++;
      else stableChecks = 0;
      if (stableChecks >= 4) return mean;
    } else {
      stableChecks = 0;
      state.realtime.preflight.phase = values.length ? 'still' : 'step';
      state.realtime.preflight.currentKg = values.at(-1) || 0;
      setOledScaleUi(values.length ? 'still' : 'step').catch(() => {});
      state.realtime.preflight.message = values.length
        ? 'Hold still while the 1 Hz scale filter settles...'
        : 'Waiting for stable weight...';
    }
    drawRealtime();
    await abortableDelay(200, abort);
  }
  return 0;
}

async function runScaleMeasurement(abort) {
  while (state.realtime.live && !abort.signal.aborted) {
    state.realtime.preflight.active = true;
    state.realtime.preflight.measuredKg = 0;
    state.realtime.preflight.phase = 'step';
    state.realtime.preflight.message = 'Step on the ForcePlate(s) and stand still';
    await setOledScaleUi('step');
    const lockedKg = await waitForStableBodyMass(abort);
    if (!lockedKg || !state.realtime.live || abort.signal.aborted) return 0;

    const startT = state.realtime.samples.at(-1)?.tMs ?? 0;
    let lastRemaining = -1;
    let restart = false;
    state.realtime.preflight.phase = 'measuring';

    while (state.realtime.live && !abort.signal.aborted) {
      const samples = state.realtime.samples;
      const latestT = samples.at(-1)?.tMs ?? startT;
      const elapsed = Math.max(0, latestT - startT);
      const measurementSamples = samples.filter((sample) =>
        sample.tMs >= startT && sample.total >= 10 * GravityMs2 && sample.total <= 300 * GravityMs2);
      const measurementValues = measurementSamples.map((sample) => sample.total / GravityMs2);
      const recentValues = measurementSamples
        .filter((sample) => latestT - sample.tMs <= 1000)
        .map((sample) => sample.total / GravityMs2);

      if (!recentValues.length) {
        restart = true;
      } else {
        const mean = recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length;
        const variance = recentValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / recentValues.length;
        const std = Math.sqrt(variance);
        const range = Math.max(...recentValues) - Math.min(...recentValues);
        state.realtime.preflight.currentKg = mean;
        state.realtime.preflight.stdKg = std;
        restart = Math.abs(mean - lockedKg) > 0.35 || std > 0.12 || range > 0.50;
      }

      if (restart) {
        state.realtime.preflight.phase = 'still';
        state.realtime.preflight.remainingSec = 0;
        state.realtime.preflight.message = 'Movement detected · restarting stability check';
        await setOledScaleUi('still');
        drawRealtime();
        await abortableDelay(250, abort);
        break;
      }

      const remaining = Math.max(0, Math.ceil((5000 - elapsed) / 1000));
      state.realtime.preflight.remainingSec = remaining;
      state.realtime.preflight.message = `Stable measurement · ${remaining}s remaining`;
      if (remaining !== lastRemaining) {
        lastRemaining = remaining;
        await setOledScaleUi('measure', { remaining });
      }
      drawRealtime();

      if (elapsed >= 5000 && measurementValues.length) {
        return measurementValues.reduce((sum, value) => sum + value, 0) / measurementValues.length;
      }
      await abortableDelay(100, abort);
    }
  }
  return 0;
}

async function loadBalanceThresholds() {
  const endpoints = [controls.endpoint.value, controls.slaveEndpoint.value];
  const settled = await Promise.allSettled(endpoints.map(async (baseValue) => {
    const response = await fetch(localBoardUrl(baseValue, '/api/settings/debug'), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }));
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const threshold = Number(result.value?.filter?.copThresholdN);
    state.realtime.balanceThresholdN[index] = Number.isFinite(threshold)
      ? Math.max(10, threshold)
      : 20;
  });
}

function latestBalanceBoardTimeMs() {
  return Math.max(
    state.realtime.leftSamples.at(-1)?.tMs ?? 0,
    state.realtime.rightSamples.at(-1)?.tMs ?? 0,
    state.realtime.samples.at(-1)?.tMs ?? 0,
  );
}

async function waitForBalanceReady(abort, snapshot, {
  transition = false,
  visionMode = snapshot.visionMode,
  expectedActiveSide = '',
} = {}) {
  const trial = state.realtime.balanceTrial;
  let stableChecks = 0;
  let oledPhase = '';
  while (state.realtime.live && !abort.signal.aborted) {
    const now = latestBalanceBoardTimeMs();
    const left = latestBalanceSample(state.realtime.leftSamples, now);
    const right = latestBalanceSample(state.realtime.rightSamples, now);
    const single = snapshot.legMode === 'single';
    const active = (right?.value || 0) > (left?.value || 0) ? right : left;
    const activeSide = active === right ? 'right' : 'left';
    const inactive = activeSide === 'right' ? left : right;
    const inactiveSideIndex = activeSide === 'right' ? 0 : 1;
    const secondLegThresholdN = Math.max(20, Number(state.realtime.balanceThresholdN[inactiveSideIndex]) || 20);
    const totalN = Math.max(0, left?.value || 0) + Math.max(0, right?.value || 0);
    const singleLoaded = Boolean(
      active?.copValid &&
      (active.value || 0) >= 10 * GravityMs2 &&
      Math.max(0, inactive?.value || 0) < secondLegThresholdN
    );
    const bothLoaded = Boolean(left?.copValid && right?.copValid &&
      state.realtime.balanceLoad[0].loaded && state.realtime.balanceLoad[1].loaded &&
      totalN >= 10 * GravityMs2);
    const correctSingleSide = !single || !expectedActiveSide || activeSide === expectedActiveSide;
    const loaded = (single ? singleLoaded : bothLoaded) && correctSingleSide;

    if (!loaded) {
      stableChecks = 0;
      trial.phase = 'step';
      trial.activeSide = '';
      trial.message = single
        ? Math.max(0, inactive?.value || 0) >= secondLegThresholdN
          ? 'Lift the second leg'
          : expectedActiveSide
          ? `Stay on the ${expectedActiveSide} ForcePlate`
          : 'Step on one ForcePlate'
        : 'Step on both ForcePlates';
      if (oledPhase !== 'step') {
        oledPhase = 'step';
        setOledBalanceUi('step', { visionMode }).catch(() => {});
      }
    } else {
      trial.phase = 'still';
      trial.activeSide = single ? activeSide : 'both';
      const source = single
        ? (activeSide === 'right' ? state.realtime.rightSamples : state.realtime.leftSamples)
        : state.realtime.samples;
      const recent = source.filter((sample) => now - sample.tMs <= 1400)
        .map((sample) => single ? Math.max(0, sample.value || 0) : Math.max(0, sample.total || 0))
        .filter((value) => value >= 10 * GravityMs2);
      const durationMs = source.length > 1
        ? Math.max(0, now - source.find((sample) => now - sample.tMs <= 1400)?.tMs)
        : 0;
      const meanN = recent.length
        ? recent.reduce((sum, value) => sum + value, 0) / recent.length
        : 0;
      const varianceN = recent.length
        ? recent.reduce((sum, value) => sum + (value - meanN) ** 2, 0) / recent.length
        : Infinity;
      const stdKg = Math.sqrt(varianceN) / GravityMs2;
      const rangeKg = recent.length
        ? (Math.max(...recent) - Math.min(...recent)) / GravityMs2
        : Infinity;
      const stable = recent.length >= 80 && durationMs >= 1100 && stdKg <= 0.35 && rangeKg <= 1.20;
      stableChecks = stable ? stableChecks + 1 : 0;
      trial.message = stable
        ? transition ? 'Eyes closed · stable start detected' : 'Stable start detected'
        : transition
          ? `Close eyes · stand still · σ ${Number.isFinite(stdKg) ? stdKg.toFixed(2) : '--'} kg`
          : `Stand still · stability σ ${Number.isFinite(stdKg) ? stdKg.toFixed(2) : '--'} kg`;
      if (oledPhase !== 'still') {
        oledPhase = 'still';
        setOledBalanceUi('still', { visionMode }).catch(() => {});
      }
      if (stableChecks >= 3) return { activeSide: single ? activeSide : 'both' };
    }
    drawRealtime();
    await abortableDelay(100, abort);
  }
  return null;
}

function resampleBalanceSide(samples, startTMs, endTMs, intervalMs) {
  const source = samples.filter((sample) =>
    sample.tMs >= startTMs - 24 && sample.tMs <= endTMs + 24);
  const output = [];
  let index = 0;
  for (let tMs = startTMs; tMs <= endTMs + intervalMs / 2; tMs += intervalMs) {
    while (index + 1 < source.length && source[index + 1].tMs <= tMs) index++;
    const before = source[index];
    const after = source[index + 1];
    let sample = null;
    if (before && Math.abs(before.tMs - tMs) <= intervalMs / 2) {
      sample = before;
    } else if (before && after && before.tMs <= tMs && after.tMs >= tMs &&
               tMs - before.tMs <= 20 && after.tMs - tMs <= 20) {
      const span = Math.max(1, after.tMs - before.tMs);
      const mix = (tMs - before.tMs) / span;
      const interpolate = (key) => finite(before[key]) && finite(after[key])
        ? before[key] + (after[key] - before[key]) * mix
        : NaN;
      sample = {
        value: interpolate('value'),
        rawCopX: interpolate('rawCopX'),
        rawCopY: interpolate('rawCopY'),
        copValid: before.copValid && after.copValid,
      };
    }
    output.push(sample);
  }
  return output;
}

function buildBalanceRawTrace(trial) {
  const intervalMs = 2;
  const startTMs = Math.ceil(trial.startTMs / intervalMs) * intervalMs;
  const endTMs = startTMs + trial.durationMs;
  const left = resampleBalanceSide(state.realtime.leftSamples, startTMs, endTMs, intervalMs);
  const right = resampleBalanceSide(state.realtime.rightSamples, startTMs, endTMs, intervalMs);
  const single = state.realtime.runConfig?.legMode === 'single';
  const rows = [];
  for (let index = 0; index < left.length; index++) {
    const leftSample = left[index];
    const rightSample = right[index];
    const leftN = finite(leftSample?.value) ? Math.max(0, leftSample.value) : 0;
    const rightN = finite(rightSample?.value) ? Math.max(0, rightSample.value) : 0;
    const leftCopValid = Boolean(leftSample?.copValid && finite(leftSample.rawCopX) && finite(leftSample.rawCopY));
    const rightCopValid = Boolean(rightSample?.copValid && finite(rightSample.rawCopX) && finite(rightSample.rawCopY));
    const leftX = leftCopValid ? leftSample.rawCopX * 140 : 0;
    const leftY = leftCopValid ? leftSample.rawCopY * 225 : 0;
    const rightX = rightCopValid ? rightSample.rawCopX * 140 : 0;
    const rightY = rightCopValid ? rightSample.rawCopY * 225 : 0;
    let copX = 0;
    let copY = 0;
    let copValid = false;
    if (single) {
      const activeSample = trial.activeSide === 'right' ? rightSample : leftSample;
      copValid = trial.activeSide === 'right' ? rightCopValid : leftCopValid;
      if (copValid) {
        copX = activeSample.rawCopX * 140;
        copY = activeSample.rawCopY * 225;
      }
    } else {
      const totalN = leftN + rightN;
      copValid = leftCopValid && rightCopValid && totalN > 0;
      if (copValid) {
        const leftGlobalX = -150 + leftX;
        const rightGlobalX = 150 + rightX;
        copX = (leftGlobalX * leftN + rightGlobalX * rightN) / totalN;
        copY = (leftY * leftN + rightY * rightN) / totalN;
      }
    }
    rows.push({
      t_ms: index * intervalMs,
      left_net_n: leftN,
      right_net_n: rightN,
      total_net_n: leftN + rightN,
      left_abs_n: leftN,
      right_abs_n: rightN,
      total_abs_n: leftN + rightN,
      cop_x_mm: copX,
      cop_y_mm: copY,
      left_cop_x_mm: leftX,
      left_cop_y_mm: leftY,
      right_cop_x_mm: rightX,
      right_cop_y_mm: rightY,
      cop_valid: copValid ? 1 : 0,
    });
  }
  return {
    schema: 'jb.forceplate.balance-trace.v1',
    source: 'realtime-balance',
    sampleIntervalMs: intervalMs,
    rowCount: rows.length,
    firstMs: 0,
    lastMs: rows.at(-1)?.t_ms ?? 0,
    columns: [...BalanceTraceBinaryColumns, 'cop_valid'],
    rows,
  };
}

function detectSecondLegTapEvents(rows, {
  forceKey,
  timeKey = 't_ms',
  thresholdN = 20,
  startMs = -Infinity,
  endMs = Infinity,
} = {}) {
  const enterThresholdN = Math.max(20, Number(thresholdN) || 20);
  const releaseThresholdN = enterThresholdN * 0.5;
  const minimumContactMs = 40;
  const minimumReleaseMs = 80;
  let contactStartMs = NaN;
  let releaseStartMs = NaN;
  let contactActive = false;
  const events = [];

  rows.forEach((row) => {
    const timeMs = Number(row[timeKey]);
    if (!finite(timeMs) || timeMs < startMs || timeMs > endMs) return;
    const forceN = Math.max(0, Number(row[forceKey]) || 0);
    if (!contactActive) {
      if (forceN >= enterThresholdN) {
        if (!finite(contactStartMs)) contactStartMs = timeMs;
        if (timeMs - contactStartMs >= minimumContactMs) {
          events.push(timeMs);
          contactActive = true;
          releaseStartMs = NaN;
        }
      } else {
        contactStartMs = NaN;
      }
      return;
    }

    if (forceN <= releaseThresholdN) {
      if (!finite(releaseStartMs)) releaseStartMs = timeMs;
      if (timeMs - releaseStartMs >= minimumReleaseMs) {
        contactActive = false;
        contactStartMs = NaN;
        releaseStartMs = NaN;
      }
    } else {
      releaseStartMs = NaN;
    }
  });
  return events;
}

function countSecondLegTaps(rawTrace, activeSide, thresholdN = 20) {
  if (!['left', 'right'].includes(activeSide)) return null;
  const forceKey = activeSide === 'left' ? 'right_abs_n' : 'left_abs_n';
  return detectSecondLegTapEvents(rawTrace.rows, { forceKey, thresholdN }).length;
}

function computeBalanceMetrics(rawTrace, durationMs, {
  legMode = 'both',
  activeSide = '',
  secondLegThresholdN = 20,
} = {}) {
  const valid = rawTrace.rows.filter((row) => row.cop_valid && finite(row.cop_x_mm) && finite(row.cop_y_mm));
  let totalExcursionMm = 0;
  for (let index = 1; index < valid.length; index++) {
    const previous = valid[index - 1];
    const current = valid[index];
    if (current.t_ms - previous.t_ms > rawTrace.sampleIntervalMs * 3) continue;
    totalExcursionMm += Math.hypot(
      current.cop_x_mm - previous.cop_x_mm,
      current.cop_y_mm - previous.cop_y_mm,
    );
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  valid.forEach((row) => {
    minX = Math.min(minX, row.cop_x_mm);
    maxX = Math.max(maxX, row.cop_x_mm);
    minY = Math.min(minY, row.cop_y_mm);
    maxY = Math.max(maxY, row.cop_y_mm);
  });
  const loadRows = rawTrace.rows.filter((row) => row.total_abs_n > 0);
  const meanLeftPct = loadRows.length
    ? loadRows.reduce((sum, row) => sum + (row.left_abs_n / row.total_abs_n) * 100, 0) / loadRows.length
    : 0;
  return {
    totalExcursionMm,
    meanVelocityMmS: durationMs > 0 ? totalExcursionMm / (durationMs / 1000) : 0,
    rangeMlMm: valid.length ? maxX - minX : 0,
    rangeApMm: valid.length ? maxY - minY : 0,
    meanLeftPct,
    meanRightPct: 100 - meanLeftPct,
    validSamples: valid.length,
    secondLegTapCount: legMode === 'single'
      ? countSecondLegTaps(rawTrace, activeSide, secondLegThresholdN)
      : null,
    secondLegTapThresholdN: legMode === 'single'
      ? Math.max(20, Number(secondLegThresholdN) || 20)
      : null,
  };
}

async function runBalanceMeasurementLegacy(abort, snapshot, runToken) {
  const trial = state.realtime.balanceTrial;
  trial.durationMs = Math.round(clamp(Number(snapshot.durationSec) || 30, 5, 180) * 1000);
  trial.phase = 'step';
  trial.message = 'Step on the ForcePlate(s)';
  const ready = await waitForBalanceReady(abort, snapshot);
  if (!ready || !state.realtime.live || state.realtime.runToken !== runToken) return;

  trial.activeSide = ready.activeSide;
  trial.phase = 'armed';
  trial.message = 'Keep still · waiting for start cue';
  drawRealtime();
  const timing = await setOledBalanceUi('start', { durationMs: trial.durationMs, force: true });
  const fallbackStart = latestBalanceBoardTimeMs() + 250;
  trial.startTMs = finite(Number(timing?.startTMs)) ? Number(timing.startTMs) : fallbackStart;
  trial.endTMs = trial.startTMs + trial.durationMs;

  while (state.realtime.live && !abort.signal.aborted && latestBalanceBoardTimeMs() < trial.startTMs) {
    drawRealtime();
    await abortableDelay(10, abort);
  }
  if (!state.realtime.live || abort.signal.aborted || state.realtime.runToken !== runToken) return;

  trial.phase = 'measuring';
  trial.remainingSec = Math.ceil(trial.durationMs / 1000);
  trial.message = 'Eyes closed · keep balancing';
  playPcCue('start');
  setStatus(`Balance started · ${snapshot.durationSec}s · 500 Hz`);
  while (state.realtime.live && !abort.signal.aborted) {
    const latestTMs = latestBalanceBoardTimeMs();
    trial.remainingSec = Math.max(0, Math.ceil((trial.endTMs - latestTMs) / 1000));
    if (latestTMs >= trial.endTMs) break;
    drawRealtime();
    await abortableDelay(30, abort);
  }
  if (!state.realtime.live || abort.signal.aborted || state.realtime.runToken !== runToken) return;

  trial.rawTrace = buildBalanceRawTrace(trial);
  trial.metrics = computeBalanceMetrics(trial.rawTrace, trial.durationMs);
  trial.phase = 'done';
  trial.remainingSec = 0;
  trial.message = 'Measurement complete';
  playPcCue('stop');
  drawRealtime();
  await stopRealtimeStream(`Balance complete · ${trial.metrics.totalExcursionMm.toFixed(1)} mm excursion`);
  renderRealtimeRunState();
  drawRealtime();
}

function safeMetricRatio(numerator, denominator) {
  return Number(denominator) > 0 ? Number(numerator) / Number(denominator) : 0;
}

function computeRombergMetrics(open, closed) {
  return {
    totalExcursionRatio: safeMetricRatio(closed.totalExcursionMm, open.totalExcursionMm),
    meanVelocityRatio: safeMetricRatio(closed.meanVelocityMmS, open.meanVelocityMmS),
    rangeMlRatio: safeMetricRatio(closed.rangeMlMm, open.rangeMlMm),
    rangeApRatio: safeMetricRatio(closed.rangeApMm, open.rangeApMm),
  };
}

function buildPairedBalanceRawTrace(openRun, closedRun) {
  const rowCount = Math.min(openRun.rawTrace.rows.length, closedRun.rawTrace.rows.length);
  const conditionColumns = [...BalanceTraceBinaryColumns, 'cop_valid'];
  const rows = [];
  for (let index = 0; index < rowCount; index++) {
    const openRow = openRun.rawTrace.rows[index];
    const closedRow = closedRun.rawTrace.rows[index];
    const row = {
      ...closedRow,
      t_ms: index * closedRun.rawTrace.sampleIntervalMs,
    };
    conditionColumns.forEach((column) => {
      row[`eo_${column}`] = openRow[column];
      row[`ec_${column}`] = closedRow[column];
    });
    rows.push(row);
  }
  return {
    ...closedRun.rawTrace,
    schema: 'jb.forceplate.static-balance-paired.v1',
    source: 'realtime-static-balance-paired',
    rowCount: rows.length,
    firstMs: 0,
    lastMs: rows.at(-1)?.t_ms ?? 0,
    columns: [
      ...conditionColumns,
      ...conditionColumns.map((column) => `eo_${column}`),
      ...conditionColumns.map((column) => `ec_${column}`),
    ],
    rows,
  };
}

async function runBalanceCondition(abort, snapshot, runToken, visionMode, readyOptions = {}) {
  const trial = state.realtime.balanceTrial;
  trial.currentVision = visionMode;
  const ready = await waitForBalanceReady(abort, snapshot, {
    ...readyOptions,
    visionMode,
  });
  if (!ready || !state.realtime.live || state.realtime.runToken !== runToken) return null;

  trial.activeSide = ready.activeSide;
  trial.phase = 'armed';
  trial.message = `${balanceVisionLabel(visionMode)} · keep still · waiting for start cue`;
  drawRealtime();
  const timing = await setOledBalanceUi('start', {
    durationMs: trial.durationMs,
    visionMode,
    force: true,
  });
  const fallbackStart = latestBalanceBoardTimeMs() + 250;
  trial.startTMs = finite(Number(timing?.startTMs)) ? Number(timing.startTMs) : fallbackStart;
  trial.endTMs = trial.startTMs + trial.durationMs;

  while (state.realtime.live && !abort.signal.aborted && latestBalanceBoardTimeMs() < trial.startTMs) {
    drawRealtime();
    await abortableDelay(10, abort);
  }
  if (!state.realtime.live || abort.signal.aborted || state.realtime.runToken !== runToken) return null;

  trial.phase = 'measuring';
  trial.remainingSec = Math.ceil(trial.durationMs / 1000);
  trial.message = `${balanceVisionLabel(visionMode)} · keep balancing`;
  playPcCue('start');
  setStatus(`Static Balance ${balanceVisionLabel(visionMode)} started · ${snapshot.durationSec}s · 500 Hz`);
  while (state.realtime.live && !abort.signal.aborted) {
    const latestTMs = latestBalanceBoardTimeMs();
    trial.remainingSec = Math.max(0, Math.ceil((trial.endTMs - latestTMs) / 1000));
    if (latestTMs >= trial.endTMs) break;
    drawRealtime();
    await abortableDelay(30, abort);
  }
  if (!state.realtime.live || abort.signal.aborted || state.realtime.runToken !== runToken) return null;

  const rawTrace = buildBalanceRawTrace(trial);
  const inactiveSideIndex = ready.activeSide === 'left' ? 1 : 0;
  const metrics = computeBalanceMetrics(rawTrace, trial.durationMs, {
    legMode: snapshot.legMode,
    activeSide: ready.activeSide,
    secondLegThresholdN: state.realtime.balanceThresholdN[inactiveSideIndex],
  });
  playPcCue('stop');
  return {
    visionMode,
    activeSide: ready.activeSide,
    durationMs: trial.durationMs,
    startTMs: trial.startTMs,
    endTMs: trial.endTMs,
    rawTrace,
    metrics,
  };
}

async function runBalanceMeasurement(abort, snapshot, runToken) {
  const trial = state.realtime.balanceTrial;
  trial.durationMs = Math.round(clamp(Number(snapshot.durationSec) || 30, 5, 180) * 1000);
  trial.visionMode = normalizeBalanceVisionMode(snapshot.visionMode);
  trial.currentVision = trial.visionMode === 'paired' ? 'open' : trial.visionMode;
  trial.runs = [];
  trial.phase = 'step';
  trial.message = 'Step on the ForcePlate(s)';

  const modes = trial.visionMode === 'paired' ? ['open', 'closed'] : [trial.visionMode];
  for (let index = 0; index < modes.length; index++) {
    const mode = modes[index];
    if (index > 0) {
      trial.phase = 'transition';
      trial.currentVision = mode;
      trial.message = 'Close eyes · stand still';
      setStatus('Eyes Open complete · close eyes and stand still');
      await setOledBalanceUi('still', { visionMode: mode, force: true });
      await abortableDelay(750, abort);
    }
    const run = await runBalanceCondition(abort, snapshot, runToken, mode, {
      transition: index > 0,
      expectedActiveSide: index > 0 ? trial.runs[0]?.activeSide : '',
    });
    if (!run) return;
    trial.runs.push(run);
  }

  trial.activeSide = trial.runs[0]?.activeSide || 'both';
  if (trial.visionMode === 'paired') {
    const [openRun, closedRun] = trial.runs;
    trial.rawTrace = buildPairedBalanceRawTrace(openRun, closedRun);
    trial.metrics = {
      open: openRun.metrics,
      closed: closedRun.metrics,
      romberg: computeRombergMetrics(openRun.metrics, closedRun.metrics),
    };
  } else {
    trial.rawTrace = trial.runs[0].rawTrace;
    trial.metrics = trial.runs[0].metrics;
  }
  trial.phase = 'done';
  trial.remainingSec = 0;
  trial.message = 'Measurement complete';
  drawRealtime();
  const statusMetric = trial.visionMode === 'paired'
    ? `Romberg velocity ${trial.metrics.romberg.meanVelocityRatio.toFixed(2)}x`
    : `${trial.metrics.totalExcursionMm.toFixed(1)} mm excursion`;
  await stopRealtimeStream(`Static Balance complete · ${statusMetric}`);
  renderRealtimeRunState();
  drawRealtime();
}

function balanceMetricsPayload(metrics) {
  const metricRows = [
    ['__section', 'COP'],
    ['Total Excursion', `${metrics.totalExcursionMm.toFixed(1)} mm`,
     'Mean COP Velocity', `${metrics.meanVelocityMmS.toFixed(1)} mm/s`],
    ['COP Range ML', `${metrics.rangeMlMm.toFixed(1)} mm`,
     'COP Range AP', `${metrics.rangeApMm.toFixed(1)} mm`],
    ['__section', 'Load'],
    ['Mean Left Load', `${metrics.meanLeftPct.toFixed(1)} %`,
     'Mean Right Load', `${metrics.meanRightPct.toFixed(1)} %`],
  ];
  if (metrics.secondLegTapCount != null) {
    metricRows.push(
      ['__section', 'Test Quality'],
      ['Second Leg Tap', String(metrics.secondLegTapCount)],
    );
  }
  return {
    source: 'ph-balance-v1',
    values: { ...metrics },
    metrics: metricRows,
  };
}

function pairedBalanceMetricsPayload(metrics) {
  const rq = metrics.romberg;
  const ratio = (value) => `${value.toFixed(2)} x`;
  const metricRows = [
    ['__section', 'Eyes Open'],
    ['Total Excursion', `${metrics.open.totalExcursionMm.toFixed(1)} mm`,
     'Mean COP Velocity', `${metrics.open.meanVelocityMmS.toFixed(1)} mm/s`],
    ['COP Range ML', `${metrics.open.rangeMlMm.toFixed(1)} mm`,
     'COP Range AP', `${metrics.open.rangeApMm.toFixed(1)} mm`],
  ];
  if (metrics.open.secondLegTapCount != null) {
    metricRows.push(['Second Leg Tap · EO', String(metrics.open.secondLegTapCount)]);
  }
  metricRows.push(
    ['__section', 'Eyes Closed'],
    ['Total Excursion', `${metrics.closed.totalExcursionMm.toFixed(1)} mm`,
     'Mean COP Velocity', `${metrics.closed.meanVelocityMmS.toFixed(1)} mm/s`],
    ['COP Range ML', `${metrics.closed.rangeMlMm.toFixed(1)} mm`,
     'COP Range AP', `${metrics.closed.rangeApMm.toFixed(1)} mm`],
  );
  if (metrics.closed.secondLegTapCount != null) {
    metricRows.push(['Second Leg Tap · EC', String(metrics.closed.secondLegTapCount)]);
  }
  metricRows.push(
    ['__section', 'Romberg Quotient · EC / EO'],
    ['Excursion RQ', ratio(rq.totalExcursionRatio),
     'Velocity RQ', ratio(rq.meanVelocityRatio)],
    ['ML Range RQ', ratio(rq.rangeMlRatio),
     'AP Range RQ', ratio(rq.rangeApRatio)],
  );
  return {
    source: 'ph-static-balance-paired-v1',
    values: {
      visionMode: 'paired',
      open: { ...metrics.open },
      closed: { ...metrics.closed },
      romberg: { ...rq },
    },
    metrics: metricRows,
  };
}

async function addBalanceResultToSession() {
  const trial = state.realtime.balanceTrial;
  if (trial.phase !== 'done' || !trial.rawTrace || !trial.metrics || trial.added) return false;
  if (!state.session.session.active) {
    setStatus('Start a Session before adding this Balance result');
    renderBalanceTrialControls();
    return false;
  }

  const session = state.session.session;
  const athlete = currentMeasurementAthlete();
  const attemptNumber = nextSessionAttemptNumber('eyes_closed_balance', athlete);
  const attemptCode = `BAL_${String(attemptNumber).padStart(2, '0')}`;
  const hashRows = trial.rawTrace.rows.map((row) => [
    row.t_ms,
    Math.round(row.cop_x_mm * 100) / 100,
    Math.round(row.cop_y_mm * 100) / 100,
    Math.round(row.total_abs_n * 10) / 10,
    row.cop_valid,
    finite(row.eo_cop_x_mm) ? Math.round(row.eo_cop_x_mm * 100) / 100 : null,
    finite(row.eo_cop_y_mm) ? Math.round(row.eo_cop_y_mm * 100) / 100 : null,
  ]);
  const traceHash = await sha256Text(JSON.stringify({
    discipline: 'eyes_closed_balance',
    legMode: state.realtime.runConfig?.legMode || 'both',
    visionMode: trial.visionMode,
    activeSide: trial.activeSide,
    rows: hashRows,
  }));
  if (state.session.results.some((result) => result.traceHash === traceHash)) {
    trial.added = true;
    renderBalanceTrialControls();
    setStatus('This Balance result is already in the current Session');
    return false;
  }

  const traceId = traceHash;
  const resultId = window.JBForcePlateModels.createId('balance-result');
  const result = window.JBForcePlateModels.createSessionResult({
    resultId,
    sessionId: session.sessionId,
    measuredAt: Date.now(),
    athlete,
    bodyMassSnapshot: currentAthleteMassSnapshot(),
    category: state.realtime.runConfig?.category || session.category,
    discipline: 'eyes_closed_balance',
    disciplineSettings: {
      source: trial.visionMode === 'paired' ? 'realtime-static-balance-paired' : 'realtime-static-balance',
      durationSec: trial.durationMs / 1000,
      sampleIntervalMs: trial.rawTrace.sampleIntervalMs,
      legMode: state.realtime.runConfig?.legMode || 'both',
      activeSide: trial.activeSide,
      visionMode: trial.visionMode,
      attemptNumber,
      attemptCode,
      attemptLabel: attemptCode,
    },
    rawTrace: {
      ...trial.rawTrace,
      traceId,
      traceHash,
      resultId,
      fileName: traceFileName(traceId),
    },
    traceHash,
    traceRef: {
      traceId,
      fileName: traceFileName(traceId),
      source: trial.rawTrace.source,
      rowCount: trial.rawTrace.rowCount,
      firstMs: trial.rawTrace.firstMs,
      lastMs: trial.rawTrace.lastMs,
      sampleIntervalMs: trial.rawTrace.sampleIntervalMs,
    },
    metrics: trial.visionMode === 'paired'
      ? pairedBalanceMetricsPayload(trial.metrics)
      : balanceMetricsPayload(trial.metrics),
    landmarks: {
      source: 'firmware-timed-static-balance',
      startMs: 0,
      endMs: trial.durationMs,
    },
  });
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
  trial.added = true;
  renderSessionControls();
  renderSessionLeaderboard();
  renderBalanceTrialControls();
  await updateCacheStatus();
  setStatus(`Balance added to Session: ${attemptCode}`);
  return true;
}

async function pollRealtimeBatchLoop(baseValue, abort, boardLabel) {
  let afterSeq = 0;
  let consecutiveErrors = 0;
  while (state.realtime.live && !abort.signal.aborted) {
    try {
      const response = await fetch(localBatchUrl(baseValue, afterSeq), {
        cache: 'no-store',
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const batch = decodeRealtimeBatch(await response.arrayBuffer());
      batch.samples.forEach((sample) => {
        appendLocalRealtimeSample(sample);
        afterSeq = sample.streamSeq;
      });
      consecutiveErrors = 0;
      trimRealtimeSamples();
      drawRealtimeFromReceiver();
      if (batch.samples.length < 24) {
        await abortableDelay(streamIntervalMs(), abort);
      }
    } catch (error) {
      if (abort.signal.aborted || error.name === 'AbortError') return;
      consecutiveErrors++;
      if (consecutiveErrors === 1) {
        setStatus(`${boardLabel} unavailable; continuing RT with the connected ForcePlate.`);
      }
      await abortableDelay(Math.min(1000, 100 * consecutiveErrors), abort);
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
  if (controls.realtimeDiscipline?.value === 'eyes_closed_balance') primeCueAudio();
  setRealtimePlaying(false);
  await stopRealtimeStream('');
  resetRealtimeSimulation();

  const snapshot = realtimeRunSnapshot();
  commitRealtimeRunSnapshot(snapshot);
  const massSnapshot = lockCurrentAthleteMassSnapshot();
  snapshot.bodyMassKg = Number(massSnapshot?.bodyMassKg) || 0;
  const scaleRun = snapshot.discipline === 'scale';
  const needsBodyMass = scaleRun || !snapshot.bodyMassKg;
  const requestedFilter = needsBodyMass
    ? { enabled: true, cutoffHz: 1 }
    : runtimeFilterForDiscipline(snapshot.discipline);

  const masterAbort = new AbortController();
  const slaveAbort = new AbortController();
  const runToken = Symbol('realtime-run');
  state.realtime.runToken = runToken;
  state.realtime.liveAbort = [masterAbort, slaveAbort];
  state.realtime.live = true;
  state.realtime.liveStartMs = performance.now();
  state.realtime.warmupUntilMs = 0;
  state.realtime.recordStartBoardMs = NaN;
  state.realtime.warmupLatestLeft = NaN;
  state.realtime.warmupLatestRight = NaN;
  state.realtime.preflight.active = needsBodyMass;
  state.realtime.preflight.message = needsBodyMass
    ? 'Waiting for stable weight...'
    : 'Configuring ForcePlate stream...';
  state.realtime.preflight.measuredKg = 0;
  state.realtime.preflight.currentKg = 0;
  state.realtime.preflight.stdKg = 0;
  state.realtime.preflight.phase = needsBodyMass ? 'step' : 'starting';
  state.realtime.preflight.remainingSec = 0;
  state.realtime.oledScaleKey = '';
  syncRealtimeRenderBufferControls();
  renderRealtimeRunState();
  startRealtimeRenderLoop();
  setStatus(needsBodyMass
    ? scaleRun
      ? 'Scale: step on the ForcePlate(s) and stand still'
      : 'Body mass unknown: step on the ForcePlate(s) and stand still'
    : `Batch realtime sync ${streamIntervalMs()} ms`);
  if (snapshot.discipline === 'eyes_closed_balance') {
    loadBalanceThresholds().catch(() => {});
  }

  try {
    await applyRuntimeFilterToBoards(requestedFilter);
    if (needsBodyMass) await setOledScaleUi('step', { force: true });
    await startRealtimeBoard(controls.endpoint.value, true, requestedFilter);
    state.realtime.stopUrls.push(localBatchStopUrl(controls.slaveEndpoint.value));
    Promise.all([
      pollRealtimeBatchLoop(controls.endpoint.value, masterAbort, 'Master / Left'),
      pollRealtimeBatchLoop(controls.slaveEndpoint.value, slaveAbort, 'Right / Slave'),
    ]).catch((error) => {
      if (error.name !== 'AbortError') setStatus(`Realtime error: ${error.message}`);
    }).finally(async () => {
      if (state.realtime.runToken !== runToken) return;
      stopRealtimeRenderLoop();
      state.realtime.live = false;
      state.realtime.liveAbort = [];
      state.realtime.runToken = null;
      await sendRealtimeStopUrls();
      renderRealtimeRunState();
      drawRealtime();
    });

    if (needsBodyMass) {
      const bodyMassKg = scaleRun
        ? await runScaleMeasurement(masterAbort)
        : await waitForStableBodyMass(masterAbort);
      if (!bodyMassKg || !state.realtime.live || state.realtime.runToken !== runToken) return;
      const measuredAt = Date.now();
      window.JBForcePlateSessionStore.setAthleteMassSnapshot(
        state.session,
        snapshot.athleteId,
        bodyMassKg,
        'forceplate',
        measuredAt,
      );
      snapshot.bodyMassKg = bodyMassKg;
      state.realtime.preflight.measuredKg = bodyMassKg;
      renderAthleteMassControls();
      if (scaleRun) {
        state.realtime.preflight.active = false;
        state.realtime.preflight.currentKg = bodyMassKg;
        state.realtime.preflight.phase = 'done';
        state.realtime.preflight.remainingSec = 0;
        state.realtime.preflight.message = `${bodyMassKg.toFixed(2)} kg average from 5 stable seconds`;
        await setOledScaleUi('done', { kg: bodyMassKg, force: true });
        renderSessionControls();
        drawRealtime();
        await stopRealtimeStream(`Scale complete: ${bodyMassKg.toFixed(2)} kg`);
        drawRealtime();
        return;
      }
      await setOledScaleUi('off', { force: true });
      await applyRuntimeFilterToBoards(runtimeFilterForDiscipline(snapshot.discipline));
      setStatus(`Body mass ${bodyMassKg.toFixed(2)} kg captured for this session`);
    }
    const balanceRun = snapshot.discipline === 'eyes_closed_balance';
    prepareRealtimeRecording({ warmupMs: balanceRun ? 0 : realtimeWarmupMs() });
    if (balanceRun) {
      await runBalanceMeasurement(masterAbort, snapshot, runToken);
    }
  } catch (error) {
    masterAbort.abort();
    slaveAbort.abort();
    await sendRealtimeStopUrls();
    await setOledScaleUi('off', { force: true });
    state.realtime.runToken = null;
    state.realtime.live = false;
    if (error.name !== 'AbortError') {
      setStatus(`Realtime error: ${error.message}`);
    }
    stopRealtimeRenderLoop();
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
  state.realtime.balanceGlobalSamples = [];
  state.realtime.balanceLoad = [
    { loaded: false, belowCount: 0, segmentId: 0 },
    { loaded: false, belowCount: 0, segmentId: 0 },
  ];
  state.realtime.balanceGlobalSegmentId = 0;
  state.realtime.balanceGlobalValid = false;
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
  state.realtime.balanceLatestLeft = null;
  state.realtime.balanceLatestRight = null;
  state.realtime.renderBuffer.cursorMs = 0;
  state.realtime.renderBuffer.lastFrameMs = 0;
  state.realtime.stopUrls = [];
  state.realtime.runConfig = null;
  state.realtime.preflight = {
    active: false,
    message: '',
    measuredKg: 0,
    currentKg: 0,
    stdKg: 0,
    phase: 'idle',
    remainingSec: 0,
  };
  state.realtime.oledScaleKey = '';
  resetBalanceTrial();
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
  if (isBalanceAnalyze()) {
    state.balanceAnalyze.view = { fitMode: 'all', zoom: 1, panX: 0, panY: 0 };
    draw();
    return;
  }
  state.view = autoView(state.rows);
  draw();
}

function fitHorizontalView() {
  if (isBalanceAnalyze()) {
    state.balanceAnalyze.view = { fitMode: 'horizontal', zoom: 1, panX: 0, panY: 0 };
    draw();
    return;
  }
  const next = autoView(state.rows);
  state.view = {
    ...(state.view ?? next),
    xMin: next.xMin,
    xMax: next.xMax,
  };
  draw();
}

function fitVerticalView() {
  if (isBalanceAnalyze()) {
    state.balanceAnalyze.view = { fitMode: 'vertical', zoom: 1, panX: 0, panY: 0 };
    draw();
    return;
  }
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

function balanceAnalyzeLayout(width, height) {
  const plateWidthMm = 280;
  const plateHeightMm = 450;
  const gapMm = 20;
  const header = 78;
  const footer = 68;
  const availableHeight = Math.max(120, height - header - footer);
  const view = state.balanceAnalyze.view;
  const horizontalScale = (width - 90) / (plateWidthMm * 2 + gapMm);
  const verticalScale = availableHeight / plateHeightMm;
  const fitScale = view.fitMode === 'horizontal'
    ? horizontalScale
    : view.fitMode === 'vertical'
      ? verticalScale
      : Math.min(horizontalScale, verticalScale);
  const scale = Math.max(0.05, fitScale * clamp(view.zoom, 0.2, 12));
  const plateWidth = plateWidthMm * scale;
  const plateHeight = plateHeightMm * scale;
  const gap = gapMm * scale;
  const groupLeft = (width - (plateWidth * 2 + gap)) / 2 + view.panX;
  const groupTop = header + (availableHeight - plateHeight) / 2 + view.panY;
  return {
    plateWidthMm,
    plateHeightMm,
    gapMm,
    scale,
    groupLeft,
    groupTop,
    groupWidth: plateWidth * 2 + gap,
    groupHeight: plateHeight,
    rects: [
      { x: groupLeft, y: groupTop, w: plateWidth, h: plateHeight },
      { x: groupLeft + plateWidth + gap, y: groupTop, w: plateWidth, h: plateHeight },
    ],
  };
}

function drawBalanceAnalyzePlate(rect, label, color, ratio) {
  ctx.save();
  ctx.fillStyle = 'rgba(21,22,20,0.82)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.4 * ratio;
  ctx.fillRect(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
  ctx.strokeRect(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
  ctx.strokeStyle = 'rgba(220,205,181,0.14)';
  ctx.beginPath();
  ctx.moveTo((rect.x + rect.w / 2) * ratio, rect.y * ratio);
  ctx.lineTo((rect.x + rect.w / 2) * ratio, (rect.y + rect.h) * ratio);
  ctx.moveTo(rect.x * ratio, (rect.y + rect.h / 2) * ratio);
  ctx.lineTo((rect.x + rect.w) * ratio, (rect.y + rect.h / 2) * ratio);
  ctx.stroke();
  const rightPlate = label.includes('RIGHT');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = `600 ${19 * ratio}px Trebuchet MS, Arial, sans-serif`;
  ctx.textAlign = rightPlate ? 'right' : 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    label,
    (rightPlate ? rect.x + rect.w - 12 : rect.x + 12) * ratio,
    (rect.y + 10) * ratio,
  );
  ctx.restore();
}

function balanceAnalyzePoint(row, layout, settings) {
  const single = settings.legMode === 'single';
  if (single) {
    const rect = settings.activeSide === 'right' ? layout.rects[1] : layout.rects[0];
    return {
      x: rect.x + rect.w / 2 + Number(row.cop_x_mm) * layout.scale,
      y: rect.y + rect.h / 2 - Number(row.cop_y_mm) * layout.scale,
    };
  }
  const totalWidthMm = layout.plateWidthMm * 2 + layout.gapMm;
  return {
    x: layout.groupLeft + (Number(row.cop_x_mm) + totalWidthMm / 2) * layout.scale,
    y: layout.groupTop + layout.groupHeight / 2 - Number(row.cop_y_mm) * layout.scale,
  };
}

function balanceTimelineGeometry() {
  const ratio = window.devicePixelRatio || 1;
  return {
    ratio,
    left: 42 * ratio,
    right: chart.width - 24 * ratio,
    bottom: chart.height - 38 * ratio,
    durationMs: balanceAnalyzeDurationMs(),
  };
}

function balanceTimelineX(tMs) {
  const timeline = balanceTimelineGeometry();
  return timeline.left + clamp(tMs, 0, timeline.durationMs) *
    (timeline.right - timeline.left) / Math.max(1, timeline.durationMs);
}

function balanceTimelineTimeAtPixel(x) {
  const timeline = balanceTimelineGeometry();
  return clamp((x - timeline.left) * timeline.durationMs /
    Math.max(1, timeline.right - timeline.left), 0, timeline.durationMs);
}

function balanceTimelineHandleRect() {
  const timeline = balanceTimelineGeometry();
  const width = 56 * timeline.ratio;
  const height = 24 * timeline.ratio;
  const x = balanceTimelineX(state.balanceAnalyze.cursorMs);
  return {
    x: x - width / 2,
    y: timeline.bottom + 8 * timeline.ratio,
    width,
    height,
    tipX: x,
    tipY: timeline.bottom,
  };
}

function isBalanceTimelineHit(pos) {
  const timeline = balanceTimelineGeometry();
  return pos.x >= timeline.left - 8 * timeline.ratio &&
    pos.x <= timeline.right + 8 * timeline.ratio &&
    pos.y >= timeline.bottom - 10 * timeline.ratio &&
    pos.y <= chart.height;
}

function balanceTimelineMinorStep(durationMs, widthPx, ratio) {
  const target = durationMs / Math.max(1, widthPx / (12 * ratio));
  return [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
    .find((step) => step >= target) || 10000;
}

function drawBalanceTimeline() {
  const timeline = balanceTimelineGeometry();
  if (timeline.durationMs <= 0) return;
  const style = state.chartStyle || DefaultChartStyle;
  const minorStep = balanceTimelineMinorStep(
    timeline.durationMs,
    timeline.right - timeline.left,
    timeline.ratio,
  );
  const majorStep = minorStep * 5;
  ctx.save();
  ctx.strokeStyle = hexToRgba(style.xAxisColor, style.xAxisOpacity);
  ctx.fillStyle = hexToRgba(style.xAxisText, 0.75);
  ctx.font = `${10 * timeline.ratio}px Arial`;
  ctx.setLineDash(dashForStyle(style.xAxisStyle, timeline.ratio));
  ctx.beginPath();
  ctx.moveTo(timeline.left, timeline.bottom);
  ctx.lineTo(timeline.right, timeline.bottom);
  ctx.stroke();
  for (let t = 0; t <= timeline.durationMs + minorStep * 0.25; t += minorStep) {
    const x = balanceTimelineX(Math.min(t, timeline.durationMs));
    const major = t % majorStep === 0;
    ctx.beginPath();
    ctx.moveTo(x, timeline.bottom);
    ctx.lineTo(x, timeline.bottom + (major ? 11 : 6) * timeline.ratio);
    ctx.stroke();
    if (major) ctx.fillText(`${Math.round(t)} ms`, x + 2 * timeline.ratio, timeline.bottom + 22 * timeline.ratio);
  }
  ctx.setLineDash([]);

  const handle = balanceTimelineHandleRect();
  const roof = 8 * timeline.ratio;
  const radius = 4 * timeline.ratio;
  ctx.fillStyle = hexToRgba(style.cursorButton, 0.94);
  ctx.strokeStyle = hexToRgba(style.cursorLine, 0.95);
  ctx.lineWidth = timeline.ratio;
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
  ctx.font = `${11 * timeline.ratio}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(state.balanceAnalyze.cursorMs)} ms`,
    handle.x + handle.width / 2, handle.y + handle.height / 2);
  ctx.restore();
}

function drawBalanceAnalyzeLegacy() {
  const ratio = window.devicePixelRatio || 1;
  const width = chart.clientWidth || 1;
  const height = chart.clientHeight || 1;
  const result = state.analyzeResult?.result || null;
  const settings = result?.disciplineSettings || result?.disciplineDefinition?.settings || {};
  const layout = balanceAnalyzeLayout(width, height);
  drawBalanceAnalyzePlate(layout.rects[0], 'LEFT', '#8fdb00', ratio);
  drawBalanceAnalyzePlate(layout.rects[1], 'RIGHT', '#f02a14', ratio);

  const validRows = state.rows.filter((row) =>
    (row.cop_valid == null || Number(row.cop_valid) > 0.5) &&
    finite(Number(row.cop_x_mm)) && finite(Number(row.cop_y_mm)));
  const playback = state.balanceAnalyze;
  const durationMs = balanceAnalyzeDurationMs();
  if (!finite(playback.cursorMs)) playback.cursorMs = durationMs;
  const motionMode = playback.engaged && durationMs > 0;
  const sourceRows = motionMode
    ? validRows.filter((row) => row.t_ms <= playback.cursorMs && row.t_ms >= playback.cursorMs - playback.trailMs)
    : validRows;
  const stride = Math.max(1, Math.ceil(sourceRows.length / (motionMode ? 900 : 1600)));
  const reduced = sourceRows.filter((row, index) => index % stride === 0 || index === sourceRows.length - 1);
  if (reduced.length) {
    ctx.save();
    ctx.lineWidth = 1.8 * ratio;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (motionMode) {
      for (let index = 1; index < reduced.length; index += 1) {
        const previousRow = reduced[index - 1];
        const row = reduced[index];
        if (row.t_ms - previousRow.t_ms > sampleIntervalMs(state.rows) * stride * 3) continue;
        const previous = balanceAnalyzePoint(previousRow, layout, settings);
        const point = balanceAnalyzePoint(row, layout, settings);
        const ageMs = Math.max(0, playback.cursorMs - row.t_ms);
        const fadeStartMs = Math.max(0, playback.trailMs - playback.fadeMs);
        const alpha = playback.fadeMs > 0 && ageMs > fadeStartMs
          ? clamp((playback.trailMs - ageMs) / playback.fadeMs, 0.04, 1)
          : 1;
        ctx.strokeStyle = `rgba(255,147,9,${(0.9 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(previous.x * ratio, previous.y * ratio);
        ctx.lineTo(point.x * ratio, point.y * ratio);
        ctx.stroke();
      }
      const current = balanceAnalyzePoint(reduced.at(-1), layout, settings);
      ctx.shadowColor = 'rgba(255,147,9,0.72)';
      ctx.shadowBlur = 12 * ratio;
      ctx.fillStyle = '#ff9309';
      ctx.strokeStyle = '#fff6e4';
      ctx.lineWidth = 2 * ratio;
      ctx.beginPath();
      ctx.arc(current.x * ratio, current.y * ratio, 7 * ratio, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,147,9,0.86)';
      ctx.beginPath();
      reduced.forEach((row, index) => {
        const point = balanceAnalyzePoint(row, layout, settings);
        const previous = reduced[index - 1];
        if (index === 0 || row.t_ms - previous.t_ms > sampleIntervalMs(state.rows) * stride * 3) {
          ctx.moveTo(point.x * ratio, point.y * ratio);
        } else {
          ctx.lineTo(point.x * ratio, point.y * ratio);
        }
      });
      ctx.stroke();

      const start = balanceAnalyzePoint(reduced[0], layout, settings);
      const end = balanceAnalyzePoint(reduced.at(-1), layout, settings);
      [[start, '#8fdb00', 5], [end, '#f02a14', 6]].forEach(([point, color, radius]) => {
        ctx.fillStyle = color;
        ctx.strokeStyle = '#fff6e4';
        ctx.lineWidth = 1.5 * ratio;
        ctx.beginPath();
        ctx.arc(point.x * ratio, point.y * ratio, radius * ratio, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  const descriptor = balanceResultDescriptor(result) || 'Balance';
  ctx.save();
  ctx.fillStyle = 'rgba(255,246,228,0.94)';
  ctx.font = `700 ${20 * ratio}px Trebuchet MS, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('STATIC BALANCE', 24 * ratio, 18 * ratio);
  ctx.fillStyle = 'rgba(255,147,9,0.88)';
  ctx.font = `600 ${13 * ratio}px Trebuchet MS, Arial, sans-serif`;
  ctx.fillText(descriptor.toUpperCase(), 24 * ratio, 46 * ratio);
  ctx.fillStyle = 'rgba(255,246,228,0.54)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const footer = motionMode
    ? `LOOP · ${playback.trailMs} ms trail · ${playback.fadeMs} ms fade`
    : `START ●  END ●  · ${validRows.length.toLocaleString()} COP samples · ${Math.round(1000 / sampleIntervalMs(state.rows))} Hz`;
  ctx.fillText(footer,
    (width - 20) * ratio, 54 * ratio);
  if (!validRows.length) {
    ctx.fillStyle = 'rgba(255,246,228,0.72)';
    ctx.font = `600 ${18 * ratio}px Trebuchet MS, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COP DATA UNAVAILABLE', width * 0.5 * ratio, height * 0.5 * ratio);
  }
  ctx.restore();
  drawBalanceTimeline();
  syncBalanceAnalyzeControls();
}

function balanceAnalyzeSeriesPoint(row, layout, settings, xKey, yKey) {
  return balanceAnalyzePoint({
    ...row,
    cop_x_mm: row[xKey],
    cop_y_mm: row[yKey],
  }, layout, settings);
}

function balanceAnalyzeSecondLegTapEvents(settings) {
  const playback = state.balanceAnalyze;
  const result = state.analyzeResult?.result || null;
  const values = result?.metrics?.values || {};
  const activeSide = settings.activeSide;
  const paired = normalizeBalanceVisionMode(settings.visionMode) === 'paired';
  const key = [
    state.activeResultId || state.source,
    state.rows.length,
    state.rows.at(-1)?.t_ms || 0,
    activeSide,
    paired ? 'paired' : 'single',
  ].join(':');
  if (playback.tapEventCacheKey === key) return playback.tapEvents;

  playback.tapEventCacheKey = key;
  playback.tapEvents = [];
  if (settings.legMode !== 'single' || !['left', 'right'].includes(activeSide)) {
    return playback.tapEvents;
  }
  const secondForceSuffix = activeSide === 'left' ? 'right_abs_n' : 'left_abs_n';
  const conditions = paired
    ? [
        { visionMode: 'open', prefix: 'eo_', metrics: values.open || {} },
        { visionMode: 'closed', prefix: 'ec_', metrics: values.closed || {} },
      ]
    : [{ visionMode: normalizeBalanceVisionMode(settings.visionMode), prefix: '', metrics: values }];
  conditions.forEach((condition) => {
    const forceKey = `${condition.prefix}${secondForceSuffix}`;
    const thresholdN = condition.metrics.secondLegTapThresholdN || 20;
    detectSecondLegTapEvents(state.rows, { forceKey, thresholdN }).forEach((tMs) => {
      playback.tapEvents.push({ tMs, visionMode: condition.visionMode });
    });
  });
  return playback.tapEvents;
}

function drawBalanceAnalyzeSecondLegTapRipples(layout, settings, playback, motionMode, ratio) {
  if (!motionMode || settings.legMode !== 'single') return;
  if (!['left', 'right'].includes(settings.activeSide)) return;
  const secondPlateIndex = settings.activeSide === 'left' ? 1 : 0;
  const rect = layout.rects[secondPlateIndex];
  balanceAnalyzeSecondLegTapEvents(settings)
    .filter((event) => playback.cursorMs >= event.tMs && playback.cursorMs - event.tMs <= 680)
    .slice(-4)
    .forEach((event) => {
      drawSecondLegTapRipple(ctx, rect, event.tMs, playback.cursorMs, ratio);
    });
}

function balanceHeatmapDomain(layout, settings) {
  if (settings.legMode === 'single') {
    const plateIndex = settings.activeSide === 'right' ? 1 : 0;
    return {
      xMin: -layout.plateWidthMm / 2,
      xMax: layout.plateWidthMm / 2,
      yMin: -layout.plateHeightMm / 2,
      yMax: layout.plateHeightMm / 2,
      rect: layout.rects[plateIndex],
    };
  }
  const totalWidthMm = layout.plateWidthMm * 2 + layout.gapMm;
  return {
    xMin: -totalWidthMm / 2,
    xMax: totalWidthMm / 2,
    yMin: -layout.plateHeightMm / 2,
    yMax: layout.plateHeightMm / 2,
    rect: {
      x: layout.groupLeft,
      y: layout.groupTop,
      w: layout.groupWidth,
      h: layout.groupHeight,
    },
  };
}

function blurBalanceDensity(input, width, height) {
  const radius = 5;
  const sigma = 2.15;
  const kernel = [];
  let kernelSum = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    const value = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel.push(value);
    kernelSum += value;
  }
  for (let index = 0; index < kernel.length; index++) kernel[index] /= kernelSum;

  const horizontal = new Float32Array(input.length);
  const output = new Float32Array(input.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceX = clamp(x + offset, 0, width - 1);
        sum += input[y * width + sourceX] * kernel[offset + radius];
      }
      horizontal[y * width + x] = sum;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceY = clamp(y + offset, 0, height - 1);
        sum += horizontal[sourceY * width + x] * kernel[offset + radius];
      }
      output[y * width + x] = sum;
    }
  }
  return output;
}

function buildBalanceDensityGrid(series, domain, cursorMs) {
  const widthMm = domain.xMax - domain.xMin;
  const heightMm = domain.yMax - domain.yMin;
  // A 1.5 mm density cell keeps local dwell structure visible instead of
  // enlarging each coarse cell into a soft square when the plate is zoomed.
  const cellMm = 1.5;
  const width = Math.max(64, Math.ceil(widthMm / cellMm));
  const height = Math.max(100, Math.ceil(heightMm / cellMm));
  const density = new Float32Array(width * height);
  series.rows.forEach((row) => {
    if (Number(row.t_ms) > cursorMs) return;
    const xMm = Number(row[series.xKey]);
    const yMm = Number(row[series.yKey]);
    if (!finite(xMm) || !finite(yMm) ||
        xMm < domain.xMin || xMm > domain.xMax ||
        yMm < domain.yMin || yMm > domain.yMax) return;
    const x = clamp(Math.round((xMm - domain.xMin) / widthMm * (width - 1)), 0, width - 1);
    const y = clamp(Math.round((domain.yMax - yMm) / heightMm * (height - 1)), 0, height - 1);
    density[y * width + x] += 1;
  });
  return { width, height, values: blurBalanceDensity(density, width, height) };
}

function balanceDensityPercentile(grids, peak, quantile) {
  if (!(peak > 0)) return 0;
  const bins = 512;
  const histogram = new Uint32Array(bins);
  const floor = peak * 0.0005;
  let count = 0;
  grids.forEach((grid) => grid.values.forEach((value) => {
    if (!(value > floor)) return;
    const bin = clamp(Math.floor(value / peak * (bins - 1)), 0, bins - 1);
    histogram[bin] += 1;
    count += 1;
  }));
  if (!count) return 0;
  const target = Math.max(1, Math.ceil(count * clamp(quantile, 0, 1)));
  let accumulated = 0;
  for (let index = 0; index < bins; index++) {
    accumulated += histogram[index];
    if (accumulated >= target) return peak * index / (bins - 1);
  }
  return peak;
}

function balanceHeatmapColor(stops, strength) {
  const value = clamp(strength, 0, 1);
  for (let index = 1; index < stops.length; index++) {
    const previous = stops[index - 1];
    const next = stops[index];
    if (value > next[0]) continue;
    const mix = clamp((value - previous[0]) / Math.max(0.0001, next[0] - previous[0]), 0, 1);
    return [
      previous[1] + (next[1] - previous[1]) * mix,
      previous[2] + (next[2] - previous[2]) * mix,
      previous[3] + (next[3] - previous[3]) * mix,
    ];
  }
  return stops.at(-1).slice(1);
}

function balanceHeatmapCanvas(series, domain, cursorMs, settings) {
  const playback = state.balanceAnalyze;
  const cursorBucketMs = Math.min(
    balanceAnalyzeDurationMs(),
    Math.max(0, Math.floor(cursorMs / 100) * 100),
  );
  const key = [
    state.activeResultId || state.source,
    state.rows.length,
    state.rows.at(-1)?.t_ms || 0,
    settings.legMode,
    settings.activeSide,
    normalizeBalanceVisionMode(settings.visionMode),
    playback.heatmapMode,
    cursorBucketMs,
  ].join(':');
  if (playback.heatmapCacheKey === key && playback.heatmapCanvas) {
    return playback.heatmapCanvas;
  }

  const requestedLabel = playback.heatmapMode === 'open' ? 'EO' : 'EC';
  const selectedSeries = series.find((item) => item.label === requestedLabel);
  if (!selectedSeries) return null;
  const grids = [buildBalanceDensityGrid(selectedSeries, domain, cursorBucketMs)];
  const width = grids[0].width;
  const height = grids[0].height;
  let peak = 0;
  grids.forEach((grid) => grid.values.forEach((value) => { peak = Math.max(peak, value); }));

  // Each condition owns its scale. A logarithmic response preserves sparse
  // visited areas while the upper percentile still gives the hottest dwell
  // region a stable red endpoint.
  const densityHigh = Math.max(0.0001, balanceDensityPercentile(grids, peak, 0.995));
  const densityPivot = Math.max(0.000001, densityHigh * 0.012);
  const normalizeDensity = (value) => {
    if (!(value > 0)) return 0;
    return clamp(
      Math.log1p(value / densityPivot) / Math.log1p(densityHigh / densityPivot),
      0,
      1,
    );
  };

  const temperatureStops = [
    [0.00, 18, 30, 92],
    [0.16, 0, 92, 230],
    [0.33, 0, 205, 246],
    [0.50, 42, 214, 87],
    [0.68, 232, 239, 50],
    [0.84, 255, 133, 0],
    [1.00, 240, 42, 20],
  ];

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const heatCtx = canvas.getContext('2d');
  const image = heatCtx.createImageData(width, height);
  for (let index = 0; index < width * height; index++) {
    const value = grids[0].values[index];
    const strength = normalizeDensity(value);
    if (strength <= 0) continue;
    const [red, green, blue] = balanceHeatmapColor(temperatureStops, strength);
    const offset = index * 4;
    image.data[offset] = Math.round(red);
    image.data[offset + 1] = Math.round(green);
    image.data[offset + 2] = Math.round(blue);
    image.data[offset + 3] = Math.round(28 + Math.pow(strength, 0.7) * 205);
  }
  heatCtx.putImageData(image, 0, 0);
  playback.heatmapCacheKey = key;
  playback.heatmapCanvas = canvas;
  return canvas;
}

function drawBalanceAnalyzeHeatmap(layout, settings, series, playback, motionMode, ratio) {
  if (playback.heatmapMode === 'off') return;
  const domain = balanceHeatmapDomain(layout, settings);
  const cursorMs = motionMode ? playback.cursorMs : balanceAnalyzeDurationMs();
  const canvas = balanceHeatmapCanvas(series, domain, cursorMs, settings);
  if (!canvas) return;
  const rect = domain.rect;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.beginPath();
  ctx.rect(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
  ctx.clip();
  ctx.drawImage(
    canvas,
    rect.x * ratio,
    rect.y * ratio,
    rect.w * ratio,
    rect.h * ratio,
  );
  ctx.restore();
}

function drawBalanceAnalyzeSeries(series, layout, settings, playback, motionMode, ratio) {
  const sourceRows = motionMode
    ? series.rows.filter((row) => row.t_ms <= playback.cursorMs && row.t_ms >= playback.cursorMs - playback.trailMs)
    : series.rows;
  const stride = Math.max(1, Math.ceil(sourceRows.length / (motionMode ? 900 : 1600)));
  const reduced = sourceRows.filter((row, index) => index % stride === 0 || index === sourceRows.length - 1);
  if (!reduced.length) return;

  ctx.save();
  ctx.lineWidth = 1.8 * ratio;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (motionMode) {
    for (let index = 1; index < reduced.length; index += 1) {
      const previousRow = reduced[index - 1];
      const row = reduced[index];
      if (row.t_ms - previousRow.t_ms > sampleIntervalMs(state.rows) * stride * 3) continue;
      const previous = balanceAnalyzeSeriesPoint(previousRow, layout, settings, series.xKey, series.yKey);
      const point = balanceAnalyzeSeriesPoint(row, layout, settings, series.xKey, series.yKey);
      const ageMs = Math.max(0, playback.cursorMs - row.t_ms);
      const fadeStartMs = Math.max(0, playback.trailMs - playback.fadeMs);
      const alpha = playback.fadeMs > 0 && ageMs > fadeStartMs
        ? clamp((playback.trailMs - ageMs) / playback.fadeMs, 0.04, 1)
        : 1;
      const traceOpacity = state.balanceAnalyze.heatmapMode !== 'off' ? 0.2 : 1;
      ctx.strokeStyle = series.rgba(0.9 * alpha * traceOpacity);
      ctx.beginPath();
      ctx.moveTo(previous.x * ratio, previous.y * ratio);
      ctx.lineTo(point.x * ratio, point.y * ratio);
      ctx.stroke();
    }
    const current = balanceAnalyzeSeriesPoint(reduced.at(-1), layout, settings, series.xKey, series.yKey);
    ctx.shadowColor = series.color;
    ctx.shadowBlur = 12 * ratio;
    ctx.fillStyle = series.color;
    ctx.strokeStyle = '#fff6e4';
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.arc(current.x * ratio, current.y * ratio, 7 * ratio, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.strokeStyle = series.rgba(0.86 * (state.balanceAnalyze.heatmapMode !== 'off' ? 0.2 : 1));
    ctx.beginPath();
    reduced.forEach((row, index) => {
      const point = balanceAnalyzeSeriesPoint(row, layout, settings, series.xKey, series.yKey);
      const previous = reduced[index - 1];
      if (index === 0 || row.t_ms - previous.t_ms > sampleIntervalMs(state.rows) * stride * 3) {
        ctx.moveTo(point.x * ratio, point.y * ratio);
      } else {
        ctx.lineTo(point.x * ratio, point.y * ratio);
      }
    });
    ctx.stroke();
    const start = balanceAnalyzeSeriesPoint(reduced[0], layout, settings, series.xKey, series.yKey);
    const end = balanceAnalyzeSeriesPoint(reduced.at(-1), layout, settings, series.xKey, series.yKey);
    [[start, 4.5], [end, 6]].forEach(([point, radius], index) => {
      ctx.fillStyle = index === 0 ? '#8fdb00' : series.color;
      ctx.strokeStyle = '#fff6e4';
      ctx.lineWidth = 1.5 * ratio;
      ctx.beginPath();
      ctx.arc(point.x * ratio, point.y * ratio, radius * ratio, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawBalanceAnalyze() {
  const ratio = window.devicePixelRatio || 1;
  const width = chart.clientWidth || 1;
  const height = chart.clientHeight || 1;
  const result = state.analyzeResult?.result || null;
  const settings = result?.disciplineSettings || result?.disciplineDefinition?.settings || {};
  const layout = balanceAnalyzeLayout(width, height);
  drawBalanceAnalyzePlate(layout.rects[0], 'LEFT', '#8fdb00', ratio);
  drawBalanceAnalyzePlate(layout.rects[1], 'RIGHT', '#f02a14', ratio);

  const paired = normalizeBalanceVisionMode(settings.visionMode) === 'paired' &&
    state.rows.some((row) => finite(Number(row.eo_cop_x_mm)) && finite(Number(row.ec_cop_x_mm)));
  const makeSeries = (label, color, rgb, xKey, yKey, validKey) => ({
    label,
    color,
    rgba: (alpha) => `rgba(${rgb},${Number(alpha).toFixed(3)})`,
    xKey,
    yKey,
    validKey,
    rows: state.rows.filter((row) =>
      (row[validKey] == null || Number(row[validKey]) > 0.5) &&
      finite(Number(row[xKey])) && finite(Number(row[yKey]))),
  });
  const series = paired
    ? [
        makeSeries('EO', '#3bbcf2', '59,188,242', 'eo_cop_x_mm', 'eo_cop_y_mm', 'eo_cop_valid'),
        makeSeries('EC', '#ff9309', '255,147,9', 'ec_cop_x_mm', 'ec_cop_y_mm', 'ec_cop_valid'),
      ]
    : [makeSeries(
        balanceVisionLabel(settings.visionMode || 'closed', true),
        normalizeBalanceVisionMode(settings.visionMode) === 'open' ? '#3bbcf2' : '#ff9309',
        normalizeBalanceVisionMode(settings.visionMode) === 'open' ? '59,188,242' : '255,147,9',
        'cop_x_mm', 'cop_y_mm', 'cop_valid',
      )];

  const playback = state.balanceAnalyze;
  const durationMs = balanceAnalyzeDurationMs();
  if (!finite(playback.cursorMs)) playback.cursorMs = durationMs;
  const motionMode = playback.engaged && durationMs > 0;
  drawBalanceAnalyzeHeatmap(layout, settings, series, playback, motionMode, ratio);
  series.forEach((item) => drawBalanceAnalyzeSeries(item, layout, settings, playback, motionMode, ratio));
  drawBalanceAnalyzeSecondLegTapRipples(layout, settings, playback, motionMode, ratio);

  const descriptor = balanceResultDescriptor(result) || 'Static Balance';
  ctx.save();
  ctx.fillStyle = 'rgba(255,246,228,0.94)';
  ctx.font = `700 ${20 * ratio}px Trebuchet MS, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('STATIC BALANCE', 24 * ratio, 18 * ratio);
  ctx.fillStyle = 'rgba(255,147,9,0.88)';
  ctx.font = `600 ${13 * ratio}px Trebuchet MS, Arial, sans-serif`;
  ctx.fillText(descriptor.toUpperCase(), 24 * ratio, 46 * ratio);
  if (paired) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3bbcf2';
    ctx.fillText('EO  EYES OPEN', width * 0.44 * ratio, 46 * ratio);
    ctx.fillStyle = '#ff9309';
    ctx.fillText('EC  EYES CLOSED', width * 0.58 * ratio, 46 * ratio);
  }
  ctx.fillStyle = 'rgba(255,246,228,0.54)';
  ctx.textAlign = 'right';
  const sampleCount = series.reduce((sum, item) => sum + item.rows.length, 0);
  const heatmapLabel = playback.heatmapMode === 'open' ? 'HEATMAP EO · '
    : playback.heatmapMode === 'closed' ? 'HEATMAP EC · ' : '';
  const footer = motionMode
    ? `LOOP · ${heatmapLabel}${playback.trailMs} ms trail · ${playback.fadeMs} ms fade`
    : `${heatmapLabel}${paired ? 'EO + EC · ' : ''}${sampleCount.toLocaleString()} COP samples · ${Math.round(1000 / sampleIntervalMs(state.rows))} Hz`;
  ctx.fillText(footer, (width - 20) * ratio, 54 * ratio);
  if (!sampleCount) {
    ctx.fillStyle = 'rgba(255,246,228,0.72)';
    ctx.font = `600 ${18 * ratio}px Trebuchet MS, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COP DATA UNAVAILABLE', width * 0.5 * ratio, height * 0.5 * ratio);
  }
  ctx.restore();
  drawBalanceTimeline();
  syncBalanceAnalyzeControls();
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

  if (isBalanceAnalyze()) {
    drawBalanceAnalyze();
    if (!state.balanceAnalyze.playing) renderMetrics();
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
  drawSampleRateLabel(ctx, chart.clientWidth || 1, chart.clientHeight || 1, window.devicePixelRatio || 1, state.rows);

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
  if (discipline === 'eyes_closed_balance') resetBalanceAnalyzePlayback({ resetView: true });
  state.adjustedLandmarks = { total: null, left: null, right: null };
  state.focusWindow = null;
  state.selectedLandmark = null;
  state.metricSource = discipline === 'drop_jump' ? 'adjusted' : 'fw';
  controls.metricsFw.classList.toggle('active', state.metricSource === 'fw');
  controls.metricsAdjusted.classList.toggle('active', state.metricSource === 'adjusted');
  renderAnalyzeMode();
  if (!isBalanceAnalyze()) {
    detectAllLandmarks(false);
    if (state.focusEnabled) ensureFocusWindow();
  }
  setStatus(`Mode: ${discipline.replace('_', ' ')}`);
  draw();
  drawRealtime();
}

function detectAdjustedLandmarks(prefix) {
  return TraceEngine.detectLandmarks(state.rows, prefix, landmarkSettings(), state.discipline);
}

function detectAllLandmarks(shouldDraw = true) {
  if (!state.rows.length || isBalanceAnalyze()) return;
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
  if (isBalanceAnalyze()) resetBalanceAnalyzePlayback({ resetView: true });
  else stopBalanceAnalyzePlayback();
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

const DeviceStageInstructions = {
  IDLE: 'Board is ready.',
  QUEUED: 'Request queued on the ForcePlate.',
  STARTING: 'Pausing normal measurement.',
  WARMUP: 'WARMING ELECTRONICS - KEEP PLATE EMPTY',
  WAIT_EMPTY: 'EMPTY PLATE · DO NOT TOUCH',
  MEASURE_EMPTY: 'KEEP EMPTY · measuring initial noise',
  PUT_WEIGHT: 'PUT CALIBRATION MASS AT THE CENTER',
  LOAD_SETTLE: 'MASS FOUND · KEEP IT STILL',
  STAND_STILL: 'KEEP THE CALIBRATION MASS STILL',
  SAMPLING: 'DO NOT MOVE THE MASS · sampling scale',
  CHECKING: 'KEEP MASS STILL · verifying scale',
  REMOVE_WEIGHT: 'REMOVE MASS · LEAVE PLATE EMPTY',
  FINAL_TARE: 'EMPTY PLATE · setting fixed zero',
  NOISE_SETTLE: 'DO NOT TOUCH · waiting for the plate to settle',
  NOISE_PROFILE: 'DO NOT TOUCH · learning static noise filter',
  VERIFY_ZERO: 'KEEP EMPTY · verifying final zero',
  DONE: 'Precision Calibration completed and saved.',
  ERROR: 'Maintenance failed. The previous calibration was kept.',
};

const DeviceStageDescriptions = {
  IDLE: 'Select the board and configure the mass, warm-up, learning duration and target zero noise. Each board stores its own settings and learned filter.',
  QUEUED: 'The request reached the board. Normal measurement will pause before the ADS1256 is sampled directly by the calibration routine.',
  STARTING: 'The board is isolating calibration from normal acquisition. Do not step on either edge of the selected plate.',
  WARMUP: 'The board is waiting for the configured electronics warm-up. Time already elapsed since board power-up is credited, so only the remaining time is shown.',
  WAIT_EMPTY: 'Remove the athlete, calibration mass and every loose object. Hands, cables and contact with the frame can invalidate the zero.',
  MEASURE_EMPTY: 'A short empty sample determines a safe load-detection threshold for the known mass. This is not yet the long noise profile.',
  PUT_WEIGHT: 'Place the configured calibration mass near the geometric center. Apply no hand pressure after placing it.',
  LOAD_SETTLE: 'The board has detected the mass. Release it and wait while the platform and loadcells mechanically settle.',
  STAND_STILL: 'Keep the mass completely motionless. The next samples establish the counts-to-kilograms scale.',
  SAMPLING: 'The board is averaging the stable known-mass signal. Moving the mass now can bias every later force measurement.',
  CHECKING: 'A second independent sample verifies and refines the scale factor while the same mass remains in place.',
  REMOVE_WEIGHT: 'Lift the mass away cleanly, then do not touch the plate. Calibration continues automatically after the load disappears.',
  FINAL_TARE: 'A fixed per-cell baseline is being established. This baseline will not be automatically moved during the Session.',
  NOISE_SETTLE: 'The plate must remain completely empty while the input and candidate filters settle. Static-filter learning starts automatically.',
  NOISE_PROFILE: 'At full 30,000 ADS1256 SPS, the board evaluates a fixed bank of filter cutoffs from the same samples and recommends the fastest one that reaches the requested zero-noise target. Your active preset is not changed. Any sustained touch cancels the run.',
  VERIFY_ZERO: 'The long-sample baseline is now fixed. A final independent sample verifies the residual zero before the profile is committed.',
  DONE: 'Scale, fixed baseline and noise profile are stored. Drift correction remains OFF; later zero movement will stay visible in diagnostics.',
  ERROR: 'Nothing from the failed run was committed. Check the short error detail, empty the plate and repeat when it is stable.',
};

function deviceNumber(value, fractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function selectedDeviceEndpoint() {
  return controls.deviceBoardSelect.value === 'slave'
    ? controls.slaveEndpoint.value.trim()
    : controls.endpoint.value.trim();
}

function deviceApiUrl(path) {
  return endpointWithPath(selectedDeviceEndpoint(), path);
}

function selectedDeviceLabel() {
  return controls.deviceBoardSelect.value === 'slave' ? 'Paired endpoint' : 'AP endpoint';
}

function deviceFilterPresetValue(filter) {
  if (!filter?.enabled) return 'raw';
  const cutoffHz = Number(filter.cutoffHz);
  if (!Number.isFinite(cutoffHz)) return 'raw';
  return String(cutoffHz).replace(/\.0+$/, '');
}

function deviceFilterPresetLabel(filter) {
  if (!filter?.enabled) return 'RAW';
  return `${deviceNumber(filter.cutoffHz, Number(filter.cutoffHz) < 1 ? 1 : 0)} Hz`;
}

function deviceFilterResponseLabel(filter) {
  if (!filter?.enabled) return 'Immediate';
  const responseMs = Number(filter.response90Ms);
  if (!Number.isFinite(responseMs)) return '--';
  return responseMs >= 1000
    ? `${deviceNumber(responseMs / 1000, 2)} s`
    : `${deviceNumber(responseMs, responseMs < 100 ? 1 : 0)} ms`;
}

function syncDeviceCalibrationInput(control, value, fractionDigits = 0) {
  const number = Number(value);
  if (!control || control.dataset.dirty === '1' || document.activeElement === control || !Number.isFinite(number)) return;
  control.value = number.toFixed(fractionDigits);
}

function deviceCalibrationParams() {
  return {
    massKg: Number(controls.deviceCalibrationMassKg.value),
    warmupSec: Math.round(Number(controls.deviceCalibrationWarmupSec.value)),
    noiseSec: Math.round(Number(controls.deviceCalibrationNoiseSec.value)),
    targetNoiseG: Number(controls.deviceCalibrationTargetNoiseG.value),
  };
}

function clearDeviceCalibrationDirtyState() {
  [
    controls.deviceCalibrationMassKg,
    controls.deviceCalibrationWarmupSec,
    controls.deviceCalibrationNoiseSec,
    controls.deviceCalibrationTargetNoiseG,
  ].forEach((control) => {
    if (control) delete control.dataset.dirty;
  });
}

async function saveDeviceCalibrationConfig() {
  const params = deviceCalibrationParams();
  const invalid = [
    [params.massKg, 0.1, 500, 'Calibration mass'],
    [params.warmupSec, 0, 1800, 'Warm-up'],
    [params.noiseSec, 15, 600, 'Noise learning'],
    [params.targetNoiseG, 1, 250, 'Target zero noise'],
  ].find(([value, min, max]) => !Number.isFinite(value) || value < min || value > max);
  if (invalid) throw new Error(`${invalid[3]} must be between ${invalid[1]} and ${invalid[2]}`);
  const board = controls.deviceBoardSelect.value;
  const url = new URL(deviceApiUrl('/api/settings/calibration-config'));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.state || `HTTP ${response.status}`);
  if (board === controls.deviceBoardSelect.value) {
    clearDeviceCalibrationDirtyState();
    controls.deviceActionMessage.textContent = `Calibration settings saved on ${selectedDeviceLabel()}.`;
    await pollDeviceSettings();
  }
}

function setDeviceCalibrationInputsDisabled(disabled) {
  [
    controls.deviceCalibrationMassKg,
    controls.deviceCalibrationWarmupSec,
    controls.deviceCalibrationNoiseSec,
    controls.deviceCalibrationTargetNoiseG,
  ].forEach((control) => {
    if (control) control.disabled = disabled;
  });
}

function renderDeviceSettings(data) {
  state.deviceSettings.data = data;
  controls.deviceConnectionBadge.textContent = 'ONLINE';
  controls.deviceConnectionBadge.classList.add('online');
  controls.deviceConnectionBadge.classList.remove('offline');
  const side = data.side || '?';
  const role = data.role || '?';
  const deviceId = data.deviceId ? ` · ${data.deviceId}` : '';
  const ip = data.ip ? ` · ${data.ip}` : '';
  controls.deviceIdentity.textContent = `${side} / ${role}${ip}${deviceId}`;
  const selectedOption = controls.deviceBoardSelect.selectedOptions?.[0];
  if (selectedOption) selectedOption.textContent = `${side} / ${role}`;
  controls.deviceWeightKg.textContent = deviceNumber(data.force?.kg, 3);
  controls.deviceSumCounts.textContent = deviceNumber(data.force?.sumCounts);
  controls.deviceFrameHz.textContent = deviceNumber(data.adc?.frameHz);
  controls.deviceSampleHz.textContent = deviceNumber(data.adc?.sampleHz);
  controls.deviceDrdyTimeouts.textContent = deviceNumber(data.adc?.drdyTimeouts);
  controls.deviceCalibrationState.textContent = data.calibration?.loaded ? 'LOADED' : 'NOT SET';
  controls.deviceKgPerCount.textContent = `kg/count ${deviceNumber(data.calibration?.kgPerCount, 9)}`;
  const filter = data.filter || {};
  const profileLoaded = Boolean(filter.profileLoaded || data.calibration?.noiseProfileLoaded);
  controls.deviceFilterState.textContent = filter.enabled
    ? deviceFilterPresetLabel(filter)
    : 'RAW';
  controls.deviceNoiseState.textContent = profileLoaded ? 'PROFILED' : 'NOT SET';
  controls.deviceNoiseSummary.textContent = profileLoaded
    ? `${deviceNumber(filter.durationSec)} s / ${deviceNumber(filter.sampleCount)} samples`
    : 'run Precision Calibration';
  controls.deviceSequence.textContent = `sequence ${deviceNumber(data.sequence)}`;
  const adcon = Number(data.adc?.adcon);
  const adconText = Number.isInteger(adcon)
    ? `0x${adcon.toString(16).padStart(2, '0').toUpperCase()}`
    : '--';
  const status = Number(data.adc?.status);
  const statusText = Number.isInteger(status)
    ? `0x${status.toString(16).padStart(2, '0').toUpperCase()}`
    : '--';
  const bufferText = typeof data.adc?.bufferEnabled === 'boolean'
    ? (data.adc.bufferEnabled ? 'ON' : 'OFF')
    : '--';
  controls.deviceAdcConfig.textContent = `ADS1256 ${deviceNumber(data.adc?.configuredSps)} SPS / PGA ${deviceNumber(data.adc?.pga)} / BUF ${bufferText} / STATUS ${statusText} / ADCON ${adconText}`;
  controls.deviceMeasurementState.textContent = `Measurement ${data.measurement?.state || '--'}`;
  controls.deviceUpdatedAt.textContent = `Updated ${new Date().toLocaleTimeString()}`;

  const channels = Array.isArray(data.channels) ? data.channels : [];
  controls.deviceChannelRows.innerHTML = channels.length
    ? channels.map((channel) => `
      <tr>
        <td>${escapeHtml(channel.id || '?')}</td>
        <td>${deviceNumber(channel.raw)}</td>
        <td>${deviceNumber(channel.zero)}</td>
        <td>${deviceNumber(channel.delta)}</td>
        <td>${deviceNumber(channel.counts)}</td>
        <td>${deviceNumber(channel.unfilteredCounts)}</td>
        <td>${deviceNumber(channel.filteredCounts)}</td>
        <td>${deviceNumber(channel.rawNoiseStdCounts, 2)}</td>
        <td>${deviceNumber(channel.filteredNoiseStdCounts, 2)}</td>
        <td>${deviceNumber(channel.samplesHz)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="10">No channel data</td></tr>';

  const maintenance = data.maintenance || {};
  const stage = maintenance.stage || 'IDLE';
  const detail = maintenance.detail ? ` (${maintenance.detail})` : '';
  controls.deviceMaintenanceStage.textContent = `${stage}${detail}`;
  controls.deviceMaintenanceInstruction.textContent = DeviceStageInstructions[stage] || stage;
  controls.deviceMaintenanceDescription.textContent = DeviceStageDescriptions[stage] || DeviceStageInstructions[stage] || stage;
  const progressPct = Math.max(0, Math.min(100, Number(maintenance.progressPct) || 0));
  controls.deviceCalibrationProgressBar.style.width = `${progressPct}%`;
  controls.deviceCalibrationProgressText.textContent = maintenance.active
    ? `${deviceNumber(progressPct)}%${maintenance.remainingSec ? ` · approximately ${deviceNumber(maintenance.remainingSec)} s remaining in this step` : ''}`
    : (stage === 'DONE' ? 'Calibration saved' : 'Waiting to start');
  controls.deviceMaintenanceAction.textContent = maintenance.action || 'NONE';
  controls.deviceKnownMass.textContent = `${deviceNumber(data.calibration?.knownMassKg, 2)} kg`;
  controls.deviceAverageCounts.textContent = maintenance.averageCounts
    ? `${deviceNumber(maintenance.averageCounts)} counts`
    : '--';
  syncDeviceCalibrationInput(controls.deviceCalibrationMassKg, data.calibration?.knownMassKg, 2);
  syncDeviceCalibrationInput(controls.deviceCalibrationWarmupSec, data.calibration?.warmupSec);
  syncDeviceCalibrationInput(controls.deviceCalibrationNoiseSec, data.calibration?.noiseProfileSec);
  syncDeviceCalibrationInput(controls.deviceCalibrationTargetNoiseG, data.calibration?.targetNoiseStdG);

  if (stage === 'PUT_WEIGHT') {
    controls.deviceMaintenanceInstruction.textContent = `PUT ${deviceNumber(data.calibration?.knownMassKg, 2)} KG AT THE CENTER`;
    controls.deviceMaintenanceDescription.textContent = `Place ${deviceNumber(data.calibration?.knownMassKg, 2)} kg near the geometric center. Apply no hand pressure after placing it.`;
  }

  if (document.activeElement !== controls.deviceFilterPreset) {
    controls.deviceFilterPreset.value = deviceFilterPresetValue(filter);
  }
  controls.deviceFilterPreset.disabled = !data.calibration?.loaded || Boolean(maintenance.active);
  controls.deviceFilterProfile.textContent = profileLoaded
    ? `Profile #${deviceNumber(data.calibration?.noiseProfileId)} · recommended ${deviceNumber(filter.recommendedCutoffHz, 1)} Hz · ${deviceNumber(filter.trainingSampleRateHz)} frames/s · drift correction OFF`
    : 'No noise profile loaded';
  controls.deviceRawNoise.textContent = profileLoaded ? `${deviceNumber(filter.rawStdG, 2)} g` : '--';
  const selectedMetricsAvailable = profileLoaded && (
    !filter.enabled ||
    Boolean(filter.bankProfileLoaded) ||
    Math.abs(Number(filter.cutoffHz) - Number(filter.recommendedCutoffHz)) < 0.01
  );
  controls.deviceFilteredNoise.textContent = selectedMetricsAvailable
    ? `${deviceNumber(filter.enabled ? filter.filteredStdG : filter.rawStdG, 2)} g`
    : '--';
  controls.deviceNoiseReduction.textContent = selectedMetricsAvailable
    ? `${deviceNumber(filter.enabled ? filter.reductionPct : 0, 1)} %`
    : '--';
  controls.deviceActivePreset.textContent = deviceFilterPresetLabel(filter);
  controls.deviceFilterResponse.textContent = deviceFilterResponseLabel(filter);
  controls.deviceRecommendedPreset.textContent = profileLoaded
    ? `${deviceNumber(filter.recommendedCutoffHz, Number(filter.recommendedCutoffHz) < 1 ? 1 : 0)} Hz`
    : '--';
  controls.deviceCopThreshold.textContent = `${deviceNumber(filter.copThresholdN, 1)} N`;
  controls.deviceVerifiedZero.textContent = profileLoaded
    ? `${deviceNumber(Number(filter.verifyZeroKg) * 1000, 2)} g`
    : '--';
  appendDeviceFilterHistory(data);
  drawDeviceFilterChart();

  const actionsEnabled = Boolean(data.readyForMaintenance) && !state.deviceSettings.requestPending;
  controls.deviceTare.disabled = !actionsEnabled;
  controls.deviceCalibrate.disabled = !actionsEnabled;
  setDeviceCalibrationInputsDisabled(!actionsEnabled);

  if (stage !== state.deviceSettings.lastStage) {
    state.deviceSettings.lastStage = stage;
    if (maintenance.active || stage === 'DONE' || stage === 'ERROR') {
      controls.deviceActionMessage.textContent = `${maintenance.action || 'Maintenance'}: ${DeviceStageInstructions[stage] || stage}`;
    }
  }
}

function renderDeviceOffline(message) {
  controls.deviceConnectionBadge.textContent = 'OFFLINE';
  controls.deviceConnectionBadge.classList.remove('online');
  controls.deviceConnectionBadge.classList.add('offline');
  controls.deviceIdentity.textContent = `${selectedDeviceLabel()} - ${message || 'No board data'}`;
  controls.deviceTare.disabled = true;
  controls.deviceCalibrate.disabled = true;
  controls.deviceFilterPreset.disabled = true;
  setDeviceCalibrationInputsDisabled(true);
}

async function pollDeviceSettings() {
  const selectedBoard = controls.deviceBoardSelect.value;
  const response = await fetch(deviceApiUrl('/api/settings/debug'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (selectedBoard === controls.deviceBoardSelect.value) renderDeviceSettings(data);
}

function stopDeviceSettingsPolling() {
  if (state.deviceSettings.timer) {
    clearInterval(state.deviceSettings.timer);
    state.deviceSettings.timer = 0;
  }
}

function startDeviceSettingsPolling() {
  stopDeviceSettingsPolling();
  pollDeviceSettings().catch((error) => renderDeviceOffline(error.message));
  state.deviceSettings.timer = setInterval(() => {
    pollDeviceSettings().catch((error) => renderDeviceOffline(error.message));
  }, 400);
}

async function requestDeviceMaintenance(path, label, params = {}) {
  state.deviceSettings.requestPending = true;
  controls.deviceTare.disabled = true;
  controls.deviceCalibrate.disabled = true;
  setDeviceCalibrationInputsDisabled(true);
  controls.deviceActionMessage.textContent = `Queuing ${label} on ${selectedDeviceLabel()}...`;
  try {
    const url = new URL(deviceApiUrl(path));
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await fetch(url.toString(), { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.state || `HTTP ${response.status}`);
    controls.deviceActionMessage.textContent = `${label} queued on ${selectedDeviceLabel()}. Follow the live instructions.`;
    await pollDeviceSettings();
  } finally {
    state.deviceSettings.requestPending = false;
  }
}

async function startMeasurementFromApp() {
  await stopRealtimeStream('');
  syncSessionMetaFromControls();
  syncDisciplineSettingsFromControls();
  const discipline = state.session.session.disciplineDefinition.discipline;
  const settings = state.session.session.disciplineDefinition.settings || {};
  if (discipline === 'scale') {
    setMeasurePanelTab('realtime');
    await startRealtimeStream();
    return;
  }

  if (discipline === 'eyes_closed_balance') {
    syncBalanceStanceMode(settings.legMode || 'both');
    syncBalanceDurationSec(settings.durationSec || 30);
    syncBalanceVisionMode(settings.visionMode || 'closed');
    setMeasurePanelTab('realtime');
    await startRealtimeStream();
    return;
  }
  const massSnapshot = lockCurrentAthleteMassSnapshot();
  await applyRuntimeFilterToBoards({ enabled: false, cutoffHz: 1 });
  setStatus(`Measurement START -> ${discipline}`);
  const response = await fetch(appApiUrl('/api/measurement/start', {
    discipline,
    traceWindowMs: settings.traceWindowMs,
    weighingMs: settings.weighingMs,
    bodyMassKg: Number(massSnapshot?.bodyMassKg) || 0,
  }), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  state.measurementPoll.lastFetchedRevision = 0;
  startMeasurementStatusPolling();
  setMeasurePanelTab('session');
  setStatus(`Measurement started: ${window.JBForcePlateModels.disciplineDefinition(discipline).label}`);
}

async function stopMeasurementFromApp() {
  if ((isScaleDiscipline() || isEyesClosedBalance()) &&
      (state.realtime.live || state.realtime.stopUrls.length)) {
    await stopRealtimeStream(isScaleDiscipline() ? 'Scale stopped' : 'Static Balance stopped');
    return;
  }
  await stopRealtimeStream('');
  stopMeasurementStatusPolling();
  setStatus('Measurement STOP -> /api/measurement/stop');
  const response = await fetch(appApiUrl('/api/measurement/stop'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await applyRuntimeFilterToBoards({ enabled: true, cutoffHz: 1 });
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

async function setDeviceFilterPreset(preset) {
  controls.deviceFilterPreset.disabled = true;
  try {
    const url = new URL(deviceApiUrl('/api/settings/filter'));
    const enabled = preset !== 'raw';
    url.searchParams.set('enabled', enabled ? '1' : '0');
    if (enabled) url.searchParams.set('cutoffHz', preset);
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.state || `HTTP ${response.status}`);
    state.deviceSettings.history = [];
    const label = payload.enabled ? `${deviceNumber(payload.cutoffHz, Number(payload.cutoffHz) < 1 ? 1 : 0)} Hz` : 'RAW';
    setStatus(`Measurement filter ${label} on ${selectedDeviceLabel()}`);
    await pollDeviceSettings();
  } finally {
    controls.deviceFilterPreset.disabled =
      !state.deviceSettings.data?.calibration?.loaded ||
      Boolean(state.deviceSettings.data?.maintenance?.active);
  }
}

function appendDeviceFilterHistory(data) {
  const board = [
    controls.deviceBoardSelect.value,
    selectedDeviceEndpoint(),
    data.deviceId || data.side || 'unknown',
  ].join('|');
  if (state.deviceSettings.historyBoard !== board) {
    state.deviceSettings.historyBoard = board;
    state.deviceSettings.history = [];
  }
  const unfilteredG = Number(data.force?.unfilteredKg) * 1000;
  const filteredG = data.filter?.enabled
    ? Number(data.force?.filteredKg) * 1000
    : unfilteredG;
  if (!Number.isFinite(unfilteredG) || !Number.isFinite(filteredG)) return;
  const now = performance.now();
  state.deviceSettings.history.push({ t: now, unfilteredG, filteredG });
  const cutoff = now - 120000;
  while (state.deviceSettings.history.length && state.deviceSettings.history[0].t < cutoff) {
    state.deviceSettings.history.shift();
  }
}

function drawDeviceFilterChart() {
  const ratio = window.devicePixelRatio || 1;
  const width = deviceFilterChart.clientWidth || 1;
  const height = deviceFilterChart.clientHeight || 1;
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (deviceFilterChart.width !== pixelWidth || deviceFilterChart.height !== pixelHeight) {
    deviceFilterChart.width = pixelWidth;
    deviceFilterChart.height = pixelHeight;
  }
  deviceFilterCtx.clearRect(0, 0, pixelWidth, pixelHeight);
  deviceFilterCtx.fillStyle = '#252522';
  deviceFilterCtx.fillRect(0, 0, pixelWidth, pixelHeight);

  const history = state.deviceSettings.history;
  if (!history.length) {
    deviceFilterCtx.fillStyle = 'rgba(255,246,228,0.55)';
    deviceFilterCtx.font = `${13 * ratio}px Trebuchet MS, Arial, sans-serif`;
    deviceFilterCtx.textAlign = 'center';
    deviceFilterCtx.fillText('Waiting for diagnostic samples', pixelWidth / 2, pixelHeight / 2);
    return;
  }

  const view = controls.deviceFilterView.value;
  const values = [];
  history.forEach((sample) => {
    if (view === 'overlay' || view === 'unfiltered') values.push(sample.unfilteredG);
    if (view === 'overlay' || view === 'filtered') values.push(sample.filteredG);
    if (view === 'difference') values.push(sample.unfilteredG - sample.filteredG);
  });
  const maxAbs = Math.max(5, ...values.map((value) => Math.abs(value)));
  const yExtent = maxAbs * 1.12;
  const left = 54;
  const right = 12;
  const top = 14;
  const bottom = 24;
  const x0 = history[0].t;
  const x1 = history[history.length - 1].t;
  const span = Math.max(1000, x1 - x0);
  const xFor = (sample) => (left + ((sample.t - x0) / span) * (width - left - right)) * ratio;
  const yFor = (value) => (top + (1 - (value + yExtent) / (2 * yExtent)) * (height - top - bottom)) * ratio;

  deviceFilterCtx.strokeStyle = 'rgba(220,205,181,0.16)';
  deviceFilterCtx.lineWidth = ratio;
  [-1, 0, 1].forEach((fraction) => {
    const y = yFor(fraction * yExtent);
    deviceFilterCtx.beginPath();
    deviceFilterCtx.moveTo(left * ratio, y);
    deviceFilterCtx.lineTo((width - right) * ratio, y);
    deviceFilterCtx.stroke();
  });
  deviceFilterCtx.fillStyle = 'rgba(255,246,228,0.58)';
  deviceFilterCtx.font = `${10 * ratio}px Trebuchet MS, Arial, sans-serif`;
  deviceFilterCtx.textAlign = 'right';
  deviceFilterCtx.fillText(`${yExtent.toFixed(yExtent < 20 ? 1 : 0)} g`, (left - 7) * ratio, (top + 4) * ratio);
  deviceFilterCtx.fillText('0 g', (left - 7) * ratio, yFor(0) + 3 * ratio);
  deviceFilterCtx.fillText(`${(-yExtent).toFixed(yExtent < 20 ? 1 : 0)} g`, (left - 7) * ratio, (height - bottom) * ratio);

  const drawSeries = (getter, color) => {
    deviceFilterCtx.strokeStyle = color;
    deviceFilterCtx.lineWidth = 1.5 * ratio;
    deviceFilterCtx.beginPath();
    history.forEach((sample, index) => {
      const x = xFor(sample);
      const y = yFor(getter(sample));
      if (index === 0) deviceFilterCtx.moveTo(x, y);
      else deviceFilterCtx.lineTo(x, y);
    });
    deviceFilterCtx.stroke();
  };
  if (view === 'overlay' || view === 'unfiltered') {
    drawSeries((sample) => sample.unfilteredG, 'rgba(183,170,160,0.82)');
  }
  if (view === 'overlay' || view === 'filtered') {
    drawSeries((sample) => sample.filteredG, '#ff9309');
  }
  if (view === 'difference') {
    drawSeries((sample) => sample.unfilteredG - sample.filteredG, '#8fdb00');
  }
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
  const measuredBodyMassKg = Number(status.bodyMassKg) || 0;
  if (!currentAthleteMassSnapshot() && measuredBodyMassKg >= 10 && measuredBodyMassKg <= 300) {
    window.JBForcePlateSessionStore.setAthleteMassSnapshot(
      state.session,
      state.session.currentAthleteId,
      measuredBodyMassKg,
      'forceplate',
      Date.now(),
    );
    renderAthleteMassControls();
  }
  const stateText = status.instruction || status.state || 'Measuring';
  if (stateText !== state.measurementPoll.lastStateText) {
    state.measurementPoll.lastStateText = stateText;
    renderDeviceState();
    setStatus(`Measurement: ${stateText}`);
  }
  const revision = Number(status.revision) || 0;
  if (status.traceReady && revision && revision !== state.measurementPoll.lastFetchedRevision) {
    state.measurementPoll.lastFetchedRevision = revision;
    stopMeasurementStatusPolling();
    await applyRuntimeFilterToBoards({ enabled: true, cutoffHz: 1 });
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
  if (isBalanceAnalyze()) {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    const pos = pointerPosition(event);
    const timeline = event.button === 0 && isBalanceTimelineHit(pos);
    if (timeline) {
      stopBalanceAnalyzePlayback();
      state.balanceAnalyze.cursorMs = balanceTimelineTimeAtPixel(pos.x);
      state.balanceAnalyze.engaged = state.balanceAnalyze.cursorMs < balanceAnalyzeDurationMs();
      syncBalanceAnalyzeControls();
    }
    state.dragging = {
      start: pos,
      last: pos,
      view: { ...state.balanceAnalyze.view },
      mode: timeline ? 'balanceCursor' : event.button === 2 ? 'balanceZoom' : 'balancePan',
    };
    chart.classList.toggle('dragging', !timeline);
    chart.classList.toggle('balanceTimelineDragging', timeline);
    draw();
    return;
  }
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

  if (state.dragging.mode === 'balanceCursor') {
    state.balanceAnalyze.cursorMs = balanceTimelineTimeAtPixel(pos.x);
    state.balanceAnalyze.engaged = state.balanceAnalyze.cursorMs < balanceAnalyzeDurationMs();
    syncBalanceAnalyzeControls();
    draw();
    return;
  }

  if (state.dragging.mode === 'balancePan' || state.dragging.mode === 'balanceZoom') {
    const ratio = window.devicePixelRatio || 1;
    if (state.dragging.mode === 'balancePan') {
      state.balanceAnalyze.view = {
        ...base,
        panX: base.panX + (pos.x - start.x) / ratio,
        panY: base.panY + (pos.y - start.y) / ratio,
      };
    } else {
      const dx = (pos.x - start.x) / ratio;
      const dy = (pos.y - start.y) / ratio;
      state.balanceAnalyze.view = {
        ...base,
        zoom: clamp(base.zoom * Math.exp((dx - dy) / 260), 0.2, 12),
      };
    }
    draw();
    return;
  }

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
  chart.classList.remove('balanceTimelineDragging');
  chart.classList.remove('focusDragging');
  chart.classList.remove('landmarkDragging');
}

function updateHoverCursor(event) {
  if (isBalanceAnalyze()) {
    chart.classList.remove('landmarkHover', 'focusHover');
    chart.classList.toggle('balanceTimelineHover', isBalanceTimelineHit(pointerPosition(event)));
    return;
  }
  chart.classList.remove('balanceTimelineHover');
  if (state.dragging) return;
  const pos = pointerPosition(event);
  const landmarkHit = landmarkAtPixel(pos);
  chart.classList.toggle('landmarkHover', Boolean(landmarkHit));
  chart.classList.toggle('focusHover', !landmarkHit && Boolean(focusEdgeAtPixel(pos)));
}

  controls.exportCsv.addEventListener('click', exportCurrentCsv);
controls.appTabMeasure.addEventListener('click', () => setAppTab('measure'));
controls.appTabAnalyze.addEventListener('click', () => setAppTab('analyze'));
controls.appTabResults.addEventListener('click', () => setAppTab('results'));
controls.appTabSettings.addEventListener('click', () => setAppTab('settings'));
controls.deviceBoardSelect.addEventListener('change', () => {
  state.deviceSettings.lastStage = '';
  state.deviceSettings.history = [];
  state.deviceSettings.historyBoard = controls.deviceBoardSelect.value;
  controls.deviceActionMessage.textContent = '';
  clearDeviceCalibrationDirtyState();
  renderDeviceOffline('Loading...');
  pollDeviceSettings().catch((error) => renderDeviceOffline(error.message));
});
controls.deviceRefresh.addEventListener('click', () => {
  pollDeviceSettings().catch((error) => renderDeviceOffline(error.message));
});
controls.deviceTare.addEventListener('click', () => {
  requestDeviceMaintenance('/api/settings/tare', 'Tare')
    .catch((error) => {
      controls.deviceActionMessage.textContent = `Tare error: ${error.message}`;
    });
});
controls.deviceCalibrate.addEventListener('click', () => {
  const massKg = Number(controls.deviceCalibrationMassKg.value);
  const warmupSec = Number(controls.deviceCalibrationWarmupSec.value);
  const noiseSec = Number(controls.deviceCalibrationNoiseSec.value);
  const targetNoiseG = Number(controls.deviceCalibrationTargetNoiseG.value);
  const invalid = [
    [massKg, 0.1, 500, 'Calibration mass'],
    [warmupSec, 0, 1800, 'Warm-up'],
    [noiseSec, 15, 600, 'Noise learning'],
    [targetNoiseG, 1, 250, 'Target zero noise'],
  ].find(([value, min, max]) => !Number.isFinite(value) || value < min || value > max);
  if (invalid) {
    controls.deviceActionMessage.textContent = `${invalid[3]} must be between ${invalid[1]} and ${invalid[2]}.`;
    return;
  }
  requestDeviceMaintenance('/api/settings/calibrate', 'Precision Calibration', {
    massKg,
    warmupSec: Math.round(warmupSec),
    noiseSec: Math.round(noiseSec),
    targetNoiseG,
  })
    .then(clearDeviceCalibrationDirtyState)
    .catch((error) => {
      controls.deviceActionMessage.textContent = `Calibration error: ${error.message}`;
    });
});
[
  controls.deviceCalibrationMassKg,
  controls.deviceCalibrationWarmupSec,
  controls.deviceCalibrationNoiseSec,
  controls.deviceCalibrationTargetNoiseG,
].forEach((control) => {
  control.addEventListener('input', () => {
    control.dataset.dirty = '1';
    controls.deviceActionMessage.textContent = 'Calibration settings changed. They will be saved when you leave the field.';
  });
  control.addEventListener('change', () => {
    saveDeviceCalibrationConfig().catch((error) => {
      controls.deviceActionMessage.textContent = `Calibration settings error: ${error.message}`;
    });
  });
});
controls.deviceFilterPreset.addEventListener('change', () => {
  setDeviceFilterPreset(controls.deviceFilterPreset.value).catch((error) => {
    controls.deviceActionMessage.textContent = `Filter error: ${error.message}`;
    pollDeviceSettings().catch(() => {});
  });
});
controls.deviceFilterView.addEventListener('change', drawDeviceFilterChart);
controls.deviceFilterClear.addEventListener('click', () => {
  state.deviceSettings.history = [];
  drawDeviceFilterChart();
});
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
  if (controls.realtimeDiscipline.value === 'eyes_closed_balance') primeCueAudio();
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
controls.balanceAddToSession.addEventListener('click', () => {
  addBalanceResultToSession().catch((error) => setStatus(`Balance save error: ${error.message}`));
});
controls.balanceRetry.addEventListener('click', () => {
  primeCueAudio();
  startRealtimeStream().catch((error) => setStatus(`Balance retry error: ${error.message}`));
});
controls.balanceDiscard.addEventListener('click', async () => {
  await setOledBalanceUi('off', { force: true });
  resetRealtimeSimulation();
  renderRealtimeRunState();
  setStatus('Balance result discarded');
});
realtimeChart.addEventListener('pointerdown', beginRealtimePan);
realtimeChart.addEventListener('contextmenu', (event) => event.preventDefault());
  controls.measureSplitterMain.addEventListener('pointerdown', (event) => beginMeasureResize('main', event));
  controls.measureSplitterControls.addEventListener('pointerdown', (event) => beginMeasureResize('controls', event));
  controls.measureSplitterCurrent.addEventListener('pointerdown', beginMeasureVerticalResize);
  controls.analyzeSplitterSettings.addEventListener('pointerdown', (event) => beginAnalyzeResize('settings', event));
  controls.analyzeSplitterMetrics.addEventListener('pointerdown', (event) => beginAnalyzeResize('metrics', event));
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
controls.clearSessionCache.addEventListener('click', () => {
  clearLocalSessionCache().catch((error) => setStatus(`Cache clear error: ${error.message}`));
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
[controls.sessionUpdateAthleteMass, controls.realtimeUpdateAthleteMass].forEach((control) => {
  control.addEventListener('click', () => {
    updateCurrentAthleteProfileMass().catch((error) => setStatus(`Athlete profile update error: ${error.message}`));
  });
});
controls.measurementStart.addEventListener('click', () => {
  if (controls.measureDiscipline.value === 'eyes_closed_balance') primeCueAudio();
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
controls.measureBalanceLegMode.addEventListener('change', () => {
  syncBalanceStanceMode(controls.measureBalanceLegMode.value);
  syncDisciplineSettingsFromControls();
  setStatus(`Balance stance: ${balanceStanceMode() === 'single' ? 'single leg' : 'both legs'}`);
});
controls.realtimeBalanceLegMode.addEventListener('change', () => {
  syncBalanceStanceMode(controls.realtimeBalanceLegMode.value);
  syncDisciplineSettingsFromControls();
  setStatus(`Balance stance: ${balanceStanceMode() === 'single' ? 'single leg' : 'both legs'}`);
});
controls.measureBalanceVisionMode.addEventListener('change', () => {
  const mode = syncBalanceVisionMode(controls.measureBalanceVisionMode.value);
  setStatus(`Balance vision: ${balanceVisionLabel(mode)}`);
});
controls.realtimeBalanceVisionMode.addEventListener('change', () => {
  const mode = syncBalanceVisionMode(controls.realtimeBalanceVisionMode.value);
  setStatus(`Balance vision: ${balanceVisionLabel(mode)}`);
});
controls.measureBalanceTimeSec.addEventListener('change', () => {
  const durationSec = syncBalanceDurationSec(controls.measureBalanceTimeSec.value);
  setStatus(`Balance time: ${durationSec}s`);
});
controls.realtimeBalanceTimeSec.addEventListener('change', () => {
  const durationSec = syncBalanceDurationSec(controls.realtimeBalanceTimeSec.value);
  setStatus(`Balance time: ${durationSec}s`);
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
controls.balancePlay.addEventListener('click', toggleBalanceAnalyzePlayback);
controls.balanceHeatmap.addEventListener('click', () => {
  const playback = state.balanceAnalyze;
  const modes = balanceAvailableHeatmapModes();
  const currentIndex = Math.max(0, modes.indexOf(playback.heatmapMode));
  playback.heatmapMode = modes[(currentIndex + 1) % modes.length];
  playback.heatmapCacheKey = '';
  playback.heatmapCanvas = null;
  syncBalanceAnalyzeControls();
  draw();
});
controls.balanceTrailMs.addEventListener('input', () => {
  state.balanceAnalyze.trailMs = Number(controls.balanceTrailMs.value) || 100;
  state.balanceAnalyze.fadeMs = Math.min(state.balanceAnalyze.fadeMs, state.balanceAnalyze.trailMs);
  syncBalanceAnalyzeControls();
  draw();
});
controls.balanceFadeMs.addEventListener('input', () => {
  state.balanceAnalyze.fadeMs = Number(controls.balanceFadeMs.value) || 0;
  syncBalanceAnalyzeControls();
  draw();
});
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

  async function refreshSharedRosterWhenIdle() {
    if (state.session.session.active || state.realtime.live) return;
  const directory = await refreshRosterFromLibrarian();
  setStatus(`Roster: ${directory.athletes.length} athletes`);
}

window.addEventListener('jb:config-changed', () => {
  refreshSharedRosterWhenIdle().catch((error) => setStatus(`Roster refresh error: ${error.message}`));
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  refreshSharedRosterWhenIdle().catch((error) => setStatus(`Roster refresh error: ${error.message}`));
});

state.chartStyle = { ...DefaultChartStyle };
controls.fitJump.classList.toggle('active', state.focusEnabled);
enhanceSelectControls();
renderPresetOptions();
  applyPresetSelection();
  applyMeasureLayout();
  applyAnalyzeLayout();
setSettingsTab('traces');
renderTraceLibrary();
initializeSessionControls().catch((error) => setStatus(`Athletes load error: ${error.message}`));
loadResultsSources().catch((error) => setStatus(`Results load error: ${error.message}`));
setMeasurePanelTab('session');
syncRealtimeRenderBufferControls();
syncBalanceStanceMode();
renderRealtimeRunState();
renderMeasurementRunState();
setAppTab('measure');
draw();
  drawRealtime();
  drawSessionPreview();
  startDeviceConnectivityPolling();
  loadEndpoint().catch((error) => setStatus(`Load error: ${error.message}`));
