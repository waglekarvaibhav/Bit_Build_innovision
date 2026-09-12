// CrewNest application entry. Registers routes and starts the router.
// All page modules are global constants loaded via script tags.

// Root: route unauthenticated visitors to the login screen and authenticated
// users to their role home. Without a route for "/", dispatchRoute() falls
// through to renderNotFound(), which silently no-ops before the shell exists
// and leaves the "Loading…" spinner in place forever.
route("/", () => {
  if (Auth.isAuthenticated()) {
    location.href = roleHome(Auth.role());
  } else {
    location.replace("/login");
  }
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

// Start
window.addEventListener("DOMContentLoaded", () => {
  dispatchRoute();
});
