(() => {
    "use strict";

    for (const id of ["ai-timeout", "ollama-model", "openai-model", "copilot-model"]) {
        const field = document.getElementById(id);
        const error = document.getElementById(`${id}-error`);

        // Preserve native submission blocking; expose its localized errors beside each field.
        const update = () => {
            const invalid = !field.disabled && !field.validity.valid;
            error.textContent = invalid ? field.validationMessage : "";
            error.hidden = !invalid;
            if (invalid) field.setAttribute("aria-invalid", "true");
            else field.removeAttribute("aria-invalid");
        };
        field.addEventListener("invalid", update);
        for (const event of ["input", "change"]) {
            field.addEventListener(event, () => {
                if (field.hasAttribute("aria-invalid")) update();
            });
        }
    }
})();
