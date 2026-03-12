// ─── State Manager ──────────────────────────────────────────────
// Manages per-sender state machine: Attention / Awake / Sleep.

import type {
    HumanizerConfig,
    HumanizerMode,
    MessageAction,
    SenderState,
} from "./types.js";
import { isInAwakePeriod, randomDelay } from "./delay-engine.js";

export class StateManager {
    private states = new Map<string, SenderState>();

    /** Get or create sender state. New senders start in "awake" mode. */
    private getState(senderId: string): SenderState {
        let state = this.states.get(senderId);
        if (!state) {
            state = {
                mode: "awake",
                lastContactTime: 0, // no previous contact → will trigger awakening
                sleepMessageCount: 0,
            };
            this.states.set(senderId, state);
        }
        return state;
    }

    /**
     * Process an inbound message and return the action to take.
     *
     * State transition logic:
     * 1. timeSinceLast < idleThreshold  →  Attention mode (2–10s delay)
     * 2. timeSinceLast ≥ idleThreshold  →  check schedule:
     *    a. Awake period → Awake mode (10s–5min delay)
     *    b. Sleep period →
     *       - sleepMsgCount < wakeUpCount → auto-reply, increment counter
     *       - sleepMsgCount ≥ wakeUpCount → switch to Attention, normal delay
     */
    onMessage(senderId: string, config: HumanizerConfig, now?: Date): MessageAction {
        const state = this.getState(senderId);
        const currentTime = now ?? new Date();
        const timestamp = currentTime.getTime();
        const timeSinceLast = state.lastContactTime === 0
            ? Infinity
            : timestamp - state.lastContactTime;

        // Always update last contact time
        state.lastContactTime = timestamp;

        const { inbound } = config;

        // ── Case 1: Active conversation → Attention mode ──
        if (timeSinceLast < inbound.idleThreshold) {
            // If we were in sleep mode and got enough messages, wake up
            if (state.mode === "sleep") {
                state.sleepMessageCount++;
                if (state.sleepMessageCount >= inbound.sleep.wakeUpCount) {
                    // Wake up! Switch to attention
                    state.mode = "attention";
                    state.sleepMessageCount = 0;
                    const delayMs = randomDelay(
                        inbound.attention.minDelay,
                        inbound.attention.maxDelay,
                    );
                    return { action: "wake-and-delay", delayMs };
                }
                // Still sleeping, auto-reply
                return { action: "auto-reply", text: inbound.sleep.autoReplyText };
            }

            // Normal Attention mode
            state.mode = "attention";
            state.sleepMessageCount = 0;
            const delayMs = randomDelay(
                inbound.attention.minDelay,
                inbound.attention.maxDelay,
            );
            return { action: "delay", delayMs };
        }

        // ── Case 2: Idle period exceeded → Awakening mode ──
        const isAwake = isInAwakePeriod(
            inbound.schedule.awakeStart,
            inbound.schedule.awakeEnd,
            inbound.schedule.timezone,
            currentTime,
        );

        if (isAwake) {
            // Awake period → Awake mode
            state.mode = "awake";
            state.sleepMessageCount = 0;
            const delayMs = randomDelay(
                inbound.awake.minDelay,
                inbound.awake.maxDelay,
            );
            return { action: "delay", delayMs };
        }

        // ── Case 3: Sleep period ──
        state.mode = "sleep";
        state.sleepMessageCount++;

        if (state.sleepMessageCount >= inbound.sleep.wakeUpCount) {
            // Enough messages → wake up to attention
            state.mode = "attention";
            state.sleepMessageCount = 0;
            const delayMs = randomDelay(
                inbound.attention.minDelay,
                inbound.attention.maxDelay,
            );
            return { action: "wake-and-delay", delayMs };
        }

        // Still sleeping → auto-reply
        return { action: "auto-reply", text: inbound.sleep.autoReplyText };
    }

    /** Returns the current mode for a sender (or "awake" if unknown). */
    getMode(senderId: string): HumanizerMode {
        return this.states.get(senderId)?.mode ?? "awake";
    }

    /** Returns a snapshot of all tracked senders (for debug/status). */
    getSnapshot(): Record<string, SenderState> {
        const result: Record<string, SenderState> = {};
        for (const [id, state] of this.states) {
            result[id] = { ...state };
        }
        return result;
    }

    /** Clear state for a specific sender. */
    resetSender(senderId: string): void {
        this.states.delete(senderId);
    }

    /** Clear all tracked state. */
    resetAll(): void {
        this.states.clear();
    }
}
