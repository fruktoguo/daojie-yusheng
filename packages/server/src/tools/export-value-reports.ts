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

function getDocsDir(): string {
  return path.join(process.cwd(), '..', '..', 'docs');
}

function writeReportFiles(): void {
  const outputDir = path.join(getDocsDir(), '量化分析');
  fs.mkdirSync(outputDir, { recursive: true });

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
