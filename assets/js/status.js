// Renders /api/status on the System Status page. Text only (textContent), no
// markup from the response is ever inserted.
(function () {
  var summary = document.getElementById("status-summary");
  var list = document.getElementById("status-list");
  var meta = document.getElementById("status-meta");
  if (!summary || !list) return;

  function setBadge(row, text, kind) {
    var badge = row.querySelector(".badge");
    if (!badge) return;
    badge.textContent = text;
    badge.className = "badge" + (kind ? " badge--" + kind : "");
  }

  function setSummary(title, text) {
    var h = summary.querySelector("h3");
    var p = summary.querySelector("p");
    if (h) h.textContent = title;
    if (p) p.textContent = text;
  }

  function unreachable() {
    list.querySelectorAll(".status-row").forEach(function (row) {
      setBadge(row, "Unknown", "warn");
    });
    setSummary("Could not check", "The status endpoint did not answer, so nothing here can be confirmed. Try again in a moment.");
    if (meta) meta.textContent = "Last attempt: " + new Date().toLocaleString() + ".";
  }

  fetch("/api/status", { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("status " + response.status);
      return response.json();
    })
    .then(function (data) {
      var components = Array.isArray(data.components) ? data.components : [];
      var byId = {};
      components.forEach(function (c) {
        byId[String(c.id)] = c.ok === true;
      });
      list.querySelectorAll(".status-row").forEach(function (row) {
        var id = row.getAttribute("data-component");
        if (!(id in byId)) {
          setBadge(row, "Unknown", "warn");
        } else {
          setBadge(row, byId[id] ? "Operational" : "Not responding", byId[id] ? "ok" : "down");
        }
      });
      var allOk = data.status === "operational";
      setSummary(
        allOk ? "All checked systems are answering" : "Some systems are not answering",
        allOk
          ? "Every check below passed when this page loaded."
          : "At least one check below failed when this page loaded. Installers or sign-in may be affected."
      );
      var when = new Date(data.checkedAt);
      if (meta) meta.textContent = "Checked " + (isNaN(when) ? "just now" : when.toLocaleString()) + ". No uptime history is kept.";
    })
    .catch(unreachable);
})();
