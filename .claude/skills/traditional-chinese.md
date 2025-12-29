---
name: tc
description: reply to user in Traditional Chinese
---

# tc

## Instructions
When I request you to reply in Traditional Chinese, in the current chat session, reply to user in Traditional Chinese.  
Keeps technical terms, names, nonces, code snippets and everything technical in English.  

### When to Use This Skill

- **ONLY** when I ask you to reply in Traditional Chinese.
- **NEVER** use this skill unless I explicitly request Traditional Chinese responses.


## Examples

### Example 1: Explaining Code Concepts

**User Question:**
```
explain the useEffect hook to me
```

**Skill Response:**

useEffect 是用於處理 side effects 的 hook。它在 component 渲染後執行，可以用來：

1. **資料獲取**：從 API 獲取資料
2. **事件監聽**：添加或移除 event listeners
3. **清理資源**：在 component unmount 時清理

基本語法：

```javascript
useEffect(() => {
  // Side effect logic here
  return () => {
    // Cleanup logic (optional)
  };
}, [dependencies]);
```

dependency array 控制執行時機：
- **空陣列**：只在 mount 時執行一次
- **有依賴項**：依賴項改變時執行
- **不填**：每次 render 後都執行

---

### Example 2: Debugging Code

**User Question:**
```
My React component keeps re-render, what to do?
```

**Skill Response:**

無限 re-render 通常是由以下原因造成的：

1. **useEffect dependency array 問題**
   - 若 dependency array 內的 object 或 function 每次都是新建立的，會導致無限迴圈
   - 解決方案：使用 useMemo 或 useCallback 穩定引用

2. **State 更新在 render 中**

```javascript
// ❌ Wrong
export function MyComponent() {
  const [count, setCount] = useState(0);
  setCount(count + 1); // Updates state during render, causes infinite loop
  return <div>{count}</div>;
}

// ✅ Correct
export function MyComponent() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(count + 1);
  }, []); // Run only once
  return <div>{count}</div>;
}
```

3. **Object 或 array 作為 dependency**
   - 每次 render 時都會建立新的引用
   - 使用 useMemo 或 useCallback 來穩定引用

---

### Example 3: Best Practices

**User Question:**
```
how should I structure my project folders
```

**Skill Response:**

針對一個中等規模的 React project，建議採用以下資料夾結構：

```
src/
├── components/
│   ├── Common/          # Reusable components (Button, Modal, etc)
│   ├── Features/        # Feature components (Login, Dashboard, etc)
│   └── Layouts/         # Layout components (Header, Sidebar)
├── hooks/               # Custom hooks
├── services/            # API calls and external services
├── stores/              # State management (Redux, Context, etc)
├── utils/               # Utility functions
├── styles/              # Global styles
├── constants/           # Constants definition
├── types/               # TypeScript type definitions
└── App.jsx
```

**優點**：
- 清晰的職責分離
- 易於導航和尋找檔案
- 擴展性好

---

### Example 4: Troubleshooting

**User Question:**
```
yarn build failed，how to debug？
```

**Skill Response:**

yarn build 失敗通常有幾個常見原因。試試以下步驟：

1. **clear cache**

```bash
rm -rf node_modules
yarn cache clean
yarn install
```

2. **檢查 TypeScript 錯誤**

```bash
yarn tsc --noEmit
```

3. **檢查 ESLint 問題**

```bash
yarn lint
```

4. **查看詳細的錯誤訊息**

```bash
yarn build --verbose
```

5. **檢查 environment variables**
   - 確保所有必需的 environment variables 都已設定
   - 檢查 .env 檔案是否存在

6. **檢查 memory 不足**

```bash
NODE_OPTIONS=--max_old_space_size=4096 yarn build
```

如果還是有問題，請提供具體的錯誤訊息。

---
