// Runs the web app and the hardware service together for development:
//   npm run dev
// Ctrl+C stops both.
import { execFileSync, execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const python = path.join(root, 'services', 'hardware', '.venv', win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');
const web = path.join(root, 'apps', 'web');

// The database driver (better-sqlite3) is built for one Node.js version. After
// switching Node.js versions (nvm), rebuild it for this one before starting.
try {
  execFileSync(process.execPath, ['-e', "new (require('better-sqlite3'))(':memory:').close()"], { cwd: web, stdio: 'pipe' });
} catch (err) {
  if (/NODE_MODULE_VERSION|different Node\.js version/.test(String(err.stderr))) {
    console.log(`The database driver was built for another Node.js version. Rebuilding it for Node.js ${process.version}…`);
    try {
      execSync('npm rebuild better-sqlite3', { cwd: web, stdio: 'inherit' });
    } catch {
      console.error('Could not rebuild it. Stop any other WishPix server (it keeps the driver open), then run');
      console.error('`npm rebuild better-sqlite3` in apps/web and try again.');
      process.exit(1);
    }
  }
  // Any other error (for example setup not run yet) shows up when the web app starts.
}

// Database changes that came with an update (apps/web/prisma/migrations) are
// applied before the server starts, so the database is never behind the code.
try {
  const out = execSync('npx prisma migrate deploy', { cwd: web, stdio: 'pipe', env: { ...process.env, CHECKPOINT_DISABLE: '1' } }).toString();
  const applied = [...out.matchAll(/└─ (\S+)\/\s*$/gm)].map((m) => m[1]); // the migration folders
  if (applied.length) console.log(`Database updated: ${applied.join(', ')}`);
} catch (err) {
  console.error('Could not update the database (prisma migrate deploy):');
  console.error(String(err.stderr || err.stdout || err.message).trim());
  console.error('If another WishPix server is running, stop it first. Then run `npx prisma migrate deploy` in apps/web.');
  process.exit(1);
}

// Python is started directly (no shell), so a folder name with spaces such
// as "CAPSTONE SIMULATOR" works. npm is a .cmd file on Windows, which Node
// only runs through the shell; its name has no spaces.
const procs = [
  { name: 'hardware', color: 35, cmd: python, args: ['-m', 'uvicorn', 'app.main:app', '--port', '8765', '--reload'], cwd: path.join(root, 'services', 'hardware'), shell: false },
  { name: 'web', color: 36, cmd: 'npm', args: ['run', 'dev'], cwd: web, shell: win },
];

const children = procs.map(({ name, color, cmd, args, cwd, shell }) => {
  const child = spawn(cmd, args, { cwd, shell, env: process.env });
  child.on('error', (err) => console.error(`[${name}] could not start: ${err.message}. Run npm run setup first.`));
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(String(d).replace(/^(?=.)/gm, tag)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${tag}stopped (${code ?? 'signal'})`);
    stopAll();
  });
  return child;
});

function stopAll() {
  for (const c of children) if (c.exitCode === null) c.kill();
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
