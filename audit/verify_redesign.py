"""Verify the CrewNest marketplace redesign across widths, interaction, regressions."""
import os, httpx
from playwright.sync_api import sync_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "http://127.0.0.1:8001"
SHOTS = r"C:\JobHustle\audit\screenshots\redesign"
os.makedirs(SHOTS, exist_ok=True)
PW = "DemoPass123!"

results = []
def chk(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), name, detail)

def shot(pg, name):
    path = os.path.join(SHOTS, name + ".png")
    pg.screenshot(path=path, full_page=True)
    print("  saved", name + ".png")

def login_ui(pg, email):
    pg.goto(BASE + "/login")
    pg.wait_for_selector("#login-form", timeout=8000)
    pg.fill("#l-email", email); pg.fill("#l-pass", PW)
    pg.click(".mi-login-submit")
    for _ in range(40):
        try:
            if "/home" in pg.url or "provider-home" in pg.url: return
        except Exception: pass
        pg.wait_for_timeout(300)

def inject_auth(ctx, access_token, user_id, role, full_name):
    import json as _j
    data = {"access_token": access_token, "token_type": "bearer",
            "user_id": user_id, "role": role, "full_name": full_name}
    ctx.add_init_script("localStorage.setItem('crewneat.auth', " + _j.dumps(_j.dumps(data)) + ");")

def no_hscroll(pg):
    return not pg.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)

    # ===== A) Login screen at all widths =====
    for w in (390, 768, 1440, 1920):
        c = b.new_context(viewport={"width":w,"height":900})
        pg = c.new_page()
        errs=[]
        pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.goto(BASE + "/login", wait_until="load", timeout=15000)
        pg.wait_for_selector(".mi-login", timeout=8000)
        chk(f"login @{w} mi-login renders", pg.locator(".mi-login").count()==1)
        chk(f"login @{w} no h-scroll", no_hscroll(pg))
        chk(f"login @{w} form + demo present", pg.locator("#login-form").count()==1 and pg.locator(".mi-login-demo").count()==1)
        chk(f"login @{w} no console errors", len(errs)==0, str(errs))
        # brand panel hidden on mobile, visible desktop
        brand_vis = pg.locator(".mi-login-brand").is_visible()
        # desktop (>=901) should show brand; else hidden
        if w >= 901: chk(f"login @{w} brand visible", brand_vis)
        else: chk(f"login @{w} brand hidden (short intro)", not brand_vis)
        shot(pg, f"login-{w}")
        c.close()

    # ===== B) Login submission works with redesign controls =====
    cb = b.new_context(viewport={"width":1440,"height":900})
    pgb = cb.new_page()
    login_ui(pgb, "aarav@crewneat.demo")
    chk("login submit -> /home", "/home" in pgb.url, pgb.url)
    cb.close()

    # ===== C) Customer home at all widths =====
    for w in (390, 768, 1440, 1920):
        c = b.new_context(viewport={"width":w,"height":900})
        pg = c.new_page()
        login_ui(pg, "aarav@crewneat.demo")
        pg.wait_for_selector(".mi-hero", timeout=12000)
        chk(f"home @{w} mi-root shell", pg.locator(".mi-root").count()==1)
        chk(f"home @{w} no h-scroll", no_hscroll(pg))
        chk(f"home @{w} search + chips + cats + providers", 
            pg.locator("#cn-search").count()==1 and pg.locator("#loc-chips .mi-chip").count()>=1 and pg.locator(".mi-cat").count()>=1 and pg.locator(".mi-provider").count()>=1)
        # sidebar vs mobile nav
        if w >= 901:
            chk(f"home @{w} sidebar visible", pg.locator(".sidebar").is_visible())
            chk(f"home @{w} mobile nav hidden", not pg.locator(".mobile-nav").is_visible())
        else:
            chk(f"home @{w} mobile nav visible", pg.locator(".mobile-nav").is_visible())
        shot(pg, f"home-{w}")
        c.close()

    # ===== D) Keyboard navigation =====
    ck = b.new_context(viewport={"width":1440,"height":900})
    pgk = ck.new_page()
    login_ui(pgk, "aarav@crewneat.demo")
    pgk.wait_for_selector(".mi-hero", timeout=12000)
    # focus search via keyboard and submit
    pgk.press("body", "Tab")
    pgk.wait_for_timeout(200)
    pgk.fill("#cn-search", "cleaning")
    pgk.press("#cn-search", "Enter")
    pgk.wait_for_timeout(1200)
    chk("keyboard search Enter -> /find", "/find" in pgk.url, pgk.url)
    ck.close()

    # ===== E) Search (mouse) =====
    ce = b.new_context(viewport={"width":1440,"height":900})
    pge = ce.new_page()
    login_ui(pge, "aarav@crewneat.demo")
    pge.wait_for_selector(".mi-hero", timeout=12000)
    pge.fill("#cn-search", "repair")
    pge.press("#cn-search", "Enter")
    pge.wait_for_timeout(1200)
    chk("search (mouse) -> /find?q=repair", "/find?q=repair" in pge.url, pge.url)
    ce.close()

    # ===== F) Provider link + package link =====
    cf = b.new_context(viewport={"width":1440,"height":900})
    pgf = cf.new_page()
    login_ui(pgf, "aarav@crewneat.demo")
    pgf.wait_for_selector(".mi-provider a.mi-btn-primary", timeout=12000)
    prov_href = pgf.locator(".mi-provider a.mi-btn-primary").first.get_attribute("href")
    chk("provider 'View & book' href", prov_href and prov_href.startswith("/provider/"), prov_href)
    pgf.locator(".mi-provider a.mi-btn-primary").first.click()
    pgf.wait_for_url("**/provider/*", timeout=8000)
    chk("provider link nav", "/provider/" in pgf.url, pgf.url)
    cf.close()

    # Package link
    cp = b.new_context(viewport={"width":1440,"height":900})
    pgp = cp.new_page()
    login_ui(pgp, "aarav@crewneat.demo")
    pgp.wait_for_selector(".mi-pkg", timeout=12000)
    pkg_count = pgp.locator(".mi-pkg").count()
    chk("package cards present", pkg_count >= 1, f"count={pkg_count}")
    pk_href = pgp.locator(".mi-pkg").first.get_attribute("href")
    chk("package card href", pk_href and pk_href.startswith("/package/"), pk_href)
    pgp.locator(".mi-pkg").first.click()
    pgp.wait_for_url("**/package/*", timeout=8000)
    chk("package card nav", "/package/" in pgp.url, pgp.url)
    cp.close()

    # ===== G) Category tile navigation =====
    cg = b.new_context(viewport={"width":1440,"height":900})
    pgg = cg.new_page()
    login_ui(pgg, "aarav@crewneat.demo")
    pgg.wait_for_selector(".mi-cat", timeout=12000)
    pgg.locator(".mi-cat").first.click()
    pgg.wait_for_timeout(1200)
    chk("category tile nav -> /find?q=", "/find?q=" in pgg.url, pgg.url)
    cg.close()

    # ===== H) Provider home + registration regressions =====
    ptok = httpx.post(BASE+"/api/auth/login", json={"email":"arjun@crewneat.demo","password":PW}).json()
    ch = b.new_context(viewport={"width":1440,"height":900})
    pgh = ch.new_page()
    inject_auth(ch, ptok["access_token"], ptok["user_id"], "provider", "Arjun Naik")
    pgh.goto(BASE + "/provider-home", wait_until="load", timeout=15000)
    pgh.wait_for_selector(".app", timeout=10000)
    pgh.wait_for_timeout(1200)
    chk("provider home renders", pgh.locator(".stat").count() >= 1)
    chk("provider home no h-scroll", no_hscroll(pgh))
    shot(pgh, "provider-home-1440")
    ch.close()

    cr = b.new_context(viewport={"width":1440,"height":900})
    pgr = cr.new_page()
    pgr.goto(BASE + "/register", wait_until="load", timeout=15000)
    pgr.wait_for_selector("#register-form", timeout=8000)
    chk("registration renders", pgr.locator("#register-form").count()==1)
    chk("registration no h-scroll", no_hscroll(pgr))
    shot(pgr, "register-1440")
    cr.close()

    b.close()

print("\n=== RESULTS ===")
passed = sum(1 for _, ok, _ in results if ok)
for n, ok, d in results:
    print(("PASS" if ok else "FAIL"), n, d)
print(f"\n{passed}/{len(results)} passed")
