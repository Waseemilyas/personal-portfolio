/* Progressive enhancement only. Content works with JS disabled. */
(function () {
  "use strict";
  var rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* The phone menu is a native popover (`popover` on #primary-nav, `popovertarget` on the
     toggle), so it opens, light-dismisses and closes on Escape with focus back on the
     toggle before this script arrives and without it. This only mirrors the state into
     aria-expanded, closes the menu when a link is chosen, focus leaves, or the window
     widens, and drives the same drawer for a browser without popovers. */
  function setupNavigation() {
    const toggle = document.querySelector("button.nav-toggle");
    const nav = document.getElementById("primary-nav");
    if (!(toggle instanceof HTMLButtonElement) || !nav) return;
    var drawerQ = window.matchMedia("(max-width: 720px)");
    var native = typeof nav.showPopover === "function" && nav.hasAttribute("popover");
    /** @returns {boolean} */
    var isOpen = function () {
      return native ? nav.matches(":popover-open") : nav.getAttribute("data-open") === "true";
    };
    /** @param {boolean} open */
    var setDrawer = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      if (native) {
        if (!open && isOpen()) nav.hidePopover();
        return;
      }
      var hide = drawerQ.matches && !open;
      nav.setAttribute("data-open", String(open));
      /* Hide the closed off-screen drawer from tab order and the a11y tree. */
      if (hide) {
        nav.setAttribute("aria-hidden", "true");
        nav.inert = true;
      } else {
        nav.removeAttribute("aria-hidden");
        nav.inert = false;
      }
    };
    if (native) {
      nav.addEventListener("toggle", function (e) {
        toggle.setAttribute("aria-expanded", String(e.newState === "open"));
      });
    } else {
      /* Without popover support the attribute does nothing; the script owns the drawer. */
      toggle.removeAttribute("popovertarget");
      nav.removeAttribute("popover");
      toggle.addEventListener("click", function () {
        setDrawer(!isOpen());
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && isOpen()) {
          toggle.focus();
          setDrawer(false);
        }
      });
    }
    setDrawer(isOpen());
    if (drawerQ.addEventListener) {
      drawerQ.addEventListener("change", function () {
        setDrawer(drawerQ.matches && isOpen());
      });
    }
    nav.addEventListener("click", function (e) {
      if (e.target instanceof Element && e.target.tagName === "A") {
        setDrawer(false);
      }
    });
    document.addEventListener("focusin", function (e) {
      // Let Tab leave the drawer without the open panel covering its next stop.
      if (isOpen() && e.target instanceof Node && e.target !== toggle && !nav.contains(e.target)) {
        setDrawer(false);
      }
    });
  }

  function setupFocusVisibility() {
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;

    document.addEventListener("focusin", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches("main :focus-visible, footer :focus-visible")) return;

      // Native focus scrolling can leave a partly visible link under the sticky bar.
      // Check after the browser has placed focus and scrolled.
      requestAnimationFrame(() => {
        if (document.activeElement !== target) return;
        const bounds = target.getBoundingClientRect();
        const outlineClearance = 5;
        if (bounds.bottom > 0 && bounds.top < topbar.getBoundingClientRect().bottom + outlineClearance) {
          target.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
        }
      });
    });
  }

  /* First-screen blocks (data-cal="0".."4") and corner marks animate in CSS alone.
     This only defers below-the-fold blocks: one already on screen is never hidden,
     and one hidden here rises once its top crosses 88% of the viewport.
     An observer's first report, not a measurement, says which blocks are on screen:
     measuring would make the browser lay out the Home sections it is skipping
     (content-visibility in styles.css). */
  function setupReveals() {
    if (rm || !("IntersectionObserver" in window)) return;
    var rise = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.replace("cal-wait", "in"); rise.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    var onScreen = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        onScreen.unobserve(e.target);
        if (e.isIntersecting) return;
        e.target.classList.add("cal-wait");
        rise.observe(e.target);
      });
    });
    document.querySelectorAll('[data-cal=""]').forEach(function (el) { onScreen.observe(el); });
  }

  function setupCapabilityMap() {
    const map = document.querySelector(".cap");
    const figure = map?.querySelector(".capfig");
    if (!map || !figure) return;

    const nodes = Array.from(figure.querySelectorAll(".node"));
    const traces = figure.querySelectorAll(".trace");
    const panels = map.querySelectorAll(".capread");

    /** @param {Element} node */
    function activate(node) {
      const panelId = node.getAttribute("aria-controls");
      const key = node.getAttribute("data-key");
      // Keep the SVG and narrow layout in sync when the viewport changes.
      nodes.forEach((tab) => {
        const selected = tab.getAttribute("aria-controls") === panelId;
        tab.setAttribute("aria-selected", String(selected));
        tab.setAttribute("tabindex", selected ? "0" : "-1");
      });
      traces.forEach((trace) => trace.classList.toggle("on", trace.getAttribute("data-for") === key));
      panels.forEach((panel) => panel.toggleAttribute("hidden", panel.id !== panelId));
    }

    figure.querySelectorAll('[role="tablist"]').forEach((list) => {
      const tabs = Array.from(list.querySelectorAll(".node"));
      tabs.forEach((tab, index) => {
        tab.addEventListener("pointermove", (event) => {
          if (!(event instanceof PointerEvent) || event.pointerType === "touch" || tab.getAttribute("aria-selected") === "true") return;
          // Require pointer movement so resize or scroll alone cannot select a tab.
          // Keep the active panel available while it contains keyboard focus.
          const focused = document.activeElement;
          if (!focused || !map.contains(focused) || !focused.matches(":focus-visible")) activate(tab);
        });
        tab.addEventListener("focus", () => activate(tab));
        tab.addEventListener("click", () => activate(tab));
        tab.addEventListener("keydown", (event) => {
          if (!(event instanceof KeyboardEvent)) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate(tab);
            return;
          }
          let next;
          switch (event.key) {
            case "ArrowLeft": next = tabs[(index + tabs.length - 1) % tabs.length]; break;
            case "ArrowRight": next = tabs[(index + 1) % tabs.length]; break;
            case "Home": next = tabs[0]; break;
            case "End": next = tabs[tabs.length - 1]; break;
            default: return;
          }
          event.preventDefault();
          if (next instanceof HTMLElement || next instanceof SVGElement) next.focus();
        });
      });
    });

    panels.forEach((panel) => {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", panel.querySelector("h3")?.id ?? "");
      panel.setAttribute("tabindex", "0");
    });
    activate(nodes[0]);
    map.setAttribute("data-enhanced", "");
    figure.removeAttribute("hidden");
  }

  /* The native disclosure works before this script. On narrow screens its list
     opens over the text and closes before the browser jumps to the chosen heading. */
  function setupArticleContents() {
    const details = document.querySelector(".article-contents");
    if (!(details instanceof HTMLDetailsElement)) return;
    const summary = details.querySelector("summary");
    const title = summary?.querySelector("span");
    const panel = details.querySelector("nav");
    if (!summary || !title || !panel) return;
    details.setAttribute("data-follow", "");
    const desktop = window.matchMedia("(min-width: 861px)");
    const topbar = document.querySelector(".topbar");
    if (desktop.matches) details.open = true;
    desktop.addEventListener("change", (event) => { details.open = event.matches; });

    const placePanel = () => {
      const control = summary.getBoundingClientRect();
      const above = control.top - (topbar?.getBoundingClientRect().bottom ?? 0) - 8;
      const below = window.innerHeight - control.bottom - 8;
      const opensAbove = panel.scrollHeight > below && above > below;
      panel.toggleAttribute("data-above", opensAbove);
      panel.style.setProperty("--contents-panel-height", Math.max(0, opensAbove ? above : below) + "px");
    };
    details.addEventListener("toggle", () => {
      if (desktop.matches || !details.open) return;
      placePanel();
      const active = panel.querySelector('[aria-current="location"]');
      if (!active) {
        panel.scrollTop = 0;
        return;
      }
      const bounds = active.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      if (bounds.bottom > panelBounds.bottom) panel.scrollTop += bounds.bottom - panelBounds.bottom + 8;
      else if (bounds.top < panelBounds.top) panel.scrollTop -= panelBounds.top - bounds.top + 8;
    });
    const rail = details.closest(".case-rail");
    const caseGrid = rail?.parentElement;
    const datasheet = caseGrid?.querySelector(".datasheet");
    if (rail && caseGrid && datasheet instanceof HTMLElement && "ResizeObserver" in window) {
      const wide = window.matchMedia("screen and (min-width: 861px) and (min-height: 400px)");
      const measure = () => {
        if (datasheet.scrollHeight > datasheet.clientHeight) datasheet.tabIndex = 0;
        else datasheet.removeAttribute("tabindex");
        if (!wide.matches) return;
        datasheet.style.setProperty("--case-sheet-clearance", datasheet.offsetTop + 10 + "px");
        const end = caseGrid.getBoundingClientRect().bottom;
        // Leave room for the rail when a heading sits near the end of the article.
        const railHeight = rail.getBoundingClientRect().height + 16;
        caseGrid.querySelectorAll(".prose h2[id]").forEach((heading) => {
          if (!(heading instanceof HTMLElement)) return;
          const clearance = Math.max(0, railHeight + heading.getBoundingClientRect().top - end);
          heading.style.setProperty("--case-heading-clearance", clearance + "px");
        });
      };
      const placeDatasheet = () => {
        const focused = document.activeElement;
        const destination = wide.matches ? rail : caseGrid;
        if (datasheet.parentElement !== destination) {
          if (wide.matches) rail.append(datasheet);
          else rail.after(datasheet);
        }
        if (focused instanceof HTMLElement && datasheet.contains(focused)) focused.focus({ preventScroll: true });
        measure();
      };
      const observer = new ResizeObserver(measure);
      observer.observe(caseGrid);
      observer.observe(datasheet);
      wide.addEventListener("change", placeDatasheet);
      placeDatasheet();
    }
    details.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a") && summary.offsetHeight) details.open = false;
    });
    details.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && details.open && summary.offsetHeight) {
        summary.focus({ preventScroll: true });
        details.open = false;
      }
    });
    details.addEventListener("focusout", (event) => {
      if (summary.offsetHeight && event.relatedTarget instanceof Node && !details.contains(event.relatedTarget)) details.open = false;
    });
    document.addEventListener("click", (event) => {
      if (details.open && summary.offsetHeight && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    });

    /** @type {{link: Element, heading: HTMLElement}[]} */
    const sections = [];
    details.querySelectorAll('a[href^="#"]').forEach(function (link) {
      const heading = document.getElementById(decodeURIComponent((link.getAttribute("href") || "").slice(1)));
      if (heading) sections.push({ link: link, heading: heading });
    });
    if (sections.length < 2) return;
    /** @type {Element | null} */
    let current = null;
    let queued = false;
    const mark = function () {
      queued = false;
      const root = document.documentElement;
      // At the foot of a short page the last headings cannot reach the line, so
      // any heading on screen counts.
      const atEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      const compact = summary.offsetHeight;
      if (compact && details.open) placePanel();
      const line = atEnd ? window.innerHeight :
        (topbar?.getBoundingClientRect().bottom ?? 0) + compact + window.innerHeight * 0.1;
      /** @type {Element | null} */
      let reading = null;
      for (const { heading, link } of sections) {
        // On wide screens the datasheet sits beside the prose.
        if (!compact && heading.id === "case-datasheet") continue;
        const top = heading.getBoundingClientRect().top;
        if (top <= line) reading = link;
        if (top > line && top < window.innerHeight && heading.matches(":focus:target") &&
            top <= line + parseFloat(getComputedStyle(heading).scrollMarginBlockStart)) reading = link;
        if (atEnd && top >= 0 && heading.matches(":target")) {
          reading = link;
          break;
        }
      }
      if (reading === current) return;
      if (current) current.removeAttribute("aria-current");
      if (reading) reading.setAttribute("aria-current", "location");
      title.textContent = reading?.textContent ?? "";
      current = reading;
    };
    const queue = function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(mark);
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    window.addEventListener("hashchange", queue);
    queue();
  }

  /* Manual copy is available at first paint. Swap in the one-click control
     if the browser has a clipboard API and the visitor hasn't started copying. */
  function setupCopyEmail() {
    var clipboard = navigator.clipboard;
    if (!window.isSecureContext || typeof clipboard?.writeText !== "function") return;
    document.querySelectorAll(".email-row").forEach(function (row) {
      var parts = copyParts(row, "button.copy-email");
      if (parts) bindCopy(clipboard, parts, "email address");
    });
  }

  /* Share this note / case study (partials/share-link.njk). The manual copy disclosure
     works at first paint. Where the browser has a share sheet (phones, and most desktop
     Safari and Chromium on Windows and macOS) the button opens it with the page's title
     and canonical address; otherwise, where it can copy, the button copies that address. */
  function setupShareLink() {
    var clipboard = navigator.clipboard;
    var canShare = window.isSecureContext && typeof navigator.share === "function";
    var canCopy = window.isSecureContext && typeof clipboard?.writeText === "function";
    if (!canShare && !canCopy) return;
    document.querySelectorAll(".share-row").forEach(function (row) {
      var parts = copyParts(row, "button.share-link");
      if (!parts) return;
      if (canShare) bindShare(parts);
      else bindCopy(clipboard, parts, "link");
    });
  }

  /**
   * The one-click button, the manual disclosure, its read-only field and the status line
   * of a copy row, or null when any is missing or the visitor has already started copying.
   * @param {Element} row @param {string} buttonSelector
   * @returns {{button: HTMLButtonElement, manual: HTMLDetailsElement, field: HTMLInputElement, status: Element} | null}
   */
  function copyParts(row, buttonSelector) {
    var button = row.querySelector(buttonSelector);
    var manual = row.querySelector("details");
    var field = manual?.querySelector("input");
    var status = row.querySelector('[role="status"]');
    if (!(button instanceof HTMLButtonElement) || !manual || !(field instanceof HTMLInputElement) || !status) return null;
    if (manual.open || manual.contains(document.activeElement)) return null;
    return { button: button, manual: manual, field: field, status: status };
  }

  /**
   * Give the visitor the manual path: open the disclosure, select the value if the
   * button had focus, and say why.
   * @param {{button: HTMLButtonElement, manual: HTMLDetailsElement, field: HTMLInputElement, status: Element}} parts
   * @param {string} message
   */
  function showManualCopy(parts, message) {
    parts.manual.hidden = false;
    parts.manual.open = true;
    if (document.activeElement === parts.button) {
      parts.field.focus();
      parts.field.select();
    }
    parts.button.hidden = true;
    parts.status.textContent = message;
  }

  /**
   * @param {Clipboard} clipboard
   * @param {{button: HTMLButtonElement, manual: HTMLDetailsElement, field: HTMLInputElement, status: Element}} parts
   * @param {string} what what is copied, in words: "email address" or "link"
   */
  function bindCopy(clipboard, parts, what) {
    var button = parts.button;
    var status = parts.status;
    var label = button.textContent || "";
    /** @type {number | undefined} */
    var timer;
    var pending = false;
    button.hidden = false;
    parts.manual.hidden = true;
    button.addEventListener("click", function () {
      void copy();
    });

    async function copy() {
      if (pending) return;
      pending = true;
      try {
        await clipboard.writeText(parts.field.value);
      } catch {
        showManualCopy(parts, "Could not copy automatically. Select and copy the " + what + ".");
        return;
      } finally {
        pending = false;
        window.clearTimeout(timer);
      }
      button.textContent = "Copied ✓";
      button.setAttribute("data-copied", "");
      status.textContent = what.charAt(0).toUpperCase() + what.slice(1) + " copied.";
      timer = window.setTimeout(function () {
        button.textContent = label;
        button.removeAttribute("data-copied");
        status.textContent = "";
      }, 2500);
    }
  }

  /**
   * @param {{button: HTMLButtonElement, manual: HTMLDetailsElement, field: HTMLInputElement, status: Element}} parts
   */
  function bindShare(parts) {
    var button = parts.button;
    var pending = false;
    button.textContent = "Share link";
    button.hidden = false;
    parts.manual.hidden = true;
    button.addEventListener("click", function () {
      void share();
    });

    async function share() {
      if (pending) return;
      pending = true;
      parts.status.textContent = "";
      try {
        var heading = document.querySelector("main h1");
        await navigator.share({ title: (heading?.textContent || document.title).trim(), url: parts.field.value });
      } catch (error) {
        // Closing the share sheet is a choice, not a failure.
        if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") return;
        showManualCopy(parts, "Could not open sharing. Select and copy the link.");
      } finally {
        pending = false;
      }
    }
  }

  /* Page to page (styles.css): an article's own title is named page-title in CSS.
     Leaving for an article, the title of the card or link that leads there on screen
     takes the name instead, so the heading grows out of what was clicked. Going Back,
     the card for the article just left takes it, so the heading settles into it. */
  function setupPageTransitions() {
    /** @type {HTMLElement[]} */
    var named = [];
    var clear = function () {
      named.forEach(function (el) { el.style.viewTransitionName = ""; });
      named = [];
    };
    /** @param {HTMLElement} el @param {string} name */
    var give = function (el, name) {
      el.style.viewTransitionName = name;
      named.push(el);
    };
    /** @param {string} url @returns {HTMLElement | null} */
    var cardTitleFor = function (url) {
      var path = new URL(url, location.href).pathname;
      var links = document.querySelectorAll("main a[href]");
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (!(a instanceof HTMLAnchorElement) || a.origin !== location.origin || a.pathname !== path) continue;
        // A link in a section the browser is skipping is off screen; measuring it would lay it out.
        if (a.checkVisibility && !a.checkVisibility({ contentVisibilityAuto: true })) continue;
        var title = a.querySelector("h2, h3, .nextread-t") || a.closest(".note-item h2, .workcard h2");
        if (!(title instanceof HTMLElement)) continue;
        var r = title.getBoundingClientRect();
        if (r.height && r.top < window.innerHeight && r.bottom > 0) return title;
      }
      return null;
    };
    /** @param {string | undefined} url */
    var morphFrom = function (url) {
      var title = url ? cardTitleFor(url) : null;
      if (!title) return;
      var own = document.querySelector(".casehead h1");
      if (own instanceof HTMLElement) give(own, "none");
      give(title, "page-title");
    };
    window.addEventListener("pageswap", function (e) {
      clear();
      var ev = /** @type {Event & { viewTransition?: object | null, activation?: { entry?: { url?: string } } | null }} */ (e);
      if (ev.viewTransition && ev.activation && ev.activation.entry) morphFrom(ev.activation.entry.url);
    });
    window.addEventListener("pagereveal", function (e) {
      clear();
      var ev = /** @type {Event & { viewTransition?: object | null }} */ (e);
      var nav = /** @type {{ navigation?: { activation?: { navigationType?: string, from?: { url?: string } | null } | null } }} */ (/** @type {unknown} */ (window)).navigation;
      var act = nav && nav.activation;
      if (ev.viewTransition && act && act.navigationType === "traverse" && act.from) morphFrom(act.from.url);
    });
  }

  function setupArticlePrefetch() {
    // Firefox reuses the HTTP cache on navigation, but its native link hint
    // falls back to the strict default-src policy. Use the same-origin
    // connection the policy already permits. Speculation rules take precedence.
    if (HTMLScriptElement.supports?.("speculationrules") ||
        !document.createElement("link").relList.supports?.("prefetch") ||
        window.matchMedia("(prefers-reduced-data: reduce)").matches) return;
    if (document.readyState !== "complete") {
      window.addEventListener("load", setupArticlePrefetch, { once: true });
      return;
    }

    const requested = new Set();
    /** @param {HTMLAnchorElement} link */
    function prefetch(link) {
      const url = link.href;
      if (requested.has(url)) return;
      requested.add(url);
      void fetch(url, { mode: "same-origin", redirect: "error", priority: "low" })
        .then((response) => response.arrayBuffer())
        .catch(() => { /* A missed prefetch leaves the link to load normally. */ });
    }

    const links = [...document.querySelectorAll('a[data-prefetch-article][href$="/"]')]
      .filter(/** @returns {link is HTMLAnchorElement} */ (link) =>
        link instanceof HTMLAnchorElement && link.origin === location.origin);
    if (!window.matchMedia("(any-pointer: coarse)").matches || !("IntersectionObserver" in window)) {
      for (const link of links) {
        const onIntent = () => prefetch(link);
        link.addEventListener("pointerenter", onIntent, { once: true });
        link.addEventListener("focus", onIntent, { once: true });
      }
      return;
    }

    // On touch, warm the first article in view after a short pause. A link
    // swept past while scrolling should never compete with the next tap.
    const threshold = 0.5;
    const visible = new Set();
    /** @type {HTMLAnchorElement | undefined} */
    let candidate;
    let timer = 0;
    const observer = new IntersectionObserver((entries) => {
      for (const { isIntersecting, intersectionRatio, target } of entries) {
        if (isIntersecting && intersectionRatio >= threshold) visible.add(target);
        else visible.delete(target);
      }
      const first = links.find((link) => visible.has(link));
      if (first === candidate) return;
      candidate = first;
      window.clearTimeout(timer);
      if (first && !requested.has(first.href)) {
        timer = window.setTimeout(() => prefetch(first), 200);
      }
    }, { threshold });
    for (const link of links) observer.observe(link);
  }

  /* GitHub Pages serves the 404 page at whatever address was asked for. Links reach
     it mangled: a chat app keeps the closing bracket or full stop, a phone capitalises
     a word, a link is cut short or misspelt, or it names a section by another word.
     The page lists every published page (that list works without this script); this
     reads the address against it. One that differs only by case, punctuation, spaces,
     doubled slashes or an .html ending is already opening: the 404 page's head script
     (partials/not-found-redirect.njk) normalised it into <html data-asked> and called
     location.replace from the first bytes of the response. Otherwise the closest
     page, or failing that the page or section the address sits under, is offered. */
  function setupNotFound() {
    var match = document.querySelector("[data-not-found-match]");
    var index = document.querySelector("[data-page-index]");
    if (!(match instanceof HTMLElement) || !index || location.pathname === "/404.html") return;
    /** @type {{ path: string, title: string, slug: string }[]} */
    var pages = [];
    index.querySelectorAll("a[href]").forEach(function (a) {
      if (!(a instanceof HTMLAnchorElement) || a.origin !== location.origin) return;
      pages.push({ path: a.pathname, title: (a.firstChild && a.firstChild.textContent || "").trim(), slug: lastSegment(a.pathname) });
    });
    var asked = document.documentElement.getAttribute("data-asked");
    if (!asked) return;
    var found = closestPage(asked, pages);
    if (!found) return;
    var exact = found.path === asked && asked !== location.pathname;
    var link = match.querySelector("a");
    var title = match.querySelector(".nf-title");
    var path = match.querySelector(".nf-path");
    var ref = match.querySelector(".ref");
    if (!link || !title || !path || !ref) return;
    link.setAttribute("href", found.path + location.hash);
    title.textContent = found.title;
    path.textContent = found.path;
    ref.textContent = exact ? "OPENING" : "CLOSEST";
    match.hidden = false;
  }

  /** @param {string} path @returns {string} */
  function lastSegment(path) {
    var parts = path.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  /** Words a visitor may use for a section the site names differently.
   * @type {Record<string, string[]>} */
  var SECTION_WORDS = {
    "/notes/": ["blog", "posts", "post", "writing", "articles", "article", "journal", "feed", "rss", "atom", "rss.xml", "atom.xml", "feed.xml"],
    "/work/": ["projects", "project", "portfolio", "case-studies", "casestudies", "case-study", "cases", "case"],
    "/about/": ["cv", "resume", "bio", "me"],
    "/contact/": ["email", "mail", "hire"],
  };

  /**
   * The page an address most likely meant, or null when nothing is close enough.
   * @param {string} asked
   * @param {{ path: string, title: string, slug: string }[]} pages
   * @returns {{ path: string, title: string } | null}
   */
  function closestPage(asked, pages) {
    var slug = lastSegment(asked);
    /** @type {{ path: string, title: string, slug: string } | null} */
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      if (page.path === asked) return page;
      var whole = similarity(asked, page.path);
      var score = whole;
      if (slug.length >= 4 && page.slug.length >= 4) {
        // A link cut short, or a page asked for under the wrong section.
        if (page.slug.indexOf(slug) === 0) score = Math.max(score, 0.9);
        score = Math.max(score, 0.95 * similarity(slug, page.slug));
      }
      // A near tie goes to the closer whole address.
      score += whole / 1000;
      if (score > bestScore) {
        best = page;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0.75) return best;
    // Nothing close: offer the deepest page the address sits under, then the section
    // the address names by its own name or another word.
    var first = asked.split("/").filter(Boolean)[0] || "";
    /** @type {{ path: string, title: string, slug: string } | null} */
    var parent = null;
    for (var k = 0; k < pages.length; k++) {
      var p = pages[k];
      if (p.path !== "/" && asked.indexOf(p.path) === 0 && (!parent || p.path.length > parent.path.length)) parent = p;
    }
    if (parent) return parent;
    for (var w = 0; w < pages.length; w++) {
      var q = pages[w];
      var words = SECTION_WORDS[q.path] || [];
      var top = q.path.split("/").length === 3;
      if (top && (words.indexOf(first) >= 0 || (first.length >= 3 && similarity(first, q.slug) >= 0.75))) return q;
    }
    return null;
  }

  /** Optimal string alignment similarity: 1 for equal, 0 for nothing shared.
   * @param {string} a @param {string} b @returns {number} */
  function similarity(a, b) {
    if (a === b) return 1;
    var n = a.length;
    var m = b.length;
    if (!n || !m) return 0;
    /** @type {number[][]} */
    var d = [];
    for (var i = 0; i <= n; i++) {
      d[i] = [i];
      for (var j = 1; j <= m; j++) {
        if (!i) {
          d[i][j] = j;
          continue;
        }
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return 1 - d[n][m] / Math.max(n, m);
  }

  setupNotFound();
  setupNavigation();
  setupFocusVisibility();
  setupCapabilityMap();
  setupReveals();
  setupArticleContents();
  setupCopyEmail();
  setupShareLink();
  setupPageTransitions();
  setupArticlePrefetch();
})();
