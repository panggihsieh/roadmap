# 研習魔法

本專案通稱為「研習魔法」，目前包含兩個子專案：

- `vote/`
  即時互動投票系統，適合課堂、研習與活動現場使用。
- `learningmap/`
  以樹狀圖呈現的學習地圖，可讀取 Google Sheet 並輸出學生用分享頁。
- `fishbones/`
  魚骨圖互動編輯器第一版，可拖拉節點並編輯主題與描述。

## Structure

- `index.html`
  專案入口頁。
- `portal.css`
  入口頁樣式。
- `vote/`
  投票系統。
- `learningmap/`
  學習地圖。
- `fishbones/`
  魚骨圖互動編輯器。
- `設計注意事項.md`
  記錄踩坑原因、修正方式與後續設計準則。

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Google Sheets CSV / `htmlview` 讀取
- LocalStorage
- GitHub Pages
- Firebase / Firestore
  使用於 `vote/` 模組

## Local Development

在根目錄啟動靜態伺服器即可：

```bash
python -m http.server 8000
```

開啟：

- `http://localhost:8000/`
- `http://localhost:8000/vote/adm/`
- `http://localhost:8000/vote/poll/`
- `http://localhost:8000/vote/output/`
- `http://localhost:8000/learningmap/index.html`
- `http://localhost:8000/fishbones/`

## Fishbones Notes

- 第一版魚骨圖已完成，採用 `HTML + CSS + Vanilla JavaScript` 製作獨立前端頁面。
- 魚骨圖互動方式與節點畫布設計參考 [antvis/x6](https://github.com/antvis/x6)。
- 目前已支援：主題節點、因果節點、節點拖拉調整、點選後右側編輯主題與描述、遠端 GitHub Pages 開啟。
- 不含後端儲存、多人協作、匯出功能與自動排版。

## Skills Used

- `karpathy-guidelines`
  用來約束本次實作維持最小範圍、先列 plan 再 build，並避免過度設計。

## Learningmap Notes

- 學生頁預設會讀取 Google Sheet 的 `now` tab。
- 所有後端資料庫與 Google Sheet 內容需由使用者自行維護，不在 Web App 上直接維護。
- 樹狀圖排序依 `rank` 欄位數值決定。
- 若 Google Sheet 內容改變，頁面會自動重抓並更新樹狀圖。
- 若正式站沒有立刻反映，優先檢查快取與分享連結參數。

## Task Checklist

- [x] 建立入口頁
- [x] 建立即時投票系統基礎頁面
- [x] 建立學習地圖樹狀圖介面
- [x] 支援 Google Sheet 載入資料
- [x] 限制 learningmap 只讀取 `now` tab
- [x] 支援學生頁分享連結
- [x] 修正學生頁卷軸問題
- [x] 修正 GitHub Pages 快取問題
- [x] 支援 Google Sheet 自動同步更新
- [ ] 補上更清楚的資料來源狀態提示
- [ ] 補上更多正式測試流程文件
