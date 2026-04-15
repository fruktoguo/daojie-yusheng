/**
 * CLI 工具：输出 Buff 价值报表
 */
import { buildBuffRows, renderMarkdownTable } from './value-report-lib';

process.stdout.write(`${renderMarkdownTable('Buff价值报表', buildBuffRows())}\n`);
