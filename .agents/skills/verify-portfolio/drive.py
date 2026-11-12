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
def run(*words):
    command = ["agent-browser", "--session", session, *words]
    result = subprocess.run(command, cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=40)
    log.write(json.dumps({"command": list(words), "exit": result.returncode, "output": result.stdout}) + "\n"); log.flush()
    assert result.returncode == 0, result.stdout
    return result.stdout.strip()
def state(expression):
    return json.loads(json.loads(run("eval", "JSON.stringify(" + expression + ")")))
def require(expression):
    if state(expression) is not True:
        run("eval", "JSON.stringify({path:location.pathname,width:innerWidth,ready:document.readyState,nav:document.getElementById('primary-nav')?.outerHTML})")
        raise AssertionError(expression)
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

def capture(name, image_optional=False):
    run("wait", "--fn", "document.fonts.status === 'loaded' && Array.from(document.images).every(i => i.complete)")
    run("wait", "--fn", "Array.from(document.querySelectorAll('[data-cal]')).filter(e => {const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).every(e=>getComputedStyle(e).opacity==='1')")
    require("document.documentElement.scrollWidth <= innerWidth + 1")
    try:
        run("screenshot", str(args.out / (name + ".png")))
    except AssertionError as error:
        # Chrome's Page.captureScreenshot hangs once author scripts are disabled
        # (--blink-settings=scriptEnabled=false), on every page. The DOM checks
        # above and the click that follows still prove the no-JS journey.
        # On macOS the same hang surfaces as the daemon never answering.
        if not image_optional or not any(m in str(error) for m in ("Page.captureScreenshot", "no response came back")): raise
        receipts.append(name + ": screenshot unavailable (Chrome cannot capture with scripts disabled); DOM checks passed")

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
    run("reload")
    require("document.querySelector('meta[name=waseemilyas-revision]').content === " + json.dumps(revision))
    capture("desktop-home")
    # Operate actual nodes; compare the visible panel/connection state to authored data.
    nodes = json.loads((root / "src/_data/capabilities.json").read_text())["nodes"]
    for i, node in enumerate(nodes):
        selector = '.node[data-key="' + node["key"] + '"]'
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
        require("document.querySelector('[data-bind=h]').textContent === " + json.dumps(node["title"]))
        require("document.querySelector('[data-bind=p]').textContent === " + json.dumps(node["body"]))
        require("document.querySelectorAll('.node.on').length === 1 && document.querySelector('.trace.on').getAttribute('data-for') === " + json.dumps(node["key"]))
    run("focus", '.node[data-key="' + nodes[0]["key"] + '"]'); run("press", "Space")
    require("document.querySelector('[data-bind=h]').textContent === " + json.dumps(nodes[0]["title"]))
    capture("desktop-capability")
    receipts.append("capability hover/click/focus/Enter/Space changed actual panel and traces")
    nav = json.loads((root / "src/_data/site.json").read_text())["nav"]
    for item in nav:
        run("click", '#primary-nav a[href="' + item["url"] + '"]')
        require("location.pathname === " + json.dumps(item["url"]))
    receipts.append("all authored primary-navigation routes reached by click")
    for listing, prefix in [("/work/", "/work/cs-"), ("/notes/", "/notes/")]:
        run("open", base + listing)
        routes = state("Array.from(new Set(Array.from(document.querySelectorAll('main a[href]')).map(a=>a.getAttribute('href')).filter(h=>h.startsWith(" + json.dumps(prefix) + ") && h!==" + json.dumps(listing) + ")))")
        assert routes, "Expected published entries in " + listing
        for route in routes:
            run("click", 'main a[href="' + route + '"]')
            require("location.pathname === " + json.dumps(route))
            run("back")
        receipts.append(listing + ": clicked every listed entry and returned")
    # Every generated HTML page is visited at desktop and phone dimensions, including 404.
    pages = sorted((root / "_site").rglob("*.html"))
    for width, height, label in [(1440, 900, "desktop"), (390, 844, "phone")]:
        run("set", "viewport", str(width), str(height))
        for i, page in enumerate(pages):
            route = "/" + str(page.relative_to(root / "_site"))
            if route.endswith("index.html"): route = route[:-10]
            run("open", base + route)
            require("document.querySelectorAll('h1').length === 1 && document.querySelector('h1').textContent.trim().length > 0")
            require("document.querySelector('meta[name=waseemilyas-revision]').content === " + json.dumps(revision))
            capture(label + "-page-" + str(i))
        receipts.append(label + ": all " + str(len(pages)) + " generated pages loaded without horizontal overflow")
    run("open", base + "/")
    require("document.getElementById('primary-nav').inert === true")
    run("click", ".nav-toggle")
    require("document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'true' && !document.getElementById('primary-nav').inert")
    capture("phone-nav-open")
    run("press", "Escape")
    require("document.activeElement.matches('.nav-toggle') && document.getElementById('primary-nav').inert && document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'false'")
    run("click", ".nav-toggle")
    run("wait", "--fn", "document.getElementById('primary-nav').getAnimations().every(a=>a.playState==='finished') && getComputedStyle(document.getElementById('primary-nav')).transform==='matrix(1, 0, 0, 1, 0, 0)'")
    run("click", '#primary-nav a[href="/about/"]')
    run("wait", "--fn", "location.pathname === '/about/' && document.getElementById('primary-nav').inert")
    require("location.pathname === '/about/' && document.getElementById('primary-nav').inert")
    run("set", "viewport", "1440", "900")
    require("!document.getElementById('primary-nav').inert && !document.getElementById('primary-nav').hasAttribute('aria-hidden')")
    receipts.append("mobile drawer open/Escape focus/link close/desktop breakpoint state")
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
    require("['Email address copied.','Could not copy. Select the address to copy it.'].includes(document.querySelector('.email-row [role=status]').textContent)")
    receipts.append("contact email links carry a subject; copy button shown, clicked and announced: " + run("eval", "document.querySelector('.email-row [role=status]').textContent"))
    errors = run("errors")
    assert errors in ("", "No errors", "No page errors", "[]"), errors
    remember(); run("close")
    # A fresh browser disables author scripts before load, including cached assets.
    session += "-nojs"; sessions.append(session)
    env["AGENT_BROWSER_ARGS"] += ",--blink-settings=scriptEnabled=false"
    run("set", "viewport", "390", "844")
    run("open", base + "/?nojs=" + session)
    require("document.getElementById('primary-nav').getAttribute('data-open') === null")
    require("document.querySelector('[data-bind=h]').textContent === " + json.dumps(nodes[0]["title"]))
    run("scrollintoview", '.foot .fnav a[href="/about/"]')
    run("wait", "--fn", "(()=>{const r=document.querySelector('.foot .fnav a[href=\"/about/\"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()")
    capture("phone-nojs-footer", image_optional=True)
    run("click", '.foot .fnav a[href="/about/"]')
    require("location.pathname === '/about/'")
    receipts.append("JavaScript-disabled phone page: static capability text and footer navigation work")
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
