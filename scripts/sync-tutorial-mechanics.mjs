import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'docs', 'tutorial-mechanics.md');
const targets = [
  path.join(repoRoot, 'packages', 'shared', 'src', 'tutorial-mechanics.generated.ts'),
  path.join(repoRoot, 'packages', 'shared-next', 'src', 'tutorial-mechanics.generated.ts'),
];

function readLines(content) {
  return content.replace(/\r\n/g, '\n').split('\n');
}

function flushParagraph(buffer, target) {
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

function parseTopics(markdown) {
  const lines = readLines(markdown);
  const topics = [];
  let currentTopic = null;
  let currentSection = null;
  let summaryParagraphs = [];
  let paragraphBuffer = [];

  const pushParagraph = () => {
    if (!currentTopic) {
      paragraphBuffer.length = 0;
      return;
    }
    flushParagraph(paragraphBuffer, summaryParagraphs);
  };

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
    const line = rawLine.trimEnd();
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

const markdown = await fs.readFile(sourcePath, 'utf8');
const topics = parseTopics(markdown);
const output = renderGeneratedFile(topics);

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
