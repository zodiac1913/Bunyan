const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../../assets/js/logout.js"), "utf8");

function setup(fetch, present = true) {
    const attributes = new Set();
    let click;
    const button = {
        hasAttribute: name => attributes.has(name),
        setAttribute: name => attributes.add(name),
        removeAttribute: name => attributes.delete(name),
        addEventListener: (name, callback) => { assert.equal(name, "click"); click = callback; },
    };
    const status = { hidden: true, textContent: "" };
    const navigations = [];
    const errors = [];
    const main = { textContent: "", focus() { main.focused = true; } };
    const header = { hidden: false };
    vm.runInNewContext(source, {
        document: {
            getElementById: id => id === "sign-out" ? (present ? button : null) : id === "pageContentWrapper" ? main : status,
            querySelector: selector => { assert.equal(selector, "header.top"); return header; },
        },
        fetch, URL,
        location: { origin: "http://127.0.0.1:8080", assign: url => navigations.push(url) },
        console: { error: (...args) => errors.push(args) },
    });
    return { button, status, navigations, errors, click, main, header };
}

test("sign out posts once, waits for confirmation and navigates to sign in", async () => {
    let complete;
    let calls = 0;
    const ui = setup((url, options) => {
        calls++;
        assert.equal(url, "/logout");
        assert.equal(options.method, "POST");
        assert.equal(options.credentials, "same-origin");
        assert.equal(options.mode, "same-origin");
        return new Promise(resolve => { complete = resolve; });
    });
    const pending = ui.click();
    assert.equal(ui.button.hasAttribute("disabled"), true);
    await ui.click();
    assert.equal(calls, 1);
    assert.deepEqual(ui.navigations, []);
    complete({ ok: true, status: 200, redirected: true, url: "http://127.0.0.1:8080/login", headers: { get: () => "text/html" } });
    await pending;
    assert.deepEqual(ui.navigations, ["/login"]);
    assert.equal(ui.status.hidden, true);
});

test("failed or unconfirmed sign out stays visible and can be retried", async () => {
    for (const result of [
        new Error("Network unavailable"),
        { ok: false, status: 403, redirected: false, url: "http://127.0.0.1:8080/logout" },
        { ok: true, status: 200, redirected: false, url: "http://127.0.0.1:8080/logout", headers: { get: () => "text/html" } },
        { ok: true, status: 200, redirected: true, url: "http://127.0.0.1:8080/", headers: { get: () => "text/html" } },
        { ok: true, status: 200, redirected: true, url: "https://example.invalid/login", headers: { get: () => "text/html" } },
        { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ shutdown: false }) },
    ]) {
        const ui = setup(async () => { if (result instanceof Error) throw result; return result; });
        await ui.click();
        assert.deepEqual(ui.navigations, []);
        assert.equal(ui.button.hasAttribute("disabled"), false);
        assert.equal(ui.status.hidden, false);
        assert.match(ui.status.textContent, /Unable to sign out:/);
        assert.equal(ui.errors.length, 1);
        await ui.click();
        assert.equal(ui.errors.length, 2);
    }
});

test("desktop logout displays shutdown without navigating to an offline server", async () => {
    const ui = setup(async () => ({
        ok: true, headers: { get: () => "application/json" }, json: async () => ({ shutdown: true }),
    }));
    await ui.click();
    assert.deepEqual(ui.navigations, []);
    assert.deepEqual(ui.errors, []);
    assert.equal(ui.header.hidden, true);
    assert.match(ui.main.textContent, /Bunyan has stopped/);
    assert.equal(ui.main.focused, true);
});

test("public pages without a sign out button need no listener", () => {
    const ui = setup(() => assert.fail("Unexpected logout request"), false);
    assert.equal(ui.click, undefined);
    assert.deepEqual(ui.errors, []);
});
