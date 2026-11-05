(function () {
  "use strict";

  // KS_Site terminal: a small cmd-style shell over the site. The "//" in the
  // header (or Ctrl/Cmd+K, or "/") opens it. The site is its file system:
  // every real page is an entry under KSS:\ (the same pages as the nav and
  // footer, from window.KanasakaNav), so `dir`, `cd`, `tree` and `start` work
  // the way they do in cmd. Everything it can do is already available in the
  // UI: no admin or API actions, no network calls, nothing stored.

  var ROOT = "KSS:";

  var overlay = null;
  var term = null;
  var screen = null;
  var input = null;
  var promptEl = null;
  var isOpen = false;
  var restoreFocus = null;
  var cwd = []; // path segments below the root
  var history = [];
  var historyIndex = 0;
  var inertIds = ["site-header", "main-content", "site-footer"];

  function motion() {
    return window.KanasakaMotion || null;
  }

  // ── the site as a file system ────────────────────────────────────────────
  function pages() {
    var source = window.KanasakaNav || { nav: [], footer: [] };
    var seen = {};
    var result = [{ label: "Home", href: "/" }];
    seen["/"] = true;

    function add(label, href) {
      if (!href || seen[href]) return;
      seen[href] = true;
      result.push({ label: label, href: href });
    }

    (source.nav || []).forEach(function (section) {
      if (section.href) add(section.label, section.href);
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

  function buildTree() {
    var root = { name: "", children: {}, href: "/", label: "Home" };
    pages().forEach(function (page) {
      var node = root;
      page.href
        .split("/")
        .filter(Boolean)
        .forEach(function (segment) {
          var key = segment.toLowerCase();
          if (!node.children[key]) node.children[key] = { name: key, children: {}, href: null, label: "" };
          node = node.children[key];
        });
      node.href = page.href;
      node.label = page.label;
    });
    return root;
  }

  function nodeAt(tree, segments) {
    var node = tree;
    for (var i = 0; i < segments.length; i++) {
      node = node.children[segments[i]];
      if (!node) return null;
    }
    return node;
  }

  // Resolves a cmd-style path ("..", "\\legal", "products\\ks-link", "KSS:\\") against
  // the current directory. Returns { segments, node } or null.
  function resolve(tree, text) {
    var raw = String(text || "").trim().replace(/^"|"$/g, "");
    var segments;
    if (/^kss:/i.test(raw)) {
      raw = raw.slice(4);
      segments = [];
    } else if (/^[\\/]/.test(raw)) {
      segments = [];
    } else {
      segments = cwd.slice();
    }

    var parts = raw.split(/[\\/]+/).filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].toLowerCase();
      if (part === ".") continue;
      if (part === "..") {
        segments.pop();
        continue;
      }
      segments.push(part);
    }
    var node = nodeAt(tree, segments);
    return node ? { segments: segments, node: node } : null;
  }

  // like cmd finding a program on the PATH: a bare name or label that matches
  // exactly one page anywhere on the site resolves to it
  function findByName(tree, text) {
    var wanted = String(text || "").trim().toLowerCase();
    if (!wanted || /[\\/]/.test(wanted)) return null;
    var hits = [];
    (function walk(node, segments) {
      Object.keys(node.children).forEach(function (key) {
        var child = node.children[key];
        var here = segments.concat(key);
        if (child.href && (key === wanted || (child.label || "").toLowerCase() === wanted)) {
          hits.push({ segments: here, node: child });
        }
        walk(child, here);
      });
    })(tree, []);
    return hits.length === 1 ? hits[0] : null;
  }

  function pathOf(segments) {
    return ROOT + "\\" + segments.join("\\");
  }

  function promptText() {
    return pathOf(cwd) + ">";
  }

  function entries(node) {
    return Object.keys(node.children)
      .sort(function (a, b) {
        var da = Object.keys(node.children[a].children).length ? 0 : 1;
        var db = Object.keys(node.children[b].children).length ? 0 : 1;
        return da - db || (a < b ? -1 : a > b ? 1 : 0);
      })
      .map(function (key) {
        return node.children[key];
      });
  }

  function isDir(node) {
    return Object.keys(node.children).length > 0;
  }

  // ── terminal output ─────────────────────────────────────────────────────
  function print(text, kind) {
    var line = document.createElement("div");
    line.className = "term-line" + (kind ? " term-line--" + kind : "");
    line.textContent = text === "" ? " " : text;
    screen.insertBefore(line, screen.querySelector(".term-row"));
    return line;
  }

  function printLines(lines, kind) {
    lines.forEach(function (text) {
      print(text, kind);
    });
  }

  function scrollDown() {
    screen.scrollTop = screen.scrollHeight;
  }

  function banner() {
    var meta = window.KanasakaMeta || {};
    print("KS_Site [Version " + (meta.version || "unknown") + "]");
    print("(c) KANASAKA. All rights reserved.");
    print("");
    print("Type HELP for a list of commands.");
    print("");
  }

  function clearScreen() {
    screen.querySelectorAll(".term-line").forEach(function (line) {
      line.remove();
    });
  }

  function error(text) {
    print(text, "error");
  }

  // ── commands ────────────────────────────────────────────────────────────
  var HELP = [
    ["CD", "Displays the name of or changes the current directory."],
    ["CLS", "Clears the screen."],
    ["DATE", "Displays the current date (UTC)."],
    ["DIR", "Displays a list of pages and directories."],
    ["ECHO", "Displays messages."],
    ["EXIT", "Quits the KS_Site terminal."],
    ["HELP", "Provides help information for KS_Site commands."],
    ["LOGIN", "Opens the sign-in dialog."],
    ["MOTION", "Sets the animation level: auto, full, reduced or off."],
    ["REGISTER", "Opens the registration dialog."],
    ["START", "Opens a page."],
    ["THEME", "Sets the theme: dark, light or accent."],
    ["TIME", "Displays the current time (UTC)."],
    ["TREE", "Graphically displays the structure of the site."],
    ["VER", "Displays the KS_Site version."],
    ["WHOAMI", "Displays the signed-in account, or guest."],
  ];

  var USAGE = {
    cd: "CD [path]\n  CD ..   moves up one level;  CD \\   goes to the root;  CD with no path shows the current directory.",
    dir: "DIR [path]\n  Lists the pages and directories in a directory.",
    start: "START path | name\n  Opens a page by path (relative to the current directory) or by its unique name, e.g. START security.\n  Typing a page name on its own does the same.",
    theme: "THEME dark | light | accent",
    motion: "MOTION auto | full | reduced | off",
    echo: "ECHO message",
    tree: "TREE [path]",
  };

  function pad(text, width) {
    text = String(text);
    while (text.length < width) text += " ";
    return text;
  }

  function openPage(tree, target) {
    var found = resolve(tree, target) || findByName(tree, target);
    if (!found) {
      error("The system cannot find the path specified.");
      return;
    }
    if (!found.node.href) {
      error("There is no page at " + pathOf(found.segments) + ".");
      return;
    }
    print("Starting " + found.node.label + " (" + found.node.href + ")...");
    window.location.href = found.node.href;
  }

  function showTree(node, prefix, lines) {
    var kids = entries(node);
    kids.forEach(function (child, i) {
      var last = i === kids.length - 1;
      lines.push(prefix + (last ? "└── " : "├── ") + child.name);
      showTree(child, prefix + (last ? "    " : "│   "), lines);
    });
  }

  var COMMANDS = {
    help: function (arg) {
      var key = arg.trim().toLowerCase();
      if (key && USAGE[key]) {
        printLines(USAGE[key].split("\n"));
      } else if (key) {
        var known = HELP.filter(function (row) {
          return row[0].toLowerCase() === key;
        })[0];
        if (known) print(known[1]);
        else error("This command is not supported by the help utility.  Try \"HELP\".");
      } else {
        print("For more information on a specific command, type HELP command-name");
        HELP.forEach(function (row) {
          print(pad(row[0], 10) + row[1]);
        });
      }
    },

    cd: function (arg, tree) {
      var text = arg.trim();
      if (!text) {
        print(pathOf(cwd));
        return;
      }
      var found = resolve(tree, text);
      if (!found) {
        error("The system cannot find the path specified.");
        return;
      }
      if (!isDir(found.node) && found.segments.length) {
        error("The directory name is invalid.");
        return;
      }
      cwd = found.segments;
    },

    dir: function (arg, tree) {
      var found = arg.trim() ? resolve(tree, arg) : { segments: cwd, node: nodeAt(tree, cwd) };
      if (!found) {
        error("File Not Found");
        return;
      }
      print(" Directory of " + pathOf(found.segments));
      print("");
      var pagesCount = 0;
      var dirs = 0;
      if (found.segments.length) {
        print(pad("<DIR>", 9) + "..");
      }
      entries(found.node).forEach(function (child) {
        var dir = isDir(child);
        if (dir) dirs += 1;
        else pagesCount += 1;
        print(pad(dir ? "<DIR>" : "<PAGE>", 9) + pad(child.name, 20) + (child.label || ""));
      });
      print("");
      print(pad("", 9) + pagesCount + " page(s)");
      print(pad("", 9) + dirs + " dir(s)");
    },

    tree: function (arg, tree) {
      var found = arg.trim() ? resolve(tree, arg) : { segments: cwd, node: nodeAt(tree, cwd) };
      if (!found) {
        error("Invalid path");
        return;
      }
      var lines = [pathOf(found.segments)];
      showTree(found.node, "", lines);
      printLines(lines);
    },

    start: function (arg, tree) {
      if (!arg.trim()) {
        error("The syntax of the command is incorrect.");
        return;
      }
      var word = arg.trim().toLowerCase();
      if (word === "login" || word === "register") {
        COMMANDS[word]();
        return;
      }
      openPage(tree, arg);
    },

    cls: function () {
      clearScreen();
    },

    exit: function () {
      close();
    },

    ver: function () {
      var meta = window.KanasakaMeta || {};
      print("");
      print("KS_Site [Version " + (meta.version || "unknown") + "]");
    },

    date: function () {
      var d = new Date();
      print("The current date is: " + d.toISOString().slice(0, 10) + " (UTC)");
    },

    time: function () {
      var d = new Date();
      print("The current time is: " + d.toISOString().slice(11, 19) + " (UTC)");
    },

    echo: function (arg) {
      print(arg.replace(/^\s/, "") || "ECHO is on.");
    },

    whoami: function () {
      var session = window.KanasakaAuth && window.KanasakaAuth.getSession ? window.KanasakaAuth.getSession() : null;
      print(session && session.authenticated ? session.displayLabel || session.email || "account" : "guest");
    },

    theme: function (arg) {
      var name = arg.trim().toLowerCase();
      if (["dark", "light", "accent"].indexOf(name) === -1) {
        error("The syntax of the command is incorrect.  Usage: THEME dark | light | accent");
        return;
      }
      if (window.KanasakaTheme) window.KanasakaTheme.setTheme(name);
      print("Theme set to " + name + ".");
    },

    motion: function (arg) {
      var name = arg.trim().toLowerCase();
      if (["auto", "full", "reduced", "off"].indexOf(name) === -1) {
        error("The syntax of the command is incorrect.  Usage: MOTION auto | full | reduced | off");
        return;
      }
      if (motion()) motion().setPref(name);
      print("Motion set to " + name + ".");
    },

    login: function () {
      if (window.KanasakaAuth && window.KanasakaAuth.openAuthModal) {
        close();
        window.KanasakaAuth.openAuthModal("login");
      } else window.location.href = "/login/";
    },

    register: function () {
      if (window.KanasakaAuth && window.KanasakaAuth.openAuthModal) {
        close();
        window.KanasakaAuth.openAuthModal("register");
      } else window.location.href = "/register/";
    },

    account: function () {
      window.location.href = "/account/settings/";
    },
  };

  COMMANDS["?"] = COMMANDS.help;
  COMMANDS.ls = COMMANDS.dir;
  COMMANDS.chdir = COMMANDS.cd;
  COMMANDS.open = COMMANDS.start;
  COMMANDS.quit = COMMANDS.exit;
  COMMANDS.clear = COMMANDS.cls;

  function execute(line) {
    var tree = buildTree();
    print(promptText() + line);
    var text = line.trim();
    if (!text) return;

    // like cmd, "cd.." and "cd\" work without a space
    text = text.replace(/^(cd|chdir)(?=(\.\.|[\\/]))/i, "$1 ");

    var space = text.search(/\s/);
    var name = (space === -1 ? text : text.slice(0, space)).toLowerCase();
    var arg = space === -1 ? "" : text.slice(space);

    if (Object.prototype.hasOwnProperty.call(COMMANDS, name)) {
      COMMANDS[name](arg, tree);
      return;
    }

    // a bare page name or path behaves like running a program
    var found = resolve(tree, text) || findByName(tree, text);
    if (found && found.node.href) {
      openPage(tree, text);
      return;
    }
    error("'" + text.split(/\s+/)[0] + "' is not recognized as an internal or external command,");
    print("operable program or batch file.", "error");
    var guess = didYouMean(tree, name);
    if (guess) print("Did you mean: " + guess + "?");
  }

  // closest command or page name (edit distance <= 2), for typos
  function didYouMean(tree, word) {
    var names = Object.keys(COMMANDS).filter(function (c) {
      return c !== "?";
    });
    pageItems(tree).forEach(function (item) {
      names.push(item.href === "/" ? "home" : item.href.split("/").filter(Boolean).pop());
    });
    var best = null;
    var bestDistance = 3;
    names.forEach(function (candidate) {
      var d = distance(word, candidate);
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    });
    return best;
  }

  function distance(a, b) {
    var prev = [];
    for (var j = 0; j <= b.length; j++) prev.push(j);
    for (var i = 1; i <= a.length; i++) {
      var row = [i];
      for (var k = 1; k <= b.length; k++) {
        row.push(Math.min(prev[k] + 1, row[k - 1] + 1, prev[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1)));
      }
      prev = row;
    }
    return prev[b.length];
  }

  // ── recommendations / suggestions ────────────────────────────────────────
  // The terminal is really a search bar, so it suggests as you type. With an
  // empty prompt it recommends: things you ran recently, pages related to the
  // one you are on, then the usual starting points.
  var RELATED = {
    "/": ["/products/ks-link/", "/downloads/", "/legal/security/"],
    "/products/": ["/products/ks-link/", "/downloads/", "/legal/products/"],
    "/products/ks-link/": ["/downloads/", "/legal/security/", "/legal/products/"],
    "/downloads/": ["/products/ks-link/", "/legal/security/", "/legal/privacy/"],
    "/legal/security/": ["/legal/privacy/", "/products/ks-link/", "/support/contact/"],
    "/legal/": ["/legal/privacy/", "/legal/terms/", "/legal/impressum/"],
    "/company/": ["/company/about/", "/support/contact/", "/legal/security/"],
    "/company/about/": ["/products/ks-link/", "/support/contact/", "/legal/impressum/"],
    "/support/contact/": ["/company/about/", "/legal/security/", "/products/ks-link/"],
  };
  var STARTERS = ["/products/ks-link/", "/downloads/", "/legal/security/", "/company/about/", "/support/contact/"];
  var COMMAND_ITEMS = [
    ["theme dark", "Switch to the dark theme"],
    ["theme light", "Switch to the light theme"],
    ["theme accent", "Switch to the accent theme"],
    ["motion auto", "Animation: automatic"],
    ["motion full", "Animation: full"],
    ["motion reduced", "Animation: reduced"],
    ["motion off", "Animation: off"],
    ["login", "Sign in"],
    ["register", "Create an account"],
    ["account", "Account settings"],
    ["tree", "Show the site structure"],
    ["dir", "List this directory"],
    ["help", "List commands"],
    ["cls", "Clear the screen"],
    ["ver", "Show the version"],
    ["whoami", "Who is signed in"],
    ["exit", "Close the terminal"],
  ];

  var suggestions = [];
  var selected = -1;
  var suggestTitle = "";
  var listEl = null;
  var titleEl = null;

  function pageItems(tree) {
    return pages().map(function (page) {
      var segments = page.href.split("/").filter(Boolean);
      return {
        kind: "page",
        label: page.label,
        hint: page.href === "/" ? "\\" : "\\" + segments.join("\\"),
        key: (page.label + " " + segments.join(" ") + " " + page.href).toLowerCase(),
        fill: "start \\" + segments.join("\\"),
        href: page.href,
        complete: true,
      };
    });
  }

  function commandItems() {
    return COMMAND_ITEMS.map(function (row) {
      var word = row[0];
      return {
        kind: "command",
        label: word,
        hint: row[1],
        key: (word + " " + row[1]).toLowerCase(),
        fill: word,
        complete: true,
      };
    });
  }

  function here() {
    return window.location.pathname.replace(/\/?$/, "/");
  }

  function relatedHrefs() {
    var current = here();
    var list = (RELATED[current] || []).slice();
    var section = current.split("/").filter(Boolean)[0];
    if (section) {
      pages().forEach(function (page) {
        if (page.href !== current && page.href.split("/").filter(Boolean)[0] === section && list.indexOf(page.href) === -1) list.push(page.href);
      });
    }
    STARTERS.forEach(function (href) {
      if (list.indexOf(href) === -1) list.push(href);
    });
    return list.filter(function (href) {
      return href !== current;
    });
  }

  function recommend(tree) {
    var items = [];
    var seen = {};
    var all = pageItems(tree);

    history
      .slice()
      .reverse()
      .forEach(function (line) {
        var key = line.trim().toLowerCase();
        if (!key || seen[key] || /^(cls|exit|help|clear)$/.test(key) || items.length >= 2) return;
        seen[key] = true;
        items.push({ kind: "recent", label: line.trim(), hint: "recent", fill: line.trim(), complete: true });
      });

    relatedHrefs().forEach(function (href) {
      all.forEach(function (item) {
        if (item.href === href && !seen[item.fill] && items.length < 6) {
          seen[item.fill] = true;
          items.push(item);
        }
      });
    });
    return items;
  }

  // ranks how well an item matches what was typed; -1 = no match.
  // prefix of the label > prefix of any word > substring > loose letters (label only)
  function scoreItem(query, item) {
    var label = item.label.toLowerCase();
    var text = item.key || label;
    if (label.indexOf(query) === 0) return 0;
    if ((" " + text).indexOf(" " + query) !== -1) return 5;
    var at = label.indexOf(query);
    if (at !== -1) return 10 + at;
    at = text.indexOf(query);
    if (at !== -1) return 20 + at;
    if (query.length < 3) return -1;
    var pos = 0;
    var gaps = 0;
    for (var i = 0; i < query.length; i++) {
      var found = label.indexOf(query.charAt(i), pos);
      if (found === -1) return -1;
      gaps += found - pos;
      pos = found + 1;
    }
    return 60 + gaps;
  }

  function compute() {
    var tree = buildTree();
    var raw = input.value;
    var text = raw.trim().toLowerCase();

    if (!text) {
      suggestTitle = "Recommended";
      return recommend(tree);
    }

    suggestTitle = "Suggestions";
    var pool;
    var query = text;

    // arguments: only offer what fits the command being typed
    var argMatch = /^(cd|chdir|dir|tree)\s+(.*)$/i.exec(raw.replace(/^\s+/, ""));
    var startMatch = /^(start|open)\s+(.*)$/i.exec(raw.replace(/^\s+/, ""));
    var themeMatch = /^(theme|motion)\s+(.*)$/i.exec(raw.replace(/^\s+/, ""));
    if (argMatch) {
      var base = argMatch[2];
      var cut = Math.max(base.lastIndexOf("\\"), base.lastIndexOf("/"));
      var dirPart = cut === -1 ? "" : base.slice(0, cut + 1);
      var found = resolve(tree, dirPart || ".");
      query = base.slice(cut + 1).toLowerCase();
      pool = found
        ? entries(found.node)
            .filter(function (child) {
              return isDir(child);
            })
            .map(function (child) {
              return {
                kind: "dir",
                label: child.name,
                hint: child.label || "directory",
                key: child.name + " " + (child.label || ""),
                fill: argMatch[1].toLowerCase() + " " + dirPart + child.name,
                complete: true,
              };
            })
        : [];
    } else if (themeMatch) {
      query = themeMatch[2].toLowerCase();
      pool = commandItems().filter(function (item) {
        return item.fill.indexOf(themeMatch[1].toLowerCase() + " ") === 0;
      });
    } else if (startMatch) {
      query = startMatch[2].toLowerCase();
      pool = pageItems(tree);
    } else {
      pool = pageItems(tree).concat(commandItems());
    }

    var current = here();
    var related = relatedHrefs();
    var ranked = [];
    pool.forEach(function (item) {
      var s = query ? scoreItem(query, item) : 0;
      if (s < 0) return;
      // a little context: related pages and things you ran before rank higher
      if (item.href && related.indexOf(item.href) !== -1) s -= 3;
      if (item.href === current) s += 8;
      if (history.indexOf(item.fill) !== -1) s -= 4;
      ranked.push({ item: item, score: s });
    });
    ranked.sort(function (a, b) {
      return a.score - b.score;
    });
    return ranked.slice(0, 6).map(function (r) {
      return r.item;
    });
  }

  function renderSuggestions() {
    suggestions = compute();
    if (selected >= suggestions.length) selected = suggestions.length - 1;
    titleEl.textContent = suggestions.length ? suggestTitle : "No matches";
    listEl.textContent = "";
    suggestions.forEach(function (item, index) {
      var li = document.createElement("li");
      li.id = "term-opt-" + index;
      li.className = "term-option" + (index === selected ? " is-selected" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", index === selected ? "true" : "false");

      var label = document.createElement("span");
      label.className = "term-option-label";
      label.textContent = item.label;
      var hint = document.createElement("span");
      hint.className = "term-option-hint";
      hint.textContent = item.hint;
      li.appendChild(label);
      li.appendChild(hint);

      li.addEventListener("pointermove", function () {
        if (selected !== index) {
          selected = index;
          markSelected();
        }
      });
      li.addEventListener("click", function () {
        accept(item, true);
      });
      listEl.appendChild(li);
    });
    input.setAttribute("aria-activedescendant", selected >= 0 ? "term-opt-" + selected : "");
  }

  function markSelected() {
    Array.prototype.forEach.call(listEl.children, function (li, index) {
      var on = index === selected;
      li.classList.toggle("is-selected", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    });
    input.setAttribute("aria-activedescendant", selected >= 0 ? "term-opt-" + selected : "");
  }

  // run = true: execute the suggestion; false: only put it in the prompt
  function accept(item, run) {
    if (run && item.complete) {
      submit(item.fill);
      return;
    }
    input.value = item.fill + (item.complete ? "" : " ");
    selected = -1;
    renderSuggestions();
    input.focus();
  }

  function submit(line) {
    input.value = "";
    selected = -1;
    if (line.trim()) {
      history.push(line);
      historyIndex = history.length;
    }
    execute(line);
    promptEl.textContent = promptText();
    scrollDown();
    renderSuggestions();
  }

  // ── Tab completion: take the highlighted (or first) suggestion ───────────
  function complete() {
    if (!suggestions.length) return;
    var item = suggestions[selected >= 0 ? selected : 0];
    input.value = item.fill;
    selected = -1;
    renderSuggestions();
  }

  // ── window ──────────────────────────────────────────────────────────────
  function button(label, className, name, handler) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "term-btn " + className;
    b.setAttribute("aria-label", name);
    b.tabIndex = -1;
    b.textContent = label;
    b.addEventListener("click", handler);
    return b;
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "console-overlay";
    overlay.hidden = true;

    term = document.createElement("div");
    term.className = "term";
    term.setAttribute("role", "dialog");
    term.setAttribute("aria-modal", "true");
    term.setAttribute("aria-label", "KS_Site terminal");

    var bar = document.createElement("div");
    bar.className = "term-bar";
    var title = document.createElement("span");
    title.className = "term-title";
    title.textContent = "KS_Site";
    var controls = document.createElement("span");
    controls.className = "term-controls";
    controls.appendChild(button("–", "term-btn--min", "Close terminal", close));
    controls.appendChild(
      button("□", "term-btn--max", "Toggle size", function () {
        term.classList.toggle("is-max");
        input.focus();
      })
    );
    controls.appendChild(button("×", "term-btn--close", "Close terminal", close));
    bar.appendChild(title);
    bar.appendChild(controls);

    screen = document.createElement("div");
    screen.className = "term-screen";
    screen.setAttribute("role", "log");
    screen.setAttribute("aria-live", "polite");

    var row = document.createElement("div");
    row.className = "term-row";
    promptEl = document.createElement("span");
    promptEl.className = "term-prompt";
    input = document.createElement("input");
    input.className = "term-input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", "Command or page");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "term-list");
    input.setAttribute("aria-autocomplete", "list");
    row.appendChild(promptEl);
    row.appendChild(input);
    screen.appendChild(row);

    var suggest = document.createElement("div");
    suggest.className = "term-suggest";
    titleEl = document.createElement("div");
    titleEl.className = "term-suggest-title";
    listEl = document.createElement("ul");
    listEl.className = "term-list";
    listEl.id = "term-list";
    listEl.setAttribute("role", "listbox");
    listEl.setAttribute("aria-label", "Suggestions");
    suggest.appendChild(titleEl);
    suggest.appendChild(listEl);

    term.appendChild(bar);
    term.appendChild(screen);
    term.appendChild(suggest);
    overlay.appendChild(term);
    document.body.appendChild(overlay);

    overlay.addEventListener("pointerdown", function (event) {
      if (event.target === overlay) close();
    });
    screen.addEventListener("click", function () {
      if (!window.getSelection || window.getSelection().toString() === "") input.focus();
    });

    input.addEventListener("input", function () {
      selected = -1;
      renderSuggestions();
    });

    input.addEventListener("keydown", function (event) {
      var key = event.key;
      if (key === "Enter") {
        event.preventDefault();
        if (selected >= 0 && suggestions[selected]) accept(suggestions[selected], true);
        else submit(input.value);
      } else if (key === "Tab") {
        event.preventDefault();
        complete();
      } else if (key === "ArrowDown") {
        event.preventDefault();
        if (suggestions.length) {
          selected = (selected + 1) % suggestions.length;
          markSelected();
        }
      } else if (key === "ArrowUp") {
        event.preventDefault();
        if (selected > 0) {
          selected -= 1;
          markSelected();
        } else if (selected === 0) {
          selected = -1;
          markSelected();
        } else if (historyIndex > 0) {
          // like cmd: Up with nothing highlighted walks the history
          historyIndex -= 1;
          input.value = history[historyIndex];
          renderSuggestions();
        }
      } else if (key === "Escape") {
        event.preventDefault();
        close();
      } else if ((event.ctrlKey || event.metaKey) && (key === "l" || key === "L")) {
        event.preventDefault();
        clearScreen();
      } else if (event.ctrlKey && (key === "c" || key === "C") && window.getSelection().toString() === "") {
        event.preventDefault();
        print(promptText() + input.value + "^C");
        input.value = "";
        scrollDown();
        renderSuggestions();
      }
    });

    banner();
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
    promptEl.textContent = promptText();
    selected = -1;
    renderSuggestions();
    window.requestAnimationFrame(function () {
      overlay.classList.add("is-open");
      input.focus();
      scrollDown();
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
