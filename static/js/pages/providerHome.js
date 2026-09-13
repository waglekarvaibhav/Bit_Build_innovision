// CrewNest Atlas provider home — workday board, not a generic dashboard.
const ProviderHome = {
  async render() {
    if (!requireRole("provider")) return;
    const me = Auth.user();
    mountShell("home");
    const page = AppShell.page("");
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let prof, bookings;
    try {
      const [p, b] = await Promise.all([
        API.get("/api/providers/me"),
        API.get("/api/providers/bookings"),
      ]);
      prof = p; bookings = b.bookings;
    } catch (e) { showFatal(e, el); return; }

    const available = prof.profile.available;
    const meId = Number(me.id || me.user_id);
    const canDecide = b => {
      if (b.package_type_snapshot === "team") {
        return Number(b.package_lead_snapshot) === meId;
      }
      return Number(b.provider_id) === meId;
    };
    const pending = bookings.filter(b => b.status === "pending" && canDecide(b));
    const active = bookings.filter(b => b.status === "accepted");
    const review = bookings.filter(b => b.status === "completion_requested");
    const completed = bookings.filter(b => b.status === "completed");
    const completedValue = completed.reduce((s,b) => s + (b.quoted_price || 0), 0);
    const first = (me.full_name || "Provider").split(" ")[0];
    const now = new Date();
    const timeline = [...new Map([...active, ...review].map(b => [b.id, b])).values()]
      .sort((a,b) => String(a.booking_date+a.booking_time).localeCompare(String(b.booking_date+b.booking_time)))
      .slice(0,5);
    const nextAction = pending[0] || timeline[0] || null;

    el.innerHTML = `
      <header class="atlas-pagehead">
        <div>
          <div class="atlas-kicker">Today · ${now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})}</div>
          <h1>${esc(first)}’s workday</h1>
          <p>Requests, live jobs and offers — arranged around what you need to do next.</p>
        </div>
        <div class="atlas-actions">
          <span class="atlas-status ${available ? "live" : ""}">${available ? "Open for bookings" : "Bookings paused"}</span>
          <button class="atlas-btn light" id="toggle-avail">${available ? "Pause bookings" : "Go available"}</button>
        </div>
      </header>

      <section class="atlas-home-grid">
        <article class="atlas-card atlas-dayboard">
          <div class="atlas-dayboard-top"><div><h2>Workday timeline</h2><span>Your accepted jobs and customer review follow-ups.</span></div><a class="atlas-link" href="/provider-jobs">Open work →</a></div>
          <div class="atlas-timeline">${this._timeline(timeline)}</div>
        </article>

        <aside class="atlas-card atlas-pulse">
          <div class="atlas-pulse-top"><span class="atlas-pulse-title">Work pulse</span><span class="atlas-tag blue">LIVE</span></div>
          <div class="atlas-pulse-grid">
            ${this._pulse("Requests", pending.length)}
            ${this._pulse("In motion", active.length + review.length)}
            ${this._pulse("Completed", completed.length)}
            ${this._pulse("Value", money(completedValue))}
          </div>
          <div class="atlas-next">
            <small>Next action</small>
            ${nextAction ? `<strong>${esc(nextAction.item_description)}</strong><span>${pending[0] && nextAction.id === pending[0].id ? `New request · ${esc(nextAction.customer_name)}` : `${STATUS_LABEL[nextAction.status] || nextAction.status} · ${esc(nextAction.customer_name)}`}</span><br><a class="atlas-btn amber" href="/provider-booking/${nextAction.id}">Open task</a>` : `<strong>You’re clear.</strong><span>No request or job needs attention right now.</span><br><a class="atlas-btn amber" href="/provider-packages">Improve offers</a>`}
          </div>
        </aside>
      </section>

      <section class="atlas-home-lower">
        <article class="atlas-card atlas-inbox-card">
          <div class="atlas-card-head"><div><h2>Request queue</h2><p>${pending.length ? `${pending.length} waiting for a decision.` : "Nothing waiting."}</p></div><a class="atlas-link" href="/provider-requests">View queue</a></div>
          <div class="atlas-list">${this._requestRows(pending.slice(0,4))}</div>
        </article>
        <article class="atlas-card atlas-work-card">
          <div class="atlas-card-head"><div><h2>Active work</h2><p>Accepted jobs and completion follow-ups.</p></div><a class="atlas-link" href="/provider-jobs">View work</a></div>
          <div class="atlas-list">${this._jobRows([...active,...review].slice(0,4))}</div>
        </article>
      </section>

      <section class="atlas-card atlas-service-strip">
        <div><h2>Offer shelf</h2><p>Your bookable service packages.</p></div>
        <div id="pkg-box" class="atlas-package-list"><div class="atlas-empty" style="min-height:64px;min-width:180px"><span>Loading…</span></div></div>
        <a class="atlas-btn primary" href="/provider-packages">Manage offers</a>
      </section>
    `;

    document.getElementById("pkg-box").innerHTML = await this._packages();
    el.querySelector("#toggle-avail").addEventListener("click", async e => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await API.put("/api/providers/me", { available: !available });
        Toast.success(available ? "Bookings paused" : "You’re open for bookings");
        this.render();
      } catch(err){ Toast.error(err.message); btn.disabled = false; }
    });
  },

  _pulse(label, value){ return `<div class="atlas-pulse-stat"><small>${label}</small><strong>${value}</strong></div>`; },

  _timeline(rows){
    if(!rows.length) return `<div class="atlas-empty" style="margin-top:12px;min-height:220px"><div><strong>No work on the rail</strong><span>Accepted jobs will build your day here.</span></div></div>`;
    return rows.map(b => `<a class="atlas-time-row" href="/provider-booking/${b.id}"><span class="atlas-time">${esc(b.booking_time || "—")}</span><span class="atlas-time-dot"></span><div class="atlas-time-copy"><strong>${esc(b.item_description)}</strong><span>${fmtDate(b.booking_date)} · ${esc(b.customer_name)} · ${STATUS_LABEL[b.status] || b.status}</span></div><span class="atlas-time-price">${money(b.quoted_price)}</span></a>`).join("");
  },

  _requestRows(rows){
    if(!rows.length) return `<div class="atlas-empty"><div><strong>Queue empty</strong><span>New customer requests will appear here.</span></div></div>`;
    return rows.map(b => `<a class="atlas-list-row" href="/provider-booking/${b.id}"><span class="atlas-list-icon">${icon("inbox")}</span><div><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${fmtDate(b.booking_date)}</small></div><b>${money(b.quoted_price)}</b></a>`).join("");
  },

  _jobRows(rows){
    if(!rows.length) return `<div class="atlas-empty"><div><strong>No live work</strong><span>Accepted jobs will appear here.</span></div></div>`;
    return rows.map(b => `<a class="atlas-list-row" href="/provider-booking/${b.id}"><span class="atlas-list-icon">${icon("clock")}</span><div><strong>${esc(b.item_description)}</strong><small>${STATUS_LABEL[b.status] || b.status} · ${fmtDate(b.booking_date)}</small></div><b>${money(b.quoted_price)}</b></a>`).join("");
  },

  async _packages(){
    try{
      const pkgs=(await API.get("/api/providers/me/packages")).packages;
      if(!pkgs.length) return `<div class="atlas-empty" style="min-height:64px;min-width:180px"><span>No packages yet.</span></div>`;
      return pkgs.slice(0,3).map(p=>`<a class="atlas-package-mini" href="/provider-packages"><span>${p.package_type === "team" ? "TEAM" : "MULTI"}</span><strong>${esc(p.name)}</strong><small>${p.service_count} services · ${money(p.hourly_rate)}/hr</small></a>`).join("");
    }catch(e){return `<div class="atlas-empty" style="min-height:64px"><span>${esc(e.message)}</span></div>`;}
  }
};
