(() => {
  const config = window.JBPerformanceHubConfig;
  const state = {
    athletes: [],
    categories: [],
    health: null,
    editingAthleteId: 0,
    pendingPhoto: null,
    removePhoto: false,
    photoEditor: null,
    cameraStream: null,
  };
  const byId = id => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function apiUrl(path) {
    const base = String(config.get("librarianApi") || "").replace(/\/$/, "");
    return `${base}${path}`;
  }

  async function request(path, options = {}) {
    const response = await fetch(apiUrl(path), {
      ...options,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }

  function categoryLabel(category) {
    return String(category?.displayName || category?.name || category?.categoryId || "");
  }

  function setConnection(message, connected, detail = "") {
    const status = byId("librarianConnectionStatus");
    status.textContent = message;
    status.classList.toggle("offline", !connected);
    const box = byId("librarianDetail");
    box.classList.toggle("error", !connected);
    box.innerHTML = `<strong>${escapeHtml(message)}</strong><small>${escapeHtml(detail)}</small>`;
  }

  function genericPortrait() {
    return byId("athleteSex").value === "female"
      ? "../forceplates/assets/athletes/AF_Portrait.jpg"
      : "../forceplates/assets/athletes/AM_Portrait.jpg";
  }

  function photoUrl(photoId, variant = "thumb-128") {
    return photoId ? apiUrl(`/api/photos/${encodeURIComponent(photoId)}/${variant}.webp`) : genericPortrait();
  }

  function currentEditedAthlete() {
    return state.athletes.find(athlete => Number(athlete.athleteId) === state.editingAthleteId) || null;
  }

  function updateAthletePhotoEditor() {
    const athlete = currentEditedAthlete();
    const preview = byId("athletePhotoPreview");
    const photoId = state.removePhoto ? "" : String(athlete?.photoId || byId("athletePhotoId").value || "");
    preview.onerror = () => {
      preview.onerror = null;
      preview.src = genericPortrait();
    };
    preview.src = state.pendingPhoto?.previewData || photoUrl(photoId);
    byId("athletePhotoStatus").textContent = state.pendingPhoto
      ? "New aligned photo ready — save athlete to upload"
      : state.removePhoto
        ? "Photo will be removed when athlete is saved"
        : photoId
          ? "Custom Librarian photo"
          : "No custom photo";
    byId("athleteRemovePhoto").disabled = !state.pendingPhoto && !photoId;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Photo could not be decoded by PerformanceHub"));
      image.src = source;
    });
  }

  async function normalizePhotoSource(source) {
    const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
    try {
      const image = await loadImage(objectUrl || source);
      // Keep enough source detail for a tight portrait crop when the athlete is
      // photographed from farther away. Librarian still stores compact variants.
      const maximum = 4096;
      const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#202020";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.94);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  function setCropControlsFromEditor() {
    const editor = state.photoEditor;
    if (!editor) return;
    byId("photoCropX").value = String(editor.crop.centerX / editor.width * 100);
    byId("photoCropY").value = String(editor.crop.centerY / editor.height * 100);
    byId("photoCropZoom").value = String(editor.baseCrop.size / editor.crop.size * 100);
    byId("photoCropRotation").value = String(editor.crop.rotationDeg);
  }

  function syncCropFromControls() {
    const editor = state.photoEditor;
    if (!editor) return;
    editor.crop.centerX = Number(byId("photoCropX").value) / 100 * editor.width;
    editor.crop.centerY = Number(byId("photoCropY").value) / 100 * editor.height;
    editor.crop.size = editor.baseCrop.size / Math.max(0.5, Number(byId("photoCropZoom").value) / 100);
    editor.crop.rotationDeg = Number(byId("photoCropRotation").value);
    renderPhotoCrop();
  }

  function renderPhotoCrop() {
    const editor = state.photoEditor;
    if (!editor) return;
    const canvas = byId("photoCropCanvas");
    const context = canvas.getContext("2d", { alpha: false });
    context.save();
    context.fillStyle = "#202020";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-editor.crop.rotationDeg * Math.PI / 180);
    const scale = canvas.width / editor.crop.size;
    context.scale(scale, scale);
    context.drawImage(editor.image, -editor.crop.centerX, -editor.crop.centerY);
    context.restore();
    byId("photoCropXValue").textContent = `${Math.round(editor.crop.centerX)} px`;
    byId("photoCropYValue").textContent = `${Math.round(editor.crop.centerY)} px`;
    byId("photoCropZoomValue").textContent = `${Math.round(Number(byId("photoCropZoom").value))}%`;
    byId("photoCropRotationValue").textContent = `${editor.crop.rotationDeg.toFixed(1)}°`;
  }

  function closePhotoCrop() {
    byId("photoCropModal").classList.add("hidden");
    state.photoEditor = null;
  }

  async function openPhotoCrop(imageData) {
    byId("athletePhotoStatus").textContent = "OpenCV is analyzing the photo…";
    const image = await loadImage(imageData);
    let analysis = null;
    let analysisError = null;
    try {
      analysis = await request("/api/photos/analyze", {
        method: "POST",
        body: JSON.stringify({ imageData }),
      });
    } catch (error) {
      analysisError = error;
    }
    const width = Number(analysis?.width || image.naturalWidth) || 1;
    const height = Number(analysis?.height || image.naturalHeight) || 1;
    const baseCrop = analysis?.crop
      ? { ...analysis.crop }
      : {
          centerX: width / 2,
          centerY: height / 2,
          size: Math.min(width, height),
          rotationDeg: 0,
          detected: false,
          confidence: 0,
        };
    state.photoEditor = {
      image,
      imageData,
      width,
      height,
      baseCrop,
      crop: { ...baseCrop },
    };
    setCropControlsFromEditor();
    byId("photoDetectionStatus").textContent = analysisError
      ? `OpenCV unavailable · manual crop ready (${analysisError.message})`
      : baseCrop.detected
        ? `OpenCV aligned a face · confidence ${Math.round(baseCrop.confidence * 100)}%`
        : "No reliable face detected · centered crop prepared for manual adjustment";
    byId("photoCropModal").classList.remove("hidden");
    renderPhotoCrop();
  }

  async function preparePhotoSource(source) {
    try {
      const imageData = await normalizePhotoSource(source);
      await openPhotoCrop(imageData);
    } catch (error) {
      setConnection("Photo preparation failed", false, error.message);
      updateAthletePhotoEditor();
    }
  }

  function stopCamera() {
    state.cameraStream?.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
    byId("photoCameraVideo").srcObject = null;
  }

  function closeCamera() {
    stopCamera();
    byId("photoCameraModal").classList.add("hidden");
  }

  async function startCamera(deviceId = "") {
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera API is available on this PC");
    const constraints = {
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        resizeMode: "none",
      },
    };
    byId("photoCameraStatus").textContent = "Requesting Windows camera permission…";
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.cameraStream = stream;
    const track = stream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() || {};
    if (track?.applyConstraints && capabilities.width?.max && capabilities.height?.max) {
      try {
        await track.applyConstraints({
          width: { ideal: Math.min(4096, capabilities.width.max) },
          height: { ideal: Math.min(4096, capabilities.height.max) },
        });
      } catch (error) {
        console.warn("Camera kept its negotiated resolution", error);
      }
    }
    byId("photoCameraVideo").srcObject = stream;
    await byId("photoCameraVideo").play();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
    const select = byId("photoCameraSelect");
    const cameraSettings = track?.getSettings?.() || {};
    const activeId = cameraSettings.deviceId || deviceId;
    select.innerHTML = devices.map((device, index) => `<option value="${escapeHtml(device.deviceId)}">${escapeHtml(device.label || `Camera ${index + 1}`)}</option>`).join("");
    if (activeId) select.value = activeId;
    const width = Number(cameraSettings.width || byId("photoCameraVideo").videoWidth) || 0;
    const height = Number(cameraSettings.height || byId("photoCameraVideo").videoHeight) || 0;
    const resolution = width && height ? ` · ${width} × ${height}` : "";
    byId("photoCameraStatus").textContent = `${devices.length || 1} camera${devices.length === 1 ? "" : "s"} available${resolution}`;
  }

  async function openCamera() {
    byId("photoCameraModal").classList.remove("hidden");
    try {
      await startCamera();
    } catch (error) {
      byId("photoCameraStatus").textContent = error.message;
      setConnection("Camera unavailable", false, error.message);
    }
  }

  function renderCategories() {
    const labels = state.categories.map(categoryLabel).filter(Boolean);
    byId("categoryCount").textContent = String(labels.length);
    byId("athleteCategory").innerHTML = '<option value="">No category</option>' + labels.map(label => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("");
    byId("rosterCategoryFilter").innerHTML = '<option value="">All categories</option>' + labels.map(label => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("");
    byId("categoryList").innerHTML = state.categories.map(category => {
      const label = categoryLabel(category);
      const id = category.categoryId || label;
      const athletes = state.athletes.filter(athlete => athlete.category === label).length;
      return `<div class="ph-list-item"><span><strong>${escapeHtml(label)}</strong><small>${athletes} athlete(s)</small></span><button class="ph-danger-compact" type="button" data-delete-category="${escapeHtml(id)}">Delete</button></div>`;
    }).join("") || '<div class="ph-empty">No categories.</div>';
  }

  function filteredAthletes() {
    const category = byId("rosterCategoryFilter").value;
    const query = byId("rosterSearch").value.trim().toLowerCase();
    return state.athletes.filter(athlete => {
      if (category && athlete.category !== category) return false;
      const haystack = [athlete.athleteId, athlete.displayName, athlete.firstName, athlete.lastName, athlete.category, athlete.jerseyNumber, athlete.number, athlete.position, athlete.positionClass, athlete.shoots, athlete.dateOfBirth, athlete.heightCm, athlete.sex, athlete.bodyMassKg].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function renderAthletes() {
    const athletes = filteredAthletes();
    byId("rosterCount").textContent = `${state.athletes.length} athletes | ${athletes.length} shown`;
    byId("rosterEmpty").hidden = athletes.length > 0;
    byId("athleteTableBody").innerHTML = athletes.map(athlete => {
      const fullName = [athlete.firstName, athlete.lastName].filter(Boolean).join(" ");
      const jersey = athlete.jerseyNumber || athlete.number || "";
      const bodyMass = Number(athlete.bodyMassKg) >= 10 ? `${Number(athlete.bodyMassKg).toFixed(1)} kg` : "--";
      const height = Number(athlete.heightCm) > 0 ? `${Number(athlete.heightCm).toFixed(Number(athlete.heightCm) % 1 ? 1 : 0)} cm` : "--";
      const position = [athlete.position, athlete.positionClass].filter(Boolean).join(" · ");
      const profilePrimary = [position, athlete.shoots ? `Shoots ${athlete.shoots}` : "", athlete.sex].filter(Boolean).join(" · ") || "--";
      const profileSecondary = [athlete.dateOfBirth, height].filter(value => value && value !== "--").join(" · ");
      return `<tr><td>${escapeHtml(athlete.athleteId)}</td><td><strong>${escapeHtml(athlete.displayName || athlete.lastName || fullName)}</strong></td><td>${escapeHtml(fullName)}</td><td>${escapeHtml(athlete.category || "")}</td><td>${escapeHtml(jersey)}</td><td><strong>${escapeHtml(profilePrimary)}</strong>${profileSecondary ? `<br><small>${escapeHtml(profileSecondary)}</small>` : ""}</td><td>${escapeHtml(bodyMass)}</td><td><button class="ph-danger-compact" type="button" data-edit-athlete="${escapeHtml(athlete.athleteId)}">Edit</button> <button class="ph-danger-compact" type="button" data-delete-athlete="${escapeHtml(athlete.athleteId)}">Delete</button></td></tr>`;
    }).join("");
  }

  function render() {
    renderCategories();
    renderAthletes();
  }

  function resetAthleteEditor() {
    state.editingAthleteId = 0;
    state.pendingPhoto = null;
    state.removePhoto = false;
    byId("athleteForm").reset();
    byId("athleteSex").value = "male";
    byId("athletePhotoId").value = "";
    byId("athleteSubmit").textContent = "ADD ATHLETE";
    byId("athleteCancelEdit").classList.add("hidden");
    updateAthletePhotoEditor();
  }

  function beginAthleteEdit(athleteId) {
    const athlete = state.athletes.find(item => String(item.athleteId) === String(athleteId));
    if (!athlete) return;
    state.editingAthleteId = Number(athlete.athleteId) || 0;
    state.pendingPhoto = null;
    state.removePhoto = false;
    byId("athleteFirstName").value = athlete.firstName || "";
    byId("athleteLastName").value = athlete.lastName || "";
    byId("athleteDisplayName").value = athlete.displayName || "";
    byId("athleteCategory").value = athlete.category || "";
    byId("athleteJersey").value = athlete.jerseyNumber || athlete.number || "";
    byId("athletePosition").value = athlete.position || "";
    byId("athleteShoots").value = athlete.shoots || "";
    byId("athleteSex").value = String(athlete.sex || athlete.gender || "male").toLowerCase();
    byId("athleteDateOfBirth").value = athlete.dateOfBirth || athlete.birthDate || "";
    byId("athleteHeight").value = Number(athlete.heightCm) > 0 ? Number(athlete.heightCm) : "";
    byId("athleteBodyMass").value = Number(athlete.bodyMassKg) >= 10 ? Number(athlete.bodyMassKg) : "";
    byId("athletePhotoId").value = athlete.photoId || "";
    byId("athleteSubmit").textContent = "SAVE CHANGES";
    byId("athleteCancelEdit").classList.remove("hidden");
    byId("athleteFirstName").focus();
    byId("athleteForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
    updateAthletePhotoEditor();
  }

  async function refresh() {
    config.write({
      librarianApi: byId("librarianApiInput").value.trim(),
      localResultsPath: byId("localResultsPath").value.trim()
    });
    setConnection("Connecting...", false, config.get("librarianApi"));
    try {
      const [health, athletes, categories] = await Promise.all([
        request("/api/health"), request("/api/athletes"), request("/api/categories")
      ]);
      state.health = health;
      state.athletes = athletes.athletes || [];
      state.categories = categories.categories || [];
      render();
      setConnection("Librarian online", true, `${state.athletes.length} athletes, ${state.categories.length} categories`);
    } catch (error) {
      setConnection("Librarian offline", false, error.message);
      throw error;
    }
  }

  byId("connectLibrarian").addEventListener("click", () => refresh().catch(() => {}));
  byId("systemRefresh").addEventListener("click", () => refresh().catch(() => {}));
  byId("refreshRoster").addEventListener("click", () => refresh().catch(() => {}));
  byId("rosterSearch").addEventListener("input", renderAthletes);
  byId("rosterCategoryFilter").addEventListener("change", renderAthletes);
  byId("athleteCancelEdit").addEventListener("click", resetAthleteEditor);

  byId("athleteForm").addEventListener("submit", async event => {
    event.preventDefault();
    const existing = state.athletes.find(athlete => Number(athlete.athleteId) === state.editingAthleteId);
    const enteredMass = byId("athleteBodyMass").value ? Number(byId("athleteBodyMass").value) : null;
    const massChanged = Boolean(existing) && Number(existing.bodyMassKg || 0) !== Number(enteredMass || 0);
    const payload = {
      firstName: byId("athleteFirstName").value.trim(),
      lastName: byId("athleteLastName").value.trim(),
      displayName: byId("athleteDisplayName").value.trim(),
      category: byId("athleteCategory").value,
      jerseyNumber: byId("athleteJersey").value.trim(),
      position: byId("athletePosition").value,
      shoots: byId("athleteShoots").value,
      sex: byId("athleteSex").value,
      dateOfBirth: byId("athleteDateOfBirth").value,
      heightCm: byId("athleteHeight").value ? Number(byId("athleteHeight").value) : null,
      bodyMassKg: enteredMass,
      bodyMassMeasuredAt: existing && !massChanged
        ? Number(existing.bodyMassMeasuredAt) || 0
        : enteredMass ? Date.now() : 0,
      bodyMassSource: existing && !massChanged
        ? existing.bodyMassSource || ""
        : enteredMass ? "manual" : "",
      photoId: byId("athletePhotoId").value.trim()
    };
    try {
      const path = state.editingAthleteId
        ? `/api/athletes/${state.editingAthleteId}`
        : "/api/athletes";
      const saved = await request(path, {
        method: state.editingAthleteId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      const savedAthleteId = Number(saved.athlete?.athleteId || state.editingAthleteId || 0);
      if (savedAthleteId && state.removePhoto) {
        await request(`/api/athletes/${savedAthleteId}/photo`, { method: "DELETE" });
      } else if (savedAthleteId && state.pendingPhoto) {
        await request(`/api/athletes/${savedAthleteId}/photo`, {
          method: "PUT",
          body: JSON.stringify({ imageData: state.pendingPhoto.imageData, crop: state.pendingPhoto.crop }),
        });
      }
      resetAthleteEditor();
      await refresh();
    } catch (error) { setConnection("Athlete update failed", false, error.message); }
  });

  byId("categoryForm").addEventListener("submit", async event => {
    event.preventDefault();
    const displayName = byId("categoryName").value.trim();
    if (!displayName) return;
    try {
      await request("/api/categories", { method: "POST", body: JSON.stringify({ displayName }) });
      event.currentTarget.reset();
      await refresh();
    } catch (error) { setConnection("Category update failed", false, error.message); }
  });

  byId("athleteTableBody").addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-athlete]");
    if (editButton) {
      beginAthleteEdit(editButton.dataset.editAthlete);
      return;
    }
    const button = event.target.closest("[data-delete-athlete]");
    if (!button) return;
    const confirmed = await window.PerformanceHubDialog.confirm({
      title: 'Delete athlete?',
      message: button.dataset.deleteAthlete,
      confirmLabel: 'DELETE',
      destructive: true,
    });
    if (!confirmed) return;
    try { await request(`/api/athletes/${button.dataset.deleteAthlete}`, { method: "DELETE" }); await refresh(); }
    catch (error) { setConnection("Athlete delete failed", false, error.message); }
  });

  byId("categoryList").addEventListener("click", async event => {
    const button = event.target.closest("[data-delete-category]");
    if (!button) return;
    const confirmed = await window.PerformanceHubDialog.confirm({
      title: 'Delete category?',
      message: `${button.dataset.deleteCategory}\n\nAthletes are not deleted.`,
      confirmLabel: 'DELETE',
      destructive: true,
    });
    if (!confirmed) return;
    try { await request(`/api/categories/${encodeURIComponent(button.dataset.deleteCategory)}`, { method: "DELETE" }); await refresh(); }
    catch (error) { setConnection("Category delete failed", false, error.message); }
  });

  byId("athleteSex").addEventListener("change", () => {
    if (!state.pendingPhoto && !byId("athletePhotoId").value) updateAthletePhotoEditor();
  });

  byId("athleteChoosePhoto").addEventListener("click", () => byId("athletePhotoFile").click());
  byId("athletePhotoFile").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setConnection("Photo is too large", false, "Choose a photo smaller than 20 MB");
      return;
    }
    const source = URL.createObjectURL(file);
    try { await preparePhotoSource(source); }
    finally { URL.revokeObjectURL(source); }
  });

  byId("athleteUseCamera").addEventListener("click", openCamera);
  byId("athleteRemovePhoto").addEventListener("click", async () => {
    const athlete = currentEditedAthlete();
    if (athlete?.photoId) {
      const confirmed = await window.PerformanceHubDialog.confirm({
        title: "Remove athlete photo?",
        message: "The generic Male/Female portrait will be used after the athlete is saved.",
        confirmLabel: "REMOVE",
        destructive: true,
      });
      if (!confirmed) return;
    }
    state.pendingPhoto = null;
    state.removePhoto = Boolean(athlete?.photoId || byId("athletePhotoId").value);
    updateAthletePhotoEditor();
  });

  ["photoCropX", "photoCropY", "photoCropZoom", "photoCropRotation"].forEach(id => {
    byId(id).addEventListener("input", syncCropFromControls);
  });
  byId("photoCropReset").addEventListener("click", () => {
    if (!state.photoEditor) return;
    state.photoEditor.crop = { ...state.photoEditor.baseCrop };
    setCropControlsFromEditor();
    renderPhotoCrop();
  });
  ["photoCropClose", "photoCropCancel"].forEach(id => byId(id).addEventListener("click", closePhotoCrop));
  byId("photoCropApply").addEventListener("click", () => {
    if (!state.photoEditor) return;
    const previewData = byId("photoCropCanvas").toDataURL("image/webp", 0.84);
    state.pendingPhoto = {
      imageData: state.photoEditor.imageData,
      crop: { ...state.photoEditor.crop },
      previewData,
    };
    state.removePhoto = false;
    closePhotoCrop();
    updateAthletePhotoEditor();
  });

  let cropDrag = null;
  byId("photoCropCanvas").addEventListener("pointerdown", event => {
    if (!state.photoEditor) return;
    cropDrag = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  byId("photoCropCanvas").addEventListener("pointermove", event => {
    if (!cropDrag || !state.photoEditor) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const dx = event.clientX - cropDrag.x;
    const dy = event.clientY - cropDrag.y;
    cropDrag = { x: event.clientX, y: event.clientY };
    const pixelsPerCssPixel = state.photoEditor.crop.size / Math.max(1, rect.width);
    state.photoEditor.crop.centerX -= dx * pixelsPerCssPixel;
    state.photoEditor.crop.centerY -= dy * pixelsPerCssPixel;
    setCropControlsFromEditor();
    renderPhotoCrop();
  });
  ["pointerup", "pointercancel"].forEach(type => byId("photoCropCanvas").addEventListener(type, () => { cropDrag = null; }));
  byId("photoCropCanvas").addEventListener("wheel", event => {
    if (!state.photoEditor) return;
    event.preventDefault();
    const control = byId("photoCropZoom");
    control.value = String(Math.min(300, Math.max(50, Number(control.value) + (event.deltaY < 0 ? 8 : -8))));
    syncCropFromControls();
  }, { passive: false });

  ["photoCameraClose", "photoCameraCancel"].forEach(id => byId(id).addEventListener("click", closeCamera));
  byId("photoCameraSelect").addEventListener("change", event => {
    startCamera(event.target.value).catch(error => {
      byId("photoCameraStatus").textContent = error.message;
    });
  });
  byId("photoCameraCapture").addEventListener("click", async () => {
    const video = byId("photoCameraVideo");
    if (!video.videoWidth || !video.videoHeight) return;
    const track = state.cameraStream?.getVideoTracks?.()[0];
    if (track && window.ImageCapture) {
      try {
        byId("photoCameraStatus").textContent = "Capturing native camera photo…";
        const blob = await new ImageCapture(track).takePhoto();
        if (blob?.size) {
          const imageData = await normalizePhotoSource(blob);
          await openPhotoCrop(imageData);
          closeCamera();
          return;
        }
      } catch (error) {
        console.warn("Native camera photo unavailable; using the video frame", error);
      }
    }
    const maximum = 4096;
    const scale = Math.min(1, maximum / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/jpeg", 0.94);
    closeCamera();
    await openPhotoCrop(imageData).catch(error => setConnection("Camera photo failed", false, error.message));
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!byId("photoCameraModal").classList.contains("hidden")) closeCamera();
    else if (!byId("photoCropModal").classList.contains("hidden")) closePhotoCrop();
  });

  const current = config.read();
  byId("librarianApiInput").value = current.librarianApi;
  byId("localResultsPath").value = current.localResultsPath;
  byId("athleteUseCamera").hidden = !navigator.mediaDevices?.getUserMedia;
  updateAthletePhotoEditor();
  refresh().catch(() => {});
})();
