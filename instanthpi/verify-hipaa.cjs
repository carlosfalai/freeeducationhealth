/**
 * instanthpi/verify-hipaa.cjs
 *
 * HIPAA / compliance self-check for a physician's own instanthpi/ setup.
 * Run it any time with:
 *
 *   node verify-hipaa.cjs        (from the instanthpi/ folder)
 *
 * What it checks (everything that CAN be checked automatically):
 *
 *   1. Whether THIS process is running in Claude Code's Bedrock mode
 *      (CLAUDE_CODE_USE_BEDROCK + AWS_REGION set). If not, the Claude Code
 *      session driving this repo is talking to the direct Anthropic API,
 *      not the BAA-covered Bedrock path -- fine for non-PHI work, warned
 *      about here so it is never an accident during patient-data work.
 *   2. That instanthpi/.env exists and is covered by a .gitignore, so real
 *      credentials can never be committed. This script NEVER reads or
 *      prints .env's contents -- it only checks existence and ignore
 *      coverage.
 *   3. Whether the AI provider API key env vars referenced in
 *      instanthpi/.env.example (the *_API_KEY entries) are present as real
 *      -- non-empty, non-placeholder -- values in the current environment.
 *
 * What it can NOT check, ever, and says so plainly: whether the physician
 * has actually accepted the AWS Business Associate Addendum in AWS
 * Artifact. That is a legal agreement between AWS and the physician's own
 * practice, done manually in the AWS Console; there is no API this script
 * could use to confirm it. See docs/hipaa-bedrock-guide.md for the how-to.
 *
 * Exit code: 0 if every automatable check passes (warnings allowed),
 * non-zero if any check fails outright. A 0 exit code does NOT mean
 * "HIPAA compliant" -- it means the parts a script can verify look right.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const INSTANTHPI_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(INSTANTHPI_DIR, '.env');
const ENV_EXAMPLE_PATH = path.join(INSTANTHPI_DIR, '.env.example');
const GUIDE = 'docs/hipaa-bedrock-guide.md';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isTruthyEnv(value) {
  if (value === undefined || value === null) return false;
  const v = String(value).trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

/**
 * True if an env var's value looks like an unfilled placeholder rather than
 * a real credential. `examplePlaceholder` is the literal value that
 * .env.example ships for this variable (e.g. "your-anthropic-key-here") --
 * if the live environment still carries that exact string, it was copied,
 * not filled in.
 */
function isPlaceholderValue(value, examplePlaceholder) {
  const v = String(value).trim();
  if (v === '') return true;
  if (examplePlaceholder && v === String(examplePlaceholder).trim()) return true;
  if (/your[-_][a-z0-9-_]*[-_]here/i.test(v)) return true;
  if (/^(changeme|change[-_]me|placeholder|todo|tbd|fixme|x{3,}|\.{3})$/i.test(v)) return true;
  if (/^<[^>]*>$/.test(v)) return true; // e.g. "<paste key here>"
  return false;
}

/**
 * Extract the AI provider API key variable names (and their shipped
 * placeholder values) from instanthpi/.env.example. By convention those are
 * the *_API_KEY entries (ANTHROPIC_API_KEY, DEEPSEEK_API_KEY,
 * OPENAI_API_KEY, ...). SPRUCE_API_TOKEN and the SRFax credentials are
 * deliberately not included -- they are service credentials, not AI panel
 * providers, and are checked by their own modules when used.
 */
function providerKeyVarsFromExample(exampleText) {
  const vars = [];
  for (const rawLine of String(exampleText).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    const [, name, value] = m;
    if (name.endsWith('_API_KEY')) {
      vars.push({ name, examplePlaceholder: value.trim() });
    }
  }
  return vars;
}

/**
 * Is `fileRelPath` (relative to the repo root, forward slashes) covered by
 * a .gitignore? Asks git itself when available (`git check-ignore` is the
 * authoritative answer, and works whether or not the file exists yet);
 * falls back to a conservative manual scan of the two .gitignore files
 * that matter for instanthpi/.env.
 */
function isGitIgnored(fileRelPath) {
  // Preferred: ask git.
  try {
    execFileSync('git', ['check-ignore', '-q', fileRelPath], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return { ignored: true, method: 'git check-ignore' };
  } catch (err) {
    // status 1 = definitively NOT ignored; anything else (git missing, not
    // a git repo) means "couldn't ask git", so fall through to manual scan.
    if (err && err.status === 1) {
      return { ignored: false, method: 'git check-ignore' };
    }
  }

  // Fallback: manual scan. Handles the simple, common patterns only.
  const basename = path.posix.basename(fileRelPath);
  const candidates = [
    { file: path.join(REPO_ROOT, '.gitignore'), rel: fileRelPath },
    {
      file: path.join(INSTANTHPI_DIR, '.gitignore'),
      rel: basename, // patterns in instanthpi/.gitignore are relative to it
    },
  ];
  for (const { file, rel } of candidates) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const pattern = rawLine.trim();
      if (pattern === '' || pattern.startsWith('#') || pattern.startsWith('!')) continue;
      if (
        pattern === rel ||
        pattern === '/' + rel ||
        pattern === basename || // no-slash pattern matches at any depth
        pattern === '*.env' ||
        pattern === '**/' + basename
      ) {
        return { ignored: true, method: `manual scan of ${path.relative(REPO_ROOT, file)}` };
      }
    }
  }
  return { ignored: false, method: 'manual scan (git unavailable)' };
}

// ---------------------------------------------------------------------------
// The checks. Each returns { status: 'PASS'|'WARN'|'FAIL', title, lines[] }.
// ---------------------------------------------------------------------------

function checkClaudeCodeBedrockMode(env = process.env) {
  const title = 'Claude Code session on the BAA-covered Bedrock path';
  const bedrockOn = isTruthyEnv(env.CLAUDE_CODE_USE_BEDROCK);
  const region = (env.AWS_REGION || '').trim();

  if (bedrockOn && region) {
    return {
      status: 'PASS',
      title,
      lines: [
        `CLAUDE_CODE_USE_BEDROCK is set and AWS_REGION=${region}.`,
        'This process was started in "claude-phi"-style Bedrock mode, so a',
        'Claude Code session with this environment talks to Amazon Bedrock,',
        'not the direct Anthropic API. (Whether that traffic is actually',
        'BAA-covered still depends on the manual AWS Artifact step below.)',
      ],
    };
  }

  if (bedrockOn && !region) {
    return {
      status: 'WARN',
      title,
      lines: [
        'CLAUDE_CODE_USE_BEDROCK is set but AWS_REGION is not. Claude Code',
        'does not read the region from ~/.aws/config for this -- AWS_REGION',
        'must be set explicitly (e.g. AWS_REGION=us-east-1), then Claude',
        `Code restarted. See ${GUIDE}.`,
      ],
    };
  }

  return {
    status: 'WARN',
    title,
    lines: [
      'CLAUDE_CODE_USE_BEDROCK / AWS_REGION are not set in this process,',
      'so a Claude Code session running with this environment is talking',
      'to the DIRECT Anthropic API -- not the BAA-covered Bedrock path.',
      'That is fine for work that involves no real patient data (which is',
      'why this is a warning, not a failure). For any session that touches',
      'real patient information, use a separate "claude-phi"-style profile',
      'with CLAUDE_CODE_USE_BEDROCK=1 and AWS_REGION set, and restart',
      'Claude Code so it picks them up -- an already-running session will',
      `not. How-to: ${GUIDE}.`,
    ],
  };
}

function checkEnvFileAndGitignore() {
  const title = 'instanthpi/.env exists and can never be committed';
  const exists = fs.existsSync(ENV_PATH);
  const ignore = isGitIgnored('instanthpi/.env');
  const lines = [];

  if (!exists) {
    lines.push(
      'instanthpi/.env was not found. Copy .env.example to .env and fill',
      'in your own credentials (see RUNBOOK.md, "One-time setup"). This',
      'script never reads .env -- it only checks that the file exists.',
    );
    lines.push(
      ignore.ignored
        ? `(.gitignore coverage is already in place, per ${ignore.method}.)`
        : '(.env is ALSO not covered by a .gitignore -- fix that first.)',
    );
    return { status: 'FAIL', title, lines };
  }

  if (!ignore.ignored) {
    lines.push(
      'instanthpi/.env exists but is NOT covered by any .gitignore',
      `(checked via ${ignore.method}). This means a "git add ." could`,
      'commit your real credentials to a public repository. Add a ".env"',
      'line to instanthpi/.gitignore before doing anything else.',
    );
    return { status: 'FAIL', title, lines };
  }

  lines.push(
    `instanthpi/.env exists and is git-ignored (${ignore.method}), so its`,
    'contents cannot be committed. Its contents were not read or printed.',
  );
  return { status: 'PASS', title, lines };
}

function checkProviderKeys(env = process.env) {
  const title = 'AI provider API keys present in this environment';
  let exampleText;
  try {
    exampleText = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  } catch {
    return {
      status: 'FAIL',
      title,
      lines: [
        'instanthpi/.env.example is missing, so the expected provider key',
        'variable names could not be determined. Restore it from the repo.',
      ],
    };
  }

  const vars = providerKeyVarsFromExample(exampleText);
  if (vars.length === 0) {
    return {
      status: 'WARN',
      title,
      lines: [
        'No *_API_KEY entries were found in instanthpi/.env.example, so',
        'there is nothing to check here. That is unexpected -- compare',
        '.env.example against the repository copy.',
      ],
    };
  }

  const lines = [];
  let realCount = 0;
  for (const { name, examplePlaceholder } of vars) {
    const value = env[name];
    if (value === undefined || String(value).trim() === '') {
      lines.push(`  ${name}: not set in this environment`);
    } else if (isPlaceholderValue(value, examplePlaceholder)) {
      lines.push(`  ${name}: set, but still a placeholder value -- fill it in`);
    } else {
      realCount += 1;
      lines.push(`  ${name}: set (value not shown)`);
    }
  }

  lines.push(
    '',
    `${realCount} of ${vars.length} provider key(s) look real in this environment.`,
    "core/'s panel requires at least panelSize independent providers, and",
    'panelSize is never allowed below 2 -- so 2+ real keys is the bar for',
    'a working panel.',
  );

  if (realCount < 2) {
    lines.push(
      '',
      'Note: keys set only inside instanthpi/.env will NOT show up here.',
      'The instanthpi/ scripts load .env themselves at runtime (dotenv),',
      'but this script deliberately never reads .env, so it can only see',
      "what is exported into the current process's environment. If your",
      'keys live in .env, the scripts may still work -- re-run this from a',
      'shell/session where the keys are exported to confirm end-to-end.',
    );
  }

  lines.push(
    '',
    'This check confirms local configuration only. It does NOT and cannot',
    "verify that AWS's Business Associate Addendum is accepted -- see the",
    'reminder below.',
  );

  return { status: realCount >= 2 ? 'PASS' : 'WARN', title, lines };
}

function baaReminder() {
  return {
    status: 'INFO',
    title: 'AWS BAA acceptance -- the part no script can check',
    lines: [
      'Accepting the AWS Business Associate Addendum is a manual, one-time',
      'step that only the physician (or whoever legally represents their',
      'practice) can do: AWS Console -> AWS Artifact -> Agreements -> AWS',
      'Business Associate Addendum -> review and accept. It is a legal',
      'agreement between AWS and your practice; AWS exposes no API this',
      'script could use to confirm you have accepted it, and nothing',
      'should ever accept it on your behalf.',
      '',
      'Until you have done that step yourself, traffic to Bedrock is NOT',
      'BAA-covered even if every check above passes. Step-by-step how-to,',
      `plus required shared-responsibility controls: ${GUIDE}.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function runAllChecks(env = process.env) {
  return [
    checkClaudeCodeBedrockMode(env),
    checkEnvFileAndGitignore(),
    checkProviderKeys(env),
    baaReminder(),
  ];
}

function printReport(results) {
  const rule = '-'.repeat(74);
  console.log(rule);
  console.log('instanthpi/ HIPAA / compliance self-check');
  console.log(rule);

  for (const r of results) {
    console.log('');
    console.log(`[${r.status}] ${r.title}`);
    for (const line of r.lines) {
      console.log(line === '' ? '' : `    ${line}`);
    }
  }

  const fails = results.filter((r) => r.status === 'FAIL').length;
  const warns = results.filter((r) => r.status === 'WARN').length;

  console.log('');
  console.log(rule);
  if (fails > 0) {
    console.log(
      `RESULT: FAIL -- ${fails} check(s) failed` +
        (warns > 0 ? `, ${warns} warning(s)` : '') +
        '. Fix the [FAIL] items above and re-run.',
    );
  } else if (warns > 0) {
    console.log(
      `RESULT: PASS with ${warns} warning(s) -- every automatable check`,
    );
    console.log(
      'passed; read the [WARN] items above and decide if they apply to how',
    );
    console.log('you are running things right now.');
  } else {
    console.log('RESULT: PASS -- every automatable check passed.');
  }
  console.log(
    'Remember: a passing result covers only what a script can verify. The',
  );
  console.log(
    'AWS BAA acceptance in AWS Artifact remains a manual step only you can',
  );
  console.log(`do and confirm -- see ${GUIDE}.`);
  console.log(rule);

  return fails > 0 ? 1 : 0;
}

module.exports = {
  runAllChecks,
  printReport,
  checkClaudeCodeBedrockMode,
  checkEnvFileAndGitignore,
  checkProviderKeys,
  isPlaceholderValue,
  providerKeyVarsFromExample,
  isGitIgnored,
};

// --- CLI ---
if (require.main === module) {
  process.exitCode = printReport(runAllChecks());
}
