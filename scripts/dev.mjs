// Runs the web app and the hardware service together for development:
//   npm run dev
// Ctrl+C stops both.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const python = path.join(root, 'services', 'hardware', '.venv', win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');

// Python is started directly (no shell), so a folder name with spaces such
// as "CAPSTONE SIMULATOR" works. npm is a .cmd file on Windows, which Node
// only runs through the shell; its name has no spaces.
const procs = [
  { name: 'hardware', color: 35, cmd: python, args: ['-m', 'uvicorn', 'app.main:app', '--port', '8765', '--reload'], cwd: path.join(root, 'services', 'hardware'), shell: false },
  { name: 'web', color: 36, cmd: 'npm', args: ['run', 'dev'], cwd: path.join(root, 'apps', 'web'), shell: win },
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
