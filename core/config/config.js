window.JBPerformanceHubConfig = (() => {
  const StorageKey = "jb-performancehub-config-v1";
  const LegacyLibrarianKey = "jb-forceplate-librarian-api";
  const Defaults = Object.freeze({
    librarianApi: "http://100.77.57.39:8787",
    localResultsPath: "Data/Results"
  });

  function read() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(StorageKey) || "{}");
    } catch {
      stored = {};
    }
    const legacyLibrarianApi = localStorage.getItem(LegacyLibrarianKey);
    return {
      ...Defaults,
      ...stored,
      librarianApi: String(stored.librarianApi || legacyLibrarianApi || Defaults.librarianApi).trim()
    };
  }

  function write(next) {
    const value = { ...read(), ...next };
    localStorage.setItem(StorageKey, JSON.stringify(value));
    localStorage.setItem(LegacyLibrarianKey, value.librarianApi);
    window.dispatchEvent(new CustomEvent("jb:config-changed", { detail: value }));
    return value;
  }

  function get(key) { return read()[key]; }
  function set(key, value) { return write({ [key]: value }); }

  return { Defaults, get, read, set, write };
})();
