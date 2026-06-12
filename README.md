# 課程學習地圖 (Roadmap)

本專案旨在提供一個具備高度美感、互動性與實用價值的「研習課程學習地圖」。

## 📂 專案結構

本專案所有的網頁程式碼與範例資料皆位於 [learningmap/](learningmap/) 目錄下：

* **[learningmap/index.html](learningmap/index.html)** - 前端主要結構與雙模式視圖
* **[learningmap/style.css](learningmap/style.css)** - 現代化玻璃擬物樣式、字體優化與 A4 PDF 列印排版
* **[learningmap/app.js](learningmap/app.js)** - 階層樹狀結構解析、雙向連動勾選、PDF 下拉選單與獨立學生網頁連結產生器
* **[learningmap/sample_data.csv](learningmap/sample_data.csv)** - 預設載入之 Andrej Karpathy 訓練心法與 AI 基本觀念範例 CSV

## ✨ 功能亮點

1. **教師與學生雙模式切換**：
   - 學生模式：雙欄版面（左側學習地圖、右側資源描述說明），字體適度放大以提升閱讀易讀性。
   - 教師模式：三欄版面（左側參數與 CSV 載入後台、中間學習地圖、右側資源描述說明）。
2. **階層式樹狀目錄與連動選取**：
   - 點選分類目錄可折疊/展開，亦可點選 header 的快捷按鈕進行一鍵「全部展開」與「全部折疊」。
   - 複選核取方塊（Checkbox）支援雙向階層連動，並會自動產生半勾選（Indeterminate）狀態。
3. **學生專用獨立網頁連結 (獨立開啟)**：
   - 教師後台可即時生成「學生專用獨立連結」（帶有 `?view=student` 及參數的編碼 URL）。
   - 學生點選該連結進入後，**將會完全隱藏右上角切換至教師後台的 toggle 開關與設定邊欄**，確保學生只能專注閱讀地圖，無法進入後台。
4. **彈性 PDF 匯出方案**：
   - 點選「輸出 PDF」下拉選單，可選擇：匯出全部、匯出勾選項目（自動計數）、或匯出單一項目。
   - 整合 CSS 列印最佳化，在列印/儲存 PDF 時自動隱飾所有操作性 UI。

## 🌐 本機開發與預覽

您可以使用任何簡易 HTTP 伺服器啟動專案，例如：

```bash
# 使用 Python 啟動本機伺服器
python -m http.server 8000
```

接著在瀏覽器打開 `http://localhost:8000/learningmap/index.html` 即可進行預覽。
