export declare const MIN_MS_PER_BALL: number
export declare const MIN_BALLS: number
export declare const MAX_BALLS: number
export declare const MAX_DURATION_MS: number
export type Validation = { ok: true; score: number; minDurationMs: number } | { ok: false; code: string }
export declare function validateSubmission(data: unknown): Validation
export declare function cleanDisplayName(value: unknown): string | null
