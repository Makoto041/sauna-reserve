# Sauna Reserve - SelectType 空き監視 LINE通知

SelectType予約ページの空きを定期監視し、空きが出たらLINEにPush通知するシステム。

## 機能

- 予約ページを定期チェックし、空き（●／▲）が出たらLINEに通知
- **リッチメニュー**（トーク画面下部の常設メニュー）から、何も入力せず6つの操作にアクセス可能
- **通知・操作はすべてボタン対応**（Flex Message + クイックリプライ + カレンダー日付ピッカー）
- 通知には**空いた時間帯と残席数**を表示し、その週の予約ページへ直接遷移
- **複数の日付を同時監視可能**（例: 1/15, 1/16, 1/20）
- 監視間隔を1〜60分で設定可能（**設定した間隔がそのまま反映される**）
- 夜間（JST 0〜6時）は自動で停止（切り替え可能）
- **枠（時間帯）ごと**に状態を持ち、新しく空いた枠だけを通知（同じ日に別の時間が空いた場合も通知される）
- 同じ週の日付は1回のページ取得にまとめる（対象サイトへの負荷とコストを削減）

## 技術スタック

- Firebase Cloud Functions v2
- Firestore（状態管理）
- LINE Messaging API
- TypeScript / Node.js 22

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

# プロジェクトを選択（.firebaserc で sauna-reserve に固定済み。
# 別プロジェクトを使う場合のみ）
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

### 6. リッチメニューを登録

トーク画面下部に常設されるメニューを登録します。初めて使う人が入力せずに操作できる唯一の入口なので、必ず登録してください。

```bash
# 画像を生成（既にリポジトリに含まれているため、変更時のみ）
python3 scripts/richmenu/generate-image.py --font /path/to/NotoSansJP-Bold.ttf

# LINEに登録し、全ユーザーの既定メニューに設定
LINE_CHANNEL_ACCESS_TOKEN="$(firebase functions:secrets:access LINE_CHANNEL_ACCESS_TOKEN)" \
  node scripts/richmenu/setup.mjs
```

`setup.mjs` は既存のリッチメニューを削除してから登録し直します（残したい場合は `--keep-old`）。
タイルの並びやアクションを変えるときは `generate-image.py` の `TILES` と `setup.mjs` の `ACTIONS` を
**同じ順序**で編集してください（左上から右へ、次の行へ）。

### 7. LINE Webhook URL設定

デプロイ完了後、Firebase ConsoleでFunctions URLを確認:

```text
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

LINE公式アカウントを友だち追加すると自動で登録され、「はじめかた」カードが届きます。
（うまくいかない場合は `登録` と送信してください）

案内は3か所から辿れます。

| どこから | 何が出るか |
|---|---|
| 友だち追加した直後 | 「はじめかた」カード（3ステップ＋最初の操作ボタン） |
| 画面下の**メニュー** | 6つの操作タイル（常設。入力不要） |
| メッセージ下部のボタン | 直前の状態に応じた操作（開始/停止が入れ替わる） |

読み取れないメッセージを送った場合はエラーではなく**使い方カード**を返します。
`使い方` のほか `メニュー` `わからない` `はじめて` `?` などでも同じカードが出ます。

> 通知先は1ユーザーのみです。既に別のユーザーが登録されている場合、友だち追加だけでは
> 通知先は切り替わりません。切り替えるには明示的に `登録` と送信してください。
>
> リッチメニューは全ユーザーに配られるため、登録者以外が設定を変更しようとした場合は
> その旨を返して拒否します（`状態` や `使い方` の閲覧は誰でもできます）。

### ボタン操作

画面下のリッチメニューと、メッセージ下部のクイックリプライから操作できます。

**リッチメニュー（常設）**

| タイル | 動作 |
|--------|------|
| 日付を追加 | カレンダーから日付を選んで監視対象に追加 |
| 監視開始 / 監視停止 | 監視の開始・停止 |
| 状態 | 現在の設定をカード表示 |
| 日付を削除 | 監視中の日付を一覧から選んで削除 |
| 使い方 | 使い方カードを表示 |

**クイックリプライ（返信ごとに表示）**

| ボタン | 動作 |
|--------|------|
| 📅 日付を追加 | カレンダーから日付を選んで監視対象に追加 |
| ▶️ 開始 / ⏸ 停止 | 監視の開始・停止 |
| 📋 状態 | 現在の設定をカード表示 |
| ⏱ 2分 / 5分 / 15分 | 監視間隔の変更 |
| ❓ 使い方 | ヘルプを表示 |

`状態` カードからは監視の開始/停止、日付の追加、日付の削除、夜間停止の切り替えができます。
`削除` と送ると、監視中の日付がボタンで並び、タップで削除できます。

### コマンド一覧（テキスト入力）

ボタンを使わずキーワードでも操作できます。

| コマンド | 動作 |
|---------|------|
| `登録` | 通知を受け取る登録 |
| `開始` | 監視開始 |
| `停止` | 監視停止（課金節約） |
| `状態` | 現在の設定を確認 |
| `1/15` | 1月15日を監視対象に**追加** |
| `1/2 1/3 1/4` | 複数日付を**一括追加**（スペース区切り） |
| `削除` | 削除する日付を一覧から選ぶ |
| `削除 1/15` | 1月15日を監視対象から**削除** |
| `全削除` | 全ての日付指定を解除（全日程を監視） |
| `5分` | 監視間隔を5分に変更（1〜60分） |
| `夜間停止` / `24時間監視` | 夜間（0〜6時）の停止を切り替え |
| `使い方` | 使い方を表示（`メニュー` `わからない` `はじめて` `?` でも可） |

> 英語コマンド（`start`, `on`, `off`, `status`, `clear`, `help`）も使用可能です。

### 日付の指定方法

以下の形式で日付を送信できます（複数追加可能）：

**単一日付:**
- `1/15` / `01/15` / `1-15` / `1月15日` → 次に来る1月15日
- `2027/1/15` / `2027-01-15` → 年を明示

> 年を省略した場合は**次に来るその日付**になります。8月に `1/15` と送ると翌年の1月15日として扱われるため、過去日を監視してしまうことはありません。カレンダーの日付ピッカーを使えば年の解釈は発生しません。

**複数日付を一括入力:**
- `1/2 1/3 1/4` → スペース区切りで一括追加
- `1/2, 1/3, 1/4` → カンマ区切りでも可

> メッセージ全体が日付だけの場合に追加コマンドとして扱われます。`8/23は空いてる?` のような文章は追加されません。

### 通知の内容

空きが出ると、日付ごとにカードが届きます。

```text
┌──────────────────────────┐
│ 空きが出ました             │
│ 2026年8月24日(月)          │
├──────────────────────────┤
│ 12:00   ●        残り5人   │
│ 16:00   ▲        残り1人   │
│ 21:00   ●        残り3人   │
├──────────────────────────┤
│ [ 予約ページを開く ]        │
│ [ この日の監視をやめる ]    │
└──────────────────────────┘
```

複数日程に同時に空きが出た場合はカルーセルで並びます。

### 通知の流れ

1. 日付を追加（カレンダーまたはテキスト、複数可）
2. `開始` で監視開始
3. 指定日の枠に空き（●/▲）が出現したら、**その枠**について通知
4. 同じ枠は空きが続いている間は再通知しない
5. 別の時間帯が空いたら、その枠について改めて通知
6. 枠が埋まり、再度空いたら再通知
7. 監視日が過去日になると自動で削除され、**すべて過去日になったら監視を自動停止**して通知（通知カードから日付を選び直せます）

---

## 監視頻度とコスト

`watchScheduler` は毎分起動し、`intervalMinutes`（既定2分）が経過したときだけ実際のチェックを行います。

| 項目 | 値 |
|------|-----|
| Functions起動 | 1,440回/日（監視OFF時はFirestore1読み取りで即return） |
| 実チェック | 1,440 ÷ 監視間隔（分）回/日。既定2分なら720回/日 |
| 夜間停止 | JST 0〜6時をスキップ（既定ON）→ 実チェックは約540回/日 |
| 予約ページへのリクエスト | 1チェックあたり「監視日を7日単位でまとめた窓」の数。同じ週の日付は何件でも1リクエスト |

Cloud Functions（2M回/月）・Firestore（50,000読み取り/日）の無料枠に収まる範囲です。
監視間隔を短くするほど対象サイトへの負荷も増えるため、常時監視は5分以上を推奨します。

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
- `watch/state`: 最新チェック結果（`availableSlots` が前回空いていた枠）

### テスト通知（手動）

Firebase Console → Functions → `watchScheduler` → 「Run in Shell」

または、Firestoreで `watch/state.availableSlots` を空配列に、`watch/config.enabled` を `true` にして、空きが出た状態をシミュレート。

---

## ユニットテスト

```bash
cd functions

# テスト実行
npm test

# ウォッチモード
npm run test:watch
```

### Lint

```bash
cd functions
npm run lint      # 検査のみ
npm run lint:fix  # 自動修正
```

### LINEメッセージの検証

Flex Message の妥当性を最終的に判断するのはLINEサーバーです。不正なペイロードは
返信なら「エラーが発生しました」、Pushなら無反応として表面化します。
メッセージを変更したら、送信せずに検証できるスクリプトを通してください。

```bash
# リポジトリのルートで実行します
cd "$(git rev-parse --show-toplevel)"

npm --prefix functions run build
LINE_CHANNEL_ACCESS_TOKEN="$(firebase functions:secrets:access LINE_CHANNEL_ACCESS_TOKEN)" \
  node scripts/validate-messages.mjs
```

ビルドが `functions/src` より古い場合は、前のコードを検証してしまわないよう
実行を拒否します。

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
  "targetDates": ["2026-08-24", "2026-08-25"],
  "nightPause": true,
  "updatedAt": 1704067200000
}
```

> `targetDates` は省略可能。省略時は**表示中の週の全日程**を監視。
> `nightPause` は JST 0〜6時のスキップ（既定 true）。

### watch/state
```json
{
  "has": true,
  "checkedAt": 1704067200000,
  "lastNotifiedAt": 1704060000000,
  "availableSlots": ["2026-08-24 12:00", "2026-08-24 21:00"]
}
```

> `availableSlots` は前回チェック時点で空いており、**かつ通知に成功した**枠。ここに**含まれていない**枠が空いたときだけ通知するため、枠ごとに1回だけ通知される。Push に失敗した枠は記録されないため、次回チェックで再送される。
>
> 日付単位ではなく枠単位で持つのは、ある日に1枠でも空きが残っていると、同じ日の別の時間が空いても「通知済み」と判定されてしまうため。

---

## コスト最適化

- `enabled=false` 時は外部fetch・LINE APIを呼ばない（Firestore1読み取りで即return）
- 監視間隔・夜間停止によりチェック回数を抑制
- 同じ週の監視日はページ取得を1回にまとめる
- 状態変化時のみPush通知（不要な通知を削減）

---

## トラブルシューティング

### 通知が来ない

1. `状態` コマンドで監視がONか確認
2. Firestore `line/target` にuserIdがあるか確認
3. Functions ログでエラーを確認

### 署名検証エラー

- LINE Developers ConsoleのChannel secretが正しいか確認
- Secretsに正しく設定されているか確認:
  ```bash
  firebase functions:secrets:access LINE_CHANNEL_SECRET
  ```

### デプロイエラー

- Node.js 22がインストールされているか確認
- `npm run build` が成功するか確認

---

## 制限事項

- 自動予約機能は**非対応**（通知のみ）
- 監視間隔は1〜60分で設定可能（デフォルト2分）。スケジューラの刻みが1分のため、実際の間隔は最大1分ずれる
- 通知先は1ユーザーのみ（MVP仕様）。登録者以外からの設定変更は拒否する
- 監視対象コースは既定コース（`c_id=178267` / サウナ3時間）のみ。同じ予約ページの別コース（アウフグース等）の空きは検知しない。
  対応する場合は `watch/state.availableSlots` のキー（現在は「日付＋開始時刻」）にコースIDを含める必要がある —
  カレンダーが1コースずつ・1時刻1行で描画されるからこそ、いまのキーで一意になっている
- 日付を指定しない「全日程」モードは、予約ページが初期表示する**今週7日分**のみが対象
- ESLint は flat config（`functions/eslint.config.mjs`）。型情報を使わない `recommended` のみで、型付きルールは未導入

---

## ライセンス

MIT
