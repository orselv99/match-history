/**
 * 하위 호환성을 위한 Re-export 래퍼
 * 신규 코드는 src/ui/history/ 하위 모듈을 직접 참조하세요.
 */
export { MatchHistoryTable } from './history/MatchHistoryTable.ts';
export type { MatchHistoryTableCallbacks, MatchHistoryTableOptions } from './history/MatchHistoryTable.ts';
export { MatchHistoryTable as default } from './history/MatchHistoryTable.ts';
