// downloadContracts.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import puppeteer from 'puppeteer';
import extract from 'extract-zip';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DOWNLOAD_XPATH = "//button[contains(normalize-space(.),'Download')]";

const SHARE_URL =
  'https://thlotuss.sharepoint.com/teams/LOI_autocheck/Shared%20Documents/Forms/AllItems.aspx'
  + '?id=%2Fteams%2FLOI%5Fautocheck%2FShared%20Documents%2FContracts'
  + '&newTargetListUrl=%2Fteams%2FLOI%5Fautocheck%2FShared%20Documents'
  + '&viewpath=%2Fteams%2FLOI%5Fautocheck%2FShared%20Documents%2FForms%2FAllItems%2Easpx';

const SP_USER = 'wisarut.gunjarueg@lotuss.com';
const SP_PASS = 'u@@U5410154';

const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads', 'sp_contracts');
const OUTPUT_DIR   = path.join(process.cwd(), 'contracts');

const DOWNLOAD_BTN =
  '#appRoot > div.Files.sp-App-root.has-footer.sp-App--hasLeftNav.sp-App-has-header.'
  + 'is-active.od-userSelect--enabled.sp-WebViewList-enable.sp-fullHeightLayouts'
  + ' > div > div > div > div > div > div.od-TopBar-item.od-TopBar-commandBar.'
  + 'od-TopBar-commandBar--suiteNavSearch > div > div > div > div > div > div > '
  + 'div.ms-OverflowSet.ms-CommandBar-primaryCommand.primarySet-515 > div:nth-child(3) > button';

  const DELETE_TOOLBAR_BTN =
  '#appRoot > div.Files.sp-App-root.has-footer.sp-App--hasLeftNav.sp-App-has-header' +
  '.sp-WebViewList-enable.sp-fullHeightLayouts > div.sp-App-bodyContainer > div.sp-App-body' +
  ' > div > div.Files-main > div.Files-mainColumn > div.Files-contentAreaFlexContainer' +
  ' > div > div > div > div > div > div.main_d84f6c3a.mainRelative_d84f6c3a.appMain_8e539932' +
  '.docLib_8e539932.with-breadcrumb.hasSelection_d84f6c3a.has-selection > div.commandBar_d84f6c3a' +
  ' > div > div > span.main_24bde817 > button:nth-child(3)';


async function run() {

    
  [DOWNLOAD_DIR, OUTPUT_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  const [page] = await browser.pages();

  // send downloads to our dir
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR
  });

  // 1) Go to SP
  await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded' });
  await sleep(5000);

  // 2) MS login
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.type('input[type="email"]', SP_USER, { delay: 50 });
  await sleep(5000);
  await Promise.all([
    page.click('input[type="submit"], button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {})
  ]);
  await sleep(5000);

  // 3) Corporate user
  await page.waitForSelector('input#username', { timeout: 5000 });
  await page.type('input#username', SP_USER, { delay: 50 });
  await sleep(5000);
  await Promise.all([
    page.click(
      '#root > div > div > div.sc-dymIpo.izSiFn > div.withConditionalBorder.sc-bnXvFD.izlagV ' +
      '> div.sc-jzgbtB.bIuYUf > form > div > div:nth-child(3) > div > button'
    ),
    //page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
  ]);
  await sleep(5000);

  // 4) Corporate pass
  await page.waitForSelector('input#password', { timeout: 5000 });
  await page.type('input#password', SP_PASS, { delay: 50 });
  await sleep(5000);
  await Promise.all([
    page.click(
      '#root > div > div > div.sc-dymIpo.izSiFn > div.withConditionalBorder.sc-bnXvFD.izlagV ' +
      '> div.sc-jzgbtB.bIuYUf > form > div > div:nth-child(4) > div > button'
    ),
    
    //page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
  ]);
  await sleep(5000);

  // verify
  const html = await page.content();
  if (html.includes('Invalid login')) {
    console.error('❌ Invalid credentials');
    await browser.close();
    process.exit(1);
  }
  console.log('✅ Login successful');
  await sleep(5000);
     // 5) Click Download (try CSS, then aria-label, then any “Download” text)
  let dlBtn = null;
  try {
    await page.waitForSelector(DOWNLOAD_BTN, { timeout: 5000 });
    dlBtn = await page.$(DOWNLOAD_BTN);
  } catch {
    dlBtn = null;
  }

  if (dlBtn) {
    await dlBtn.click();
    console.log('✅ Download clicked via CSS selector');
  } else {
    console.log('[Info] Fallback: looking for button[aria-label="Download"]');
    dlBtn = await page.$('button[aria-label="Download"]');
    if (dlBtn) {
      await dlBtn.click();
      console.log('✅ Download clicked via aria-label');
    } else {
      console.log('[Info] Final fallback: XPath “Download” text via evaluate');
      // wait until some button with text “Download” exists in the DOM
      await page.waitForFunction(() => {
        const xpath = "//button[contains(normalize-space(.),'Download')]";
        return !!document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
      }, { timeout: 10000 });
      // now actually click it
      await page.evaluate(() => {
        const xpath = "//button[contains(normalize-space(.),'Download')]";
        const btn = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
        if (!btn) throw new Error('Download button not found in fallback');
        btn.click();
      });
      console.log('✅ Download clicked via XPath evaluate');
    }
  }

  await sleep(2000);  // give SharePoint a moment to start the download

  // give SharePoint a moment
  await sleep(5000);

  // 6) Wait for zip
  console.log('⏳ Waiting for ZIP…');
  let zipPath;
  for (let i=0; i<60; i++) {
    const found = fs.readdirSync(DOWNLOAD_DIR).find(f => f.endsWith('.zip'));
    if (found) { zipPath = path.join(DOWNLOAD_DIR, found); break; }
    await sleep(1000);
  }
  if (!zipPath) throw new Error('ZIP didn’t arrive');
  console.log('✅ ZIP at', zipPath);
  await sleep(5000);

  // 7) Extract
  const temp = path.join(DOWNLOAD_DIR, 'extracted');
  if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true });
  fs.mkdirSync(temp, { recursive: true });
  await extract(zipPath, { dir: temp });
  console.log('✅ Extracted to', temp);
  await sleep(5000);

  // 8) Copy PDFs
  const walk = d => fs.readdirSync(d, { withFileTypes:true }).flatMap(e=>{
    const full=path.join(d,e.name);
    return e.isDirectory()? walk(full)
      : e.isFile()&&full.toLowerCase().endsWith('.pdf')?[full]:[];
  });
  const pdfs = walk(temp);
  for (const src of pdfs) {
    const dst = path.join(OUTPUT_DIR, path.basename(src));
    fs.copyFileSync(src,dst);
    console.log('→ Copied', path.basename(src));
    await sleep(5000);
  }

  // cleanup zip & extract
  fs.unlinkSync(zipPath);
  fs.rmSync(temp, { recursive:true });
  await sleep(5000);

    // … after copying PDFs to OUTPUT_DIR …

  // 8) Go back to SharePoint and delete each file you just downloaded
  await page.goto(SHARE_URL, { waitUntil: 'networkidle2' });
  await sleep(5000);

  for (const pdf of pdfs) {
    const fileName = path.basename(pdf);

    // 8.1) Click the row for this filename (broader selector + includes)
    await page.evaluate((name) => {
        // grab _all_ filename spans on the page
        const items = Array.from(document.querySelectorAll(
          'div.odsp-spartan-cell.field-LinkFilename-htmlGrid_1 span'
        ));
        // log them for debugging if you like:
        // console.log(items.map(el=>el.textContent.trim()));
        const match = items.find(el => el.textContent.trim().includes(name));
        if (!match) throw new Error(`Couldn’t find ${name} in list`);
        match.click();
      }, fileName);
      await sleep(5000);


    // … after selecting the row …
    await sleep(5000);

    const NEW_DELETE_BTN =
      '#appRoot > div.Files.sp-App-root.has-footer.is-active.od-userSelect--enabled.sp-WebViewList-enable.sp-fullHeightLayouts > ' +
      'div.sp-App-bodyContainer > div.sp-App-body > div > div.Files-main > div.Files-mainColumn > ' +
      'div.Files-contentAreaFlexContainer > div > div > div > div > div > div.main_d84f6c3a.mainRelative_d84f6c3a.' +
      'appMain_8e539932.docLib_8e539932.with-breadcrumb.hasSelection_d84f6c3a.has-selection > ' +
      'div.commandBar_d84f6c3a > div > div > span.main_24bde817 > button:nth-child(6) > span > span';
  
    // 8.2) Wait for the delete button to appear, then click it
    await page.waitForSelector(NEW_DELETE_BTN, { timeout: 30000 });
    await page.click(NEW_DELETE_BTN);
    await sleep(5000);
  
    // 8.3) Wait for and click any “YesButton*”
    const yesBtn = await page.waitForSelector('button[id^="YesButton"]', { timeout: 30000 });
    await yesBtn.click();
    await sleep(5000);

  console.log('🏁 Download, extract, copy and delete flow complete!');
}
}
run().catch(err=>{
  console.error('[ERROR]',err);
  process.exit(1);
});