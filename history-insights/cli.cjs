#!/usr/bin/env node
'use strict';

/**
 * history-insights/cli.cjs -- EXPERIMENTAL
 *
 * Simplest possible interface for this module: read a block of personal
 * health history text from a file path argument (or stdin), run the
 * analysis + core/ AI panel, print the education report to stdout.
 * No server, no UI.
 *
 * Usage:
 *   node cli.cjs my-history.txt
 *   cat my-history.txt | node cli.cjs
 *   node cli.cjs my-history.txt --pdf my-report.pdf
 *   node cli.cjs my-history.txt --locale fr-CA
 *   node cli.cjs my-history.txt --json
 *   node cli.cjs my-history.txt --dry-run     # no AI calls: shows detected
 *                                             # topics and the exact
 *                                             # (redacted) intake payloads
 *                                             # that WOULD be sent
 *
 * Everything the AI providers see is decided by YOUR .env in this folder
 * (see .env.example) -- there is no shared server anywhere in this project.
 */

const fs = require('fs');
const path = require('path');

const {
  analyzeHistory,
  generateEducationReport,
  formatReportText,
} = require('./analyze.cjs');
const { buildPanelConfigFromEnv } = require('./config.cjs');

const USAGE = `Usage: node cli.cjs [history-file] [options]

Reads free-text personal health history from [history-file], or from stdin
if no file is given (or the file is "-"), and prints an AI-generated
education report structured as FAQ sections per detected topic.

Options:
  --pdf <output-path>   Also export the report as a simple portable PDF.
  --locale <bcp47>      Report language (default: REPORT_LOCALE env or "en").
  --json                Print the raw report object as JSON instead of text.
  --dry-run             No AI calls: print detected topics and the exact
                        (locally redacted) intake payloads that would be sent.
  --help                Show this help.

Configuration: copy .env.example to .env in this folder and fill in your own
AI provider keys (at least two providers; PANEL_SIZE >= 2 always).`;

function parseArgs(argv) {
  const args = { file: null, pdf: null, locale: null, json: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--pdf') {
      args.pdf = argv[++i];
      if (!args.pdf || args.pdf.startsWith('--')) {
        throw new Error('--pdf requires an output path, e.g. --pdf my-report.pdf');
      }
    } else if (arg === '--locale') {
      args.locale = argv[++i];
      if (!args.locale || args.locale.startsWith('--')) {
        throw new Error('--locale requires a BCP-47 tag, e.g. --locale fr-CA');
      }
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`);
    } else if (args.file === null) {
      args.file = arg;
    } else {
      throw new Error(`Unexpected extra argument "${arg}". Run with --help for usage.`);
    }
  }
  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function readHistoryText(args) {
  if (args.file && args.file !== '-') {
    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`History file not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf8');
  }
  if (process.stdin.isTTY) {
    throw new Error('No history file given and stdin is a terminal. Run with --help for usage.');
  }
  return readStdin();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  // Load this folder's own .env (optional -- env vars may already be set).
  try {
    require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
  } catch {
    // dotenv not installed yet; fine if the env vars are set another way.
  }

  const historyText = await readHistoryText(args);
  if (!historyText.trim()) {
    throw new Error('The history text is empty -- paste your past diagnoses, medications, and labs.');
  }
  const locale = args.locale || process.env.REPORT_LOCALE || 'en';

  if (args.dryRun) {
    // Offline: show what was detected and exactly what WOULD be sent to the
    // configured AI providers (after the local best-effort PII scrub).
    const analysis = analyzeHistory(historyText, { locale });
    if (!analysis.redactionApplied) {
      process.stderr.write(
        'WARNING: bot/deidentify.cjs not found -- no local PII scrub was applied to this preview.\n'
      );
    }
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          note:
            'No AI provider was called. These are the exact intake payloads a real run would ' +
            'send to the providers configured in your .env, one core/ panel run per entry.',
          redactionApplied: analysis.redactionApplied,
          topicsDetected: analysis.topics,
          overallIntake: analysis.intakeAnswers,
          topicIntakes: analysis.topicIntakes,
        },
        null,
        2
      )
    );
    return;
  }

  const panelConfig = buildPanelConfigFromEnv(process.env);
  const report = await generateEducationReport(historyText, panelConfig, {
    locale,
    log: (msg) => process.stderr.write(`${msg}\n`),
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReportText(report));
  }

  if (args.pdf) {
    const { exportReportPdf } = require('./pdf-export.cjs');
    const pdfPath = path.resolve(args.pdf);
    await exportReportPdf(report, pdfPath);
    process.stderr.write(`Wrote PDF report to ${pdfPath}\n`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
