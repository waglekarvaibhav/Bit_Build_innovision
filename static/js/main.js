// CrewNest application entry. Registers routes and starts the router.
// All page modules are global constants loaded via script tags.

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
