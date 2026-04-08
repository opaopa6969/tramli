#!/usr/bin/env node
// dxe — DxE Suite CLI
// Usage:
//   npx dxe install          全toolkit をインストール
//   npx dxe install dge      DGE のみ
//   npx dxe install dde dre  DDE + DRE
//   npx dxe update           全toolkit をアップデート
//   npx dxe status           インストール済みバージョンを表示

const { execSync } = require('child_process');
const path = require('path');

// --- i18n ---
function detectLang(argv) {
  const flag = argv.find(a => a.startsWith('--lang='));
  if (flag) return flag.split('=')[1];
  const env = process.env.LANG || '';
  return (env.startsWith('en') || env === 'C' || env === 'POSIX') ? 'en' : 'ja';
}

const MESSAGES = {
  ja: {
    installing:  name => `\n[${name}] installing...`,
    updating:    name => `\n[${name}] updating...`,
    notInstalled:      'not installed',
    unknownToolkit:    name => `Unknown toolkit: ${name}`,
    agentHint:   (desc, phrase) => `  ${desc} → コーディングエージェントで ${phrase}`,
    help: `
  DxE Suite — DGE / DDE / DRE toolkit manager

  Usage:
    npx dxe install           全toolkit をインストール
    npx dxe install dge       DGE のみ
    npx dxe install dde dre   DDE + DRE
    npx dxe update            全toolkit をアップデート
    npx dxe status            インストール済みバージョンを表示
    `,
  },
  en: {
    installing:  name => `\n[${name}] installing...`,
    updating:    name => `\n[${name}] updating...`,
    notInstalled:      'not installed',
    unknownToolkit:    name => `Unknown toolkit: ${name}`,
    agentHint:   (desc, phrase) => `  ${desc} → tell your coding agent ${phrase}`,
    help: `
  DxE Suite — DGE / DDE / DRE toolkit manager

  Usage:
    npx dxe install           install all toolkits
    npx dxe install dge       DGE only
    npx dxe install dde dre   DDE + DRE
    npx dxe update            update all toolkits
    npx dxe status            show installed versions
    `,
  },
};

const TOOLKITS = {
  dge: {
    pkg: '@unlaxer/dge-toolkit', install: 'dge-install', update: 'dge-update',
    desc: { ja: '会話劇で設計の gap を抽出', en: 'extract design gaps via dialogue' },
    phrase: { ja: '「DGE して」', en: '"run DGE"' },
  },
  dde: {
    pkg: '@unlaxer/dde-toolkit', install: 'dde-install', update: 'dde-update',
    desc: { ja: 'ドキュメントの穴を補完',    en: 'fill documentation deficits' },
    phrase: { ja: '「DDE して」', en: '"run DDE"' },
  },
  dre: {
    pkg: '@unlaxer/dre-toolkit', install: 'dre-install', update: 'dre-update',
    desc: { ja: 'rules/skills を配布・管理', en: 'distribute & manage rules/skills' },
    phrase: { ja: '「DRE して」', en: '"run DRE"' },
  },
};

const rawArgs = process.argv.slice(2);
const lang = detectLang(rawArgs);
const M = MESSAGES[lang] || MESSAGES.ja;

// Strip --lang=* from args before parsing command/targets
const cleanArgs = rawArgs.filter(a => !a.startsWith('--lang='));
const [command, ...targets_] = cleanArgs;
const targets = targets_.length > 0 ? targets_ : Object.keys(TOOLKITS);

function run(cmd, extraEnv) {
  console.log(`\n  → ${cmd}`);
  const env = extraEnv ? { ...process.env, ...extraEnv } : undefined;
  execSync(cmd, { stdio: 'inherit', ...(env && { env }) });
}

if (command === 'install') {
  const installed = [];
  for (const name of targets) {
    const tk = TOOLKITS[name];
    if (!tk) { console.error(M.unknownToolkit(name)); process.exit(1); }
    console.log(M.installing(name.toUpperCase()));
    run(`npm install ${tk.pkg}@latest`);
    run(`npx ${tk.install}`, { DXE_LANG: lang });
    installed.push(tk);
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const tk of installed) {
    console.log(M.agentHint(tk.desc[lang], tk.phrase[lang]));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
} else if (command === 'update') {
  for (const name of targets) {
    const tk = TOOLKITS[name];
    if (!tk) { console.error(M.unknownToolkit(name)); process.exit(1); }
    console.log(M.updating(name.toUpperCase()));
    run(`npm install ${tk.pkg}@latest`);
    run(`npx ${tk.update}`, { DXE_LANG: lang });
  }
} else if (command === 'status') {
  for (const [name, tk] of Object.entries(TOOLKITS)) {
    try {
      const pkg = require(path.join(process.cwd(), 'node_modules', tk.pkg, 'package.json'));
      console.log(`  ${name.toUpperCase()}: ${pkg.version}`);
    } catch {
      console.log(`  ${name.toUpperCase()}: ${M.notInstalled}`);
    }
  }
} else {
  console.log(M.help);
}
