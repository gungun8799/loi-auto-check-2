from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # Set headless=False to see the browser
    page = browser.new_page()
    page.goto('https://www.example.com')  # Navigate to a simple page
    page.wait_for_timeout(5000)  # Wait for 5 seconds
    browser.close()