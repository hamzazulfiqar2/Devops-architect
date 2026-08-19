#!/usr/bin/env node
'use strict';

/**
 * claude-devops-architect
 *
 * Installs the DevOps / AWS Architect agent configuration into a project.
 * Zero dependencies, CommonJS, Node >= 18.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PKG_ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(PKG_ROOT, 'package.json'));

// ── tiny output helpers ────────────────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const red = (s) => c('31', s);
const cyan = (s) => c('36', s);

const ok = (s) => console.log(`  ${green('✓')} ${s}`);
const skip = (s) => console.log(`  ${dim('·')} ${dim(s)}`);
const warn = (s) => console.log(`  ${yellow('!')} ${s}`);
const fail = (s) => console.log(`  ${red('✗')} ${s}`);

// What gets installed. Order matters only for readability.
const PAYLOAD_DIRS = [
  '.claude/agents',
  '.claude/skills',
  '.claude/workflows',
  '.claude/templates',
  '.claude/references',
  '.claude/rules',
  '.claude/mcp',
  '.claude/hooks',
];

const PAYLOAD_FILES = ['.claude/settings.json'];

// Only the scaffolding — not the ADRs describing this agent's own build.
const DECISION_FILES = ['decisions/README.md', 'decisions/0000-template.md'];

// ── fs helpers ─────────────────────────────────────────────────────────────
function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

function copyFile(src, dest, { force, dryRun }, stats) {
  const exists = fs.existsSync(dest);
  if (exists && !force) {
    stats.skipped.push(dest);
    return 'skipped';
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  stats[exists ? 'overwritten' : 'created'].push(dest);
  return exists ? 'overwritten' : 'created';
}

// ── commands ───────────────────────────────────────────────────────────────
function init(argv) {
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  const targetArg = argv.find((a) => !a.startsWith('-') && a !== 'init');
  const target = path.resolve(process.cwd(), targetArg || '.');

  console.log('');
  console.log(bold(`  claude-devops-architect v${pkg.version}`));
  console.log(dim(`  installing into ${target}`));
  if (dryRun) console.log(yellow('  DRY RUN — nothing will be written'));
  console.log('');

  if (!fs.existsSync(target)) {
    fail(`target directory does not exist: ${target}`);
    process.exit(1);
  }

  const stats = { created: [], overwritten: [], skipped: [], notes: [] };

  // 1. .claude/ payload
  for (const rel of PAYLOAD_DIRS) {
    const srcDir = path.join(PKG_ROOT, rel);
    if (!fs.existsSync(srcDir)) continue;
    for (const file of walk(srcDir)) {
      copyFile(path.join(srcDir, file), path.join(target, rel, file), { force, dryRun }, stats);
    }
  }
  for (const rel of PAYLOAD_FILES) {
    const src = path.join(PKG_ROOT, rel);
    if (fs.existsSync(src)) copyFile(src, path.join(target, rel), { force, dryRun }, stats);
  }

  // 2. CLAUDE.md — never clobber silently. It is the user's own instructions file.
  const claudeSrc = path.join(PKG_ROOT, 'CLAUDE.md');
  const claudeDest = path.join(target, 'CLAUDE.md');
  if (fs.existsSync(claudeDest) && !force) {
    const alt = path.join(target, 'CLAUDE.devops-architect.md');
    const result = copyFile(claudeSrc, alt, { force, dryRun }, stats);
    if (result !== 'skipped') {
      stats.notes.push(
        `You already have a CLAUDE.md. Wrote ${bold('CLAUDE.devops-architect.md')} instead — ` +
          `merge the parts you want, or delete it.`
      );
    }
  } else {
    copyFile(claudeSrc, claudeDest, { force, dryRun }, stats);
  }

  // 3. decisions/ scaffolding only
  for (const rel of DECISION_FILES) {
    const src = path.join(PKG_ROOT, rel);
    if (fs.existsSync(src)) copyFile(src, path.join(target, rel), { force, dryRun }, stats);
  }

  // ── report ───────────────────────────────────────────────────────────────
  console.log(`  ${green(stats.created.length)} created   ${yellow(stats.overwritten.length)} overwritten   ${dim(stats.skipped.length + ' skipped')}`);
  if (stats.skipped.length && !force) {
    console.log(dim(`  (skipped files already existed — re-run with --force to overwrite)`));
  }
  console.log('');

  for (const n of stats.notes) warn(n);
  if (stats.notes.length) console.log('');

  // ── post-install checks that actually matter ─────────────────────────────
  console.log(bold('  Checks'));
  const py = findPython();
  if (py) ok(`python found (${py}) — safety hooks will run`);
  else {
    warn('python NOT found — the safety hooks cannot run.');
    console.log(
      dim('      Hooks fail open, so nothing breaks, but destructive-command\n' +
          '      blocking will be inactive until python is on PATH.')
    );
  }

  const gitignore = path.join(target, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    warn('no .gitignore in this project — add one before configuring MCP or Terraform.');
  } else {
    const body = fs.readFileSync(gitignore, 'utf8');
    const missing = ['.env', '*.tfstate', '.claude/settings.local.json'].filter(
      (p) => !body.includes(p)
    );
    if (missing.length) warn(`.gitignore may not cover: ${missing.join(', ')}`);
    else ok('.gitignore covers secrets and Terraform state');
  }

  console.log('');
  console.log(bold('  Next'));
  console.log(`    1. Open the project in ${cyan('Claude Code')}`);
  console.log(`    2. Ask it: ${cyan('"analyze this project"')}`);
  console.log(`    3. Verify the guardrails:  ${cyan('npx claude-devops-architect doctor')}`);
  console.log('');
  console.log(dim('    Read CLAUDE.md to see how routing works, and .claude/rules/ for the'));
  console.log(dim('    constraints the agent will hold you to.'));
  console.log('');
}

function findPython() {
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return (r.stdout || r.stderr || '').trim();
  }
  return null;
}

function doctor(argv) {
  const selfCheck = argv.includes('--self');
  const root = selfCheck ? PKG_ROOT : process.cwd();

  console.log('');
  console.log(bold(`  claude-devops-architect doctor`));
  console.log(dim(`  checking ${root}`));
  console.log('');

  let problems = 0;
  const need = (label, cond, detail) => {
    if (cond) ok(label);
    else {
      fail(`${label}${detail ? ' — ' + detail : ''}`);
      problems++;
    }
  };

  // structure
  need('CLAUDE.md present', fs.existsSync(path.join(root, 'CLAUDE.md')));
  for (const d of PAYLOAD_DIRS) {
    const p = path.join(root, d);
    const n = fs.existsSync(p) ? walk(p).length : 0;
    need(`${d} (${n} files)`, n > 0, 'missing or empty');
  }

  // settings.json validity
  const settingsPath = path.join(root, '.claude/settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const allows = (s.permissions && s.permissions.allow) || [];
      const hooks = s.hooks || {};
      ok(`settings.json valid — ${allows.length} allow rules`);
      need(
        'safety hooks wired',
        Boolean(hooks.PreToolUse && hooks.PostToolUse),
        'PreToolUse/PostToolUse hooks not configured'
      );
      const mutating = allows.filter((r) =>
        /apply|destroy|delete|prune|push |rm -rf/i.test(r)
      );
      need('no mutating command allowlisted', mutating.length === 0, mutating.join(', '));
    } catch (e) {
      fail(`settings.json is not valid JSON — ${e.message}`);
      problems++;
    }
  } else {
    fail('.claude/settings.json missing');
    problems++;
  }

  // python + hook suite
  const py = findPython();
  if (!py) {
    fail('python not found — safety hooks inactive (they fail open)');
    problems++;
  } else {
    ok(`python present (${py})`);
    const suite = path.join(root, '.claude/hooks/test_hooks.py');
    if (fs.existsSync(suite)) {
      const cmd = spawnSync('python', [suite], { encoding: 'utf8' });
      const out = (cmd.stdout || '').trim().split('\n').pop() || '';
      if (cmd.status === 0) ok(`hook regression suite: ${out}`);
      else {
        fail(`hook regression suite FAILED: ${out}`);
        problems++;
      }
    } else {
      warn('hook test suite not found (skipping)');
    }
  }

  console.log('');
  if (problems === 0) {
    console.log(`  ${green('All checks passed.')} The agent is installed and its guardrails are live.`);
  } else {
    console.log(`  ${red(problems + ' problem(s) found.')} See above.`);
  }
  console.log('');
  process.exit(problems === 0 ? 0 : 1);
}

function help() {
  console.log(`
  ${bold('claude-devops-architect')} ${dim('v' + pkg.version)}

  A senior DevOps / AWS architect and mentor for Claude Code.

  ${bold('Usage')}
    npx claude-devops-architect init [dir]     install into a project (default: .)
    npx claude-devops-architect doctor         verify the install and guardrails
    npx claude-devops-architect --version
    npx claude-devops-architect --help

  ${bold('init options')}
    --force      overwrite files that already exist
    --dry-run    show what would happen, write nothing

  ${bold('What it installs')}
    CLAUDE.md            orchestration — routes requests to the right layer
    .claude/agents       4 tool-restricted specialists (AWS, K8s, Terraform, security)
    .claude/skills       11 capability skills
    .claude/workflows    6 processes with approval gates
    .claude/references   31 factual reference files
    .claude/rules        security, production safety, architecture principles
    .claude/templates    architecture, deployment plan, CI/CD, readiness checklist
    .claude/mcp          MCP integration policy (no server enabled by default)
    .claude/hooks        safety hooks — block destructive commands before they run
    .claude/settings.json  155 read-only allowlist rules, zero mutating commands

  ${bold('Safety')}
    Destructive commands (terraform destroy, kubectl delete, docker system
    prune, aws delete-*, rm -rf on root) are BLOCKED by a PreToolUse hook.
    Applies, IAM changes and security-group changes are forced to prompt.
    Writes containing secret-shaped literals are blocked.

  ${dim('https://github.com/hamzazulfiqar2/Devops-architect')}
`);
}

// ── entry ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') help();
else if (cmd === '--version' || cmd === '-v') console.log(pkg.version);
else if (cmd === 'init') init(argv);
else if (cmd === 'doctor') doctor(argv);
else {
  console.error(`\n  ${red('Unknown command:')} ${cmd}\n  Run --help for usage.\n`);
  process.exit(1);
}
