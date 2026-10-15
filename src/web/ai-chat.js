(() => {
    "use strict";

    const form = document.getElementById("ai-chat-form");
    const startup = document.querySelector('meta[name="bunyan-startup"]').content;
    const provider = form.dataset.provider;
    const group = form.dataset.group ? Number(form.dataset.group) : null;
    const key = `bunyan.chat.${provider}.${group ?? "general"}`;
    const transcript = document.getElementById("chat-transcript");
    const status = document.getElementById("chat-status");
    const input = document.getElementById("chat-message");
    const model = document.getElementById("chat-model");
    const send = document.getElementById("chat-send");
    const clear = document.getElementById("chat-clear");
    let turns = [];

    const render = () => {
        // Plain text deliberately keeps model output inert; no generated HTML is inserted.
        transcript.textContent = turns.map(turn => `You:\n${turn.user}\n\nAI (${turn.model}):\n${turn.assistant}`).join("\n\n---\n\n");
        transcript.scrollTop = transcript.scrollHeight;
    };
    const save = () => {
        // Conversation text stays tab-local; failures remain visible without discarding in-memory replies.
        try {
            sessionStorage.setItem(key, JSON.stringify({ startup, turns, model: model.value }));
        } catch (error) {
            console.error("Cannot save AI chat history.", error);
            status.textContent = "Browser storage is unavailable. This conversation will be lost when you leave this page.";
        }
    };
    try {
        for (const name of Object.keys(sessionStorage)) {
            if (name.startsWith("bunyan.chat.")) {
                const saved = JSON.parse(sessionStorage.getItem(name));
                if (saved.startup !== startup) sessionStorage.removeItem(name);
            }
        }
        const raw = sessionStorage.getItem(key);
        if (raw) {
            const saved = JSON.parse(raw);
            if (!Array.isArray(saved.turns) || !saved.turns.every(turn =>
                typeof turn.user === "string" && typeof turn.assistant === "string" && typeof turn.model === "string")) {
                throw new Error("Invalid saved conversation.");
            }
            turns = saved.turns;
            if ([...model.options].some(option => option.value === saved.model)) model.value = saved.model;
        }
    } catch (error) {
        console.error("Cannot restore AI chat history.", error);
        status.textContent = "Saved conversation could not be restored. Clear the conversation to reset it.";
    }
    render();
    model.addEventListener("change", save);
    clear.addEventListener("click", () => {
        turns = [];
        input.value = "";
        status.textContent = "";
        render();
        save();
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (send.disabled || !input.value.trim()) return;
        const message = input.value;
        const selectedModel = model.value;
        send.disabled = clear.disabled = model.disabled = input.disabled = true;
        status.textContent = "Waiting for AI...";
        try {
            const response = await fetch("/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ startup, provider, group, model: selectedModel, turns, message }),
            });
            if (response.redirected) throw new Error("Your session expired. Sign in again, then reload AI Chat.");
            if (!response.headers.get("content-type")?.includes("application/json")) {
                throw new Error(`AI Chat returned HTTP ${response.status}. Reload or shorten the conversation and retry.`);
            }
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `AI request failed: HTTP ${response.status}`);
            if (typeof result.text !== "string" || !result.text.trim()) throw new Error("AI returned no text.");
            turns.push({ user: message, assistant: result.text, model: selectedModel });
            input.value = "";
            status.textContent = "";
            render();
            save();
        } catch (error) {
            console.error("AI chat request failed.", error);
            status.textContent = error.message;
        } finally {
            send.disabled = clear.disabled = model.disabled = input.disabled = false;
        }
    });
})();
