/**
 * 在目标文件同目录写入临时文件并原子替换，避免监听进程读到半截 JSON。
 */

const fs = require('fs');
const path = require('path');

const ATOMIC_TEMP_MARKER = '.atomic-write-';

function isAtomicWriteTempFile(filePath) {
  return path.basename(String(filePath || '')).includes(ATOMIC_TEMP_MARKER);
}

function writeTextFileAtomically(filePath, content) {
  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const tempPath = path.join(
    directory,
    `.${baseName}${ATOMIC_TEMP_MARKER}${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const mode = fs.existsSync(filePath) ? (fs.statSync(filePath).mode & 0o777) : 0o644;
  let descriptor = null;
  try {
    descriptor = fs.openSync(tempPath, 'wx', mode);
    fs.writeFileSync(descriptor, content, 'utf-8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(tempPath, filePath);

    // rename 已保证文件内容原子可见；目录 fsync 用于提升异常掉电后的目录项持久性。
    let directoryDescriptor = null;
    try {
      directoryDescriptor = fs.openSync(directory, 'r');
      fs.fsyncSync(directoryDescriptor);
    } catch {
      // 少数平台不允许打开目录句柄；文件 rename 已经原子完成，不能在成功后误报失败。
    } finally {
      if (directoryDescriptor !== null) fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}

module.exports = {
  isAtomicWriteTempFile,
  writeTextFileAtomically,
};
