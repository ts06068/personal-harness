#!/usr/bin/env node
// Explicit, opt-in account test. Uses synthetic files, existing subscription
// authentication and an isolated task store. No account settings are changed.
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const providers = process.argv.slice(2).map(p => p === "gpt" ? "chatgpt" : p);
if (!providers.length || providers.some(p => !['chatgpt', 'claude', 'gemini'].includes(p))) throw new Error('Usage: node scripts/verify-live.mjs chatgpt|claude|gemini [...]');
const root = mkdtempSync(join(tmpdir(), 'ph-live-'));
const project = join(root, 'project'); mkdirSync(project);
const state = join(root, 'state');
const id = createHash('sha256').update(project).digest('hex').slice(0, 16);
const taskFile = join(state, 'projects', id, 'task.json');
const report = { root, at: new Date().toISOString(), results: [] };
const log = join(root, 'rpc.jsonl');
const child = spawn(process.execPath, [join(repo, 'dist/cli.js'), 'agent', project, '--rpc'], { cwd: repo, env: { ...process.env, PH_STATE_DIR: state }, stdio: 'pipe' });
child.stderr.on('data', data => appendFileSync(join(root, 'stderr.log'), data));
let seq = 0;
let selectedProvider;
let cancelOnDelta = false;
let turnEnd;
const pending = new Map();
const confirmations = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const reader = createInterface({ input: child.stdout });
function send(value) { child.stdin.write(JSON.stringify(value) + '\n'); }
function request(type, extra = {}) {
  const id = String(++seq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${type}`)); }, 120000);
    pending.set(id, { resolve: data => { clearTimeout(timer); resolve(data); }, reject: error => { clearTimeout(timer); reject(error); } });
    send({ id, type, ...extra });
  });
}
reader.on('line', line => {
  let event; try { event = JSON.parse(line); } catch { return; }
  appendFileSync(log, line + '\n', { mode: 0o600 });
  if (event.type === 'response' && pending.has(event.id)) {
    const handler = pending.get(event.id); pending.delete(event.id); event.success ? handler.resolve(event.data) : handler.reject(new Error(event.error));
  }
  if (event.type === 'extension_ui_request') {
    if (event.method === 'select') {
      let value;
      if (event.title.includes('Select model')) {
        value = selectedProvider === 'chatgpt' ? event.options.find(x => x === 'gpt-6-sol') : event.options.find(x => /sonnet-4-6/.test(x));
        value ||= event.options[0];
      } else if (event.title.startsWith('Checkpoint proposal')) value = 'Approve';
      send(value ? { type: 'extension_ui_response', id: event.id, value } : { type: 'extension_ui_response', id: event.id, cancelled: true });
    } else if (event.method === 'confirm') {
      // Scope is this disposable fixture. Approve only the one requested test
      // command; native read/edit requests must name a known fixture file.
      let command = event.message;
      try { command = JSON.parse(event.message).command || command; } catch {}
      const title = String(event.title || '');
      const shell = title.includes('command') || title.includes('Run command');
      const allowedCommands = ['python3 verify.py', `cd ${project} && python3 verify.py`, `cd '${project}' && python3 verify.py`];
      // Claude may add a harmless grep filter despite the exact-command prompt.
      // Permit this one fixed filter; all other commands remain rejected.
      const filter = " 2>&1 | grep -E 'SYNTHETIC_MARKER|VALIDATION_OK|Error|Traceback'";
      const accepted = shell ? [...allowedCommands, ...allowedCommands.map(c => c + filter)].includes(command.trim()) :
        title.trim() === 'python3 verify.py' || /calc\.py|verify\.py/.test(title + event.message) && !/\.\.|\/etc\/|\.ssh|\.env|curl|wget/.test(title + event.message);
      confirmations.push({ title, accepted });
      send({ type: 'extension_ui_response', id: event.id, confirmed: accepted });
    }
  }
  if (cancelOnDelta && event.type === 'message_update') { cancelOnDelta = false; void request('abort').catch(() => {}); }
  if (event.type === 'agent_end') { const end = turnEnd; turnEnd = undefined; end?.(); }
});
async function turn(message, cancel = false) {
  const end = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { turnEnd = undefined; reject(new Error('Model turn exceeded 180 seconds')); }, 180000);
    turnEnd = () => { clearTimeout(timer); resolve(); };
  });
  cancelOnDelta = cancel;
  await request('prompt', { message }); await end;
  for (let i = 0; i < 40; i++) { if (!(await request('get_state')).isStreaming) break; await delay(100); }
  await delay(100);
  const messages = await request('get_messages');
  return messages.messages.filter(m => m.role === 'assistant').at(-1);
}
try {
  await request('get_commands');
  for (const provider of providers) {
    selectedProvider = provider;
    const result = { provider, work: false, review: false, cancel: false, checkpoint: false };
    report.results.push(result);
    writeFileSync(join(project, 'calc.py'), 'def add(a, b):\n    return a - b\n');
    writeFileSync(join(project, 'verify.py'), "from calc import add\nassert add(2, 3) == 5\nfor i in range(1800):\n    print('WARNING: SYNTHETIC_MARKER_42' if i == 900 else f'trace {i}: ' + 'x' * 32)\nprint('VALIDATION_OK=5')\n");
    try {
      await request('prompt', { message: `/task new Synthetic verification for ${provider}` });
      await request('prompt', { message: `/switch ${provider}` });
      result.model = (await request('get_state')).model?.id;
      console.log(`${provider}: work (${result.model})`);
      const originalTest = readFileSync(join(project, 'verify.py'), 'utf8');
      const answer = await turn('Only in this synthetic project: read calc.py and verify.py, fix add(a,b) in calc.py without changing verify.py, and run exactly python3 verify.py. Do not run any other shell commands or access external files/network. Report the observed result and the warning marker from the output. Then use propose_checkpoint with a decision about this fixture, observed validation, and a next step for read-only review. Keep your response short.');
      result.stopReason = answer?.stopReason;
      if (answer?.stopReason === 'error') { result.error = String(answer.errorMessage).slice(0, 350); continue; }
      const output = execFileSync('python3', ['verify.py'], { cwd: project, encoding: 'utf8' });
      if (readFileSync(join(project, 'verify.py'), 'utf8') !== originalTest) throw new Error('Worker changed the validation fixture.');
      const task = JSON.parse(readFileSync(taskFile, 'utf8'));
      result.work = output.includes('VALIDATION_OK=5') && task.operations.some(op => /bash|terminal|shell/i.test(op.tool) && op.status === 'completed');
      result.warningRetained = task.operations.some(op => /bash|terminal|shell/i.test(op.tool) && op.warnings?.some(w => w.includes('SYNTHETIC_MARKER_42')));
      await request('prompt', { message: '/checkpoint' });
      result.checkpoint = JSON.parse(readFileSync(taskFile, 'utf8')).decisions.length > 0;
      console.log(`${provider}: cancel`);
      const cancelled = await turn('Without using tools, write a detailed 1500-word explanation of addition and subtraction. This is a cancellation test.', true);
      result.cancel = cancelled?.stopReason === 'aborted' || cancelled?.stopReason === 'error' && /operation was aborted/i.test(cancelled.errorMessage || '');
      console.log(`${provider}: review`);
      await request('prompt', { message: `/review ${provider}` });
      const before = readFileSync(join(project, 'calc.py'), 'utf8');
      const reviewed = await turn('Read-only review: inspect calc.py and use read_task_artifact on the saved execution result referenced by the handoff to confirm the warning marker and validation. Do not edit files or run commands. Return a brief finding, without proposing another checkpoint.');
      result.review = reviewed?.stopReason === 'stop' && before === readFileSync(join(project, 'calc.py'), 'utf8');
      result.reviewStop = reviewed?.stopReason;
      const final = JSON.parse(readFileSync(taskFile, 'utf8'));
      result.observedModel = final.observedModel || result.model;
      result.artifactRead = final.operations.some(op => /read_task_artifact/.test(op.tool));
    } catch (error) { result.error = String(error); await request('abort').catch(() => {}); }
    finally { writeFileSync(join(root, 'report.json'), JSON.stringify({ ...report, confirmations }, null, 2), { mode: 0o600 }); }
    console.log(JSON.stringify(result));
  }
} finally {
  writeFileSync(join(root, 'report.json'), JSON.stringify({ ...report, confirmations }, null, 2), { mode: 0o600 });
  child.kill('SIGTERM'); reader.close();
  if (report.results.length !== providers.length || report.results.some(r => !r.work || !r.review || !r.cancel || !r.checkpoint || !r.artifactRead || !r.warningRetained)) process.exitCode = 1;
  console.log(`Private verification report: ${join(root, 'report.json')}`);
}
