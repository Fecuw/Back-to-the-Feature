import type { LoadedStage, ServerDefinition } from '../types'

const oneLine = (value: string) => value.replace(/[\r\n|]+/g, ' ').trim()

export function createTerminalFiles(
  stage: LoadedStage,
  server: ServerDefinition,
  settings: Record<string, boolean>,
): Record<string, string> {
  const defenses = stage.defenses.filter((defense) => defense.serverId === server.id)
  const sessionConfig = [
    '# stage_id: このワークスペースで読み込まれているステージID',
    `stage_id=${stage.id}`,
    '# server_id: 現在接続しているノードID',
    `server_id=${server.id}`,
    '# mode: セッションの動作モード（observe は調査モード）',
    'mode=observe',
    '',
  ].join('\n')

  const files: Record<string, string> = { 'session.conf': sessionConfig }
  for (const defense of defenses) {
    const enabled = settings[defense.id]
    files[`${defense.id}.conf`] = [
      `# ${defense.id}: ${oneLine(defense.description)}`,
      `# source: ゲーム内で対応する元の設定パスは ${oneLine(defense.configPath)}`,
      `# on: ${oneLine(defense.onLabel)} / off: ${oneLine(defense.offLabel)}`,
      `# 次の行が ${defense.label} の現在値を格納する設定行`,
      `${defense.id}=${enabled ? 'on' : 'off'}`,
      '',
    ].join('\n')
  }

  const rows = defenses.length
    ? defenses.map((defense) => `| \`${defense.id}.conf\` | \`${defense.id}\` | ${oneLine(defense.description)} | \`${oneLine(defense.configPath)}\` |`)
    : ['| — | — | このノードに変更可能な防御設定はありません | — |']

  files['README.md'] = [
    `# ${server.label} configuration files`,
    '',
    'このディレクトリは、ゲーム内設定を調査するための `/workspace` ミラーです。',
    '`ls` で一覧、`cat <file>` または `config get <file>` で内容を確認できます。',
    '各 `.conf` の設定行直前には、その行の役割と on/off の意味をコメントで記載しています。',
    '',
    '| ファイル | 格納する設定 | 役割 | ゲーム内の対応パス |',
    '| --- | --- | --- | --- |',
    '| `session.conf` | `stage_id`, `server_id`, `mode` | 接続中セッションの識別情報 | runtime |',
    ...rows,
    '',
    '> 対策フェーズでは `config set <file> <setting> on|off` で防御設定をゲームへ即時反映できます。',
    '',
  ].join('\n')

  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)))
}
