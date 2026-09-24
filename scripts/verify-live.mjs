#!/usr/bin/env node
// Explicit, opt-in account test. Uses synthetic files, existing subscription
// authentication and an isolated task store. No account settings are changed.
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const providers = process.argv.slice(2).map(p => p === "gpt" ? "chatgpt" : p);
if (!providers.length || providers.some(p => !['chatgpt', 'claude', 'gemini'].includes(p))) throw new Error('Usage: node scripts/verify-live.mjs chatgpt|claude|gemini [...]');
const reviewer = process.env.PH_LIVE_REVIEWER;
if (reviewer && !['chatgpt', 'claude', 'gemini'].includes(reviewer)) throw new Error('Invalid PH_LIVE_REVIEWER');
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
let allowedCommand;
let commandApprovals = 0;
let approveCheckpoint = false;
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
      } else if (event.title.startsWith('Checkpoint proposal')) {
        // Approve one fixture proposal only. Additional proposals may be stale
        // after it is accepted; reject them instead of changing runtime policy.
        value = approveCheckpoint ? 'Approve' : 'Reject';
        approveCheckpoint = false;
      }
      send(value ? { type: 'extension_ui_response', id: event.id, value } : { type: 'extension_ui_response', id: event.id, cancelled: true });
    } else if (event.method === 'confirm') {
      // Scope is this disposable fixture. Approve only the one requested test
      // command; native read/edit requests must name a known fixture file.
      let command = event.message;
      try { command = JSON.parse(event.message).command || command; } catch {}
      const title = String(event.title || '');
      const shell = title.includes('command') || title.includes('Run command');
      const allowedCommands = allowedCommand ? [allowedCommand, `cd ${project} && ${allowedCommand}`, `cd '${project}' && ${allowedCommand}`] : [];
      const accepted = shell ? commandApprovals === 0 && allowedCommands.includes(command.trim()) :
        title.trim() === 'python3 verify.py' || /calc\.py|verify\.py/.test(title + event.message) && !/\.\.|\/etc\/|\.ssh|\.env|curl|wget/.test(title + event.message);
      if (shell && accepted) commandApprovals++;
      confirmations.push({ title, command: shell ? command : undefined, accepted });
      send({ type: 'extension_ui_response', id: event.id, confirmed: accepted });
    }
  }
  if (cancelOnDelta && event.type === 'message_update') { cancelOnDelta = false; void request('abort').catch(() => {}); }
  if (event.type === 'agent_end') { const end = turnEnd; turnEnd = undefined; end?.(); }
});
async function turn(message, cancel = false, cancelFile) {
  const end = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { turnEnd = undefined; reject(new Error('Model turn exceeded 180 seconds')); }, 180000);
    turnEnd = () => { clearTimeout(timer); resolve(); };
  });
  cancelOnDelta = cancel;
  const watcher = cancelFile ? setInterval(() => { if (existsSync(cancelFile)) { clearInterval(watcher); void request('abort').catch(() => {}); } }, 25) : undefined;
  try { await request('prompt', { message }); await end; } finally { if (watcher) clearInterval(watcher); cancelOnDelta = false; }
  for (let i = 0; i < 40; i++) { if (!(await request('get_state')).isStreaming) break; await delay(100); }
  await delay(100);
  const messages = await request('get_messages');
  return messages.messages.filter(m => m.role === 'assistant').at(-1);
}
const task = () => JSON.parse(readFileSync(taskFile, 'utf8'));
const original = op => readFileSync(join(state, 'projects', id, 'artifacts', task().id, `${op.artifactId}.txt`), 'utf8');
function permit(command) { allowedCommand = command; commandApprovals = 0; }
function requireCheck(value, message) { if (!value) throw new Error(message); return true; }
async function selectWorker(provider, review = false) {
  const before = await request('get_state');
  selectedProvider = provider;
  await request('prompt', { message: `/${review ? 'review' : 'switch'} ${provider}` });
  const after = await request('get_state');
  requireCheck(after.model && after.sessionId !== before.sessionId, `Worker selection did not create a fresh ${provider} session`);
  return after;
}
try {
  await request('get_commands');
  for (const [providerIndex, provider] of providers.entries()) {
    selectedProvider = provider;
    const result = { provider, work: false, review: false, cancel: false, checkpoint: false };
    report.results.push(result);
    writeFileSync(join(project, 'calc.py'), 'def add(a, b):\n    return a - b\n');
    writeFileSync(join(project, 'verify.py'), "from calc import add\nassert add(2, 3) == 5\nfor i in range(1800):\n    print('WARNING: SYNTHETIC_MARKER_42' if i == 900 else f'trace {i}: ' + 'x' * 32)\nprint('VALIDATION_OK=5')\n");
    try {
      await request('prompt', { message: `/task new Synthetic verification for ${provider}` });
      result.model = (await selectWorker(provider)).model.id;
      console.log(`${provider}: work (${result.model})`);
      const originalTest = readFileSync(join(project, 'verify.py'), 'utf8');
      permit('python3 verify.py');
      const answer = await turn('Only in this synthetic project: read calc.py and verify.py, fix add(a,b) in calc.py without changing verify.py, and run exactly python3 verify.py. Do not run any other shell commands or access external files/network. Report the observed result and the warning marker from the output. Then use propose_checkpoint with a decision about this fixture, observed validation, and a next step for read-only review. Keep your response short.');
      result.stopReason = answer?.stopReason;
      if (answer?.stopReason === 'error') { result.error = String(answer.errorMessage).slice(0, 350); continue; }
      const output = execFileSync('python3', ['verify.py'], { cwd: project, encoding: 'utf8' });
      if (readFileSync(join(project, 'verify.py'), 'utf8') !== originalTest) throw new Error('Worker changed the validation fixture.');
      const workTask = task();
      result.work = output.includes('VALIDATION_OK=5') && workTask.operations.some(op => /bash|terminal|shell/i.test(op.tool) && op.status === 'completed');
      result.warningRetained = workTask.operations.some(op => /bash|terminal|shell/i.test(op.tool) && op.warnings?.some(w => w.includes('SYNTHETIC_MARKER_42')));
      approveCheckpoint = true;
      await request('prompt', { message: '/checkpoint' });
      approveCheckpoint = false;
      result.checkpoint = JSON.parse(readFileSync(taskFile, 'utf8')).decisions.length > 0;
      const successful = task().operations.findLast(op => op.tool === 'bash' && op.status === 'completed');
      requireCheck(successful && original(successful).includes('VALIDATION_OK=5'), 'Successful command artifact missing');
      const fixture = "import sys\nfor i in range(3000):\n print('WARNING: SYNTHETIC_FAILURE_71' if i == 1500 else 'trace:' + 'x'*45)\nprint('FAILURE_EXIT=7')\nsys.exit(7)\n";
      writeFileSync(join(project, 'fail.py'), fixture);
      writeFileSync(join(project, 'partial.py'), "from pathlib import Path\nimport time\nprint('WARNING: SYNTHETIC_PARTIAL_82', flush=True)\nPath('partial.txt').write_text('partially written')\ntime.sleep(30)\nPath('finished.txt').write_text('completed')\n");
      console.log(`${provider}: failed command`);
      const failureStart = task().operations.length; permit('python3 fail.py');
      await turn('Run exactly python3 fail.py once using the bash tool. This is an intentional failure fixture. Do not filter the output, retry, repair files, or propose a checkpoint. Briefly report the actual exit code and warning.');
      const failed = task().operations.slice(failureStart).find(op => op.tool === 'bash' && op.exitCode === 7);
      const expected = Array.from({ length: 3000 }, (_, i) => i === 1500 ? 'WARNING: SYNTHETIC_FAILURE_71' : 'trace:' + 'x'.repeat(45)).join('\n') + '\nFAILURE_EXIT=7\n';
      result.failedOutput = requireCheck(failed?.status === 'failed' && original(failed) === expected, 'Full failed command output differs from fixture');
      result.failedWarning = requireCheck(failed.warnings.some(w => w.includes('SYNTHETIC_FAILURE_71')), 'Failed command warning missing');
      const nextProvider = reviewer || providers[(providerIndex + 1) % providers.length];
      for (const cause of ['cancelled', 'timeout']) {
        console.log(`${provider}: command ${cause}`);
        rmSync(join(project, 'partial.txt'), { force: true }); rmSync(join(project, 'finished.txt'), { force: true });
        const start = task().operations.length; permit('python3 partial.py');
        await turn(cause === 'timeout'
          ? 'Execute exactly python3 partial.py once with the bash tool timeout parameter set to 1 second. Do not wrap it in another command, retry, edit files or propose a checkpoint.'
          : 'Execute exactly python3 partial.py once with the bash tool. The test driver will cancel it after its partial file appears. Do not retry, edit files or propose a checkpoint.', false, cause === 'cancelled' ? join(project, 'partial.txt') : undefined);
        const op = task().operations.slice(start).find(op => op.tool === 'bash' && op.terminationReason === cause);
        result[cause] = requireCheck(op?.status === 'unknown' && task().status === 'needs_reconciliation' && existsSync(join(project, 'partial.txt')) && !existsSync(join(project, 'finished.txt')), `Missing unknown partial-write outcome: ${cause}`);
        requireCheck(original(op).includes('SYNTHETIC_PARTIAL_82'), 'Partial command output missing');
        const beforeSwitch = await request('get_state');
        await request('prompt', { message: `/switch ${nextProvider}` });
        await request('prompt', { message: `/review ${nextProvider}` });
        requireCheck((await request('get_state')).sessionId === beforeSwitch.sessionId, 'Unknown operation allowed a fresh worker session');
        result[`${cause}SwitchBlocked`] = true;
        await request('prompt', { message: `/task reconcile ${op.id} failed Observed partially written file, no finished file, and terminated fixture command` });
        await selectWorker(provider);
      }
      permit(undefined);
      console.log(`${provider}: response-only cancel`);
      const cancelled = await turn('Without using tools, write a detailed 1500-word explanation of addition and subtraction. This is a cancellation test.', true);
      result.cancel = cancelled?.stopReason === 'aborted' || cancelled?.stopReason === 'error' && /operation was aborted/i.test(cancelled.errorMessage || '');
      requireCheck(task().operations.every(op => !['unknown', 'running'].includes(op.status)), 'Response-only cancellation created an unresolved operation');
      console.log(`${provider}: review by ${nextProvider}`);
      result.reviewer = nextProvider;
      await selectWorker(nextProvider, true);
      const before = readFileSync(join(project, 'calc.py'), 'utf8');
      const reviewStart = task().operations.length;
      const offset = Buffer.byteLength(expected.slice(0, expected.indexOf('WARNING:')));
      const successOffset = Math.max(0, Buffer.byteLength(original(successful)) - 256);
      const reviewed = await turn(`Read-only review. Use read_task_artifact to inspect the failed execution artifact ${failed.artifactId}, offset ${offset}, limit 1024, and the successful execution artifact ${successful.artifactId}, offset ${successOffset}, limit 256. Confirm the failed operation's exit code from saved state. Do not edit files, execute commands or propose a checkpoint. Respond in three short lines: warning: <observed failure warning>; exit_code: <observed failed exit code>; validation: <observed successful validation marker>.`);
      const text = reviewed?.content.filter(part => part.type === 'text').map(part => part.text).join('\n') || '';
      result.review = reviewed?.stopReason === 'stop' && before === readFileSync(join(project, 'calc.py'), 'utf8');
      result.reviewMeaning = requireCheck(text.includes('SYNTHETIC_FAILURE_71') && text.includes('VALIDATION_OK=5') && /exit[_ ]code\s*[:=]\s*7/i.test(text), 'Reviewer did not report the observed warning, exit code and validation');
      const reviewOps = task().operations.slice(reviewStart).filter(op => op.tool === 'read_task_artifact');
      result.artifactRead = requireCheck(reviewOps.some(op => original(op).includes('SYNTHETIC_FAILURE_71')) && reviewOps.some(op => original(op).includes('VALIDATION_OK=5')), 'Review session did not retrieve the required original result pages');
      result.observedModel = provider === 'gemini' ? workTask.observedModel : result.model;
      result.reviewModel = nextProvider === 'gemini' ? task().observedModel : (await request('get_state')).model?.id;

    } catch (error) { result.error = String(error); await request('abort').catch(() => {}); }
    finally { writeFileSync(join(root, 'report.json'), JSON.stringify({ ...report, confirmations }, null, 2), { mode: 0o600 }); }
    console.log(JSON.stringify(result));
  }
} finally {
  writeFileSync(join(root, 'report.json'), JSON.stringify({ ...report, confirmations }, null, 2), { mode: 0o600 });
  child.kill('SIGTERM'); reader.close();
  if (report.results.length !== providers.length || report.results.some(r => !r.work || !r.review || !r.cancel || !r.checkpoint || !r.artifactRead || !r.warningRetained || !r.failedOutput || !r.failedWarning || !r.cancelled || !r.timeout || !r.cancelledSwitchBlocked || !r.timeoutSwitchBlocked || !r.reviewMeaning)) process.exitCode = 1;
  console.log(`Private verification report: ${join(root, 'report.json')}`);
}
