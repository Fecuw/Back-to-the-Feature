import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const errors = []

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => errors.push(`page: ${error.message}`))

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '調査を開始' }).first().click()
await page.getByText('観察フェーズ').waitFor({ timeout: 5000 })
await page.waitForTimeout(3500)
await page.screenshot({ path: 'game-observing.png', fullPage: true })

await page.getByRole('button', { name: '過去へ戻る' }).click()
await page.getByText('対策フェーズ').waitFor()

const gatewayDefense = page.locator('.defense-control').filter({ hasText: '認証レート制限' })
await gatewayDefense.click()
await page.getByRole('button', { name: '設定を適用' }).click()

await page.locator('.infra-node').filter({ hasText: 'WEB-01' }).click()
const webDefense = page.locator('.defense-control').filter({ hasText: 'パラメータ化クエリ' })
await webDefense.click()
const serviceControl = page.locator('.defense-control').filter({ hasText: 'Webサービス' })
await serviceControl.click()
await page.getByRole('button', { name: '設定を適用' }).click()

await page.getByRole('button', { name: 'シミュレーション実行' }).click()
await page.getByText('業務サービスが停止しています').waitFor({ timeout: 7000 })
await page.getByRole('dialog').getByText('DOWN', { exact: true }).waitFor()
await page.screenshot({ path: 'game-sla-failed.png', fullPage: true })
await page.getByRole('button', { name: '対策を続ける' }).click()

await page.getByRole('button', { name: '過去へ戻る' }).click()
await serviceControl.click()
await page.getByRole('button', { name: '設定を適用' }).click()
await page.getByRole('button', { name: 'シミュレーション実行' }).click()
await page.getByText('攻撃を完全に遮断').waitFor({ timeout: 7000 })
await page.screenshot({ path: 'game-cleared.png', fullPage: true })

if (errors.length) {
  throw new Error(errors.join('\n'))
}

console.log('smoke: shutdown rejected by SLA, then service restored and stage cleared')
await browser.close()
