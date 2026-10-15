const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");

const source = readFileSync(`${__dirname}/dashboard-state.js`, "utf8");
const key = "bunyan.dashboard";
const query = new URLSearchParams({
    period: "month", date: "2026-09-14", app: "Cats & Dogs", level: "Warning",
}).toString();

// Run the real browser helper against isolated storage/DOM stand-ins, without starting an IDE webview.
function visit({ saved, startup = "run-one", fields, search = "", blocked = false } = {}) {
    const storage = new Map(saved ? [[key, saved]] : []);
    storage.set("unrelated", "untouched");
    const links = [{ setAttribute(name, value) { this[name] = value; } }];
    const buttons = [{ setAttribute(name, value) { this[name] = value; } }];
    const notice = { hidden: true };
    let redirect;
    const errors = [];
    runInNewContext(source, {
        URLSearchParams,
        FormData: class { constructor(form) { return form; } },
        document: {
            querySelector: () => ({ content: startup }),
            querySelectorAll: selector => selector.startsWith("a[") ? links : buttons,
            getElementById: id => id === "dashboard-filters" ? fields : notice,
        },
        localStorage: {
            getItem: name => {
                if (blocked) throw new Error("Storage blocked");
                return storage.get(name) ?? null;
            },
            setItem: (name, value) => storage.set(name, value),
            removeItem: name => storage.delete(name),
        },
        window: { location: { search, replace: url => { redirect = url; } } },
        console: { error: (...args) => errors.push(args) },
    });
    return { storage, links, buttons, notice, redirect, errors };
}

test("drill-down and return preserve app, level, period, and exact selected date", () => {
    for (const period of ["day", "week", "month"]) {
        for (const level of ["Warning", "Error"]) {
            const fields = new URLSearchParams(query);
            fields.set("period", period);
            fields.set("level", level);
            const dashboard = visit({ fields, search: `?${fields}` });
            const saved = dashboard.storage.get(key);
            assert.equal(JSON.parse(saved).query, fields.toString());
            const detail = visit({ saved });
            assert.equal(detail.links[0].href, `/?${fields}`);
            assert.equal(detail.buttons[0]["data-url"], `/?${fields}`);
            const returned = visit({ saved, fields });
            assert.equal(returned.redirect, `/?${fields}`);
        }
    }
});

test("explicit navigation overrides storage, including Latest without a date", () => {
    const saved = JSON.stringify({ startup: "run-one", query });
    const fields = new URLSearchParams({
        period: "week", date: "2026-10-15", app: "", level: "Error",
    });
    const page = visit({ saved, fields, search: "?period=week&app=&level=Error" });
    assert.equal(page.redirect, undefined);
    assert.equal(JSON.parse(page.storage.get(key)).query, fields.toString());
});

test("a server restart discards dashboard storage without clearing unrelated keys", () => {
    const saved = JSON.stringify({ startup: "previous-run", query });
    const detail = visit({ saved });
    assert.equal(detail.storage.has(key), false);
    assert.equal(detail.storage.get("unrelated"), "untouched");
    assert.equal(detail.links[0].href, undefined);
    assert.equal(detail.buttons[0]["data-url"], undefined);
    const fields = new URLSearchParams("period=day&date=2026-10-15&app=&level=all");
    const dashboard = visit({ saved, fields });
    assert.equal(dashboard.redirect, undefined);
    assert.equal(JSON.parse(dashboard.storage.get(key)).query, fields.toString());
});

test("unavailable or malformed storage produces a visible error, not a bad redirect", () => {
    for (const options of [
        { blocked: true },
        { saved: "{" },
        { saved: JSON.stringify({ startup: "run-one", query: "invalid" }) },
    ]) {
        const page = visit(options);
        assert.equal(page.notice.hidden, false);
        assert.equal(page.errors.length, 1);
        assert.equal(page.redirect, undefined);
    }
});
