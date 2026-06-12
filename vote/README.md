# 大南國小線上投票

第一版即時互動投票系統，設計目標是讓研習、課堂或活動現場可以快速進行類似 Slido 的即時投票。

系統採純前端頁面搭配 Firebase Cloud Firestore。主持人設定題目，觀眾用手機投票，現場輸出頁即時顯示統計結果。

## 正式網址

- 管理頁：`https://panggihsieh.github.io/workshop/vote/adm/`
- 觀眾投票頁：`https://panggihsieh.github.io/workshop/vote/poll/`
- 現場輸出頁：`https://panggihsieh.github.io/workshop/vote/output/`

## 第一版範圍

### 主持人管理頁

路徑：`/vote/adm/`

- 編輯活動名稱。
- 編輯題目。
- 編輯選項，一行一個選項。
- 儲存題目後同步更新觀眾投票頁與現場輸出頁。
- 開放投票、關閉投票。
- 清除目前題目票數。
- 從管理頁開啟投票頁與輸出頁時，會開新分頁。
- 管理頁保留「投票 / 輸出 / 管理」導覽按鈕。
- 可設定研習下載清單 API URL，讀取 `/download` 專案的 GAS/Google Sheet 下載列表。
- 可手動新增外部 URL、Google Drive 單一連結、PowerShell/命令列與說明。

### 觀眾投票頁

路徑：`/vote/poll/`

- 顯示目前題目與選項。
- 觀眾點選選項即送出投票。
- 送出時有動態按鈕效果，成功後顯示「已送出結果」。
- 同一題同一瀏覽器只保留一票，重新點選會更新答案。
- 投票關閉後，選項不可再點。
- 頁面下方保留「分享投票頁」QR Code，尺寸已放大，方便現場分享。
- 投票頁不顯示管理按鈕，避免非管理者進入管理頁。

### 現場輸出頁

路徑：`/vote/output/`

- 只顯示投票結果，不顯示 QR Code。
- 不顯示「大南國小線上投票」品牌小標，讓畫面更聚焦在投票結果。
- 頁面最上方一排顯示三個狀態框：
  - 倒數秒數與音效開關。
  - 投票狀態。
  - 戰況提示。
- 顯示題目、圓餅圖、排名、票數、百分比與總票數。
- 適合投影或大螢幕，字級與結果卡片已針對遠距閱讀調整。
- 輸出頁不顯示任何管理按鈕。

## 即時投票動態設計

第一版套用 6 個現場互動特性：

1. 即時票數跳動：票數、百分比與總票數會即時更新，新增票數時顯示短暫的 `+1` 效果。
2. 統計動態效果：圓餅圖、長條比例、票數文字會隨投票結果更新。
3. 排行榜超車：選項依票數排序，領先者更換時顯示戰況提示。
4. 倒數與封盤懸念：60 秒提醒倒數；30 秒內變暖色，10 秒內加強提示。倒數只是提醒，不會清空統計圖。
5. 揭曉動畫：投票關閉或提醒時間到後，第一名會被強調，並顯示揭曉提示。
6. 輸出頁遠距可讀：大螢幕上可快速看見題目、排名、票數、百分比、總票數與投票狀態。

## 技術架構

```text
GitHub Pages
  |
  +-- /vote/adm/     主持人管理頁
  +-- /vote/poll/    觀眾投票頁
  +-- /vote/output/  現場輸出頁
  |
  +-- Firebase Web SDK
        |
        +-- Cloud Firestore
```

前端檔案：

- `index.html`：根入口與共用 template。
- `adm/index.html`：管理頁入口。
- `poll/index.html`：投票頁入口。
- `output/index.html`：輸出頁入口。
- `app.js`：路由、Firebase/localStorage store、投票、管理與輸出邏輯。
- `styles.css`：投票頁、管理頁與輸出頁樣式。
- `firebase-config.js`：Firebase Web App 設定。
- `firestore.rules`：Firestore 安全規則。

## Firebase 設定

目前使用 Firebase Web App 設定檔：

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "workshop-vote.firebaseapp.com",
  projectId: "workshop-vote",
  storageBucket: "workshop-vote.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
};
```

當 `firebase-config.js` 有有效設定時，系統使用 Cloud Firestore。若 Firebase 初始化失敗，會退回本機 demo store。

## Firestore 資料模型

```text
sessions/{sessionId}
sessions/{sessionId}/questions/{questionId}
sessions/{sessionId}/questions/{questionId}/votes/{voterId}
```

### session

```text
sessions/demo
```

- `title`：活動名稱。
- `activeQuestionId`：目前啟用的題目 ID。
- `status`：活動狀態。
- `updatedAt`：更新時間。

### question

```text
sessions/demo/questions/q1
```

- `text`：題目文字。
- `options`：選項陣列。
- `status`：`open` 或 `closed`。
- `order`：排序。
- `createdAt`：建立時間。

### vote

```text
sessions/demo/questions/q1/votes/{voterId}
```

- `optionId`：觀眾投給的選項 ID。
- `voterId`：瀏覽器產生的匿名 ID。
- `createdAt`：投票時間。

使用 `{voterId}` 當文件 ID，可以讓同一個瀏覽器在同一題只保留一票。

## 權限與安全限制

第一版為現場研習 MVP，重點是快速可用：

- 觀眾不需要登入。
- 主持人管理頁目前沒有登入驗證。
- 使用瀏覽器匿名 `voterId` 降低重複投票，但不保證嚴格防作弊。
- 正式大型公開活動前，建議加入 Firebase Authentication，限制只有主持人可以修改 session、question 與清除 votes。

目前 Firestore 規則方向：

- 允許公開讀取 session、question 與 vote 結果。
- 觀眾只能建立或更新自己的 vote 文件。
- 管理寫入能力仍需在正式版加入主持人驗證。

## 本機預覽

在 repo 根目錄執行：

```sh
python3 -m http.server 8080
```

開啟：

```text
http://localhost:8080/vote/adm/
http://localhost:8080/vote/poll/
http://localhost:8080/vote/output/
```

## 現場操作流程

1. 主持人開啟 `/vote/adm/`。
2. 輸入活動名稱、題目與選項。
3. 按「儲存題目」。
4. 按「開放投票」。
5. 現場螢幕開啟 `/vote/output/`。
6. 觀眾開啟 `/vote/poll/` 或掃描投票頁 QR Code。
7. 觀眾點選選項完成投票。
8. 輸出頁即時顯示圓餅圖、排名、票數與百分比。
9. 主持人可按「關閉投票」停止投票。
10. 測試或下一輪活動前，可按「清除目前題目票數」。

## 第一版驗收標準

- 管理頁可以儲存活動名稱、題目與選項。
- 管理頁開啟投票頁與輸出頁時會開新分頁。
- 投票頁可以送出投票並顯示送出成功狀態。
- 投票頁下方 QR Code 顯示正常且已放大。
- 輸出頁不顯示 QR Code。
- 輸出頁不顯示品牌小標「大南國小線上投票」。
- 輸出頁沒有管理按鈕。
- 輸出頁可以即時更新票數、百分比、排名與總票數。
- 輸出頁三個狀態框位於頁面最上方並排顯示。
- 輸出頁會顯示研習下載列表，合併 Google Drive 自動掃描項目與管理頁手動新增項目。
- 關閉投票後，觀眾投票頁不可再送出。
- 清除票數後，輸出頁結果歸零。

## 研習下載列表

下載列表分成兩種來源：

```text
Google Drive /download 資料夾
  ↓
/download 專案的 GAS 掃描並寫入 Google Sheet
  ↓
GAS Web App URL 回傳 JSON
  ↓
投票管理頁儲存 API URL
  ↓
輸出頁顯示研習下載列表
```

```text
管理頁手動新增 URL / PowerShell / 命令列
  ↓
儲存在目前 session
  ↓
輸出頁合併顯示
```

管理頁的「研習下載列表」區塊提供：

- `Google Sheet / GAS 下載清單 API URL`：填入 `/download` 專案部署後的 GAS Web App URL。
- `測試讀取`：確認 API 可回傳下載項目。
- `新增手動項目`：新增外部 URL、手動 Drive 連結或 PowerShell/命令列。

輸出頁會合併：

- GAS API 回傳的 Drive/Sheet 項目。
- 管理頁手動新增的 URL/命令列項目。

GAS 端設定請參考：

```text
/download/google-setup.md
```

## 後續建議

- 加入主持人登入與管理權限。
- 支援多題切換與題庫管理。
- 支援自訂 session ID，不只使用 `demo`。
- 支援活動結束後匯出 CSV。
- 加入更完整的防重複投票策略。
- 讓倒數時間可由管理頁設定。
