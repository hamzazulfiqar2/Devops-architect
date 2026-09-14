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
  '.claude/tools',
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

// ── global (compact, on-demand) install ────────────────────────────────────
// Installs at user level (~/.claude) so the agent is available in every project, but loads
// almost nothing until the user says "guide me". Full layers live in ~/.claude/devops-architect/
// and are opened on demand; a per-project brief (.claude/devops-context.md) replaces re-discovery.
const GLOBAL_LAYER_DIRS = ['skills', 'workflows', 'templates', 'references', 'rules', 'mcp', 'tools'];
const AGENT_SHORT_DESCRIPTIONS = {
  'aws-architect': 'AWS architecture design and service comparison. Design only.',
  'kubernetes-engineer': 'Kubernetes manifests, design, review, troubleshooting.',
  'security-reviewer': 'read-only DevOps/cloud security review with severity-rated findings.',
  'terraform-engineer': 'Terraform code, modules, state, plan review. Never applies.',
};

function copyTree(srcDir, destDir, dryRun, written) {
  for (const file of walk(srcDir)) {
    const dest = path.join(destDir, file);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(srcDir, file), dest);
    }
    written.push(dest);
  }
}

function findPythonCmd() {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return null;
}

function globalInstall(argv) {
  const dryRun = argv.includes('--dry-run');
  const homeIdx = argv.indexOf('--home');
  const home = homeIdx !== -1 && argv[homeIdx + 1] ? path.resolve(argv[homeIdx + 1]) : require('os').homedir();
  const claudeDir = path.join(home, '.claude');
  const daHome = path.join(claudeDir, 'devops-architect');
  const fwd = (p) => p.split(path.sep).join('/');

  console.log('');
  console.log(bold(`  claude-devops-architect v${pkg.version} — global compact install`));
  console.log(dim(`  installing into ${claudeDir}`));
  if (dryRun) console.log(yellow('  DRY RUN — nothing will be written'));
  console.log('');

  const py = findPythonCmd();
  if (!py) warn('python NOT found — hooks will be wired but cannot run (they fail open).');

  const written = [];

  // 1. Full layers → ~/.claude/devops-architect/ (Claude Code does not auto-load this folder).
  for (const d of GLOBAL_LAYER_DIRS) copyTree(path.join(PKG_ROOT, '.claude', d), path.join(daHome, d), dryRun, written);
  for (const f of DECISION_FILES) {
    const dest = path.join(daHome, 'decisions-template', path.basename(f));
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(PKG_ROOT, f), dest);
    }
    written.push(dest);
  }
  const orchestrator = path.join(daHome, 'ORCHESTRATOR.md');
  if (!dryRun) fs.copyFileSync(path.join(PKG_ROOT, 'CLAUDE.md'), orchestrator);
  written.push(orchestrator);

  // 2. Compact core + guide-me skill (the only thing listed in every chat).
  const compactFiles = [
    ['compact/CORE.md', path.join(daHome, 'CORE.md')],
    ['compact/RULES-DIGEST.md', path.join(daHome, 'RULES-DIGEST.md')],
    ['compact/guide-me/SKILL.md', path.join(claudeDir, 'skills', 'guide-me', 'SKILL.md')],
  ];
  for (const [src, dest] of compactFiles) {
    const body = fs.readFileSync(path.join(PKG_ROOT, src), 'utf8').split('{{DA_HOME}}').join(fwd(daHome));
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body);
    }
    written.push(dest);
  }

  // 3. Agents and hooks stay where Claude Code discovers them.
  const agentsDir = path.join(claudeDir, 'agents');
  const hooksDir = path.join(claudeDir, 'hooks');
  const agentFiles = fs.readdirSync(path.join(PKG_ROOT, '.claude/agents')).filter((f) => f.endsWith('.md'));
  copyTree(path.join(PKG_ROOT, '.claude/agents'), agentsDir, dryRun, written);
  copyTree(path.join(PKG_ROOT, '.claude/hooks'), hooksDir, dryRun, written);

  if (dryRun) {
    ok(`would write ${written.length} files`);
    console.log('');
    return;
  }

  // 4. Rewrite project-relative paths to absolute ones.
  const layerRe = new RegExp(`(^|[^\\w/~])\\.claude/(${GLOBAL_LAYER_DIRS.join('|')})/`, 'g');
  const rewriteTargets = [
    ...walk(daHome).filter((f) => f.endsWith('.md')).map((f) => path.join(daHome, f)),
    ...agentFiles.map((f) => path.join(agentsDir, f)),
  ];
  for (const file of rewriteTargets) {
    let t = fs.readFileSync(file, 'utf8');
    t = t
      .replace(layerRe, (_, pre, d) => `${pre}${fwd(daHome)}/${d}/`)
      .replace(/(^|[^\w/~])\.claude\/(agents|hooks)\//g, (_, pre, d) => `${pre}${fwd(claudeDir)}/${d}/`)
      .replace(/(^|[^\w/])decisions\/0000-template\.md/g, (_, pre) => `${pre}${fwd(daHome)}/decisions-template/0000-template.md`);
    fs.writeFileSync(file, t);
  }

  // 5. Agents: skills are files now, not registered skills; one-line descriptions keep every chat cheap.
  for (const f of agentFiles) {
    const file = path.join(agentsDir, f);
    let t = fs.readFileSync(file, 'utf8');
    const name = (t.match(/^name:\s*(.+)$/m) || [])[1];
    const short = name && AGENT_SHORT_DESCRIPTIONS[name.trim()];
    if (short) {
      t = t.replace(/^description:.*$/m,
        `description: DevOps Architect specialist — ${short} Use when the DevOps Architect (guide-me) delegates.`);
    }
    t = t.replace(/(\*\*)?[Ii]nvoke the `([a-z-]+)` skill(\*\*)?/g,
      (_, b1, skill, b2) => `${b1 || ''}Read \`${fwd(daHome)}/skills/${skill}/SKILL.md\`${b2 || ''}`);
    fs.writeFileSync(file, t);
  }

  // 6. Merge permissions + hooks into ~/.claude/settings.json, keeping the user's own settings.
  const settingsPath = path.join(claudeDir, 'settings.json');
  const src = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, '.claude/settings.json'), 'utf8'));
  let dest = {};
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, `${settingsPath}.bak`);
    dest = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }
  const perms = (dest.permissions = dest.permissions || {});
  for (const key of ['allow', 'deny', 'ask']) {
    const merged = [...new Set([...(perms[key] || []), ...((src.permissions || {})[key] || [])])];
    if (merged.length) perms[key] = merged;
  }
  const OURS = ['block_destructive.py', 'scan_secrets.py'];
  dest.hooks = dest.hooks || {};
  for (const [event, groups] of Object.entries(src.hooks || {})) {
    const existing = (dest.hooks[event] || []).filter(
      (g) => !(g.hooks || []).some((h) => OURS.some((n) => (h.command || '').includes(n)))
    );
    for (const g of JSON.parse(JSON.stringify(groups))) {
      for (const h of g.hooks || []) {
        const hook = OURS.find((n) => (h.command || '').includes(n));
        if (hook) h.command = `"${py || 'python'}" "${fwd(path.join(hooksDir, hook))}"`;
      }
      existing.push(g);
    }
    dest.hooks[event] = existing;
  }
  fs.writeFileSync(settingsPath, JSON.stringify(dest, null, 2) + '\n');

  ok(`${written.length} files written`);
  ok(`settings.json merged — ${(perms.allow || []).length} allow, ${(perms.deny || []).length} deny, hooks wired to ${py || 'python'}`);

  // 7. Anything that would still load in every chat defeats the point.
  if (fs.existsSync(path.join(claudeDir, 'CLAUDE.md'))) warn('~/.claude/CLAUDE.md exists — it loads in every chat');
  const rulesDir = path.join(claudeDir, 'rules');
  if (fs.existsSync(rulesDir) && fs.readdirSync(rulesDir).length) warn('~/.claude/rules/ is not empty — it loads in every chat');
  const oldSkills = fs.existsSync(path.join(claudeDir, 'skills'))
    ? fs.readdirSync(path.join(PKG_ROOT, '.claude/skills')).filter((s) => fs.existsSync(path.join(claudeDir, 'skills', s)))
    : [];
  if (oldSkills.length) warn(`old always-listed skills still in ~/.claude/skills: ${oldSkills.join(', ')}`);

  if (py) {
    const r = spawnSync(py, [path.join(hooksDir, 'test_hooks.py')], { encoding: 'utf8' });
    const out = (r.stdout || '').trim().split('\n').pop() || '';
    if (r.status === 0) ok(`hook regression suite: ${out}`);
    else fail(`hook regression suite FAILED: ${out}`);
  }

  console.log('');
  console.log(bold('  Next'));
  console.log(`    Open a new Claude Code chat in any project and type ${cyan('guide me')}.`);
  console.log(dim('    The first run in a project writes .claude/devops-context.md; later runs reuse it.'));
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
      const cmd = spawnSync(findPythonCmd() || 'python', [suite], { encoding: 'utf8' });
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

// Which CLI backs each system, how to check auth, and how to install it if missing.
const TOOLCHAIN = [
  { system: 'GitHub',     cmd: 'gh',        version: ['--version'],
    auth: ['auth', 'status'], authOk: /Logged in to/i,
    install: 'winget install GitHub.cli   |   brew install gh' },
  { system: 'Git',        cmd: 'git',       version: ['--version'] },
  { system: 'Docker',     cmd: 'docker',    version: ['--version'],
    auth: ['info'], authOk: /Server Version/i,
    install: 'https://docs.docker.com/get-docker/' },
  { system: 'Kubernetes', cmd: 'kubectl',   version: ['version', '--client', '-o', 'yaml'],
    auth: ['config', 'current-context'], authOk: /\S/,
    install: 'winget install Kubernetes.kubectl   |   brew install kubectl' },
  { system: 'Helm',       cmd: 'helm',      version: ['version', '--short'],
    install: 'winget install Helm.Helm   |   brew install helm' },
  { system: 'Terraform',  cmd: 'terraform', version: ['version'],
    install: 'winget install Hashicorp.Terraform   |   brew install terraform' },
  { system: 'AWS',        cmd: 'aws',       version: ['--version'],
    auth: ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'],
    authOk: /^\d{12}$/m,
    install: 'winget install Amazon.AWSCLI   |   brew install awscli' },
];

function tools() {
  console.log('');
  console.log(bold('  Tool availability'));
  console.log(dim('  Which access paths this machine can actually use.'));
  console.log('');

  const missing = [];
  const unauth = [];

  for (const t of TOOLCHAIN) {
    const v = spawnSync(t.cmd, t.version, { encoding: 'utf8' });
    if (v.status !== 0 && !v.stdout) {
      console.log(`  ${red('✗')} ${bold(t.system.padEnd(11))} ${dim('not installed')}`);
      missing.push(t);
      continue;
    }
    const ver = ((v.stdout || v.stderr || '').trim().split('\n')[0] || '').slice(0, 34);

    let state = dim('— ');
    if (t.auth) {
      const a = spawnSync(t.cmd, t.auth, { encoding: 'utf8' });
      const out = (a.stdout || '') + (a.stderr || '');
      if (a.status === 0 && t.authOk.test(out.trim())) {
        const detail = (out.trim().split('\n')[0] || '').slice(0, 30);
        state = green('authenticated') + dim('  ' + detail);
      } else {
        state = yellow('NOT configured');
        unauth.push(t);
      }
    }
    console.log(`  ${green('✓')} ${bold(t.system.padEnd(11))} ${dim(ver.padEnd(36))} ${state}`);
  }

  console.log('');
  if (missing.length) {
    console.log(bold('  Missing — install to enable that access path'));
    console.log(dim('    (just installed something? PATH is read at shell start —'));
    console.log(dim('     open a new terminal and re-run before trusting this)'));
    for (const t of missing) {
      console.log(`    ${t.system}: ${dim(t.install || 'see vendor docs')}`);
    }
    console.log('');
  }
  if (unauth.length) {
    console.log(bold('  Installed but not configured'));
    for (const t of unauth) {
      const hint = {
        AWS: 'aws configure sso   then   aws sso login',
        GitHub: 'gh auth login',
        Kubernetes: 'set a kubeconfig context (use a read-only ServiceAccount)',
        Docker: 'start Docker Desktop / the daemon',
      }[t.system];
      console.log(`    ${t.system}: ${dim(hint || 'see vendor docs')}`);
    }
    console.log('');
  }

  // MCP is the second access path — report it too.
  const mcpPath = path.join(process.cwd(), '.mcp.json');
  console.log(bold('  MCP servers'));
  if (fs.existsSync(mcpPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      const names = Object.keys(m.mcpServers || {});
      if (names.length) ok(`.mcp.json — ${names.length} configured: ${names.join(', ')}`);
      else warn('.mcp.json exists but defines no servers');
    } catch (e) {
      fail(`.mcp.json is not valid JSON — ${e.message}`);
    }
  } else {
    skip('no .mcp.json — CLI is the only access path (usually fine)');
    console.log(dim('      Start from .mcp.json.example if you need one.'));
  }

  console.log('');
  console.log(dim('  Read .claude/tools/README.md for the CLI-vs-MCP decision and'));
  console.log(dim('  the per-system read/write/destructive capability matrix.'));
  console.log('');
}

function help() {
  console.log(`
  ${bold('claude-devops-architect')} ${dim('v' + pkg.version)}

  A senior DevOps / AWS architect and mentor for Claude Code.

  ${bold('Usage')}
    npx claude-devops-architect init [dir]     install into a project (default: .)
    npx claude-devops-architect global         install for every project, compact and on-demand
    npx claude-devops-architect doctor         verify the install and guardrails
    npx claude-devops-architect tools          which CLIs / MCP servers are usable
    npx claude-devops-architect --version
    npx claude-devops-architect --help

  ${bold('global options')}
    --dry-run    show what would happen, write nothing
    --home DIR   install under DIR/.claude instead of your home folder

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
    .claude/tools        tool-selection: CLI vs MCP, capability matrix
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
else if (cmd === 'global') globalInstall(argv);
else if (cmd === 'doctor') doctor(argv);
else if (cmd === 'tools') tools(argv);
else {
  console.error(`\n  ${red('Unknown command:')} ${cmd}\n  Run --help for usage.\n`);
  process.exit(1);
}
