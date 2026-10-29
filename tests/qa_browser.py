from playwright.sync_api import sync_playwright
import json, pathlib, sys
PORT=8845
ROOT=f'http://127.0.0.1:{PORT}/'
blank = dict(version=1,demo=False,business=dict(name='Testing Co.',email='support@example.com',phone='+1 242 000 0000',address='Nassau, The Bahamas',taxId='TIN001',logo='',currency='BSD',taxLabel='VAT',taxRate=10,invoicePrefix='INV',estimatePrefix='EST',nextInvoice=1001,nextEstimate=1001,website='https://example.com',paymentInstructions='Pay by bank transfer.',terms='Due within 14 days.'),customers=[],items=[],documents=[],expenses=[])
mock = f'''window.InvoiceCloud={{initialState:{json.dumps(blank)},role:'owner',canEdit:()=>true,queueSave:(s)=>{{window.lastSaved=structuredClone(s);return true}},showMenu:()=>alert('Menu opens'),syncLabel:()=>"Saved to cloud"}};import('./app.js');'''
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1320,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<div id="app"></div><style>'+pathlib.Path('/mnt/data/pearsonquickbooks-build/styles.css').read_text()+'</style>')
    page.evaluate(mock.replace(";import('./app.js');",";"))
    page.add_script_tag(path='/mnt/data/pearsonquickbooks-build/app.js')
    page.wait_for_selector('text=Testing Co.',timeout=10000)
    page.screenshot(path='/mnt/data/pearsonquickbooks-build/qa-desktop.png',full_page=True)
    page.locator('[data-page="customers"]').first.click()
    page.locator('[data-action="new-customer"]').first.click()
    print('form labels',page.locator('#entry-form input').count())
    page.locator('input[name="name"]').fill('Oceanview Villas')
    page.locator('input[name="email"]').fill('hello@example.com')
    page.locator('[data-action="save-modal"]').first.click()
    assert page.locator('text=Oceanview Villas').count()>0
    page.locator('[data-action="new-invoice"]').first.click()
    print('invoice buttons',page.locator('[data-action="save-modal"]').count())
    page.screenshot(path='/mnt/data/pearsonquickbooks-build/qa-invoice-editor.png',full_page=True)
    page.locator('[data-action="close-modal"]').first.click()
    page.locator('[data-page="reports"]').first.click()
    page.screenshot(path='/mnt/data/pearsonquickbooks-build/qa-reports.png',full_page=True)
    assert page.locator('text=Accounts receivable aging').count()>0
    with page.expect_popup() as pop:
      page.locator('[data-action="print-report"]').first.click()
    popup=pop.value
    popup.wait_for_load_state('domcontentloaded')
    print('popup text',popup.content()[:450]); assert 'Income &amp; expenses summary' in popup.content()
    print('report printing popup', popup.url)
    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2)
    mobile.set_content('<div id="app"></div><style>'+pathlib.Path('/mnt/data/pearsonquickbooks-build/styles.css').read_text()+'</style>')
    mobile.evaluate(mock.replace(";import('./app.js');",";"))
    mobile.add_script_tag(path='/mnt/data/pearsonquickbooks-build/app.js')
    mobile.wait_for_selector('.metric-grid')
    mobile.screenshot(path='/mnt/data/pearsonquickbooks-build/qa-mobile.png',full_page=True)
    print('page_errors',errors)
    assert not errors, errors
    browser.close()