// fileMover.js

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

// ─── Fix for “__dirname” in ES modules ───────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Initialize Firebase Admin (adjust path to your service account JSON) ───────
const serviceAccount = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, './loi-checker-firebase-adminsdk-fbsvc-e5de01d327.json'),
    'utf8'
  )
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ─── Folder constants ──────────────────────────────────────────────────────────
const FOLDER_PATH = path.join(process.cwd(), 'contracts');
const now = new Date();
const dateFolder = now.toISOString().split('T')[0]; // "YYYY-MM-DD"
const OUTPUT_BASE = path.join(process.cwd(), 'processed', dateFolder);

const PASSED_FOLDER = path.join(OUTPUT_BASE, 'verification_passed');
const FAILED_FOLDER = path.join(OUTPUT_BASE, 'verification_failed');
const SKIPPED_FOLDER = path.join(OUTPUT_BASE, 'skipped');

// Create any missing output folders
for (const folder of [PASSED_FOLDER, FAILED_FOLDER, SKIPPED_FOLDER]) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`[📁 Folder Created] ${folder}`);
  }
}

/**
 * Moves `filename` from FOLDER_PATH → destinationFolder.
 * Waits 3 seconds, attempts a fs.rename; if that fails, falls back to copy+delete.
 */
async function delayedMove(filename, destinationFolder) {
  const src = path.join(FOLDER_PATH, filename);
  const dest = path.join(destinationFolder, filename);

  console.log(`   [🕒 Waiting 3s before moving "${filename}" → "${destinationFolder}"]`);
  await new Promise((r) => setTimeout(r, 3000));

  try {
    console.log(`   [🛆 Attempting rename: ${src} → ${dest}]`);
    await fsPromises.rename(src, dest);
    console.log(`   [✅ Moved] "${filename}" → ${destinationFolder}`);
  } catch (err) {
    console.error(`   [❌ Rename failed for "${filename}": ${err.message}]`);
    try {
      await fsPromises.copyFile(src, dest);
      await fsPromises.unlink(src);
      console.log(`   [✅ Fallback Copy+Delete] "${filename}" → ${destinationFolder}`);
    } catch (copyErr) {
      console.error(`   [❌ Fallback Copy+Delete failed for "${filename}": ${copyErr.message}]`);
    }
  }
}

/**
 * Fetches the Firestore document at /compare_result/<contractNumber> and applies
 * the same “isValid/compareValid” logic as LOIDashboard.js.  Returns:
 *   - "passed"  if both arrays exist and every row passes
 *   - "failed"  if both arrays exist but at least one row fails
 *   - null      if the document is missing or either array is missing
 */
async function fetchContractStatus(contractNumber) {
  const docId = contractNumber.replace(/\//g, '_');
  try {
    const docSnap = await db.collection('compare_result').doc(docId).get();
    if (!docSnap.exists) {
      console.log(`   [firestore] No document found for "${contractNumber}"`);
      return null;
    }

    const data = docSnap.data();
    console.log(`   [firestore] fetched data for "${contractNumber}":`, data);

    const valArr = Array.isArray(data.validation_result) ? data.validation_result : null;
    const compArr = Array.isArray(data.compare_result) ? data.compare_result : null;

    if (!valArr || !compArr) {
      console.log(
        `   [firestore] Missing validation_result or compare_result for "${contractNumber}"`
      );
      return null;
    }

    // LOIDashboard logic: 
    //   isValid  = all validation_result rows have valid === true
    //   compareValid = all compare_result rows have match === true
    const allPdfValid = valArr.every(row => row.valid === true);
    const allCompareMatch = compArr.every(row => row.match === true);

    if (allPdfValid && allCompareMatch) {
      return 'passed';
    } else {
      return 'failed';
    }
  } catch (err) {
    console.error(
      `   [firestore error] fetching/computing status for "${contractNumber}": ${err.message}`
    );
    return null;
  }
}

/**
 * Main loop: for each PDF in ./contracts:
 *   1) Fetch its “status” via fetchContractStatus()
 *   2) Move to verification_passed / verification_failed / skipped accordingly
 */
async function processContractsInFolder() {
  const files = fs
    .readdirSync(FOLDER_PATH)
    .filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (files.length === 0) {
    console.log('[ℹ️] No PDF files found in "contracts/". Exiting.');
    return;
  }

  for (const file of files) {
    const contractNumber = path.basename(file, '.pdf');
    console.log(`\n[📄 Checking] "${file}"…`);

    // ─── Step 1: Fetch status ("passed" / "failed" / null) ─────────────────────────
    const status = await fetchContractStatus(contractNumber);

    if (status === 'passed') {
      console.log(`   [✅] Determined as "passed" → moving to verification_passed`);
      await delayedMove(file, PASSED_FOLDER);

    } else if (status === 'failed') {
      console.log(`   [❌] Determined as "failed" → moving to verification_failed`);
      await delayedMove(file, FAILED_FOLDER);

    } else {
      console.log(
        `   [⚠️] "${file}" → could not determine “passed/failed” → moving to skipped`
      );
      await delayedMove(file, SKIPPED_FOLDER);
    }

    // ─── Step 2: Pause briefly before next file ────────────────────────────
    console.log('   [⏳] Waiting 5 seconds before next file…');
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log('[✅] All files processed.');
}

// ─── Run immediately ───────────────────────────────────────────────────────────
(async () => {
  try {
    await processContractsInFolder();
  } catch (err) {
    console.error('[❌] Unhandled error in processContractsInFolder():', err);
    process.exit(1);
  }
})();