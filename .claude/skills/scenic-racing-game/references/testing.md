# 測試與除錯

## 三道檢查

1. `node <技能>/scripts/check-route.js <專案> <key>`：不需瀏覽器，幾秒完成。
2. `node build.js`：在專案資料夾執行。
3. `node <技能>/scripts/headless-check.mjs <專案> <key> [截圖資料夾]`：無頭 Chrome，約 30–60 秒。
   - 需要 Playwright：`npm i -D playwright && npx playwright install chromium`。
   - 自備 Chrome 時設 `CHROME_PATH`。
   - Playwright 裝在別處時設 `PLAYWRIGHT_PATH=<路徑>/playwright/index.mjs`。

無頭模式用軟體繪圖：一幀要好幾秒，**量不到真實幀率**。回報時要說明幀率沒在真機上測。

## 瀏覽器 console 除錯介面 `window.G`

| 指令 | 作用 |
|---|---|
| `G.loadRoute('key')` | 載入路線（Promise） |
| `G.route()` | 目前路線設定 |
| `G.GAME.selMode = 'time'; G.begin()` | 開始單車計時；`'race'` 為 8 車賽 |
| `G.sim(n)` | 推進 n 個物理步（1/60 秒） |
| `G.GAME.autoTest = 0.93` | 玩家車沿賽車線自動駕駛（數值＝速度比例） |
| `G.GAME.testLane = d` | 搭配 autoTest，改沿固定車道 d |
| `G.place(G.GAME.player, s, d)` | 傳送 |
| `G.GAME.camMode = 0..4` | 追尾／遠追／引擎蓋／車內／環景 |
| `G.GAME.camYaw`、`G.GAME.camPitch`、`G.GAME.camDist` | 調整鏡頭 |
| `G.tod('dawn' \| 'day' \| 'dusk')` | 時段 |
| `G.GAME.hud = false` | 隱藏介面（截圖用） |
| `window.__cam = [眼x, 眼y, 眼z, 看x, 看y, 看z]` | 固定鏡頭；`null` 取消 |
| `G.HAZ` | 愛心、緩衝車、油罐車位置 |
| `G.hit(car, dirX, dirZ, 速度)` | 模擬撞擊 |
| `G.PROPS.plan` | 所有地標的位置 |

截圖前設 `window.__manual = true`，每次改鏡頭後讓它畫兩幀。做法見 `headless-check.mjs`。

## 截圖要看什麼

- 海、山、平原在正確的一側（海岸路線海在右側 d<0）。
- 各段植被、建物符合查到的資料，段與段之間有變化。
- 地標在正確的段落、外形可辨識、沒有浮空或埋進地裡。
- 路面兩側沒有怪異高牆、斷崖或尖刺。
- 天空遠山方向正確。

## 常見問題

| 症狀 | 原因與修法 |
|---|---|
| 路被夾在高牆之間 | `plain()` 在路附近比路面高，被「取最大值」蓋過。讓靠近賽道的基準地形低於路面，或調小 `bkL`／`bkR` |
| 路邊地形尖刺、摺痕 | 彎道太急或賽道兩段太近。放寬彎道、拉開距離（`check-route.js` 會提示） |
| 一側一片光禿 | 該側 `plL`/`plR` 太小，地形掉到海平面以下、或 `seaMin` 擋住植被 |
| 海面出現在山上 | `sea` 設太高，或 `plain()` 有地方低於 `sea` |
| 自動駕駛跑不完、拋錨 | 某處太窄或彎太急，玩家物理撞牆累積到 10 次。看 `headless-check` 報的 s 位置，修那附近的 pieces 或 `hwFn` |
| 對手完賽 < 7 | 對手卡在事件路段或路口，通常也是太窄。把 `hwFn` 加寬到 ≥ 4.7 |
| 載入失敗、畫面全黑 | 看 console 錯誤。常見：欄位拼錯、`zones` 沒覆蓋到 `sEnd`、`plain()` 回傳 NaN |
| 地標看不到 | `y` 太低被地形埋住、`r` 太小被樹擋住、或距離道路 > 1600 m 被裁切 |
| 新貼圖層顯示成別的圖 | `PL` 編號與 `L.push` 的順序不一致 |
| 線上對戰載到別條路 | `server.js` 的 `ROUTES` 白名單沒加這條 |

## 回報給使用者的內容

- 能玩什麼、怎麼開始。
- 資料來源。
- 濃縮比例，以及哪些是編排的（彎道形狀、里程對應）。
- 沒驗證的部分（真機幀率、觸控手感、音效）。
- 已知粗糙處（例如地標近看較簡略）。
