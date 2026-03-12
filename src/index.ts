// ─── Claw Humanizer — Plugin Entry Point ────────────────────────
// Makes AI responses feel human: dynamic inbound delays + chunked outbound.
//
// COMPATIBILITY: OpenClaw 2026.3.x
//   - Inbound: api.on("message_received") — reliable for all channels
//   - Outbound: api.on("before_prompt_build") for prompt injection (reliable)
//             + api.on("message_sending") as best-effort fallback

import type { HumanizerConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { StateManager } from "./state-manager.js";
import { registerInboundQueue } from "./inbound-queue.js";
import { registerOutboundSender } from "./outbound-sender.js";

/**
 * OpenClaw plugin registration function.
 * Called by OpenClaw's plugin loader at startup.
 */
export default function register(api: any): void {
    const stateManager = new StateManager();

    // ─── Config resolver ──────────────────────────────────────────
    // Merges user config with defaults so all fields are guaranteed present.
    const getConfig = (): HumanizerConfig => {
        const raw = api.config ?? {};
        return deepMerge(DEFAULT_CONFIG, raw) as HumanizerConfig;
    };

    // ─── 1. Register inbound delay (message_received hook) ────────
    registerInboundQueue(api, stateManager, getConfig);

    // ─── 2. Register outbound chunked sender ──────────────────────
    //    Uses before_prompt_build (reliable) + message_sending (best-effort)
    registerOutboundSender(api, getConfig);

    // ─── 3. Register /humanizer command ───────────────────────────
    api.registerCommand({
        name: "humanizer",
        description: "Control the humanizer delay plugin",
        acceptsArgs: true,
        requireAuth: true,
        handler: (ctx: any) => {
            const args = (ctx.args ?? "").trim().toLowerCase();
            const config = getConfig();

            switch (args) {
                case "on":
                    config.enabled = true;
                    return { text: "✅ Humanizer enabled." };

                case "off":
                    config.enabled = false;
                    return { text: "🔇 Humanizer disabled." };

                case "reset":
                    stateManager.resetAll();
                    return { text: "🔄 All sender states reset." };

                case "status":
                default: {
                    const snapshot = stateManager.getSnapshot();
                    const senderCount = Object.keys(snapshot).length;
                    const lines = [
                        `🐾 **Claw Humanizer** — ${config.enabled ? "ON" : "OFF"}`,
                        "",
                        `**Tracked senders:** ${senderCount}`,
                        `**Idle threshold:** ${config.inbound.idleThreshold / 1000}s`,
                        `**Awake hours:** ${config.inbound.schedule.awakeStart} – ${config.inbound.schedule.awakeEnd} (${config.inbound.schedule.timezone})`,
                        `**Attention delay:** ${config.inbound.attention.minDelay / 1000}–${config.inbound.attention.maxDelay / 1000}s`,
                        `**Awake delay:** ${config.inbound.awake.minDelay / 1000}–${config.inbound.awake.maxDelay / 1000}s`,
                        `**Sleep wake count:** ${config.inbound.sleep.wakeUpCount} messages`,
                        "",
                        `**Outbound:** prompt injection + best-effort chunking`,
                    ];

                    if (senderCount > 0) {
                        lines.push("", "**Sender states:**");
                        for (const [id, state] of Object.entries(snapshot)) {
                            const ago = Date.now() - (state as any).lastContactTime;
                            const agoStr =
                                ago > 60_000
                                    ? `${Math.floor(ago / 60_000)}m ago`
                                    : `${Math.floor(ago / 1000)}s ago`;
                            lines.push(
                                `  • \`${id}\`: **${(state as any).mode}** (last: ${agoStr})`,
                            );
                        }
                    }

                    return { text: lines.join("\n") };
                }
            }
        },
    });

    // ─── 4. Register Gateway RPC ──────────────────────────────────
    api.registerGatewayMethod(
        "humanizer.status",
        ({ respond }: { respond: (ok: boolean, data: any) => void }) => {
            const config = getConfig();
            respond(true, {
                enabled: config.enabled,
                senders: stateManager.getSnapshot(),
            });
        },
    );

    api.logger?.info?.("🐾 claw-humanizer loaded — human-like delays active");
}

// ─── Utility ────────────────────────────────────────────────────

/** Deep merge `source` into `target`, returning a new object. */
function deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === "object"
        ) {
            result[key] = deepMerge(target[key], source[key]);
        } else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}
