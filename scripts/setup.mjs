// One-time development setup on Windows, macOS or Linux:
//   npm run setup
// Installs the web app, creates the Python virtual environment for the
// hardware service, creates both .env files, the database and the first
// teacher account (teacher / wishpix123, change it in Settings).
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');
const hw = path.join(root, 'services', 'hardware');
const win = process.platform === 'win32';
const run = (cmd, cwd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

function envFile(dir, edits) {
  const file = path.join(dir, '.env');
  if (fs.existsSync(file)) return console.log(`Keeping ${path.relative(root, file)}`);
  let text = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
  for (const [key, value] of Object.entries(edits)) text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  fs.writeFileSync(file, text);
  console.log(`Created ${path.relative(root, file)}`);
}

const token = crypto.randomBytes(24).toString('hex');
envFile(web, { JWT_SECRET: crypto.randomBytes(32).toString('hex'), HARDWARE_TOKEN: token, ADMIN_PASSWORD: 'wishpix123' });
envFile(hw, { PRINTER_MODE: 'mock', HARDWARE_TOKEN: token });

run('npm install', web);
run('npx prisma migrate deploy', web);
run('npm run db:seed', web);

const py = win ? 'python' : 'python3';
const venvPython = path.join(hw, '.venv', win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');
if (!fs.existsSync(venvPython)) run(`${py} -m venv .venv`, hw);
run(`"${venvPython}" -m pip install -r requirements-dev.txt`, hw);

console.log('\nDone. Start everything with:  npm run dev');
console.log('Kiosk: http://localhost:3000/kiosk   Teacher App: http://localhost:3000/teacher (teacher / wishpix123)');
