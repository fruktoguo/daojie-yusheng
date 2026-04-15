/**
 * CLI 工具：将所有价值报表导出为独立 Markdown 文件到 docs/量化分析/
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  buildBuffRows,
  buildEquipmentRows,
  buildSkillRows,
  buildTechniqueRows,
  renderMarkdownTable,
} from './value-report-lib';

type ReportFileDef = {
  fileName: string;
  title: string;
  content: string;
};

/**
 * 获取docs目录。
 */
function getDocsDir(): string {
  return path.join(process.cwd(), '..', '..', 'docs');
}

/**
 * 写入报表文件列表。
 */
function writeReportFiles(): void {
/**
 * 记录输出目录。
 */
  const outputDir = path.join(getDocsDir(), '量化分析');
  fs.mkdirSync(outputDir, { recursive: true });

/**
 * 记录reports。
 */
  const reports: ReportFileDef[] = [
    {
      fileName: '装备价值报表.md',
      title: '装备价值报表',
      content: renderMarkdownTable('装备价值报表', buildEquipmentRows()),
    },
    {
      fileName: '功法价值报表.md',
      title: '功法价值报表',
      content: renderMarkdownTable('功法价值报表', buildTechniqueRows()),
    },
    {
      fileName: '技能价值报表.md',
      title: '技能价值报表',
      content: renderMarkdownTable('技能价值报表', buildSkillRows()),
    },
    {
      fileName: 'Buff价值报表.md',
      title: 'Buff价值报表',
      content: renderMarkdownTable('Buff价值报表', buildBuffRows()),
    },
  ];

  for (const report of reports) {
    fs.writeFileSync(path.join(outputDir, report.fileName), `${report.content}\n`, 'utf-8');
  }

/**
 * 记录索引。
 */
  const index = [
    '# 量化分析',
    '',
    '当前报表已拆分为四个独立文件：',
    '',
    ...reports.map((report) => `- [${report.title}](./${report.fileName})`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, 'README.md'), index, 'utf-8');

}

writeReportFiles();

