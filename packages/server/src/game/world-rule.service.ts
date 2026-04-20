import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  buildDefaultCombatTargetingRules,
  CombatTargetingRules,
  hasCombatTargetingRule,
  normalizeCombatTargetingRules,
  PlayerState,
} from '@mud/shared';
import { PersistentDocumentService } from '../database/persistent-document.service';

const SERVER_CONFIG_SCOPE = 'server_config';
const WORLD_RULE_DOCUMENT_KEY = 'world_rules';

interface WorldRuleDocument {
  version: 1;
  peaceModeEnabled?: boolean;
}

const DEFAULT_WORLD_RULE_DOCUMENT: WorldRuleDocument = {
  version: 1,
  peaceModeEnabled: false,
};

@Injectable()
/** WorldRuleService：封装 GM 世界级规则开关与持久化。 */
export class WorldRuleService implements OnModuleInit {
  private readonly logger = new Logger(WorldRuleService.name);
  private peaceModeEnabled = false;

  constructor(
    private readonly persistentDocumentService: PersistentDocumentService,
  ) {}

  async onModuleInit(): Promise<void> {
    const document = await this.readPersistedDocument();
    this.peaceModeEnabled = document.peaceModeEnabled === true;
    this.logger.log(`世界规则已加载: peaceModeEnabled=${this.peaceModeEnabled}`);
  }

  isPeaceModeEnabled(): boolean {
    return this.peaceModeEnabled;
  }

  async setPeaceModeEnabled(enabled: boolean): Promise<boolean> {
    const normalized = enabled === true;
    if (this.peaceModeEnabled === normalized) {
      return false;
    }
    this.peaceModeEnabled = normalized;
    await this.persistentDocumentService.save(
      SERVER_CONFIG_SCOPE,
      WORLD_RULE_DOCUMENT_KEY,
      {
        ...DEFAULT_WORLD_RULE_DOCUMENT,
        peaceModeEnabled: normalized,
      } satisfies WorldRuleDocument,
    );
    this.logger.log(`世界规则已更新: peaceModeEnabled=${this.peaceModeEnabled}`);
    return true;
  }

  buildEffectiveCombatTargetingRules(
    rules: PlayerState['combatTargetingRules'],
    allowAoePlayerHit: boolean,
  ): CombatTargetingRules {
    const normalized = normalizeCombatTargetingRules(
      rules,
      buildDefaultCombatTargetingRules({ includeAllPlayersHostile: allowAoePlayerHit }),
    );
    if (!this.peaceModeEnabled || !hasCombatTargetingRule(normalized, 'hostile', 'all_players')) {
      return normalized;
    }
    return {
      ...normalized,
      hostile: normalized.hostile.filter((entry) => entry !== 'all_players'),
    };
  }

  shouldForceDisableAllPlayerHostility(
    rules: PlayerState['combatTargetingRules'],
    allowAoePlayerHit: boolean,
  ): boolean {
    if (!this.peaceModeEnabled) {
      return false;
    }
    const normalized = normalizeCombatTargetingRules(
      rules,
      buildDefaultCombatTargetingRules({ includeAllPlayersHostile: allowAoePlayerHit }),
    );
    return allowAoePlayerHit || hasCombatTargetingRule(normalized, 'hostile', 'all_players');
  }

  private async readPersistedDocument(): Promise<WorldRuleDocument> {
    const document = await this.persistentDocumentService.get<Partial<WorldRuleDocument>>(
      SERVER_CONFIG_SCOPE,
      WORLD_RULE_DOCUMENT_KEY,
    );
    if (document) {
      return {
        ...DEFAULT_WORLD_RULE_DOCUMENT,
        peaceModeEnabled: document.peaceModeEnabled === true,
      };
    }
    await this.persistentDocumentService.save(
      SERVER_CONFIG_SCOPE,
      WORLD_RULE_DOCUMENT_KEY,
      DEFAULT_WORLD_RULE_DOCUMENT,
    );
    return DEFAULT_WORLD_RULE_DOCUMENT;
  }
}
