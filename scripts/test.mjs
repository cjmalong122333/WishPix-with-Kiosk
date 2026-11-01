// Runs every check: web app tests, translations, hardware service tests.
//   npm test
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const python = path.join(root, 'services', 'hardware', '.venv', win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');
const run = (cmd, dir) => execSync(cmd, { cwd: path.join(root, dir), stdio: 'inherit' });

run('npm test', 'apps/web');
run('npm run i18n:check', 'apps/web');
run(`"${python}" -m pytest -q`, 'services/hardware');
