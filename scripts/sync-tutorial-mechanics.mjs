/**
 * 用途：从教程文档同步 shared 教程机制生成文件。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * 记录仓库根目录。
 */
const repoRoot = path.resolve(__dirname, '..');
/**
 * 记录来源路径。
 */
const sourcePath = path.join(repoRoot, 'docs', 'tutorial-mechanics.md');
function resolveWorkspacePackageDir(name) {
  if (name === 'config-editor' || name === 'client' || name === 'server' || name === 'shared') {
    return path.join(repoRoot, 'packages', name);
  }
  return path.join(repoRoot, 'legacy', name);
}
/**
 * 汇总targets。
 */
const targets = [
  path.join(resolveWorkspacePackageDir('shared'), 'src', 'tutorial-mechanics.generated.ts'),
];

/**
 * 读取lines。
 */
function readLines(content) {
  return content.replace(/\r\n/g, '\n').split('\n');
}

/**
 * 刷新段落。
 */
function flushParagraph(buffer, target) {
/**
 * 记录text。
 */
  const text = buffer
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();
  buffer.length = 0;
  if (text.length > 0) {
    target.push(text);
  }
}

/**
 * 解析topics。
 */
function parseTopics(markdown) {
/**
 * 汇总输出行。
 */
  const lines = readLines(markdown);
/**
 * 记录topics。
 */
  const topics = [];
/**
 * 记录当前值专题。
 */
  let currentTopic = null;
/**
 * 记录当前值分节。
 */
  let currentSection = null;
/**
 * 记录汇总paragraphs。
 */
  let summaryParagraphs = [];
/**
 * 记录段落缓冲区。
 */
  let paragraphBuffer = [];

/**
 * 记录push段落。
 */
  const pushParagraph = () => {
    if (!currentTopic) {
      paragraphBuffer.length = 0;
      return;
    }
    flushParagraph(paragraphBuffer, summaryParagraphs);
  };

/**
 * 记录finalize分节。
 */
  const finalizeSection = () => {
    if (!currentTopic || !currentSection) {
      return;
    }
    if (currentSection.title === '小提醒') {
      currentTopic.tips = currentSection.items;
    } else {
      currentTopic.sections.push(currentSection);
    }
    currentSection = null;
  };

/**
 * 记录finalize专题。
 */
  const finalizeTopic = () => {
    if (!currentTopic) {
      return;
    }
    pushParagraph();
    finalizeSection();
    currentTopic.summary = summaryParagraphs.join(' ').trim();
    if (!currentTopic.id || !currentTopic.label || !currentTopic.summary) {
      throw new Error(`机制专题缺少必要字段: ${JSON.stringify({ id: currentTopic.id, label: currentTopic.label, summary: currentTopic.summary })}`);
    }
    if (!Array.isArray(currentTopic.sections) || currentTopic.sections.length === 0) {
      throw new Error(`机制专题缺少分节: ${currentTopic.id}`);
    }
    topics.push(currentTopic);
    currentTopic = null;
    currentSection = null;
    summaryParagraphs = [];
    paragraphBuffer = [];
  };

  for (const rawLine of lines) {
/**
 * 记录line。
 */
    const line = rawLine.trimEnd();
/**
 * 记录专题match。
 */
    const topicMatch = line.match(/^##\s+([a-z0-9-]+)\s*\|\s*(.+)$/i);
    if (topicMatch) {
      finalizeTopic();
      currentTopic = {
        id: topicMatch[1].trim(),
        label: topicMatch[2].trim(),
        summary: '',
        sections: [],
      };
      continue;
    }

    if (!currentTopic) {
      continue;
    }

/**
 * 记录分节match。
 */
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      pushParagraph();
      finalizeSection();
      currentSection = {
        title: sectionMatch[1].trim(),
        items: [],
      };
      continue;
    }

/**
 * 记录列表物品match。
 */
    const listItemMatch = line.match(/^- (.+)$/);
    if (listItemMatch) {
      if (!currentSection) {
        throw new Error(`检测到未归属分节的列表项: ${line}`);
      }
      currentSection.items.push(listItemMatch[1].trim());
      continue;
    }

    if (line.trim().length === 0) {
      pushParagraph();
      continue;
    }

    if (currentSection) {
      throw new Error(`检测到未归属列表的分节正文，请改为 "- " 列表: ${line}`);
    }

    paragraphBuffer.push(line);
  }

  finalizeTopic();

  if (topics.length === 0) {
    throw new Error('未从 markdown 中解析到任何机制专题');
  }

  return topics;
}

/**
 * 处理render生成结果文件。
 */
function renderGeneratedFile(topics) {
  return `/**
 * 由 scripts/sync-tutorial-mechanics.mjs 从 docs/tutorial-mechanics.md 自动生成。
 * 不要手改此文件。
 */

export interface SharedTutorialTopicSection {
  title: string;
  items: string[];
}

export interface SharedTutorialTopic {
  id: string;
  label: string;
  summary: string;
  sections: SharedTutorialTopicSection[];
  tips?: string[];
}

export const TUTORIAL_MECHANIC_TOPICS: SharedTutorialTopic[] = ${JSON.stringify(topics, null, 2)};\n`;
}

/**
 * 记录markdown。
 */
const markdown = await fs.readFile(sourcePath, 'utf8');
/**
 * 记录topics。
 */
const topics = parseTopics(markdown);
/**
 * 记录输出。
 */
const output = renderGeneratedFile(topics);

/**
 * 记录written数量。
 */
let writtenCount = 0;
for (const targetPath of targets) {
  try {
    await fs.access(path.dirname(targetPath));
  } catch {
    continue;
  }
  await fs.writeFile(targetPath, output, 'utf8');
  writtenCount += 1;
}

if (writtenCount === 0) {
  throw new Error('未找到可写入的教程机制 shared 产物目录');
}

console.log(`已同步教程机制文档到 ${writtenCount} 个 shared 产物。`);
