# CLAUDE.md — 台灣房車賽（給 Claude Code）

在專案根目錄執行 Claude Code。先讀完本檔與下方的專案指引再改程式。

## 常用指令
- 建置：`node build.js` → 產出 `public/index.html`（單一自含檔，直接用瀏覽器開即可玩），並同步複製到 `docs/index.html`（GitHub Pages 從 main 的 /docs 發佈：https://weiyu168.github.io/taiwan-touring-race/ ；改完要重新 build 並 push 才會更新）
- 單機玩：雙擊 `public/index.html`
- 多人連線：`node server.js`（或 `start.sh`／`啟動伺服器.bat`），瀏覽器開 http://localhost:8080
- 無頭測試（選用）：`tools/headless-test.mjs` 需要本機有 Chrome 與 `npm i -D playwright`；用法見檔頭。遊戲內除錯 API 掛在 `window.G`（sim、place、begin、hit、loadRoute、GAME…）。

## Cloudflare 部署（線上對戰）
- `wrangler.jsonc` + `worker/index.js`：Worker 提供 `public/` 靜態檔。對戰架構（100 人 ≈ 13 房，每房 8 人）：`GET /api/match` → `Lobby`（單一 Durable Object，只做配對：把人塞進最滿但未滿的房間）；`/ws?room=XXXX` → `Room`（每個房號各一個 Durable Object，最多 8 人，轉送車輛狀態）。`q=1` 的自動配對房間會向 Lobby 回報人數／階段；湊滿 8 人 8 秒後自動出發（`begin('r139','day')`），房主可提前出發；開賽後不再配對。協定與 `server.js` 相同，前端 `netConnect()` 房號留空＝自動配對，本機 server.js 沒有 `/api/match` 時退回開新房。GitHub Pages 版（docs/）只能單機玩，線上對戰要用 Cloudflare 的網址。
- 用量提醒：Durable Object 的 WebSocket 訊息 20 則算 1 次請求；每位玩家每秒約送 15 則，免費方案每天 10 萬次請求，約夠 100 人同時比賽 20 分鐘，超過需升級 Workers Paid。
- 在 Cloudflare 後台用 Workers Builds 連 GitHub 儲存庫 `WEIYU168/taiwan-touring-race`（main 分支），每次 push 自動部署。部署指令 `npx wrangler deploy`，不需要建置指令（`public/index.html` 已提交）。
- 改完程式要先 `node build.js` 再 commit，否則 `public/` 不會更新。

## 工作規則
- 改 `src/` 底下的檔案，不要直接改 `public/index.html`（會被建置覆蓋）。
- 每次修改後跑 `node build.js` 確認沒有錯誤，再開瀏覽器實測。
- 要做新景點路線時，可使用 `.claude/skills/scenic-racing-game` 這個技能。

---

# 給程式助理（Codex 等）的專案指引

## 概觀

- 單頁 WebGL2 遊戲，**零相依**。不要加入 npm 套件、打包工具或外部素材；所有網格、貼圖、音效都在執行時由程式生成。
- `src/js/*.js` 依檔名順序串接成同一個作用域（一個 IIFE），所以各檔的頂層 `const`/`let`/`function` 互相可見。**不要用 import/export**；新增檔案時用數字前綴決定順序（`99_main.js` 必須最後）。
- 改完一律 `node build.js`，產物是 `public/index.html`（單一自含檔）。`src/index.html` 內不可出現字串 `</script`（除了結尾標籤）。
- 介面文字為繁體中文。

## 座標與單位

公尺；+X 東、+Z 南、+Y 上。賽道方向角 θ=0 朝南，θ 增加＝左轉。賽道參數 `s` 是沿中心線的距離，`d` 是橫向偏移（正＝左）。`trackAt(s)`、`trackProject(x,z,hint)` 在 `03_track.js`。

## 檔案

| 檔案 | 內容 |
|---|---|
| `01_math.js` | 數學、雜訊、mat4、視錐 |
| `02_gl.js` | WebGL 輔助、共用 GLSL（`GLSL_HEAD` 的 Frame UBO、`GLSL_LIGHT` 的陰影／霧／光照）、`MB` 靜態網格建構器、路線資源追蹤 `RES`／`freeWorld()` |
| `03_track.js` | 139 路線資料（`PIECES` 等）、`buildTrack()`、賽車線與速度剖面 `TR.rl`／`TR.rv` |
| `04_terrain.js` | 地形高度函數 `terrainHraw`、土地利用 `landUseAt`、地形網格與著色器（含海面、魚塭） |
| `05_textures.js` | Canvas 生成的貼圖：地表、葉片、建物／標誌（`PL` 圖層索引）、路面噴字 |
| `06_road.js` | 路面與路肩網格、標線著色器、貼花 |
| `07_sky.js` | 大氣散射 LUT、雲、遠山、時段 `TOD` |
| `08_render.js` | 畫質等級 `QUALITY`、陰影層級、HDR 後製、`renderFrame()` |
| `10_veg.js` | 樹種 `SPECIES`、遠景貼片烘焙、植被配置 `placeVegetation()` |
| `11_props.js` | 建物、地標、護欄、標誌；`PROP_EXTRA` 是各路線專屬地標 |
| `12_car.js` | 房車放樣網格、外觀套件、車牌、車漆著色器（含面板縫、燈組、輪圈細節）、毀損變形 `CAR_DEFORM`、塗裝 `LIVERIES`、拋錨車主模型與動作 `drawDriver` |
| `13_game.js` | 車輛物理 `stepPlayer`、對手 `stepAI`、鏡頭、HUD、音效、賽事流程 |
| `14_routes.js` | **三條路線的全部設定 `ROUTES`** 與 `applyRoute()` |
| `15_net.js` | 線上對戰用戶端（協定寫在檔頭） |
| `17_events.js` | 路上事件：修復愛心、防撞緩衝車（撞到翻兩圈）、油罐車漏油（壓到打轉）、對手閃避 `aiAvoid`、起霧強度 `fogAt` |
| `16_fx.js` | 碰撞毀損登錄 `registerHit`、冒煙／塵土粒子、拋錨流程 `breakDown`／`stepBreakdown` |
| `99_main.js` | 啟動、`loadRoute()`、UI 與輸入綁定、主迴圈 |
| `server.js` | 靜態檔案 + WebSocket 中繼（手寫訊框，無相依） |

## 常見修改

- **新增路線**：在 `14_routes.js` 的 `ROUTES` 加一筆（照 `kenting` 的欄位），並在 `src/index.html` 的 `#sRoute` 與 `server.js` 的 `ROUTES` 白名單各加一項。`pieces` 是 `[長度m, 轉角°]`（正＝左轉），各段 `sections`／`zones`／`zkeys` 的 `s` 範圍要涵蓋到 `sEnd`。`zones[].w` 是土地利用權重，順序見 `LU`。
- **調手感**：`13_game.js` 的 `stepPlayer`（抓地 `mu`、`pac`、穩定輔助 `GAME.aid`、轉向 `dmax`）。
- **調畫質／效能**：`08_render.js` 的 `QUALITY`；自動降級邏輯在 `99_main.js` 的主迴圈。
- **新增地標**：在 `PROP_EXTRA` 寫建構函式，於該路線的 `plan()` 用 `add(type, s, d, {...})` 放置。
- **多人同步**：用戶端每 66 ms 送出 `(s, d, v, 相對偏航)`，遠端車在 `stepRemote` 沿賽道外插再平滑。伺服器只做轉送，不驗證。

## 毀損規則

- 撞護欄（法向速度 > 2.2 m/s）或撞車（側向 > 2.0、追撞 > 2.5 m/s）算一次，0.75 秒內不重複計。
- 第 1–8 次：只影響外觀（凹痕、刮痕、灰塵、玻璃裂痕），性能不變；第 7 次起引擎冒白煙。
- 第 9 次：接近全毀外觀、動力大幅下降（`stepPlayer` 內 `Fd` 乘以係數，極速約 70–80 km/h）。
- 第 10 次：拋錨（`c.broken`），冒濃煙、雙黃燈閃，約 1.5 秒後車主出現在車旁攤手，7.5 秒後顯示「拋錨退賽」。
- 對手車只會累積到 8 次（純外觀），不會拋錨。凹痕最多記 10 個，存在 `c.dents`（每個 4 個數：局部 x y z、強度）。
- 線上對戰會同步撞擊次數、凹痕與拋錨狀態（`s` 訊息的 `k`、`h`、`bk` 欄位）。

## 路上事件

- 位置在 `planHazards()` 依路線長度比例自動挑較直的路段：愛心約 30%、62%，緩衝車約 46%，油罐車約 80%。要固定位置可直接改 `HAZ` 的 s／d。
- 愛心：經過時撞擊次數歸零、凹痕清除（拋錨後無法再吃）。
- 防撞緩衝車：碰到即 `launchCar`，飛起翻兩圈（`ROLL_DUR`），落地速度 10–20 km/h，並算一次撞擊。
- 油漬：壓到即 `startSpin`，打轉三圈前進（`SPIN_DUR`），結束速度 10–20 km/h，不算撞擊；撞到油罐車車身才算撞擊。
- 起霧：路線設定 `fog: [s0, s1]`（目前只有 139 的 19K–23K 連續彎），影響 `uFog.w` 與 `uFogCol.w`。
- 彎道警告：`11_props.js` 依曲率自動在彎道前 75 m 立「左彎／右彎／連續彎路」標誌。
- 測試：`G.GAME.autoTest = 0.95; G.GAME.testLane = d` 可讓車沿指定車道自動行駛。

## 測試

沒有自動化測試。瀏覽器 console 有 `window.G` 除錯介面：`G.loadRoute('kenting')`、`G.begin()`、`G.sim(n)` 推進 n 個物理步、`G.GAME.autoTest = 0.93` 讓玩家車自動沿賽車線跑（驗證物理能跑完全程）、`G.place(G.GAME.player, s, d)` 傳送、`G.hit(G.GAME.player, dirX, dirZ, 速度)` 模擬一次撞擊。

## 已知限制

- 賽道是實際路線的濃縮版，彎道為編排，非 GPS 實測。
- 跨海大橋橋下是實心牆面；車內視角內裝簡略。
- 遠端玩家之間的碰撞只在本地端做推擠，不是權威式判定。

## v1.5.0 車款／方向盤／輕碰
- 車款：`src/js/12_car.js` 的 `CAR_MODELS`（6 款原創房車）。每款有外形參數（cabF/roofF/roofR/cabR、scale、wing、exhaust、opt）與 `phys`（pow 動力、grip 抓地、drag 風阻、stab 穩定、trac 驅動牽引上限、ev 電動）。新增車款＝在陣列加一筆，選單與展示間自動生成。
- 方向盤：`src/js/13_game.js` 的 `STEER`（靈敏／中等／穩重：rate 轉向速度、dmax 最大角、exp 輸入曲線、px 觸控拖曳距離）。設定存在 localStorage `r139_steer`。
- 車與車碰撞（`collideCars`，v1.5.2）：側面擦碰（並排、超車）一律只推開、不計次；前後方向「直接撞」（橫向偏移 < 1.2 m）速度差 > 4.5 m/s 才計次；只擦到車角需速度差 > 9 m/s。
- 撞護欄計次時呼叫 `steerHint()` 提醒「輕點左右」（前 3 次每次，之後間隔 25 秒）。
- 預設時段改為「晴日」`day`（`GAME.tod`、`99_main.js` 的 `setTimeOfDay`、`#sTod` 按鈕、`server.js` 預設值）。
- 水面（v1.5.2）：海面依深度與距離做淺青藍→深藍漸層（`TERRAIN_FS`，顏色在各路線 `water.deep/shallow`）；魚塭堤岸淺、中央深藍。
- 方向盤手感（v1.5.1）：`STEER` 多了 `kb`（鍵盤輸入爬升速度）；鍵盤輸入在 `readInput` 內漸進爬升（高速更慢）並套 1.35 次方曲線；`stepPlayer` 的最低轉角隨車速遞減、反打回正倍率 1.6。
- 畫面（v1.5.1）：`08_render.js` 新增 SSAO（`POST_AO_FS`，半解析度、`QUALITY.ao`）與太陽光束（`POST_RAYS_FS`，`QUALITY.rays`），場景 FBO 改用可取樣深度貼圖 `REN.scene.dtex`；車內視角時兩者關閉。車漆有金屬亮片、清漆第二高光與反射中的樹林剪影；`11_props.js` 新增 `person()` 路人、`scooter()` 機車、`windowExtras()` 立體鐵窗與冷氣機。
- 展示間：選車後 `startShowroom(model)`，車開到定位停下後 `showCarCard()` 跳出介紹卡（#carCard）。
