export declare const FRAMES: number
export declare const MAX_SCORE: number
export declare function splitFrames(rolls: readonly number[], frames?: number): number[][] | null
export declare function isComplete(rolls: readonly number[], frames?: number): boolean
export declare function frameScores(rolls: readonly number[], frames?: number): (number | null)[] | null
export declare function scoreGame(rolls: readonly number[], frames?: number): number | null
export type NextBall = { done: boolean; frame: number; ball: number; fresh: boolean; standing: number }
export declare function rollKind(next: NextBall, down: number): 'strike' | 'spare' | 'open'
export declare function nextBall(rolls: readonly number[], frames?: number): NextBall | null
export declare function maxPossible(rolls: readonly number[], frames?: number): number
export declare function frameMarks(rolls: readonly number[], frames?: number): string[][]
