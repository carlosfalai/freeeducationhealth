'use strict';

/**
 * history-insights/pdf-export.cjs -- EXPERIMENTAL
 *
 * Exports an education report (from analyze.cjs's generateEducationReport)
 * as a simple, patient-portable PDF the person can keep on their phone and
 * show any clinician they manage to reach -- the "patient-portable
 * health-summary PDF" capability from the design spec.
 *
 * This deliberately reuses the same PDF engine and pattern as
 * ../instanthpi/pdf/generate.cjs (pdf-lib, US-Letter, generated from
 * scratch) but is self-contained here: instanthpi/ and history-insights/
 * are independent Node projects with separate node_modules trees, and
 * instanthpi's module exports a referral-letter template, not a generic
 * report renderer -- forcing a cross-package dependency would complicate
 * install for no shared code. One engine (pdf-lib), two consumers.
 *
 * The PDF is written only to the path the caller chose. Nothing here
 * uploads, emails, or transmits anything.
 *
 * v1 limitation: pdf-lib's standard Helvetica fonts only encode
 * Latin/WinAnsi characters, so non-Latin-script report text (e.g. locale
 * "am" or "hi") is transliterated/degraded to "?" in the PDF. The plain-text
 * CLI output has no such limit -- prefer it for non-Latin locales.
 */

const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GREY = rgb(0.35, 0.35, 0.35);
const BLACK = rgb(0, 0, 0);

/**
 * Best-effort mapping of arbitrary text into what Helvetica (WinAnsi) can
 * encode: strip accents to base letters, normalize typographic punctuation,
 * replace anything still outside printable ASCII with "?".
 * @param {string} text
 * @returns {string}
 */
function sanitizeForPdf(text) {
  return String(text == null ? '' : text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining accents left by NFKD
    .replace(/[‘’ʼ]/g, "'") // curly/modifier apostrophes
    .replace(/[“”]/g, '"') // curly double quotes
    .replace(/[–—]/g, '-') // en/em dashes
    .replace(/•/g, '-') // bullet
    .replace(/…/g, '...') // ellipsis
    .replace(/\t/g, '  ')
    .replace(/[^\n\x20-\x7e]/g, '?');
}

/**
 * Word-wrap `text` (which may contain newlines) into lines that fit
 * `maxWidth` at `size` in `font`. Words longer than a whole line are
 * hard-split so nothing overflows the margin.
 * @returns {string[]}
 */
function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of sanitizeForPdf(text).split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      let piece = word;
      // Hard-split any single word wider than the whole line.
      while (font.widthOfTextAtSize(piece, size) > maxWidth) {
        let cut = piece.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > maxWidth) cut--;
        const head = piece.slice(0, cut);
        if (current) {
          lines.push(current);
          current = '';
        }
        lines.push(head);
        piece = piece.slice(cut);
      }
      const candidate = current ? `${current} ${piece}` : piece;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = piece;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * @param {object} report education report object from generateEducationReport()
 * @param {string} outputPath where to write the PDF
 * @returns {Promise<string>} outputPath
 */
async function exportReportPdf(report, outputPath) {
  if (!report || !Array.isArray(report.sections)) {
    throw new Error('exportReportPdf: report must be a report object from generateEducationReport().');
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(height) {
    if (y - height < MARGIN) newPage();
  }

  /** Draw wrapped text, paginating as needed. */
  function drawBlock(text, { size = 10, useBold = false, color = BLACK, gapAfter = 8 } = {}) {
    const f = useBold ? boldFont : font;
    const lineHeight = size * 1.35;
    for (const line of wrapText(text, f, size, CONTENT_WIDTH)) {
      ensureSpace(lineHeight);
      if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color });
      y -= lineHeight;
    }
    y -= gapAfter;
  }

  function drawRule(gapAfter = 10) {
    ensureSpace(gapAfter + 4);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: GREY,
    });
    y -= gapAfter;
  }

  // --- Header ---------------------------------------------------------------
  drawBlock('Personal Health Education Report', { size: 18, useBold: true, gapAfter: 2 });
  drawBlock('EXPERIMENTAL -- AI-generated education. Not a diagnosis or a treatment plan.', {
    size: 10,
    useBold: true,
    color: GREY,
    gapAfter: 2,
  });
  drawBlock(
    `Generated ${report.generatedAt || new Date().toISOString()} by history-insights ` +
      '(freeeducationhealth) -- self-hosted, no shared infrastructure.',
    { size: 8, color: GREY, gapAfter: 6 }
  );
  drawRule();

  if (report.disclaimer) {
    drawBlock(report.disclaimer, { size: 9, color: GREY, gapAfter: 6 });
  }

  const topics = Array.isArray(report.topics) ? report.topics : [];
  drawBlock(
    topics.length > 0
      ? `Topics detected from the provided history: ${topics.map((t) => t.label).join(', ')}.`
      : 'No catalog topics were detected in the provided history; this report has one overall section.',
    { size: 10, gapAfter: 10 }
  );

  // --- Sections ---------------------------------------------------------------
  for (const section of report.sections) {
    ensureSpace(60); // avoid a heading orphaned at the very bottom of a page
    drawRule(14);
    drawBlock(section.label, { size: 13, useBold: true, gapAfter: 2 });
    if (section.panelMeta && Array.isArray(section.panelMeta.providersConsulted)) {
      drawBlock(
        `Answers aggregated from ${section.panelMeta.providersConsulted.length} independent AI models ` +
          `(${section.panelMeta.providersConsulted.join(', ')}).`,
        { size: 8, color: GREY, gapAfter: 6 }
      );
    }
    if (section.error) {
      drawBlock(section.error, { size: 10, gapAfter: 10 });
      continue;
    }
    if (section.divergenceFlag) {
      drawBlock(
        'CAUTION: the independent AI models materially disagreed on this section. ' +
          'Treat it with extra skepticism and prioritize showing it to a clinician.',
        { size: 10, useBold: true, gapAfter: 8 }
      );
    }
    for (const faq of section.faqs || []) {
      drawBlock(`Q: ${faq.question}`, { size: 10, useBold: true, gapAfter: 2 });
      drawBlock(faq.answer, { size: 10, gapAfter: 10 });
    }
  }

  // --- Footer note on the last page -------------------------------------------
  drawRule(12);
  drawBlock(
    'Carry this report on your phone and show it to any clinician you see -- it is meant to ' +
      'travel with you, especially where records are not shared between providers.',
    { size: 9, color: GREY, gapAfter: 0 }
  );

  const bytes = await doc.save();
  fs.writeFileSync(outputPath, bytes);
  return outputPath;
}

module.exports = { exportReportPdf, sanitizeForPdf, wrapText };
