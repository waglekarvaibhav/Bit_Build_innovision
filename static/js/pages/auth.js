// Authentication pages: /login and /register (customer/provider).
const AuthPage = {
  login() {
    if (Auth.isAuthenticated()) { location.href = roleHome(Auth.role()); return; }
    document.getElementById("app").innerHTML = `
      <div class="auth-wrap mi-login">
        <div class="mi-login-brand">
          <div class="mi-brand-lock">
            <div class="mi-brand-mark">
              <span class="mi-brand-logo" aria-hidden="true"><span>JH</span></span>
              <span class="mi-brand-word">JobHustle<small>LOCAL SERVICES, COORDINATED</small></span>
            </div>
            <div class="mi-login-live"><span></span> Now serving homes across Goa</div>
            <h1 class="mi-brand-headline">Good work starts with<br><em>the right people.</em></h1>
            <p class="mi-brand-sub">Book a trusted local professional—or bring together a complete crew—for every repair, refresh and move.</p>
            <div class="mi-brand-metrics"><span><b>13</b> services</span><span><b>06</b> local professionals</span><span><b>02</b> ways to hire</span></div>
          </div>
          <div class="mi-brand-illus" aria-hidden="true">
            <div class="login-image-card"><img src="/assets/crewnest-hero.png" alt="" /></div>
          </div>
          <div class="mi-brand-foot"><span>Made for Goa</span><span>Real people · Real skills · Real work</span></div>
        </div>

        <div class="mi-login-form">
          <div class="mi-login-card">
            <h2>Welcome back</h2>
            <p class="mi-lede">Your bookings, jobs and teams are waiting.</p>
            <form id="login-form" novalidate>
              <div class="field"><label for="l-email">Email</label>
                <input class="input" type="email" id="l-email" autocomplete="email" required placeholder="you@example.com" /></div>
              <div class="field"><label for="l-pass">Password</label>
                <input class="input" type="password" id="l-pass" autocomplete="current-password" required /></div>
              <button class="mi-login-submit" type="submit">Sign in to JobHustle <span>↗</span></button>
            </form>
            <p class="mi-login-switch">New here? <a href="/register">Create an account</a></p>
            <div class="mi-login-demo">
              <strong>Explore the live demo</strong>
              <p>Choose a side of the marketplace—no typing required.</p>
              <div class="mi-demo-actions">
                <button type="button" data-demo="customer">Explore as customer <span>→</span></button>
                <button type="button" data-demo="provider">Run provider ops <span>→</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      const err = document.createElement("div");
      err.className = "field error";
      err.textContent = "";
      try {
        const res = await API.post("/api/auth/login", {
          email: document.getElementById("l-email").value.trim(),
          password: document.getElementById("l-pass").value,
        });
        Auth.save(res);
        location.href = roleHome(res.role);
      } catch (ex) {
        if (ex.status === 401) {
          btn.insertAdjacentElement("afterend", err);
          err.textContent = "Invalid email or password.";
        } else Toast.error(ex.message);
        btn.disabled = false;
      }
    });
    document.querySelectorAll("[data-demo]").forEach(button => {
      button.addEventListener("click", () => {
        document.getElementById("l-email").value = button.dataset.demo === "customer"
          ? "aarav@crewneat.demo"
          : "priya@crewneat.demo";
        document.getElementById("l-pass").value = "DemoPass123!";
        document.getElementById("login-form").requestSubmit();
      });
    });
  },

  register() {
    if (Auth.isAuthenticated()) { location.href = roleHome(Auth.role()); return; }
    const role = new URLSearchParams(location.search).get("role") || "customer";
    const providerForm = role === "provider" ? `
      <div class="field-row">
        <div class="field"><label for="r-prof">Profession</label><input class="input" id="r-prof" required placeholder="e.g. Electrician" /></div>
        <div class="field"><label for="r-loc">Locality</label><input class="input" id="r-loc" list="loc-list" required placeholder="e.g. Margao" /></div>
      </div>
      <datalist id="loc-list"></datalist>
      <div class="field"><label for="r-bio">Short bio <span class="muted">(optional)</span></label><textarea class="input" id="r-bio" placeholder="Tell customers what you do…"></textarea></div>
    ` : "";

    document.getElementById("app").innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-4)">
            <span class="logo" style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#0f766e,#d97706);display:grid;place-items:center;color:#fff;font-weight:800;font-size:1.2rem">JH</span>
            <span><strong style="font-size:1.35rem">JobHustle</strong></span>
          </div>
          <h2>Create your account</h2>
          <div class="chips-row" style="margin-bottom:var(--space-4)">
            <button class="pill-btn ${role==='customer'?'active':''}" data-role="customer">Customer</button>
            <button class="pill-btn ${role==='provider'?'active':''}" data-role="provider">Provider</button>
          </div>
          <form id="register-form" novalidate>
            <div class="field"><label for="r-name">Full name</label><input class="input" id="r-name" autocomplete="name" required minlength="2" /></div>
            <div class="field"><label for="r-email">Email</label><input class="input" type="email" id="r-email" autocomplete="email" required /></div>
            <div class="field"><label for="r-mobile">Mobile <span class="muted">(optional)</span></label><input class="input" type="tel" id="r-mobile" autocomplete="tel" placeholder="9xxxxxxxxx" /></div>
            <div class="field"><label for="r-pass">Password</label><input class="input" type="password" id="r-pass" autocomplete="new-password" required minlength="8" /><span class="hint">At least 8 characters</span></div>
            ${providerForm}
            <button class="btn primary block lg" type="submit">${role === "customer" ? "Create account" : "Create provider account"}</button>
          </form>
          <p class="small mt-2" style="text-align:center">Already have an account? <a href="/login">Sign in</a></p>
        </div>
      </div>`;

    // populate localities
    API.get("/api/localities").then(d => {
      const dl = document.getElementById("loc-list");
      if (dl) dl.innerHTML = d.localities.map(l => `<option value="${esc(l)}"></option>`).join("");
    }).catch(() => {});
    const currentRole = role;
    document.querySelectorAll("[data-role]").forEach(b => {
      b.addEventListener("click", () => {
        location.search = `?role=${b.dataset.role}`;
        this.register();
      });
    });

    document.getElementById("register-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      const errBox = e.target.querySelector(".form-error");
      if (errBox) errBox.remove();
      btn.disabled = true;
      const isProvider = currentRole === "provider";
      const payload = {
        full_name: document.getElementById("r-name").value.trim(),
        email: document.getElementById("r-email").value.trim(),
        mobile_number: document.getElementById("r-mobile").value.trim() || null,
        password: document.getElementById("r-pass").value,
      };
      if (isProvider) {
        payload.profession = document.getElementById("r-prof").value.trim();
        payload.locality = document.getElementById("r-loc").value.trim();
        payload.bio = document.getElementById("r-bio").value.trim() || null;
      }
      if (isProvider && (!payload.profession || !payload.locality)) {
        const e2 = document.createElement("div");
        e2.className = "field error form-error";
        e2.textContent = "Profession and locality are required.";
        btn.insertAdjacentElement("afterend", e2);
        btn.disabled = false; return;
      }
      try {
        const path = isProvider ? "/api/auth/register/provider" : "/api/auth/register/customer";
        const res = await API.post(path, payload);
        Auth.save(res);
        location.href = roleHome(res.role);
      } catch (ex) {
        const e2 = document.createElement("div");
        e2.className = "field error form-error";
        e2.textContent = ex.status === 400 ? (ex.message || "That email or number is already registered.") : ex.message;
        btn.insertAdjacentElement("afterend", e2);
        btn.disabled = false;
      }
    });
  },
};
