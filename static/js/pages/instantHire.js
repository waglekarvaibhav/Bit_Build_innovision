// Quick Hire (/quickhire) — urgent, low-friction auto-matching.
// Scheduled selection lives separately at /prebook.
const QuickHire = {
  async render() {
    if (!requireRole("customer", "provider")) return;
    const qs = new URLSearchParams(location.search);
    if (qs.has("provider") || qs.has("package")) {
      location.replace("/prebook?" + qs.toString());
      return;
    }

    const me = Auth.user();
    mountShell("quickhire");
    const page = AppShell.page(`
      <a class="small" href="${roleHome(me.role)}">← Home</a>
      <div><span class="page-kicker"><span></span> Help, without the wait</span><h1>Quick Hire</h1><p>Tell us what is urgent. JobHustle finds the fastest suitable professional for you.</p></div>
    `);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let categories = [], localities = [];
    try {
      [categories, { localities }] = await Promise.all([
        API.get("/api/service-categories"),
        API.get("/api/localities"),
      ]);
    } catch (e) {
      showFatal(e, el);
      return;
    }

    const services = categories.flatMap(category =>
      category.services.map(service => ({ ...service, category: category.name }))
    );
    el.innerHTML = `
      <section class="instant-hire">
        <div class="instant-hire-main">
          <div class="instant-mode-label"><i></i><span>Urgent matching is live</span><strong>ASAP</strong></div>
          <h2>What needs attention right now?</h2>
          <p class="instant-intro">No provider browsing and no calendar setup. We match the first suitable available professional near your selected locality.</p>
          <form id="instant-hire-form">
            <div class="field">
              <label for="instant-service">Service needed</label>
              <select class="input" id="instant-service" required>
                <option value="">Select a service</option>
                ${services.map(service => `<option value="${service.id}">${esc(service.name)} · ${esc(service.category)}</option>`).join("")}
              </select>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="instant-locality">Locality</label>
                <select class="input" id="instant-locality" required>
                  <option value="">Select locality</option>
                  ${localities.map(locality => `<option value="${esc(locality)}">${esc(locality)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="instant-duration">Estimated work</label>
                <select class="input" id="instant-duration">
                  <option value="1">About 1 hour</option>
                  <option value="2">About 2 hours</option>
                  <option value="4">Half day</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="instant-address">Exact job address</label>
              <input class="input" id="instant-address" required minlength="3" autocomplete="street-address" placeholder="House/Flat, Street, Landmark" />
            </div>
            <div class="field">
              <label for="instant-description">Briefly describe the urgent job</label>
              <textarea class="input" id="instant-description" required minlength="3" placeholder="Example: Main kitchen tap is leaking heavily…"></textarea>
            </div>
            <div class="instant-assurance">
              <span>${icon("clock")} Next available slot</span>
              <span>${icon("user")} Auto-matched professional</span>
              <span>${icon("inbox")} Live status alerts</span>
            </div>
            <div class="field error" id="instant-error" role="alert" hidden></div>
            <button class="btn instant-submit" type="submit">
              <span>Find my fastest match</span><strong>→</strong>
            </button>
            <p class="instant-fineprint">This sends an urgent request—no payment is taken. The professional still confirms the booking.</p>
          </form>
        </div>
        <aside class="instant-hire-side">
          <span class="instant-side-index">QUICK / 01</span>
          <h3>Built for the job that cannot wait.</h3>
          <div class="instant-side-step"><b>01</b><span><strong>Describe</strong><small>Service and exact location</small></span></div>
          <div class="instant-side-step"><b>02</b><span><strong>Auto-match</strong><small>Best available professional</small></span></div>
          <div class="instant-side-step"><b>03</b><span><strong>Track</strong><small>Alerts from request to completion</small></span></div>
          <div class="instant-scheduled-link"><span>Need control over date or provider?</span><a href="/prebook">Use Pre-book instead →</a></div>
        </aside>
      </section>`;

    el.querySelector("#instant-hire-form").addEventListener("submit", event => this.submit(event, el));
  },

  async submit(event, el) {
    event.preventDefault();
    const button = el.querySelector(".instant-submit");
    const error = el.querySelector("#instant-error");
    const payload = {
      service_id: Number(el.querySelector("#instant-service").value),
      locality: el.querySelector("#instant-locality").value,
      duration_hours: Number(el.querySelector("#instant-duration").value),
      address: el.querySelector("#instant-address").value.trim(),
      item_description: el.querySelector("#instant-description").value.trim(),
    };
    error.hidden = true;
    button.disabled = true;
    button.innerHTML = `<span class="instant-button-loader"><i></i> Matching live professionals…</span>`;
    try {
      const booking = await API.post("/api/quick-hire", payload);
      NotificationCenter.chime();
      NotificationCenter.refresh(true);
      this.showMatch(booking, el);
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
      button.disabled = false;
      button.innerHTML = `<span>Try matching again</span><strong>→</strong>`;
    }
  },

  showMatch(booking, el) {
    el.innerHTML = `
      <section class="instant-match" role="status" aria-live="polite">
        <div class="instant-match-signal"><span></span><span></span><span></span><i>✓</i></div>
        <span class="instant-match-kicker">MATCH FOUND · REQUEST #${booking.id}</span>
        <h2>${esc(booking.provider_name)} is your fastest available match.</h2>
        <p>Your urgent request has been delivered. You will receive an alert the moment it is confirmed.</p>
        <div class="instant-match-grid">
          <span><small>Service</small><strong>${esc(booking.service_name)}</strong></span>
          <span><small>Target start</small><strong>~${booking.estimated_arrival_minutes} min</strong></span>
          <span><small>Scheduled</small><strong>${fmtDate(booking.booking_date)} · ${esc(booking.booking_time)}</strong></span>
          <span><small>Quoted total</small><strong>${money(booking.quoted_price)}</strong></span>
        </div>
        <div class="instant-match-actions">
          <a class="btn" href="/booking/${booking.id}">Track live request</a>
          <a class="btn ghost" href="${roleHome(Auth.role())}">Back home</a>
        </div>
        <div class="instant-match-note"><i></i> Provider confirmation pending · alerts are active</div>
      </section>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
};
