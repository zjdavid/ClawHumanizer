// ─── Inbound Queue ──────────────────────────────────────────────
// Intercepts inbound messages via the "before_prompt_build" hook
// and applies dynamic delay based on sender state.

import type { HumanizerConfig } from "./types.js";
import { sleep } from "./delay-engine.js";
import { StateManager } from "./state-manager.js";

/**
 * Registers the inbound delay logic on the given plugin API.
 *
 * @param api  - OpenClaw plugin API object
 * @param stateManager - shared state manager instance
 * @param getConfig - function that returns the current config (supports hot reload)
 */
export function registerInboundQueue(
    api: any,
    stateManager: StateManager,
    getConfig: () => HumanizerConfig,
): void {
    api.on(
        "before_prompt_build",
        async (_event: any, ctx: any) => {
            const config = getConfig();
            if (!config.enabled) return;

            const senderId: string = ctx?.senderId ?? "unknown";
            const action = stateManager.onMessage(senderId, config);

            switch (action.action) {
                case "auto-reply":
                    // Return an auto-reply and skip agent processing
                    api.logger?.info?.(
                        `[humanizer] 🌙 Sleep auto-reply to ${senderId}: "${action.text}"`,
                    );
                    return {
                        skipAgent: true,
                        reply: action.text,
                    };

                case "delay":
                    api.logger?.debug?.(
                        `[humanizer] ⏳ ${stateManager.getMode(senderId)} delay ${action.delayMs}ms for ${senderId}`,
                    );
                    await sleep(action.delayMs);
                    break;

                case "wake-and-delay":
                    api.logger?.info?.(
                        `[humanizer] ☀️ Wake up! ${senderId} woke from sleep, delay ${action.delayMs}ms`,
                    );
                    await sleep(action.delayMs);
                    break;
            }
        },
        { priority: 100 }, // Run early to apply delay before other hooks
    );
}
