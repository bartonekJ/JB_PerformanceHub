(() => {
  const root = document.documentElement;
  if (!root.classList.contains('fpMobileApp')) return;

  const body = document.body;
  body.classList.add('fpMobileApp', 'fpMobileAnalyzeGraph', 'fpMobileSettingsCalibration');
  window.JB_FORCEPLATE_MOBILE_APP = true;

  const icons = {
    measure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h3l2-8 3 12 3-9 2 5h3"/></svg>',
    analyze: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m6 14v-7m5 7V3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7 7 0 0 0-1.7-1L14.3 3h-4.1l-.4 2.9a7 7 0 0 0-1.7 1l-2.5-1-2 3.4 2 1.6a7 7 0 0 0 0 2.1l-2 1.6 2 3.4 2.5-1a7 7 0 0 0 1.7 1l.4 2.9h4.1l.4-2.9a7 7 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/></svg>',
    results: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6M9 7h3"/></svg>',
  };

  const navItems = [
    ['appTabMeasure', 'measure', 'Measure'],
    ['appTabAnalyze', 'analyze', 'Analyze'],
    ['appTabSettings', 'settings', 'Settings'],
    ['appTabResults', 'results', 'Results'],
  ];

  navItems.forEach(([id, icon, label]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.innerHTML = `${icons[icon]}<span>${label}</span>`;
    button.setAttribute('aria-label', label);
  });

  const home = document.querySelector('.fpTopbar .ph-home');
  if (home) home.removeAttribute('href');

  function createSubnav(parent, label, items) {
    const nav = document.createElement('div');
    nav.className = 'mobileSubnav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', label);
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.dataset.mobileMode = item.mode;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      button.classList.toggle('active', index === 0);
      button.addEventListener('click', () => {
        [...nav.children].forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle('active', active);
          candidate.setAttribute('aria-selected', String(active));
        });
        item.activate();
        requestRedraw();
      });
      nav.appendChild(button);
    });
    parent.prepend(nav);
    return nav;
  }

  function requestRedraw() {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  const measureView = document.getElementById('measureView');
  const measureTabs = document.querySelector('.sessionPanel .sideTabs');
  if (measureView && measureTabs) {
    measureTabs.classList.add('mobileSubnav');
    measureView.prepend(measureTabs);
  }

  function wrapAdvanced(pane, nodes, label) {
    const available = nodes.filter(Boolean);
    if (!pane || !available.length) return;
    const details = document.createElement('details');
    details.className = 'mobileAdvanced';
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.appendChild(summary);
    available.forEach((node) => details.appendChild(node));
    pane.appendChild(details);
  }

  const sessionPane = document.getElementById('sessionPane');
  wrapAdvanced(sessionPane, [
    document.getElementById('measureTraceSetting'),
    document.getElementById('measureWeighingSetting'),
  ], 'Advanced measurement');

  const realtimePane = document.getElementById('realtimePane');
  const realtimeHeading = realtimePane?.querySelector('h3');
  wrapAdvanced(realtimePane, [
    realtimeHeading,
    realtimePane?.querySelector('.realtimeControls'),
    document.getElementById('slaveEndpoint')?.closest('label'),
    document.getElementById('realtimeIntervalMs')?.closest('label'),
    document.getElementById('realtimeSampleRate')?.closest('label'),
    document.getElementById('realtimeRenderBuffer')?.closest('label'),
    document.getElementById('realtimeRenderLagMs')?.closest('label'),
    document.getElementById('realtimeWarmupMs')?.closest('label'),
  ], 'Advanced stream');

  const analyzeView = document.getElementById('analyzeView');
  if (analyzeView) {
    createSubnav(analyzeView, 'Analyze view', [
      {
        label: 'Graph',
        mode: 'graph',
        activate() {
          body.classList.add('fpMobileAnalyzeGraph');
          body.classList.remove('fpMobileAnalyzeMetrics');
        },
      },
      {
        label: 'Metrics',
        mode: 'metrics',
        activate() {
          body.classList.remove('fpMobileAnalyzeGraph');
          body.classList.add('fpMobileAnalyzeMetrics');
        },
      },
    ]);
  }

  const settingsView = document.getElementById('deviceSettingsView');
  if (settingsView) {
    createSubnav(settingsView, 'Settings view', [
      {
        label: 'Calibration',
        mode: 'calibration',
        activate() {
          body.classList.add('fpMobileSettingsCalibration');
          body.classList.remove('fpMobileSettingsTare');
        },
      },
      {
        label: 'Tare',
        mode: 'tare',
        activate() {
          body.classList.remove('fpMobileSettingsCalibration');
          body.classList.add('fpMobileSettingsTare');
        },
      },
    ]);
  }

  const resultsView = document.getElementById('resultsView');
  if (resultsView) {
    const placeholder = document.createElement('section');
    placeholder.className = 'mobileResultsPlaceholder';
    placeholder.innerHTML = `
      ${icons.results}
      <h2>Results</h2>
      <p>Session history and result comparison will arrive here in a later mobile release.</p>
    `;
    resultsView.appendChild(placeholder);
  }

  const metricSourceButtons = [document.getElementById('metricsFw'), document.getElementById('metricsAdjusted')].filter(Boolean);
  const analyzeNav = analyzeView?.querySelector('.mobileSubnav');
  if (analyzeNav && metricSourceButtons.length === 2) {
    const source = document.createElement('button');
    source.type = 'button';
    source.className = 'mobileMetricSource';
    source.textContent = 'FW';
    source.setAttribute('aria-label', 'Toggle metric source');
    source.addEventListener('click', () => {
      const adjusted = metricSourceButtons[1].classList.contains('active');
      metricSourceButtons[adjusted ? 0 : 1].click();
      source.textContent = adjusted ? 'FW' : 'Adjusted';
      requestRedraw();
    });
    analyzeNav.appendChild(source);
  }

  const orientation = window.matchMedia('(orientation: landscape)');
  const onOrientation = () => setTimeout(requestRedraw, 80);
  if (orientation.addEventListener) orientation.addEventListener('change', onOrientation);
  else orientation.addListener(onOrientation);

  requestRedraw();
})();
