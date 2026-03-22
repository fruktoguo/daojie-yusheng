/**
 * CLI 工具：输出技能价值报表
 */
import { buildSkillRows, renderMarkdownTable } from './value-report-lib';

process.stdout.write(`${renderMarkdownTable('技能价值报表', buildSkillRows())}\n`);
