/* Progressive enhancement only. Content works with JS disabled. */
(function () {
  "use strict";
  var rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setupNavigation() {
    const toggle = document.querySelector("button.nav-toggle");
    const nav = document.getElementById("primary-nav");
    if (toggle instanceof HTMLButtonElement && nav) {
      var drawerQ = window.matchMedia("(max-width: 720px)");
      /** @param {boolean} open */
      var setDrawer = function (open) {
        var hide = drawerQ.matches && !open;
        nav.setAttribute("data-open", String(open));
        toggle.setAttribute("aria-expanded", String(open));
        /* Hide the closed off-screen drawer from tab order and the a11y tree. */
        if (hide) {
          nav.setAttribute("aria-hidden", "true");
          nav.inert = true;
        } else {
          nav.removeAttribute("aria-hidden");
          nav.inert = false;
        }
      };
      setDrawer(false);
      if (drawerQ.addEventListener) {
        drawerQ.addEventListener("change", function () {
          setDrawer(nav.getAttribute("data-open") === "true");
        });
      }
      toggle.addEventListener("click", function () {
        setDrawer(nav.getAttribute("data-open") !== "true");
      });
      nav.addEventListener("click", function (e) {
        if (e.target instanceof Element && e.target.tagName === "A") {
          setDrawer(false);
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && nav.getAttribute("data-open") === "true") {
          toggle.focus();
          setDrawer(false);
        }
      });
    }
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

  setupNavigation();
  setupCapabilityMap();
  setupReveals();
  setupCopyEmail();
})();
