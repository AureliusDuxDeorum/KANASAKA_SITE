(function () {
  "use strict";

  // Command console: Ctrl/Cmd+K or "/" opens a terminal-styled palette for
  // navigating the site and switching theme / motion. Everything it can do is
  // already available in the UI (nav links, the theme picker, the Motion
  // setting): no admin or API actions, no network calls, nothing is stored.
  // Pages come from the same NAV / FOOTER_COLUMNS lists as the header and
  // footer (window.KanasakaNav, set by main.js), so only real pages appear.

  var overlay = null;
  var panel = null;
  var input = null;
  var list = null;
  var output = null;
  var isOpen = false;
  var restoreFocus = null;
  var selected = 0;
  var shown = [];
  var inertIds = ["site-header", "main-content", "site-footer"];

  function motion() {
    return window.KanasakaMotion || null;
  }

  function pages() {
    var source = window.KanasakaNav || { nav: [], footer: [] };
    var seen = {};
    var result = [];

    function add(label, href) {
      if (!href || seen[href]) return;
      seen[href] = true;
      result.push({ label: label, href: href });
    }

    add("Home", "/");
    (source.nav || []).forEach(function (section) {
      if (section.href) add(section.children ? section.label + " overview" : section.label, section.href);
      (section.children || []).forEach(function (child) {
        add(child.label, child.href);
      });
    });
    (source.footer || []).forEach(function (column) {
      column.links.forEach(function (link) {
        add(link.label, link.href);
      });
    });
    add("Account settings", "/account/settings/");
    return result;
  }

  function go(href) {
    window.location.href = href;
  }

  function say(text, kind) {
    var line = document.createElement("p");
    line.className = "console-line" + (kind ? " console-line--" + kind : "");
    line.textContent = text;
    output.appendChild(line);
    while (output.childNodes.length > 6) output.removeChild(output.firstChild);
    if (kind === "error" && motion()) motion().glitch(panel, 160);
  }

  function entries() {
    var all = [];

    pages().forEach(function (page) {
      all.push({
        key: "go " + page.label.toLowerCase(),
        label: page.label,
        hint: page.href,
        run: function () {
          go(page.href);
        },
      });
    });

    ["dark", "light", "accent"].forEach(function (theme) {
      all.push({
        key: "theme " + theme,
        label: "Theme: " + theme,
        hint: "switch theme",
        run: function () {
          if (window.KanasakaTheme) window.KanasakaTheme.setTheme(theme);
          say("theme set to " + theme);
        },
      });
    });

    ["auto", "full", "reduced", "off"].forEach(function (mode) {
      all.push({
        key: "motion " + mode,
        label: "Motion: " + mode,
        hint: "animation level",
        run: function () {
          if (motion()) motion().setPref(mode);
          say("motion set to " + mode);
        },
      });
    });

    all.push({
      key: "login",
      label: "Log in",
      hint: "account",
      run: function () {
        if (window.KanasakaAuth && window.KanasakaAuth.openAuthModal) {
          close();
          window.KanasakaAuth.openAuthModal("login");
        } else go("/login/");
      },
    });
    all.push({
      key: "register",
      label: "Register",
      hint: "account",
      run: function () {
        if (window.KanasakaAuth && window.KanasakaAuth.openAuthModal) {
          close();
          window.KanasakaAuth.openAuthModal("register");
        } else go("/register/");
      },
    });
    all.push({
      key: "account",
      label: "Account settings",
      hint: "/account/settings/",
      run: function () {
        go("/account/settings/");
      },
    });
    all.push({
      key: "help",
      label: "Help",
      hint: "list commands",
      run: function () {
        say("go <page> | theme dark|light|accent | motion auto|full|reduced|off", "info");
        say("login | register | account | clear | Esc closes", "info");
      },
    });
    all.push({
      key: "clear",
      label: "Clear",
      hint: "clear output",
      run: function () {
        output.textContent = "";
      },
    });
    return all;
  }

  // subsequence match: every typed character must appear in order; earlier and
  // tighter matches rank first. Returns -1 for no match.
  function score(query, text) {
    if (!query) return 0;
    var at = text.indexOf(query);
    if (at !== -1) return at;
    var pos = 0;
    var gaps = 0;
    for (var i = 0; i < query.length; i++) {
      var found = text.indexOf(query.charAt(i), pos);
      if (found === -1) return -1;
      gaps += found - pos;
      pos = found + 1;
    }
    return 100 + gaps;
  }

  function filter() {
    var query = input.value.trim().toLowerCase();
    var ranked = [];
    entries().forEach(function (entry) {
      var s = score(query, entry.key + " " + entry.label.toLowerCase());
      if (s >= 0) ranked.push({ entry: entry, score: s });
    });
    ranked.sort(function (a, b) {
      return a.score - b.score;
    });
    shown = ranked.slice(0, 8).map(function (r) {
      return r.entry;
    });
    selected = Math.min(selected, Math.max(0, shown.length - 1));
    renderList();
  }

  function renderList() {
    list.textContent = "";
    shown.forEach(function (entry, index) {
      var li = document.createElement("li");
      li.id = "console-opt-" + index;
      li.className = "console-option" + (index === selected ? " is-selected" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", index === selected ? "true" : "false");

      var label = document.createElement("span");
      label.className = "console-option-label";
      label.textContent = entry.label;
      var hint = document.createElement("span");
      hint.className = "console-option-hint";
      hint.textContent = entry.hint;
      li.appendChild(label);
      li.appendChild(hint);

      li.addEventListener("pointermove", function () {
        if (selected !== index) {
          selected = index;
          renderList();
        }
      });
      li.addEventListener("click", function () {
        run(entry);
      });
      list.appendChild(li);
    });
    input.setAttribute("aria-activedescendant", shown.length ? "console-opt-" + selected : "");
  }

  function run(entry) {
    if (!entry) {
      say("unknown command: " + input.value.trim() + " (try help)", "error");
      return;
    }
    entry.run();
    if (entry.key.indexOf("go ") === 0 || entry.key === "account") return;
    input.value = "";
    filter();
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "console-overlay";
    overlay.hidden = true;

    panel = document.createElement("div");
    panel.className = "console-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Command console");

    var head = document.createElement("div");
    head.className = "console-head";
    var title = document.createElement("span");
    title.textContent = "//KS_CONSOLE";
    var hint = document.createElement("span");
    hint.className = "console-head-hint";
    hint.textContent = "ESC TO CLOSE";
    head.appendChild(title);
    head.appendChild(hint);

    var row = document.createElement("div");
    row.className = "console-row";
    var prompt = document.createElement("span");
    prompt.className = "console-prompt";
    prompt.setAttribute("aria-hidden", "true");
    prompt.textContent = ">";
    input = document.createElement("input");
    input.className = "console-input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", "Type a page or command");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "console-list");
    input.setAttribute("aria-autocomplete", "list");
    row.appendChild(prompt);
    row.appendChild(input);

    list = document.createElement("ul");
    list.className = "console-list";
    list.id = "console-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Pages and commands");

    output = document.createElement("div");
    output.className = "console-output";
    output.setAttribute("aria-live", "polite");

    panel.appendChild(head);
    panel.appendChild(row);
    panel.appendChild(list);
    panel.appendChild(output);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("pointerdown", function (event) {
      if (event.target === overlay) close();
    });

    input.addEventListener("input", function () {
      selected = 0;
      filter();
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (shown.length) selected = (selected + 1) % shown.length;
        renderList();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (shown.length) selected = (selected - 1 + shown.length) % shown.length;
        renderList();
      } else if (event.key === "Enter") {
        event.preventDefault();
        run(shown[selected]);
      } else if (event.key === "Tab") {
        // the console traps focus: Tab completes the highlighted entry
        event.preventDefault();
        if (shown[selected]) {
          input.value = shown[selected].key;
          filter();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
  }

  function setInert(on) {
    inertIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (on) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
  }

  function open() {
    if (isOpen) return;
    if (!overlay) build();
    isOpen = true;
    restoreFocus = document.activeElement;
    overlay.hidden = false;
    setInert(true);
    input.value = "";
    output.textContent = "";
    selected = 0;
    filter();
    window.requestAnimationFrame(function () {
      overlay.classList.add("is-open");
      input.focus();
      if (motion()) motion().glitch(panel, 140);
    });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("is-open");
    overlay.hidden = true;
    setInert(false);
    if (restoreFocus && restoreFocus.focus) restoreFocus.focus();
  }

  function typing(target) {
    if (!target) return false;
    var tag = (target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  document.addEventListener("keydown", function (event) {
    var key = event.key;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "k" || key === "K")) {
      event.preventDefault();
      if (isOpen) close();
      else open();
      return;
    }
    if (key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isOpen && !typing(event.target)) {
      event.preventDefault();
      open();
    }
  });

  window.KanasakaConsole = { open: open, close: close };
})();
