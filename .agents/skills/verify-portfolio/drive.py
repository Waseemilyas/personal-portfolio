#!/usr/bin/env python3
"""Drive the built portfolio through Chromium; retain evidence after teardown."""
import argparse, functools, hashlib, http.server, json, os, signal, socket, subprocess, threading, time, uuid
from pathlib import Path
from urllib.request import urlopen

parser = argparse.ArgumentParser()
parser.add_argument("--out", required=True, type=Path)
parser.add_argument("--url", help="Optional production origin; otherwise serve our _site on loopback")
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True, timeout=10).strip()
assert not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=root, timeout=10), "Use a clean checkout"
assert (root / "_site/revision.txt").read_text() == revision + "\n", "Build this revision first"
args.out = args.out.resolve()
args.out.mkdir(parents=True, exist_ok=False)
started = time.monotonic()
session = "portfolio-" + uuid.uuid4().hex[:12]
sessions = [session]
server = None
port = None
receipts = []
success = False
owned = {}
log = (args.out / "commands.log").open("w")
env = {**os.environ, "AGENT_BROWSER_DEFAULT_TIMEOUT": "15000", "AGENT_BROWSER_ARGS": "--mute-audio"}
# A page cannot be hit while a view transition between pages runs (about 0.3 s),
# so wait for any to finish before acting, as a visitor's next click would.
TRANSITION_DONE = "document.getAnimations().every(a => !String(a.effect && a.effect.pseudoElement || '').startsWith('::view-transition'))"
# Each agent-browser process costs about 50 ms before it does anything, so steps
# that always go together share one `batch` process.
def batch(*commands):
    """Run commands in order in one agent-browser process; fail at the first error."""
    begun = time.monotonic()
    result = subprocess.run(["agent-browser", "--session", session, "batch", "--bail", "--json"], input=json.dumps([list(c) for c in commands]),
                            cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=40 * len(commands))
    try: steps = json.loads(result.stdout)
    except ValueError: steps = []
    log.write(json.dumps({"batch": [list(c) for c in commands], "exit": result.returncode, "ms": round((time.monotonic() - begun) * 1000),
                          "errors": [step.get("error") for step in steps], "output": result.stderr if steps else result.stdout + result.stderr}) + "\n"); log.flush()
    assert result.returncode == 0 and len(steps) == len(commands) and all(step["success"] for step in steps), result.stdout + result.stderr
    return [(step["result"] or {}).get("result") for step in steps]
def run(*words):
    if words[0] in ("click", "press", "back", "hover", "focus"):
        batch(("wait", "--fn", TRANSITION_DONE), words)
        return ""
    command = ["agent-browser", "--session", session, *words]
    begun = time.monotonic()
    result = subprocess.run(command, cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=40)
    log.write(json.dumps({"command": list(words), "exit": result.returncode, "ms": round((time.monotonic() - begun) * 1000), "output": result.stdout}) + "\n"); log.flush()
    assert result.returncode == 0, result.stdout
    return result.stdout.strip()
def state(expression):
    return json.loads(json.loads(run("eval", "JSON.stringify(" + expression + ")")))
def require(expression):
    if state(expression) is not True:
        run("eval", "JSON.stringify({path:location.pathname,width:innerWidth,ready:document.readyState,nav:document.getElementById('primary-nav')?.outerHTML})")
        raise AssertionError(expression)

def check_entry_heading():
    require("""(() => {
        if (document.documentElement.classList.contains('onsite')) return false;
        for (let block = document.querySelector('main h1'); block; block = block.parentElement) {
            if (block.getAnimations().some(animation =>
                animation.effect.getKeyframes().some(frame => frame.opacity === '0'))) return false;
        }
        return !!document.querySelector('main h1');
    })()""")

NAV_CLOSED = "(!document.getElementById('primary-nav').matches(':popover-open') && getComputedStyle(document.getElementById('primary-nav')).visibility === 'hidden')"
NAV_SETTLED = "(document.getElementById('primary-nav').getAnimations().every(a=>a.playState==='finished') && getComputedStyle(document.getElementById('primary-nav')).transform==='matrix(1, 0, 0, 1, 0, 0)')"
MANUAL_COPY_VISIBLE = """(() => {
    const field = document.querySelector('.copy-email-manual[open] input');
    return !!field && field.getBoundingClientRect().height >= 44 && field.readOnly &&
        field.value === document.querySelector('.email-big').textContent.trim();
})()"""

def check_home_to_work():
    run("focus", ".hero .btn-ghost")
    run("press", "Enter")
    run("wait", "--fn", "location.hash === '#work' && document.activeElement === document.getElementById('work') && document.activeElement.getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom && document.activeElement.getBoundingClientRect().bottom <= innerHeight")
    run("press", "Tab")
    require("document.activeElement === document.querySelector('.worklist .workcard')")
    destination = state("document.activeElement.pathname")
    run("press", "Enter")
    run("wait", "--fn", "location.pathname === " + json.dumps(destination))

def check_capability(node):
    panel = '.capread[id="cap-' + node["key"] + '"]'
    require("document.querySelectorAll('.capread:not([hidden])').length === 1")
    require("document.querySelector(" + json.dumps(panel + ":not([hidden]) h3") + ").textContent === " + json.dumps(node["title"]))
    require("document.querySelector(" + json.dumps(panel + ":not([hidden]) p") + ").textContent === " + json.dumps(node["body"]))
    require("(document.querySelector(" + json.dumps(panel + " a") + ")?.getAttribute('href') ?? null) === " + json.dumps(node.get("reading")))
    require("document.querySelector('.trace.on').getAttribute('data-for') === " + json.dumps(node["key"]))
    for selector in [".capfig svg", ".cap-phone"]:
        tabs = selector + " .node[aria-selected=true]"
        require("document.querySelectorAll(" + json.dumps(tabs) + ").length === 1 && document.querySelector(" +
                json.dumps(tabs) + ").getAttribute('data-key') === " + json.dumps(node["key"]))
def processes():
    """(pid, start identity) of every process this run's browser session owns."""
    if Path("/proc").is_dir():
        for entry in Path("/proc").iterdir():
            if not entry.name.isdigit(): continue
            try:
                command = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
                executable = (entry / "comm").read_text().strip()
                if executable in ("agent-browser", "chrome", "chromium", "chrome_crashpad") and (session in command or (entry / "cwd").resolve() == root):
                    yield entry.name, (entry / "stat").read_text().split(") ", 1)[1].split()[19]
            except (FileNotFoundError, PermissionError, ProcessLookupError): pass
        return
    # macOS has no /proc: pgrep finds this run's session by its command line and ps
    # gives each pid's start time as its identity. Command lines are never printed.
    found = subprocess.run(["pgrep", "-f", session], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10).stdout.split()
    for pid in found:
        if int(pid) == os.getpid(): continue
        begun = subprocess.run(["ps", "-o", "lstart=", "-p", pid], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10).stdout.strip()
        if begun: yield pid, begun
def remember():
    # Retain exact PID/start identities owned by this session/profile, never a broad reap.
    owned.update(processes())

# Fonts and images loaded, every entry-motion block on screen fully shown, and no
# finite animation or transition still running (a tab's 160 ms colour change, say),
# so a screenshot shows the settled page rather than whichever frame it caught.
SETTLED = ("document.fonts.status === 'loaded' && Array.from(document.images).every(i => i.complete) && "
           "Array.from(document.querySelectorAll('[data-cal]')).filter(e => {const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).every(e=>getComputedStyle(e).opacity==='1') && "
           "document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity)")
def capture(name, checks=None, before=()):
    """Run `before`, wait for the page to settle, check it and take a screenshot, in one process.
    `checks` names further expressions that must be true; no horizontal overflow is always one."""
    checks = {"no horizontal overflow": "document.documentElement.scrollWidth <= innerWidth + 1", **(checks or {})}
    failed = "JSON.stringify([" + ", ".join("(" + expression + ") === true ? null : " + json.dumps(label) for label, expression in checks.items()) + "].filter(Boolean))"
    results = batch(*before, ("wait", "--fn", SETTLED), ("eval", failed), ("screenshot", str(args.out / (name + ".png"))))
    assert json.loads(results[-2]) == [], name + " failed: " + results[-2]

def abort(_sig, _frame): raise TimeoutError("browser path exceeded 300 seconds")
signal.signal(signal.SIGALRM, abort); signal.alarm(300)
try:
    if args.url:
        from urllib.parse import urlsplit
        u = urlsplit(args.url)
        assert u.scheme == "https" and u.hostname and not u.username and not u.password and u.path in ("", "/") and not u.query and not u.fragment
        base = args.url.rstrip("/")
    else:
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *_): pass
            # Like GitHub Pages, answer a missing address with the site's 404 page.
            def send_error(self, code, message=None, explain=None):
                page = root / "_site" / "404.html"
                if code != 404 or not page.is_file(): return super().send_error(code, message, explain)
                body = page.read_bytes()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD": self.wfile.write(body)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root / "_site")))
        port = server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:" + str(port)
    with urlopen(base + "/revision.txt?verify=" + session, timeout=10) as response:
        assert response.read().decode() == revision + "\n"
    run("open", base + "/")
    remember()
    run("set", "viewport", "1440", "900")
    run("set", "media", "light")
    check_entry_heading()
    run("reload")
    require("document.querySelector('meta[name=waseemilyas-revision]').content === " + json.dumps(revision))
    capture("desktop-home")
    # Operate actual nodes; compare the visible panel/connection state to authored data.
    nodes = json.loads((root / "src/_data/capabilities.json").read_text())["nodes"]
    check_capability(nodes[0])
    for i, node in enumerate(nodes):
        selector = '.capfig svg .node[data-key="' + node["key"] + '"]'
        run("scrollintoview", selector)
        # The map's block rises into place once scrolled to; a pointer placed
        # mid-rise lands on a neighbouring node, so wait until it has settled.
        run("wait", "--fn", "(() => { const b = document.querySelector(" + json.dumps(selector) + ").closest('[data-cal]'); return !b || (!b.classList.contains('cal-wait') && b.getAnimations().every(a => a.playState !== 'running')); })()")
        # scrollintoview returns before CSS smooth scrolling stops. Waiting for
        # the reveal alone leaves later nodes moving under the pointer too.
        run("eval", "new Promise(resolve => { const e = document.querySelector(" + json.dumps(selector) + "); let last, stable = 0; function frame() { const y = e.getBoundingClientRect().top; stable = y === last ? stable + 1 : 0; last = y; if (stable >= 8) resolve(true); else requestAnimationFrame(frame); } requestAnimationFrame(frame); })")
        if i % 3 == 0: run("hover", selector)
        elif i % 3 == 1:
            run("focus", selector); run("press", "Enter")
        else: run("click", selector)
        check_capability(node)
    run("focus", '.capfig svg .node[aria-selected=true]')
    run("press", "Home"); run("press", "Space")
    check_capability(nodes[0])
    # Frame the map at its own anchor after the browser has scrolled to the focused node.
    run("eval", "document.querySelector('#capability').scrollIntoView({block:'start', behavior:'instant'})")
    capture("desktop-capability")
    run("press", "ArrowRight")
    check_capability(nodes[1])
    run("press", "Tab")
    require("document.activeElement.matches('.capread:not([hidden])')")
    run("press", "Tab")
    require("document.activeElement.matches('.capread:not([hidden]) a')")
    run("press", "Enter")
    require("location.pathname === " + json.dumps(nodes[1]["reading"]))
    receipts.append("desktop capability map selects with pointer and keyboard; Tab reaches the selected reading link")
    nav = json.loads((root / "src/_data/site.json").read_text())["nav"]
    for item in nav:
        run("click", '#primary-nav a[href="' + item["url"] + '"]')
        require("location.pathname === " + json.dumps(item["url"]))
    receipts.append("all authored primary-navigation routes reached by click")
    for listing, prefix in [("/work/", "/work/cs-"), ("/notes/", "/notes/")]:
        run("open", base + listing)
        check_entry_heading()
        routes = state("Array.from(new Set(Array.from(document.querySelectorAll('main a[href]')).map(a=>a.getAttribute('href')).filter(h=>h.startsWith(" + json.dumps(prefix) + ") && h!==" + json.dumps(listing) + ")))")
        assert routes, "Expected published entries in " + listing
        for route in routes:
            run("click", 'main a[href="' + route + '"]')
            require("location.pathname === " + json.dumps(route))
            # A click within the site shows the article at once: no replayed entry rise.
            require("document.documentElement.classList.contains('onsite') && (document.querySelector('main h1').closest('[data-cal]')?.getAnimations() || []).every(a => a.animationName !== 'rise')")
            run("back")
        receipts.append(listing + ": clicked every listed entry and returned; each opened without replaying the entry motion")
    receipts.append("Home, Work and Notes show their main headings from first paint on direct visits")
    # Every generated HTML page is visited at desktop and phone dimensions, including 404.
    # The sweep checks layout, not motion: reduced motion shows each page's settled
    # state at once instead of waiting about 0.6 s per page for the entry rise to end.
    # Motion is walked above and below with the visitor's default settings.
    pages = sorted((root / "_site").rglob("*.html"))
    run("set", "media", "light", "reduced-motion")
    for width, height, label in [(1440, 900, "desktop"), (390, 844, "phone")]:
        run("set", "viewport", str(width), str(height))
        for i, page in enumerate(pages):
            route = "/" + str(page.relative_to(root / "_site"))
            if route.endswith("index.html"): route = route[:-10]
            checks = {"one titled h1": "document.querySelectorAll('h1').length === 1 && document.querySelector('h1').textContent.trim().length > 0",
                      "revision": "document.querySelector('meta[name=waseemilyas-revision]').content === " + json.dumps(revision)}
            if route.startswith("/work/cs-") or (route.startswith("/notes/") and route != "/notes/"):
                subject = "About your case study: " if route.startswith("/work/") else "About your note: "
                checks["reading contact"] = """(() => {
                    const link = document.querySelector('.reading-contact .email-big');
                    const copy = document.querySelector('.reading-contact .copy-email');
                    return link.getBoundingClientRect().height >= 44 && copy.getBoundingClientRect().height >= 44 &&
                        new URL(link.href).searchParams.get('subject') === """ + json.dumps(subject) + """ + document.querySelector('h1').textContent;
                })()"""
            if route.startswith("/work/cs-"):
                checks["datasheet placement"] = """(() => {
                    const sheet = document.querySelector('.casegrid .datasheet').getBoundingClientRect();
                    const prose = document.querySelector('.casegrid .prose').getBoundingClientRect();
                    return innerWidth < 861 ? prose.bottom <= sheet.top : prose.right <= sheet.left;
                })()"""
            capture(label + "-page-" + str(i), checks, before=[("open", base + route)])
        receipts.append(label + ": all " + str(len(pages)) + " generated pages loaded without horizontal overflow")
    run("set", "media", "light")
    home_actions_fit = """(() => {
        const links = [...document.querySelectorAll('.hero .actions a')];
        return links.length === 2 && links.every(link => {
            const rect = link.getBoundingClientRect();
            return rect.height >= 44 && rect.top >= document.querySelector('.topbar').getBoundingClientRect().bottom && rect.bottom <= innerHeight;
        });
    })()"""
    for width, height in [(320, 568), (667, 375), (844, 390)]:
        run("set", "viewport", str(width), str(height))
        capture(f"home-{width}x{height}", {"homepage actions fit": home_actions_fit}, before=[("open", base + "/")])
        check_home_to_work()
    receipts.append("at 320 × 568, 667 × 375 and 844 × 390 both homepage actions fit without scrolling; Read the work focuses the heading and Tab and Enter open the first case study")
    run("set", "viewport", "390", "844")
    run("open", base + "/")
    for node in nodes:
        selector = '.cap-phone .node[data-key="' + node["key"] + '"]'
        run("click", selector)
        check_capability(node)
    run("click", '.cap-phone .node[data-key="web"]')
    capture("phone-capability")
    run("set", "viewport", "1440", "900")
    check_capability(next(node for node in nodes if node["key"] == "web"))
    require("document.querySelector('.capfig svg .node[aria-selected=true]').getClientRects().length > 0")
    run("set", "viewport", "390", "844")
    check_capability(next(node for node in nodes if node["key"] == "web"))
    # Resizing wraps the tabs and moves the reading link below the viewport.
    run("eval", "document.querySelector('#cap-web a').scrollIntoView({block:'center', behavior:'instant'})")
    run("click", '#cap-web a')
    require("location.pathname === " + json.dumps(next(node["reading"] for node in nodes if node["key"] == "web")))
    receipts.append("phone capability tabs select all strands and follow a case study; selection survives the layout change")
    # The closed phone popover is out of the tab order and accessibility tree.
    run("open", base + "/")
    require(NAV_CLOSED + " && document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'false'")
    run("click", ".nav-toggle")
    run("wait", "--fn", NAV_SETTLED + " && document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'true' && document.getElementById('primary-nav').matches(':popover-open')")
    capture("phone-nav-open")
    run("press", "Escape")
    run("wait", "--fn", NAV_CLOSED)
    require("document.activeElement.matches('.nav-toggle') && document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'false'")
    run("click", ".nav-toggle")
    run("wait", "--fn", NAV_SETTLED)
    run("focus", "#primary-nav .cta")
    run("press", "Tab")
    run("wait", "--fn", NAV_CLOSED)
    require("document.activeElement.matches('main a.btn-primary')")
    run("click", ".nav-toggle")
    run("wait", "--fn", NAV_SETTLED)
    run("click", '#primary-nav a[href="/about/"]')
    run("wait", "--fn", "location.pathname === '/about/' && " + NAV_CLOSED)
    run("set", "viewport", "1440", "900")
    require("getComputedStyle(document.getElementById('primary-nav')).visibility === 'visible' && !document.getElementById('primary-nav').inert && !document.getElementById('primary-nav').hasAttribute('aria-hidden')")
    receipts.append("mobile drawer open/Escape focus/Tab into main/link close/desktop breakpoint state")
    run("set", "media", "light", "reduced-motion"); run("open", base + "/")
    require("!document.querySelector('.cal-wait') && Array.from(document.querySelectorAll('[data-cal]')).every(e=>getComputedStyle(e).opacity==='1') && document.getAnimations().every(a=>a.animationName!=='rise'&&a.animationName!=='fadein')")
    capture("desktop-reduced-motion")
    # Read-only contracts: never activate email or external destinations or play audio.
    for route, marker in [("/notes/feed.xml", b"<feed"), ("/sitemap.xml", b"<urlset"), ("/audio/adhan.mp3", b"ID3"), ("/audio/iftar.mp3", b"ID3"), ("/audio/sehri.mp3", b"ID3")]:
        with urlopen(base + route, timeout=10) as response:
            body = response.read()
            assert response.status == 200 and len(body) > 0
            if route.endswith(".xml"): assert marker in body
    run("open", base + "/contact/")
    require("document.querySelector('a[href^=\"mailto:\"]').href.startsWith('mailto:')")
    require("Array.from(document.querySelectorAll('a[href^=\"mailto:\"]')).every(a=>new URL(a.href).searchParams.get('subject'))")
    # The copy button copies to the clipboard, never sends anything; headless Chrome may
    # refuse the write, so either outcome must be announced to the visitor.
    require("!document.querySelector('button.copy-email').hidden")
    run("click", "button.copy-email")
    run("wait", "--fn", "document.querySelector('.email-row [role=status]').textContent !== ''")
    require("document.querySelector('.email-row [role=status]').textContent === 'Email address copied.' || " + MANUAL_COPY_VISIBLE)
    receipts.append("contact email links carry a subject; copy button shown, clicked and announced: " + run("eval", "document.querySelector('.email-row [role=status]').textContent"))
    run("set", "viewport", "390", "844")
    run("reload")
    run("eval", "Object.defineProperty(navigator.clipboard, 'writeText', {value: () => Promise.reject(new DOMException('Test denial', 'NotAllowedError'))})")
    run("focus", "button.copy-email")
    run("press", "Enter")
    run("wait", "--fn", MANUAL_COPY_VISIBLE)
    capture("phone-contact-manual-copy", {
        "manual instructions in view": "document.getElementById('email-copy-instructions').checkVisibility() && document.getElementById('email-copy-instructions').getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom",
        "address focused and selected": "document.activeElement.matches('.copy-email-manual input') && document.activeElement.selectionStart === 0 && document.activeElement.selectionEnd === document.activeElement.value.length",
    })
    receipts.append("clipboard refusal on Contact reveals manual instructions, focuses the read-only address and selects its full value")
    # A link mangled by a chat app opens its page; a misspelt one is offered the closest page.
    run("open", base + "/Work/CS-Care)")
    run("wait", "--fn", "location.pathname === '/work/cs-care/'")
    run("open", base + "/notes/unglamorus-half-of-automation/")
    require("document.querySelector('h1').textContent.includes('slipped') && !document.querySelector('[data-not-found-match]').hidden && document.querySelector('[data-not-found-match] a').getAttribute('href') === '/notes/unglamorous-half-of-automation/'")
    capture("desktop-not-found-closest")
    run("click", "[data-not-found-match] a")
    require("location.pathname === '/notes/unglamorous-half-of-automation/'")
    receipts.append("not-found page opened /Work/CS-Care) as /work/cs-care/ and offered and followed the closest note for a misspelt address")
    run("set", "viewport", "1440", "900")
    require("""(() => {
        const rail = document.querySelector('.notegrid > .article-contents').getBoundingClientRect();
        return rail.left >= document.querySelector('.notegrid > .prose').getBoundingClientRect().right && !document.querySelector('.article-contents [aria-current]');
    })()""")
    run("click", ".article-contents li:nth-child(4) a")
    run("wait", "--fn", """(() => {
        const link = document.querySelector('.article-contents li:nth-child(4) a'), rail = document.querySelector('.article-contents').getBoundingClientRect();
        return link.getAttribute('aria-current') === 'location' && document.querySelectorAll('.article-contents [aria-current]').length === 1 &&
            document.activeElement.id === link.hash.slice(1) && rail.top >= document.querySelector('.topbar').getBoundingClientRect().bottom && rail.bottom <= innerHeight;
    })()""")
    capture("desktop-note-rail")
    receipts.append("desktop note: On this page sits beside the text, stays in view after a jump, and marks only the section it opened")
    run("set", "viewport", "390", "844")
    run("open", base + "/work/cs-care/")
    run("click", ".article-contents summary")
    run("click", '.article-contents a[href="#section-outcome"]')
    run("wait", "--fn", """(() => {
        const contents = document.querySelector('.article-contents');
        const outcome = document.getElementById('section-outcome');
        const rail = contents.getBoundingClientRect();
        return !contents.open && document.activeElement === outcome &&
            contents.querySelector('[aria-current="location"]')?.hash === '#section-outcome' &&
            rail.top >= document.querySelector('.topbar').getBoundingClientRect().bottom - 1 &&
            rail.bottom < outcome.getBoundingClientRect().top;
    })()""")
    capture("phone-article-position")
    run("focus", ".article-contents summary")
    run("press", "Enter")
    capture("phone-article-contents")
    run("press", "Tab")
    require("document.activeElement.matches('.article-contents a')")
    run("press", "Escape")
    require("document.activeElement.matches('.article-contents:not([open]) summary')")
    run("press", "Enter")
    run("click", '.article-contents a[href="#section-role"]')
    run("wait", "--fn", "document.activeElement.id === 'section-role' && !document.querySelector('.article-contents').open")
    receipts.append("phone case study: On this page stays visible after a jump, indicates the current section and lets readers jump again; Escape returns focus to the control")
    run("open", base + "/notes/unglamorous-half-of-automation/")
    run("focus", ".reading-contact .email-big")
    run("press", "Tab")
    require("document.activeElement.matches('.reading-contact .copy-email')")
    run("press", "Enter")
    run("wait", "--fn", "document.querySelector('.reading-contact [role=status]').textContent !== ''")
    receipts.append("Tab and Enter reached Copy address on a note: " + run("eval", "document.querySelector('.reading-contact [role=status]').textContent"))
    # At short viewport height, reverse Tab must scroll the address clear of the sticky bar.
    run("set", "viewport", "390", "320")
    run("open", base + "/contact/?verify-keyboard=" + session)
    run("press", "Tab")
    require("document.activeElement.matches('.skip')")
    run("press", "Enter")
    require("location.hash === '#main' && document.activeElement === document.querySelector('main')")
    run("press", "Tab")
    require("document.activeElement.matches('.email-big')")
    run("press", "Tab")
    require("document.activeElement.matches('button.copy-email')")
    run("eval", "scrollBy({top: document.querySelector('.email-big').getBoundingClientRect().bottom + 5, behavior: 'instant'})")
    run("press", "Shift+Tab")
    require("document.activeElement.matches('.email-big') && document.activeElement.getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom")
    capture("phone-short-contact-focus")
    receipts.append("skip link focuses main; Tab and reverse Tab reach the visible contact link at 390×320")
    errors = run("errors")
    assert errors in ("", "No errors", "No page errors", "[]"), errors
    remember(); run("close")

    session += "-forced"; sessions.append(session)
    browser_args = env["AGENT_BROWSER_ARGS"]
    env["AGENT_BROWSER_ARGS"] += ",--force-high-contrast"
    run("set", "viewport", "1440", "900")
    run("set", "media", "light", "reduced-motion")
    run("open", base + "/#capability")
    require("matchMedia('(forced-colors: active)').matches")
    require("getComputedStyle(document.querySelector('.nav [aria-current=page]')).textDecorationLine === 'underline'")
    require("getComputedStyle(document.querySelector('.worklist .workcard + .workcard')).borderBlockStartStyle === 'solid'")
    require("""(() => {
        const foreground = getComputedStyle(document.body).color;
        const background = getComputedStyle(document.body).backgroundColor;
        const svg = document.querySelector('.capfig svg');
        return svg.querySelectorAll('.node text').length === 5 &&
            [...svg.querySelectorAll('.node text')].every(label => getComputedStyle(label).fill === foreground) &&
            [...svg.querySelectorAll('.node .ring')].every(ring => getComputedStyle(ring).fill === background) &&
            [...svg.querySelectorAll('.trace')].every(trace => getComputedStyle(trace).stroke === foreground);
    })()""")
    capture("forced-desktop-capability")
    run("focus", '.capfig svg .node[aria-selected="true"]')
    run("press", "ArrowRight")
    check_capability(nodes[1])
    require("getComputedStyle(document.querySelector('.capfig svg .node[aria-selected=true] text')).textDecorationLine === 'underline'")
    receipts.append("forced colors desktop: current page, Work row edges and map labels visible; arrow key moves visible selection")

    run("set", "viewport", "390", "844")
    run("open", base + "/?forced=phone#capability")
    capture("forced-phone-capability")
    run("focus", '.cap-phone .node[aria-selected="true"]')
    run("press", "ArrowRight")
    check_capability(nodes[1])
    require("getComputedStyle(document.querySelector('.cap-phone .node[aria-selected=true]')).textDecorationLine === 'underline' && getComputedStyle(document.querySelector('.cap-phone .node[aria-selected=false]')).textDecorationLine === 'none'")
    run("open", base + "/automancer/")
    require("getComputedStyle(document.querySelector('.diagram-panel .diagram-phone')).display !== 'none' && getComputedStyle(document.querySelector('.diagram-panel .djoin')).borderInlineStartStyle === 'solid'")
    run("set", "viewport", "1440", "900")
    require("""(() => {
        const diagram = document.querySelector('.diagram-panel svg');
        const foreground = getComputedStyle(document.body).color;
        return getComputedStyle(diagram).display !== 'none' &&
            getComputedStyle(diagram.querySelector('.wf-node-live text')).fill === foreground &&
            getComputedStyle(diagram.querySelector('.wf-trace')).stroke === foreground;
    })()""")
    receipts.append("forced colors narrow and wide: native tabs show selection after a key press; workflow nodes and connectors stay visible")
    for case in ("cs-auto", "cs-care", "cs-product"):
        run("open", base + "/work/" + case + "/")
        require("""(() => {
            const diagram = document.querySelector('.figure svg');
            const foreground = getComputedStyle(document.body).color;
            return getComputedStyle(diagram).display !== 'none' &&
                [...diagram.querySelectorAll('text, marker path')].every(element => getComputedStyle(element).fill === foreground) &&
                [...diagram.querySelectorAll('g[marker-end] path')].every(path => getComputedStyle(path).stroke === foreground);
        })()""")
    receipts.append("forced colors: labels and arrows are visible in all three case-study diagrams")
    remember(); run("close")
    env["AGENT_BROWSER_ARGS"] = browser_args

    # A fresh browser disables author scripts before load, including cached assets.
    session += "-nojs"; sessions.append(session)
    env["AGENT_BROWSER_ARGS"] += ",--blink-settings=scriptEnabled=false"
    run("set", "viewport", "390", "844")
    run("open", base + "/?nojs=" + session)
    require("document.getElementById('primary-nav').getAttribute('data-open') === null && !document.querySelector('.nav-toggle').hasAttribute('aria-expanded')")
    run("press", "Tab")
    require("document.activeElement.matches('.skip')")
    run("press", "Enter")
    require("location.hash === '#main' && document.activeElement === document.querySelector('main')")
    receipts.append("JavaScript-disabled skip link focuses main")
    check_home_to_work()
    run("focus", ".article-contents summary")
    run("press", "Enter")
    run("focus", 'a[href="#case-datasheet"]')
    run("press", "Enter")
    run("wait", "--fn", """(() => {
        const heading = document.getElementById('case-datasheet');
        const rect = heading.getBoundingClientRect();
        return location.hash === '#case-datasheet' && document.activeElement === heading &&
            rect.top >= document.querySelector('.topbar').getBoundingClientRect().bottom && rect.bottom <= innerHeight;
    })()""")
    require("document.querySelector('.reading-contact button.copy-email').hidden && document.querySelector('.reading-contact .email-big').getBoundingClientRect().height >= 44")
    receipts.append("JavaScript-disabled Read the work opens the first case study; its Datasheet link focuses the visible heading")
    run("focus", ".reading-contact .copy-email-manual summary")
    run("press", "Enter")
    run("wait", "--fn", MANUAL_COPY_VISIBLE)
    run("press", "Tab")
    require("document.activeElement.matches('.reading-contact .copy-email-manual input')")
    receipts.append("JavaScript-disabled case study opens the native manual copy control and tabs into the read-only email address")
    run("open", base + "/?nojs=" + session)
    # The header menu works with no script: open, Escape, open again and follow a link.
    require(NAV_CLOSED)
    run("click", ".nav-toggle")
    run("wait", "--fn", NAV_SETTLED + " && document.getElementById('primary-nav').matches(':popover-open')")
    run("press", "Escape")
    run("wait", "--fn", NAV_CLOSED)
    run("click", ".nav-toggle")
    run("wait", "--fn", NAV_SETTLED)
    run("click", '#primary-nav a[href="/notes/"]')
    require("location.pathname === '/notes/'")
    run("back")
    # With no script to close it on the link, Back restores the page as it was left:
    # menu open. Escape (or a tap elsewhere) closes it.
    run("press", "Escape")
    run("wait", "--fn", NAV_CLOSED)
    receipts.append("JavaScript-disabled phone header menu opens, closes on Escape and follows a link")
    require("document.querySelector('.capfig').hidden")
    require("Array.from(document.querySelectorAll('.capread')).every(panel => panel.getClientRects().length > 0)")
    require("Array.from(document.querySelectorAll('.capread h3')).map(h => h.textContent).join('|') === " + json.dumps("|".join(node["title"] for node in nodes)))
    require("Array.from(document.querySelectorAll('.capread p')).map(p => p.textContent).join('|') === " + json.dumps("|".join(node["body"] for node in nodes)))
    require("Array.from(document.querySelectorAll('.capread a')).map(a => a.getAttribute('href')).join('|') === " + json.dumps("|".join(node["reading"] for node in nodes if "reading" in node)))
    run("click", '.capread a')
    require("location.pathname === " + json.dumps(nodes[0]["reading"]))
    run("back")
    # Smooth scrolling runs at that one frame a second too, and a click mid-scroll
    # lands on whatever is passing under the pointer: jump straight to the target.
    run("eval", "document.querySelector('.foot .fnav a[href=\"/about/\"]').scrollIntoView({block: 'center', behavior: 'instant'})")
    run("wait", "--fn", "(()=>{const r=document.querySelector('.foot .fnav a[href=\"/about/\"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()")
    # Chrome renders about one frame a second with author scripts disabled, and
    # Page.captureScreenshot never returns, so this step checks the DOM only.
    require("document.documentElement.scrollWidth <= innerWidth + 1")
    receipts.append("phone-nojs-footer: no screenshot (Chrome cannot capture with scripts disabled); footer in view without overflow")
    run("click", '.foot .fnav a[href="/about/"]')
    require("location.pathname === '/about/'")
    receipts.append("JavaScript-disabled phone page: all capability text and links visible, a note and footer navigation open")
    run("open", base + "/notes/unglamorus-half-of-automation/?nojs=" + session)
    require("document.querySelector('[data-not-found-match]').hidden && document.querySelectorAll('[data-page-index] a').length === " + json.dumps(len([p for p in (root / "_site").rglob("index.html")])))
    listed = '[data-page-index] a[href="/notes/unglamorous-half-of-automation/"]'
    run("eval", "document.querySelector(" + json.dumps(listed) + ").scrollIntoView({block: 'center', behavior: 'instant'})")
    run("wait", "--fn", "(()=>{const r=document.querySelector(" + json.dumps(listed) + ").getBoundingClientRect();return r.top>=document.querySelector('.topbar').getBoundingClientRect().bottom&&r.bottom<=innerHeight})()")
    run("click", listed)
    run("wait", "--fn", "location.pathname === '/notes/unglamorous-half-of-automation/'")
    receipts.append("JavaScript-disabled not-found page lists every page and follows one")
    errors = run("errors")
    assert errors in ("", "No errors", "No page errors", "[]"), errors
    receipts.append("feed/sitemap/audio HTTP bodies present; contact links inspected without sending")
    success = True
finally:
    signal.alarm(0)
    remember()
    try: run("close")
    finally:
        if server:
            server.shutdown(); server.server_close()
        survivors = []
        alive = {}
        for pid in owned:
            if Path("/proc").is_dir():
                try: alive[pid] = (Path("/proc") / pid / "stat").read_text().split(") ", 1)[1].split()[19]
                except FileNotFoundError: pass
            else:
                alive[pid] = subprocess.run(["ps", "-o", "lstart=", "-p", pid], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10).stdout.strip()
        survivors = [pid for pid, start in owned.items() if alive.get(pid) == start]
        if port:
            with socket.socket() as probe: assert probe.connect_ex(("127.0.0.1", port)) != 0
        result = {"success": success and not survivors, "revision": revision, "sessions": sessions, "base": base if 'base' in locals() else None, "elapsed_seconds": time.monotonic()-started, "receipts": receipts, "owned_pid_identities": owned, "survivors": survivors, "port": port, "port_closed": True if port else None, "screenshots": sorted(p.name for p in args.out.glob("*.png"))}
        (args.out / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        log.close()
        assert not survivors, "Owned processes survived: " + str(survivors)
print(json.dumps(result))
