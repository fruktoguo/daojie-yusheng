/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

export { GeneratedTechniqueStoreService } from './generated-technique-store.service';
export { TechniqueGenerationService } from './technique-generation.service';
export {
  rollTechniqueRealmLv,
  rollTechniqueGrade,
  resolveBaseGrade,
  rollAsymmetricOffset,
  TECHNIQUE_GRADE_REALM_BANDS,
} from './technique-generation-roll';
export {
  validateTechniqueCandidate,
  type ValidationResult,
  type ValidationError,
} from './technique-candidate-validator';
export {
  buildTechniquePrompt,
  buildRetryPrompt,
} from './technique-prompt-builder';
export {
  normalizeArtsSkills,
  calcArtsBudgetMax,
  calcArtsBudgetAtLayer,
} from './technique-budget-normalizer';
export * from './technique-generation-constants';
export * from './technique-generation.types';
