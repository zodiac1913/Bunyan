const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const source = readFileSync(`${__dirname}/ai-chat.js`, "utf8");

// Exercise the shipped helper with inert DOM stand-ins; no provider or GUI is opened.
function setup({ startup = "run", saved = {}, response, storageBlocked = false } = {}) {
    const elements = {};
    for (const id of ["ai-chat-form", "chat-transcript", "chat-status", "chat-message", "chat-model", "chat-send", "chat-clear"]) {
        elements[id] = { value: "", disabled: false, textContent: "", events: {},
            addEventListener(name, fn) { this.events[name] = fn; } };
    }
    elements["ai-chat-form"].dataset = { provider: "ollama", group: "75" };
    elements["chat-model"].value = "default";
    elements["chat-model"].options = [{ value: "default" }, { value: "alternate" }];
    const storage = { ...saved };
    const sessionStorage = new Proxy(storage, {
        get(target, name) {
            if (name === "getItem") return key => {
                if (storageBlocked) throw Error("Storage blocked");
                return target[key] ?? null;
            };
            if (name === "setItem") return (key, value) => { target[key] = value; };
            if (name === "removeItem") return key => { delete target[key]; };
            return target[name];
        },
    });
    const requests = [];
    runInNewContext(source, {
        document: {
            getElementById: id => elements[id],
            querySelector: () => ({ content: startup }),
        },
        sessionStorage,
        fetch: async (url, options) => {
            requests.push({ url, body: JSON.parse(options.body) });
            return response ?? { ok: true, redirected: false,
                headers: { get: () => "application/json" },
                json: async () => ({ text: "<script>inert</script> proposed fix" }) };
        },
        console: { error() {} },
    });
    return { elements, storage, requests,
        submit: () => elements["ai-chat-form"].events.submit({ preventDefault() {} }) };
}

test("chat sends the selected model and restores history without interpreting AI HTML", async () => {
    const app = setup();
    app.elements["chat-model"].value = "alternate";
    app.elements["chat-message"].value = "How can I fix this?";
    await app.submit();
    assert.equal(app.requests[0].body.model, "alternate");
    assert.equal(app.requests[0].body.provider, "ollama");
    assert.equal(app.requests[0].body.group, 75);
    assert.ok(app.elements["chat-transcript"].textContent.includes("<script>inert</script>"));
    assert.equal(app.elements["chat-send"].disabled, false);
    const restored = setup({ saved: app.storage });
    assert.equal(restored.elements["chat-model"].value, "alternate");
    assert.ok(restored.elements["chat-transcript"].textContent.includes("How can I fix this?"));
    restored.elements["chat-model"].value = "default";
    restored.elements["chat-message"].value = "What should I test?";
    await restored.submit();
    assert.equal(restored.requests[0].body.turns.length, 1);
    assert.equal(restored.requests[0].body.model, "default");
});

test("Bunyan restart clears chat history but not unrelated tab storage", () => {
    const app = setup({ saved: {
        "bunyan.chat.ollama.75": JSON.stringify({ startup: "old", turns: [], model: "alternate" }),
        unrelated: "preserve",
    } });
    assert.equal(app.storage["bunyan.chat.ollama.75"], undefined);
    assert.equal(app.storage.unrelated, "preserve");
    assert.equal(app.elements["chat-transcript"].textContent, "");
});

test("errors preserve the draft and model controls and can be retried", async () => {
    const app = setup({ response: { ok: false, status: 400, redirected: false,
        headers: { get: () => "application/json" }, json: async () => ({ error: "Provider unavailable" }) } });
    app.elements["chat-message"].value = "Keep this draft";
    await app.submit();
    assert.equal(app.elements["chat-status"].textContent, "Provider unavailable");
    assert.equal(app.elements["chat-message"].value, "Keep this draft");
    assert.equal(app.elements["chat-model"].disabled, false);
    assert.equal(app.elements["chat-transcript"].textContent, "");
});

test("blocked storage is visible and clear conversation resets saved history", async () => {
    assert.ok(setup({ storageBlocked: true }).elements["chat-status"].textContent.includes("could not be restored"));
    const app = setup();
    app.elements["chat-message"].value = "test";
    await app.submit();
    app.elements["chat-clear"].events.click();
    assert.equal(app.elements["chat-transcript"].textContent, "");
    assert.deepEqual(JSON.parse(app.storage["bunyan.chat.ollama.75"]).turns, []);
});
