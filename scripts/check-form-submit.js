#!/usr/bin/env node
// Catches a real, recurring bug class documented at length in CLAUDE.md: a
// bare <form (ngSubmit)="..."> with no [formGroup] gets no ngSubmit output
// at all unless FormsModule is imported alongside ReactiveFormsModule —
// NgForm (the directive that actually intercepts the native 'submit' event,
// calls preventDefault(), and emits ngSubmit) only attaches itself to a
// <form> with neither [ngNoForm] nor [formGroup], and it's provided only by
// FormsModule. Angular's strict template checking doesn't catch a missing
// *event* binding the way it does a missing property one (any string is a
// legal event name to addEventListener for), so this compiles clean and
// silently falls through to a real native form submission — a page reload,
// with whatever confirm()/submitCount()/etc. method was meant to run never
// actually running. This exact shape has shipped as a live bug four
// separate times in this codebase (LockUserAccountModalComponent/
// SuspendOrganizationModalComponent/DeleteOrganizationModalComponent, then
// again independently in AuditDetailComponent's "Audit items" card) before
// finally being turned into this check.
//
// A plain text heuristic over each component's own template + its sibling
// .ts file's own `imports: [...]` array — not a real cross-file TS/template
// AST rule, which would need a custom multi-file ESLint rule of real
// complexity for one narrow, well-understood shape. Good enough for what
// this actually needs to catch. Run as part of `npm run lint` (see
// package.json), so it runs in CI automatically too — no separate step to
// remember.
const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const SRC_ROOT = path.join(__dirname, '..', 'src', 'app');
const SKIP_DIRS = new Set(['node_modules', '.angular', 'dist']);

function findComponentHtmlFiles(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        findComponentHtmlFiles(path.join(dir, entry.name), results);
      }
    } else if (entry.isFile() && entry.name.endsWith('.component.html')) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/** Every <form> tag in the template that binds (ngSubmit) but has neither
 *  [formGroup] (FormGroupDirective provides ngSubmit on its own, no
 *  FormsModule needed) nor [ngNoForm] (opts out of NgForm attaching at
 *  all, so (ngSubmit) wouldn't fire via this mechanism regardless). */
function findBareNgSubmitForms(html) {
  const formTagRegex = /<form\b[^>]*>/gs;
  const offenders = [];
  let match;
  while ((match = formTagRegex.exec(html)) !== null) {
    const tag = match[0];
    if (tag.includes('(ngSubmit)') && !tag.includes('[formGroup]') && !tag.includes('ngNoForm')) {
      offenders.push(tag.replace(/\s+/g, ' ').trim());
    }
  }
  return offenders;
}

function componentImportsFormsModule(tsSource) {
  const importsMatch = tsSource.match(/imports:\s*\[([^\]]*)\]/s);
  return !!importsMatch && /\bFormsModule\b/.test(importsMatch[1]);
}

function main() {
  const violations = [];

  for (const htmlFile of findComponentHtmlFiles(SRC_ROOT)) {
    const offenders = findBareNgSubmitForms(readFileSync(htmlFile, 'utf8'));
    if (offenders.length === 0) {
      continue;
    }

    const tsFile = htmlFile.replace(/\.html$/, '.ts');
    let tsSource;
    try {
      tsSource = readFileSync(tsFile, 'utf8');
    } catch {
      continue; // No sibling .ts file — not a component template.
    }

    if (!componentImportsFormsModule(tsSource)) {
      violations.push({ htmlFile, tsFile, offenders });
    }
  }

  if (violations.length > 0) {
    console.error('\nFound <form (ngSubmit)> template(s) with no [formGroup] and no FormsModule import:\n');
    for (const { htmlFile, tsFile, offenders } of violations) {
      console.error(`  ${path.relative(process.cwd(), htmlFile)}`);
      for (const offender of offenders) {
        console.error(`    ${offender}`);
      }
      console.error(`    -> import FormsModule alongside ReactiveFormsModule in ${path.relative(process.cwd(), tsFile)}`);
      console.error('');
    }
    console.error(
      "A bare <form (ngSubmit)> with no [formGroup] needs FormsModule imported (for NgForm) or " +
      "ngSubmit silently never fires and the form falls through to a real native submit/page reload " +
      "instead — see CLAUDE.md's own doc comments on LockUserAccountModalComponent/" +
      "AuditDetailComponent for the full story. This has shipped as a real bug four times already."
    );
    process.exitCode = 1;
    return;
  }

  console.log('check-form-submit: no <form (ngSubmit)> templates missing FormsModule.');
}

main();
