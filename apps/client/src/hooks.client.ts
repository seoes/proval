if (__PROVAL_DEMO_BUILD__) {
    void import("$lib/demo/plausible.js").then((module) => {
        module.loadPlausible();
    });
}
