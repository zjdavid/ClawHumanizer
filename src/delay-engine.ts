// ─── Delay Engine ───────────────────────────────────────────────
// Pure utility functions — no side effects, fully testable.

/**
 * Returns a random integer delay between `min` and `max` (inclusive), in ms.
 */
export function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates a simulated typing delay based on text length.
 */
export function calcTypingDelay(text: string, delayPerChar: number): number {
    return text.length * delayPerChar;
}

/**
 * Checks whether the current time falls within the [awakeStart, awakeEnd)
 * range for the given IANA timezone.
 *
 * Supports overnight ranges where awakeEnd < awakeStart (e.g. "22:00"–"06:00").
 */
export function isInAwakePeriod(
    awakeStart: string,
    awakeEnd: string,
    timezone: string,
    now?: Date,
): boolean {
    const currentTime = now ?? new Date();

    // Get HH:MM in the target timezone
    const timeStr = currentTime.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: timezone,
    });

    const currentMinutes = timeToMinutes(timeStr);
    const startMinutes = timeToMinutes(awakeStart);
    const endMinutes = timeToMinutes(awakeEnd);

    if (startMinutes <= endMinutes) {
        // Normal range: e.g. 08:00 – 23:00
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
        // Overnight range: e.g. 22:00 – 06:00
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
}

/** Converts "HH:MM" to total minutes since midnight. */
function timeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

// ─── Text Chunking ──────────────────────────────────────────────

/**
 * Split `text` into multiple chunks for realistic outbound sending.
 *
 * Strategy:
 * 1. Split by double-newline (paragraphs) first.
 * 2. If a paragraph > charsPerChunk, split at sentence boundaries (。！？.!?\n).
 * 3. If still too long, hard-split at charsPerChunk.
 * 4. Cap total chunks at maxChunks; last chunk gets all remaining text.
 */
export function splitIntoChunks(
    text: string,
    charsPerChunk: number,
    maxChunks: number,
): string[] {
    if (!text || charsPerChunk <= 0) return [text];

    // Step 1: Split by paragraph breaks
    const paragraphs = text.split(/\n{2,}/);
    const rawChunks: string[] = [];

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        if (trimmed.length <= charsPerChunk) {
            rawChunks.push(trimmed);
        } else {
            // Step 2: Sentence-level splitting
            rawChunks.push(...splitBySentence(trimmed, charsPerChunk));
        }
    }

    // Step 3: Enforce maxChunks
    if (rawChunks.length <= maxChunks) return rawChunks;

    const result = rawChunks.slice(0, maxChunks - 1);
    result.push(rawChunks.slice(maxChunks - 1).join("\n\n"));
    return result;
}

/** Split a single paragraph at sentence boundaries. */
function splitBySentence(text: string, maxLen: number): string[] {
    const sentenceEnders = /([。！？.!?\n])/;
    const parts = text.split(sentenceEnders);
    const chunks: string[] = [];
    let current = "";

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (current.length + part.length <= maxLen) {
            current += part;
        } else {
            if (current) chunks.push(current.trim());
            // If single part > maxLen, hard split
            if (part.length > maxLen) {
                chunks.push(...hardSplit(part, maxLen));
                current = "";
            } else {
                current = part;
            }
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

/** Hard split at exactly maxLen characters. */
function hardSplit(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) {
        chunks.push(text.slice(i, i + maxLen));
    }
    return chunks;
}
