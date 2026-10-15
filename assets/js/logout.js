(() => {
    "use strict";

    const button = document.getElementById("sign-out");
    if (!button) return;
    const status = document.getElementById("logout-error");

    // Keep logout a same-origin POST so Rust revokes the session and expires its cookie.
    button.addEventListener("click", async () => {
        if (button.hasAttribute("disabled")) return;
        button.setAttribute("disabled", "");
        status.hidden = true;
        try {
            const response = await fetch("/logout", {
                method: "POST",
                credentials: "same-origin",
                mode: "same-origin",
            });
            if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
                const result = await response.json();
                if (result.shutdown !== true) throw new Error("Server did not confirm shutdown.");
                const main = document.getElementById("pageContentWrapper");
                main.textContent = "Bunyan has stopped. Open the Bunyan app again to restart.";
                document.querySelector("header.top").hidden = true;
                document.title = "Bunyan stopped";
                main.focus();
                return;
            }
            const destination = new URL(response.url);
            if (!response.ok || !response.redirected ||
                destination.origin !== location.origin || destination.pathname !== "/login") {
                throw new Error(`Sign out was not confirmed (HTTP ${response.status}). Please retry.`);
            }
            location.assign("/login");
        } catch (error) {
            console.error("Sign out failed.", error);
            status.textContent = `Unable to sign out: ${error.message}`;
            status.hidden = false;
            button.removeAttribute("disabled");
        }
    });
})();
