"""Browser-level financial workflow with mock cloud API. No live backend claims."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
P=Path(__file__).resolve().parents[1]
blank={"version":1,"demo":False,"business":{"name":"Invoice Test Ltd","email":"test@example.com","phone":"","address":"Nassau","taxId":"","logo":"","currency":"BSD","taxLabel":"VAT","taxRate":10,"invoicePrefix":"INV","estimatePrefix":"EST","nextInvoice":1001,"nextEstimate":1001,"website":"","paymentInstructions":"Bank transfer","terms":"Net 14"},"customers":[],"items":[],"documents":[],"expenses":[]}
with sync_playwright() as play:
 b=play.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page(viewport={'width':1280,'height':840},accept_downloads=True)
 p.set_default_timeout(4000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content('<div id="app"></div><style>'+ (P/'styles.css').read_text()+'</style>')
 p.evaluate("window.InvoiceCloud={initialState:"+json.dumps(blank)+",role:'owner',canEdit:()=>true,queueSave:(x)=>{window.saved=structuredClone(x);return true},syncLabel:()=> 'Saved to cloud',showMenu:()=>{}};")
 p.add_script_tag(path=str(P/'app.js'))
 p.locator('[data-page="customers"]').first.click()
 p.locator('[data-action="new-customer"]').first.click()
 p.locator('input[name="name"]').fill('Customer A')
 print('saving step');p.locator('[data-action="save-modal"]').first.click()
 p.locator('[data-action="new-invoice"]').first.click()
 p.locator('#doc-customer').select_option(label='Customer A')
 p.locator('[data-prop="description"]').first.fill('Website design')
 p.locator('[data-prop="qty"]').first.fill('2')
 p.locator('[data-prop="price"]').first.fill('150')
 p.locator('[data-doc="status"]').select_option('sent')
 assert 'BSD 330.00' in p.locator('#live-totals').inner_text().replace(chr(160),' '),p.locator('#live-totals').inner_text()
 print('saving step');p.locator('[data-action="save-modal"]').first.click()
 records=p.evaluate('window.saved')
 assert len(records['documents'])==1,records
 assert records['documents'][0]['number']=='INV-1001'
 p.locator('[data-page="invoices"]').first.click()
 print('preview step');p.locator('[data-action="preview"]').first.click()
 preview=p.locator('.doc-preview').inner_text()
 assert 'Net 14' in preview and 'Bank transfer' in preview
 print('add payment step');p.locator('[data-action="add-payment"]').first.click()
 p.locator('input[name="amount"]').fill('100')
 print('saving step');p.locator('[data-action="save-modal"]').first.click()
 assert 'BSD 230.00' in p.locator('.doc-preview').inner_text().replace(chr(160),' '),p.locator('.doc-preview').inner_text()
 p.locator('[data-action="close-modal"]').first.click()
 print('reports step');p.locator('[data-page="reports"]').first.click()
 r=p.locator('.report-totals').inner_text()
 assert 'BSD 100.00' in r.replace(chr(160),' ') and 'BSD 330.00' in r.replace(chr(160),' '),r
 p.locator('[data-report="type"]').select_option('collections')
 assert 'Customer A' in p.locator('.report-body').inner_text()
 assert errors==[],errors
 print('PASS: Invoice 2×150+10% tax=330, partial payment 100, outstanding 230, default terms, collections report.')
 b.close()