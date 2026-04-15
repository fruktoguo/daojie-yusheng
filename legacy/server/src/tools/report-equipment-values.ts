/**
 * CLI 工具：输出装备价值报表
 */
import { buildEquipmentRows, renderMarkdownTable } from './value-report-lib';

process.stdout.write(`${renderMarkdownTable('装备价值报表', buildEquipmentRows())}\n`);
