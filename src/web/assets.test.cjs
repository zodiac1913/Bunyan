const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL, fileURLToPath } = require("node:url");

async function loadRuntime(Element = class {}, documentOverrides = {}) {
    const callbacks = [];
    const wrapper = {};
    const definitions = new Map();
    const context = vm.createContext({
        console, URL, HTMLElement: Element,
        Node: { TEXT_NODE: 3 },
        customElements: { define(name, ctor) { definitions.set(name, ctor); }, get(name) { return definitions.get(name); } },
        location: { origin: "http://127.0.0.1:8080" },
        document: {
            addEventListener(name, callback) { if (name === "DOMContentLoaded") callbacks.push(callback); },
            getElementsByTagName: () => [{}],
            getElementById: () => ({}),
            querySelectorAll: () => [],
            querySelector: selector => selector === "#pageContentWrapper" ? wrapper : null,
            ...documentOverrides,
        },
    });
    const modules = new Map();
    function load(url) {
        if (!modules.has(url)) {
            const text = fs.readFileSync(fileURLToPath(url), "utf8");
            assert.ok(!text.includes("/tzedek/"), url);
            modules.set(url, new vm.SourceTextModule(text, {
                context, identifier: url,
                initializeImportMeta(meta) { meta.url = url; },
            }));
        }
        return modules.get(url);
    }
    const entry = load(pathToFileURL(path.resolve(__dirname, "../../assets/js/sml/sml.js")).href);
    await entry.link((specifier, parent) => {
        assert.ok(specifier.startsWith("."), `Unexpected non-local dependency: ${specifier}`);
        return load(new URL(specifier, parent.identifier).href);
    });
    await entry.evaluate();
    for (const callback of callbacks) await callback();
    return { context, wrapper, modules, definitions };
}

test("SML module graph links without Tzedek and initializes the Bunyan wrapper", async () => {
    const { context, wrapper, modules, definitions } = await loadRuntime();
    assert.equal(context.smelly.pageWrapper, wrapper);
    assert.ok(modules.size >= 20);
    assert.equal(context.smlCompliance, undefined);
    assert.ok(definitions.has("sml-reactive-button"));
});

// DOM stand-ins exercise the real custom element's lifecycle, event handlers and submitter bridge.
class Element {
    constructor() {
        this.attrs = new Map();
        this.dataset = {};
        this.listeners = {};
        this.childNodes = [];
        this.className = "bunyan-reactive";
        this.classList = {
            contains: name => this.className.split(" ").includes(name),
            add: (...names) => { this.className += ` ${names.join(" ")}`; },
            remove: (...names) => { this.className = this.className.split(" ").filter(name => !names.includes(name)).join(" "); },
        };
        this.style = { setProperty() {}, removeProperty() {} };
    }
    setAttribute(name, value) {
        const old = this.getAttribute(name);
        this.attrs.set(name, String(value));
        if (old !== String(value) && this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback(name, old, String(value));
    }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    removeAttribute(name) {
        const old = this.getAttribute(name);
        this.attrs.delete(name);
        if (old !== null && this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback(name, old, null);
    }
    toggleAttribute(name, force) { if (force) this.setAttribute(name, ""); else this.removeAttribute(name); }
    closest() { return this.formOwner; }
    insertAdjacentHTML() {}
    querySelector() { return null; }
    addEventListener(name, callback, capture = false) {
        (this.listeners[name] ??= []).push({ callback, capture });
    }
    fire(name, properties = {}) {
        const event = {
            defaultPrevented: false, currentTarget: this, target: this,
            preventDefault() { this.defaultPrevented = true; },
            stopImmediatePropagation() { this.stopped = true; },
            ...properties,
        };
        for (const listener of [...(this.listeners[name] ?? [])].sort((a, b) => Number(b.capture) - Number(a.capture))) {
            listener.callback(event);
            if (event.stopped) break;
        }
        return event;
    }
    click() { this.fire("click"); }
}

test("reactive submitters preserve actions/validation, prevent double keyboard activation, and restore disabled state", async () => {
    let pending;
    let markup;
    const submissions = [];
    const form = new Element();
    form.insertAdjacentHTML = (position, html) => {
        markup = html;
        pending = { remove() { pending = null; } };
    };
    form.requestSubmit = submitter => { assert.equal(submitter, pending); submissions.push(markup); };
    const { definitions } = await loadRuntime(Element, {
        getElementById: id => id.startsWith("smly-") ? {} : pending,
    });
    const Button = definitions.get("sml-reactive-button");
    const make = async (action, disabled = false) => {
        const button = new Button();
        button.id = action;
        button.formOwner = form;
        button.dataset.text = action;
        button.dataset.icon = "bi bi-save";
        button.setAttribute("type", "submit");
        button.setAttribute("name", "action");
        button.setAttribute("value", action);
        button.disabled = disabled;
        await button.connectedCallback();
        return button;
    };
    const button = await make("save");
    button.click();
    assert.equal(submissions.length, 1);
    assert.ok(submissions[0].includes('name="action"'));
    assert.ok(submissions[0].includes('value="save"'));
    assert.ok(!submissions[0].includes("formnovalidate"));
    assert.equal(pending, null);
    assert.ok(!button.hasAttribute("onkeydown"), "keyboard activation must not have two handlers");
    button.fire("keydown", { key: "Enter" });
    button.fire("keydown", { key: " " });
    assert.equal(submissions.length, 3);
    button.disabled = true;
    button.click();
    button.fire("keydown", { key: "Enter" });
    assert.equal(submissions.length, 3);
    assert.equal(button.getAttribute("aria-disabled"), "true");
    button.disabled = false;
    assert.equal(button.tabIndex, 0);
    button.click();
    assert.equal(submissions.length, 4);
    const browse = await make("browse", true);
    browse.setAttribute("formnovalidate", "");
    browse.click();
    assert.equal(submissions.length, 4);
    browse.disabled = false;
    browse.click();
    assert.ok(submissions.at(-1).includes("formnovalidate"));
    assert.ok(submissions.at(-1).includes('value="browse"'));
    form.querySelector = () => button;
    form.fire("keydown", { key: "Enter", target: { tagName: "INPUT", type: "password" } });
    assert.equal(submissions.length, 6);
    form.fire("keydown", { key: "Enter", target: { tagName: "TEXTAREA", type: "textarea" } });
    assert.equal(submissions.length, 6);
    const clear = await make("clear");
    clear.setAttribute("type", "button");
    let clears = 0;
    clear.addEventListener("click", () => { clears++; });
    clear.click();
    assert.equal(clears, 1);
    assert.equal(submissions.length, 6);
});

test("every authored Bunyan button has explicit accessible text, title, icon and label metadata", () => {
    let count = 0;
    for (const name of ["pages.rs", "settings.rs", "auth.rs", "ai_chat.rs"]) {
        const source = fs.readFileSync(path.join(__dirname, name), "utf8");
        assert.ok(!/^\s*button(?:[ .])/m.test(source), name);
        for (const line of source.split("\n").filter(line => line.includes("sml-reactive-button.bunyan-reactive"))) {
            for (const attr of ["aria-label=", "title=", "data-icon=", "data-text="]) {
                assert.ok(line.includes(attr), `${name}: missing ${attr}`);
            }
            count++;
        }
    }
    assert.equal(count, 18);
});
