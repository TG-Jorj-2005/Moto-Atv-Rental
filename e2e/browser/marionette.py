"""Minimal Marionette client (stdlib only): drives a real, headless Firefox (needs `firefox` on the PATH).
The window cannot be narrower than 500 px, so phone widths are measured with `phone_probe` (an iframe of the exact width)."""
import json, socket, subprocess, tempfile, time, os, shutil, base64
EL = "element-6066-11e4-a52e-4f735466cecf"
class Browser:
    def __init__(self, size=(1366, 900), download_dir=None, port=2828, css_width=None):
        self.prof = tempfile.mkdtemp(prefix="ffprof")
        prefs = [('marionette.port', port), ('browser.shell.checkDefaultBrowser', 'false')]
        if css_width:  # the headless window cannot be narrower than 500 px: scale it so that the layout width is css_width CSS px
            size = (500, size[1]); prefs.append(('layout.css.devPixelsPerPx', f'"{500 / css_width}"'))
        if download_dir:
            os.makedirs(download_dir, exist_ok=True)
            for k, v in [("browser.download.folderList", 2), ("browser.download.dir", f'"{download_dir}"'), ("browser.helperApps.neverAsk.saveToDisk", '"text/csv"'), ("browser.download.useDownloadDir", "true")]:
                prefs.append((k, v))
        with open(os.path.join(self.prof, "user.js"), "w") as f:
            for k, v in prefs: f.write(f'user_pref("{k}", {v});\n')
        self.proc = subprocess.Popen(["firefox", "--headless", "--no-remote", "--marionette", f"--window-size={size[0]},{size[1]}", "-profile", self.prof], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try: self.s = socket.create_connection(("127.0.0.1", port)); break
            except OSError: time.sleep(0.2)
        self.buf = b""; self.id = 0
        self._read()  # handshake
        self.cmd("WebDriver:NewSession", {"capabilities": {}})
        self.cmd("WebDriver:SetWindowRect", {"width": size[0], "height": size[1]})
    def _read(self):
        while b":" not in self.buf: self.buf += self.s.recv(65536)
        n, rest = self.buf.split(b":", 1); n = int(n)
        while len(rest) < n: rest += self.s.recv(65536)
        self.buf = rest[n:]; return json.loads(rest[:n])
    def cmd(self, name, params=None):
        self.id += 1; msg = json.dumps([0, self.id, name, params or {}]).encode()
        self.s.sendall(str(len(msg)).encode() + b":" + msg)
        while True:
            r = self._read()
            if r[0] == 1 and r[1] == self.id:
                if r[2]: raise RuntimeError(f"{name}: {r[2]}")
                return r[3]
    def get(self, url): self.cmd("WebDriver:Navigate", {"url": url})
    def url(self): return self.cmd("WebDriver:GetCurrentURL")["value"]
    def js(self, script, *args): return self.cmd("WebDriver:ExecuteScript", {"script": script, "args": list(args)})["value"]
    def find(self, css): return self.cmd("WebDriver:FindElement", {"using": "css selector", "value": css})["value"][EL]
    def finds(self, css): return [e[EL] for e in self.cmd("WebDriver:FindElements", {"using": "css selector", "value": css})]
    def click(self, css_or_id):
        el = css_or_id if len(css_or_id) > 20 and " " not in css_or_id and "." not in css_or_id and "[" not in css_or_id and "#" not in css_or_id else self.find(css_or_id)
        self.cmd("WebDriver:ElementClick", {"id": el})
    def type(self, css, text, clear=True):
        el = self.find(css)
        if clear: self.cmd("WebDriver:ElementClear", {"id": el})
        self.cmd("WebDriver:ElementSendKeys", {"id": el, "text": text})
    def text(self): return self.js("return document.body.innerText")
    def shot(self, path):
        d = self.cmd("WebDriver:TakeScreenshot", {"full": True})["value"]; open(path, "wb").write(base64.b64decode(d))
    def wait_url(self, part, t=15):
        end = time.time() + t
        while time.time() < end:
            if part in self.url(): return True
            time.sleep(0.2)
        return False
    def close(self):
        try: self.cmd("Marionette:Quit")
        except Exception: pass
        try: self.proc.wait(10)
        except Exception: self.proc.kill()
        shutil.rmtree(self.prof, ignore_errors=True)
