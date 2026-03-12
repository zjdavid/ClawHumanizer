// ─── Claw Humanizer — Plugin Entry Point ────────────────────────
// Makes AI responses feel human: dynamic inbound delays + chunked outbound.
//
// DIAGNOSTIC VERSION: Wraps every registration step in try/catch with
// detailed logging to trace OpenClaw 2026.3.x compatibility issues.

import type { HumanizerConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { StateManager } from "./state-manager.js";
import { registerInboundQueue } from "./inbound-queue.js";
import { registerOutboundSender } from "./outbound-sender.js";

// ─── Diagnostic logger (writes to stderr + api.logger if available) ─
function diag(api: any, level: string, msg: string): void {
    const line = `[humanizer:${level}] ${msg}`;
    // Always write to stderr so it shows in Gateway console
    console.error(line);
    // Also write to api.logger if available
    try {
        if (level === "error") api?.logger?.error?.(line);
        else if (level === "warn") api?.logger?.warn?.(line);
        else api?.logger?.info?.(line);
    } catch { /* ignore logger errors */ }
}

/**
 * OpenClaw plugin registration function.
 */
export default function register(api: any): void {
    diag(api, "info", "=== claw-humanizer register() ENTRY ===");

    // ─── Inspect plugin API surface ───────────────────────────────
    // Log which methods are available so we can see what OpenClaw gives us
    try {
        const apiKeys = Object.keys(api ?? {}).sort().join(", ");
        diag(api, "info", `api keys: [${apiKeys}]`);

        const apiMethods = Object.keys(api ?? {})
            .filter((k) => typeof (api as any)[k] === "function")
            .sort()
            .join(", ");
        diag(api, "info", `api methods: [${apiMethods}]`);

        if (api.config !== undefined) {
            diag(api, "info", `api.config keys: [${Object.keys(api.config ?? {}).sort().join(", ")}]`);
        } else {
            diag(api, "warn", "api.config is undefined");
        }
    } catch (e) {
        diag(api, "error", `Failed to inspect api: ${e}`);
    }

    // ─── StateManager ────────────────────────────────────────────
    let stateManager: StateManager;
    try {
        stateManager = new StateManager();
        diag(api, "info", "StateManager created OK");
    } catch (e) {
        diag(api, "error", `StateManager creation FAILED: ${e}`);
        return;
    }

    // ─── Config resolver ──────────────────────────────────────────
    const getConfig = (): HumanizerConfig => {
        const raw = api.config ?? {};
        return deepMerge(DEFAULT_CONFIG, raw) as HumanizerConfig;
    };

    // ─── 1. Register inbound delay ────────────────────────────────
    try {
        diag(api, "info", "Registering inbound queue (message_received hook)...");
        registerInboundQueue(api, stateManager, getConfig);
        diag(api, "info", "✅ Inbound queue registered OK");
    } catch (e) {
        diag(api, "error", `❌ Inbound queue registration FAILED: ${e}`);
    }

    // ─── 2. Register outbound sender ──────────────────────────────
    try {
        diag(api, "info", "Registering outbound sender (before_prompt_build + message_sending)...");
        registerOutboundSender(api, getConfig);
        diag(api, "info", "✅ Outbound sender registered OK");
    } catch (e) {
        diag(api, "error", `❌ Outbound sender registration FAILED: ${e}`);
    }

    // ─── 3. Register /humanizer command ───────────────────────────
    try {
        diag(api, "info", "Registering /humanizer command...");
        diag(api, "info", `api.registerCommand type: ${typeof api.registerCommand}`);

        if (typeof api.registerCommand !== "function") {
            diag(api, "error", "api.registerCommand is NOT a function!");
            diag(api, "info", "Trying alternative: api.command / api.commands.register ...");

            // Try alternative APIs
            if (typeof api.command === "function") {
                diag(api, "info", "Found api.command(), trying...");
            }
            if (api.commands && typeof api.commands.register === "function") {
                diag(api, "info", "Found api.commands.register(), trying...");
            }
        }

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

        diag(api, "info", "✅ /humanizer command registered OK");
    } catch (e) {
        diag(api, "error", `❌ /humanizer command registration FAILED: ${e}`);
        // Log full stack trace
        if (e instanceof Error && e.stack) {
            diag(api, "error", `Stack: ${e.stack}`);
        }
    }

    // ─── 4. Register Gateway RPC ──────────────────────────────────
    try {
        diag(api, "info", "Registering humanizer.status RPC...");
        diag(api, "info", `api.registerGatewayMethod type: ${typeof api.registerGatewayMethod}`);

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

        diag(api, "info", "✅ RPC registered OK");
    } catch (e) {
        diag(api, "error", `❌ RPC registration FAILED: ${e}`);
    }

    diag(api, "info", "=== claw-humanizer register() COMPLETE ===");
}

// ─── Utility ────────────────────────────────────────────────────

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
