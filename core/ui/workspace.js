(() => {
  const tabButtons = Array.from(document.querySelectorAll("[data-ph-tab]"));
  const pages = Array.from(document.querySelectorAll("[data-ph-page]"));

  function activatePage(key) {
    tabButtons.forEach(button => {
      button.classList.toggle("active", button.dataset.phTab === key);
      button.setAttribute("aria-selected", button.dataset.phTab === key ? "true" : "false");
    });
    pages.forEach(page => page.classList.toggle("active", page.dataset.phPage === key));
  }

  tabButtons.forEach(button => button.addEventListener("click", () => activatePage(button.dataset.phTab)));

  document.querySelectorAll(".ph-list").forEach(list => {
    list.addEventListener("click", event => {
      const item = event.target.closest(".ph-list-item");
      if (!item || !list.contains(item)) return;
      list.querySelectorAll(".ph-list-item").forEach(candidate => candidate.classList.remove("selected"));
      item.classList.add("selected");
    });
  });

  document.querySelectorAll("[data-ph-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.phAction;
      if (action === "toggle-run") {
        const running = button.classList.toggle("active");
        button.textContent = running ? "IN PROGRESS" : "START";
      }
      if (action === "sync") {
        const oldText = button.textContent;
        button.textContent = "SYNCED";
        button.classList.add("active");
        window.setTimeout(() => { button.textContent = oldText; button.classList.remove("active"); }, 1200);
      }
    });
  });
})();
