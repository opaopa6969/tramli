# @unlaxer/tramli-react

tramli の React フック。`useFlow` が FlowEngine + FlowStore + FlowInstance のライフサイクルをコンポーネントに統合します。

## インストール

```bash
npm install @unlaxer/tramli-react @unlaxer/tramli react
```

## 使い方

```tsx
import { useFlow } from '@unlaxer/tramli-react';

function AuthPage() {
  const { state, context, resume, error, isLoading, flowId } = useFlow(authFlowDefinition, {
    initialData: new Map([['RequestOrigin', { returnTo: '/' }]]),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBanner error={error} />;
  if (state === 'MFA_PENDING') return <MfaForm onSubmit={code => resume(new Map([['MfaCode', code]]))} />;
  if (state === 'COMPLETE') return <Dashboard />;
  return <LoginRedirect />;
}
```

## API

### `useFlow<S>(definition, options?)`

| 引数 | 型 | 説明 |
|---|---|---|
| `definition` | `FlowDefinition<S>` | tramli フロー定義 |
| `options.initialData` | `Map<string, unknown>` | 初期データ |
| `options.sessionId` | `string` | セッション ID (省略時は自動生成) |

### 戻り値 (`UseFlowResult<S>`)

| フィールド | 型 | 説明 |
|---|---|---|
| `state` | `S \| null` | 現在のフロー状態 |
| `context` | `FlowContext \| null` | フローコンテキスト |
| `flowId` | `string \| null` | フローインスタンス ID |
| `error` | `Error \| null` | 直近のエラー |
| `isLoading` | `boolean` | startFlow/resume 実行中 |
| `resume` | `(data?) => Promise<void>` | 外部データでフローを再開 |

## 動作

- `FlowEngine` + `InMemoryFlowStore` はマウント時に一度だけ生成 (`useRef`)
- `startFlow` は `useEffect` で非同期実行
- `resume` は `useCallback` で安定参照
- 各操作後に `FlowInstance` から React state を同期
- エラーは `error` フィールドに格納 (throw しない)
- 操作中は `isLoading = true`

## License

MIT
