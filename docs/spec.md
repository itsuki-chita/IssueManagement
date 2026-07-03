# タスク管理アプリケーション 仕様書

## 1. 概要

アジャイル開発をベースにしたタスク管理ウェブアプリケーション。ローカル環境で動作し、**プロジェクト → エピック → ストーリー（タスク） → サブタスク** の4階層でタスクを管理する。

---

## 2. 概念モデル

```
プロジェクト
  └── エピック（複数）
        └── ストーリー / タスク（複数）
              └── サブタスク（複数）
```

- **プロジェクト**: 開発単位。固有キー（例: `PRJ`）を持ち、タスクキー（`PRJ-1`）を自動発番する
- **エピック**: プロジェクトに属する中規模の機能・目標まとまり
- **ストーリー（タスク）**: エピックに属する作業単位。スプリントにも割り当て可能
- **サブタスク**: ストーリーの子タスク。エピック・スプリント割り当ても継承可能

---

## 3. 技術スタック

| 区分 | 技術 |
|------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS |
| ORM | Prisma 5 |
| データベース | SQLite（ローカルファイル） |
| DnD | @dnd-kit/core, @dnd-kit/sortable |
| Markdown | react-markdown + remark-gfm |

---

## 4. データモデル

### Project テーブル

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| id | Int | ✓ | autoincrement | 主キー |
| name | String | ✓ | — | プロジェクト名 |
| key | String | — | null | タスクキー接頭辞（例: `PRJ`、ユニーク） |
| description | String | — | null | 説明 |
| color | String | ✓ | "#6366f1" | 表示色 |
| createdAt | DateTime | ✓ | now() | 作成日時 |

### Epic テーブル

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| id | Int | ✓ | autoincrement | 主キー |
| title | String | ✓ | — | エピック名 |
| description | String | — | null | 説明 |
| status | String | ✓ | "open" | ステータス |
| color | String | ✓ | "#818cf8" | 表示色 |
| projectId | Int | — | null | 所属プロジェクトID |
| order | Int | ✓ | 0 | 表示順 |
| createdAt | DateTime | ✓ | now() | 作成日時 |

### Sprint テーブル

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| id | Int | ✓ | autoincrement | 主キー |
| name | String | ✓ | — | スプリント名 |
| startDate | DateTime | — | null | 開始日 |
| endDate | DateTime | — | null | 終了日 |
| status | String | ✓ | "planning" | ステータス（planning / active / completed） |
| order | Int | ✓ | 0 | 表示順 |
| createdAt | DateTime | ✓ | now() | 作成日時 |

### Task テーブル（ストーリー・サブタスク共用）

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| id | Int | ✓ | autoincrement | 主キー |
| title | String | ✓ | — | タイトル |
| description | String | — | null | メモ・詳細（Markdown） |
| status | String | ✓ | "open" | ステータス（open / in_progress / resolved / on_hold / closed） |
| done | Boolean | ✓ | false | 完了フラグ |
| priority | String | ✓ | "medium" | 優先度（low / medium / high） |
| dueDate | DateTime | — | null | 期限日 |
| sprintId | Int | — | null | 所属スプリントID（null = バックログ） |
| projectId | Int | — | null | 所属プロジェクトID |
| epicId | Int | — | null | 所属エピックID |
| parentId | Int | — | null | 親タスクID（サブタスクの場合） |
| taskNumber | Int | — | null | プロジェクト内通し番号 |
| order | Int | ✓ | 0 | 表示順 |
| createdAt | DateTime | ✓ | now() | 作成日時 |

### Comment テーブル

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| id | Int | ✓ | autoincrement | 主キー |
| body | String | ✓ | — | コメント本文 |
| taskId | Int | ✓ | — | 対象タスクID |
| createdAt | DateTime | ✓ | now() | 作成日時 |
| updatedAt | DateTime | ✓ | now() | 更新日時 |

---

## 5. 画面レイアウト

```
+-----------------------------------------------------------------------+
|  ヘッダー（タスク管理 / + タスクを追加 / ⚙ 管理メニュー）               |
+------------------+----------------------------------+------------------+
| ナビゲーション    | メインコンテンツ                   | タスク詳細ビュー  |
| (開閉可)         | （flex-1）                        | （320px固定）     |
|                  |                                  |                  |
| [プロジェクト]    | [ビュータイトル] [リスト|スイムレーン]| タスク未選択:     |
|  すべてのプロジェ |                                  | 「タスクを選択」  |
|  クト            | [フィルター: すべて/未完了/完了]    |                  |
|  ▸ Project A    |                                  | タスク選択時:     |
|  ▸ Project B    | [タスクカード]                     | 編集フォーム      |
|                  | [タスクカード]                     | （タイトル・説明・ |
| [エピック]        |                                  |  ステータス・     |
|  エピック管理     |                                  |  優先度・プロジェ |
|  ▸ Epic A       |                                  |  クト・スプリント・|
|  ▸ Epic B       |                                  |  エピック・期限） |
|                  |                                  |                  |
| [スプリント]      |                                  | + タスクを追加時: |
|  スプリント管理   |                                  | 作成フォーム      |
|  ▸ Sprint 1     |                                  |                  |
|  ▸ Sprint 2     |                                  |                  |
|                  |                                  |                  |
| [バックログ]      |                                  |                  |
+------------------+----------------------------------+------------------+
```

---

## 6. ナビゲーション（左パネル）

左パネルは「ナビゲーション」と呼称し、開閉ボタンで折りたたみ可能。

### セクション構成

| セクション | 内容 |
|-----------|------|
| プロジェクト | 新規作成フォーム（+ 追加）、「すべてのプロジェクト」ボタン、各プロジェクト行（編集・削除ボタン、タスクのドロップ先） |
| エピック | 「エピック管理」ボタン、各エピック行（色付き角丸四角アイコン、タスク数） |
| スプリント | 「スプリント管理」ボタン、各スプリント行（ステータスドット、タスク数、タスクのドロップ先） |
| バックログ | 下部固定。タスクのドロップ先としても機能 |

---

## 7. メインコンテンツのビュー一覧

| ViewState | 表示内容 |
|-----------|---------|
| `"backlog"` | バックログのタスク一覧 |
| `"all-sprints"` | スプリント管理（スプリントCRUD・並び替え、タスク一覧、バックログ） |
| `"all-projects"` | すべてのプロジェクト（プロジェクト別タスク一覧） |
| `"all-epics"` | エピック管理（エピックCRUD、タスク一覧、エピックなし） |
| `{ kind: "sprint", id }` | 特定スプリントのタスク一覧 |
| `{ kind: "project", id }` | 特定プロジェクトのタスク一覧 |
| `{ kind: "epic", id }` | 特定エピックのストーリー一覧 |
| `{ kind: "task", id }` | タスク詳細ページ（全幅表示） |

### 表示モード

- **リスト**: タスクカードを縦一列に並べる（デフォルト）
- **スイムレーン**: ステータス別（open / in_progress / resolved / on_hold / closed）の横カラム表示

---

## 8. 機能一覧

### 8.1 プロジェクト管理

- 左パネルからインラインフォームで作成（名前・キー・カラー）
- プロジェクト行ホバーで編集・削除ボタン表示
- 削除時はタスクのプロジェクト割り当てを解除（タスク自体は残る）
- タスクをドラッグしてプロジェクト行にドロップするとプロジェクトを変更できる

### 8.2 エピック管理（エピック管理ビュー）

- 「+ エピックを追加」フォームで作成（名前・プロジェクト・カラー）
- エピックセクションのヘッダー行で編集・削除
- エピック削除時はストーリーの epicId を null にする（ストーリー自体は残る）
- タスクカードをドラッグしてエピックセクションにドロップするとエピックを変更できる
- ドロップ先のエピックセクションは点線ボーダーでハイライト
- 「エピックなし」セクションに未割り当てのストーリーを表示

### 8.3 スプリント管理（スプリント管理ビュー）

- 「+ スプリントを追加」フォームで作成（名前・開始日・終了日・ステータス）
- スプリントセクションのヘッダー行で編集（モーダル）・削除
- 削除時はスプリント内タスクをバックログへ移動
- スプリントセクションのヘッダーをドラッグして並び替え可能
- タスクカードをドラッグして別スプリントセクションにドロップするとスプリントを変更できる
- ドロップ先のスプリントセクションは点線ボーダーでハイライト
- 下部にバックログセクションを表示

### 8.4 タスクカード（リストビュー）

各カードに以下を表示（右寄せバッジ）:
- タイトル（完了時は取り消し線、あふれたら三点リーダ）
- タスクキー（`PRJ-1` 形式）
- ステータスバッジ
- 優先度バッジ
- エピックバッジ（エピックカラーで着色）
- プロジェクトカラーと名前
- サブタスク進捗（完了/合計）
- 期限日
- スプリント割り当てボタン（インラインで変更可能）
- 完了トグル（左端の丸ボタン）

カードのどこをつかんでもドラッグアンドドロップ可能。

### 8.5 タスク詳細ページ（`{ kind: "task" }` ビュー）

タスクキーまたはカードのキーバッジをクリックすると全幅の詳細ページに遷移。

- タイトル・説明（Markdownエディタ）
- メタデータサイドバー（ステータス・優先度・プロジェクト・スプリント・エピック・期限）
- 更新・削除ボタン
- サブタスク一覧・追加フォーム
- コメント一覧・追加・編集・削除

### 8.6 タスク右パネル（タスク詳細ビュー）

タスクカードクリックで右パネルに編集フォームを表示。

- ステータス・プロジェクト・スプリント・エピック・優先度・期限を選択
- サブタスク一覧・追加
- コメント一覧・投稿

### 8.7 ドラッグアンドドロップ

| 操作 | 動作 |
|------|------|
| タスクを同一リスト内でドラッグ | 並び替え（order 更新） |
| タスクを別スプリントへドラッグ（スプリント管理） | sprintId 更新 |
| タスクを別エピックへドラッグ（エピック管理） | epicId 更新 |
| タスクをバックログへドラッグ | sprintId = null |
| タスクをスプリント行（ナビ）へドラッグ | sprintId 更新 |
| タスクをプロジェクト行（ナビ）へドラッグ | projectId 更新 |
| スプリントセクションをドラッグ（スプリント管理） | スプリント並び替え |
| タスクをスイムレーン列へドラッグ | status 更新 |

### 8.8 フィルター

「すべて」「未完了」「完了済み」の3種類。件数を右端に表示。

### 8.9 管理メニュー（⚙）

ヘッダー右の歯車アイコンからモーダルを開く。

- 「アプリをアップデート」ボタンで `git pull` → `npm install` → `prisma db push` を実行
- 各ステップの結果をリアルタイム表示

---

## 9. API 仕様

### Tasks

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/tasks` | 全タスク取得（order ASC） |
| POST | `/api/tasks` | タスク作成 |
| PATCH | `/api/tasks/:id` | タスク部分更新 |
| DELETE | `/api/tasks/:id` | タスク削除 |
| POST | `/api/tasks/reorder` | タスク並び替え（`{ ids: number[] }`） |

**POST /api/tasks リクエストボディ**
```json
{
  "title": "タスク名",
  "description": "メモ",
  "status": "open",
  "priority": "medium",
  "dueDate": "2026-07-01",
  "sprintId": 1,
  "projectId": 1,
  "epicId": 1,
  "parentId": null
}
```

**PATCH /api/tasks/:id** — 上記フィールドをすべて任意で部分更新

### Sprints

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/sprints` | 全スプリント取得（order ASC） |
| POST | `/api/sprints` | スプリント作成 |
| PATCH | `/api/sprints/:id` | スプリント部分更新 |
| DELETE | `/api/sprints/:id` | スプリント削除（タスクはバックログへ） |
| POST | `/api/sprints/reorder` | スプリント並び替え（`{ ids: number[] }`） |

### Projects

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/projects` | 全プロジェクト取得 |
| POST | `/api/projects` | プロジェクト作成（name, key, color） |
| PATCH | `/api/projects/:id` | プロジェクト部分更新 |
| DELETE | `/api/projects/:id` | プロジェクト削除（タスクの割り当ては解除） |

### Epics

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/epics` | 全エピック取得（order ASC） |
| POST | `/api/epics` | エピック作成（title, description, color, projectId） |
| PATCH | `/api/epics/:id` | エピック部分更新 |
| DELETE | `/api/epics/:id` | エピック削除（タスクの epicId は null に） |
| POST | `/api/epics/reorder` | エピック並び替え（`{ ids: number[] }`） |

### Comments

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/tasks/:id/comments` | タスクのコメント一覧 |
| POST | `/api/tasks/:id/comments` | コメント追加（`{ body: string }`） |
| PATCH | `/api/comments/:id` | コメント編集（`{ body: string }`） |
| DELETE | `/api/comments/:id` | コメント削除 |

### Admin

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/update` | アプリアップデート（git pull → npm install → prisma db push） |

---

## 10. UI 仕様

### 優先度

| 優先度 | バッジカラー |
|--------|------------|
| low（低） | 青（bg-blue-100 / text-blue-700） |
| medium（中） | 黄（bg-yellow-100 / text-yellow-700） |
| high（高） | 赤（bg-red-100 / text-red-700） |

### ステータス

| ステータス | 表示名 | バッジカラー |
|-----------|-------|------------|
| open | オープン | 緑 |
| in_progress | 着手 | 青 |
| resolved | 解決済み | 緑 |
| on_hold | 保留 | 黄 |
| closed | クローズ | グレー |

### スプリントステータス

| ステータス | 表示名 | バッジカラー |
|-----------|-------|------------|
| planning | 計画中 | グレー |
| active | アクティブ | 緑 |
| completed | 完了 | 紫 |

---

## 11. ファイル構成

```
task-manager/
├── app/
│   ├── api/
│   │   ├── tasks/
│   │   │   ├── route.ts              # GET / POST
│   │   │   ├── reorder/route.ts      # POST（並び替え）
│   │   │   └── [id]/
│   │   │       ├── route.ts          # PATCH / DELETE
│   │   │       └── comments/route.ts # GET / POST
│   │   ├── sprints/
│   │   │   ├── route.ts              # GET / POST
│   │   │   ├── reorder/route.ts      # POST（並び替え）
│   │   │   └── [id]/route.ts         # PATCH / DELETE
│   │   ├── projects/
│   │   │   ├── route.ts              # GET / POST
│   │   │   └── [id]/route.ts         # PATCH / DELETE
│   │   ├── epics/
│   │   │   ├── route.ts              # GET / POST
│   │   │   ├── reorder/route.ts      # POST（並び替え）
│   │   │   └── [id]/route.ts         # PATCH / DELETE
│   │   ├── comments/
│   │   │   └── [id]/route.ts         # PATCH / DELETE
│   │   └── admin/
│   │       └── update/route.ts       # POST（アップデート）
│   ├── layout.tsx
│   ├── page.tsx                      # メイン画面（クライアントコンポーネント）
│   └── globals.css
├── lib/
│   └── prisma.ts                     # Prisma クライアント（シングルトン）
├── prisma/
│   ├── schema.prisma                 # DB スキーマ定義
│   └── dev.db                        # SQLite データベースファイル（gitignore対象）
└── docs/
    └── spec.md                       # 本仕様書
```

---

## 12. 起動方法

```bash
# 依存パッケージのインストール
npm install

# DB スキーマ反映（初回・スキーマ変更時）
npx prisma db push

# 開発サーバー起動
npm run dev
```

アクセス URL: `http://localhost:3000`

> **注意**: `prisma/dev.db` と `.env` は `.gitignore` で除外されています。コミットしないでください。
