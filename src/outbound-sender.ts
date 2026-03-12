// ─── Outbound Sender ────────────────────────────────────────────
// Intercepts outbound messages and splits them into timed chunks
// to simulate human typing behavior.

import type { HumanizerConfig } from "./types.js";
import { calcTypingDelay, sleep, splitIntoChunks } from "./delay-engine.js";

/**
 * Registers the outbound chunked-sending logic on the given plugin API.
 *
 * @param api       - OpenClaw plugin API object
 * @param getConfig - function that returns the current config
 */
export function registerOutboundSender(
    api: any,
    getConfig: () => HumanizerConfig,
): void {
    api.registerHook(
        "message:outbound",
        async (payload: any) => {
            const config = getConfig();
            if (!config.enabled) return;

            const text: string | undefined = payload?.text;
            if (!text || text.length === 0) return;

            const { charsPerChunk, delayPerChar, chunkDelay, maxChunks } =
                config.outbound;
            const chunks = splitIntoChunks(text, charsPerChunk, maxChunks);

            // Single chunk → no need to delay
            if (chunks.length <= 1) return;

            // Replace original payload behavior: send chunks sequentially
            // The first chunk is sent immediately (by returning modified payload)
            // Subsequent chunks are sent with simulated delays

            api.logger?.debug?.(
                `[humanizer] ✍️  Splitting outbound message into ${chunks.length} chunks`,
            );

            // Prevent the default single-message send
            payload.text = chunks[0];

            // Schedule remaining chunks
            const sendRemainingChunks = async () => {
                for (let i = 1; i < chunks.length; i++) {
                    // Simulate typing time proportional to chunk length
                    const typingMs = calcTypingDelay(chunks[i], delayPerChar);
                    const totalDelay = chunkDelay + typingMs;

                    await sleep(totalDelay);

                    // Send the chunk via the same channel
                    try {
                        if (payload.sendText && typeof payload.sendText === "function") {
                            await payload.sendText(chunks[i]);
                        } else if (
                            payload.channel &&
                            typeof payload.channel.sendText === "function"
                        ) {
                            await payload.channel.sendText(chunks[i], payload.context);
                        }
                    } catch (err) {
                        api.logger?.warn?.(
                            `[humanizer] Failed to send chunk ${i + 1}/${chunks.length}: ${err}`,
                        );
                    }
                }
            };

            // Fire and forget — don't block the hook pipeline
            sendRemainingChunks().catch((err: unknown) => {
                api.logger?.error?.(`[humanizer] Outbound chunking failed: ${err}`);
            });
        },
        {
            name: "claw-humanizer.outbound-chunk",
            description: "Splits outbound messages into human-like typed chunks",
        },
    );
}
