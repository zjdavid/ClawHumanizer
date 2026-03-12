// ─── Outbound Sender ────────────────────────────────────────────
// Simulates human-like chunked message sending.
//
// COMPATIBILITY NOTE (OpenClaw 2026.3.x):
//   - The "message_sending" hook is NOT reliably called for agent replies
//     in most outbound paths (Telegram, WhatsApp, Webchat).
//   - The "message:outbound" registerHook has similar reliability issues.
//   - STRATEGY: We use "before_prompt_build" to inject a system prompt
//     instruction telling the AI to naturally break its response into
//     short paragraphs. This achieves the chunked-send effect without
//     relying on broken outbound hooks.
//   - Additionally, we register "message_sending" as a BEST-EFFORT
//     fallback — it may fire in future OpenClaw versions.

import type { HumanizerConfig } from "./types.js";
import { calcTypingDelay, sleep, splitIntoChunks } from "./delay-engine.js";

/**
 * Registers outbound chunked-sending logic.
 *
 * Two-pronged approach:
 * 1. Prompt injection via "before_prompt_build" (reliable)
 * 2. Best-effort "message_sending" hook for actual message splitting (may not fire)
 */
export function registerOutboundSender(
    api: any,
    getConfig: () => HumanizerConfig,
): void {
    // ─── Approach 1: Prompt injection (RELIABLE) ─────────────────
    // Instruct the AI to write shorter paragraphs for natural pacing.
    api.on(
        "before_prompt_build",
        (_event: any, _ctx: any) => {
            const config = getConfig();
            if (!config.enabled) return {};

            const { charsPerChunk } = config.outbound;
            const instruction = [
                `[HUMANIZER STYLE GUIDE]`,
                `To simulate natural conversation rhythm:`,
                `- Break your response into SHORT paragraphs (max ~${charsPerChunk} characters each).`,
                `- Use line breaks between paragraphs.`,
                `- Each paragraph should be a complete thought.`,
                `- Avoid sending walls of text.`,
                `- This makes the conversation feel more natural and human-like.`,
            ].join("\n");

            return {
                appendSystemContext: instruction,
            };
        },
        { priority: 5 }, // Low priority, runs after other hooks
    );

    // ─── Approach 2: Best-effort message_sending hook ────────────
    // This may NOT fire in OpenClaw 2026.3.x for agent replies,
    // but we register it anyway for forward compatibility.
    api.on(
        "message_sending",
        async (event: any, _ctx: any) => {
            const config = getConfig();
            if (!config.enabled) return;

            const text: string | undefined = event?.text ?? event?.message?.text;
            if (!text || text.length === 0) return;

            const { charsPerChunk, delayPerChar, chunkDelay, maxChunks } =
                config.outbound;
            const chunks = splitIntoChunks(text, charsPerChunk, maxChunks);

            // Single chunk → no modification needed
            if (chunks.length <= 1) return;

            api.logger?.debug?.(
                `[humanizer] ✍️  Splitting outbound into ${chunks.length} chunks`,
            );

            // Modify the event to only send the first chunk
            if (event.text !== undefined) {
                event.text = chunks[0];
            } else if (event.message?.text !== undefined) {
                event.message.text = chunks[0];
            }

            // Schedule remaining chunks with delays
            const sendRemaining = async () => {
                for (let i = 1; i < chunks.length; i++) {
                    const typingMs = calcTypingDelay(chunks[i], delayPerChar);
                    const totalDelay = chunkDelay + typingMs;
                    await sleep(totalDelay);

                    try {
                        // Try multiple API patterns for sending follow-up chunks
                        if (event.sendText && typeof event.sendText === "function") {
                            await event.sendText(chunks[i]);
                        } else if (event.reply && typeof event.reply === "function") {
                            await event.reply(chunks[i]);
                        } else if (
                            event.channel?.sendText &&
                            typeof event.channel.sendText === "function"
                        ) {
                            await event.channel.sendText(chunks[i], event.context);
                        }
                    } catch (err) {
                        api.logger?.warn?.(
                            `[humanizer] Failed to send chunk ${i + 1}/${chunks.length}: ${err}`,
                        );
                    }
                }
            };

            // Fire and forget
            sendRemaining().catch((err: unknown) => {
                api.logger?.error?.(`[humanizer] Outbound chunking error: ${err}`);
            });
        },
        { priority: 50 },
    );
}
