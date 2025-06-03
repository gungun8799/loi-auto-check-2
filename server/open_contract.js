app.post('/api/open-popup-tab', async (req, res) => {
    const { systemType = 'simplicity', contractNumber } = req.body;
    console.log('[🧭 Request] /api/open-popup-tab', { systemType, contractNumber });
  
    if (!contractNumber) return res.status(400).json({ message: 'Contract number required.' });
  
    try {
      let browser, page;
  
      if (!browserSessions.has(systemType)) {
        console.log('[🔑 Logging into Simplicity...]');
        const puppeteer = await import('puppeteer');
        browser = await puppeteer.launch({ headless: false });
        page = await browser.newPage();
  
        await page.goto('https://ppe-mall-management.lotuss.com/Simplicity-uat/applogin.aspx');
        await page.waitForSelector('#txtUserName', { timeout: 10000 });
        await page.type('#txtUserName', 'TH40184213');
        await page.type('#txtPassword', 'mailto:P@ssword12345');
        await page.click('#btnLogin');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
  
        browserSessions.set(systemType, { browser, page });
        console.log('[✅ Login complete]');
      } else {
        ({ browser, page } = browserSessions.get(systemType));
      }
  
      // Navigate Lease > Lease Offer
      console.log('[📂 Navigating to Lease Offer]');
      await page.waitForSelector('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a', { timeout: 10000 });
      await page.click('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a');
      await new Promise(r => setTimeout(r, 500));
  
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Lease');
        if (el) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      await new Promise(r => setTimeout(r, 2000));
  
      const clicked = await page.evaluate(() => {
        const target = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Lease Offer');
        if (target) { target.click(); return true; }
        return false;
      });
  
      if (!clicked) throw new Error('❌ Could not click Lease Offer');
      await new Promise(r => setTimeout(r, 10000));
  
      // Inside iframe
      const iframeHandle = await page.waitForSelector('iframe[name="frameBottom"]', { timeout: 30000 });
      const frame = await iframeHandle.contentFrame();
  
      await frame.waitForSelector('#panel_SimpleSearch_c1', { visible: true });
      await frame.evaluate((contract) => {
        const input = document.querySelector('#panel_SimpleSearch_c1');
        input.value = contract;
        input.focus();
      }, contractNumber);
  
      await frame.waitForSelector('a#panel_buttonSearch_bt', { visible: true });
      await frame.evaluate(() => document.querySelector('a#panel_buttonSearch_bt')?.click());
      await new Promise(r => setTimeout(r, 15000));
  
      const viewBtn = await frame.$('input[src*="view-black-16.png"]');
      if (!viewBtn) throw new Error('❌ View icon not found');
      await viewBtn.click();
  
      // Wait for popup
      console.log('[🧾 Waiting for popup tab...]');
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
  
      res.json({ success: true, message: 'Popup triggered. Please check Chrome tab.' });
    } catch (err) {
      console.error('[❌ /api/open-popup-tab error]', err);
      res.status(500).json({ message: err.message });
    }
  });