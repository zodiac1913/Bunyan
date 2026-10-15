(() => {
    "use strict";

    const key = "bunyan.dashboard";
    const startup = document.querySelector('meta[name="bunyan-startup"]').content;
    const form = document.getElementById("dashboard-filters");
    let state;

    // Only dashboard selections are stored; logs, credentials, and other applications' keys are untouched.
    try {
        const saved = localStorage.getItem(key);
        state = saved ? JSON.parse(saved) : null;
        if (state && state.startup !== startup) {
            localStorage.removeItem(key);
            state = null;
        }
        if (state) {
            const params = new URLSearchParams(state.query);
            if (typeof state.query !== "string"
                || !["day", "week", "month"].includes(params.get("period"))
                || !/^\d{4}-\d{2}-\d{2}$/.test(params.get("date"))
                || !params.has("app") || !params.has("level")) {
                throw new Error("Saved dashboard selections are invalid.");
            }
        }
        if (form) {
            // Explicit URLs (including Latest and imports links) win over remembered selections.
            if (!window.location.search && state) {
                window.location.replace(`/?${state.query}`);
                return;
            }
            const params = new URLSearchParams(new FormData(form));
            state = { startup, query: params.toString() };
            localStorage.setItem(key, JSON.stringify(state));
        }
    } catch (error) {
        console.error("Cannot restore or save dashboard selections.", error);
        const notice = document.getElementById("dashboard-state-error");
        notice.textContent = "Dashboard selections could not be saved or restored in this browser. Return using your browser's Back button to keep the previous filters.";
        notice.hidden = false;
        return;
    }

    // Both the global navigation and the group-page back link return to the same investigation.
    if (state) {
        for (const link of document.querySelectorAll('a[href="/"]')) {
            link.setAttribute("href", `/?${state.query}`);
        }
        for (const button of document.querySelectorAll('sml-reactive-button[data-url="/"]')) {
            button.setAttribute("data-url", `/?${state.query}`);
        }
    }
})();
