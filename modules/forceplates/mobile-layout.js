(() => {
  const root = document.documentElement;
  if (!root.classList.contains('fpMobileApp')) return;

  const body = document.body;
  body.classList.add('fpMobileApp', 'fpMobileSettingsCalibration', 'fpMobileLayoutV2');
  window.JB_FORCEPLATE_MOBILE_APP = true;

  const icons = {
    measure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h3l2-8 3 12 3-9 2 5h3"/></svg>',
    analyze: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m6 14v-7m5 7V3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7 7 0 0 0-1.7-1L14.3 3h-4.1l-.4 2.9a7 7 0 0 0-1.7 1l-2.5-1-2 3.4 2 1.6a7 7 0 0 0 0 2.1l-2 1.6 2 3.4 2.5-1a7 7 0 0 0 1.7 1l.4 2.9h4.1l.4-2.9a7 7 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/></svg>',
    results: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6M9 7h3"/></svg>',
    protocols: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z"/><path d="M7 7h2M7 11h2M15 7h2M15 11h2"/></svg>',
  };

  let activeViewportSelect = null;

  function positionViewportSelect(shell = activeViewportSelect, revealSelection = false) {
    if (!shell?.classList.contains('open')) return;
    const button = shell.querySelector('.customSelectButton');
    const list = shell.querySelector('.customSelectList');
    if (!button || !list) return;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width || document.documentElement.clientWidth;
    const viewportHeight = viewport?.height || document.documentElement.clientHeight;
    const offsetLeft = viewport?.offsetLeft || 0;
    const offsetTop = viewport?.offsetTop || 0;
    const margin = 8;
    const gap = 4;
    const popupWidth = Math.min(
      Math.max(rect.width, 180),
      Math.max(120, viewportWidth - margin * 2),
    );
    const left = Math.min(
      Math.max(rect.left, offsetLeft + margin),
      offsetLeft + viewportWidth - margin - popupWidth,
    );
    const below = offsetTop + viewportHeight - rect.bottom - margin - gap;
    const above = rect.top - offsetTop - margin - gap;
    const openBelow = below >= 150 || below >= above;
    const available = Math.max(72, openBelow ? below : above);

    Object.assign(list.style, {
      left: `${Math.round(left)}px`,
      right: 'auto',
      width: `${Math.round(popupWidth)}px`,
      height: 'auto',
      maxHeight: `${Math.round(available)}px`,
    });
    const popupHeight = Math.min(list.scrollHeight, available);
    list.style.height = `${Math.round(popupHeight)}px`;
    list.style.top = `${Math.round(openBelow
      ? rect.bottom + gap
      : Math.max(offsetTop + margin, rect.top - gap - popupHeight))}px`;
    const selected = revealSelection
      ? list.querySelector('.customSelectOption.selected')
      : null;
    if (selected) {
      list.scrollTop = Math.max(0, selected.offsetTop - (popupHeight - selected.offsetHeight) / 2);
    }
  }

  function setupViewportSelects() {
    document.querySelectorAll('.customSelectButton').forEach((button) => {
      button.addEventListener('click', () => {
        const shell = button.closest('.customSelect');
        if (!shell?.classList.contains('open')) {
          if (activeViewportSelect === shell) activeViewportSelect = null;
          return;
        }
        activeViewportSelect = shell;
        positionViewportSelect(shell, true);
      });
    });
  }

  window.JBForcePlateMobileBack = () => {
    const open = document.querySelector('.customSelect.open');
    if (!open) return false;
    open.classList.remove('open');
    activeViewportSelect = null;
    open.querySelector('.customSelectButton')?.focus({ preventScroll: true });
    return true;
  };
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    activeViewportSelect = null;
  });
  window.addEventListener('resize', () => positionViewportSelect());
  document.addEventListener('scroll', (event) => {
    if (event.target === activeViewportSelect?.querySelector('.customSelectList')) return;
    positionViewportSelect();
  }, true);
  window.visualViewport?.addEventListener('resize', () => positionViewportSelect());
  window.visualViewport?.addEventListener('scroll', () => positionViewportSelect());

  [
    ['appTabMeasure', 'measure', 'Measure'],
    ['appTabAnalyze', 'analyze', 'Analyze'],
    ['appTabSettings', 'settings', 'Settings'],
    ['appTabProtocols', 'protocols', 'Protocols'],
    ['appTabResults', 'results', 'Results'],
  ].forEach(([id, icon, label]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.innerHTML = `${icons[icon]}<span>${label}</span>`;
    button.setAttribute('aria-label', label);
  });

  const home = document.querySelector('.fpTopbar .ph-home');
  if (home) home.removeAttribute('href');

  function requestRedraw() {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function createSubnav(parent, label, items) {
    const nav = document.createElement('div');
    nav.className = 'mobileSubnav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', label);
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === 0));
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

  function createContentTabs(label, items) {
    const rootNode = document.createElement('section');
    rootNode.className = 'mobileLowerPanel';
    const nav = document.createElement('div');
    nav.className = 'mobileContentTabs';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', label);
    const content = document.createElement('div');
    content.className = 'mobileTabContent';
    const panes = {};

    const activate = (id) => {
      [...nav.children].forEach((button) => {
        const active = button.dataset.mobileTab === id;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
      Object.entries(panes).forEach(([paneId, pane]) => {
        pane.classList.toggle('active', paneId === id);
      });
      rootNode.dataset.activeTab = id;
      requestRedraw();
    };

    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.dataset.mobileTab = item.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === 0));
      button.classList.toggle('active', index === 0);
      button.addEventListener('click', () => activate(item.id));
      nav.appendChild(button);

      const pane = document.createElement('section');
      pane.className = 'mobileTabPane';
      pane.dataset.mobilePane = item.id;
      pane.classList.toggle('active', index === 0);
      content.appendChild(pane);
      panes[item.id] = pane;
    });

    rootNode.append(nav, content);
    rootNode.dataset.activeTab = items[0]?.id || '';
    return { root: rootNode, nav, content, panes, activate };
  }

  function createDetails(label, nodes, open = false, className = 'mobileOptionGroup') {
    const available = nodes.filter(Boolean);
    if (!available.length) return null;
    const details = document.createElement('details');
    details.className = className;
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = label;
    const content = document.createElement('div');
    content.className = 'mobileDetailsContent';
    available.forEach((node) => content.appendChild(node));
    details.append(summary, content);
    return details;
  }

  function wrapAdvanced(pane, nodes, label) {
    const details = createDetails(label, nodes, false, 'mobileAdvanced');
    if (details) pane.appendChild(details);
  }

  function prepareMobileForm(pane) {
    if (!pane) return;
    pane.querySelectorAll('label').forEach((label) => {
      if (label.classList.contains('mobileFormRow')) return;
      const textNodes = [...label.childNodes].filter((node) => (
        node.nodeType === Node.TEXT_NODE && node.textContent.trim()
      ));
      const title = textNodes.map((node) => node.textContent.trim()).join(' ');
      if (!title) return;
      textNodes.forEach((node) => node.remove());
      const caption = document.createElement('span');
      caption.className = 'mobileFieldLabel';
      caption.textContent = title;
      label.prepend(caption);
      label.classList.add('mobileFormRow');
    });
  }

  function createCollapsibleSession(pane) {
    if (!pane) return null;
    const titleRow = pane.querySelector('.sessionTitleRow');
    const name = document.getElementById('sessionName');
    const sessionState = document.getElementById('sessionState');
    const actions = pane.querySelector('.sessionButtonRow');
    const bodyMass = pane.querySelector('.athleteMassRow');
    if (!titleRow || !name || !actions) return null;

    const header = document.createElement('div');
    header.className = 'mobileSessionHeader';
    const toggle = document.createElement('button');
    toggle.className = 'mobileSessionToggle';
    toggle.type = 'button';
    toggle.textContent = 'Session';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Show session actions');
    name.setAttribute('aria-label', 'Session name');
    header.append(toggle, name);
    sessionState?.remove();

    const extras = document.createElement('div');
    extras.className = 'mobileSessionExtras';
    extras.hidden = true;
    extras.appendChild(actions);
    if (bodyMass) extras.appendChild(bodyMass);

    titleRow.remove();
    pane.prepend(extras);
    pane.prepend(header);

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? 'Hide session actions' : 'Show session actions');
      extras.hidden = !expanded;
    });
    return { toggle, extras };
  }

  function buildMeasureLayout() {
    const measureView = document.getElementById('measureView');
    const sessionMeasurePanel = document.getElementById('sessionMeasurePanel');
    const realtimePanel = document.getElementById('realtimePanel');
    const sessionPanel = measureView?.querySelector('.sessionPanel');
    const modeSwitch = sessionPanel?.querySelector('.sideTabs');
    const deviceStatePanel = sessionPanel?.querySelector('.deviceStatePanel');
    const sessionStats = document.getElementById('sessionStats');
    const leaderboard = document.getElementById('sessionLeaderboardPanel');
    if (!measureView || !sessionMeasurePanel || !realtimePanel || !sessionPanel || !modeSwitch) return;

    const viewport = document.createElement('section');
    viewport.className = 'mobilePrimaryViewport mobileMeasureViewport';
    modeSwitch.className = 'mobileModeSwitch';
    modeSwitch.setAttribute('aria-label', 'Measurement mode');
    const sessionMode = document.getElementById('measurePanelTabSession');
    const realtimeMode = document.getElementById('measurePanelTabRealtime');
    if (sessionMode) sessionMode.textContent = 'SESSION';
    if (realtimeMode) realtimeMode.textContent = 'RT';
    viewport.appendChild(modeSwitch);
    if (deviceStatePanel) {
      deviceStatePanel.classList.add('mobileDeviceState');
      viewport.appendChild(deviceStatePanel);
    }
    viewport.append(sessionMeasurePanel, realtimePanel);

    const actionDock = document.createElement('section');
    actionDock.className = 'mobileActionDock';
    const measurementActions = document.querySelector('.measurementActions');
    const realtimeActions = document.querySelector('.realtimeActions');
    const balanceResultActions = document.getElementById('balanceResultActions');
    [measurementActions, realtimeActions, balanceResultActions].filter(Boolean)
      .forEach((node) => actionDock.appendChild(node));

    const athleteDock = document.createElement('section');
    athleteDock.className = 'mobileAthleteDock';
    const moveAthleteContext = (athleteId, categoryId, className) => {
      const context = document.createElement('div');
      context.className = `mobileAthleteContext ${className}`;
      [athleteId, categoryId].forEach((id) => {
        const control = document.getElementById(id);
        const label = control?.closest('label');
        const oldRow = label?.parentElement;
        if (!label) return;
        [...label.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .forEach((node) => node.remove());
        control.setAttribute('aria-label', id.includes('Category') ? 'Group' : 'Athlete');
        label.classList.add('mobileAthleteField');
        context.appendChild(label);
        if (oldRow?.classList.contains('sessionRow') && !oldRow.children.length) oldRow.remove();
      });
      if (context.children.length) athleteDock.appendChild(context);
    };
    moveAthleteContext('sessionAthlete', 'sessionCategory', 'mobileSessionAthleteContext');
    moveAthleteContext('realtimeAthlete', 'realtimeCategory', 'mobileRealtimeAthleteContext');
    const tabCycle = document.createElement('button');
    tabCycle.className = 'mobileMeasureTabCycle';
    tabCycle.type = 'button';
    athleteDock.appendChild(tabCycle);

    const lower = createContentTabs('Measure details', [
      { id: 'session', label: 'Session' },
      { id: 'metrics', label: 'Metrics' },
      { id: 'leaderboard', label: 'Leaderboard' },
    ]);
    const tabCycleItems = [
      { id: 'session', label: 'Session' },
      { id: 'metrics', label: 'Metrics' },
      { id: 'leaderboard', label: 'Leaderboard' },
    ];
    const syncTabCycle = () => {
      const activeId = lower.root.dataset.activeTab || 'session';
      const active = tabCycleItems.find((item) => item.id === activeId) || tabCycleItems[0];
      tabCycle.textContent = `${active.label} ↻`;
      tabCycle.setAttribute('aria-label', `Current panel ${active.label}. Show next panel`);
    };
    tabCycle.addEventListener('click', () => {
      const activeId = lower.root.dataset.activeTab || 'session';
      const index = tabCycleItems.findIndex((item) => item.id === activeId);
      lower.activate(tabCycleItems[(index + 1) % tabCycleItems.length].id);
      syncTabCycle();
    });
    syncTabCycle();

    lower.panes.session.appendChild(sessionPanel);
    if (sessionStats) lower.panes.metrics.appendChild(sessionStats);

    const realtimeMetrics = document.createElement('section');
    realtimeMetrics.className = 'mobileRealtimeMetrics';
    const balanceSummary = document.getElementById('balanceTrialSummary');
    const segmentList = document.getElementById('realtimeSegmentList');
    const exportSelected = document.getElementById('realtimeExportSelected');
    [balanceSummary, segmentList, exportSelected].filter(Boolean)
      .forEach((node) => realtimeMetrics.appendChild(node));
    lower.panes.metrics.appendChild(realtimeMetrics);
    if (leaderboard) lower.panes.leaderboard.appendChild(leaderboard);

    measureView.prepend(viewport);
    viewport.after(actionDock);
    actionDock.after(athleteDock);
    athleteDock.after(lower.root);

    const sessionPane = document.getElementById('sessionPane');
    wrapAdvanced(sessionPane, [
      document.getElementById('measureTraceSetting'),
      document.getElementById('measureWeighingSetting'),
    ], 'Advanced measurement');

    const realtimePane = document.getElementById('realtimePane');
    const realtimeSpeed = document.getElementById('realtimeSpeed');
    realtimeSpeed?.closest('label')?.classList.add('mobileHiddenSpeed');
    if (realtimeSpeed) {
      realtimeSpeed.min = '40';
      realtimeSpeed.max = '1200';
    }
    wrapAdvanced(realtimePane, [
      realtimePane?.querySelector('h3'),
      realtimePane?.querySelector('.realtimeControls'),
      document.getElementById('slaveEndpoint')?.closest('label'),
      document.getElementById('realtimeIntervalMs')?.closest('label'),
      document.getElementById('realtimeSampleRate')?.closest('label'),
      document.getElementById('realtimeRenderBuffer')?.closest('label'),
      document.getElementById('realtimeRenderLagMs')?.closest('label'),
      document.getElementById('realtimeWarmupMs')?.closest('label'),
    ], 'Advanced stream');
    prepareMobileForm(sessionPane);
    prepareMobileForm(realtimePane);
    const sessionName = document.getElementById('sessionName');
    createCollapsibleSession(sessionPane);

    const syncActions = () => {
      const realtime = measureView.classList.contains('realtimeMode');
      const measurementRunning = Boolean(state.measurementPoll.active);
      const realtimeRunning = Boolean(state.realtime.live);
      const balanceDone = Boolean(balanceResultActions && !balanceResultActions.classList.contains('hidden'));
      if (measurementActions) measurementActions.hidden = realtime;
      if (realtimeActions) realtimeActions.hidden = !realtime || balanceDone;
      if (balanceResultActions) balanceResultActions.hidden = !realtime || !balanceDone;
      const measurementStart = document.getElementById('measurementStart');
      const measurementStop = document.getElementById('measurementStop');
      const realtimeStart = document.getElementById('realtimeStart');
      const realtimeStop = document.getElementById('realtimeStop');
      if (measurementStart) measurementStart.hidden = realtime || measurementRunning;
      if (measurementStop) measurementStop.hidden = realtime || !measurementRunning;
      if (realtimeStart) realtimeStart.hidden = !realtime || realtimeRunning || balanceDone;
      if (realtimeStop) realtimeStop.hidden = !realtime || !realtimeRunning || balanceDone;
      const sessionBegin = document.getElementById('sessionBegin');
      if (sessionBegin) sessionBegin.textContent = state.session.session.active ? 'IN PROGRESS' : 'START';
      if (deviceStatePanel) {
        deviceStatePanel.dataset.state = document.getElementById('deviceState')?.textContent.trim().toLowerCase() === 'ready'
          ? 'ready'
          : 'active';
      }
    };
    window.setInterval(syncActions, 120);
    syncActions();
  }

  function compactMetricKey(label) {
    return String(label || '').toUpperCase().replace(/\s+/g, '');
  }

  function collectMetricPairs(group) {
    return [...group.querySelectorAll('.metric')].map((metric) => {
      const label = metric.querySelector('.metricLabel, .label')?.textContent.trim() || '';
      const valueNode = metric.querySelector('.metricValue, .value');
      return {
        label,
        key: compactMetricKey(label),
        value: valueNode?.textContent.trim() || '-',
        valueClass: [...(valueNode?.classList || [])]
          .filter((className) => className !== 'value' && className !== 'metricValue')
          .join(' '),
      };
    }).filter((pair) => pair.label);
  }

  function renderMobileAnalyzeMetrics(metrics) {
    if (!metrics || metrics.querySelector(':scope > .mobileAnalyzeSummary')) return;
    const identityRail = metrics.querySelector(':scope > .analyzeIdentityRail');
    const disciplineCard = identityRail?.querySelector(':scope > .analyzeDisciplineCard')
      || metrics.querySelector(':scope > .analyzeDisciplineCard');
    const athleteCard = identityRail?.querySelector(':scope > .analyzeAthleteCard')
      || metrics.querySelector(':scope > .analyzeAthleteCard');
    const groupsViewport = metrics.querySelector(':scope > .metricGroupsViewport');
    const rawGroups = [...(groupsViewport
      ? groupsViewport.querySelectorAll(':scope > .metricGroup')
      : metrics.querySelectorAll(':scope > .metricGroup'))];
    if (!disciplineCard && !athleteCard && !rawGroups.length) return;

    const groups = rawGroups.map((group, index) => ({
      title: group.querySelector(':scope > summary .metricGroupTitle, :scope > h3')?.textContent.trim()
        || `Metrics ${index + 1}`,
      pairs: collectMetricPairs(group),
    }));
    const allPairs = groups.flatMap((group) => group.pairs);
    const preferredKeys = ['TOV', 'TOV+D', 'DIS', 'FLIGHTTIME'];
    const primary = preferredKeys
      .map((key) => allPairs.find((pair) => pair.key === key))
      .filter(Boolean);
    for (const pair of allPairs) {
      if (primary.length >= 4) break;
      if (!primary.includes(pair)) primary.push(pair);
    }
    const primarySet = new Set(primary);
    const impulseGroup = groups.find((group) => compactMetricKey(group.title) === 'IMPULSEMOMENTUMHEIGHT');
    const discipline = disciplineCard?.querySelector('strong')?.textContent.trim() || '-';
    const disciplineDetail = disciplineCard
      ?.querySelector(':scope > small, .disciplineContextParameter')
      ?.textContent.trim().replace(/\s+/g, ' ') || '';
    const athlete = athleteCard?.querySelector('strong')?.textContent.trim() || 'No athlete';
    const method = impulseGroup?.title || groups[0]?.title || disciplineDetail || 'Metrics';

    const summary = document.createElement('section');
    summary.className = 'mobileAnalyzeSummary';
    const identity = document.createElement('div');
    identity.className = 'mobileAnalyzeIdentity';
    const athleteName = document.createElement('strong');
    athleteName.className = 'mobileAnalyzeAthleteName';
    athleteName.textContent = athlete;
    const disciplineName = document.createElement('strong');
    disciplineName.className = 'mobileAnalyzeDisciplineName';
    disciplineName.textContent = discipline;
    identity.append(athleteName, disciplineName);
    const methodLabel = document.createElement('div');
    methodLabel.className = 'mobileAnalyzeMethod';
    methodLabel.textContent = disciplineDetail && disciplineDetail !== method
      ? `${method} · ${disciplineDetail}`
      : method;
    const primaryGrid = document.createElement('div');
    primaryGrid.className = 'mobileAnalyzePrimaryGrid';
    const shortLabels = new Map([
      ['TOV', 'TOV'],
      ['TOV+D', 'TOV+D'],
      ['DIS', 'DIS'],
      ['FLIGHTTIME', 'FT'],
    ]);
    primary.forEach((pair) => {
      const item = document.createElement('div');
      item.className = 'mobileAnalyzePrimaryMetric';
      const label = document.createElement('span');
      label.textContent = shortLabels.get(pair.key) || pair.label;
      const value = document.createElement('strong');
      value.textContent = pair.value;
      if (pair.valueClass) value.className = pair.valueClass;
      item.append(label, value);
      primaryGrid.appendChild(item);
    });
    summary.append(identity, methodLabel, primaryGrid);

    const fragment = document.createDocumentFragment();
    fragment.appendChild(summary);
    groups.forEach((group) => {
      const remaining = group.pairs.filter((pair) => !primarySet.has(pair));
      if (!remaining.length) return;
      const details = document.createElement('details');
      details.className = 'mobileMetricGroup';
      const groupSummary = document.createElement('summary');
      groupSummary.textContent = group.title;
      const rows = document.createElement('div');
      rows.className = 'mobileMetricRows';
      remaining.forEach((pair) => {
        const row = document.createElement('div');
        row.className = 'mobileMetricRow';
        const label = document.createElement('span');
        label.textContent = pair.label;
        const value = document.createElement('strong');
        value.textContent = pair.value;
        if (pair.valueClass) value.className = pair.valueClass;
        row.append(label, value);
        rows.appendChild(row);
      });
      details.append(groupSummary, rows);
      fragment.appendChild(details);
    });
    metrics.replaceChildren(fragment);
  }

  function buildAnalyzeLayout() {
    const analyzeView = document.getElementById('analyzeView');
    const chartPanel = document.getElementById('chartPanel');
    const metrics = document.getElementById('metrics');
    const settingsPanel = analyzeView?.querySelector('.settingsPanel');
    const toolbar = analyzeView?.querySelector('.analyzeToolbar');
    if (!analyzeView || !chartPanel || !metrics || !settingsPanel || !toolbar) return;

    const viewport = document.createElement('section');
    viewport.className = 'mobilePrimaryViewport mobileAnalyzeViewport';
    viewport.appendChild(chartPanel);

    const lower = createContentTabs('Analyze details', [
      { id: 'session', label: 'Session' },
      { id: 'metrics', label: 'Metrics' },
      { id: 'options', label: 'Graph Options' },
    ]);
    lower.panes.session.appendChild(settingsPanel);

    lower.panes.metrics.appendChild(metrics);

    const curves = createDetails('Curves', [
      toolbar.querySelector('.curveTabs'),
      document.getElementById('forceToggle'),
    ], true);
    const overlays = createDetails('Overlay Curves', [
      toolbar.querySelector('.overlayToggles'),
    ], false);
    const balancePlayback = toolbar.querySelector('#balancePlaybackControls');
    const balanceOptions = createDetails('Balance Playback', [balancePlayback], false);
    [curves, overlays, balanceOptions].filter(Boolean)
      .forEach((node) => lower.panes.options.appendChild(node));

    analyzeView.prepend(viewport);
    viewport.after(lower.root);

    const metricObserver = new MutationObserver(() => renderMobileAnalyzeMetrics(metrics));
    metricObserver.observe(metrics, { childList: true });
    renderMobileAnalyzeMetrics(metrics);

    const syncAnalyzeControls = () => {
      const prefix = state.viewMode === 'left' ? 'left' : state.viewMode === 'right' ? 'right' : 'total';
      const adjusted = state.adjustedLandmarks?.[prefix];
      const hasAdjusted = adjusted && Object.values(adjusted)
        .some((value) => Number.isFinite(value) && value >= 0);
      const desiredSource = hasAdjusted ? 'adjusted' : 'fw';
      if (state.metricSource !== desiredSource) {
        document.getElementById(desiredSource === 'adjusted' ? 'metricsAdjusted' : 'metricsFw')?.click();
      }
      if (balanceOptions && balancePlayback) {
        balanceOptions.hidden = balancePlayback.classList.contains('hidden');
      }
    };
    window.setInterval(syncAnalyzeControls, 160);
    syncAnalyzeControls();
  }

  function installTouchGestures(canvas, handlers) {
    if (!canvas) return;
    const points = new Map();
    let moved = false;
    let suppressed = false;
    let origin = null;
    let lastTap = { at: 0, x: 0, y: 0 };

    const eventPoint = (event) => ({ x: event.clientX, y: event.clientY });
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const stop = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onDown = (event) => {
      if (event.pointerType === 'mouse') return;
      stop(event);
      try { canvas.setPointerCapture(event.pointerId); } catch {}
      const point = eventPoint(event);
      const wasEmpty = points.size === 0;
      points.set(event.pointerId, point);
      if (wasEmpty) {
        moved = false;
        suppressed = false;
        origin = point;
        const now = performance.now();
        if (handlers.reset && now - lastTap.at < 320 && distance(point, lastTap) < 30) {
          suppressed = true;
          lastTap.at = 0;
          handlers.reset();
          return;
        }
        handlers.startPan?.(point);
      } else if (points.size === 2 && !suppressed) {
        moved = true;
        handlers.startPinch?.([...points.values()]);
      }
    };

    const onMove = (event) => {
      if (!points.has(event.pointerId)) return;
      stop(event);
      const point = eventPoint(event);
      points.set(event.pointerId, point);
      if (suppressed) return;
      if (points.size >= 2) {
        moved = true;
        handlers.pinch?.([...points.values()].slice(0, 2));
        return;
      }
      if (origin && distance(point, origin) > 4) moved = true;
      if (moved) handlers.pan?.(point);
    };

    const finish = (event, cancelled = false) => {
      if (!points.has(event.pointerId)) return;
      stop(event);
      const point = points.get(event.pointerId);
      points.delete(event.pointerId);
      if (points.size === 1 && !suppressed) {
        moved = true;
        const remaining = [...points.values()][0];
        origin = remaining;
        handlers.startPan?.(remaining);
        return;
      }
      if (points.size > 0) return;
      if (!cancelled && !moved && !suppressed) {
        handlers.tap?.(point);
        lastTap = { at: performance.now(), x: point.x, y: point.y };
      }
      handlers.end?.();
      origin = null;
      suppressed = false;
    };

    canvas.addEventListener('pointerdown', onDown, { capture: true, passive: false });
    canvas.addEventListener('pointermove', onMove, { capture: true, passive: false });
    canvas.addEventListener('pointerup', (event) => finish(event), { capture: true, passive: false });
    canvas.addEventListener('pointercancel', (event) => finish(event, true), { capture: true, passive: false });
  }

  function canvasPoint(canvas, point, devicePixels = false) {
    const rect = canvas.getBoundingClientRect();
    const ratio = devicePixels ? (window.devicePixelRatio || 1) : 1;
    return {
      x: (point.x - rect.left) * ratio,
      y: (point.y - rect.top) * ratio,
    };
  }

  function installAnalyzeGestures() {
    const canvas = document.getElementById('chart');
    if (!canvas) return;
    let gesture = null;
    const pointFor = (point) => canvasPoint(canvas, point, true);
    const midpoint = (points) => ({
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    });

    installTouchGestures(canvas, {
      startPan(point) {
        const start = pointFor(point);
        if (isBalanceAnalyze()) {
          gesture = { mode: 'balancePan', start, base: { ...state.balanceAnalyze.view } };
          return;
        }
        if (!state.rows.length) return;
        const base = { ...(state.view || autoView(state.rows)) };
        state.view = base;
        gesture = { mode: 'pan', start, base };
      },
      pan(point) {
        if (!gesture) return;
        const current = pointFor(point);
        if (gesture.mode === 'balancePan') {
          const ratio = window.devicePixelRatio || 1;
          state.balanceAnalyze.view = {
            ...gesture.base,
            panX: gesture.base.panX + (current.x - gesture.start.x) / ratio,
            panY: gesture.base.panY + (current.y - gesture.start.y) / ratio,
          };
        } else {
          const t0 = tAtPixelInView(gesture.start.x, gesture.base);
          const t1 = tAtPixelInView(current.x, gesture.base);
          const v0 = valueAtPixelInView(gesture.start.y, gesture.base);
          const v1 = valueAtPixelInView(current.y, gesture.base);
          state.view = {
            xMin: gesture.base.xMin + (t0 - t1),
            xMax: gesture.base.xMax + (t0 - t1),
            yMin: gesture.base.yMin + (v0 - v1),
            yMax: gesture.base.yMax + (v0 - v1),
          };
        }
        draw();
      },
      startPinch(points) {
        const converted = points.map(pointFor);
        const startMid = midpoint(converted);
        const startDistance = Math.max(1, Math.hypot(
          converted[1].x - converted[0].x,
          converted[1].y - converted[0].y,
        ));
        if (isBalanceAnalyze()) {
          gesture = {
            mode: 'balancePinch',
            startMid,
            startDistance,
            base: { ...state.balanceAnalyze.view },
          };
          return;
        }
        if (!state.rows.length) return;
        const base = { ...(state.view || autoView(state.rows)) };
        state.view = base;
        gesture = { mode: 'pinch', startMid, startDistance, base };
      },
      pinch(points) {
        if (!gesture) return;
        const converted = points.map(pointFor);
        const currentMid = midpoint(converted);
        const currentDistance = Math.max(1, Math.hypot(
          converted[1].x - converted[0].x,
          converted[1].y - converted[0].y,
        ));
        if (gesture.mode === 'balancePinch') {
          const ratio = window.devicePixelRatio || 1;
          state.balanceAnalyze.view = {
            ...gesture.base,
            zoom: clamp(gesture.base.zoom * currentDistance / gesture.startDistance, 0.2, 12),
            panX: gesture.base.panX + (currentMid.x - gesture.startMid.x) / ratio,
            panY: gesture.base.panY + (currentMid.y - gesture.startMid.y) / ratio,
          };
        } else if (gesture.mode === 'pinch') {
          const factor = gesture.startDistance / currentDistance;
          const xCenter = tAtPixelInView(gesture.startMid.x, gesture.base);
          const yCenter = valueAtPixelInView(gesture.startMid.y, gesture.base);
          const xNext = zoomRange(gesture.base.xMin, gesture.base.xMax, factor, xCenter);
          const yNext = zoomRange(gesture.base.yMin, gesture.base.yMax, factor, yCenter);
          const tShift = tAtPixelInView(gesture.startMid.x, gesture.base) -
            tAtPixelInView(currentMid.x, gesture.base);
          const vShift = valueAtPixelInView(gesture.startMid.y, gesture.base) -
            valueAtPixelInView(currentMid.y, gesture.base);
          state.view = {
            xMin: xNext.min + tShift,
            xMax: xNext.max + tShift,
            yMin: yNext.min + vShift,
            yMax: yNext.max + vShift,
          };
        }
        draw();
      },
      reset() {
        document.getElementById('fitAll')?.click();
      },
      end() {
        gesture = null;
      },
    });
  }

  function installSessionPreviewGestures() {
    const canvas = document.getElementById('sessionPreviewChart');
    if (!canvas) return;
    let gesture = null;
    const pointFor = (point) => canvasPoint(canvas, point, false);
    const valueAt = (point, view) => {
      const rect = sessionPreviewPlotRect(canvas.clientWidth || 1, canvas.clientHeight || 1);
      return {
        t: view.xMin + ((point.x - rect.left) / Math.max(1, rect.right - rect.left)) * (view.xMax - view.xMin),
        value: view.yMax - ((point.y - rect.top) / Math.max(1, rect.bottom - rect.top)) * (view.yMax - view.yMin),
      };
    };
    const midpoint = (points) => ({
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    });

    installTouchGestures(canvas, {
      startPan(point) {
        const base = sessionPreviewView();
        if (!base) return;
        gesture = { mode: 'pan', start: pointFor(point), base: { ...base } };
      },
      pan(point) {
        if (!gesture) return;
        const current = pointFor(point);
        const startValue = valueAt(gesture.start, gesture.base);
        const currentValue = valueAt(current, gesture.base);
        state.focusWindow = null;
        state.sessionPreviewViewOverride = {
          xMin: gesture.base.xMin + startValue.t - currentValue.t,
          xMax: gesture.base.xMax + startValue.t - currentValue.t,
          yMin: gesture.base.yMin + startValue.value - currentValue.value,
          yMax: gesture.base.yMax + startValue.value - currentValue.value,
        };
        drawSessionPreview();
      },
      startPinch(points) {
        const base = sessionPreviewView();
        if (!base) return;
        const converted = points.map(pointFor);
        gesture = {
          mode: 'pinch',
          base: { ...base },
          startMid: midpoint(converted),
          startDistance: Math.max(1, Math.hypot(
            converted[1].x - converted[0].x,
            converted[1].y - converted[0].y,
          )),
        };
      },
      pinch(points) {
        if (!gesture || gesture.mode !== 'pinch') return;
        const converted = points.map(pointFor);
        const currentMid = midpoint(converted);
        const currentDistance = Math.max(1, Math.hypot(
          converted[1].x - converted[0].x,
          converted[1].y - converted[0].y,
        ));
        const factor = gesture.startDistance / currentDistance;
        const center = valueAt(gesture.startMid, gesture.base);
        const xNext = zoomRange(gesture.base.xMin, gesture.base.xMax, factor, center.t);
        const yNext = zoomRange(gesture.base.yMin, gesture.base.yMax, factor, center.value);
        const startAtCurrent = valueAt(currentMid, gesture.base);
        state.focusWindow = null;
        state.sessionPreviewViewOverride = {
          xMin: xNext.min + center.t - startAtCurrent.t,
          xMax: xNext.max + center.t - startAtCurrent.t,
          yMin: yNext.min + center.value - startAtCurrent.value,
          yMax: yNext.max + center.value - startAtCurrent.value,
        };
        drawSessionPreview();
      },
      reset() {
        state.focusWindow = null;
        state.sessionPreviewViewOverride = null;
        drawSessionPreview();
      },
      end() {
        gesture = null;
      },
    });
  }

  function installRealtimeGestures() {
    const canvas = document.getElementById('realtimeChart');
    if (!canvas) return;
    let gesture = null;
    const pointFor = (point) => canvasPoint(canvas, point, false);
    const midpoint = (points) => ({
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    });

    installTouchGestures(canvas, {
      startPan(point) {
        gesture = {
          mode: 'pan',
          start: pointFor(point),
          cursorMs: realtimeDisplayNowMs(),
          pxPerSecond: state.realtime.pxPerSecond,
        };
      },
      pan(point) {
        if (!gesture || gesture.mode !== 'pan') return;
        const current = pointFor(point);
        const deltaMs = -((current.x - gesture.start.x) /
          Math.max(1, gesture.pxPerSecond)) * 1000;
        setRealtimeReviewCursor(gesture.cursorMs + deltaMs);
      },
      startPinch(points) {
        const converted = points.map(pointFor);
        const startMid = midpoint(converted);
        const rect = canvas.getBoundingClientRect();
        const nowX = rect.width - 14;
        const displayMs = realtimeDisplayNowMs();
        const pxPerSecond = state.realtime.pxPerSecond;
        gesture = {
          mode: 'pinch',
          startMid,
          startDistance: Math.max(1, Math.abs(converted[1].x - converted[0].x)),
          pxPerSecond,
          reviewMode: state.realtime.reviewMode,
          anchorMs: displayMs - ((nowX - startMid.x) / Math.max(1, pxPerSecond)) * 1000,
          nowX,
        };
      },
      pinch(points) {
        if (!gesture || gesture.mode !== 'pinch') return;
        const converted = points.map(pointFor);
        const currentMid = midpoint(converted);
        const currentDistance = Math.max(1, Math.abs(converted[1].x - converted[0].x));
        const next = clamp(
          gesture.pxPerSecond * currentDistance / gesture.startDistance,
          40,
          1200,
        );
        state.realtime.pxPerSecond = next;
        const speed = document.getElementById('realtimeSpeed');
        if (speed) speed.value = String(Math.round(next));
        if (gesture.reviewMode) {
          setRealtimeReviewCursor(
            gesture.anchorMs + ((gesture.nowX - currentMid.x) / next) * 1000,
          );
        } else {
          drawRealtime();
        }
      },
      tap(point) {
        beginRealtimePan({
          button: 0,
          clientX: point.x,
          clientY: point.y,
          preventDefault() {},
        });
      },
      end() {
        gesture = null;
      },
    });
  }

  buildMeasureLayout();
  buildAnalyzeLayout();
  setupViewportSelects();
  installAnalyzeGestures();
  installSessionPreviewGestures();
  installRealtimeGestures();

  const settingsView = document.getElementById('deviceSettingsView');
  if (settingsView) {
    const librarianPanel = document.createElement('section');
    librarianPanel.className = 'mobileLibrarianPanel';
    librarianPanel.innerHTML = `
      <header>
        <h2>Librarian Connection</h2>
        <p>Connect and refresh the Athlete and Group lists used by Session and Realtime.</p>
      </header>
      <label class="mobileLibrarianField" for="mobileLibrarianApi">
        <span>Librarian API</span>
        <input id="mobileLibrarianApi" type="text" inputmode="url" autocomplete="url" autocapitalize="none" spellcheck="false">
      </label>
      <div id="mobileLibrarianStatus" class="mobileLibrarianStatus" role="status" aria-live="polite">
        <i aria-hidden="true"></i>
        <span><strong>Not checked</strong><small>Use Connect & Sync to refresh athletes.</small></span>
      </div>
      <button id="mobileLibrarianSync" class="primary" type="button">CONNECT &amp; SYNC</button>
    `;
    settingsView.appendChild(librarianPanel);

    const librarianApi = librarianPanel.querySelector('#mobileLibrarianApi');
    const librarianStatus = librarianPanel.querySelector('#mobileLibrarianStatus');
    const librarianSync = librarianPanel.querySelector('#mobileLibrarianSync');
    const sessionStore = window.JBForcePlateSessionStore;
    librarianApi.value = sessionStore?.readLibrarianApi?.() || '';

    const setLibrarianStatus = (label, detail, status = 'idle') => {
      librarianStatus.dataset.status = status;
      librarianStatus.querySelector('strong').textContent = label;
      librarianStatus.querySelector('small').textContent = detail;
    };
    const rosterCountLabel = (athletes, groups) => (
      `${athletes} athlete${athletes === 1 ? '' : 's'} · ${groups} group${groups === 1 ? '' : 's'}`
    );
    const rosterStatusDetail = (athletes, groups, updatedAt = state.session.rosterUpdatedAt) => {
      const synced = Number(updatedAt)
        ? new Date(Number(updatedAt)).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        : '';
      return `${rosterCountLabel(athletes, groups)}${synced ? ` · synced ${synced}` : ''}`;
    };
    const showStoredRosterStatus = () => {
      librarianApi.value = sessionStore?.readLibrarianApi?.() || librarianApi.value;
      const source = state.session.rosterSource;
      const athletes = state.session.athletes?.length || 0;
      const groups = state.session.categories?.length || 0;
      if (source === 'librarian') {
        setLibrarianStatus('Librarian online', rosterStatusDetail(athletes, groups), 'online');
        return;
      }
      if (source === 'cache') {
        setLibrarianStatus('Offline cache', rosterStatusDetail(athletes, groups), 'offline');
        return;
      }
      setLibrarianStatus('Librarian offline', state.session.rosterMessage || 'Roster has not been synchronized.', 'offline');
    };
    librarianSync.addEventListener('click', async () => {
      if (state.session.session.active || state.realtime.live) {
        setLibrarianStatus('Sync unavailable', 'Stop the active measurement first.', 'offline');
        return;
      }
      const endpoint = librarianApi.value.trim().replace(/\/$/, '');
      try {
        const url = new URL(endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS address.');
      } catch (error) {
        setLibrarianStatus('Invalid Librarian API', error.message, 'offline');
        librarianApi.focus();
        return;
      }

      librarianSync.disabled = true;
      librarianSync.textContent = 'SYNCING…';
      setLibrarianStatus('Connecting…', endpoint, 'busy');
      try {
        if (endpoint !== sessionStore.readLibrarianApi()) sessionStore.writeLibrarianApi(endpoint);
        const directory = await refreshRosterFromLibrarian();
        if (directory.source !== 'librarian') {
          setLibrarianStatus('Librarian offline', directory.message, 'offline');
          return;
        }
        setLibrarianStatus(
          'Librarian online',
          rosterStatusDetail(directory.athletes.length, directory.categories.length, directory.updatedAt),
          'online',
        );
        setStatus(`Roster synchronized: ${directory.athletes.length} athletes`);
      } catch (error) {
        setLibrarianStatus('Sync failed', error.message, 'offline');
      } finally {
        librarianSync.disabled = false;
        librarianSync.textContent = 'CONNECT & SYNC';
      }
    });

    createSubnav(settingsView, 'Settings view', [
      {
        label: 'Calibration',
        activate() {
          body.classList.add('fpMobileSettingsCalibration');
          body.classList.remove('fpMobileSettingsTare', 'fpMobileSettingsLibrarian');
        },
      },
      {
        label: 'Tare',
        activate() {
          body.classList.remove('fpMobileSettingsCalibration', 'fpMobileSettingsLibrarian');
          body.classList.add('fpMobileSettingsTare');
        },
      },
      {
        label: 'Librarian',
        activate() {
          body.classList.remove('fpMobileSettingsCalibration', 'fpMobileSettingsTare');
          body.classList.add('fpMobileSettingsLibrarian');
          showStoredRosterStatus();
        },
      },
    ]);
  }

  const resultsView = document.getElementById('resultsView');
  if (resultsView && !resultsView.querySelector('.mobileResultsPlaceholder')) {
    const placeholder = document.createElement('section');
    placeholder.className = 'mobileResultsPlaceholder';
    placeholder.innerHTML = `
      ${icons.results}
      <h2>Results</h2>
      <p>Session history and result comparison will arrive here in a later mobile release.</p>
    `;
    resultsView.appendChild(placeholder);
  }

  const orientation = window.matchMedia('(orientation: landscape)');
  const onOrientation = () => setTimeout(requestRedraw, 80);
  if (orientation.addEventListener) orientation.addEventListener('change', onOrientation);
  else orientation.addListener(onOrientation);

  requestRedraw();
})();
