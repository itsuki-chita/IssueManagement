# IssueManagement

Jira ライクな課題管理アプリです。プロジェクト・スプリント・タスクを管理でき、バックログ・スプリントビュー・カンバンボードを切り替えて利用できます。

## 機能

- **プロジェクト管理** — 色・課題キー (例: `PRJ`) でプロジェクトを作成
- **スプリント管理** — スプリントへのタスク割り当て・ドラッグ&ドロップ並び替え
- **タスク管理** — ステータス・優先度・期限・担当スプリント・プロジェクトを管理
- **課題キー** — `PRJ-1` 形式の自動採番。クリックでタスク詳細画面へ遷移
- **階層タスク** — サブタスクの作成・チェック・ナビゲーション対応
- **ビュー切替** — リストビュー / スイムレーン (Kanban) ビュー
- **Markdown メモ** — タスクの説明欄で Markdown 記述・プレビュー
- **コメント** — タスクごとにコメントを追加・編集・削除

## 技術スタック

| 用途 | ライブラリ |
|------|-----------|
| フレームワーク | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS |
| DB | SQLite (Prisma 5) |
| DnD | @dnd-kit/core, @dnd-kit/sortable |
| Markdown | react-markdown + remark-gfm |

---

## セットアップ

### 前提条件

- **Node.js v20 以上** （v20.14.0 で動作確認済み）
  - [https://nodejs.org](https://nodejs.org) からインストール
- **npm** (Node.js に同梱)

### 手順

#### 1. リポジトリをクローン

```bash
git clone https://github.com/itsuki-chita/IssueManagement.git
cd IssueManagement
```

#### 2. 依存パッケージをインストール

```bash
npm install
```

#### 3. 環境変数ファイルを作成

プロジェクトルートに `.env` ファイルを作成し、以下を記述します。

```env
DATABASE_URL="file:./prisma/dev.db"
```

#### 4. データベースを初期化

```bash
npx prisma db push
```

> 初回実行時に `prisma/dev.db` が自動生成されます。

#### 5. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

---

## コマンド一覧

| コマンド | 説明 |
|----------|------|
| `npm run dev` | 開発サーバー起動 (ホットリロード付き) |
| `npm run build` | 本番用ビルド |
| `npm start` | 本番サーバー起動 |
| `npx prisma studio` | DB の GUI ブラウザを起動 |
| `npx prisma db push` | スキーマ変更を DB に反映 |

---

## ディレクトリ構成

```
IssueManagement/
├── app/
│   ├── api/                  # API ルートハンドラー
│   │   ├── tasks/            # タスク CRUD + 並び替え
│   │   ├── sprints/          # スプリント CRUD + 並び替え
│   │   ├── projects/         # プロジェクト CRUD
│   │   └── comments/         # コメント CRUD
│   ├── page.tsx              # メイン UI（シングルページ）
│   └── layout.tsx
├── prisma/
│   ├── schema.prisma         # データモデル定義
│   └── migrations/           # マイグレーション履歴
├── lib/
│   └── prisma.ts             # Prisma クライアント
└── .env                      # 環境変数（要作成、git 管理外）
```

---

## 注意事項

- SQLite を使用するため、サーバーレス環境 (Vercel Edge など) では動作しません。Node.js ランタイムが必要です。
- `prisma/dev.db` および `.env` は `.gitignore` で除外されています。クローン後は必ずセットアップ手順を実施してください。
