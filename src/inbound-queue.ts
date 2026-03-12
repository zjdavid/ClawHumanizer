// ─── Inbound Queue ──────────────────────────────────────────────
// Intercepts inbound messages via "message_received" lifecycle hook
// and applies dynamic delay based on sender state.
//
// COMPATIBILITY NOTE (OpenClaw 2026.3.x):
//   - Uses api.on("message_received") which fires reliably for all
//     inbound message paths (Telegram, WhatsApp, Webchat, etc.)
//   - Does NOT use api.registerHook() which has known reliability issues

import type { HumanizerConfig } from "./types.js";
import { sleep } from "./delay-engine.js";
import { StateManager } from "./state-manager.js";

/**
 * Registers the inbound delay logic on the given plugin API.
 *
 * Uses two hooks:
 * 1. "message_received" — applies delay or auto-reply BEFORE agent processes
 * 2. "before_prompt_build" — injects chunking instructions into system prompt
 */
export function registerInboundQueue(
    api: any,
    stateManager: StateManager,
    getConfig: () => HumanizerConfig,
): void {
    // ─── Hook 1: Inbound message delay ───────────────────────────
    // "message_received" fires when a message arrives from any channel.
    // We apply delay here to simulate "read but haven't replied yet".
    api.on(
        "message_received",
        async (event: any, ctx: any) => {
            const config = getConfig();
            if (!config.enabled) return;

            const senderId: string =
                event?.senderId ?? ctx?.senderId ?? event?.from ?? "unknown";
            const action = stateManager.onMessage(senderId, config);

            switch (action.action) {
                case "auto-reply":
                    api.logger?.info?.(
                        `[humanizer] 🌙 Sleep auto-reply to ${senderId}`,
                    );
                    // Return auto-reply payload to skip agent processing
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
        { priority: 100 }, // Run early so delay happens before agent
    );
}
