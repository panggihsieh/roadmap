# Firebase 即時互動投票網頁規劃

## 目標

建立一個類似 Slido 的即時互動投票 MVP。系統需要有觀眾輸入頁、現場輸出頁與主持人管理頁，讓主持人建立題目，觀眾用手機投票，現場大螢幕即時顯示投票結果。

第一版重點是「研習或活動現場可用」，不先做完整會員系統、付費、多活動組織管理或複雜報表。

## 假設

- 使用 Firebase 作為即時資料後端。
- 第一版使用 Cloud Firestore，不使用自架後端。
- 前端可以使用純 HTML/CSS/JavaScript 或 React/Next.js；若只是 MVP，純前端即可。
- 活動由主持人事先建立 session 與題目。
- 觀眾不需要登入，只需要進入投票網址。
- 第一版用瀏覽器產生的匿名 voterId 降低重複投票，不保證完全防作弊。
- 現場輸出頁需要即時更新，但不需要毫秒級動畫精準度。

## 核心頁面

### 1. 觀眾投票頁

路徑：

```text
/vote/:sessionId
```

用途：

- 顯示目前啟用中的題目。
- 顯示選項。
- 讓觀眾送出一票。
- 投票後顯示已投票狀態。
- 若目前沒有開放題目，顯示等待畫面。

### 2. 現場輸出頁

路徑：

```text
/screen/:sessionId
```

用途：

- 給投影或大螢幕使用。
- 顯示目前題目。
- 即時顯示每個選項的票數與百分比。
- 顯示總票數。
- 當主持人切換題目時自動更新。

### 3. 主持人管理頁

路徑：

```text
/admin/:sessionId
```

用途：

- 建立或編輯題目。
- 設定目前啟用的題目。
- 開始投票。
- 結束投票。
- 重置測試票數。

第一版可以先用簡單密碼或 Firebase Console 手動建立 session。若時間有限，管理頁可延後，先用 Firebase Console 維護資料。

## Firebase 服務選擇

### 必要

- Firebase Hosting：部署前端網頁。
- Cloud Firestore：儲存 session、題目、選項與投票資料。

### 可選

- Firebase Authentication：若需要主持人登入再加入。
- Firebase Security Rules：第一版也需要基本規則，避免任意覆寫資料。
- Firebase Functions：第一版不一定需要；若未來要嚴格防重複投票或彙總票數，再加入。

## Firestore 資料模型

### sessions

```text
sessions/{sessionId}
```

欄位：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| title | string | 活動名稱 |
| activeQuestionId | string | 目前啟用的題目 ID |
| status | string | `draft`、`open`、`closed` |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |

### questions

```text
sessions/{sessionId}/questions/{questionId}
```

欄位：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| text | string | 題目文字 |
| options | array | 選項清單 |
| status | string | `draft`、`open`、`closed` |
| order | number | 題目排序 |
| createdAt | timestamp | 建立時間 |

選項格式：

```json
[
  { "id": "a", "text": "選項 A" },
  { "id": "b", "text": "選項 B" },
  { "id": "c", "text": "選項 C" }
]
```

### votes

```text
sessions/{sessionId}/questions/{questionId}/votes/{voterId}
```

欄位：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| optionId | string | 投給哪個選項 |
| voterId | string | 瀏覽器端產生的匿名 ID |
| createdAt | timestamp | 投票時間 |

使用 `{voterId}` 當 document ID，可以讓同一個瀏覽器對同一題只保留一票。

## 即時同步方式

觀眾投票頁：

1. 監聽 `sessions/{sessionId}`。
2. 取得 `activeQuestionId`。
3. 監聽目前題目資料。
4. 送出投票時寫入 `votes/{voterId}`。

現場輸出頁：

1. 監聽 `sessions/{sessionId}`。
2. 取得 `activeQuestionId`。
3. 監聽目前題目資料。
4. 監聽目前題目的 `votes` collection。
5. 前端即時計算每個選項的票數與百分比。

第一版可由前端即時計算票數。若票數很多或活動規模變大，再改成 Cloud Functions 維護彙總結果。

## 第一版功能範圍

### 觀眾端

1. 進入投票頁。
2. 顯示目前題目與選項。
3. 點選選項送出投票。
4. 同一題同一瀏覽器只能保留一票。
5. 顯示已投票狀態。
6. 題目關閉時不能投票。

### 輸出端

1. 顯示目前題目。
2. 顯示每個選項的票數。
3. 顯示每個選項的百分比。
4. 顯示總票數。
5. 投票新增後即時更新。
6. 題目切換後自動切換畫面。

### 主持人端

1. 顯示 session 題目清單。
2. 新增題目與選項。
3. 設定 activeQuestionId。
4. 開啟或關閉投票。
5. 清除測試票數。

## 暫不納入第一版

- 多主持人權限。
- 觀眾登入。
- 嚴格防作弊。
- Q&A 留言牆。
- 文字雲。
- 排行榜。
- 匯出 Excel。
- 多語系。
- 付款或活動方案限制。
- Cloud Functions 彙總票數。

## Firebase 安全規則方向

第一版至少要做到：

- 任何人可以讀取公開 session、question 與 vote 結果。
- 觀眾只能建立或更新自己的 vote document。
- 觀眾不能修改 session 或 question。
- 主持人管理寫入需要額外保護。

若第一版不做主持人登入，建議先不要公開管理頁，改由 Firebase Console 手動管理資料。正式使用前再加入 Firebase Authentication。

## 執行步驟與驗證

1. 建立 Firebase 專案
   - 產出：Firebase project、Web app config。
   - 驗證：本機前端可以初始化 Firebase app，console 沒有初始化錯誤。

2. 建立 Firestore 資料結構
   - 產出：一筆 session、一題 question、三個 options。
   - 驗證：Firebase Console 可看到 `sessions/{sessionId}/questions/{questionId}`。

3. 建立觀眾投票頁
   - 產出：`/vote/:sessionId` 可顯示目前題目。
   - 驗證：點選選項後，Firestore 出現 `votes/{voterId}`。

4. 建立現場輸出頁
   - 產出：`/screen/:sessionId` 可顯示投票結果。
   - 驗證：另一個瀏覽器投票後，輸出頁不用重新整理就更新票數。

5. 實作題目開關狀態
   - 產出：`open` 時可投票，`closed` 時不可投票。
   - 驗證：Firestore 將題目改為 `closed` 後，投票頁按鈕停用。

6. 實作主持人最小管理能力
   - 產出：可以切換 activeQuestionId 與開關投票。
   - 驗證：管理頁切換題目後，投票頁與輸出頁同步切換。

7. 加入基本 Security Rules
   - 產出：Firestore rules。
   - 驗證：觀眾不能直接改 session 或 question，只能寫自己的 vote。

8. 部署到 Firebase Hosting
   - 產出：公開網址。
   - 驗證：手機打開投票頁、電腦打開輸出頁，可以完成一次即時投票。

## 建議技術選擇

若要最快完成 MVP：

```text
純 HTML/CSS/JavaScript
+ Firebase Web SDK
+ Cloud Firestore
+ Firebase Hosting
```

若後續要做成較完整產品：

```text
React 或 Next.js
+ Firebase Web SDK
+ Cloud Firestore
+ Firebase Authentication
+ Firebase Hosting
```

## 成功標準

- 觀眾可以用手機進入投票頁並完成投票。
- 現場輸出頁可以即時顯示票數變化。
- 主持人可以切換目前題目。
- 同一題同一瀏覽器不會重複新增多筆票。
- 題目關閉後不能再投票。
- Firebase Hosting 部署後，手機與桌面都能正常使用。
- Firestore rules 不允許觀眾修改題目或活動設定。
