#!/usr/bin/env node
'use strict';

// package-releases.cjs — build downloadable zip bundles into dist/.
//
// Usage:   node package-releases.cjs
// Output:  dist/freeeducationhealth-full.zip           (whole repo)
//          dist/freeeducationhealth-bot-only.zip       (core/ + bot/ + root docs)
//          dist/freeeducationhealth-instanthpi-only.zip (core/ + instanthpi/ + root docs)
//          dist/freeeducationhealth-docs-only.zip      (docs/ + README/SETUP/CLAUDE/INTEGRATION, no code)
//
// ZIP TOOLING CHOICE (documented per the repo convention): this script uses
// NO external zip utility and NO npm dependencies. It writes the ZIP file
// format directly — zlib.deflateRawSync (Node built-in) for compression plus
// hand-written ZIP local-file-header / central-directory / end-of-central-
// directory records, and a small CRC-32 implementation. This keeps the
// script identical on Windows, macOS, and Linux (PowerShell's
// Compress-Archive, bsdtar's zip mode, and the `zip` CLI are each missing on
// at least one common platform). ZIP64 is NOT implemented; the script throws
// if any archive would exceed classic ZIP limits (4 GB / 65,535 entries),
// which this repo is nowhere near.
//
// WHAT GETS PACKAGED (safety-critical): the file list comes from
// `git ls-files --cached --others --exclude-standard`, i.e. exactly the
// files git would track — every nested .gitignore is respected. That is what
// keeps a locally *configured* checkout safe to package: .env files,
// node_modules/, carousel card data, generated/filled PDFs, signature
// images, and .operator-consent.json are all git-ignored and therefore never
// enter any zip. If git (or the .git folder) is unavailable — e.g. someone
// downloaded the repo as a zip — a manual directory walk with equivalent
// exclusion rules is used instead. In both paths, a final hard safety filter
// (isForbidden) re-checks every candidate file, so even a force-added secret
// file would still be excluded.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const REPO_ROOT = __dirname;
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const ZIP_PREFIX = 'freeeducationhealth/'; // top-level folder inside each zip

// Classic (non-ZIP64) format limits.
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

// ---------------------------------------------------------------------------
// CRC-32 (standard polynomial 0xEDB88320), needed by the ZIP format.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Minimal ZIP writer (APPNOTE.TXT sections 4.3.7, 4.3.12, 4.3.16).
// ---------------------------------------------------------------------------

function toDosDateTime(date) {
  // ZIP stores MS-DOS date/time; the format cannot represent years < 1980.
  const year = Math.max(1980, date.getFullYear());
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

/**
 * Build a complete .zip file as a Buffer.
 * @param {Array<{name: string, data: Buffer, mtime: Date}>} entries
 */
function buildZip(entries) {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      `ZIP64 not implemented: ${entries.length} entries exceeds ${MAX_ENTRIES}`
    );
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const { dosDate, dosTime } = toDosDateTime(entry.mtime);

    // Deflate; fall back to "store" when deflate doesn't help (already-
    // compressed content like PNGs).
    let method = 8; // deflate
    let compressed = zlib.deflateRawSync(entry.data, { level: 9 });
    if (compressed.length >= entry.data.length) {
      method = 0; // store
      compressed = entry.data;
    }

    if (entry.data.length > MAX_SIZE || compressed.length > MAX_SIZE) {
      throw new Error(`ZIP64 not implemented: "${entry.name}" exceeds 4 GB`);
    }

    // Local file header (signature 0x04034b50).
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    local.writeUInt16LE(0x0800, 6); // general purpose flags: UTF-8 filenames
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    localParts.push(local, nameBuf, compressed);

    // Central directory header (signature 0x02014b50).
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(0x0800, 8); // UTF-8 filenames
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // file comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal file attributes
    central.writeUInt32LE(0, 38); // external file attributes
    central.writeUInt32LE(offset, 42); // offset of local header
    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + compressed.length;
    if (offset > MAX_SIZE) {
      throw new Error('ZIP64 not implemented: archive exceeds 4 GB');
    }
  }

  const centralSize = centralParts.reduce((sum, b) => sum + b.length, 0);

  // End of central directory record (signature 0x06054b50).
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // this disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

// ---------------------------------------------------------------------------
// File listing.
// ---------------------------------------------------------------------------

/**
 * Hard safety filter, applied to every candidate file regardless of how the
 * file list was produced. Mirrors this repo's hard rules: no credentials, no
 * PHI-bearing runtime data, no signature images in anything distributable.
 */
function isForbidden(relPath) {
  const parts = relPath.split('/');
  const base = parts[parts.length - 1];

  // Never package these directories, wherever they appear.
  if (
    parts.some(
      (seg) =>
        seg === 'node_modules' ||
        seg === '.git' ||
        seg === 'dist' ||
        seg === '__pycache__'
    )
  ) {
    return true;
  }

  // Credentials / operator state.
  if (base === '.env') return true;
  if (base.startsWith('.env.') && base !== '.env.example') return true;
  if (base === '.operator-consent.json') return true;

  // Runtime data that may contain patient content (mirrors the nested
  // .gitignore files in instanthpi/ and history-insights/).
  if (relPath.startsWith('instanthpi/carousel/cards/') && base !== '.gitkeep') {
    return true;
  }
  if (relPath === 'instanthpi/spruce/.handled.json') return true;
  if (/^signature.*\.(png|jpe?g)$/i.test(base)) return true;
  if (base.endsWith('.pdf')) return true; // no tracked PDFs exist; generated ones may contain patient content
  if (/\.report\.(txt|json)$/.test(base)) return true;

  // Junk.
  if (base.endsWith('.log')) return true;
  if (base === '.DS_Store') return true;
  if (base.endsWith('.pyc')) return true;

  return false;
}

/** Preferred path: exactly the files git would track (tracked + untracked-
 *  but-not-ignored), honoring every nested .gitignore. */
function listFilesViaGit() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return out.split('\0').filter(Boolean);
}

/** Fallback for checkouts without git/.git: manual walk with exclusion rules
 *  equivalent to the .gitignore files (isForbidden does the real vetting). */
function listFilesViaWalk() {
  const results = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', '__pycache__']);

  (function walk(dir) {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (!skipDirs.has(dirent.name)) walk(abs);
      } else if (dirent.isFile()) {
        results.push(path.relative(REPO_ROOT, abs).split(path.sep).join('/'));
      }
      // Symlinks and other special entries are skipped deliberately.
    }
  })(REPO_ROOT);

  return results;
}

function listRepoFiles() {
  let files;
  let source;
  try {
    if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) {
      throw new Error('no .git directory');
    }
    files = listFilesViaGit();
    source = 'git ls-files (respects .gitignore)';
  } catch (err) {
    files = listFilesViaWalk();
    source = `manual walk (git unavailable: ${err.message})`;
  }

  const kept = files
    .filter((rel) => !isForbidden(rel))
    // git ls-files --cached can list files deleted from disk but still staged.
    .filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
    .sort();

  return { files: kept, source };
}

// ---------------------------------------------------------------------------
// Bundle definitions.
// ---------------------------------------------------------------------------

const CODE_BUNDLE_ROOT_DOCS = new Set(['CLAUDE.md', 'README.md', 'LICENSE']);
const DOCS_BUNDLE_ROOT_FILES = new Set([
  'README.md',
  'SETUP.md',
  'CLAUDE.md',
  'INTEGRATION.md',
]);

const BUNDLES = [
  {
    filename: 'freeeducationhealth-full.zip',
    description: 'entire repo (all modules, docs, and tests)',
    include: () => true,
  },
  {
    filename: 'freeeducationhealth-bot-only.zip',
    description: 'core/ + bot/ + root docs (patient Telegram bot only)',
    include: (rel) =>
      rel.startsWith('core/') ||
      rel.startsWith('bot/') ||
      CODE_BUNDLE_ROOT_DOCS.has(rel),
  },
  {
    filename: 'freeeducationhealth-instanthpi-only.zip',
    description: 'core/ + instanthpi/ + root docs (physician brain only)',
    include: (rel) =>
      rel.startsWith('core/') ||
      rel.startsWith('instanthpi/') ||
      CODE_BUNDLE_ROOT_DOCS.has(rel),
  },
  {
    filename: 'freeeducationhealth-docs-only.zip',
    description: 'docs/ + README/SETUP/CLAUDE/INTEGRATION (reading only, no code)',
    include: (rel) => rel.startsWith('docs/') || DOCS_BUNDLE_ROOT_FILES.has(rel),
  },
];

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function main() {
  const { files, source } = listRepoFiles();
  if (files.length === 0) {
    console.error('No packageable files found — refusing to write empty zips.');
    process.exit(1);
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });

  console.log(`File list: ${files.length} files via ${source}`);
  console.log(`Output:    ${DIST_DIR}`);
  console.log('');

  const summary = [];

  for (const bundle of BUNDLES) {
    const selected = files.filter(bundle.include);
    if (selected.length === 0) {
      throw new Error(`Bundle ${bundle.filename} matched zero files — check its include rule.`);
    }

    const entries = selected.map((rel) => {
      const abs = path.join(REPO_ROOT, rel);
      return {
        name: ZIP_PREFIX + rel, // unzips into a freeeducationhealth/ folder
        data: fs.readFileSync(abs),
        mtime: fs.statSync(abs).mtime,
      };
    });

    const zipBuf = buildZip(entries);
    const outPath = path.join(DIST_DIR, bundle.filename);
    fs.writeFileSync(outPath, zipBuf);

    summary.push({
      filename: bundle.filename,
      description: bundle.description,
      fileCount: selected.length,
      bytes: zipBuf.length,
    });
  }

  console.log('Wrote:');
  for (const s of summary) {
    console.log(
      `  ${s.filename.padEnd(42)} ${formatSize(s.bytes).padStart(10)}  (${s.fileCount} files) — ${s.description}`
    );
  }
  console.log('');
  console.log(
    'dist/ is git-ignored: these zips are local build artifacts, rebuilt fresh from the current source each run.'
  );
}

main();
