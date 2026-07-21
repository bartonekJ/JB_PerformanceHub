(() => {
  const config = window.JBPerformanceHubConfig;
  const state = { athletes: [], categories: [], health: null, editingAthleteId: 0 };
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
      const haystack = [athlete.athleteId, athlete.displayName, athlete.firstName, athlete.lastName, athlete.category, athlete.jerseyNumber, athlete.number, athlete.bodyMassKg].join(" ").toLowerCase();
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
      return `<tr><td>${escapeHtml(athlete.athleteId)}</td><td><strong>${escapeHtml(athlete.displayName || athlete.lastName || fullName)}</strong></td><td>${escapeHtml(fullName)}</td><td>${escapeHtml(athlete.category || "")}</td><td>${escapeHtml(jersey)}</td><td>${escapeHtml(bodyMass)}</td><td><button class="ph-danger-compact" type="button" data-edit-athlete="${escapeHtml(athlete.athleteId)}">Edit</button> <button class="ph-danger-compact" type="button" data-delete-athlete="${escapeHtml(athlete.athleteId)}">Delete</button></td></tr>`;
    }).join("");
  }

  function render() {
    renderCategories();
    renderAthletes();
  }

  function resetAthleteEditor() {
    state.editingAthleteId = 0;
    byId("athleteForm").reset();
    byId("athleteSubmit").textContent = "ADD ATHLETE";
    byId("athleteCancelEdit").classList.add("hidden");
  }

  function beginAthleteEdit(athleteId) {
    const athlete = state.athletes.find(item => String(item.athleteId) === String(athleteId));
    if (!athlete) return;
    state.editingAthleteId = Number(athlete.athleteId) || 0;
    byId("athleteFirstName").value = athlete.firstName || "";
    byId("athleteLastName").value = athlete.lastName || "";
    byId("athleteDisplayName").value = athlete.displayName || "";
    byId("athleteCategory").value = athlete.category || "";
    byId("athleteJersey").value = athlete.jerseyNumber || athlete.number || "";
    byId("athleteBodyMass").value = Number(athlete.bodyMassKg) >= 10 ? Number(athlete.bodyMassKg) : "";
    byId("athletePhotoId").value = athlete.photoId || "";
    byId("athleteSubmit").textContent = "SAVE CHANGES";
    byId("athleteCancelEdit").classList.remove("hidden");
    byId("athleteFirstName").focus();
    byId("athleteForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
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
      await request(path, {
        method: state.editingAthleteId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
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

  const current = config.read();
  byId("librarianApiInput").value = current.librarianApi;
  byId("localResultsPath").value = current.localResultsPath;
  refresh().catch(() => {});
})();
