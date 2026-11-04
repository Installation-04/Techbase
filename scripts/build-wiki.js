#!/usr/bin/env node
// Turns docs/ into the files of a GitHub Wiki.
//
//   node scripts/build-wiki.js <docsDir> <outDir> [owner/repo] [ref]
//
// docs/ stays the single source (reviewed with the code). A GitHub Wiki differs in
// three ways, handled here:
//   - page names: README.md is the landing page (Home); "premiers-pas.md" becomes the
//     page "Premiers-pas" (the file name is the page name, without ".md" in links);
//   - links between pages are written without ".md" ([text](Installation#anchor));
//   - images are not copied into the wiki: they point at the files on the repository
//     (raw.githubusercontent.com), so there is a single copy.
const fs = require('fs');
const path = require('path');

// Order of the sidebar. Pages not listed here are appended alphabetically.
const ORDER = [
  'README', 'installation', 'premiers-pas', 'fiche-client', 'bons-de-service',
  'recherche-et-notifications', 'administration', 'versions-et-mises-a-jour', 'depannage',
];

function pageName(file) {
  const stem = path.basename(file, '.md');
  if (stem.toLowerCase() === 'readme') return 'Home';
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function rewriteTarget(target, ctx) {
  const { repo, ref, pages, file } = ctx;
  if (/^(https?:|mailto:|#)/i.test(target)) return target;
  const [pathPart, anchor] = target.split('#');
  const suffix = anchor ? `#${anchor}` : '';

  if (pathPart.startsWith('images/')) return `https://raw.githubusercontent.com/${repo}/${ref}/docs/${pathPart}`;

  if (pathPart.startsWith('../')) {
    return `https://github.com/${repo}/blob/${ref}/${pathPart.replace(/^(\.\.\/)+/, '')}${suffix}`;
  }

  if (pathPart.endsWith('.md')) {
    const name = pageName(pathPart);
    if (!pages.includes(name)) throw new Error(`${file}: link to "${target}" does not match any page of docs/`);
    return `${name}${suffix}`;
  }

  throw new Error(`${file}: don't know how to publish the relative link "${target}"`);
}

// Rewrites markdown links/images ](target) and HTML src="target".
function rewrite(content, ctx) {
  return content
    .replace(/\]\(([^)\s]+)\)/g, (m, target) => `](${rewriteTarget(target, ctx)})`)
    .replace(/\bsrc="([^"]+)"/g, (m, target) => `src="${rewriteTarget(target, ctx)}"`);
}

function listPages(docsDir) {
  const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
  const rank = f => {
    const i = ORDER.indexOf(path.basename(f, '.md'));
    return i === -1 ? ORDER.length : i;
  };
  return files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function titleOf(content, fallback) {
  const match = /^#\s+(.+)$/m.exec(content);
  return match ? match[1].trim() : fallback;
}

function buildWiki(docsDir, outDir, repo = 'Installation-04/Techbase', ref = 'main') {
  const files = listPages(docsDir);
  if (!files.length) throw new Error(`no .md page in ${docsDir}`);
  const pages = files.map(pageName);
  fs.mkdirSync(outDir, { recursive: true });

  const sidebar = ['**[Wiki TechIBase](Home)**', ''];
  files.forEach((file, i) => {
    const source = fs.readFileSync(path.join(docsDir, file), 'utf8');
    const out = rewrite(source, { repo, ref, pages, file });
    fs.writeFileSync(path.join(outDir, `${pages[i]}.md`), out);
    if (pages[i] !== 'Home') sidebar.push(`- [${titleOf(source, pages[i])}](${pages[i]})`);
  });
  sidebar.push('', `[Code source et releases](https://github.com/${repo})`);
  fs.writeFileSync(path.join(outDir, '_Sidebar.md'), sidebar.join('\n') + '\n');
  return [...pages, '_Sidebar'];
}

module.exports = { buildWiki, rewrite, pageName, listPages };

if (require.main === module) {
  const [docsDir, outDir, repo, ref] = process.argv.slice(2);
  if (!docsDir || !outDir) {
    console.error('usage: node scripts/build-wiki.js <docsDir> <outDir> [owner/repo] [ref]');
    process.exit(2);
  }
  try {
    const written = buildWiki(docsDir, outDir, repo, ref);
    console.log(`Wiki built in ${outDir}: ${written.join(', ')}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
