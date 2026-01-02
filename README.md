# Sauna Reserve - SelectType 空き監視 LINE通知

SelectType予約ページの空きを定期監視し、空きが出たらLINEにPush通知するシステム。

## 機能

- 2分ごとに予約ページをチェック
- 空き（●または▲）が見つかったらLINE通知
- **特定の日付のみ監視可能**（例: 1/15 の空きだけ通知）
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
2. トーク画面で `start` と送信
3. 「登録完了しました！」と返信が来れば成功

### コマンド一覧

| コマンド | 動作 |
|---------|------|
| `1/15` | 監視日を1月15日に設定 |
| `2025/1/15` | 監視日を2025年1月15日に設定 |
| `clear` | 日付指定を解除（全日程を監視） |
| `on` | 監視開始（2分ごとにチェック） |
| `off` | 監視停止（課金節約） |
| `status` | 現在の状態を確認 |

### 日付の指定方法

以下の形式で日付を送信できます：

- `1/15` → 今年の1月15日
- `01/15` → 今年の1月15日
- `2025/1/15` → 2025年1月15日
- `1-15` → 今年の1月15日
- `2025-01-15` → 2025年1月15日

### 通知の流れ

1. 日付を送信して監視対象を設定（省略可）
2. `on` で監視開始
3. 指定日（または全日程）に空き（●/▲）が出現したら通知
4. 空きがある間は再通知しない
5. 空きがなくなり、再度出現したら通知

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
  "targetDate": "2025-01-15",
  "updatedAt": 1704067200000
}
```

> `targetDate` は省略可能。省略時は全日程を監視。

### watch/state
```json
{
  "has": false,
  "checkedAt": 1704067200000,
  "lastNotifiedAt": 1704060000000
}
```

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
