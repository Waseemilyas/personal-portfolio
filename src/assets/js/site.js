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
        toggle.setAttribute("aria-expanded", String(/** @type {ToggleEvent} */ (e).newState === "open"));
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

  /* First-screen blocks (data-cal="0".."4") and corner marks animate in CSS alone.
     This only defers below-the-fold blocks: one already on screen is never hidden,
     and one hidden here rises once its top crosses 88% of the viewport. */
  function setupReveals() {
    if (rm || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.replace("cal-wait", "in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    document.querySelectorAll('[data-cal=""]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) return;
      el.classList.add("cal-wait");
      io.observe(el);
    });
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

  /* The big address is a mail link, which does nothing for a visitor with no mail
     app set up. Show its copy button only where the browser can copy. */
  function setupCopyEmail() {
    var clipboard = navigator.clipboard;
    if (!clipboard || !window.isSecureContext) return;
    document.querySelectorAll("button.copy-email").forEach(function (button) {
      var status = button.nextElementSibling;
      var address = button.getAttribute("data-copy");
      if (button instanceof HTMLButtonElement && status && address) bindCopy(clipboard, button, status, address);
    });
  }

  /** @param {Clipboard} clipboard @param {HTMLButtonElement} button @param {Element} status @param {string} address */
  function bindCopy(clipboard, button, status, address) {
    var label = button.textContent || "";
    /** @type {number | undefined} */
    var timer;
    /** @param {string} text @param {string} said @param {boolean} copied */
    var show = function (text, said, copied) {
      button.textContent = text;
      button.toggleAttribute("data-copied", copied);
      status.textContent = said;
    };
    button.hidden = false;
    button.addEventListener("click", function () {
      window.clearTimeout(timer);
      clipboard.writeText(address).then(function () {
        show("Copied ✓", "Email address copied.", true);
      }, function () {
        show(label, "Could not copy. Select the address to copy it.", false);
      }).then(function () {
        timer = window.setTimeout(function () { show(label, "", false); }, 2500);
      });
    });
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
        var title = a.querySelector("h2, h3, .nextread-t") || a.closest(".note-item h2");
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

  setupNavigation();
  setupCapabilityMap();
  setupReveals();
  setupCopyEmail();
  setupPageTransitions();
})();
