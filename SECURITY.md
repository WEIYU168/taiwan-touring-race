# 資安說明

這是一個純前端的 WebGL 賽車遊戲，加上一個很小的線上對戰中繼伺服器（Cloudflare Worker + Durable Object，或本機的 `server.js`）。
**沒有帳號、沒有密碼、沒有資料庫、不收集個資**，伺服器只在記憶體裡暫存房間與車輛位置，房間結束就消失。

## 已做的防護

| 面向 | 做法 |
|---|---|
| 跨站濫用 | WebSocket 與 `/api/*` 只接受同源：別的網站不能用瀏覽器偷連你的伺服器、偷預約名額（`Origin`／`Sec-Fetch-Site` 檢查） |
| 流量洪水 | 每條連線訊息最大 4 KB、每秒補 50 則（最多連發 90 則），超量丟棄、持續超量踢掉；連線後 10 秒內沒加入房間就斷線 |
| 佔位／癱瘓 | 線上總人數上限 96；同一個 IP 同時最多 24 人（含預約）；每個 IP 的請求頻率限制（超過回 429） |
| 惡意資料 | 伺服器轉送前把所有數值轉成有限數字並夾在合理範圍（NaN／null／1e308 不會傳給別人）；玩家端收到後再檢查一次 |
| 名稱 | 去掉控制字元、零寬字元、文字方向反轉字元，最長 8 字；畫面一律用 `textContent` 顯示，沒有 XSS 路徑 |
| 瀏覽器端 | 內容安全政策（CSP）：只執行本頁那一段內嵌腳本（sha256 雜湊）、連線只准回本站；`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy: no-referrer`、HSTS |
| 除錯介面 | `window.G`（可傳送車子、改物理）只在 localhost 或網址加 `#debug` 時才存在 |
| 本機伺服器 | 修正網址格式錯誤會讓 `server.js` 當機的問題、路徑穿越檢查改用 `path.resolve` 加分隔符；只回應 GET／HEAD；不提供 `.` 或 `_` 開頭的檔案 |
| 儲存庫 | 歷史紀錄已掃描：沒有金鑰、密碼或個資；提交作者為 GitHub noreply 信箱；`.gitignore` 排除 `.env`、`.dev.vars`、`*.pem` 等 |

## 已知限制（刻意不處理或無法處理）

- **車輛位置由玩家自己的瀏覽器計算**（沒有伺服器端物理），所以有人可以作弊（例如亂報位置、完賽時間）。這是娛樂用遊戲，沒有排行榜獎勵；伺服器只保證「不會用惡意資料弄壞別人的畫面」。
- 房號是 4～6 個英數字，知道房號就能加入沒滿、還沒開賽的房間（這是設計：把房號給朋友）。
- 本機 `server.js` 用 http（不加密）且預設監聽區網；只想自己用請 `HOST=127.0.0.1 node server.js`。
- 頁面向 Google Fonts 載入字型（對方會看到訪客 IP）。想完全不連外部，可改成自己託管字型。
- `workers.dev` 網址裡的帳號子網域可能是 Email 前綴；想隱藏請在 Cloudflare 後台改子網域或綁自己的網域。
- 免費方案的用量額度有限，被大量連線時額度可能先耗盡；可在 Cloudflare 後台加 Rate Limiting／WAF 規則（見下）。

## 建議的帳號端設定（你自己操作）

- GitHub：啟用兩步驟驗證；Settings → Code security 開啟 *Private vulnerability reporting*、*Secret scanning*（公開儲存庫通常預設已開）。
- Cloudflare：啟用兩步驟驗證；Workers → 該 Worker → Settings → 確認沒有放任何 secret／token 在變數裡（本專案不需要）；需要時再加 WAF Rate limiting 規則。

## 回報問題

發現弱點請到 GitHub 儲存庫的 *Security* 頁面私下回報，或開 issue（請勿在 issue 公開可被利用的細節）。
