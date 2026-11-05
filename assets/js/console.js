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
  var tabState = null;
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
    if (motion()) motion().glitch(term, 160);
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
  }

  // ── Tab completion (commands, then entries of the target directory) ──────
  function complete() {
    var value = input.value;
    var tree = buildTree();
    var parts = value.split(/\s+/);

    if (!tabState || tabState.base !== value) {
      var pool;
      var head;
      if (parts.length <= 1) {
        pool = Object.keys(COMMANDS).filter(function (c) {
          return c !== "?";
        });
        head = "";
      } else {
        var rawPath = parts.slice(1).join(" ");
        var cut = Math.max(rawPath.lastIndexOf("\\"), rawPath.lastIndexOf("/"));
        var dirPart = cut === -1 ? "" : rawPath.slice(0, cut + 1);
        var found = resolve(tree, dirPart || ".");
        pool = found ? Object.keys(found.node.children) : [];
        head = parts[0] + " " + dirPart;
        parts = [parts[0], rawPath.slice(cut + 1)];
      }
      var fragment = (parts.length <= 1 ? parts[0] : parts[1]).toLowerCase();
      var matches = pool
        .filter(function (item) {
          return item.indexOf(fragment) === 0;
        })
        .sort();
      tabState = { base: null, head: head, matches: matches, index: -1 };
    }

    if (!tabState.matches.length) return;
    tabState.index = (tabState.index + 1) % tabState.matches.length;
    input.value = tabState.head + tabState.matches[tabState.index];
    tabState.base = input.value;
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
    var icon = document.createElement("span");
    icon.className = "term-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ">_";
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
    bar.appendChild(icon);
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
    input.setAttribute("aria-label", "Command");
    row.appendChild(promptEl);
    row.appendChild(input);
    screen.appendChild(row);

    term.appendChild(bar);
    term.appendChild(screen);
    overlay.appendChild(term);
    document.body.appendChild(overlay);

    overlay.addEventListener("pointerdown", function (event) {
      if (event.target === overlay) close();
    });
    screen.addEventListener("click", function () {
      if (!window.getSelection || window.getSelection().toString() === "") input.focus();
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var line = input.value;
        input.value = "";
        tabState = null;
        if (line.trim()) {
          history.push(line);
          historyIndex = history.length;
        }
        execute(line);
        promptEl.textContent = promptText();
        scrollDown();
      } else if (event.key === "Tab") {
        event.preventDefault();
        complete();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (historyIndex > 0) {
          historyIndex -= 1;
          input.value = history[historyIndex];
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex < history.length - 1) {
          historyIndex += 1;
          input.value = history[historyIndex];
        } else {
          historyIndex = history.length;
          input.value = "";
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if ((event.ctrlKey || event.metaKey) && (event.key === "l" || event.key === "L")) {
        event.preventDefault();
        clearScreen();
      } else if (event.ctrlKey && (event.key === "c" || event.key === "C") && window.getSelection().toString() === "") {
        event.preventDefault();
        print(promptText() + input.value + "^C");
        input.value = "";
        scrollDown();
      } else {
        tabState = null;
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
    window.requestAnimationFrame(function () {
      overlay.classList.add("is-open");
      input.focus();
      scrollDown();
      if (motion()) motion().glitch(term, 140);
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
