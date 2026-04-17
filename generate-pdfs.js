#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────
 *  Donnie — Statistical Modelling
 *  PDF Generator  (Node ≥ 18 · Puppeteer · pdf-lib)
 *
 *  Usage:
 *    node generate-pdfs.js                  # generate all PDFs
 *    node generate-pdfs.js --page index     # one page only
 *    node generate-pdfs.js --merge          # also merge into one PDF
 *    node generate-pdfs.js --help
 *
 *  Prerequisites:
 *    npm install   (installs puppeteer, pdf-lib, chalk, commander, ora)
 *
 *  Then start a local server in another terminal:
 *    npx serve . -p 3000
 *
 *  And run this script:
 *    node generate-pdfs.js --merge
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const puppeteer  = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const { program } = require('commander');
const chalk      = require('chalk');
const ora        = require('ora');
const path       = require('path');
const fs         = require('fs');
const fsPromises = require('fs/promises');

// ── CLI ─────────────────────────────────────────────────────────
program
  .name('generate-pdfs')
  .description('Generate PDF versions of every page in the Donnie SM notes')
  .option('--page <slug>',  'Generate only this page (e.g. index, model-selection)')
  .option('--merge',        'Merge all individual PDFs into one combined PDF')
  .option('--base <url>',   'Base URL of the local server', 'http://localhost:3000')
  .option('--out <dir>',    'Output directory for PDFs',    './pdfs')
  .option('--format <fmt>', 'Paper format: A4 | Letter',    'A4')
  .option('--scale <n>',    'CSS scale factor (0.5 – 2)',   '0.85')
  .parse();

const opts = program.opts();

// ── Page catalogue ──────────────────────────────────────────────
const PAGES = [
  { slug: 'index',           title: 'Introduction',                  file: 'index.html'           },
  // ── Foundations ───────────────────────────────────────────────
  { slug: 'regression',      title: 'A — Linear Regression',         file: 'regression.html'      },
  { slug: 'logistic',        title: 'B — Logistic Regression',       file: 'logistic.html'        },
  { slug: 'random-effects',  title: 'C — Random Effects Models',     file: 'random-effects.html'  },
  { slug: 'glms',            title: 'D — Generalised Linear Models', file: 'glms.html'            },
  // ── Core chapters ─────────────────────────────────────────────
  { slug: 'model-selection', title: '1 — Model Selection',           file: 'model-selection.html' },
  { slug: 'beyond-glms',     title: '2 — Beyond GLMs',               file: 'beyond-glms.html'     },
  { slug: 'nonlinear',       title: '3 — Nonlinear Models',          file: 'nonlinear.html'        },
  { slug: 'latent',          title: '4 — Latent Variables',          file: 'latent.html'           },
  // ── Reference ─────────────────────────────────────────────────
  { slug: 'formulations',    title: 'Model Formulations (Reference)', file: 'formulations.html'    },
  { slug: 'key-readings',    title: 'Key Readings',                  file: 'key-readings.html'     },
  { slug: 'bibliography',    title: 'Bibliography',                  file: 'bibliography.html'     },
  // ── Labs ──────────────────────────────────────────────────────
  { slug: 'lab1',            title: 'Lab 1 — AIC & BIC',            file: 'lab1.html'             },
  { slug: 'lab2',            title: 'Lab 2 — Linear Mixed Models',  file: 'lab2.html'             },
];

// ── Helpers ─────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pdfPath(outDir, slug) {
  return path.join(outDir, `${slug}.pdf`);
}

// ── Wait for MathJax to finish rendering ────────────────────────
async function waitForMathJax(page) {
  try {
    await page.evaluate(() =>
      new Promise((resolve) => {
        if (window.MathJax && window.MathJax.startup) {
          window.MathJax.startup.promise.then(resolve).catch(resolve);
        } else {
          // No MathJax on this page — resolve immediately
          resolve();
        }
      })
    );
  } catch (_) { /* page may not have MathJax */ }
}

// ── Force light theme (PDFs are always light) ───────────────────
async function forceLightTheme(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
}

// ── Open all <details> elements so content is visible in PDF ────
async function expandDetails(page) {
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(d => { d.open = true; });
  });
}

// ── Inject PDF-specific CSS tweaks ──────────────────────────────
async function injectPrintCSS(page) {
  await page.addStyleTag({
    content: `
      /* Hide interactive chrome */
      #site-header, #sidebar, #toc-sidebar, #site-footer,
      .chapter-nav, #menu-toggle, #theme-toggle { display: none !important; }

      /* Full-width content */
      #layout { display: block !important; }
      #main-content { margin: 0 !important; }
      .content-wrapper {
        max-width: 100% !important;
        padding: 18mm 20mm 18mm 20mm !important;
      }

      /* Page breaks */
      h2 { page-break-before: auto; break-before: auto; }
      .callout, pre, .table-wrapper { page-break-inside: avoid; break-inside: avoid; }
      details[open] { page-break-inside: avoid; break-inside: avoid; }

      /* Typography */
      body { font-size: 10.5pt !important; line-height: 1.65 !important; }
      h1.page-title { font-size: 22pt !important; margin-top: 0 !important; }
      h2 { font-size: 14pt !important; }
      h3 { font-size: 12pt !important; }
      pre, code { font-size: 8.5pt !important; }

      /* Remove box shadows and transitions */
      * { box-shadow: none !important; transition: none !important; }

      /* Callout border override for print */
      .callout { border: 1px solid #ccc !important;
                 background: #fafafa !important; }
      .callout.theorem   { border-left: 4px solid #16a34a !important; }
      .callout.definition{ border-left: 4px solid #7c3aed !important; }
      .callout.example   { border-left: 4px solid #ca8a04 !important; }
      .callout.proof     { border-left: 4px solid #94a3b8 !important; }
      .callout.note      { border-left: 4px solid #2563eb !important; }
      .callout.warning   { border-left: 4px solid #d97706 !important; }
      .callout.solution  { border-left: 4px solid #16a34a !important; }

      /* Force all backgrounds to white */
      body, #main-content { background: white !important; }

      /* Running header via CSS counter */
      @page { margin: 18mm 20mm; }
    `
  });
}

// ── Generate one PDF ─────────────────────────────────────────────
async function generatePDF(browser, page_info, opts) {
  const url     = `${opts.base}/${page_info.file}`;
  const outFile = pdfPath(opts.out, page_info.slug);

  const spinner = ora({
    text: `  Rendering ${chalk.cyan(page_info.title)}...`,
    prefixText: '',
  }).start();

  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Navigate
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });

    // Prepare for print
    await forceLightTheme(page);
    await expandDetails(page);
    await waitForMathJax(page);
    await injectPrintCSS(page);

    // Small pause to let layout settle
    await new Promise(r => setTimeout(r, 800));

    // Print to PDF
    await page.pdf({
      path:             outFile,
      format:           opts.format,
      scale:            parseFloat(opts.scale),
      printBackground:  true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:8px;width:100%;padding:0 20mm;
                    display:flex;justify-content:space-between;color:#888;">
          <span>Donnie — Statistical Modelling</span>
          <span>${page_info.title}</span>
        </div>`,
      footerTemplate: `
        <div style="font-size:8px;width:100%;padding:0 20mm;
                    display:flex;justify-content:space-between;color:#888;">
          <span>donnie-sm-notes</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
      margin: { top: '22mm', bottom: '18mm', left: '0', right: '0' },
    });

    const size = (fs.statSync(outFile).size / 1024).toFixed(1);
    spinner.succeed(`  ${chalk.green('✔')} ${page_info.title} ${chalk.dim(`→ ${outFile} (${size} KB)`)}`);
    return outFile;

  } catch (err) {
    spinner.fail(`  ${chalk.red('✗')} ${page_info.title}: ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

// ── Merge all PDFs into one combined document ───────────────────
async function mergePDFs(pdfFiles, outDir) {
  const spinner = ora('Merging all PDFs into combined document...').start();
  try {
    const merged = await PDFDocument.create();

    // Add cover metadata
    merged.setTitle('Donnie — Statistical Modelling (Complete Notes)');
    merged.setAuthor('Donnie');
    merged.setSubject('Statistical Modelling — AIC, BIC, GLMs, Mixed Models, Nonlinear Models, EM Algorithm');
    merged.setKeywords(['statistics', 'modelling', 'AIC', 'BIC', 'mixed models', 'EM algorithm']);
    merged.setCreationDate(new Date());

    for (const file of pdfFiles) {
      if (!file || !fs.existsSync(file)) continue;
      const bytes = await fsPromises.readFile(file);
      const doc   = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }

    const mergedPath = path.join(outDir, 'donnie-statistical-modelling-complete.pdf');
    const mergedBytes = await merged.save();
    await fsPromises.writeFile(mergedPath, mergedBytes);
    const size = (fs.statSync(mergedPath).size / 1024).toFixed(0);
    spinner.succeed(`Merged PDF → ${chalk.bold(mergedPath)} (${size} KB, ${merged.getPageCount()} pages)`);
  } catch (err) {
    spinner.fail(`Merge failed: ${err.message}`);
  }
}

// ── Main ────────────────────────────────────────────────────────
(async () => {
  console.log(chalk.bold.blue('\n  Donnie — Statistical Modelling  ·  PDF Generator\n'));

  // Determine which pages to process
  let pages = PAGES;
  if (opts.page) {
    pages = PAGES.filter(p => p.slug === opts.page);
    if (pages.length === 0) {
      console.error(chalk.red(`Unknown page slug: "${opts.page}"`));
      console.log('Available slugs:', PAGES.map(p => p.slug).join(', '));
      process.exit(1);
    }
  }

  // Ensure output directory
  ensureDir(opts.out);
  console.log(chalk.dim(`  Output dir : ${path.resolve(opts.out)}`));
  console.log(chalk.dim(`  Base URL   : ${opts.base}`));
  console.log(chalk.dim(`  Format     : ${opts.format}  Scale: ${opts.scale}`));
  console.log(chalk.dim(`  Pages      : ${pages.length}\n`));

  // Launch browser (headless)
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  const generated = [];
  for (const pg of pages) {
    const file = await generatePDF(browser, pg, opts);
    if (file) generated.push(file);
  }

  await browser.close();

  // Merge?
  if (opts.merge && generated.length > 1) {
    console.log('');
    // Merge in catalogue order
    const orderedFiles = PAGES
      .map(p => pdfPath(opts.out, p.slug))
      .filter(f => generated.includes(f));
    await mergePDFs(orderedFiles, opts.out);
  }

  console.log(chalk.bold.green(`\n  Done. ${generated.length}/${pages.length} PDFs generated.\n`));
})();
