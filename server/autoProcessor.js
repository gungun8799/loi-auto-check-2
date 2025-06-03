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
    const alreadyProcessed = await checkIfFileExistsInFirebase(file);

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
    // === 🧠 Step 1: Extract raw OCR text only (no Gemini yet) ===
    const ocrForm = new FormData();
    ocrForm.append('file', fs.createReadStream(filePath));
    ocrForm.append('pages', 'all');

    const ocrRes = await axios.post('http://localhost:5001/api/extract-text-only', ocrForm, {
      headers: ocrForm.getHeaders(),
    });

    const ocrText = ocrRes.data?.text;
    if (!ocrText) throw new Error('No OCR text received from /api/extract-text-only');

    // === 🧠 Step 2: Classify contract type from OCR text ===
    const classifyRes = await axios.post('http://localhost:5001/api/contract-classify', {
      ocrText,
    });

    const contractType = classifyRes.data?.contractType || 'unknown';
    let promptKey = 'LOI_permanent_fixed_fields.txt';
    if (contractType === 'service_express') {
      promptKey = 'LOI_service_express_fields.txt';
    }

    console.log(`[🔍 Contract Type Detected] ${contractType}`);
    console.log(`[📌 Prompt selected based on contract type] ${promptKey}`);



    // === 🖥️ UI Puppeteer flow continues unchanged ===
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto('http://localhost:3001/ai-vision/loi-check', { waitUntil: 'networkidle2' });

    page.on('console', msg => console.log('[Browser log]', msg.text()));
    


    // 🧠 Force-select promptKey and dispatch change event
    await page.evaluate((promptKey) => {
      window.__injectedPromptKey = promptKey;
    }, promptKey);
    console.log('[✅ Using final promptKey]', promptKey);
    console.log('[📄 Uploading PDF]');
    const inputUploadHandle = await page.$('input[type="file"]');
    await inputUploadHandle.uploadFile(filePath);

    console.log('[🧠 Waiting for Extract button]');
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

    console.log('[⏳ Waiting 45s for frontend to auto-complete all steps]');
    await page.waitForTimeout(45000);
    let validationSaved = false;

    page.on('console', async (msg) => {
      const text = msg.text();
      console.log('[Browser log]', text);
    
      // ✅ Detect when validation is saved
      if (text.includes('Validation result saved for:')) {
        validationSaved = true;
      }
    });
    
    console.log('[⏳ Waiting for validation result to be saved]');
    
    const maxWaitMs = 60000;
    const pollInterval = 1000;
    let waited = 0;
    
    while (!validationSaved && waited < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }
    
    if (!validationSaved) {
      console.warn('[⚠️ Timeout] Validation not confirmed in logs after 60s');
    } else {
      console.log('[✅ Detected validation save log]');
    }
    
    await browser.close();
    
    if (validationSaved) {
      await delayedMove(filename, PASSED_FOLDER);
      return true;
    } else {
      await delayedMove(filename, FAILED_FOLDER);
      return false;
    }
  
  } catch (err) {
    console.error('[❌ Error during processing]', err.message || err);
    return false;
  }


  
}


async function checkIfFileExistsInFirebase(file) {
  return false;
}

export { processOneContract, processContractsInFolder, delayedMove };
