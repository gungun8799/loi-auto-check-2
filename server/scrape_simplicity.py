from playwright.sync_api import sync_playwright
import time

def scrape_simplicity(contract_number):
    with sync_playwright() as p:
        print("[Python] Launching Chromium browser...")
        browser = p.chromium.launch(headless=False)  # Launch browser in visible mode
        page = browser.new_page()

        # Navigate to the page and login
        print("[Python] Navigating to Simplicity...")
        page.goto('https://ppe-mall-management.lotuss.com/Simplicity-uat/apptop.aspx')
        time.sleep(3)  # Wait for page to load

        print("[Python] Filling login credentials...")
        page.fill('#login_UserName', 'TH40184213')
        page.fill('#login_Password', 'P@ssword12345')
        page.click('#login_Login')
        time.sleep(10)  # Wait for login to complete

        # === Navigate to Lease > Lease Offer ===
        print("[Python] Navigating Lease > Lease Offer...")
        page.wait_for_selector('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a', timeout=10000)
        page.click('#menu_MenuLiteralDiv > ul > li:nth-child(10) > a')
        page.mouse.click(5, 5)  # Click at position (5, 5) to close any dropdowns
        time.sleep(1)  # Wait for menu to expand

        # === Click empty space to close any open dropdown ===
        print("[Python] Clicking empty space to close any dropdowns...")
        page.evaluate("document.querySelector('body').click()")
        time.sleep(2)  # Wait a moment to make sure the dropdown is closed
        
        
        # === Wait for the 'LO' link to appear and click it ===
        print("[Python] Waiting for 'LO' element to be visible and clickable...")
        page.wait_for_selector('#form1 > div.holder > ul:nth-child(3) > li:nth-child(4) > a > span.function-code', timeout=10000)
        
        # Click the 'LO' element with the provided CSS selector
        page.click('#form1 > div.holder > ul:nth-child(3) > li:nth-child(4) > a > span.function-code')

        time.sleep(10)  # Wait for Lease Offer page to load

        if contract_number:
            # Searching for the contract number in the iframe
            print(f"[Python] Searching for contract number {contract_number}...")
            page.wait_for_selector('iframe[name="frameBottom"]', timeout=30000)
            iframe = page.frame(name="frameBottom")
            iframe.fill('#panel_SimpleSearch_c1', contract_number)

            print("[Python] Clicking search button...")
            iframe.click('a#panel_buttonSearch_bt')
            time.sleep(15)  # Wait for search results

            # Click the view icon to open the lease offer
            print("[Python] Clicking view icon to open lease offer...")
            view_button = iframe.query_selector('input[src*="view-black-16.png"]')
            if view_button:
                view_button.click()
            else:
                print("❌ View icon not found")
                return "Error: View icon not found"

            # Wait for the popup to appear
            print("[Python] Waiting for popup window...")
            time.sleep(10)  # Wait 10 seconds for popup to appear

            # Locate the popup page and bring it to the front
            popup = None
            for context in browser.contexts:
                for p in context.pages:
                    if "leaseoffer/edit.aspx" in p.url():
                        popup = p
                        break
                if popup:
                    break

            if not popup:
                print("❌ Popup window not found")
                return "Error: Popup window not found"

            print("[Python] Bringing popup to front...")
            popup.bring_to_front()
            time.sleep(10)  # Wait for the popup to fully load
            popup.wait_for_function("document.body && document.body.innerText.trim().length > 0", timeout=60000)

            # Expand all collapsible sections
            print('[Python] Expanding all collapsible sections...')
            collapsible_selectors = [
                '#panelMonthlyCharge_label',
                '#panelOtherMonthlyCharge_label',
                '#panelGTO_label',
                '#LeaseMeterTypessArea_label',
                '#panelSecurityDeposit_label',
                '#panelOneTimeCharge_label'
            ]
            for selector in collapsible_selectors:
                try:
                    is_collapsed = popup.query_selector(f'{selector}.collapsible-panel-collapsed')
                    if is_collapsed:
                        popup.click(selector)
                        print(f"✅ Expanded: {selector}")
                        time.sleep(1)  # Wait between clicks
                except Exception as e:
                    print(f"⚠️ Could not expand {selector}: {e}")

            # Scrape the data from the popup window
            print("[Python] Scraping data from popup...")
            scraped_text = popup.inner_text('body')
            print("[Python] Scraping complete.")

        else:
            print("[Python] No contract number. Scraping current page...")
            scraped_text = page.inner_text('body')

        return scraped_text

# Example usage:
if __name__ == '__main__':
    contract_number = '5004_LO2502_00014'  # Replace with actual contract number
    scraped_data = scrape_simplicity(contract_number)
    print(scraped_data)  # Output the scraped data