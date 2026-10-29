(() => {
    "use strict";

    const filterForm = document.querySelector("form.level-filter");
    if (filterForm) {
        filterForm.addEventListener("change", event => {
            if (event.target.matches('input[name="level_type"]')) filterForm.requestSubmit();
        });
    }

    const dialog = document.getElementById("exception-dialog");
    if (!dialog) return;
    const fields = document.getElementById("exception-fields");
    const meta = document.getElementById("exception-meta");

    const fieldLabels = [
        ["LogIdentifier", "log_identifier"],
        ["Timestamp", "add_timestamp"],
        ["Log app", "log_app"],
        ["Level", "log_type"],
        ["Severity", "log_severity"],
        ["Message", "message"],
        ["Exception", "exception"],
        ["App ID", "task_definition_identifier"],
        ["App", "task_definition_title"],
        ["Project ID", "project_identifier"],
        ["Project", "project_name"],
        ["Customer service ID", "customer_service_identifier"],
        ["Controller", "class_name"],
        ["Action", "method_name"],
        ["User account", "add_user_account"],
        ["Server", "server"],
        ["User ID", "add_user_identifier"],
        ["User", "add_user_name"]
    ];

    function renderDetails(entry) {
        fields.replaceChildren();
        fieldLabels.forEach(([label, key]) => {
            const heading = document.createElement("dt");
            heading.textContent = label;
            const value = document.createElement("dd");
            value.textContent = entry[key] == null || entry[key] === "" ? "—" : String(entry[key]);
            fields.append(heading, value);
        });
    }

    // Load the full record only when its exception button is clicked.
    document.addEventListener("click", async event => {
        const button = event.target.closest("button[data-exception-url]");
        if (button && !button.disabled) {
            meta.textContent = `Log entry ${button.dataset.logIdentifier}`;
            fields.textContent = "Loading log entry…";
            dialog.showModal();
            try {
                const response = await fetch(button.dataset.exceptionUrl, { credentials: "same-origin" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                renderDetails(await response.json());
                meta.textContent = "";
            } catch (error) {
                fields.textContent = `Unable to load the log entry: ${error.message}`;
            }
            return;
        }
        // Clicking the backdrop (the dialog element itself) closes it.
        if (event.target === dialog) dialog.close();
    });
})();
