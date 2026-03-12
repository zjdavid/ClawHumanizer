// ─── Humanizer Mode ─────────────────────────────────────────────
/** The three operational states of the humanizer. */
export type HumanizerMode = "attention" | "awake" | "sleep";

// ─── Configuration Interfaces ───────────────────────────────────

export interface DelayRange {
    /** Minimum delay in milliseconds. */
    minDelay: number;
    /** Maximum delay in milliseconds. */
    maxDelay: number;
}

export interface SleepConfig {
    /** Text to auto-reply when in sleep mode. */
    autoReplyText: string;
    /** Number of consecutive messages required to wake the bot. */
    wakeUpCount: number;
}

export interface ScheduleConfig {
    /** Awake period start time, e.g. "08:00". */
    awakeStart: string;
    /** Awake period end time, e.g. "23:00". */
    awakeEnd: string;
    /** IANA timezone identifier, e.g. "Asia/Shanghai". */
    timezone: string;
}

export interface InboundConfig {
    /** Idle threshold in ms. Switches from Attention → Awakening mode. Default: 600000 (10min). */
    idleThreshold: number;
    /** Attention mode delay range (active conversation). */
    attention: DelayRange;
    /** Awake mode delay range (idle + daytime). */
    awake: DelayRange;
    /** Sleep mode configuration. */
    sleep: SleepConfig;
    /** Daily awake/sleep schedule. */
    schedule: ScheduleConfig;
}

export interface OutboundConfig {
    /** Maximum characters per outbound message chunk. */
    charsPerChunk: number;
    /** Simulated typing delay per character in ms. */
    delayPerChar: number;
    /** Extra pause between chunks in ms. */
    chunkDelay: number;
    /** Maximum number of chunks to split a message into. */
    maxChunks: number;
}

export interface HumanizerConfig {
    /** Global enable/disable toggle. */
    enabled: boolean;
    /** Inbound delay configuration. */
    inbound: InboundConfig;
    /** Outbound chunked sending configuration. */
    outbound: OutboundConfig;
}

// ─── Per-Sender State ───────────────────────────────────────────

export interface SenderState {
    /** Current operational mode for this sender. */
    mode: HumanizerMode;
    /** Timestamp (ms) of the last received message from this sender. */
    lastContactTime: number;
    /** Counter of messages received during sleep mode (resets on mode change). */
    sleepMessageCount: number;
}

// ─── Action Types ───────────────────────────────────────────────

export interface DelayAction {
    action: "delay";
    delayMs: number;
}

export interface AutoReplyAction {
    action: "auto-reply";
    text: string;
}

export interface WakeAndDelayAction {
    action: "wake-and-delay";
    delayMs: number;
}

/** The result of evaluating an inbound message against the state machine. */
export type MessageAction = DelayAction | AutoReplyAction | WakeAndDelayAction;

// ─── Defaults ───────────────────────────────────────────────────

export const DEFAULT_CONFIG: HumanizerConfig = {
    enabled: true,
    inbound: {
        idleThreshold: 600_000, // 10 minutes
        attention: { minDelay: 2_000, maxDelay: 10_000 },
        awake: { minDelay: 10_000, maxDelay: 300_000 },
        sleep: {
            autoReplyText: "我已经睡了，连发三条消息可以唤醒我",
            wakeUpCount: 3,
        },
        schedule: {
            awakeStart: "08:00",
            awakeEnd: "23:00",
            timezone: "Asia/Shanghai",
        },
    },
    outbound: {
        charsPerChunk: 80,
        delayPerChar: 50,
        chunkDelay: 1_500,
        maxChunks: 10,
    },
};
