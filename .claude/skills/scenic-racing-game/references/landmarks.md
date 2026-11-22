# 地標與建物

## 放置：路線的 `plan(add, tr, R)`

```js
plan(add, tr, R) {
  add('lighthouse', 5010, -70, { r: 14, y: trackAt(5010, tr).y + 1.5 });
  add('peak', 1900, 640, { r: 0, flat: false, y: 14 });
}
```

`add(類型, s, d, 選項)` 在賽道 s 處、橫向 d 公尺放置；預設面向道路。

| 選項 | 說明 |
|---|---|
| `r` | 整地半徑（m），並清除該範圍的樹；0＝不整地 |
| `flat: false` | 不整地（大型地形物、水上物體） |
| `y` | 底部高度。預設＝路面 −0.25；可用 `trackAt(s, tr).y + 1` |
| `pave: 1` | 地面改成鋪面（廣場、停車場） |
| `face: 'away'` | 背對道路 |
| `along: 1` | 順著道路方向（橋塔等） |
| `seed` | 亂數種子（建物外觀變化） |

### 現成類型

| 類型 | 內容 | 額外選項 |
|---|---|---|
| `house` | 透天厝 | `w` 寬、`dp` 深、`fl` 樓層 |
| `farm` | 鄉間農舍 | `w`、`dp` |
| `shed` | 鐵皮屋 | `w`、`dp` |
| `temple` | 廟宇 | `w`、`dp`、`plaque` 匾額格、`big` 重簷 |
| `sanheyuan` | 紅磚三合院 | |
| `center` | 玻璃帷幕遊客中心 | |
| `resto` | 景觀餐廳 | |
| `hotel` | 六層飯店 | |
| `buddha` | 坐佛 | |
| `bridge` | 白色吊橋 | |
| `lighthouse` | 燈塔 | |
| `sailrock` | 海中巨石 | |
| `peak` | 尖聳岩峰 | |
| `npp` | 核電廠圍阻體 | |
| `pylon` | 斜張橋塔 | |
| `grandstand` | 賽車場看台 | |
| `pitbox` | 維修區 | |

## 自製新地標：`11_props.js` 的 `PROP_EXTRA`

```js
const PROP_EXTRA = {
  …,
  pagoda(mb, it, R) {   // 局部座標：+Z 面向道路、+X 左、+Y 上，原點在底部中心
    mb.lay(PL.STONE).col(0.85, 0.84, 0.8, 1); mb.box(0, -2.5, 0, 7.5, 3, 7.5, 2);   // 地基往下延伸，斜坡上才不會浮空
    for (let k = 0; k < 7; k++) {
      const y = k * 4.2, w = 6 - k * 0.6;
      mb.lay(PL.CONC).col(0.92, 0.9, 0.84, 1); mb.box(0, y + 1.6, 0, w, 1.6, w, 3);
      mb.lay(PL.TILE_O).col(1, 1, 1, 0.6); mb.cyl(0, y + 3.2, 0, w * 1.5, 0.3, 1.0, 8, false);
    }
  },
};
```

建好後在路線的 `plan()` 呼叫 `add('pagoda', s, d, { r: 12 })`。

**建物一律加一段往下延伸 3–6 m 的地基**：地面不一定剛好平整，沒有地基在斜坡上會看到浮空。

### `MB` 網格 API（`02_gl.js`）

| 方法 | 說明 |
|---|---|
| `mb.col(r, g, b, 材質)` | 設定之後頂點的顏色（0–1，sRGB）與材質碼 |
| `mb.lay(層)` | 貼圖層，`-1`＝無貼圖，其餘用 `PL.*` |
| `mb.box(cx, cy, cz, 半寬x, 半高y, 半深z, uv公尺, 面遮罩)` | 方塊。面遮罩：1 +X、2 −X、4 頂、8 底、16 +Z、32 −Z |
| `mb.cyl(cx, y0, cz, 底半徑, 頂半徑, 高, 分段, 封頂, 封底)` | 沿 Y 的圓柱或圓錐 |
| `mb.ellipsoid(cx, cy, cz, rx, ry, rz, 分段, 環數)` | 橢球 |
| `mb.lathe(cx, cy, cz, [[半徑, 高], …], 分段)` | 旋轉體（塔、瓶、燈） |
| `mb.q4([x,y,z] ×4, u0, v0, u1, v1)` | 四邊形（逆時針朝外） |
| `mb.v(x, y, z, nx, ny, nz, u, v)` ＋ `mb.quad(a, b, c, d)`／`mb.tri` | 自訂網格（例：`peak` 的放射狀高度場） |
| `mb.m` | 設為 4×4 矩陣即可平移／旋轉之後的幾何 |

要旋轉一部分：`const T = M4.create(); M4.mul(T, mb.m, M4.translate(M4.create(), x, y, z)); M4.mul(T, T, M4.rotX(M4.create(), PI / 2)); const m0 = mb.m; mb.m = T; …; mb.m = m0;`

### 材質碼（`col` 的第 4 個參數）

| 範圍 | 材質 |
|---|---|
| `< 0.2` | 自發光（燈） |
| `0.2–0.45` | 金屬／高光（不鏽鋼、玻璃） |
| `0.45–0.75` | 亮面漆（車身、琉璃瓦、油漆） |
| `≥ 0.75` | 霧面（水泥、岩石、木頭、布） |

### 貼圖層 `PL.*`（`05_textures.js`）

- 建材：`CONC` 水泥、`FACADE` 窗立面、`SHOP` 鐵捲門、`BRICK` 紅磚、`TILE_O` 橘琉璃瓦、`TILE_G` 灰瓦、`CORR` 浪板、`STEEL` 鍍鋅鋼、`DOOR` 廟門、`FRIEZE` 彩繪樑、`STONE` 石材、`GLASS` 帷幕、`WIN` 單窗、`TILEWALL` 二丁掛。
- 標誌：`CHEV`、`SPEED`、`WARN`、`WARN2`、`WARN3`、`SHIELD`、`DIR`、`BROWN`、`BROWN2`、`INFO`、`ROADWORK`。
- 其他：`PLAQUE` 匾額、`SHOPSIGN` 招牌、`BANNER`／`BANNER2` 布條、`LIGHT` 燈籠、`ARROWB` 箭頭燈板、`TMA` 黃黑斜紋。

`box` 的 `uv公尺` 參數讓貼圖依實際尺寸重複（例：磚牆 2.6）。

### 新增文字貼圖（觀光指示牌、匾額）

1. 在 `05_textures.js` 的 `buildPropTex()` 結尾 `TEX.prop = texArray(…)` 之前，照「28 觀光指示 2」那段複製一份，改文字陣列，`L.push(c)`。
2. 在檔案開頭的 `PL` 加上新名稱，編號＝目前最大編號＋1（目前最大是 `ROADWORK: 33`）。
3. 路線的 `signs()` 用 `[[s, PL.新名稱, cellUV(格號, 2, 4), 2.4, 1.2], …]`。

## 大型地形物（山峰、岬角）

照 `PROP_EXTRA.peak` 的做法：

1. 寫一個高度函式 `h(x, z)`。
2. 在極座標格點上取樣，並用數值差分算法線。
3. 依坡度與高度上色：陡坡與高處上岩石色、中段上灌叢綠、底部上草地色。
4. 放在離路 300–800 m 處，加 `{ r: 0, flat: false }`。
5. 底部邊緣要低於周圍地面約 20 m，才不會浮空。

外形要對照查到的描述：高度、山頂形狀、哪一側陡、表面是岩石還是森林。

## 確認外觀

在瀏覽器 console 用固定鏡頭看地標：

```js
const b = G.PROPS.plan.find(p => p.type === 'pagoda'); window.__cam = [b.x + 40, b.y + 15, b.z + 30, b.x, b.y + 5, b.z];
```

`window.__cam = null` 取消。
