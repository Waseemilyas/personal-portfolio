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
    var nodes = Array.from(document.querySelectorAll(".node"));
    if (nodes.length) {
      var traces = Array.from(document.querySelectorAll(".trace"));
      var bind = {
        k: document.querySelector("[data-bind=k]"),
        h: document.querySelector("[data-bind=h]"),
        p: document.querySelector("[data-bind=p]")
      };
      /** @param {Element} node */
      var activate = function (node) {
        if (!bind.k || !bind.h || !bind.p) return;
        var key = node.getAttribute("data-key");
        bind.k.textContent = node.getAttribute("data-code");
        bind.h.textContent = node.getAttribute("data-title");
        bind.p.textContent = node.getAttribute("data-body");
        nodes.forEach(function (n) { n.classList.toggle("on", n === node); });
        traces.forEach(function (t) { t.classList.toggle("on", t.getAttribute("data-for") === key); });
      };
      nodes.forEach(function (n) {
        n.addEventListener("mouseenter", function () { activate(n); });
        n.addEventListener("focus", function () { activate(n); });
        n.addEventListener("click", function () { activate(n); });
        n.addEventListener("keydown", function (e) {
          if (e instanceof KeyboardEvent && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); activate(n); }
        });
      });
    }
  }

  setupNavigation();
  setupReveals();
  setupCapabilityMap();
})();
