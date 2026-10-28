(() => {
    "use strict";

    const dialog = document.getElementById("exception-dialog");
    if (!dialog) return;
    const text = document.getElementById("exception-text");
    const meta = document.getElementById("exception-meta");

    // One delegated listener; the exception is fetched only when its button is clicked.
    document.addEventListener("click", async event => {
        const button = event.target.closest("button[data-exception-url]");
        if (button && !button.disabled) {
            meta.textContent = `Log entry ${button.dataset.logIdentifier}`;
            text.textContent = "Loading…";
            dialog.showModal();
            try {
                const response = await fetch(button.dataset.exceptionUrl, { credentials: "same-origin" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                text.textContent = await response.text();
            } catch (error) {
                text.textContent = `Unable to load the exception: ${error.message}`;
            }
            return;
        }
        // Clicking the backdrop (the dialog element itself) closes it.
        if (event.target === dialog) dialog.close();
    });
})();
