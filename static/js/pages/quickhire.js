// Pre-book (/prebook) — deliberate multi-step scheduled booking:
// 1) choose service → 2) select professional or relevant package →
// 3) enter job details & schedule → 4) review & submit.
// Form input is preserved on recoverable errors.
const PreBook = {
  state: { serviceId: null, providerId: null, packageId: null, billingUnit: "hourly" },

  async render() {
    if (!requireRole("customer", "provider")) return;
    const me = Auth.user();
    const shell = mountShell("prebook");
    const head = `<a class="small" href="${roleHome(me.role)}">← Home</a><div><span class="page-kicker"><span></span> Plan ahead</span><h1>Pre-book a service</h1><p>Choose exactly who comes, when they arrive, and the service format you need.</p></div>`;
    const page = AppShell.page(head);
    const el = page.el;

    const qs = new URLSearchParams(location.search);
    this.state.providerId = qs.get("provider") || null;
    this.state.serviceId = qs.get("service") || null;
    this.state.packageId = qs.get("package") || null;
    if (this.state.packageId) {
      el.innerHTML = `<div class="skeleton"></div>`;
      try {
        const pkg = await API.get(`/api/packages/${this.state.packageId}`);
        if (!pkg.services[0]) throw new Error("This package has no service to preselect.");
        if (this._packageIncludesMe(pkg, me.id)) throw new Error("You cannot book a package that you provide or belong to.");
        this.state.serviceId = null;
        this.state._pkg = pkg;
        this.stepPackage();
      } catch (e) { showFatal(e, el); }
      return;
    }

    el.innerHTML = `<div class="skeleton"></div>`;

    // Providers begin loading in parallel, but Step 1 no longer waits for them.
    // This keeps Pre-book usable on slower mobile connections.
    this._providersPromise = API.get("/api/providers", { timeoutMs: 7000 })
      .then(p => Array.isArray(p) ? p.filter(x => x.available && x.user_id !== me.id) : [])
      .catch(() => []);

    let cats = [];
    try {
      const c = await API.get("/api/service-categories", { timeoutMs: 7000 });
      cats = Array.isArray(c) ? c : [];
    } catch (e) {
      showFatal(e, el);
      return;
    }

    const services = cats.flatMap(c => c.services || []);
    this.stepService(services, el);
  },

  stepService(services, el) {
    const options = services.map(s => `<button class="svc-option" data-id="${s.id}" data-name="${esc(s.name)}">${esc(s.name)}<small>${esc(s.category || "")}</small></button>`).join("");
    el.innerHTML = `
      <div class="stepper small muted">Step 1 of 4 · Choose a service</div>
      <h2>What do you need done?</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))" id="svc-grid">
        ${options === "" ? `<p class="muted">No services configured yet.</p>` : options}
      </div>
    `;
    const sel = document.getElementById("svc-grid");
    sel.querySelectorAll(".svc-option").forEach(b => b.addEventListener("click", async () => {
      this.state.serviceId = Number(b.dataset.id);
      this._svcName = b.dataset.name;
      const providers = this._providersPromise ? await this._providersPromise : [];
      this.stepSelect(providers);
    }));
  },

  async stepSelect(providers) {
    const shell = document.getElementById("content");
    const svcId = this.state.serviceId;
    const svcName = this._svcName || "";
    let packages = [];
    try { packages = (await API.get("/api/packages", { retry: false, timeoutMs: 5000 })) || []; } catch (e) {}
    const myId = Auth.user().id;
    const matchingPkgs = packages.filter(p =>
      (p.services || []).includes(svcName) &&
      p.status !== "archived" &&
      !this._packageIncludesMe(p, myId)
    );

    shell.innerHTML = `
      <div class="stepper small muted">Step 2 of 4 · Select ${esc(svcName)} provider or package</div>
      <h2>Choose who does the job</h2>
      <h3>Professionals</h3>
      <div id="provider-options"></div>
      ${matchingPkgs.length ? `<h3 style="margin-top:var(--space-5)">Relevant packages</h3><div id="package-options"></div>` : ""}
      <div id="selected-box" class="card mt-2" style="display:none"></div>
      <div class="between mt-2">
        <a class="btn ghost sm" href="/prebook">Back</a>
        <button class="btn sm" id="next-btn" disabled>Continue to details</button>
      </div>
    `;

    const provWrap = document.getElementById("provider-options");
    const eligible = providers.filter(p => (p.services || []).some(s => s.service_id == svcId));
    const rows = eligible.length ? eligible : providers;
    provWrap.innerHTML = rows.length ? rows.map(p => `
      <div class="list-item">
        <div class="grow">
          <div class="between"><strong>${esc(p.full_name)}</strong> ${ratingHtml(p.rating, p.review_count)}</div>
          <div class="meta">${esc(p.profession)} · ${esc(p.locality)}</div>
        </div>
        <button class="btn ghost sm pick-provider" data-id="${p.user_id}" data-name="${esc(p.full_name)}">Select</button>
      </div>`).join("") : `<p class="small muted">Professionals are taking a little longer to load. You can go back and try again, or choose a matching package below.</p>`;

    const pkgWrap = document.getElementById("package-options");
    if (pkgWrap) {
      pkgWrap.innerHTML = matchingPkgs.map(p => `
        <div class="list-item">
          <div class="grow">
            <div class="between"><strong>${esc(p.name)}</strong> <span class="tag ${p.package_type}">${p.package_type === "team" ? "Team" : "Multitasking"}</span></div>
            <div class="meta">${esc(p.locality)} · ${p.member_count ? p.member_count + " member crew" : "one provider"} · ${money(p.hourly_rate)}/hr</div>
          </div>
          <button class="btn ghost sm pick-package" data-id="${p.id}" data-name="${esc(p.name)}">Select</button>
        </div>`).join("") || `<p class="small muted">No matching packages.</p>`;
      pkgWrap.querySelectorAll(".pick-package").forEach(b => b.addEventListener("click", () => {
        this._clearPicks();
        this.state.packageId = Number(b.dataset.id);
        this.state.providerId = null;
        b.textContent = "Selected ✓"; b.className = "btn sm primary";
        document.getElementById("selected-box").style.display = "block";
        document.getElementById("selected-box").innerHTML = `Selected package: <strong>${esc(b.dataset.name)}</strong> (${esc(svcName)})`;
        document.getElementById("next-btn").disabled = false;
      }));
    }

    provWrap.querySelectorAll(".pick-provider").forEach(b => b.addEventListener("click", () => {
      this._clearPicks();
      this.state.providerId = Number(b.dataset.id);
      this.state.packageId = null;
      b.textContent = "Selected ✓"; b.className = "btn sm primary";
      document.getElementById("selected-box").style.display = "block";
      document.getElementById("selected-box").innerHTML = `Selected: <strong>${esc(b.dataset.name)}</strong> · ${esc(svcName)}`;
      document.getElementById("next-btn").disabled = false;
    }));

    document.getElementById("next-btn").addEventListener("click", () => this.stepDetails(svcName));
  },

  stepPackage() {
    const pkg = this.state._pkg;
    if (!pkg) { this.render(); return; }
    const shell = document.getElementById("content");
    shell.innerHTML = `
      <div class="stepper small muted">Booking a package · job details</div>
      <h2>Book “${esc(pkg.name)}”</h2>
      <div class="card slim">
        <div class="between">
          <span><strong>${esc(pkg.name)}</strong></span>
          <span class="tag ${pkg.package_type}">${pkg.package_type === "team" ? "Team" : "Multitasking"}</span>
        </div>
        <p class="small muted" style="margin-top:6px">${esc(pkg.locality)} · ${pkg.services.length} services · ${money(pkg.hourly_rate)}/hr</p>
        <div class="chips-row">${pkg.services.map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>
      </div>
      <form id="detail-form" class="mt-2">
        <div class="field"><label for="d-item">What needs to be done?</label>
          <textarea class="input" id="d-item" required minlength="3" placeholder="Describe the scope of work for this package…"></textarea></div>
        <div class="field"><label for="d-address">Where is the job?</label>
          <input class="input" id="d-address" required minlength="3" placeholder="House/Flat, Street, Locality" /></div>
        <div class="field-row">
          <div class="field"><label for="d-date">Preferred date</label><input class="input" type="date" id="d-date" required /></div>
          <div class="field"><label for="d-time">Preferred time</label><input class="input" type="time" id="d-time" required /></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="d-unit">Billing engagement</label>
            <select class="input" id="d-unit"><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option></select></div>
          <div class="field"><label for="d-hours">Duration (hours)</label><input class="input" type="number" id="d-hours" min="0.5" step="0.5" value="2" required /></div>
        </div>
        <div class="between mt-2">
          <a class="btn ghost sm" href="/prebook">Back</a>
          <button class="btn sm" type="submit">Review & submit</button>
        </div>
      </form>
    `;
    const d = new Date(); d.setDate(d.getDate() + 1);
    document.getElementById("d-date").value = d.toISOString().slice(0, 10);
    document.getElementById("d-time").value = "10:00";
    document.getElementById("detail-form").addEventListener("submit", e => {
      e.preventDefault();
      const item = document.getElementById("d-item").value.trim();
      const addr = document.getElementById("d-address").value.trim();
      const date = document.getElementById("d-date").value;
      const time = document.getElementById("d-time").value;
      const hours = parseFloat(document.getElementById("d-hours").value);
      this.state.billingUnit = document.getElementById("d-unit").value;
      if (!item || !addr || !date || !time || !hours) { Toast.error("Please complete all required fields."); return; }
      this.state.providerId = null;
      this.state.details = { item, addr, date, time, hours };
      this.stepReview(pkg.name);
    });
  },

  _clearPicks() { document.querySelectorAll(".pick-provider,.pick-package").forEach(x => {
      x.className = x.classList.contains("pick-provider") ? "btn ghost sm pick-provider" : "btn ghost sm pick-package";
      x.textContent = "Select";
    });
  },

  stepDetails(svcName) {
    const shell = document.getElementById("content");
    shell.innerHTML = `
      <div class="stepper small muted">Step 3 of 4 · Job details & schedule</div>
      <h2>Tell us about the job</h2>
      <form id="detail-form">
        <div class="field"><label for="d-item">What needs to be done?</label>
          <textarea class="input" id="d-item" required minlength="3" placeholder="Describe the work, materials, access, etc."></textarea></div>
        <div class="field"><label for="d-address">Where is the job?</label>
          <input class="input" id="d-address" required minlength="3" placeholder="House/Flat, Street, Locality" /></div>
        <div class="field-row">
          <div class="field"><label for="d-date">Preferred date</label><input class="input" type="date" id="d-date" required /></div>
          <div class="field"><label for="d-time">Preferred time</label><input class="input" type="time" id="d-time" required /></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="d-unit">Billing engagement</label>
            <select class="input" id="d-unit">
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select></div>
          <div class="field"><label for="d-hours">Duration (hours)</label><input class="input" type="number" id="d-hours" min="0.5" step="0.5" value="2" required /></div>
        </div>
        <div id="price-hint" class="small muted"></div>
        <div class="between mt-2">
          <a class="btn ghost sm" id="back-btn">Back</a>
          <button class="btn sm" type="submit">Review & submit</button>
        </div>
      </form>
    `;

    const d = new Date(); d.setDate(d.getDate() + 1);
    document.getElementById("d-date").value = d.toISOString().slice(0, 10);
    document.getElementById("d-time").value = "10:00";

    document.getElementById("back-btn").addEventListener("click", () => this.render());
    document.getElementById("d-unit").addEventListener("change", evt => {
      this.state.billingUnit = evt.target.value;
      document.getElementById("price-hint").textContent =
        this.state.billingUnit === "hourly" ? "Billable in hours; provider's hourly rate applies."
        : this.state.billingUnit === "daily" ? "Billable per day (8 hrs = 1 day)."
        : "Billable per month. Provider must support this unit.";
    });
    document.getElementById("detail-form").addEventListener("submit", e => {
      e.preventDefault();
      const item = document.getElementById("d-item").value.trim();
      const addr = document.getElementById("d-address").value.trim();
      const date = document.getElementById("d-date").value;
      const time = document.getElementById("d-time").value;
      const hours = parseFloat(document.getElementById("d-hours").value);
      if (!item || !addr || !date || !time || !hours) { Toast.error("Please complete all required fields."); return; }
      this.state.details = { item, addr, date, time, hours };
      this.stepReview(svcName);
    });
  },

  async stepReview(svcName) {
    const shell = document.getElementById("content");
    shell.innerHTML = `<div class="state-box"><div class="spinner"></div> Preparing summary…</div>`;
    const d = this.state.details;
    let quotePreview = null;
    try {
      if (this.state.packageId) {
        const pkg = await API.get(`/api/packages/${this.state.packageId}`);
        this.state._pkg = pkg;
        quotePreview = pkg.hourly_rate * d.hours;
      } else {
        const provs = await API.get("/api/providers");
        const prov = provs.find(p => p.user_id == this.state.providerId);
        const svc = prov && prov.services.find(s => s.service_id == this.state.serviceId);
        const rate = this._rateFor(svc, d.hours);
        this.state._rate = rate;
        quotePreview = d.hours * (rate || 0);
      }
    } catch (e) { quotePreview = null; }

    const quoteUnits = this.state.billingUnit === "hourly" ? d.hours
      : this.state.billingUnit === "daily" ? Math.max(1, Math.round(d.hours / 8))
      : Math.max(1, Math.round(d.hours / (8 * 22)));
    const unitCount = quoteUnits;

    let preview = null;
    if (this.state.packageId && this.state._pkg) preview = this.state._pkg.hourly_rate * quoteUnits;
    else if (this.state._rate != null) preview = this.state._rate * quoteUnits;

    shell.innerHTML = `
      <div class="stepper small muted">Step 4 of 4 · Review & submit</div>
      <h2>Review your request</h2>
      <div class="card">
        <h4>Service</h4><p>${esc(svcName)}</p>
        <h4>Selected</h4><p>${esc(this._pkgName() || "Professional")}</p>
        <h4>What needs doing</h4><p>${esc(d.item)}</p>
        <h4>Where</h4><p>${esc(d.addr)}</p>
        <h4>When</h4><p>${fmtDate(d.date)} at ${esc(d.time)}</p>
        <div class="between" style="border-top:1px solid var(--border);padding-top:var(--space-3)">
          <span class="small">Engagement</span><span class="small">${esc(this.state.billingUnit)} (${unitCount} unit${unitCount === 1 ? "" : "s"})</span>
        </div>
        <div class="between" style="padding-top:var(--space-2)">
          <span class="price">${preview != null ? money(preview) : "Computed on submit"}</span>
          <span class="small muted">final amount set by server</span>
        </div>
        <p class="xsmall muted" style="margin-top:var(--space-2)">This is a <em>request</em>. It becomes <strong>confirmed</strong> only after the provider accepts. No payment is taken.</p>
      </div>
      <div class="field error" id="submit-err"></div>
      <div class="between mt-2">
        <button class="btn ghost sm" id="back2">Back</button>
        <button class="btn primary" id="submit-btn">Submit request</button>
      </div>
    `;
    document.getElementById("back2").addEventListener("click", () => this.stepDetails(svcName));
    document.getElementById("submit-btn").addEventListener("click", async () => {
      const btn = document.getElementById("submit-btn");
      btn.disabled = true;
      const errEl = document.getElementById("submit-err");
      const payload = {
        service_id: this.state.serviceId,
        provider_id: this.state.providerId,
        package_id: this.state.packageId,
        item_description: d.item,
        address: d.addr,
        booking_date: d.date,
        booking_time: d.time,
        duration_hours: d.hours,
        billing_unit: this.state.billingUnit,
      };
      try {
        const booking = await API.post("/api/customers/bookings", payload);
        this.showSuccess(booking);
      } catch (ex) {
        errEl.textContent = ex.message;
        errEl.style.display = "block";
        btn.disabled = false;
        this.stepDetails(svcName);
      }
    });
  },

  showSuccess(booking) {
    NotificationCenter.chime();
    NotificationCenter.refresh(true);
    const main = document.getElementById("main");
    const bookedName = booking.package_name_snapshot || booking.provider_name || "your professional";
    main.innerHTML = `
      <div class="booking-success" role="status" aria-live="polite">
        <div class="booking-success-card">
          <div class="booking-success-check">✓</div>
          <div class="page-kicker"><span></span> Request #${booking.id} is live</div>
          <h1>Your request is on its way.</h1>
          <p>We've notified ${esc(bookedName)}. You'll get an update here as soon as the request is accepted.</p>
          <div class="booking-success-summary">
            <span>Scheduled for<strong>${fmtDate(booking.booking_date)} · ${esc(booking.booking_time)}</strong></span>
            <span>Quoted total<strong>${money(booking.quoted_price)}</strong></span>
          </div>
          <div class="booking-success-actions">
            <a class="btn" href="/booking/${booking.id}">Track request</a>
            <a class="btn ghost" href="${roleHome(Auth.role())}">Back to home</a>
          </div>
          <div class="booking-success-progress" aria-hidden="true"><i></i></div>
          <p class="xsmall" style="margin:10px 0 0;color:#9fb6ab">Opening live tracking automatically…</p>
        </div>
      </div>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    this._successTimer = setTimeout(() => {
      location.href = "/booking/" + booking.id;
    }, 4000);
    main.querySelectorAll("a").forEach(link => link.addEventListener("click", () => clearTimeout(this._successTimer)));
  },

  _rateFor(svc, hours) {
    if (!svc) return null;
    return this.state.billingUnit === "hourly" ? svc.hourly_rate
      : this.state.billingUnit === "daily" ? svc.daily_rate
      : svc.monthly_rate;
  },
  _packageIncludesMe(pkg, userId) {
    return pkg.owner_id === userId || (pkg.members || []).some(member => member.user_id === userId);
  },
  _pkgName() { return this.state._pkg ? this.state._pkg.name : null; },
};
