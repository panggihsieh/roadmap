# 研習工作坊專案集 (Roadmap)

本儲存庫（Repository）包含以下兩個主要專案：

---

## 1. 🗳️ 大南國小線上投票系統 (vote)

即時互動投票系統，適合研習、課堂或活動現場快速進行類似 Slido 的即時投票。採純前端頁面搭配 Firebase Cloud Firestore。

* **專案路徑**：[vote/](vote/)
* **功能簡介**：
  * **主持人管理頁 (`/vote/adm/`)**：編輯活動名稱、題目與選項，開放/關閉投票，清除票數，設定下載清單 API。
  * **觀眾投票頁 (`/vote/poll/`)**：顯示目前題目與選項，觀眾進行匿名投票，並附有分享用的 QR Code。
  * **現場輸出頁 (`/vote/output/`)**：大螢幕投影專用，即時顯示票數百分比、圓餅圖、排行榜超車提示與倒數封盤功能。
* **詳細文件**：請參閱 [vote/README.md](vote/README.md)

---

## 2. 🗺️ 課程學習地圖 (learningmap)

具備高度美感、互動性與實用價值的「研習課程學習地圖」。

* **專案路徑**：[learningmap/](learningmap/)
* **功能簡介**：
  * **教師與學生雙模式**：學生模式（雙欄版面，專注閱讀）、教師模式（三欄版面，含 CSV 載入與參數設定後台）。
  * **樹狀目錄與連動選取**：支援階層式目錄摺疊/展開，核取方塊支援雙向階層連動與半勾選狀態。
  * **學生專用獨立連結**：可生成專用 URL，點選進入後將完全隱藏教師後台與設定面板。
  * **彈性 PDF 匯出**：可選擇匯出全部、勾選項目或單一項目，具備列印最佳化 CSS。
* **詳細文件**：主要程式結構請參考 [learningmap/index.html](learningmap/index.html) 與 [learningmap/app.js](learningmap/app.js)

---

## 🌐 本機開發與預覽

您可以使用任何簡易 HTTP 伺服器在根目錄啟動專案，例如：

```bash
# 使用 Python 啟動本機伺服器
python -m http.server 8000
```

啟動後，可在瀏覽器打開以下連結進行預覽與開發：
* **投票系統管理頁**：[http://localhost:8000/vote/adm/](http://localhost:8000/vote/adm/)
* **投票系統觀眾頁**：[http://localhost:8000/vote/poll/](http://localhost:8000/vote/poll/)
* **投票系統輸出頁**：[http://localhost:8000/vote/output/](http://localhost:8000/vote/output/)
* **學習地圖網頁**：[http://localhost:8000/learningmap/index.html](http://localhost:8000/learningmap/index.html)
