// ───────────────────────── 三條路線 ─────────────────────────
let ROUTE = null;
const noBridge = () => 0, noOverride = () => -1;
const brown2 = i => cellUV(i, 2, 4);
const ROUTES = {
  // ── 縣道 139：八卦山大佛 → 松柏嶺受天宮
  r139: {
    key: 'r139', shield: '139', title: '139 稜線', sub: '八卦山大佛 → 松柏嶺受天宮', tag: '山稜・茶園',
    desc: '沿八卦台地稜線南行：相思樹與小葉欖仁綠色隧道、紅土鳳梨田、常起霧的 19K–23K 連續彎、南投八卦茶園，左望中央山脈、右瞰彰化平原。',
    note: '實際 35.5 km 濃縮為 12 km；地標順序、走向與各段地景依實境配置，里程與海拔為近似對應。季節設定為 11 月：落羽松轉紅、芒草抽穗。',
    pieces: PIECES, sections: SECTIONS, landmarks: LANDMARKS, elev: ELEV, realAlt: REAL_ALT, zkeys: ZKEYS, zones: ZONES, junctions: JUNCTIONS,
    fog: [5700, 6900], sStart: 90, sFinish: 12000, sEnd: 12300, heading0: 50, elevNoise: 1, kmMax: 35, attractS: 2380,
    hwFn(si) { let w = 5.0; w = lerp(6.2, w, smooth(180, 320, si)); w = lerp(w, 4.7, smooth(5560, 5680, si) * (1 - smooth(7080, 7200, si))); w = lerp(w, 4.7, smooth(9620, 9720, si) * (1 - smooth(10120, 10220, si))); return lerp(w, 5.8, smooth(11650, 11850, si)); },
    plain: (x, z) => plainH139(x, z), slopeL: 0.36, slopeR: 0.45, gully: 1, bridge: noBridge, sea: -999, seaMin: -999, water: null, soil: [1, 1, 1], ponds: 0, plainPatch: 1, mount: [1, 1, 1, 0],
    landOverride(s, left, ad) { if (s > 5950 && s < 6180 && left && ad < 120) return LU.CYPRESS; if (s > 300 && s < 560 && !left && ad < 150) return LU.TOWN; if (s > 12020 && s < 12200 && left && ad < 110) return LU.TOWN; return -1; },
    streets: [[40, 250], [11700, 12290]], streetSkip: (s, sg) => (s > 11950 && s < 12200 && sg > 0) || (s > 60 && s < 120),
    plan(add, tr) {
      add('buddha', 430, -78, { r: 26, pave: 1, y: trackAt(430, tr).y + 2 }); add('temple', 430, -42, { r: 15, pave: 1, w: 18, dp: 10, plaque: 3, big: 1, face: 'away', y: trackAt(430, tr).y + 1 });
      add('center', 1450, 26, { r: 14, pave: 1 }); add('temple', 7262, 34, { r: 17, pave: 1, w: 16, dp: 9, plaque: 2, big: 0 }); add('sanheyuan', 7900, -36, { r: 20, pave: 1 });
      add('bridge', 9085, -215, { r: 0, flat: false, y: trackAt(9085, tr).y - 4 }); add('resto', 9560, -27, { r: 12, pave: 1 }); add('temple', 12095, 52, { r: 30, pave: 1, w: 26, dp: 14, plaque: 1, big: 1 });
    },
    gates: [{ s: 116, plaque: 0, banner: 0 }, { s: 12000, plaque: 1, banner: 1 }], decal40: [5630, 5990, 6380, 6800, 9700, 9980], zebras: [11820, 160], init() { }
  },
  // ── 墾丁 台26線：南灣 → 鵝鑾鼻 → 龍磐 → 風吹砂
  kenting: {
    key: 'kenting', shield: '台26', title: '墾丁 台26', sub: '南灣 → 鵝鑾鼻 → 龍磐 → 風吹砂', tag: '珊瑚礁海岸・草原',
    desc: '沿台26線貼著巴士海峽：南灣沙灘、墾丁大街、船帆石、鵝鑾鼻燈塔；過了最南端轉向太平洋，爬上龍磐崩崖草原，一路到風吹砂。全程海在右手邊。',
    note: '南灣到風吹砂實際約 22 km，濃縮為 9 km；地標順序與海岸走向依實境配置，里程為近似對應。龍磐草原受落山風吹襲，植被低矮。',
    pieces: [
      [120, 0], [150, -20], [120, 25], [100, 0], [140, -30], [120, 20], [150, 0], [130, -25], [120, 15], [150, 0],
      [200, 0], [120, -15], [180, 0], [130, 20], [170, 0], [140, -25], [160, 0],
      [110, 30], [90, -45], [120, 0], [100, 40], [90, -50], [140, 0], [110, 35], [100, -40], [130, 0], [120, 30], [100, -25], [90, 0], [100, 15], [100, -10],
      [150, 0], [110, 25], [100, -30], [140, 0], [100, 35], [90, -20], [130, 0], [120, 55], [80, 0], [110, 60], [70, 0], [100, 20],
      [120, -30], [100, 45], [90, -50], [130, 0], [110, 40], [100, -55], [90, 50], [150, 0], [120, -35], [110, 40], [160, 0], [100, -30], [110, 25], [140, 0], [120, 30], [110, -40], [140, 0], [100, 10],
      [200, 0], [150, 25], [140, -35], [220, 0], [130, 30], [120, -40], [180, 0], [140, 25], [120, -20], [300, 0],
      [300, 0]],
    sections: [
      { s0: 0, s1: 1300, name: '南灣', sub: '恆春鎮・沙灘與核三廠', k0: 0, k1: 3 },
      { s0: 1300, s1: 2400, name: '墾丁大街', sub: '大尖石山下的街市', k0: 3, k1: 5.5 },
      { s0: 2400, s1: 3900, name: '小灣・船帆石', sub: '珊瑚礁海岸', k0: 5.5, k1: 9 },
      { s0: 3900, s1: 5200, name: '砂島・鵝鑾鼻', sub: '台灣最南端燈塔', k0: 9, k1: 12.5 },
      { s0: 5200, s1: 7300, name: '龍磐公園', sub: '太平洋崩崖草原', k0: 12.5, k1: 18 },
      { s0: 7300, s1: 9000, name: '風吹砂', sub: '佳鵝公路・落山風', k0: 18, k1: 22 }],
    landmarks: [{ s: 90, name: '南灣' }, { s: 1900, name: '墾丁大街' }, { s: 3300, name: '船帆石' }, { s: 5010, name: '鵝鑾鼻燈塔' }, { s: 6400, name: '龍磐公園' }, { s: 9000, name: '風吹砂' }],
    elev: [[0, 6], [400, 8], [1300, 10], [2400, 12], [3000, 18], [3500, 10], [3900, 9], [4600, 14], [5000, 28], [5200, 36], [5800, 58], [6400, 72], [7000, 66], [7300, 70], [8000, 62], [8600, 54], [9000, 50], [9300, 50]],
    realAlt: [[0, 6], [2400, 12], [3900, 9], [5000, 28], [6400, 72], [9000, 50], [9300, 50]],
    zkeys: [
      { s: 0, plL: 420, plR: 30, bkL: 0.05, bkR: -0.1, hs: 0, und: 0.6 }, { s: 1300, plL: 420, plR: 36, bkL: 0, bkR: -0.05, hs: 0, und: 0.5 },
      { s: 2400, plL: 160, plR: 28, bkL: 0.3, bkR: -0.2, hs: 0.1, und: 1.5 }, { s: 3900, plL: 220, plR: 40, bkL: 0.1, bkR: -0.1, hs: 0.05, und: 1.2 },
      { s: 5000, plL: 160, plR: 62, bkL: 0, bkR: -0.1, hs: 0, und: 1 }, { s: 5300, plL: 260, plR: 46, bkL: 0.12, bkR: -0.3, hs: 0.15, und: 2.4 },
      { s: 7300, plL: 320, plR: 80, bkL: 0, bkR: -0.15, hs: 0.05, und: 2 }, { s: 9300, plL: 320, plR: 80, bkL: 0, bkR: -0.15, hs: 0.05, und: 2 }],
    zones: [
      { s0: -100, s1: 1300, id: 'nanwan', w: [0.35, 0, 0, 0, 0.25, 0.15, 0, 0.25, 0, 0, 0, 0], row: { sp: 14, ty: 'coconut', p: 0.75 }, dens: 0.7, mix: [['casuarina', 0.35], ['broad', 0.3], ['coconut', 0.15], ['pandanus', 0.2]], palm: 'coconut', poles: 1, pasture: 'pandanus', pastureP: 0.03 },
      { s0: 1300, s1: 2400, id: 'kstreet', town: 1, w: [0.1, 0, 0, 0, 0.1, 0.1, 0, 0.7, 0, 0, 0, 0], row: { sp: 18, ty: 'coconut', p: 0.6 }, dens: 0.5, mix: [['broad', 0.6], ['coconut', 0.4]], palm: 'coconut', poles: 1 },
      { s0: 2400, s1: 3900, id: 'coast', w: [0.55, 0, 0, 0, 0.25, 0.1, 0, 0.1, 0, 0, 0, 0], row: { sp: 10, ty: [['casuarina', 0.5], ['pandanus', 0.3], ['coconut', 0.2]], p: 0.6 }, dens: 0.8, mix: [['casuarina', 0.35], ['broad', 0.35], ['pandanus', 0.3]], palm: 'coconut', pasture: 'pandanus', pastureP: 0.03 },
      { s0: 3900, s1: 5200, id: 'eluanbi', w: [0.6, 0, 0, 0, 0.3, 0, 0, 0.1, 0, 0, 0, 0], row: { sp: 12, ty: [['casuarina', 0.5], ['pandanus', 0.5]], p: 0.5 }, dens: 0.8, mix: [['casuarina', 0.3], ['broad', 0.4], ['pandanus', 0.3]], pasture: 'pandanus', pastureP: 0.03 },
      { s0: 5200, s1: 7300, id: 'longpan', dash: 1, w: [0.08, 0, 0, 0, 0.92, 0, 0, 0, 0, 0, 0, 0], row: { sp: 30, ty: 'pandanus', p: 0.25 }, dens: 0.4, mix: [['pandanus', 0.6], ['shrub', 0.4]], pasture: 'pandanus', pastureP: 0.012 },
      { s0: 7300, s1: 9600, id: 'fengchui', dash: 1, w: [0.06, 0, 0, 0, 0.69, 0, 0, 0, 0, 0, 0.25, 0], row: { sp: 30, ty: 'pandanus', p: 0.25 }, dens: 0.4, mix: [['pandanus', 0.6], ['shrub', 0.4]], pasture: 'pandanus', pastureP: 0.012 }],
    junctions: [], sStart: 90, sFinish: 9000, sEnd: 9300, heading0: 70, elevNoise: 0.35, kmMax: 21, attractS: 2700,
    hwFn(si) { let w = lerp(6.2, 5.0, smooth(180, 320, si)); w = lerp(w, 5.6, smooth(1300, 1400, si) * (1 - smooth(2300, 2400, si))); return w; },
    slopeL: 0.12, slopeR: 0.5, gully: 0.25, bridge: noBridge, sea: 0, seaMin: 0.7, soil: [2.7, 6.2, 9.0], ponds: 0, plainPatch: 0, mount: [0.5, 0.9, 0.8, -PI / 2],
    water: { deep: [0.006, 0.07, 0.3, 1], shallow: [0.03, 0.4, 0.52, 5], beach: 1 },
    landOverride(s, left, ad) { if (!left && s < 5050 && ad > 10) return LU.SAND; if (s > 4940 && s < 5130 && !left) return LU.PASTURE; return -1; },
    streets: [[1380, 2330]], streetSkip: () => false,
    plan(add, tr) {
      add('npp', 30, 330, { r: 0, flat: false, y: 8 }); add('peak', 1900, 640, { r: 0, flat: false, y: 14 }); add('hotel', 2440, 30, { r: 20, pave: 1, seed: 7 });
      add('sailrock', 3300, -135, { r: 0, flat: false, y: -1 }); add('lighthouse', 5010, -70, { r: 14, y: trackAt(5010, tr).y + 1.5 });
    },
    signs: () => [[60, PL.BROWN2, brown2(0), 2.2, 1.1], [1250, PL.BROWN2, brown2(1), 2.2, 1.1], [3150, PL.BROWN2, brown2(2), 2.2, 1.1], [4800, PL.BROWN2, brown2(3), 2.6, 1.3], [5600, PL.BROWN2, brown2(4), 2.2, 1.1], [8300, PL.BROWN2, brown2(5), 2.2, 1.1]],
    gates: [{ s: 116, plaque: -1, banner: 0 }, { s: 9000, plaque: -1, banner: 1 }], decal40: [], zebras: [1500, 1900, 2250],
    init() { const a = trackAt(0, {}), b = trackAt(4960, {}), c = trackAt(9000, {}); this.A = [a.x, a.z]; this.B = [b.x, b.z];
      let l = Math.hypot(b.x - a.x, b.z - a.z); this.n1 = [(b.z - a.z) / l, -(b.x - a.x) / l]; l = Math.hypot(c.x - b.x, c.z - b.z); this.n2 = [(c.z - b.z) / l, -(c.x - b.x) / l]; },
    plain(x, z) { const d1 = (x - this.A[0]) * this.n1[0] + (z - this.A[1]) * this.n1[1], d2 = (x - this.B[0]) * this.n2[0] + (z - this.B[1]) * this.n2[1], dl = Math.min(d1, d2) + 200;
      const land = 2 + fbm(x / 600, z / 600, 3, 81) * 55 * smooth(450, 1700, dl) + ridged(x / 1500, z / 1500, 3, 83) * 170 * smooth(600, 3000, dl);
      return lerp(-7, land, smooth(-150, 250, dl)); }
  },
  // ── 大鵬灣：環灣道路 → 鵬灣跨海大橋 → 國際賽車場
  dapeng: {
    key: 'dapeng', shield: '環灣', title: '大鵬灣 環灣', sub: '濱灣公園 → 跨海大橋 → 國際賽車場', tag: '潟湖・賽車場',
    desc: '逆時針繞行台灣唯一的單口囊狀潟湖：紅樹林濕地與魚塭、越過出海口的鵬灣跨海大橋、青洲濱海的木麻黃，最後衝進大鵬灣國際賽車場的連續彎。',
    note: '環灣一圈實際約 13 km，濃縮為 8 km；全線近乎平坦，僅跨海大橋有起伏。賽車場段的彎道為遊戲編排，非實際賽道圖。',
    pieces: [
      [150, 0], [200, 25], [150, -15], [200, 30], [150, 0], [200, 25], [150, -10],
      [180, 20], [140, -25], [200, 30], [160, 0], [180, 25], [140, -20], [150, 20], [150, 0],
      [150, 20], [120, 0], [500, 15], [130, 20], [200, 10],
      [300, 0], [150, -20], [160, 30], [250, 0], [140, 25], [150, -15], [250, 10],
      [160, 30], [140, -20], [200, 25], [150, 0], [180, 30], [140, -25], [180, 25], [150, 0],
      [120, 30], [150, 0], [70, -90], [60, 0], [70, 100], [90, 0], [60, -110], [50, 0], [70, 120], [120, 0], [80, -70], [60, 0], [90, 95], [100, 0], [110, -40], [400, 0],
      [300, 0]],
    sections: [
      { s0: 0, s1: 1200, name: '濱灣公園', sub: '東港鎮・遊艇碼頭', k0: 0, k1: 2 },
      { s0: 1200, s1: 2500, name: '紅樹林濕地', sub: '魚塭與水筆仔', k0: 2, k1: 4.2 },
      { s0: 2500, s1: 3600, name: '鵬灣跨海大橋', sub: '潟湖唯一出海口', k0: 4.2, k1: 6 },
      { s0: 3600, s1: 5000, name: '青洲濱海', sub: '沙洲・木麻黃林', k0: 6, k1: 8.4 },
      { s0: 5000, s1: 6300, name: '東岸魚塭', sub: '林邊鄉・養殖區', k0: 8.4, k1: 10.6 },
      { s0: 6300, s1: 8000, name: '大鵬灣國際賽車場', sub: '連續彎與大直線', k0: 10.6, k1: 13 }],
    landmarks: [{ s: 90, name: '濱灣公園' }, { s: 3050, name: '鵬灣跨海大橋' }, { s: 4300, name: '青洲濱海' }, { s: 7950, name: '大鵬灣國際賽車場' }],
    elev: [[0, 3.2], [2500, 3.2], [2660, 4.2], [2900, 19], [3050, 21], [3200, 19], [3440, 4.2], [3600, 3.2], [8300, 3.2]],
    realAlt: [[0, 3], [2600, 3], [3050, 21], [3500, 3], [8300, 3]],
    zkeys: [
      { s: 0, plL: 60, plR: 600, bkL: 0, bkR: 0, hs: 0, und: 0.12 }, { s: 1200, plL: 46, plR: 600, bkL: 0, bkR: 0, hs: 0, und: 0.12 }, { s: 2500, plL: 50, plR: 300, bkL: 0, bkR: 0, hs: 0, und: 0.12 },
      { s: 3600, plL: 55, plR: 110, bkL: 0, bkR: 0, hs: 0, und: 0.15 }, { s: 5000, plL: 50, plR: 400, bkL: 0, bkR: 0, hs: 0, und: 0.12 }, { s: 6200, plL: 60, plR: 600, bkL: 0, bkR: 0, hs: 0, und: 0.12 },
      { s: 6400, plL: 600, plR: 600, bkL: 0, bkR: 0, hs: 0, und: 0.1 }, { s: 8300, plL: 600, plR: 600, bkL: 0, bkR: 0, hs: 0, und: 0.1 }],
    zones: [
      { s0: -100, s1: 1200, id: 'park', w: [0.2, 0, 0, 0, 0.45, 0.2, 0, 0.15, 0, 0, 0, 0], row: { sp: 12, ty: 'coconut', p: 0.8 }, dens: 0.7, mix: [['broad', 0.5], ['coconut', 0.3], ['casuarina', 0.2]], palm: 'coconut', poles: 1, pasture: 'coconut', pastureP: 0.03 },
      { s0: 1200, s1: 2500, id: 'mangrove', dash: 1, w: [0.2, 0, 0, 0, 0.05, 0.1, 0, 0.1, 0, 0, 0, 0.55], row: { sp: 16, ty: [['casuarina', 0.6], ['coconut', 0.4]], p: 0.5 }, dens: 1, mix: [['lychee', 0.6], ['shrub', 0.25], ['casuarina', 0.15]], palm: 'coconut', poles: 1 },
      { s0: 2500, s1: 3600, id: 'bridge', w: [0.2, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0.3, 0], row: { sp: 40, ty: 'coconut', p: 0.3 }, dens: 0.5, mix: [['casuarina', 0.6], ['pandanus', 0.4]], pasture: 'pandanus', pastureP: 0.02 },
      { s0: 3600, s1: 5000, id: 'qingzhou', dash: 1, w: [0.4, 0, 0, 0, 0.25, 0.1, 0, 0.05, 0, 0, 0.2, 0], row: { sp: 9, ty: 'casuarina', p: 0.7 }, dens: 0.9, mix: [['casuarina', 0.7], ['pandanus', 0.3]], palm: 'coconut', pasture: 'pandanus', pastureP: 0.03 },
      { s0: 5000, s1: 6300, id: 'east', dash: 1, w: [0.1, 0, 0, 0, 0.05, 0.1, 0, 0.15, 0, 0, 0, 0.6], row: { sp: 15, ty: 'coconut', p: 0.6 }, dens: 0.8, mix: [['lychee', 0.5], ['broad', 0.5]], palm: 'coconut', poles: 1 },
      { s0: 6300, s1: 8600, id: 'circuit', rail: 2, nofarm: 1, nograss: 1, w: [0, 0, 0, 0, 0.6, 0, 0, 0.4, 0, 0, 0, 0], row: { sp: 999, ty: 'coconut', p: 0 }, dens: 0.2, mix: [['broad', 1]], pasture: 'coconut', pastureP: 0.008 }],
    junctions: [], sStart: 90, sFinish: 8000, sEnd: 8300, heading0: -90, elevNoise: 0, kmMax: 12, attractS: 2450,
    hwFn(si) { let w = lerp(6.2, 5.0, smooth(180, 320, si)); return lerp(w, 6.8, smooth(6300, 6420, si)); },
    slopeL: 0.25, slopeR: 0.2, gully: 0, sea: 0, seaMin: 0.7, soil: [1.5, 3.6, 5.4], ponds: 0.3, plainPatch: 1, mount: [0.9, 0.12, 0, 0],
    water: { deep: [0.012, 0.08, 0.26, 1], shallow: [0.05, 0.3, 0.44, 2.5], beach: 0.8 },
    bridge(s) { return smooth(2640, 2720, s) * (1 - smooth(3380, 3460, s)); },
    landOverride(s, left, ad) { if (!left && s > 3650 && s < 4950 && ad > 34) return LU.SAND; return -1; },
    streets: [], streetSkip: () => false,
    plan(add, tr) {
      add('center', 150, -30, { r: 14, pave: 1 }); add('pylon', 3050, trackAt(3050, tr).hw + 3, { r: 0, flat: false, along: 1, y: trackAt(3050, tr).y });
      add('hotel', 6220, -44, { r: 20, pave: 1, seed: 5 }); add('grandstand', 7930, 17, { r: 0, flat: false, y: trackAt(7930, tr).y - 0.3 }); add('pitbox', 7930, -19, { r: 0, flat: false, y: trackAt(7930, tr).y - 0.3 });
    },
    signs: () => [[2400, PL.BROWN2, brown2(6), 2.6, 1.3], [6180, PL.BROWN2, brown2(7), 2.6, 1.3]],
    gates: [{ s: 116, plaque: -1, banner: 0 }, { s: 8000, plaque: -1, banner: 1 }], decal40: [], zebras: [200],
    init() { let cx = 0, cz = 0, n = 0; for (let i = 0; i < 6300 / DS; i += 4) { cx += TR.x[i]; cz += TR.z[i]; n++; } cx /= n; cz /= n; let r = 0; for (let i = 0; i < 6300 / DS; i += 4) r += Math.hypot(TR.x[i] - cx, TR.z[i] - cz); this.C = [cx, cz]; this.R0 = r / n; const b = trackAt(3050, {}); this.Pb = [b.x, b.z]; },
    plain(x, z) { const r = Math.hypot(x - this.C[0], z - this.C[1]); let h = lerp(2.6, -3, smooth(this.R0 - 30, this.R0 - 110, r));
      const q = (x - this.C[0]) * -0.35 + (z - this.C[1]) * 0.94; h = lerp(h, -6, smooth(this.R0 + 200, this.R0 + 330, q));
      const db = Math.hypot(x - this.Pb[0], z - this.Pb[1]); return Math.min(h, lerp(-4, h, smooth(120, 230, db))); }
  }
};
function applyRoute(key) {
  ROUTE = ROUTES[key];
  PIECES = ROUTE.pieces; SECTIONS = ROUTE.sections; LANDMARKS = ROUTE.landmarks; ELEV = ROUTE.elev; REAL_ALT = ROUTE.realAlt; ZKEYS = ROUTE.zkeys; ZONES = ROUTE.zones; JUNCTIONS = ROUTE.junctions;
  S_START = ROUTE.sStart; S_FINISH = ROUTE.sFinish; S_END = ROUTE.sEnd;
}
