const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildWiki, rewrite, pageName, listPages } = require('../../scripts/build-wiki');

const ROOT = path.join(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs');
const REPO = 'Installation-04/Techbase';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const ctx = (pages = ['Home', 'Installation']) => ({ repo: REPO, ref: 'main', pages, file: 'test.md' });

test('page names: README is Home, others keep their file name, capitalised', () => {
  assert.equal(pageName('README.md'), 'Home');
  assert.equal(pageName('readme.md'), 'Home');
  assert.equal(pageName('premiers-pas.md'), 'Premiers-pas');
  assert.equal(pageName('/x/docs/installation.md'), 'Installation');
});

test('links between pages lose their .md and keep their anchor', () => {
  assert.equal(rewrite('[a](installation.md#sauvegarde)', ctx()), '[a](Installation#sauvegarde)');
  assert.equal(rewrite('[a](README.md)', ctx()), '[a](Home)');
});

test('images point at the repository files, in markdown and in HTML', () => {
  const url = `https://raw.githubusercontent.com/${REPO}/main/docs/images/x.png`;
  assert.equal(rewrite('![t](images/x.png)', ctx()), `![t](${url})`);
  assert.equal(rewrite('<img src="images/x.png" width="10">', ctx()), `<img src="${url}" width="10">`);
});

test('links to files outside docs/ become links to the repository', () => {
  assert.equal(rewrite('[r](../README.md)', ctx()), `[r](https://github.com/${REPO}/blob/main/README.md)`);
  assert.equal(rewrite('[c](../CHANGELOG.md#x)', ctx()), `[c](https://github.com/${REPO}/blob/main/CHANGELOG.md#x)`);
});

test('external links and in-page anchors are left alone', () => {
  const text = '[a](https://example.com/x) [b](mailto:a@b.c) [c](#section)';
  assert.equal(rewrite(text, ctx()), text);
});

test('a link to a page that does not exist, or an unknown relative file, fails the build', () => {
  assert.throws(() => rewrite('[a](nope.md)', ctx()), /does not match any page/);
  assert.throws(() => rewrite('[a](scripts/x.sh)', ctx()), /don't know how to publish/);
});

test('the real docs/ build into a complete, self-consistent wiki', () => {
  const out = tmp('wiki-build-');
  try {
    const written = buildWiki(DOCS, out, REPO, 'main');
    const expectedPages = listPages(DOCS).map(pageName);
    assert.deepEqual(written, [...expectedPages, '_Sidebar']);
    assert.ok(fs.existsSync(path.join(out, 'Home.md')), 'a landing page');

    const sidebar = fs.readFileSync(path.join(out, '_Sidebar.md'), 'utf8');
    for (const page of expectedPages.filter(p => p !== 'Home')) assert.ok(sidebar.includes(`](${page})`), `sidebar lists ${page}`);

    for (const page of expectedPages) {
      const text = fs.readFileSync(path.join(out, `${page}.md`), 'utf8');
      assert.doesNotMatch(text, /\]\((\.\.\/|images\/|[\w-]+\.md)/, `${page}: no relative link left`);
      assert.doesNotMatch(text, /src="images\//, `${page}: no relative image left`);
      // every link to another page points at a page that exists
      for (const [, target] of text.matchAll(/\]\(([A-Za-z][\w-]*)(?:#[^)]*)?\)/g)) {
        assert.ok(expectedPages.includes(target), `${page}: link to missing page ${target}`);
      }
    }
    // every screenshot referenced exists in docs/images
    const all = expectedPages.map(p => fs.readFileSync(path.join(out, `${p}.md`), 'utf8')).join('\n');
    for (const [, image] of all.matchAll(/docs\/images\/([\w.-]+\.png)/g)) {
      assert.ok(fs.existsSync(path.join(DOCS, 'images', image)), `missing image ${image}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};
const hasGit = spawnSync('git', ['--version']).status === 0;

test('sync-wiki.sh pushes the pages, drops stale ones, and does nothing when up to date', { skip: !hasGit && 'git is required' }, () => {
  const base = tmp('wiki-sync-');
  try {
    // A local bare repository stands in for <repo>.wiki.git, with the first page a person creates by hand.
    const bare = path.join(base, 'wiki.git');
    git(base, 'init', '-q', '--bare', '--initial-branch=master', bare);
    const seed = path.join(base, 'seed');
    git(base, 'clone', '-q', bare, seed);
    fs.writeFileSync(path.join(seed, 'Home.md'), 'placeholder created in the web UI\n');
    fs.writeFileSync(path.join(seed, 'Old-page.md'), 'a page that no longer exists in docs/\n');
    git(seed, 'add', '-A');
    git(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'Initial Home page');
    git(seed, 'push', '-q', 'origin', 'HEAD:master');

    const work = path.join(base, 'work');
    git(base, 'clone', '-q', bare, work);
    const run = () => spawnSync('bash', [path.join(ROOT, 'scripts/sync-wiki.sh'), work, REPO, 'main'], { encoding: 'utf8' });

    const first = run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Wiki mis à jour/);

    const check = path.join(base, 'check');
    git(base, 'clone', '-q', bare, check);
    const files = fs.readdirSync(check).filter(f => f.endsWith('.md')).sort();
    assert.ok(files.includes('Installation.md') && files.includes('_Sidebar.md'));
    assert.ok(!files.includes('Old-page.md'), 'stale page removed');
    assert.doesNotMatch(fs.readFileSync(path.join(check, 'Home.md'), 'utf8'), /placeholder/);
    const afterFirst = git(check, 'rev-parse', 'HEAD');
    assert.match(git(check, 'log', '-1', '--format=%s'), /Synchronise le wiki avec docs\//);

    const second = run();
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /déjà à jour/);
    git(check, 'pull', '-q');
    assert.equal(git(check, 'rev-parse', 'HEAD'), afterFirst, 'no new commit when nothing changed');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('sync-wiki.sh refuses a directory that is not a git checkout', { skip: !hasGit && 'git is required' }, () => {
  const dir = tmp('wiki-notgit-');
  try {
    const result = spawnSync('bash', [path.join(ROOT, 'scripts/sync-wiki.sh'), dir], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /n'est pas un dépôt git/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
