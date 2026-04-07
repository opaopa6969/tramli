# 認証 API 設計（サンプル）

> これは DGE を試すためのサンプル設計ドキュメントです。
> 「この設計を DGE して」と言えば、キャラクターがこの設計の穴を見つけます。

## 概要
JWT ベースのトークン認証 API。ログイン → トークン発行 → リクエストごとにトークン検証。

## エンドポイント
- `POST /api/auth/login` — メール + パスワードでログイン → JWT 発行
- `POST /api/auth/refresh` — リフレッシュトークンで新しい JWT を取得
- `POST /api/auth/logout` — ログアウト
- `POST /api/auth/signup` — 新規ユーザー登録

## トークン仕様
- アクセストークン: JWT, 有効期限 15 分
- リフレッシュトークン: opaque, 有効期限 30 日
- 保存場所: 未定

## データモデル
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 未決事項
- エラーレスポンスの形式
- レート制限
- パスワードリセットフロー
