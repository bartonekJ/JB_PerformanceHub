(function () {
  const GravityMs2 = 9.80665;
  const LandmarkKeys = ['onset', 'min', 'prop', 'takeoff', 'landing', 'jumpEnd'];
  const DropJumpLandmarkKeys = [
    'dropLanding',
    'impactPeak',
    'contactTrough',
    'startConcentric',
    'driveOffPeak',
    'takeoff',
    'flightLanding',
    'landingPeak',
    'jumpEnd',
  ];

  function finite(value) {
    return Number.isFinite(value);
  }

  function sampleIntervalMs(rows) {
    if (rows.length < 2) return 4;
    const dt = rows[1].t_ms - rows[0].t_ms;
    return finite(dt) && dt > 0 ? dt : 4;
  }

  function prefixKeys(prefix) {
    return {
      net: `${prefix}_net_n`,
      abs: `${prefix}_abs_n`,
    };
  }

  function average(rows, key, start, end) {
    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][key];
      if (finite(value)) {
        sum += value;
        count++;
      }
    }
    return count ? sum / count : NaN;
  }

  function maxIndex(rows, key, start, end) {
    let index = -1;
    let max = -Infinity;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][key];
      if (finite(value) && value > max) {
        max = value;
        index = i;
      }
    }
    return index;
  }

  function minIndex(rows, key, start, end) {
    let index = -1;
    let min = Infinity;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][key];
      if (finite(value) && value < min) {
        min = value;
        index = i;
      }
    }
    return index;
  }

  function maxValue(rows, key, start, end) {
    const index = maxIndex(rows, key, start, end);
    return index >= 0 ? rows[index][key] : NaN;
  }

  function integrate(rows, key, start, end) {
    const dt = sampleIntervalMs(rows) / 1000;
    let impulse = 0;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][key];
      if (finite(value)) impulse += value * dt;
    }
    return impulse;
  }

  function integratePositive(rows, key, start, end) {
    const dt = sampleIntervalMs(rows) / 1000;
    let impulse = 0;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][key];
      if (finite(value) && value > 0) impulse += value * dt;
    }
    return impulse;
  }

  function heightFromVelocityCm(velocity) {
    return finite(velocity)
      ? velocity * velocity * 100 / (2 * GravityMs2)
      : NaN;
  }

  function flightTimeHeightCm(flightMs) {
    return finite(flightMs)
      ? GravityMs2 * Math.pow(flightMs / 1000, 2) * 100 / 8
      : NaN;
  }

  function integrateKinematics(rows, netKey, massKg, start, end, initialVelocity = 0, initialDisplacement = 0) {
    if (!finite(massKg) || massKg <= 1 || start < 0 || end <= start) {
      return { velocity: NaN, displacement: NaN, maxDisplacement: NaN };
    }
    const dt = sampleIntervalMs(rows) / 1000;
    let velocity = initialVelocity;
    let displacement = initialDisplacement;
    let maxDisplacement = displacement;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const force = rows[i][netKey];
      if (!finite(force)) continue;
      velocity += (force / massKg) * dt;
      displacement += velocity * dt;
      if (displacement > maxDisplacement) maxDisplacement = displacement;
    }
    return { velocity, displacement, maxDisplacement };
  }

  function integrateKinematicsBackward(rows, netKey, massKg, start, end, finalVelocity = 0, finalDisplacement = 0) {
    if (!finite(massKg) || massKg <= 1 || start < 0 || end <= start) {
      return { velocity: NaN, displacement: NaN, maxDisplacement: NaN };
    }
    const dt = sampleIntervalMs(rows) / 1000;
    let velocity = finalVelocity;
    let displacement = finalDisplacement;
    let maxDisplacement = displacement;
    for (let i = Math.min(rows.length, end) - 1; i >= Math.max(0, start); i--) {
      const force = rows[i][netKey];
      if (!finite(force)) continue;
      displacement -= velocity * dt;
      velocity -= (force / massKg) * dt;
      if (displacement > maxDisplacement) maxDisplacement = displacement;
    }
    return { velocity, displacement, maxDisplacement };
  }

  function peakPower(rows, absKey, netKey, massKg, start, end) {
    if (!finite(massKg) || massKg <= 1 || start < 0 || end <= start) return NaN;
    const dt = sampleIntervalMs(rows) / 1000;
    let velocity = 0;
    let peak = NaN;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const netForce = rows[i][netKey];
      const absForce = rows[i][absKey];
      if (!finite(netForce) || !finite(absForce)) continue;
      velocity += (netForce / massKg) * dt;
      const power = absForce * velocity;
      if (finite(power) && power > 0 && (!finite(peak) || power > peak)) {
        peak = power;
      }
    }
    return peak;
  }

  function dropJumpPeakPowers(rows, absKey, bodyWeight, massKg, initialVelocity, start, end) {
    if (!finite(bodyWeight) || !finite(massKg) || !finite(initialVelocity) ||
        massKg <= 1 || start < 0 || end <= start) {
      return { braking: NaN, propulsive: NaN };
    }
    const dt = sampleIntervalMs(rows) / 1000;
    let velocity = initialVelocity;
    let brakingPeak = NaN;
    let propulsivePeak = NaN;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const force = rows[i][absKey];
      if (!finite(force)) continue;
      velocity += ((force - bodyWeight) / massKg) * dt;
      const power = force * velocity;
      if (power < 0) {
        const braking = -power;
        if (!finite(brakingPeak) || braking > brakingPeak) brakingPeak = braking;
      } else if (power > 0 && (!finite(propulsivePeak) || power > propulsivePeak)) {
        propulsivePeak = power;
      }
    }
    return { braking: brakingPeak, propulsive: propulsivePeak };
  }

  function bodyWeightN(rows, absKey, marks) {
    const end = marks && marks.onset > 30 ? marks.onset - 10 : Math.min(rows.length, 250);
    const start = Math.max(0, end - 300);
    const ready = average(rows, absKey, start, end);
    if (finite(ready) && ready > 1) return ready;
    return average(rows, absKey, 0, Math.min(rows.length, 250));
  }

  function longestContactFlightSegment(rows, absKey, options, dtMs) {
    const threshold = Math.max(1, options.contactThresholdN ?? 50);
    const sustainSamples = Math.max(1, Math.round((options.sustainMs ?? 20) / dtMs));
    const minSamples = Math.max(sustainSamples, Math.round((options.minFlightMs ?? 80) / dtMs));
    let bestStart = -1;
    let bestEnd = -1;
    let start = -1;

    for (let i = 0; i < rows.length; i++) {
      const value = rows[i][absKey];
      const inFlight = finite(value) && value <= threshold;
      if (inFlight && start < 0) start = i;
      if ((!inFlight || i === rows.length - 1) && start >= 0) {
        const end = inFlight && i === rows.length - 1 ? i : i - 1;
        const length = end - start + 1;
        if (length >= minSamples && length >= sustainSamples && end - start > bestEnd - bestStart) {
          bestStart = start;
          bestEnd = end;
        }
        start = -1;
      }
    }

    return { start: bestStart, end: bestEnd };
  }

  function contactSegments(rows, key, options, dtMs) {
    const threshold = Math.max(1, options.contactThresholdN ?? 50);
    const sustainSamples = Math.max(1, Math.round((options.sustainMs ?? 20) / dtMs));
    const segments = [];
    let start = -1;
    let peak = -Infinity;
    let peakIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      const value = rows[i][key];
      const inContact = finite(value) && value >= threshold;
      if (inContact) {
        if (start < 0) {
          start = i;
          peak = value;
          peakIndex = i;
        }
        if (value > peak) {
          peak = value;
          peakIndex = i;
        }
      } else if (start >= 0) {
        const end = i - 1;
        if (end - start + 1 >= sustainSamples) {
          segments.push({ start, end, peak, peakIndex });
        }
        start = -1;
      }
    }

    if (start >= 0) {
      const end = rows.length - 1;
      if (end - start + 1 >= sustainSamples) {
        segments.push({ start, end, peak, peakIndex });
      }
    }
    return segments;
  }

  function firstZeroCrossingAfter(rows, netKey, start, end) {
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][netKey];
      if (finite(value) && value >= 0) return i;
    }
    return -1;
  }

  function detectJumpEnd(rows, netKey, landingPeak, dtMs, options = {}, activityKeys = [netKey], stabilityKeys = []) {
    if (landingPeak < 0) return -1;
    const stableWindow = Math.max(1, Math.round((options.jumpEndStableMs ?? 320) / dtMs));
    const confirmWindow = Math.max(0, Math.round((options.jumpEndConfirmMs ?? 120) / dtMs));
    const searchEnd = Math.min(rows.length, landingPeak + Math.round((options.jumpEndSearchMs ?? 2500) / dtMs));
    const stableThreshold = Math.max(20, options.jumpEndThresholdN ?? 45);
    const rangeThreshold = Math.max(25, options.jumpEndRangeN ?? 45);
    const balanceRangeThreshold = Math.max(60, options.jumpEndBalanceRangeN ?? rangeThreshold * 2);
    const referenceEnd = searchEnd;
    const referenceStart = Math.max(landingPeak, referenceEnd - stableWindow);
    const allKeys = [...new Set([...activityKeys, ...stabilityKeys])];
    if (!allKeys.length || referenceEnd - referenceStart < Math.max(3, stableWindow / 3)) return -1;

    const reference = new Map();
    for (const key of allKeys) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = referenceStart; i < referenceEnd; i++) {
        const value = rows[i][key];
        if (!finite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      const avg = average(rows, key, referenceStart, referenceEnd);
      if (!finite(avg) || !finite(min) || !finite(max)) return -1;
      reference.set(key, { avg, range: max - min });
    }

    function stableLikeFinal(start) {
      for (const key of allKeys) {
        const isBalanceKey = stabilityKeys.includes(key) && !activityKeys.includes(key);
        const avgThreshold = isBalanceKey ? Math.max(stableThreshold, balanceRangeThreshold) : stableThreshold;
        const localRangeThreshold = isBalanceKey ? balanceRangeThreshold : rangeThreshold;
        const ref = reference.get(key);
        const avg = average(rows, key, start, start + stableWindow);
        if (!finite(avg) || !ref || Math.abs(avg - ref.avg) > avgThreshold) return false;

        let min = Infinity;
        let max = -Infinity;
        for (let j = start; j < start + stableWindow; j++) {
          const value = rows[j][key];
          if (!finite(value)) continue;
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
        if (!finite(min) || !finite(max) || max - min > localRangeThreshold) return false;
      }
      return true;
    }

    let earliestStable = -1;
    for (let i = searchEnd - stableWindow; i >= landingPeak; i--) {
      if (!stableLikeFinal(i)) {
        if (earliestStable >= 0) return Math.min(searchEnd - 1, earliestStable + confirmWindow);
        continue;
      }
      earliestStable = i;
    }

    return earliestStable >= 0 ? Math.min(searchEnd - 1, earliestStable + confirmWindow) : -1;
  }

  function onsetBeforeMin(rows, netKey, min, bodyWeight, dtMs, options) {
    if (min < 0) return -1;
    const window = Math.max(10, Math.round(40 / dtMs));
    const threshold = -Math.max(12, bodyWeight * 0.025);
    const searchMs = Math.max(80, options.onsetSearchMs ?? 450);
    const slopeThreshold = Math.max(1, options.onsetSlopeN ?? 8);
    const sustain = Math.max(window, Math.round((options.onsetSustainMs ?? 80) / dtMs));
    const start = Math.max(0, min - Math.round(searchMs / dtMs));

    for (let i = start + window; i < min - sustain; i++) {
      const value = rows[i][netKey];
      if (!finite(value) || value > threshold) continue;

      const before = average(rows, netKey, i - window, i);
      const after = average(rows, netKey, i, i + window);
      if (!finite(before) || !finite(after) || after > before - slopeThreshold) continue;

      const sustainAverage = average(rows, netKey, i, i + sustain);
      const minValue = rows[min][netKey];
      if (finite(sustainAverage) && finite(minValue) && sustainAverage < threshold && sustainAverage > minValue) {
        return i - window;
      }
    }

    return start;
  }

  function detectVerticalJumpLandmarks(rows, prefix, options = {}) {
    if (!rows.length) return emptyLandmarks();
    const keys = prefixKeys(prefix);
    const dtMs = sampleIntervalMs(rows);
    const bodyWeight = bodyWeightN(rows, keys.abs, null);
    const flight = longestContactFlightSegment(rows, keys.abs, options, dtMs);
    const takeoff = flight.start;
    const landing = flight.end >= 0 ? flight.end + 1 : -1;

    if (takeoff < 0 || landing < 0) {
      return emptyLandmarks();
    }

    const propSearchStart = Math.max(0, takeoff - Math.round(650 / dtMs));
    const peak = maxIndex(rows, keys.net, propSearchStart, takeoff);
    const minSearchStart = Math.max(0, peak - Math.round(450 / dtMs));
    const min = minIndex(rows, keys.net, minSearchStart, peak);
    const prop = firstZeroCrossingAfter(rows, keys.net, min, peak);
    const onset = onsetBeforeMin(rows, keys.net, min, bodyWeight, dtMs, options);
    const landingPeak = maxIndex(rows, keys.abs, landing, Math.min(rows.length, landing + Math.round(350 / dtMs)));
    const jumpEndNetKey = prefix === 'total' ? keys.net : 'total_net_n';
    const jumpEndActivityKeys = [jumpEndNetKey];
    const jumpEndStabilityKeys = prefix === 'total'
      ? ['left_net_n', 'right_net_n']
      : [keys.net];
    const jumpEnd = detectJumpEnd(
      rows,
      jumpEndNetKey,
      landingPeak >= 0 ? landingPeak : landing,
      dtMs,
      options,
      jumpEndActivityKeys,
      jumpEndStabilityKeys,
    );

    return { onset, min, prop, takeoff, landing, jumpEnd };
  }

  function detectDropJumpLandmarks(rows, prefix, options = {}) {
    if (!rows.length) return emptyLandmarks();
    const keys = prefixKeys(prefix);
    const dtMs = sampleIntervalMs(rows);
    const minFlightSamples = Math.max(1, Math.round((options.minFlightMs ?? 80) / dtMs));
    const segments = contactSegments(rows, keys.net, options, dtMs)
      .filter((segment) => segment.peak >= Math.max(100, (options.contactThresholdN ?? 50) * 2));

    for (let i = 0; i < segments.length - 1; i++) {
      const first = segments[i];
      for (let j = i + 1; j < segments.length; j++) {
        const second = segments[j];
        const flightSamples = second.start - first.end - 1;
        if (flightSamples >= minFlightSamples) {
          return refineDropJumpLandmarks(rows, keys, first, second);
        }
      }
    }

    return emptyLandmarks();
  }

  function refineDropJumpLandmarks(rows, keys, first, second) {
    const contactLength = Math.max(1, first.end - first.start + 1);
    const impactEnd = Math.min(first.end + 1, first.start + Math.max(2, Math.round(contactLength * 0.3)));
    const impactPeak = maxIndex(rows, keys.abs, first.start, impactEnd);
    const driveSearchStart = Math.max(impactEnd, impactPeak + 1);
    const driveOffPeak = driveSearchStart < first.end
      ? maxIndex(rows, keys.abs, driveSearchStart, first.end + 1)
      : first.peakIndex;
    const trough = impactPeak >= 0 && driveOffPeak > impactPeak + 1
      ? minIndex(rows, keys.abs, impactPeak + 1, driveOffPeak + 1)
      : -1;
    const dtMs = sampleIntervalMs(rows);
    const landingPeak = maxIndex(rows, keys.abs, second.start, Math.min(rows.length, second.start + Math.round(250 / dtMs)));
    const jumpEnd = detectJumpEnd(rows, keys.net, landingPeak >= 0 ? landingPeak : second.start, dtMs);

    return {
      onset: first.start,
      min: trough,
      prop: driveOffPeak,
      takeoff: first.end + 1,
      landing: second.start,
      dropLanding: first.start,
      impactPeak,
      contactTrough: trough,
      startConcentric: trough,
      driveOffPeak,
      flightLanding: second.start,
      landingPeak,
      jumpEnd,
    };
  }

  function detectLandmarks(rows, prefix, options = {}, discipline = 'squat_jump') {
    if (discipline === 'drop_jump') {
      return detectDropJumpLandmarks(rows, prefix, options);
    }
    return detectVerticalJumpLandmarks(rows, prefix, options);
  }

  function emptyLandmarks() {
    return {
      onset: -1,
      min: -1,
      prop: -1,
      takeoff: -1,
      landing: -1,
      jumpEnd: -1,
      dropLanding: -1,
      impactPeak: -1,
      contactTrough: -1,
      startConcentric: -1,
      driveOffPeak: -1,
      flightLanding: -1,
      landingPeak: -1,
    };
  }

  function computeVerticalJumpMetrics(rows, scope, marks, discipline = 'squat_jump') {
    if (!rows.length || !marks) return [];
    const dt = sampleIntervalMs(rows);
    const bw = bodyWeightN(rows, scope.absKey, marks);
    const massKg = finite(bw) && bw > 1 ? bw / GravityMs2 : NaN;
    const takeoff = marks.takeoff;
    const landing = marks.landing;
    const onset = marks.onset >= 0 ? marks.onset : 0;
    const min = marks.min >= 0 ? marks.min : onset;
    const flightMs = landing > takeoff ? (rows[landing].t_ms - rows[takeoff].t_ms) : NaN;
    const flightHeightCm = flightTimeHeightCm(flightMs);
    const impulseNs = takeoff > onset ? integrate(rows, scope.netKey, onset, takeoff) : NaN;
    const takeoffVelocity = finite(impulseNs) && finite(massKg) && massKg > 1 ? impulseNs / massKg : NaN;
    const tovHeightCm = heightFromVelocityCm(takeoffVelocity);
    const takeoffKinematics = integrateKinematics(rows, scope.netKey, massKg, onset, takeoff);
    const disEnd = marks.jumpEnd > landing ? marks.jumpEnd : landing;
    const disKinematics = integrateKinematicsBackward(
      rows,
      scope.netKey,
      massKg,
      onset,
      disEnd,
    );
    const tovPlusDisplacementCm = finite(takeoffKinematics.displacement) && finite(tovHeightCm)
      ? takeoffKinematics.displacement * 100 + tovHeightCm
      : NaN;
    const disHeightCm = finite(disKinematics.maxDisplacement)
      ? disKinematics.maxDisplacement * 100
      : NaN;
    const standingReferenceValid = discipline === 'countermovement_jump';
    const appliedPropulsiveValid = !standingReferenceValid;
    const propStart = marks.prop >= 0 ? marks.prop : marks.min;
    const propulsiveImpulseNs = takeoff > propStart
      ? integratePositive(rows, scope.netKey, propStart, takeoff)
      : NaN;
    const propulsiveVelocity = finite(propulsiveImpulseNs) && finite(massKg) && massKg > 1
      ? propulsiveImpulseNs / massKg
      : NaN;
    const propulsiveHeightCm = heightFromVelocityCm(propulsiveVelocity);
    const minOnsetBw = bodyWeightN(rows, scope.absKey, { ...marks, onset: min });
    const minOnsetMassKg = finite(minOnsetBw) && minOnsetBw > 1 ? minOnsetBw / GravityMs2 : NaN;
    const takeoffDisplacementVelocity = finite(propulsiveImpulseNs) && finite(minOnsetMassKg) && minOnsetMassKg > 1
      ? propulsiveImpulseNs / minOnsetMassKg
      : NaN;
    const takeoffDisplacementHeightCm = heightFromVelocityCm(takeoffDisplacementVelocity);
    const videoEstimatedHeightCm = finite(propulsiveHeightCm) && propulsiveHeightCm > 0
      ? -90.807 + 36.397 * Math.log(propulsiveHeightCm)
      : NaN;
    const peakPowerW = peakPower(rows, scope.absKey, scope.netKey, massKg, propStart, takeoff);
    const peakPowerPerMass = finite(peakPowerW) && finite(massKg) && massKg > 1
      ? peakPowerW / massKg
      : NaN;
    const takeoffMaxAbs = takeoff > onset ? maxValue(rows, scope.absKey, onset, takeoff) : NaN;
    const landingMaxAbs = landing >= 0 ? maxValue(rows, scope.absKey, landing, landing + Math.round(250 / dt)) : NaN;
    const leftImpulse = takeoff > onset ? integratePositive(rows, 'left_net_n', onset, takeoff) : NaN;
    const rightImpulse = takeoff > onset ? integratePositive(rows, 'right_net_n', onset, takeoff) : NaN;
    const impulseSum = leftImpulse + rightImpulse;
    const asymmetry = scope.asymmetry && impulseSum > 1 ? Math.abs(leftImpulse - rightImpulse) * 100 / impulseSum : NaN;

    return [
      ['__section', 'Impulse Momentum Height'],
      [
        'ToV',
        format(tovHeightCm, 'cm', 1),
        'ToV + D',
        standingReferenceValid ? format(tovPlusDisplacementCm, 'cm', 1) : '-',
        'DIS',
        standingReferenceValid ? format(disHeightCm, 'cm', 1) : '-',
      ],
      ['__section', 'Applied Height'],
      [
        'PROPULSIVE',
        appliedPropulsiveValid ? format(propulsiveHeightCm, 'cm', 1) : '-',
        'TAKEOFF DISPLACEMENT',
        appliedPropulsiveValid ? format(takeoffDisplacementHeightCm, 'cm', 1) : '-',
        'FLIGHT TIME',
        format(flightHeightCm, 'cm', 1),
      ],
      ['__section', 'Primary'],
      ['FLIGHT', format(flightMs, 'ms', 0)],
      ['CONTACT / RSI', '-', 'RSI', '-'],
      ['IMPULSE', format(impulseNs, 'Ns', 0)],
      ['TAKEOFF VELOCITY', format(takeoffVelocity, 'm/s', 2), 'PROPULSIVE', format(propulsiveVelocity, 'm/s', 2)],
      ['HEEL HEIGHT', format(videoEstimatedHeightCm, 'cm', 1)],
      ['PEAK PROPULSIVE POWER', format(peakPowerW, 'W', 0), 'PEAK REL. PROPULSIVE POWER', format(peakPowerPerMass, 'W/kg', 1)],
      ['TAKEOFF FORCE', format(finite(takeoffMaxAbs) && finite(bw) ? takeoffMaxAbs / bw : NaN, 'xBW', 2)],
      ['LANDING FORCE', format(finite(landingMaxAbs) && finite(bw) ? landingMaxAbs / bw : NaN, 'xBW', 2)],
      ['BODYWEIGHT', format(bw, 'N', 0)],
      ['ASYMMETRY', format(asymmetry, '%', 1)],
    ];
  }

  function computeDropJumpMetrics(rows, scope, marks, options = {}) {
    if (!rows.length || !marks) return [];
    const dt = sampleIntervalMs(rows);
    const takeoff = marks.takeoff;
    const landing = marks.landing;
    const onset = marks.onset;
    const min = marks.min >= 0 ? marks.min : marks.contactTrough >= 0 ? marks.contactTrough : onset;
    const boxHeightCm = Number.isFinite(options.boxHeightCm) ? options.boxHeightCm : NaN;
    const boxHeightM = finite(boxHeightCm) ? boxHeightCm / 100 : NaN;
    const contactMs = takeoff > onset ? rows[takeoff].t_ms - rows[onset].t_ms : NaN;
    const flightMs = landing > takeoff ? rows[landing].t_ms - rows[takeoff].t_ms : NaN;
    const heightM = finite(flightMs) ? GravityMs2 * Math.pow(flightMs / 1000, 2) / 8 : NaN;
    const flightHeightCm = finite(heightM) ? heightM * 100 : NaN;
    const rsi = finite(heightM) && finite(contactMs) && contactMs > 0 ? heightM / (contactMs / 1000) : NaN;
    const impactPeakAbs = marks.impactPeak >= 0 ? rows[marks.impactPeak]?.[scope.absKey] : NaN;
    const driveOffPeakAbs = marks.driveOffPeak >= 0 ? rows[marks.driveOffPeak]?.[scope.absKey] : NaN;
    const contactPeakAbs = takeoff > onset ? maxValue(rows, scope.absKey, onset, takeoff) : NaN;
    const landingPeakAbs = marks.landingPeak >= 0 ? rows[marks.landingPeak]?.[scope.absKey] : NaN;
    const landingMaxAbs = landing >= 0 ? maxValue(rows, scope.absKey, landing, landing + Math.round(250 / dt)) : NaN;
    const bw = postLandingBodyWeight(rows, scope.absKey, landing, dt);
    const massKg = finite(bw) && bw > 1 ? bw / GravityMs2 : NaN;
    const contactImpulse = takeoff > onset ? integrateAboveBaseline(rows, scope.absKey, bw, onset, takeoff) : NaN;
    const takeoffVelocity = finite(flightMs) ? GravityMs2 * (flightMs / 1000) / 2 : NaN;
    const touchdownVelocity = finite(takeoffVelocity) && finite(contactImpulse) && finite(massKg) && massKg > 1
      ? takeoffVelocity - contactImpulse / massKg
      : NaN;
    const effectiveDropHeightCm = finite(touchdownVelocity)
      ? touchdownVelocity * touchdownVelocity * 100 / (2 * GravityMs2)
      : NaN;
    const dropRatio = finite(effectiveDropHeightCm) && finite(boxHeightCm) && boxHeightCm > 0
      ? effectiveDropHeightCm / boxHeightCm
      : NaN;
    const touchdownVelocityFromBox = finite(boxHeightM) && boxHeightM > 0
      ? -Math.sqrt(2 * GravityMs2 * boxHeightM)
      : NaN;
    const impulseTakeoffVelocity = finite(touchdownVelocityFromBox) &&
        finite(contactImpulse) && finite(massKg) && massKg > 1
      ? touchdownVelocityFromBox + contactImpulse / massKg
      : NaN;
    const impulseHeightCm = finite(impulseTakeoffVelocity) && impulseTakeoffVelocity > 0
      ? heightFromVelocityCm(impulseTakeoffVelocity)
      : NaN;
    const propStart = dropJumpPropulsiveStart(rows, scope.absKey, bw, massKg, touchdownVelocity, onset, takeoff);
    const propulsiveImpulseNs = propStart >= 0 && takeoff > propStart
      ? integratePositiveAboveBaseline(rows, scope.absKey, bw, propStart, takeoff)
      : NaN;
    const brakingImpulseNs = finite(contactImpulse) && finite(propulsiveImpulseNs)
      ? contactImpulse - propulsiveImpulseNs
      : NaN;
    const propulsiveVelocity = finite(propulsiveImpulseNs) && finite(massKg) && massKg > 1
      ? propulsiveImpulseNs / massKg
      : NaN;
    const propulsiveHeightCm = heightFromVelocityCm(propulsiveVelocity);
    const minContactImpulse = takeoff > min
      ? integrateAboveBaseline(rows, scope.absKey, bw, min, takeoff)
      : NaN;
    const minTouchdownVelocity = finite(takeoffVelocity) && finite(minContactImpulse) && finite(massKg) && massKg > 1
      ? takeoffVelocity - minContactImpulse / massKg
      : NaN;
    const minPropStart = dropJumpPropulsiveStart(rows, scope.absKey, bw, massKg, minTouchdownVelocity, min, takeoff);
    const minPropulsiveImpulseNs = minPropStart >= 0 && takeoff > minPropStart
      ? integratePositiveAboveBaseline(rows, scope.absKey, bw, minPropStart, takeoff)
      : NaN;
    const takeoffDisplacementVelocity = finite(minPropulsiveImpulseNs) && finite(massKg) && massKg > 1
      ? minPropulsiveImpulseNs / massKg
      : NaN;
    const takeoffDisplacementHeightCm = heightFromVelocityCm(takeoffDisplacementVelocity);
    const djPowers = dropJumpPeakPowers(rows, scope.absKey, bw, massKg, touchdownVelocityFromBox, onset, takeoff);
    const brakingPowerPerMass = finite(djPowers.braking) && finite(massKg) && massKg > 1
      ? djPowers.braking / massKg
      : NaN;
    const propulsivePowerPerMass = finite(djPowers.propulsive) && finite(massKg) && massKg > 1
      ? djPowers.propulsive / massKg
      : NaN;
    const leftImpulse = takeoff > onset ? integratePositive(rows, 'left_net_n', onset, takeoff) : NaN;
    const rightImpulse = takeoff > onset ? integratePositive(rows, 'right_net_n', onset, takeoff) : NaN;
    const impulseSum = leftImpulse + rightImpulse;
    const asymmetry = scope.asymmetry && impulseSum > 1 ? Math.abs(leftImpulse - rightImpulse) * 100 / impulseSum : NaN;

    return [
      ['__section', 'Impulse Momentum Height'],
      ['ToV', format(impulseHeightCm, 'cm', 1), 'ToV + D', '-', 'DIS', '-'],
      ['__section', 'Applied Height'],
      ['PROPULSIVE', format(propulsiveHeightCm, 'cm', 1), 'TAKEOFF DISPLACEMENT', format(takeoffDisplacementHeightCm, 'cm', 1), 'FLIGHT TIME', format(flightHeightCm, 'cm', 1)],
      ['__section', 'Primary'],
      ['FLIGHT', format(flightMs, 'ms', 0)],
      ['CONTACT / RSI', format(contactMs, 'ms', 0), 'RSI', format(rsi, 'm/s', 2)],
      ['ASYMMETRY', format(asymmetry, '%', 1)],
      ['PEAK FORCE', format(finite(contactPeakAbs) && finite(bw) ? contactPeakAbs / bw : NaN, 'xBW', 2)],
      ['LANDING FORCE', format(finite(landingPeakAbs || landingMaxAbs) && finite(bw) ? (landingPeakAbs || landingMaxAbs) / bw : NaN, 'xBW', 2)],
      ['__section', 'Drop Jump Technique'],
      ['BOX HEIGHT', format(boxHeightCm, 'cm', 1)],
      ['EFFECTIVE DROP', format(effectiveDropHeightCm, 'cm', 1), 'DROP RATIO', format(dropRatio, '', 2)],
      ['IMPACT PEAK', format(finite(impactPeakAbs) && finite(bw) ? impactPeakAbs / bw : NaN, 'xBW', 2)],
      ['DRIVE-OFF PEAK', format(finite(driveOffPeakAbs) && finite(bw) ? driveOffPeakAbs / bw : NaN, 'xBW', 2)],
      ['CONTACT IMPULSE', format(contactImpulse, 'Ns', 0)],
      ['BRAKING IMPULSE', format(brakingImpulseNs, 'Ns', 0), 'PROPULSIVE', format(propulsiveImpulseNs, 'Ns', 0)],
      ['TAKEOFF VELOCITY', format(takeoffVelocity, 'm/s', 2), 'IMPULSE BOX', format(impulseTakeoffVelocity, 'm/s', 2)],
      ['PEAK BRAKING POWER', format(djPowers.braking, 'W', 0), 'W/BM', format(brakingPowerPerMass, 'W/kg', 1)],
      ['PEAK PROPULSIVE POWER', format(djPowers.propulsive, 'W', 0), 'W/BM', format(propulsivePowerPerMass, 'W/kg', 1)],
      ['BODYWEIGHT', format(bw, 'N', 0)],
    ];
  }

  function integrateAboveBaseline(rows, key, baseline, start, end) {
    if (!finite(baseline)) return NaN;
    const dt = sampleIntervalMs(rows) / 1000;
    let impulse = 0;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][key];
      if (finite(value)) impulse += (value - baseline) * dt;
    }
    return impulse;
  }

  function integratePositiveAboveBaseline(rows, key, baseline, start, end) {
    if (!finite(baseline)) return NaN;
    const dt = sampleIntervalMs(rows) / 1000;
    let impulse = 0;
    for (let i = Math.max(0, start); i < Math.min(rows.length, end); i++) {
      const value = rows[i][key];
      if (finite(value) && value > baseline) impulse += (value - baseline) * dt;
    }
    return impulse;
  }

  function dropJumpPropulsiveStart(rows, absKey, bodyWeight, massKg, touchdownVelocity, onset, takeoff) {
    if (!finite(bodyWeight) || !finite(massKg) || !finite(touchdownVelocity) ||
        massKg <= 1 || onset < 0 || takeoff <= onset) {
      return -1;
    }
    const dt = sampleIntervalMs(rows) / 1000;
    let velocity = touchdownVelocity;
    let minVelocity = velocity;
    let minIndex = onset;
    const velocities = [];
    for (let i = onset; i < takeoff; i++) {
      const force = rows[i][absKey];
      if (finite(force)) {
        velocity += ((force - bodyWeight) / massKg) * dt;
        if (velocity < minVelocity) {
          minVelocity = velocity;
          minIndex = i;
        }
      }
      velocities[i] = velocity;
    }
    for (let i = minIndex; i < takeoff; i++) {
      if (finite(velocities[i]) && velocities[i] >= 0) {
        return i;
      }
    }
    return minIndex;
  }

  function postLandingBodyWeight(rows, absKey, landing, dtMs) {
    if (landing < 0) return NaN;
    const settleStart = landing + Math.round(1200 / dtMs);
    const settleEnd = Math.min(rows.length, settleStart + Math.round(2500 / dtMs));
    const settled = average(rows, absKey, settleStart, settleEnd);
    if (finite(settled) && settled > 1) return settled;
    return average(rows, absKey, Math.max(0, rows.length - Math.round(2000 / dtMs)), rows.length);
  }

  function computeMetrics(rows, scope, marks, discipline = 'squat_jump', options = {}) {
    if (discipline === 'drop_jump') {
      return computeDropJumpMetrics(rows, scope, marks, options);
    }
    return computeVerticalJumpMetrics(rows, scope, marks, discipline);
  }

  function format(value, unit, decimals) {
    if (!finite(value)) return '-';
    return unit ? `${value.toFixed(decimals)} ${unit}` : value.toFixed(decimals);
  }

  window.TraceEngine = {
    LandmarkKeys,
    landmarkKeys: (discipline) => discipline === 'drop_jump' ? DropJumpLandmarkKeys : LandmarkKeys,
    detectLandmarks,
    computeMetrics,
    maxValue,
    sampleIntervalMs,
  };
})();
