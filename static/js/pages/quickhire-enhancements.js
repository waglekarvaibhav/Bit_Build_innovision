// Small safety/polish layer for Quick Hire.
// Keeps the existing flow and API contract intact while preserving deep-link
// selections and preventing avoidable dead-end submissions.
(() => {
  const originalRender = QuickHire.render;
  const originalStepSelect = QuickHire.stepSelect;
  const originalStepDetails = QuickHire.stepDetails;
  const originalStepPackage = QuickHire.stepPackage;
  const originalStepReview = QuickHire.stepReview;

  QuickHire.render = async function () {
    // QuickHire is a global page object, so clear transient state whenever the
    // route is entered again. Query-string selections are restored by render().
    this.state = {
      serviceId: null,
      providerId: null,
      packageId: null,
      billingUnit: "hourly",
    };
    this._svcName = "";
    this._rate = null;
    this._pkg = null;

    await originalRender.call(this);

    // A copied/manual ?package= URL must not make a draft or archived offer
    // appear bookable just because the package detail endpoint can read it.
    if (this.state.packageId && this._pkg && this._pkg.status !== "published") {
      const shell = document.getElementById("content");
      if (shell) {
        shell.innerHTML = `
          <div class="state-box">
            <div class="big">🔒</div>
            <p>This package is not currently available for new bookings.</p>
            <a class="btn sm mt-1" href="/packages">Browse available packages</a>
          </div>`;
      }
    }
  };

  QuickHire.stepService = function (services, providers, el) {
    // Provider profile links already include both provider + service. Honour
    // that context and move straight to the provider/package selection screen.
    const preselected = services.find(
      s => String(s.id) === String(this.state.serviceId)
    );
    if (preselected) {
      this.state.serviceId = Number(preselected.id);
      this._svcName = preselected.name;
      if (this.state.providerId) {
        this.stepSelect(providers);
        return;
      }
    }

    const options = services.map(s => `
      <button class="svc-option" data-id="${s.id}" data-name="${esc(s.name)}">
        ${esc(s.name)}<small>${esc(s.category || "")}</small>
      </button>`).join("");

    el.innerHTML = `
      <div class="stepper small muted">Step 1 of 4 · Choose a service</div>
      <h2>What do you need done?</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))" id="svc-grid">
        ${options === "" ? `<p class="muted">No services configured yet.</p>` : options}
      </div>
    `;

    const sel = document.getElementById("svc-grid");
    sel.querySelectorAll(".svc-option").forEach(b => b.addEventListener("click", () => {
      this.state.serviceId = Number(b.dataset.id);
      this.state.providerId = null;
      this.state.packageId = null;
      this._svcName = b.dataset.name || "";
      this.stepSelect(providers);
    }));
  };

  QuickHire.stepSelect = async function (providers) {
    await originalStepSelect.call(this, providers);

    const svcId = this.state.serviceId;
    const eligible = providers.filter(
      p => p.services.some(s => String(s.service_id) === String(svcId))
    );
    const provWrap = document.getElementById("provider-options");

    // The original fallback displayed every provider when nobody offered the
    // chosen service. That could lead to a server-side validation error later.
    if (provWrap && eligible.length === 0) {
      provWrap.innerHTML = `
        <div class="state-box small">
          No available professionals currently offer this service. Try another service or a relevant package.
        </div>`;
      this.state.providerId = null;
    }

    // Deep links from /provider/:id should feel continuous: the selected
    // professional is highlighted automatically instead of making the user
    // choose the same person a second time.
    const preselectedId = this.state.providerId == null
      ? ""
      : String(this.state.providerId);
    if (preselectedId && provWrap) {
      const button = Array.from(provWrap.querySelectorAll(".pick-provider"))
        .find(b => b.dataset.id === preselectedId);
      if (button) {
        button.click();
      } else {
        this.state.providerId = null;
      }
    }
  };

  function enforceDateFloor() {
    const input = document.getElementById("d-date");
    if (!input) return;
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const today = localNow.toISOString().slice(0, 10);
    input.min = today;
    if (input.value && input.value < today) input.value = today;
  }

  function restoreDetails(details, billingUnit) {
    if (!details) return;
    const values = {
      "d-item": details.item,
      "d-address": details.addr,
      "d-date": details.date,
      "d-time": details.time,
      "d-hours": details.hours,
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && value !== undefined && value !== null) input.value = value;
    });
    const unit = document.getElementById("d-unit");
    if (unit && billingUnit) unit.value = billingUnit;
  }

  function lockPackageBilling(ctx) {
    if (!ctx.state.packageId) return;
    ctx.state.billingUnit = "hourly";
    const unit = document.getElementById("d-unit");
    if (!unit) return;
    unit.innerHTML = `<option value="hourly">Hourly</option>`;
    unit.value = "hourly";
    unit.disabled = true;
    if (!document.getElementById("package-billing-note")) {
      unit.insertAdjacentHTML(
        "afterend",
        `<div class="xsmall muted" id="package-billing-note" style="margin-top:6px">Package pricing is fixed at the published hourly rate.</div>`
      );
    }
  }

  QuickHire.stepDetails = function (svcName) {
    originalStepDetails.call(this, svcName);
    restoreDetails(this.state.details, this.state.billingUnit);
    enforceDateFloor();
    lockPackageBilling(this);
  };

  QuickHire.stepPackage = function () {
    originalStepPackage.call(this);
    restoreDetails(this.state.details, "hourly");
    enforceDateFloor();
    lockPackageBilling(this);
  };

  QuickHire.stepReview = async function (svcName) {
    await originalStepReview.call(this, svcName);

    // Replace the original submit handler so recoverable server errors stay on
    // the review screen with the user's data intact instead of redrawing step 3.
    const originalButton = document.getElementById("submit-btn");
    if (!originalButton) return;
    const button = originalButton.cloneNode(true);
    originalButton.replaceWith(button);

    button.addEventListener("click", async () => {
      const d = this.state.details;
      const errEl = document.getElementById("submit-err");
      button.disabled = true;
      if (errEl) {
        errEl.textContent = "";
        errEl.style.display = "none";
      }

      const payload = {
        service_id: this.state.serviceId,
        provider_id: this.state.providerId,
        package_id: this.state.packageId,
        item_description: d.item,
        address: d.addr,
        booking_date: d.date,
        booking_time: d.time,
        duration_hours: d.hours,
        billing_unit: this.state.packageId ? "hourly" : this.state.billingUnit,
      };

      try {
        const booking = await API.post("/api/customers/bookings", payload);
        Toast.success("Booking request submitted");
        location.href = "/booking/" + booking.id;
      } catch (ex) {
        if (errEl) {
          errEl.textContent = ex.message;
          errEl.style.display = "block";
        }
        Toast.error(ex.message);
        button.disabled = false;
      }
    });
  };
})();
