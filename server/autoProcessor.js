import puppeteer from 'puppeteer';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const FOLDER_PATH = path.join(process.cwd(), 'contracts');

// === 🔁 Create dated output folders ===
const now = new Date();
const dateFolder = now.toISOString().split('T')[0]; // Only date part: 'YYYY-MM-DD'
const OUTPUT_BASE = path.join(process.cwd(), 'processed', dateFolder);
const PASSED_FOLDER = path.join(OUTPUT_BASE, 'verification_passed');
const FAILED_FOLDER = path.join(OUTPUT_BASE, 'verification_failed');
const SKIPPED_FOLDER = path.join(OUTPUT_BASE, 'skipped');

for (const folder of [PASSED_FOLDER, FAILED_FOLDER, SKIPPED_FOLDER]) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`[📁 Folder Created] ${folder}`);
  }
}

async function processContractsInFolder() {
  const files = fs.readdirSync(FOLDER_PATH).filter(f => f.toLowerCase().endsWith('.pdf'));

  for (const file of files) {
    // ── 0) If the base name (without “.pdf”) does NOT match digits_(LO|LR)digits_digits, skip immediately ──
    const baseName = file.replace(/\.pdf$/i, '');
    const validPattern = /^\d+_(?:LO|LR)\d+_\d+$/;
    if (!validPattern.test(baseName)) {
      console.log(`[⏭️ Skip Invalid Filename] ${file} does not match expected pattern.`);
      // Optionally, move it to SKIPPED_FOLDER or just log and continue:
      // await delayedMove(file, SKIPPED_FOLDER);
      continue;
    }

    if (alreadyProcessed) {
      console.log(`[⏭️ Skip Confirmed] ${file} – already processed and up to date.`);
    
      const filePath = path.join(FOLDER_PATH, file);
      if (fs.existsSync(filePath)) {
        console.log(`[🧪 Moving skipped file] Calling delayedMove()`);
        await delayedMove(file, SKIPPED_FOLDER);
      } else {
        console.warn(`[⚠️ Skipped file not found] ${file} already missing from contracts folder.`);
      }
    
      continue;
    }

    console.log(`[📄 Processing] ${file}`);
    const success = await processOneContract(file);

    const destFolder = success ? PASSED_FOLDER : FAILED_FOLDER;
    await delayedMove(file, destFolder);

    console.log('[⏳] Waiting for 90 seconds before processing the next file...');
    await new Promise(resolve => setTimeout(resolve, 90000));
  }

  console.log('[✅] All files processed.');
}

async function delayedMove(filename, destinationFolder) {
  const src = path.join(FOLDER_PATH, filename);
  const dest = path.join(destinationFolder, filename);

  console.log(`[🕒 Waiting 3s before moving file] ${filename}`);
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    console.log(`[🛆 Attempting rename] ${src} → ${dest}`);
    await fsPromises.rename(src, dest);
    console.log(`[✅ File Moved] ${filename} → ${destinationFolder}`);
  } catch (err) {
    console.error(`[❌ Rename failed] ${filename}: ${err.message}`);
    try {
      await fsPromises.copyFile(src, dest);
      await fsPromises.unlink(src);
      console.log(`[✅ Fallback Copy+Delete] ${filename} → ${destinationFolder}`);
    } catch (copyErr) {
      console.error(`[❌ Fallback Copy+Delete failed] ${filename}: ${copyErr.message}`);
    }
  }
}

// Single file handler with internal file move logic
async function processOneContract(filename) {
  const filePath = path.join(FOLDER_PATH, filename);
  const contractNumberRaw = path.basename(filename, '.pdf');
  if (!fs.existsSync(filePath)) {
    console.error(`[❌ File Not Found] ${filePath}`);
    return false;
  }

  try {
    // ─── Step 1: OCR & contract‐type classification ──────────────────────
    const ocrForm = new FormData();
    ocrForm.append('file', fs.createReadStream(filePath));
    ocrForm.append('pages', 'all');

    const ocrRes = await axios.post('http://localhost:5001/api/extract-text-only', ocrForm, {
      headers: ocrForm.getHeaders(),
    });
    const ocrText = ocrRes.data?.text;
    if (!ocrText) throw new Error('No OCR text received from /api/extract-text-only');

    const classifyRes = await axios.post('http://localhost:5001/api/contract-classify', { ocrText });
    const contractType = classifyRes.data?.contractType || 'unknown';
    let promptKey = 'LOI_permanent_fixed_fields.txt';
    if (contractType === 'service_express') {
      promptKey = 'LOI_service_express_fields.txt';
    }
    console.log(`[🔍 Contract Type Detected] ${contractType}`);
    console.log(`[📌 Prompt selected based on contract type] ${promptKey}`);

    // ─── Step 2: Launch Puppeteer & navigate to our front-end ─────────────
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/ai-vision/loi-check', { waitUntil: 'networkidle2' });

    page.on('console', msg => console.log('[Browser log]', msg.text()));

    // Inject the prompt key so when the UI initializes it picks the right prompt
    await page.evaluate((pk) => {
      window.__injectedPromptKey = pk;
    }, promptKey);
    console.log('[✅ Using final promptKey]', promptKey);

    // ─── Step 3: “Extract” PDF so that LOIautocheck.js shows the Gemini JSON ───
    console.log('[📄 Uploading PDF]');
    const inputHandle = await page.$('input[type="file"]');
    await inputHandle.uploadFile(filePath);

    console.log('[🧠 Waiting for “Extract” button]');
    await page.waitForSelector('button', { visible: true, timeout: 10000 });

    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const label = await page.evaluate(el => el.innerText, btn);
      if (label.includes('Extract')) {
        await btn.click();
        console.log('[🚀 Triggered Extract]');
        break;
      }
    }

    // Wait the full 45 s so the front-end has time to finish all OCR→Gemini work
    console.log('[⏳ Waiting 45s for frontend to auto-complete “Extract”]');
        // ─── Replace the blind 45 s sleep with “wait until the Gemini JSON appears in a <pre>” ────────────────
    //
    console.log('[⏳ Waiting for Gemini output to appear in <pre>]');
    await page.waitForFunction(() => {
      // We assume LOIautocheck.js renders the “Gemini Output” inside a <pre> tag.
      const pres = Array.from(document.querySelectorAll('pre'));
      if (pres.length === 0) return false;
      // “trim” and check that it starts with “{” and ends with “}”
      return pres.some(el => {
        const t = el.innerText.trim();
        return t.startsWith('{') && t.endsWith('}');
      });
    }, { polling: 'mutation', timeout: 60000 });
    console.log('[✅ Gemini JSON now present]');

    // ─── Step 4: CLICK “Compare” and wait for compare_result to be saved ─────────
    console.log('[🖱️  Clicking “Compare” button]');
    // (Adjust this selector if your “Compare” button’s text is different)
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(el => el.innerText.trim() === 'Compare');
      if (btn) { btn.click(); }
    });

    // Now wait for the back-end that saves “compare_result” to Firestore:
    await page.waitForResponse(response =>
      response.url().endsWith('/api/save-compare-result')
      && response.status() === 200,
      { timeout: 45000 }
    );
    console.log('[✅ compare_result saved to Firestore]');

    // ─── Step 5: CLICK “Validate Document” and wait for validation_result──────
    console.log('[🖱️  Clicking “Validate Document” button]');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(el => el.innerText.trim().includes('Validate Document'));
      if (btn) { btn.click(); }
    });

    // Wait for the back-end endpoint that saves “validation_result”:
    await page.waitForResponse(response =>
      response.url().endsWith('/api/save-validation-result')
      && response.status() === 200,
      { timeout: 45000 }
    );
    console.log('[✅ validation_result saved to Firestore]');

    // ─── Step 6: METER CHECK (if your UI has a “Check Meters” button, click it) ─
    // Suppose your front-end has a “Check Meters” button that fires e.g. /api/meter-validate.
    // Adjust the selector text accordingly:
    console.log('[🖱️  Clicking “Check Meter” (UI) to trigger meter‐validation]');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(el => el.innerText.trim().includes('Check Meter'));
      if (btn) { btn.click(); }
    });

    // Wait for the back-end meter‐validation endpoint:
    await page.waitForResponse(response =>
      response.url().endsWith('/api/meter-validate')  // whatever your meter‐validate endpoint is
      && response.status() === 200,
      { timeout: 45000 }
    );
    console.log('[✅ Meter result saved to Firestore]');

    // ─── Step 7: Finally click “Web Validate” (if separate) or just trust that compare+validate suffice.
    // If you have a “Web Validate” button that calls /api/web-validate, do the same:
    console.log('[🖱️  Clicking “Web Validate” button]');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(el => el.innerText.trim().includes('Web Validate'));
      if (btn) { btn.click(); }
    });
    await page.waitForResponse(response =>
      response.url().endsWith('/api/web-validate')
      && response.status() === 200,
      { timeout: 45000 }
    );
    console.log('[✅ web_validate saved to Firestore]');

    // ─── Step 8: Close browser and return success ─────────────────────────────────
    console.log(`[✅ All Firestore writes for "${filename}" complete.]`);
    await browser.close();
    return true;

  } catch (err) {
    console.error('[❌ Error during processing]', err.message || err);
    // If anything in the above chain (extract→compare→validate→meter→web_validate) failed/timed out,
    // we close and return false so `processContractsInFolder` moves this PDF to “failed.”
    try { await browser.close(); } catch {}
    return false;
  }
}

async function checkIfFileExistsInFirebase(file) {
  return false;
}



export { processOneContract, processContractsInFolder, delayedMove };
