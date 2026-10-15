const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("AI fields expose native errors after validation and clear them on correction", () => {
    const elements = new Map();
    const fields = ["ai-timeout", "ollama-model", "openai-model", "copilot-model"];
    for (const id of fields) {
        const attributes = new Map();
        const listeners = {};
        elements.set(id, {
            disabled: false, validity: { valid: false },
            validationMessage: "Please fill out this field.",
            setAttribute: (name, value) => attributes.set(name, value),
            removeAttribute: name => attributes.delete(name),
            hasAttribute: name => attributes.has(name),
            addEventListener: (event, callback) => { listeners[event] = callback; },
            listeners, attributes,
        });
        elements.set(`${id}-error`, { hidden: true, textContent: "" });
    }
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
        "../../assets/js/ai-settings-validation.js"), "utf8"), {
        document: { getElementById: id => elements.get(id) },
    });
    for (const id of fields) {
        const field = elements.get(id);
        const error = elements.get(`${id}-error`);
        field.listeners.input();
        assert.equal(error.hidden, true);
        field.listeners.invalid();
        assert.equal(error.textContent, field.validationMessage);
        assert.equal(error.hidden, false);
        assert.equal(field.attributes.get("aria-invalid"), "true");
        field.validationMessage = "Value must be at least 1.";
        field.listeners.input();
        assert.equal(error.textContent, "Value must be at least 1.");
        field.validity.valid = true;
        field.listeners.change();
        assert.equal(error.hidden, true);
        assert.equal(error.textContent, "");
        assert.equal(field.hasAttribute("aria-invalid"), false);
        field.disabled = true;
        field.validity.valid = false;
        field.listeners.invalid();
        assert.equal(error.hidden, true);
        assert.equal(field.hasAttribute("aria-invalid"), false);
    }
});
