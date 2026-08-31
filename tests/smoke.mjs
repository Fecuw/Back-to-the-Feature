import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const errors = []

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`))

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '調査を開始' }).first().click()
await page.getByText('観察フェーズ').waitFor({ timeout: 5000 })
await page.waitForTimeout(3500)
await page.screenshot({ path: 'game-observing.png', fullPage: true })

await page.getByRole('button', { name: 'ターミナル' }).click()
await page.getByText(/LIVE DOCKER|LOCAL SIM|LOCAL FALLBACK/).waitFor({ timeout: 15000 })
const terminalTargets = page.locator('.terminal-switcher button')
if (await terminalTargets.count() < 2) throw new Error('terminal target switcher was not rendered')
await terminalTargets.nth(1).click()
await page.locator('.xterm-rows').getByText(/operator@web/).waitFor({ timeout: 5000 })
const resizeHandle = page.getByRole('separator', { name: 'ターミナルとイベントログの高さを変更' })
const consoleBeforeResize = await page.locator('.console-panel').boundingBox()
const resizeBox = await resizeHandle.boundingBox()
if (!consoleBeforeResize || !resizeBox) throw new Error('terminal resize handle was not rendered')
await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2)
await page.mouse.down()
await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y - 70, { steps: 4 })
await page.mouse.up()
const consoleAfterResize = await page.locator('.console-panel').boundingBox()
if (!consoleAfterResize || consoleAfterResize.height < consoleBeforeResize.height + 50) throw new Error('terminal panel did not resize after dragging its handle')

await page.locator('.xterm-helper-textarea').last().focus()
await page.keyboard.type('ls')
await page.keyboard.press('Enter')
await page.waitForFunction(
  () => document.querySelector('.xterm-rows')?.textContent?.includes('parameterized_query.conf'),
  undefined,
  { timeout: 5000 },
)
await page.keyboard.type('cat parameterized_query.conf')
await page.keyboard.press('Enter')
await page.waitForFunction(
  () => document.querySelector('.xterm-rows')?.textContent?.includes('parameterized_query=off'),
  undefined,
  { timeout: 5000 },
)
await page.keyboard.type('help')
await page.keyboard.press('Enter')
await page.waitForFunction(
  () => document.querySelector('.xterm-rows')?.textContent?.includes('config get|set'),
  undefined,
  { timeout: 5000 },
)
const terminalTail = await page.locator('.xterm-rows').innerText()
const visibleCommands = ['ports [--listen]', 'ps [--sort cpu|mem]', 'logs [service] [--lines N]', 'inspect [defense|network]', 'ls [path]', 'cat PATH', 'config get|set PATH [VALUE]']
if (!visibleCommands.every((command) => terminalTail.includes(command))) {
  await page.screenshot({ path: 'terminal-help-failed.png', fullPage: true })
  throw new Error(`terminal help did not render command arguments:\n${terminalTail}`)
}
await page.screenshot({ path: 'terminal-help.png', fullPage: true })
await page.getByRole('button', { name: /イベントログ/ }).click()

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
await page.getByRole('button', { name: 'ステージ一覧へ' }).click()
await page.getByRole('heading', { name: '未解決インシデント' }).waitFor()

if (errors.length) {
  throw new Error(errors.join('\n'))
}

console.log('smoke: shutdown rejected by SLA, then service restored and stage cleared')
await browser.close()
