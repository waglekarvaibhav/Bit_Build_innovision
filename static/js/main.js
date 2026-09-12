// CrewNest application entry. Registers routes and starts the router.
// All page modules are global constants loaded via script tags.

// Root: resolve the first screen in-place instead of triggering a second full
// document load. This removes the visible "Loading…" -> redirect -> reload
// cycle when CrewNest is opened at "/".
route("/", async () => {
  if (!Auth.isAuthenticated()) {
    history.replaceState({}, "", "/login");
    await AuthPage.login();
    return;
  }

  const role = Auth.role();
  if (role === "provider") {
    history.replaceState({}, "", "/provider-home");
    await ProviderHome.render();
    return;
  }

  history.replaceState({}, "", "/home");
  await CustomerHome.render();
});

// Authentication
route("/login", () => AuthPage.login());
route("/register", () => AuthPage.register());

// Customer
route("/home", () => CustomerHome.render());
route("/find", () => FindPage.render());
route("/provider/:id", (p) => ProviderPublic.render(p));
route("/quickhire", () => QuickHire.render());
route("/booking/:id", (p) => BookingDetail.render(p));
route("/activity", () => CustomerActivity.render());
route("/packages", () => PackagesPage.render());
route("/package/:id", (p) => PackageDetail.render(p));
route("/guide", () => GoalGuide.render());
route("/profile", () => CustomerProfile.render());

// Provider
route("/provider-home", () => ProviderHome.render());
route("/provider-requests", () => ProviderRequests.render());
route("/provider-jobs", () => ProviderJobs.render());
route("/provider-booking/:id", (p) => ProviderBookingDetail.render(p));
route("/provider-packages", () => ProviderPackages.render());
route("/provider-profile", () => ProviderProfilePage.render());

// Start as soon as this bottom-of-body script executes. At this point the DOM
// and all page modules above are already available, so waiting for another
// DOMContentLoaded callback only prolongs the bootstrap placeholder.
dispatchRoute();
