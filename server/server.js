// ===== server.js (Backend) =====
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import xlsx from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';



const FOLDER_PATH = path.join(process.cwd(), 'contracts');

// Support __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ✅ Store Puppeteer sessions for different systems
const browserSessions = new Map();
// Env and Express setup
dotenv.config();
const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json());


// Add this route for checking file metadata and saving to Firebase
app.post('/api/process-pdf-folder', async (req, res) => {
  const folderPath = path.join(__dirname, 'contracts');  // Replace with your folder path
  const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));

  const fileData = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    
    // Get last modified timestamp of the file
    const stats = fs.statSync(filePath);
    const lastModifiedTime = stats.mtime;  // Last modified time

    // Assuming contract_number is the name of the file without extension
    const contractNumber = path.basename(file, '.pdf');

    // Save to Firebase (file_check collection)
    await db.collection('file_check').doc(contractNumber).set({
      contract_number: contractNumber,
      last_modified_time: lastModifiedTime,
      contract_status: 'pending',  // Initially set as 'pending'
    });

    fileData.push({
      contract_number: contractNumber,
      last_modified_time,
      contract_status: 'pending',
    });
  }

  console.log('[File Check] Processed file data:', fileData);

  res.json({ success: true, files: fileData });
});

app.post('/api/fetch-next-pdf-to-process', async (req, res) => {
  try {
    // Fetch files ordered by last_modified_time (ascending)
    const snapshot = await db.collection('file_check')
      .where('contract_status', '==', 'pending')  // Only get pending files
      .orderBy('last_modified_time', 'asc')  // Order by the last modified time
      .limit(1)  // Get the oldest file that hasn't been processed yet
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ success: true, message: 'No files to process' });
    }

    const fileDoc = snapshot.docs[0];
    const fileData = fileDoc.data();

    // Update the status to 'in-progress'
    await fileDoc.ref.update({
      contract_status: 'in-progress',
    });

    console.log('[File Check] Next file to process:', fileData.contract_number);

    res.json({ success: true, fileData });
  } catch (err) {
    console.error('[File Check Error]', err);
    res.status(500).json({ success: false, message: 'Error fetching next file to process', error: err.message });
  }
});

app.post('/api/process-pdf', async (req, res) => {
  const { contractNumber, filePath } = req.body;

  try {
    // Open Puppeteer and navigate to the extraction page
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    // Navigate to the page containing the file extraction feature
    await page.goto('http://localhost:5001/extract-pdf'); // Adjust URL as needed

    // Simulate dragging the file into the file upload input area
    const inputElement = await page.$('input[type="file"]');
    await inputElement.uploadFile(filePath);  // Use the actual file path

    // Click the "Extract" button to start the extraction
    const extractButton = await page.$('button#extract');  // Adjust the selector as needed
    await extractButton.click();

    // Wait for the extraction to finish (you can set a timeout or wait for specific UI changes)
    await page.waitForSelector('#extraction-status', { visible: true });  // Adjust based on your UI

    console.log('[PDF Extract] Extraction finished for contract:', contractNumber);

    // Update the contract status in Firebase
    const fileDocRef = db.collection('file_check').doc(contractNumber);
    await fileDocRef.update({
      contract_status: 'completed',  // Set status to 'completed' after extraction
    });

    res.json({ success: true, message: `File processed: ${contractNumber}` });

    await browser.close();
  } catch (err) {
    console.error('[PDF Process Error]', err);
    res.status(500).json({ success: false, message: 'Error processing PDF', error: err.message });
  }
});


// Firebase Admin Init
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, './loi-checker-firebase-adminsdk-fbsvc-e5de01d327.json'), 'utf8')
);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Vision + Gemini
const visionClient = new ImageAnnotatorClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

app.post('/api/extract-text-only', upload.single('file'), async (req, res) => {
  console.log('Incoming request to /api/extract-text-only');

  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const selectedPagesRaw = req.body.pages || 'all';
  const selectedPages = selectedPagesRaw.toLowerCase() === 'all'
    ? []
    : selectedPagesRaw.split(',').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));

  const ext = path.extname(file.originalname).toLowerCase();
  const localFilePath = path.join(__dirname, file.path);
  const gcsPath = `uploaded/${file.originalname}`;
  await bucket.upload(localFilePath, { destination: gcsPath });
  const gcsUri = `gs://${bucket.name}/${gcsPath}`;
  let combinedText = '';

  try {
    if (ext === '.pdf') {
      const outputPrefix = `vision-output/${path.parse(file.originalname).name}_${Date.now()}/`;

      const request = {
        inputConfig: {
          gcsSource: { uri: gcsUri },
          mimeType: 'application/pdf',
        },
        outputConfig: {
          gcsDestination: { uri: `gs://${bucket.name}/${outputPrefix}` },
          batchSize: 5,
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      };
      if (selectedPages.length > 0) request.pages = selectedPages;

      console.log('[🔁 OCR] Starting asyncBatchAnnotateFiles...');
      const [operation] = await visionClient.asyncBatchAnnotateFiles({ requests: [request] });
      await operation.promise();
      console.log('[✅ OCR] asyncBatchAnnotateFiles completed');

      const [outputFiles] = await bucket.getFiles({ prefix: outputPrefix });

      for (const f of outputFiles) {
        if (!f.name.endsWith('.json')) continue;
        const [jsonData] = await f.download();
        const parsed = JSON.parse(jsonData.toString());
        const responses = parsed.responses || [];
        responses.forEach((page, i) => {
          const text = page.fullTextAnnotation?.text || '';
          combinedText += `\n\nFile: ${file.originalname} — Page ${i + 1}\n${text}`;
        });
      }
    } else {
      const [result] = await visionClient.documentTextDetection(localFilePath);
      const text = result.fullTextAnnotation?.text || '';
      combinedText += `\n\nFile: ${file.originalname}\n${text}`;
    }

    console.log('[📤 OCR Text Ready]');
    res.json({ success: true, text: combinedText });
  } catch (err) {
    console.error('[❌ OCR Extraction Error]', err);
    res.status(500).json({ message: 'OCR extraction failed', error: err.message });
  } finally {
    fs.unlinkSync(localFilePath);
  }
});


// ===== OCR Handler =====
app.post('/api/extract-text', upload.array('files'), async (req, res) => {
  console.log('Incoming request to /api/extract-text');
  const files = req.files;
  const promptKey = req.body.promptKey || 'LOI_permanent_fixed_fields';
  const selectedPagesRaw = req.body.pages || 'all';
  const selectedPages = selectedPagesRaw.toLowerCase() === 'all'
    ? []
    : selectedPagesRaw.split(',').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));

  if (!files?.length) {
    console.error('[❌ No files uploaded]');
    return res.status(400).json({ message: 'No files uploaded' });
  }

  const promptFilePath = path.join(__dirname, 'prompts', `${promptKey}.txt`);
  if (!fs.existsSync(promptFilePath)) {
    return res.status(400).json({ message: `Prompt template '${promptKey}' not found.` });
  }
  const promptTemplate = fs.readFileSync(promptFilePath, 'utf8');

  let combinedText = '';

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    const localFilePath = path.join(__dirname, file.path);
    const gcsPath = `uploaded/${file.originalname}`;
    await bucket.upload(localFilePath, { destination: gcsPath });
    const gcsUri = `gs://${bucket.name}/${gcsPath}`;

    if (ext === '.pdf') {
      const outputPrefix = `vision-output/${path.parse(file.originalname).name}_${Date.now()}/`;

      const request = {
        inputConfig: {
          gcsSource: { uri: gcsUri },
          mimeType: 'application/pdf',
        },
        outputConfig: {
          gcsDestination: { uri: `gs://${bucket.name}/${outputPrefix}` },
          batchSize: 5,
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      };
      if (selectedPages.length > 0) request.pages = selectedPages;

      console.log('[🔁 OCR] Starting asyncBatchAnnotateFiles...');
      const [operation] = await visionClient.asyncBatchAnnotateFiles({ requests: [request] });
      await operation.promise();
      console.log('[✅ OCR] asyncBatchAnnotateFiles completed');

      const [outputFiles] = await bucket.getFiles({ prefix: outputPrefix });
      let extracted = '';

      for (const f of outputFiles) {
        if (!f.name.endsWith('.json')) continue;
        const [jsonData] = await f.download();
        const parsed = JSON.parse(jsonData.toString());
        const responses = parsed.responses || [];
        responses.forEach((page, i) => {
          const text = page.fullTextAnnotation?.text || '';
          extracted += `\n\nFile: ${file.originalname} — Page ${i + 1}\n${text}`;
        });
      }

      combinedText += extracted;
    } else {
      const [result] = await visionClient.documentTextDetection(localFilePath);
      const text = result.fullTextAnnotation?.text || '';
      combinedText += `\n\nFile: ${file.originalname}\n${text}`;
    }

    console.log('[📥 Upload Check] Files received:', req.files?.length);
    fs.unlinkSync(localFilePath);
  }

  // === Gemini Processing ===
  const finalPrompt = `${promptTemplate}\n\nText:\n${combinedText}`;
  const geminiRes = await model.generateContent(finalPrompt);
  const geminiText = await geminiRes.response.text();

  // === Extract contract number ===
  let docId = 'unknown';
  try {
    const cleaned = geminiText.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed["Contract Number"]) {
      docId = parsed["Contract Number"].trim().replace(/\//g, '_');
    }
  } catch (err) {
    console.warn('[Firestore Save] Failed to extract contract number:', err.message);
  }

  // === Save to Firebase ===
  await db.collection('vision_results').doc(docId).set({
    timestamp: new Date(),
    extracted_text: combinedText,
    gemini_response: geminiText,
    prompt_key: promptKey,
  });

  console.log(`[📤 Firebase] Document saved as ID: ${docId}`);
  res.json({ success: true, text: combinedText, geminiOutput: geminiText });
});


// ===== Excel Sheet Upload - Get Sheet Names =====
app.post('/api/get-sheet-names', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const filePath = path.join(__dirname, file.path);
    const workbook = xlsx.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    const tempFileName = `${uuidv4()}_${file.originalname}`;
    const tempDest = path.join(__dirname, 'uploads', tempFileName);

    fs.renameSync(filePath, tempDest);
    res.json({ sheetNames, tempFileName });
  } catch (err) {
    console.error('Error getting sheet names:', err);
    res.status(500).json({ message: 'Failed to get sheet names', error: err.message });
  }
});

// ===== Excel Sheet Processor =====
app.post('/api/process-sheet', async (req, res) => {
  try {
    const { fileName, sheetName, promptKey = 'LOI_permanent_fixed_fields' } = req.body;
    const filePath = path.join(__dirname, 'uploads', fileName);

    const promptFilePath = path.join(__dirname, 'prompts', `${promptKey}.txt`);
    if (!fs.existsSync(promptFilePath)) {
      return res.status(400).json({ message: `Prompt template '${promptKey}' not found.` });
    }
    const promptTemplate = fs.readFileSync(promptFilePath, 'utf8');

    const workbook = xlsx.readFile(filePath);
    if (!workbook.Sheets[sheetName]) {
      return res.status(400).json({ message: `Sheet "${sheetName}" not found` });
    }

    const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const jsonString = JSON.stringify(jsonData, null, 2);

    const finalPrompt = `${promptTemplate}\n\nData:\n${jsonString}`;
    const geminiRes = await model.generateContent(finalPrompt);
    const geminiText = await geminiRes.response.text();

    // Attempt to extract Contract Number
    let contractId = 'unknown_excel_id';
    try {
      const match = geminiText.match(/"Contract Number"\s*:\s*"([^"]+)"/);
      if (match) contractId = match[1].replace(/\//g, '_');
      console.log('[📄 Excel Contract ID]', contractId);
    } catch (err) {
      console.warn('[⚠️ Could not extract contract number from Excel Gemini]', err.message);
    }

    await db.collection('excel_results').doc(contractId).set({
      timestamp: new Date(),
      raw_data: jsonString,
      gemini_response: geminiText,
      prompt_key: promptKey,
    });

    fs.unlinkSync(filePath);

    res.json({ success: true, table: jsonData, geminiOutput: geminiText });
  } catch (err) {
    console.error('Error in /api/process-sheet:', err);
    res.status(500).json({ message: 'Error processing sheet', error: err.message });
  }
});

// ===== Web Scraping =====
// ===== Web Scraping (Simplicity Internal Navigation) =====
// ... (existing imports & setup code remain unchanged)

app.post('/api/scrape-url', async (req, res) => {
  console.log('[Simplicity] Incoming request to /api/scrape-url');
  console.log('[Request Body]', req.body);

  try {
    const { systemType = 'simplicity', promptKey = 'LOI_permanent_fixed_fields', contractNumber } = req.body;

    if (!contractNumber) {
      console.error('[❌ No contract number provided]');
      return res.status(400).json({ message: 'Contract number is required' });
    }

    if (!browserSessions.has(systemType)) {
      console.error('[❌ Not logged in for system type]', systemType);
      return res.status(401).json({ message: 'Not logged in for Simplicity' });
    }

    const { browser, page } = browserSessions.get(systemType);
    const isLeaseOffer = contractNumber.includes('LO');
    const submenuText = isLeaseOffer ? 'Lease Offer' : 'Lease Renewal';

    console.log(`[Simplicity] Navigating Lease > ${submenuText}...`);
    await page.waitForSelector('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a', { timeout: 10000 });
    await page.click('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a');
    await page.mouse.click(5, 5);
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.evaluate(() => {
      const leaseMenu = [...document.querySelectorAll('a')].find(el => el.textContent.trim() === 'Lease');
      if (leaseMenu) leaseMenu.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const submenuClicked = await page.evaluate((submenuText) => {
      const links = [...document.querySelectorAll('a')];
      const target = links.find(el => el.textContent.trim() === submenuText);
      if (target) {
        target.click();
        return true;
      }
      return false;
    }, submenuText);

    if (!submenuClicked) {
      console.error(`❌ Could not click ${submenuText}`);
      throw new Error(`❌ Could not click ${submenuText}`);
    }

    console.log(`✅ ${submenuText} clicked`);
    await new Promise(resolve => setTimeout(resolve, 10000));

    let scrapedText = '';

    if (contractNumber) {
      console.log('[Simplicity] Searching for contract number:', contractNumber);
      await page.waitForSelector('iframe[name="frameBottom"]', { timeout: 70000 });
      const iframeHandle = await page.$('iframe[name="frameBottom"]');
      const frame = await iframeHandle.contentFrame();
      if (!frame) {
        console.error('❌ Could not access iframe content');
        throw new Error('❌ Could not access iframe content');
      }

      await frame.waitForSelector('#panel_SimpleSearch_c1', { visible: true, timeout: 70000 });
      console.log('[Simplicity] Typing and submitting contract number...');
      await frame.evaluate((contract) => {
        const input = document.querySelector('#panel_SimpleSearch_c1');
        input.value = contract;
        input.focus();
      }, contractNumber);

      console.log('[Simplicity] Clicking search <a> button...');
      await frame.waitForSelector('a#panel_buttonSearch_bt', { visible: true, timeout: 10000 });
      await frame.evaluate(() => {
        const btn = document.querySelector('a#panel_buttonSearch_bt');
        if (btn) btn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 15000));

      console.log('[Simplicity] Clicking view icon...');
      const viewButton = await frame.$('input[src*="view-black-16.png"]');
      if (!viewButton) {
        console.error('❌ View icon not found');
        throw new Error('❌ View icon not found');
      }
      await viewButton.click();

      const popupUrlMatch = contractNumber.includes('LO')
      ? 'leaseoffer/edit.aspx'
      : 'leaserenewal/edit.aspx';

      // Clean up leftover popups
      const oldPages = await browser.pages();
      for (const p of oldPages) {
        const url = p.url();
        if (url.includes('leaseoffer/edit.aspx') || url.includes('leaserenewal/edit.aspx')) {
          if (p !== page) await p.close();
        }
      }

      // Now wait for the new popup
      let popup;
      for (let i = 0; i < 15; i++) {
        const pages = await browser.pages();
        popup = pages.find(p => p.url().includes(popupUrlMatch) && p !== page);
        if (popup) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
}
    
    if (!popup) {
      console.error('❌ Popup window not found for:', popupUrlMatch);
      throw new Error('❌ Popup window not found');
    }




      await popup.bringToFront();
      await popup.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, { timeout: 60000 });

      await popup.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {
        console.warn('[⚠️ popup.waitForNavigation] Timeout or already loaded');
      });

      const encodedContract = encodeURIComponent(contractNumber);
      const popupUrl = `https://ppe-mall-management.lotuss.com/Simplicity-uat/modules/lease/leaseoffer/edit.aspx?ID=${encodedContract}&SEARCH=1`;
      console.log('[Simplicity] Final popup URL with params:', popupUrl);

      console.log('[Simplicity] Expanding all collapsible sections...');
      const collapsibleIds = [
        '#panelMonthlyCharge_label',
        '#panelOtherMonthlyCharge_label',
        '#panelGTO_label',
        '#LeaseMeterTypessArea_label',
        '#panelSecurityDeposit_label',
        '#panelOneTimeCharge_label'
      ];

      await new Promise(resolve => setTimeout(resolve, 10000));
      for (const selector of collapsibleIds) {
        try {
          const isCollapsed = await popup.$eval(selector, el => el.classList.contains('collapsible-panel-collapsed'));
          if (isCollapsed) {
            await popup.click(selector);
            console.log(`✅ Expanded: ${selector}`);
            await popup.waitForTimeout(7000);
          }
        } catch (err) {
          console.warn(`⚠️ Could not expand ${selector}:`, err.message);
        }
      }

      scrapedText = await popup.evaluate(() => document.body.innerText);
      console.log('[Simplicity] Scraped content:', scrapedText);

      const promptFilePath = path.join(__dirname, 'prompts', `${promptKey}.txt`);
      if (!fs.existsSync(promptFilePath)) {
        console.error(`[❌ Prompt template '${promptKey}' not found.`);
        return res.status(400).json({ message: `Prompt template '${promptKey}' not found.` });
      }

      const promptTemplate = fs.readFileSync(promptFilePath, 'utf8');
      const finalPrompt = `${promptTemplate}\n\nContent:\n${scrapedText}`;

      console.log('[Simplicity] Sending content to Gemini model...');
      const geminiRes = await model.generateContent(finalPrompt);
      const geminiText = await geminiRes.response.text();

      let contractId = contractNumber || 'unknown_scrape_id';
      let leaseType = '';
      let workflowStatus = '';
      let tenantType = '';

      try {
        const match = geminiText.match(/"Contract Number"\s*:\s*"([^"]+)"/);
        if (match) contractId = match[1].replace(/\//g, '_');

        const leaseTypeMatch = geminiText.match(/"Lease Type"\s*:\s*"([^"]+)"/);
        if (leaseTypeMatch) leaseType = leaseTypeMatch[1];

        const workflowStatusMatch = geminiText.match(/"Workflow status"\s*:\s*"([^"]+)"/);
        if (workflowStatusMatch) workflowStatus = workflowStatusMatch[1];

        const tenantTypeMatch = geminiText.match(/"Tenant Type"\s*:\s*"([^"]+)"/);
        if (tenantTypeMatch) tenantType = tenantTypeMatch[1];

        console.log('[📄 Scrape Contract ID]', contractId, '[Lease Type]', leaseType, '[Workflow Status]', workflowStatus);
      } catch (err) {
        console.warn('[⚠️ Could not extract fields from Scrape Gemini]', err.message);
      }

      await db.collection('compare_result').doc(contractId).set({
        timestamp: new Date(),
        contract_number: contractId,
        web_extracted: scrapedText,
        gemini_output: geminiText, // ✅ ADD THIS
        lease_type: leaseType,
        workflow_status: workflowStatus,
        tenant_type: tenantType,
      }, { merge: true });

      console.log(`[🔥 Firebase] Document saved to 'compare_result': ${contractId}`);

      res.json({ 
        success: true,
        raw: scrapedText,
        geminiOutput: geminiText,
        popupUrl
      });
    }
  } catch (err) {
    console.error('[Simplicity scrape-url error]', err);
    res.status(500).json({ message: 'Error during Simplicity navigation', error: err.message });
  }
});



app.post('/api/open-popup-tab', async (req, res) => {
  const { systemType = 'simplicity', contractNumber } = req.body;
  console.log('[🗭 Request] /api/open-popup-tab', { systemType, contractNumber });

  if (!contractNumber) return res.status(400).json({ message: 'Contract number required.' });

  try {
    let browser, page;

    if (!browserSessions.has(systemType)) {
      console.log('[🔑 Not logged in — triggering login using fixed credentials]');

      const puppeteer = await import('puppeteer');
      browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-fullscreen']
      });
      page = await browser.newPage();

      await page.goto('https://ppe-mall-management.lotuss.com/Simplicity-uat/apptop.aspx', {
        waitUntil: 'networkidle2',
      });

      await page.type('#login_UserName', 'TH40184213');
      await page.type('#login_Password', 'P@ssword12345');

      await Promise.all([
        page.click('#login_Login'),
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
      ]);

      const html = await page.content();
      const loginSuccessful = !html.includes('Invalid login');

      if (!loginSuccessful) {
        await browser.close();
        return res.status(401).json({ success: false, message: 'Invalid credentials during auto login.' });
      }

      browserSessions.set(systemType, { browser, page });
      console.log('[✅ Login successful via open-popup-tab flow]');
    } else {
      ({ browser, page } = browserSessions.get(systemType));
    }

    console.log('[📂 Navigating to Lease tab]');
    await page.waitForSelector('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a', { timeout: 10000 });
    await page.click('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a');
    await new Promise(r => setTimeout(r, 500));

    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Lease');
      if (el) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 2000));

    // 🔀 Conditional navigation
    const menuToClick = contractNumber.includes('LR') ? 'Lease Renewal' : 'Lease Offer';

    const clicked = await page.evaluate((menuText) => {
      const target = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === menuText);
      if (target) { target.click(); return true; }
      return false;
    }, menuToClick);

    if (!clicked) throw new Error(`❌ Could not click ${menuToClick}`);
    console.log(`[📎 Clicked submenu: ${menuToClick}]`);
    // Wait longer after clicking Lease Renewal to allow iframe content to load
    if (menuToClick === 'Lease Renewal') {
      console.log('[⏳ Waiting longer for Lease Renewal page to load]');
      await new Promise(resolve => setTimeout(resolve, 8000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Usual wait for Lease Offer
    }

    // Re-fetch iframe after navigation
    const iframeHandle = await page.waitForSelector('iframe[name="frameBottom"]', { timeout: 70000 });
    const frame = await iframeHandle.contentFrame();

    // Ensure the search bar is available
    await frame.waitForSelector('#panel_SimpleSearch_c1', { visible: true });

    await frame.waitForSelector('#panel_SimpleSearch_c1', { visible: true });
    await frame.evaluate((contract) => {
      const input = document.querySelector('#panel_SimpleSearch_c1');
      input.value = contract;
      input.focus();
    }, contractNumber);

    await frame.waitForSelector('a#panel_buttonSearch_bt', { visible: true });
    await frame.evaluate(() => document.querySelector('a#panel_buttonSearch_bt')?.click());
    await new Promise(r => setTimeout(r, 10000));

    const viewBtn = await frame.$('input[src*="view-black-16.png"]');
    if (!viewBtn) throw new Error('❌ View icon not found');
    await viewBtn.click();

    console.log('[📝 Waiting for popup tab...]');
    let popup;
    for (let i = 0; i < 10; i++) {
      const pages = await browser.pages();
      popup = pages.find(p => p.url().includes('leaseoffer/edit.aspx') && p !== page);
      if (popup) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    if (popup) {
      await popup.bringToFront();
      console.log('[✅ Popup tab opened and brought to front]');
    } else {
      console.warn('[⚠️ Popup tab not detected, may still be opening...]');
    }

    res.json({ success: true, message: `Popup triggered for ${menuToClick}. Please check Chrome tab.` });
  } catch (err) {
    console.error('[❌ /api/open-popup-tab error]', err);
    res.status(500).json({ message: err.message });
  }
});


// end of scrape logic
app.post('/api/scrape-login', async (req, res) => {
  const { systemType, username, password } = req.body;

  if (!systemType || systemType === 'others') {
    return res.status(200).json({ success: true, message: 'No login required for Others.' });
  }

  try {
    if (browserSessions.has(systemType)) {
      const old = browserSessions.get(systemType);
      await old.browser.close();
    }

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto('https://ppe-mall-management.lotuss.com/Simplicity-uat/apptop.aspx', {
      waitUntil: 'networkidle2',
    });

    await page.type('#login_UserName', username);
    await page.type('#login_Password', password);

    await Promise.all([
      page.click('#login_Login'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    const html = await page.content();
    const loginSuccessful = !html.includes('Invalid login');
    console.log(`[LOGIN] Simplicity login triggered for ${username}`);
    if (!loginSuccessful) {
      await browser.close();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    browserSessions.set(systemType, { browser, page });
    console.log('[Simplicity] Login successful.');
    return res.json({ success: true }); // ✅ No navigation or clicks here
    
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed', error: err.message });
  }
  console.log(`[SCRAPE] Starting scrape for contract: ${contractNumber}`);
console.log(`[SCRAPE] Puppeteer navigating...`);
console.log(`[SCRAPE] View icon clicked, waiting for popup...`);
console.log(`[SCRAPE] Popup loaded. Expanding all tabs...`);
console.log(`[SCRAPE] Extracting text from popup window...`);
console.log(`[SCRAPE] Scraping complete. Returning data.`);
  
});


// ===== Get Available Prompt Templates (.txt files) =====
app.get('/api/prompts', (req, res) => {
  const promptsDir = path.join(__dirname, 'prompts'); // assume ./prompts holds .txt files
  fs.readdir(promptsDir, (err, files) => {
    if (err) {
      console.error('Failed to read prompt directory:', err);
      return res.status(500).json({ message: 'Failed to read prompt templates' });
    }
    const promptKeys = files.filter(file => file.endsWith('.txt')).map(f => f.replace('.txt', ''));
    res.json({ promptKeys });
  });
});

// === Endpoint: Fetch latest gemini_response for selected sources ===
app.post('/api/fetch-latest-json', async (req, res) => {
  const { sources } = req.body;
  const collectionMap = {
    pdf: 'vision_results',
    web: 'scrape_results',  // Ensure that `scrape_results` is being used for the 'web' source
    excel: 'excel_results',
  };

  try {
    const results = {};

    for (const src of sources) {
      const collectionName = collectionMap[src];
      if (!collectionName) continue;

      const snapshot = await db
        .collection(collectionName)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0].data();
        console.log(`[Firebase doc for ${src}]`, doc);  // Log the full doc to check the structure

        // Check if gemini_response exists
        let geminiResponse = doc.gemini_response || '';  // Default to an empty string if missing
        if (!geminiResponse) {
          console.warn(`[Firebase] No gemini_response found for source: ${src}`);
        }

        // Clean and trim the response
        let cleaned = geminiResponse.trim();
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        results[src] = cleaned;
        console.log(`[Firebase Cleaned] ${src}: ${cleaned}`);
      } else {
        console.warn(`[Firebase] No document found for source: ${src}`);
        results[src] = null;
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Error fetching latest JSON:', err);
    res.status(500).json({ message: 'Failed to fetch JSON from Firebase', error: err.message });
  }
});

// === Existing Gemini Compare Endpoint ===
// === Existing Gemini Compare Endpoint ===
app.post('/api/gemini-compare', async (req, res) => {
  console.log('[👁️ HIT /api/gemini-compare]')
  const { formattedSources, promptKey = 'LOI_permanent_fixed_fields' } = req.body;

  // 🔍 Determine which compare prompt file to use based on contract type
  let comparePromptFile = 'LOI_permanent_fixed_fields_compare.txt';
  if (promptKey.includes('service_express')) {
    comparePromptFile = 'LOI_service_express_fields_compare.txt';
  }

  const promptPath = path.join(__dirname, 'prompts', comparePromptFile);

  if (!fs.existsSync(promptPath)) {
    return res.status(400).json({
      message: `Prompt comparison file not found: ${comparePromptFile}`,
    });
  }

  const promptTemplate = fs.readFileSync(promptPath, 'utf8');

  const sourcesString = Object.entries(formattedSources)
    .map(([key, json]) => `${key.toUpperCase()}: ${JSON.stringify(json, null, 2)}`)
    .join('\n\n');

  const finalPrompt = `${promptTemplate}\n\nSources:\n${sourcesString}`;

  try {
    const geminiRes = await model.generateContent(finalPrompt);
    const responseText = await geminiRes.response.text();
    res.json({ response: responseText });
  } catch (err) {
    res.status(500).json({ message: 'Gemini comparison failed', error: err.message });
  }
  console.log('[🧾 Final Gemini Compare Prompt]', finalPrompt);
});

// ===== Force Process Endpoint =====

app.post('/api/force-process-contract', async (req, res) => {
  const { contractNumber, promptKey = 'LOI_permanent_fixed_fields' } = req.body;

  if (!contractNumber) {
    return res.status(400).json({ message: 'Missing contractNumber in request body' });
  }

  try {
    const filePath = path.join(process.cwd(), 'contracts', `${contractNumber}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: `File not found: ${contractNumber}.pdf` });
    }

    console.log(`[⚡ FORCE PROCESS] Triggered for: ${contractNumber}`);
    await processOneContract(`${contractNumber}.pdf`, promptKey);

    res.json({ success: true, message: `Forced processing complete for ${contractNumber}` });
  } catch (err) {
    console.error('[❌ Force Process Error]', err);
    res.status(500).json({ success: false, message: 'Force processing failed', error: err.message });
  }
});


app.post('/api/store-compare-result', async (req, res) => {
  const { contractNumber, compareResult } = req.body;
  if (!contractNumber) return res.status(400).json({ message: 'Missing contractNumber' });

  try {
    const docId = contractNumber.replace(/\//g, '_');
    await db.collection('vision_results').doc(docId).set({
      compare_result: compareResult
    }, { merge: true });

    res.json({ success: true, message: 'Comparison result saved' });
  } catch (err) {
    console.error('[Firestore Compare Save Error]', err);
    res.status(500).json({ message: 'Failed to save compare result', error: err.message });
  }
});

//Web validation
app.post('/api/web-validate', async (req, res) => {
  try {
    const { contractNumber, extractedData, promptKey = 'default' } = req.body;

    if (!contractNumber || !extractedData || typeof extractedData !== 'object') {
      console.error('[Web Validation] Missing or invalid input:', req.body);
      return res.status(400).json({ message: 'Missing contractNumber or invalid extractedData' });
    }

    // === Load Validation Prompt Template ===
    const promptFilePath = path.join(__dirname, 'prompts', 'LOI_Sim_validation.txt');
    if (!fs.existsSync(promptFilePath)) {
      return res.status(400).json({ message: 'Validation prompt file not found.' });
    }

    const promptTemplate = fs.readFileSync(promptFilePath, 'utf8');
    const finalPrompt = `${promptTemplate}\n\nExtracted Data:\n${JSON.stringify(extractedData, null, 2)}`;

    // === Send to Gemini ===
    const geminiRes = await model.generateContent(finalPrompt);
    const geminiText = await geminiRes.response.text();

    // === Clean Gemini output ===
    let cleaned = geminiText.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleaned);
      if (!Array.isArray(parsedResult)) {
        throw new Error('Expected validation result to be an array');
      }
    } catch (err) {
      console.error('[❌ Web Validation Parsing Error]', err);
      return res.status(500).json({ message: 'Failed to parse Gemini web validation output', raw: geminiText });
    }

    // === Save to Firebase ===
    const docId = contractNumber.replace(/\//g, '_');
    await db.collection('compare_result').doc(docId).set({
      web_validation_result: parsedResult,
      updated_at: new Date()
    }, { merge: true });

    console.log(`[🔥 compare_result] Web validation result saved for: ${docId}`);
    res.json({ success: true, validationResult: parsedResult });
  } catch (err) {
    console.error('[❌ /api/web-validate Error]', err);
    res.status(500).json({ message: 'Web validation failed', error: err.message });
  }
});

// Attached Document validation
app.post('/api/validate-document', async (req, res) => {
  try {
    const { extractedData, promptKey = 'default' } = req.body;

    if (!extractedData || typeof extractedData !== 'object') {
      console.error('[Validation] Invalid extractedData:', extractedData);
      return res.status(400).json({ message: 'Invalid extracted data' });
    }

    // === Load Validation Prompt Template ===
    const promptFilePath = path.join(__dirname, 'prompts', 'LOI_Doc_validation.txt');
    if (!fs.existsSync(promptFilePath)) {
      return res.status(400).json({ message: 'Validation prompt file not found.' });
    }

    const promptTemplate = fs.readFileSync(promptFilePath, 'utf8');
    const finalPrompt = `${promptTemplate}\n\nExtracted Data:\n${JSON.stringify(extractedData, null, 2)}`;

    // === Send to Gemini ===
    const geminiRes = await model.generateContent(finalPrompt);
    const geminiText = await geminiRes.response.text();

    res.json({ validation: geminiText.trim() });
  } catch (err) {
    console.error('[Validation Error]', err);
    res.status(500).json({ message: 'Validation failed', error: err.message });
  }
});

// Function to sanitize JSON and remove null fields or any invalid commas
function sanitizeJson(data) {
  const sanitized = {};
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (value !== null && value !== undefined) {
      sanitized[key] = value; // Keep valid fields
    } else {
      sanitized[key] = ''; // Set missing or null fields to empty string to avoid invalid JSON
    }
  });
  return sanitized;
}

// End of Attached Document validation

app.post('/api/refresh-contract-status', async (req, res) => {
  const { contractNumber } = req.body;
  if (!contractNumber) return res.status(400).json({ message: 'Missing contractNumber' });

  try {
    const systemType = 'simplicity';
    let browser, page;

    if (!browserSessions.has(systemType)) {
      browser = await puppeteer.launch({ headless: false });
      page = await browser.newPage();

      await page.goto('https://ppe-mall-management.lotuss.com/Simplicity-uat/apptop.aspx', { waitUntil: 'networkidle2' });
      await page.type('#login_UserName', 'TH40184213');
      await page.type('#login_Password', 'P@ssword12345');
      await Promise.all([
        page.click('#login_Login'),
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
      ]);

      browserSessions.set(systemType, { browser, page });
    } else {
      ({ browser, page } = browserSessions.get(systemType));
    }

    // Navigate to Lease → LO or LR submenu
    const isLeaseOffer = contractNumber.includes('LO');
    const submenuText = isLeaseOffer ? 'Lease Offer' : 'Lease Renewal';

    await page.click('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a');
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate((submenuText) => {
      const menu = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === submenuText);
      if (menu) menu.click();
    }, submenuText);

    await new Promise(r => setTimeout(r, 10000));
    const iframeHandle = await page.waitForSelector('iframe[name="frameBottom"]', { timeout: 10000 });
    const frame = await iframeHandle.contentFrame();

    await frame.waitForSelector('#panel_SimpleSearch_c1');
    await frame.evaluate((contract) => {
      const input = document.querySelector('#panel_SimpleSearch_c1');
      input.value = contract;
      input.focus();
    }, contractNumber);

    await frame.evaluate(() => {
      document.querySelector('a#panel_buttonSearch_bt')?.click();
    });

    await new Promise(r => setTimeout(r, 8000));

    // Extract status from the correct column
    const statusXPath = isLeaseOffer
      ? '//*[@id="gridResults_gv"]/tbody/tr[2]/td[13]'
      : '//*[@id="gridResults_gv"]/tbody/tr[2]/td[12]';

    const statusText = await frame.evaluate((xpath) => {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue ? result.singleNodeValue.textContent.trim() : null;
    }, statusXPath);

    console.log(`[📘 REFRESH] ${contractNumber} → ${statusText}`);

    // Optional: Update Firestore
    const docId = contractNumber.replace(/\//g, '_');
    await db.collection('compare_result').doc(docId).set({
      refreshed_status: statusText,
      refreshed_at: new Date(),
    }, { merge: true });

    res.json({ success: true, status: statusText });
  } catch (err) {
    console.error('[❌ Refresh Status Error]', err);
    res.status(500).json({ message: 'Failed to refresh contract status', error: err.message });
  }
});

app.post('/api/store-validation-result', async (req, res) => {
  const { contractNumber, validationResult } = req.body;
  if (!contractNumber) return res.status(400).json({ message: 'Missing contractNumber' });

  try {
    const docId = contractNumber.replace(/\//g, '_');
    await db.collection('vision_results').doc(docId).set({
      document_validation: validationResult
    }, { merge: true });

    res.json({ success: true, message: 'Validation result saved' });
  } catch (err) {
    console.error('[Firestore Validation Save Error]', err);
    res.status(500).json({ message: 'Failed to save validation result', error: err.message });
  }
});

// === Save comparison and validation result under compare_result ===
app.post('/api/save-compare-result', async (req, res) => {
  const {
    contractNumber,
    compareResult,
    pdfGemini,
    webGemini,
    validationResult,
    popupUrl // ✅ New field added
  } = req.body;

  if (!contractNumber) {
    return res.status(400).json({ message: 'Missing contractNumber' });
  }

  try {
    const docId = contractNumber.replace(/\//g, '_');
    console.log('[Debug] Incoming save payload:', {
      contractNumber,
      compareResult,
      pdfGemini,
      webGemini,
      validationResult,
      popupUrl
    });
    await db.collection('compare_result').doc(docId).set({
      timestamp: new Date(),
      contract_number: contractNumber,
      pdf_extracted: pdfGemini,
      web_extracted: webGemini,
      compare_result: compareResult,
      validation_result: validationResult,
      popup_url: popupUrl || null
    }, { merge: true }); // ✅ ensure i
    console.log('[Firebase Save] Saving popup_url:', popupUrl);
    console.log(`[🔥 compare_result] Document saved: ${docId}`);
    res.json({ success: true, message: 'Comparison and validation result saved' });
  } catch (err) {
    console.error('[Firestore compare_result Save Error]', err);
    res.status(500).json({ message: 'Failed to save compare result', error: err.message });
  }
});

app.post('/api/save-extracted-data', async (req, res) => {
  try {
    const { contractNumber, geminiOutput, pdfData } = req.body;

    if (!contractNumber || !geminiOutput) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Save extracted data to Firebase or your database
    const docId = contractNumber.replace(/\//g, '_');
    await db.collection('extracted_data').doc(docId).set({
      contractNumber,
      geminiOutput,
      pdfData,
      timestamp: new Date(),
    });

    console.log(`[🔥 Firebase] Document saved as ID: ${docId}`);
    res.status(200).json({ success: true, message: 'Data saved successfully' });
  } catch (err) {
    console.error('[❌ Save Extracted Data Error]', err);
    res.status(500).json({ message: 'Error saving extracted data', error: err.message });
  }
});

app.post('/api/save-validation-result', async (req, res) => {
  const { contractNumber, validationResult } = req.body;

  if (!contractNumber || !validationResult) {
    return res.status(400).json({ message: 'Missing contractNumber or validationResult' });
  }

  try {
    const docId = contractNumber.replace(/\//g, '_');

    await db.collection('compare_result').doc(docId).set({
      validation_result: validationResult,
      updated_at: new Date()
    }, { merge: true });

    console.log(`[🔥 compare_result] Validation result saved for: ${docId}`);
    res.json({ success: true, message: 'Validation result saved to compare_result' });
  } catch (err) {
    console.error('[Firestore validation-only save error]', err);
    res.status(500).json({ message: 'Failed to save validation result', error: err.message });
  }
});

app.post('/api/update-lead-status', async (req, res) => {
  const { contractNumber, leadStatus } = req.body;

  if (!contractNumber || !leadStatus) {
    return res.status(400).json({ message: 'Missing contractNumber or leadStatus' });
  }

  try {
    const docId = contractNumber.replace(/\//g, '_');

    await db.collection('compare_result').doc(docId).set({
      lead_status: leadStatus,
      updated_at: new Date(),
    }, { merge: true });

    console.log(`[🔥 Lead Status] Updated lead_status for ${docId} to "${leadStatus}"`);
    res.json({ success: true, message: 'Lead status updated' });
  } catch (err) {
    console.error('[❌ Update Lead Status Error]', err);
    res.status(500).json({ message: 'Failed to update lead status', error: err.message });
  }
});

app.post('/api/web-validate', async (req, res) => {
  try {
    const { contractNumber, extractedData, promptKey = 'default' } = req.body;

    if (!contractNumber || !extractedData || typeof extractedData !== 'object') {
      console.error('[Web Validation] Missing or invalid input:', req.body);
      return res.status(400).json({ message: 'Missing contractNumber or invalid extractedData' });
    }

    // === Load Validation Prompt Template ===
    const promptFilePath = path.join(__dirname, 'prompts', 'LOI_Sim_validation.txt');
    if (!fs.existsSync(promptFilePath)) {
      return res.status(400).json({ message: 'Validation prompt file not found.' });
    }

    const promptTemplate = fs.readFileSync(promptFilePath, 'utf8');
    const finalPrompt = `${promptTemplate}\n\nExtracted Data:\n${JSON.stringify(extractedData, null, 2)}`;

    // === Send to Gemini ===
    const geminiRes = await model.generateContent(finalPrompt);
    const geminiText = await geminiRes.response.text();

    // === Clean Gemini output ===
    let cleaned = geminiText.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleaned);
      if (!Array.isArray(parsedResult)) {
        throw new Error('Expected validation result to be an array');
      }
    } catch (err) {
      console.error('[❌ Web Validation Parsing Error]', err);
      return res.status(500).json({ message: 'Failed to parse Gemini web validation output', raw: geminiText });
    }

    // === Save to Firebase ===
    const docId = contractNumber.replace(/\//g, '_');
    await db.collection('compare_result').doc(docId).set({
      web_validation_result: parsedResult,
      updated_at: new Date()
    }, { merge: true });

    console.log(`[🔥 compare_result] Web validation result saved for: ${docId}`);
    res.json({ success: true, validationResult: parsedResult });
  } catch (err) {
    console.error('[❌ /api/web-validate Error]', err);
    res.status(500).json({ message: 'Web validation failed', error: err.message });
  }
});

app.get('/api/get-compare-results', async (req, res) => {
  try {
    const snapshot = await db.collection('compare_result').orderBy('timestamp', 'desc').limit(100).get();
    
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[🔥 get-compare-results error]', err);
    res.status(500).json({ message: 'Failed to fetch compare results', error: err.message });
  }
});
// Endpoint to check if the file exists in the 'compare_result' collection
app.get('/api/check-file-exists', async (req, res) => {
  try {
    const { filename } = req.query; // Expect filename as query parameter

    if (!filename) {
      return res.status(400).json({ message: 'Filename is required' });
    }

    // Check if the file exists in the 'compare_result' collection
    const snapshot = await db.collection('compare_result')
      .where('contract_number', '==', filename)
      .get();

    if (!snapshot.empty) {
      return res.json({ success: true, message: 'File already processed', exists: true });
    } else {
      return res.json({ success: false, message: 'File not processed yet', exists: false });
    }
  } catch (err) {
    console.error('[❌ Error checking file existence]', err);
    res.status(500).json({ message: 'Error checking file existence', error: err.message });
  }
});

// New endpoint to check if the file exists in Firebase (compare_result collection)
app.get('/api/check-file-processed', async (req, res) => {
  const { filename } = req.query; // Get the filename from the query string
  
  if (!filename) {
    return res.status(400).json({ message: 'Filename is required' });
  }

  try {
    const contractNumber = filename.replace(/\//g, '_');  // Format filename (convert slashes to underscores)

    // Fetch the document from the 'compare_result' collection
    const docSnapshot = await db.collection('compare_result').doc(contractNumber).get();

    if (docSnapshot.exists) {
      // If the document exists, return a success response with true (indicating it's processed)
      res.json({ success: true, processed: true });
    } else {
      // If the document doesn't exist, return a success response with false (indicating it's not processed)
      res.json({ success: true, processed: false });
    }
  } catch (error) {
    console.error('[❌ Error checking file existence]', error);
    res.status(500).json({ message: 'Error checking file existence', error: error.message });
  }
});

app.post('/api/process-sharepoint-folder', async (req, res) => {
  const { folderUrl } = req.body;

  try {
    const files = await fetchFilesFromSharePoint(folderUrl); // Implement this function
    const newContracts = [];

    for (const file of files) {
      const contractNumber = path.basename(file.name, '.pdf');
      const docId = contractNumber.replace(/\//g, '_');

      const docExists = await db.collection('compare_result').doc(docId).get();
      if (docExists.exists) {
        console.log(`✅ Skipping already-processed contract: ${contractNumber}`);
        continue;
      }

      const fileBuffer = await downloadSharePointFile(file.downloadUrl); // implement this

      const tempFilePath = path.join(__dirname, 'uploads', `${contractNumber}.pdf`);
      fs.writeFileSync(tempFilePath, fileBuffer);

      newContracts.push({ contractNumber, tempFilePath });
    }

    res.json({ success: true, contracts: newContracts });
  } catch (err) {
    console.error('[SharePoint Processing Error]', err);
    res.status(500).json({ message: 'Failed to fetch files from SharePoint', error: err.message });
  }
});


import { processOneContract } from './autoProcessor.js';
import axios from 'axios';  // To call the /api/check-file-exists endpoint
import { delayedMove } from './autoProcessor.js';


app.post('/api/auto-process-pdf-folder', async (req, res) => {
  const FOLDER_PATH = path.join(process.cwd(), 'contracts');
  const files = fs.readdirSync(FOLDER_PATH).filter(f => f.toLowerCase().endsWith('.pdf'));
  const promptKey = req.body.promptKey || 'LOI_permanent_fixed_fields';

  // ✅ Use only the date for folder name
  const now = new Date();
  const dateOnly = now.toISOString().split('T')[0]; // e.g., '2025-05-10'
  const OUTPUT_BASE = path.join(process.cwd(), 'processed', dateOnly);
  const SKIPPED_FOLDER = path.join(OUTPUT_BASE, 'skipped');

  if (!fs.existsSync(SKIPPED_FOLDER)) {
    fs.mkdirSync(SKIPPED_FOLDER, { recursive: true });
    console.log(`[📁 Folder Created] ${SKIPPED_FOLDER}`);
  }

  if (!files.length) {
    return res.status(200).json({ success: false, message: 'No files to process.' });
  }

  let processedCount = 0;

  for (const file of files) {
    const fileNameWithoutExtension = path.basename(file, '.pdf');

    const alreadyProcessed = await checkIfFileExistsInFirebase(fileNameWithoutExtension);

    if (alreadyProcessed) {
      console.log(`[❌ Skipping] ${fileNameWithoutExtension} has already been processed.`);
      await delayedMove(file, SKIPPED_FOLDER); // ✅ Move skipped file as-is
      continue;
    }

    console.log(`[📄 Processing] ${fileNameWithoutExtension}`);
    await processOneContract(file, promptKey);
    processedCount++;

    console.log('[⏳] Waiting for 90 seconds before processing the next file...');
    await new Promise(resolve => setTimeout(resolve, 90000));
  }

  return res.json({ success: true, processedCount, message: 'Processing completed.' });
});

// Function to check if the file exists in the Firebase 'compare_result' collection
async function checkIfFileExistsInFirebase(filename) {
  const contractNumber = filename.replace(/\.pdf$/, '');
  const filePath = path.join(FOLDER_PATH, `${contractNumber}.pdf`);
  const docId = contractNumber.replace(/\//g, '_');

  try {
    // ✅ STEP 1: Check if exists in compare_result
    console.log(`[STEP 1] 🔍 Checking if ${docId} exists in compare_result...`);
    const existingDoc = await db.collection('compare_result').doc(docId).get();

    if (existingDoc.exists) {
      console.log(`[✅ STEP 1: Found] ${contractNumber} exists in compare_result.`);

      // ✅ STEP 2: Compare modified timestamp
      console.log(`[STEP 2] 🕒 Comparing modified time for ${contractNumber}...`);
      const fileModifiedTime = fs.statSync(filePath).mtime;

      const timestampRes = await axios.get('http://localhost:5001/api/check-file-timestamp', {
        params: { filename: contractNumber },
      });

      const { exists, updatedAt } = timestampRes.data;

      if (exists && updatedAt) {
        const firebaseDate = new Date(updatedAt);
        console.log(`[STEP 2] 🔄 File modified: ${fileModifiedTime.toISOString()} vs Firebase: ${firebaseDate.toISOString()}`);

        if (firebaseDate >= fileModifiedTime) {
          console.log(`[❌ Skipping] Firebase timestamp is newer or equal. ${contractNumber} already processed.`);
          return true;
        } else {
          console.log(`[⚠️ STEP 2: Firebase is older] Proceeding to check contract status.`);
        }
      } else {
        console.log(`[⚠️ STEP 2: No timestamp] Proceeding to check contract status.`);
      }
    } else {
      console.log(`[✅ STEP 1: Not found] ${contractNumber} not yet in compare_result. Skipping timestamp check.`);
    }

    // ✅ STEP 3: Check Simplicity contract status
    console.log(`[STEP 3] 📄 Checking Simplicity status for ${contractNumber}...`);
    const statusRes = await axios.post('http://localhost:5001/api/check-contract-status', { contractNumber });
    const contractStatus = statusRes.data?.status || '';

    console.log(`[STEP 3] 🔍 Contract status = "${contractStatus}"`);
    if (contractStatus.trim() !== 'Pending Verification') {
      console.log(`[🚫 Skipping] ${contractNumber} status is not 'Pending Verification'.`);
      return true;
    }

    console.log(`[✅ PASSED] ${contractNumber} ready for processing.`);
    return false;
  } catch (error) {
    console.error(`[❌ ERROR] ${contractNumber}:`, error.message);
    return false; // Fail-safe: continue processing
  }
}

app.post('/api/check-contract-status', async (req, res) => {
  const { contractNumber } = req.body;
  if (!contractNumber) return res.status(400).json({ message: 'Missing contractNumber' });

  try {
    const systemType = 'simplicity';
    let browser, page;

    if (!browserSessions.has(systemType)) {
      browser = await puppeteer.launch({ headless: false });
      page = await browser.newPage();

      await page.goto('https://ppe-mall-management.lotuss.com/Simplicity-uat/apptop.aspx', { waitUntil: 'networkidle2' });
      await page.type('#login_UserName', 'TH40184213');
      await page.type('#login_Password', 'P@ssword12345');
      await Promise.all([
        page.click('#login_Login'),
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
      ]);

      browserSessions.set(systemType, { browser, page });
    } else {
      ({ browser, page } = browserSessions.get(systemType));
    }

    // Step 1: Navigate to Lease menu
    await page.click('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a');
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const leaseMenu = [...document.querySelectorAll('a')].find(el => el.textContent.trim() === 'Lease');
      if (leaseMenu) leaseMenu.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Navigate to submenu
    const isLeaseOffer = contractNumber.includes('LO');
    const submenuText = isLeaseOffer ? 'Lease Offer' : 'Lease Renewal';
    const clicked = await page.evaluate((submenuText) => {
      const link = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === submenuText);
      if (link) {
        link.click();
        return true;
      }
      return false;
    }, submenuText);

    if (!clicked) {
      throw new Error(`❌ Could not click submenu: ${submenuText}`);
    }

    await new Promise(r => setTimeout(r, 5000));

    // Step 3: Wait for iframe and search
    const iframeHandle = await page.waitForSelector('iframe[name="frameBottom"]', { timeout: 15000 });
    const frame = await iframeHandle.contentFrame();

    await frame.waitForSelector('#panel_SimpleSearch_c1');
    await frame.evaluate((contract) => {
      const input = document.querySelector('#panel_SimpleSearch_c1');
      input.value = contract;
      input.focus();
    }, contractNumber);

    await frame.evaluate(() => {
      const btn = document.querySelector('a#panel_buttonSearch_bt');
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 10000));

    // Step 4: Extract correct status based on submenu type
    const statusXPath = isLeaseOffer
      ? '//*[@id="gridResults_gv"]/tbody/tr[2]/td[13]'
      : '//*[@id="gridResults_gv"]/tbody/tr[2]/td[12]';

    const statusText = await frame.evaluate((xpath) => {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue ? result.singleNodeValue.textContent.trim() : null;
    }, statusXPath);

    console.log(`[🔍 Contract Status] ${contractNumber}: "${statusText}"`);
    res.json({ success: true, status: statusText });
  } catch (err) {
    console.error('[❌ Contract Status Check Error]', err);
    res.status(500).json({ message: 'Failed to check contract status', error: err.message });
  }
});

// The /api/check-file-exists endpoint in your server (if not added already)
app.get('/api/check-file-exists', async (req, res) => {
  try {
    const { filename } = req.query; // Expect filename as query parameter

    if (!filename) {
      return res.status(400).json({ message: 'Filename is required' });
    }

    // Check if the file exists in the 'compare_result' collection
    const snapshot = await db.collection('compare_result')
      .where('contract_number', '==', filename)  // Use the contract number without .pdf
      .get();

    if (!snapshot.empty) {
      return res.json({ success: true, message: 'File already processed', exists: true });
    } else {
      return res.json({ success: false, message: 'File not processed yet', exists: false });
    }
  } catch (err) {
    console.error('[❌ Error checking file existence]', err);
    res.status(500).json({ message: 'Error checking file existence', error: err.message });
  }
});

app.get('/api/check-file-timestamp', async (req, res) => {
  try {
    const { filename } = req.query;

    if (!filename) {
      return res.status(400).json({ message: 'Filename (contract number) is required' });
    }

    // Query Firestore for the document with the matching contract number
    const snapshot = await db.collection('compare_result')
      .where('contract_number', '==', filename)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: false,
        exists: false,
        message: 'No matching document found'
      });
    }

    const doc = snapshot.docs[0].data();

    const updatedAt = doc.updated_at?.seconds
      ? new Date(doc.updated_at.seconds * 1000)
      : (doc.updated_at ? new Date(doc.updated_at) : null);

    if (!updatedAt) {
      return res.status(200).json({
        success: true,
        exists: true,
        updatedAt: null,
        message: 'Document found, but no updated_at field'
      });
    }

    return res.status(200).json({
      success: true,
      exists: true,
      updatedAt: updatedAt.toISOString(),
      message: 'Timestamp fetched successfully'
    });
  } catch (err) {
    console.error('[❌ Error in /api/check-file-timestamp]', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
});


app.post('/api/contract-classify', async (req, res) => {
  try {
    const { ocrText } = req.body;
    if (!ocrText) return res.status(400).json({ error: 'Missing OCR text' });

    const classifyPromptPath = path.join(__dirname, 'prompts', 'LOI_classify_prompt.txt');
    const promptTemplate = fs.readFileSync(classifyPromptPath, 'utf-8');

    const fullPrompt = `${promptTemplate.trim()}\n\n${ocrText.trim()}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();

    // Clean and parse
    let raw = text.trim();
    if (raw.startsWith('```json')) raw = raw.slice(7);
    if (raw.endsWith('```')) raw = raw.slice(0, -3);

    const jsonBlock = raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(jsonBlock);

    const contractType = parsed?.['Contract Type']?.trim();
    if (!contractType) throw new Error('No Contract Type found in Gemini output');

    res.json({ contractType });
  } catch (err) {
    console.error('[❌ Contract Classification Error]', err);
    res.status(500).json({ error: err.message });
  }
});
// ===== Server Start =====
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
