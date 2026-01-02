# Sauna Reserve - SelectType 空き監視 LINE通知

SelectType予約ページの空きを定期監視し、空きが出たらLINEにPush通知するシステム。

## 機能

- 2分ごとに予約ページをチェック
- 空き（●または▲）が見つかったらLINE通知
- **複数の日付を同時監視可能**（例: 1/15, 1/16, 1/20 を同時に監視）
- LINEメッセージで監視のON/OFF切り替え可能（Firebase課金の最適化）
- 状態変化時のみ通知（連続通知を防止）

## 技術スタック

- Firebase Cloud Functions v2
- Firestore（状態管理）
- LINE Messaging API
- TypeScript / Node.js 20

---

## セットアップ手順

### 1. LINE Developers 設定

1. [LINE Developers Console](https://developers.line.biz/) にアクセス
2. プロバイダーを作成（または既存を選択）
3. 「Messaging API」チャネルを作成
4. 以下を控える:
   - **Channel secret**: 「Basic settings」タブ
   - **Channel access token**: 「Messaging API」タブで発行

### 2. Firebase プロジェクト設定

```bash
# Firebase CLIをインストール（未インストールの場合）
npm install -g firebase-tools

# ログイン
firebase login

# プロジェクト作成（または既存を使用）
firebase projects:create your-project-id

# プロジェクトを選択
firebase use your-project-id
```

### 3. Firestoreを有効化

Firebase Console で:
1. 「Firestore Database」→「データベースを作成」
2. 「本番モード」を選択（ルールはデプロイ時に適用される）
3. ロケーション: `asia-northeast1`（東京）推奨

### 4. Secrets設定

```bash
# LINE Channel Access Token を設定
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
# → プロンプトでトークンを入力

# LINE Channel Secret を設定
firebase functions:secrets:set LINE_CHANNEL_SECRET
# → プロンプトでシークレットを入力
```

### 5. デプロイ

```bash
cd functions

# 依存関係インストール
npm install

# ビルド確認
npm run build

# デプロイ
npm run deploy
```

### 6. LINE Webhook URL設定

デプロイ完了後、Firebase ConsoleでFunctions URLを確認:

```
https://asia-northeast1-YOUR_PROJECT_ID.cloudfunctions.net/lineWebhook
```

LINE Developers Console で:
1. 「Messaging API」タブ
2. 「Webhook URL」に上記URLを設定
3. 「Use webhook」を ON
4. 「Verify」ボタンで疎通確認

---

## 使い方

### 初回登録

1. LINE公式アカウントを友だち追加
2. トーク画面で `登録` と送信
3. 「登録完了しました！」と返信が来れば成功

### コマンド一覧

| コマンド | 動作 |
|---------|------|
| `登録` | 通知を受け取る登録（初回のみ） |
| `開始` | 監視開始（2分ごとにチェック） |
| `停止` | 監視停止（課金節約） |
| `状態` | 現在の設定を確認（詳細情報を表示） |
| `1/15` | 1月15日を監視対象に**追加** |
| `1/2 1/3 1/4` | 複数日付を**一括追加**（スペース区切り） |
| `削除 1/15` | 1月15日を監視対象から**削除** |
| `全削除` | 全ての日付指定を解除（全日程を監視） |
| `使い方` | コマンド一覧を表示 |

> 英語コマンド（`start`, `on`, `off`, `status`, `clear`）も引き続き使用可能です。

### 日付の指定方法

以下の形式で日付を送信できます（複数追加可能）：

**単一日付:**
- `1/15` → 今年の1月15日を追加
- `01/15` → 今年の1月15日を追加
- `2025/1/15` → 2025年1月15日を追加
- `1-15` → 今年の1月15日を追加
- `2025-01-15` → 2025年1月15日を追加

**複数日付を一括入力:**
- `1/2 1/3 1/4` → スペース区切りで一括追加
- `1/2, 1/3, 1/4` → カンマ区切りでも可

日付を削除するには `削除` を付けます：
- `削除 1/15` → 1月15日を削除
- `削除 2025/1/15` → 2025年1月15日を削除

### 複数日程の監視例

**一括入力（推奨）:**
```
1/15 1/16 1/20   → 3件の日付を一括追加
状態             → 監視日（3件）と表示
開始             → 監視開始
```

**1件ずつ入力:**
```
1/15        → 1月15日を追加
1/16        → 1月16日を追加
1/20        → 1月20日を追加
状態        → 監視日（3件）と表示
開始        → 監視開始
```

### 通知の流れ

1. 日付を送信して監視対象に追加（複数可）
2. `開始` で監視開始
3. 指定日のいずれか（または全日程）に空き（●/▲）が出現したら通知
4. どの日程に空きが出たかを通知メッセージに表示
5. 空きがある間は再通知しない
6. 空きがなくなり、再度出現したら通知

---

## 動作確認

### ログ確認

```bash
# リアルタイムログ
firebase functions:log --only watchScheduler

# 全関数のログ
firebase functions:log
```

### Firestore確認

Firebase Console → Firestore:

- `line/target`: 登録ユーザー情報
- `watch/config`: 監視設定（enabled等）
- `watch/state`: 最新チェック結果

### テスト通知（手動）

Firebase Console → Functions → `watchScheduler` → 「Run in Shell」

または、Firestoreで `watch/state.has` を `false` に、`watch/config.enabled` を `true` にして、空きが出た状態をシミュレート。

---

## ユニットテスト

```bash
cd functions

# テスト実行
npm test

# ウォッチモード
npm run test:watch
```

---

## Firestoreスキーマ

### line/target
```json
{
  "userId": "U1234567890abcdef...",
  "updatedAt": 1704067200000
}
```

### watch/config
```json
{
  "enabled": true,
  "intervalMinutes": 2,
  "targetDates": ["2025-01-15", "2025-01-16"],
  "updatedAt": 1704067200000
}
```

> `targetDates` は省略可能。省略時は全日程を監視。複数日付を指定可能。

### watch/state
```json
{
  "has": false,
  "checkedAt": 1704067200000,
  "lastNotifiedAt": 1704060000000,
  "checkedTargetDates": ["2025-01-15", "2025-01-16"]
}
```

> `checkedTargetDates` は前回チェック時の対象日付。日付が変更されると状態がリセットされ、新しい日付で空きがあれば通知が送信される。

---

## コスト最適化

- `enabled=false` 時は外部fetch・LINE APIを呼ばない
- スケジューラ自体は起動するが、即return（実行時間最小化）
- 状態変化時のみPush通知（不要な通知を削減）

---

## トラブルシューティング

### 通知が来ない

1. `status` コマンドで監視がONか確認
2. Firestore `line/target` にuserIdがあるか確認
3. Functions ログでエラーを確認

### 署名検証エラー

- LINE Developers ConsoleのChannel secretが正しいか確認
- Secretsに正しく設定されているか確認:
  ```bash
  firebase functions:secrets:access LINE_CHANNEL_SECRET
  ```

### デプロイエラー

- Node.js 20がインストールされているか確認
- `npm run build` が成功するか確認

---

## 制限事項

- 自動予約機能は**非対応**（通知のみ）
- 監視間隔は最短2分（SelectTypeへの負荷軽減）
- 通知先は1ユーザーのみ（MVP仕様）

---

## ライセンス

MIT
