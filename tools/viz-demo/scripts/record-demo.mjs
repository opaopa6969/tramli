import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const DURATION_MS = 15_000;
const OUTPUT_WEBM = new URL('../../docs/images/viz-demo.webm', import.meta.url).pathname;
const OUTPUT_MP4 = new URL('../../docs/images/viz-demo-twitter.mp4', import.meta.url).pathname;

async function main() {
  // Start server + demo
  console.log('[record] Starting viz server...');
  const server = spawn('npx', ['tsx', 'demo/simulator.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'pipe',
  });

  // Wait for server to be ready
  await new Promise((resolve) => {
    server.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('WebSocket listening')) resolve();
    });
    setTimeout(resolve, 5000); // fallback
  });

  // Start Vite dev server
  console.log('[record] Starting Vite...');
  const vite = spawn('npx', ['vite', '--host'], {
    cwd: new URL('../web', import.meta.url).pathname,
    stdio: 'pipe',
  });

  await new Promise((resolve) => {
    vite.stdout.on('data', (d) => {
      if (d.toString().includes('ready')) resolve();
    });
    setTimeout(resolve, 5000);
  });

  console.log('[record] Launching browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: '/tmp/viz-video', size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Let auto-spawner warm up for a few seconds
  await sleep(3000);

  // Spam Spawn Flow button to flood with fireballs
  console.log('[record] Spawning lots of flows...');
  for (let i = 0; i < 20; i++) {
    await page.click('text=Spawn Flow');
    await sleep(200);
  }

  console.log(`[record] Recording ${DURATION_MS / 1000}s...`);
  await sleep(DURATION_MS);

  // Close and save
  await page.close();
  const video = page.video();
  if (video) {
    await video.saveAs(OUTPUT_WEBM);
    console.log(`[record] Saved: ${OUTPUT_WEBM}`);
  }

  await context.close();
  await browser.close();

  // Convert to Twitter-compatible MP4 (H.264, AAC, ≤140s, ≤512MB)
  console.log('[record] Converting to Twitter MP4...');
  const { execSync } = await import('child_process');
  execSync(
    `ffmpeg -y -i "${OUTPUT_WEBM}" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart -an "${OUTPUT_MP4}"`,
    { stdio: 'inherit' },
  );
  console.log(`[record] Saved: ${OUTPUT_MP4}`);

  server.kill();
  vite.kill();
}

main().catch(e => { console.error(e); process.exit(1); });
