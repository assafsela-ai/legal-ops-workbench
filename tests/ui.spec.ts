import { test, expect } from '@playwright/test'

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test('public guided flow and source inspection at width ' + size.width, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('http://127.0.0.1:4179/')
    await page.getByRole('button', { name: 'Guided tour' }).click()
    await expect(page.getByText('Step 1 of 6')).toBeVisible()
    await page.getByRole('button', { name: /Northline AI terms/ }).click()
    await expect(page.getByRole('blockquote')).toContainText('Only Enterprise customers')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('del').last()).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('90 days, with 25% upfront')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('24 hours', { exact: true })).toBeVisible()
    await page.getByLabel('Customer plan').selectOption('Standard')
    await expect(page.getByText('72 hours', { exact: true })).toBeVisible()
    await page.getByLabel('Include Amendment A').uncheck()
    await expect(page.getByText('Amendment A is missing', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('May 31, 2027', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Add to task list' }).click()
    await expect(page.getByRole('button', { name: 'Task added' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Proposed retention').selectOption('180')
    await expect(page.getByText('Privacy approval needs a new review')).toBeVisible()
    await page.getByRole('button', { name: 'Finish' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width)
    await page.getByRole('button', { name: 'Reset demo' }).click()
    await expect(page.getByRole('heading', { name: 'AI Vendor Review' })).toBeVisible()
    await page.getByRole('button', { name: 'Promise Tracker' }).click()
    await expect(page.getByRole('button', { name: 'Add to task list' })).toBeEnabled()
  })
}

test('public live analysis sends sample evidence to Luna and verifies source quotes', async ({ page }) => {
  const key = 'sk-fictional-ui-fixture-key'
  let sends = 0
  await page.route('https://api.openai.com/v1/responses', async route => {
    sends++
    const request = route.request()
    const body = request.postDataJSON()
    expect(request.headers().authorization).toBe('Bearer ' + key)
    expect(body.model).toBe('gpt-6-luna')
    expect(body.store).toBe(false)
    expect(request.postData()).not.toContain(key)
    expect(body.input[1].content).toContain('Northline AI terms')
    await route.fulfill({ json: { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      findings: [{
        title: 'Plan-specific training terms', summary: 'The clause applies to Enterprise customers.', review: false,
        refs: [{ id: 'terms-3.2', quote: 'Only Enterprise customers are excluded from model training.' }],
        action: null, date: null, days: null, baseHours: null, amendmentHours: null, amendmentPlan: null,
      }, {
        title: 'Invented clause', summary: 'A claim that should be rejected.', review: false,
        refs: [{ id: 'terms-3.2', quote: 'Every customer is entitled to a refund.' }],
        action: null, date: null, days: null, baseHours: null, amendmentHours: null, amendmentPlan: null,
      }],
    }) }] }] } })
  })
  await page.goto('http://127.0.0.1:4179/')
  const live = page.getByRole('button', { name: 'Analyze live with OpenAI' })
  const dialog = page.getByRole('dialog')
  await live.click()
  await dialog.getByLabel('OpenAI API key').fill(key)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(sends).toBe(0)

  await live.click()
  await expect(dialog.getByLabel('OpenAI API key')).toHaveValue('')
  await dialog.getByText('Review the evidence and inputs being sent').click()
  await expect(dialog.locator('.payload')).toContainText('Northline AI terms')
  await dialog.getByLabel('OpenAI API key').fill(key)
  await dialog.getByRole('button', { name: 'Send and analyze' }).click()
  const findings = page.getByRole('region', { name: 'Findings' })
  await expect(findings.getByRole('heading', { name: 'Plan-specific training terms' })).toBeVisible()
  await expect(findings.getByRole('heading', { name: 'Invented clause' })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Live analysis · GPT-6 Luna')
  await findings.getByRole('button', { name: /Northline AI terms/ }).click()
  await expect(page.getByRole('blockquote')).toContainText('Only Enterprise customers')
  expect(sends).toBe(1)
  await page.getByRole('button', { name: 'Use saved results' }).click()
  await expect(page.getByRole('status')).toContainText('saved AI results')
})

test('public uploads stay in this tab and only selected document text is sent', async ({ page }) => {
  const quote = 'Only Enterprise customers are excluded from model training.'
  let calls = 0
  await page.route('https://api.openai.com/v1/responses', async route => {
    calls++
    const body = route.request().postDataJSON()
    const evidence = JSON.parse(body.input[1].content) as { sources: { id: string; label: string; text: string }[] }
    expect(body.model).toBe('gpt-6-luna')
    expect(evidence.sources.every(source => source.label.includes('Uploaded terms'))).toBeTruthy()
    const pdf = evidence.sources.find(source => source.text.includes(quote))
    expect(pdf?.label).toContain('Page 1')
    await route.fulfill({ json: { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      findings: [{ title: 'Uploaded terms finding', summary: 'The clause names enterprise plans.', review: false,
        refs: [{ id: pdf!.id, quote }], action: null, date: null, days: null, baseHours: null, amendmentHours: null, amendmentPlan: null,
      }],
    }) }] }] } })
  })
  await page.goto('http://127.0.0.1:4179/')
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const dialog = page.getByRole('dialog')
  await button('Use my documents').click()
  const add = async (file: string, title: string) => {
    await dialog.getByLabel('Document file').setInputFiles(file)
    await dialog.getByLabel('Document title').fill(title)
    await button('Add document').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('main').getByText(title, { exact: true })).toBeVisible()
  }
  await dialog.getByLabel('Document file').setInputFiles('tests/no-text.pdf')
  await button('Add document').click()
  await expect(dialog.getByRole('alert')).toContainText('without selectable text')
  await add('public/samples/msa.docx', 'Uploaded agreement')
  await button('Upload document').click()
  await add('public/samples/terms.pdf', 'Uploaded terms')
  await button('Review documents').click()
  await page.getByRole('checkbox', { name: /Uploaded agreement/ }).uncheck()
  await button('Analyze live with OpenAI').click()
  await dialog.getByText('Review the evidence and inputs being sent').click()
  await expect(dialog.locator('.payload')).toContainText(quote)
  await expect(dialog.locator('.payload')).not.toContainText('Uploaded agreement')
  expect(calls).toBe(0)
  await dialog.getByLabel('OpenAI API key').fill('sk-fictional-upload-fixture-key')
  await button('Send and analyze').click()
  const findings = page.getByRole('region', { name: 'Findings' })
  await expect(findings.getByRole('heading', { name: 'Uploaded terms finding' })).toBeVisible()
  await findings.getByRole('button', { name: /Uploaded terms/ }).click()
  await expect(page.getByRole('blockquote')).toContainText(quote)
  expect(calls).toBe(1)
  await button('Use sample case').click()
  await expect(page.getByText('Training exclusion applies to Enterprise only')).toBeVisible()
  await button('Use my documents').click()
  await button('Remove Uploaded terms').click()
  await expect(page.getByRole('main').getByText('Uploaded terms', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('main').getByText('Uploaded agreement', { exact: true })).toBeVisible()
})

test('local key entry, preview cancellation, persistence, and delete', async ({ page }) => {
  const caseName = 'Fictional UI test ' + Date.now()
  await page.goto('http://127.0.0.1:4180/')
  await page.getByRole('button', { name: 'New case' }).click()
  await page.getByLabel('Case name').fill(caseName)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Model settings' }).click()
  await page.getByLabel('OpenAI API key').fill('sk-test-browser-fixture-key')
  await page.getByRole('button', { name: 'Use this key' }).click()
  await page.getByRole('button', { name: 'Documents & playbook' }).click()
  await page.getByRole('button', { name: 'Upload version' }).click()
  await page.getByLabel('File', { exact: true }).setInputFiles('public/samples/msa.docx')
  await page.getByLabel('Document title').fill('Synthetic agreement')
  await page.getByLabel('Version label').fill('v1')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: /Synthetic agreement/ })).toBeVisible()
  await page.getByRole('button', { name: 'AI Vendor Review' }).click()
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('openai')
  await page.getByRole('button', { name: 'Preview cloud analysis' }).click()
  await expect(page.getByRole('dialog')).toContainText('OpenAI · gpt-6-luna')
  await expect(page.locator('.payload')).toContainText('within 72 hours')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Model settings' }).click()
  await page.getByRole('button', { name: 'Clear key' }).click()
  await page.reload()
  await page.getByRole('button', { name: caseName }).click()
  await page.getByRole('button', { name: 'Delete case' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete case' }).click()
  await expect(page.getByRole('button', { name: caseName })).toHaveCount(0)
})
