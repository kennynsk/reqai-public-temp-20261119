import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function ensureSymlink(linkPath, targetPath) {
  try {
    const st = fs.lstatSync(linkPath);
    // если это симлинк — проверим куда указывает; если битый/не туда — пересоздадим
    if (st.isSymbolicLink()) {
      const actual = fs.readlinkSync(linkPath);
      const resolved = path.resolve(path.dirname(linkPath), actual);
      if (resolved === targetPath) return;
      rmrf(linkPath);
    } else {
      // если это реальная папка/файл — не трогаем (чтобы не ломать локальную установку)
      return;
    }
  } catch {
    // не существует — ок
  }

  if (!fs.existsSync(targetPath)) {
    console.warn(`[fix:links] target not found: ${targetPath}`);
    return;
  }

  fs.symlinkSync(path.relative(path.dirname(linkPath), targetPath), linkPath, 'dir');
  console.log(`[fix:links] linked ${linkPath} -> ${targetPath}`);
}

const clientNodeModules = path.join(root, 'client', 'node_modules');
ensureDir(clientNodeModules);

// Vite иногда пытается читать react из client/node_modules напрямую (в процессе optimizeDeps),
// поэтому гарантируем наличие симлинка на hoisted зависимости.
ensureSymlink(path.join(clientNodeModules, 'react'), path.join(root, 'node_modules', 'react'));
ensureSymlink(path.join(clientNodeModules, 'react-dom'), path.join(root, 'node_modules', 'react-dom'));

// Сбрасываем optimizeDeps кеш, если он битый.
rmrf(path.join(clientNodeModules, '.vite'));

