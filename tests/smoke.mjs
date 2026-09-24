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
await page.locator('.customer-node').getByText('CUSTOMER', { exact: true }).waitFor()
await page.locator('.infra-node.restricted').first().getByText('ATTACKER', { exact: true }).waitFor()
if (await page.locator('.customer-edge').count() !== 1) throw new Error('normal customer access path was not rendered')
if (await page.locator('.threat-edge').count() < 1) throw new Error('attacker access path was not rendered')
await page.screenshot({ path: 'game-observing.png', fullPage: true })

await page.getByRole('button', { name: 'ターミナル', exact: true }).click()
await page.getByText(/LIVE DOCKER|LOCAL SIM|LOCAL FALLBACK/).waitFor({ timeout: 15000 })
const terminalTargets = page.locator('.terminal-switcher button')
if (await terminalTargets.count() < 2) throw new Error('terminal target switcher was not rendered')
await terminalTargets.nth(1).click()
await page.locator('.terminal-mount:not([hidden]) .xterm-rows').getByText(/operator@web/).waitFor({ timeout: 5000 })
const resizeHandle = page.getByRole('separator', { name: 'ターミナルとイベントログの高さを変更' })
const consoleBeforeResize = await page.locator('.console-panel').boundingBox()
const resizeBox = await resizeHandle.boundingBox()
if (!consoleBeforeResize || !resizeBox) throw new Error('terminal resize handle was not rendered')
await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2)
await page.mouse.down()
await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y - 170, { steps: 6 })
await page.mouse.up()
const consoleAfterResize = await page.locator('.console-panel').boundingBox()
if (!consoleAfterResize || consoleAfterResize.height < consoleBeforeResize.height + 150) throw new Error('terminal panel did not resize after dragging its handle')

await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('sta')
await page.keyboard.press('Tab')
await page.keyboard.press('Enter')
await page.waitForFunction(
  () => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('HEALTH'),
  undefined,
  { timeout: 5000 },
)
await page.keyboard.type('ls')
await page.keyboard.press('Enter')
await page.waitForFunction(
  () => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('parameterized_query.conf'),
  undefined,
  { timeout: 5000 },
)
await page.keyboard.type('cat para')
await page.keyboard.press('Tab')
await page.keyboard.press('Enter')
await page.waitForFunction(
  () => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('parameterized_query=off'),
  undefined,
  { timeout: 5000 },
)
await page.keyboard.type('help')
await page.keyboard.press('Enter')
await page.waitForFunction(
  () => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('config set PATH KEY on|off'),
  undefined,
  { timeout: 5000 },
)
const terminalTail = await page.locator('.terminal-mount:not([hidden]) .xterm-rows').innerText()
const visibleCommands = ['ps [--sort cpu|mem]', 'logs [service] [--lines N]', 'inspect [defense|network]', 'ls [path]', 'cat PATH', 'config get PATH | config set PATH KEY on|off', 'shutdown', 'reboot']
if (!visibleCommands.every((command) => terminalTail.includes(command))) {
  await page.screenshot({ path: 'terminal-help-failed.png', fullPage: true })
  throw new Error(`terminal help did not render command arguments:\n${terminalTail}`)
}
if (terminalTail.includes('ゲームオーバ')) throw new Error('shutdown/reboot help disclosed the failure condition')
await page.screenshot({ path: 'terminal-help.png', fullPage: true })
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('status --json')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('"node": "web"'))

await page.locator('.terminal-switcher button').filter({ hasText: 'EDGE-01' }).click()
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('hostname')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('edge-01'))
await page.locator('.terminal-switcher button').filter({ hasText: 'WEB-01' }).click()
await page.waitForFunction(() => {
  const output = document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent ?? ''
  return output.includes('"node": "web"')
})
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.press('ArrowUp')
await page.waitForFunction(() => {
  const output = document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent ?? ''
  return output.trimEnd().endsWith('$ status --json')
})
await page.keyboard.press('Enter')
await page.waitForFunction(() => {
  const output = document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent ?? ''
  return output.includes('"node": "web"')
})
await page.getByRole('button', { name: /イベントログ/ }).click()

if (await page.getByRole('button', { name: '防御設定' }).count()) throw new Error('defense settings tab is still rendered')
if (await page.getByRole('button', { name: '設定を適用' }).count()) throw new Error('defense apply button is still rendered')

await page.getByRole('button', { name: '過去へ戻る' }).click()
await page.locator('.phase-badge', { hasText: '対策フェーズ' }).waitFor()

await page.locator('.terminal-switcher button').filter({ hasText: 'EDGE-01' }).click()
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('config set rate_limit.conf rate_limit on')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('updated rate_limit.conf: rate_limit=on'))

await page.locator('.terminal-switcher button').filter({ hasText: 'WEB-01' }).click()
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('config set parameterized_query.conf parameterized_query on')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('updated parameterized_query.conf: parameterized_query=on'))
await page.keyboard.type('config set service_online.conf service_online off')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('updated service_online.conf: service_online=off'))

await page.getByRole('button', { name: 'シミュレーション実行' }).click()
await page.getByText('業務サービスが停止しています').waitFor({ timeout: 7000 })
await page.getByRole('dialog').getByText('DOWN', { exact: true }).waitFor()
await page.screenshot({ path: 'game-sla-failed.png', fullPage: true })
await page.getByRole('button', { name: '対策を続ける' }).click()

await page.getByRole('button', { name: '過去へ戻る' }).click()
await page.locator('.phase-badge', { hasText: '対策フェーズ' }).waitFor()
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('config set service_online.conf service_online on')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('.terminal-mount:not([hidden]) .xterm-rows')?.textContent?.includes('updated service_online.conf: service_online=on'))
await page.getByRole('button', { name: 'シミュレーション実行' }).click()
await page.getByText('攻撃を完全に遮断').waitFor({ timeout: 7000 })
await page.screenshot({ path: 'game-cleared.png', fullPage: true })
await page.getByRole('button', { name: 'ステージ一覧へ' }).click()
await page.getByRole('heading', { name: '未解決インシデント' }).waitFor()

await page.locator('.stage-card').first().getByRole('button').click()
await page.getByText('観察フェーズ').waitFor({ timeout: 5000 })
await page.getByRole('button', { name: 'ターミナル', exact: true }).click()
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('shut')
await page.keyboard.press('Tab')
await page.keyboard.press('Enter')
await page.getByRole('alertdialog').getByRole('heading', { name: 'システムが停止しました' }).waitFor()
await page.getByRole('alertdialog').getByRole('heading', { name: 'GAME OVER' }).waitFor()
await page.getByRole('alertdialog').getByRole('heading', { name: '「システムが使えないじゃないか！」' }).waitFor()
await page.waitForTimeout(600)
await page.screenshot({ path: 'game-system-failure.png', fullPage: true })
await page.getByRole('button', { name: '最初から再開' }).click()
await page.getByText('観察フェーズ').waitFor({ timeout: 5000 })
await page.getByRole('button', { name: 'ターミナル', exact: true }).click()
await page.locator('.terminal-mount:not([hidden]) .xterm-helper-textarea').focus()
await page.keyboard.type('reb')
await page.keyboard.press('Tab')
await page.keyboard.press('Enter')
await page.getByRole('alertdialog').getByRole('heading', { name: 'システムが再起動しました' }).waitFor()
await page.getByRole('alertdialog').getByRole('heading', { name: '「システムが使えないじゃないか！」' }).waitFor()

if (errors.length) {
  throw new Error(errors.join('\n'))
}

console.log('smoke: customer/attacker traffic rendered, terminal completion/history retained, shutdown and reboot trigger customer complaint game over')
await browser.close()
