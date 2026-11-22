// ───────────────────────── 房車模型、材質、毀損與車主 ─────────────────────────
const CARGEO = { L: 4.56, zf: 2.28, wb: 2.7, zw: 1.36, track: 0.80, wr: 0.33 };
// 毀損變形：uDent[i] = (局部座標 xyz, 強度)；uDmg = (全毀程度, 撞擊次數/10, 是否變形, 拋錨)
const CAR_DEFORM = `
uniform vec4 uDent[10]; uniform vec4 uDmg; uniform sampler2D uNoise;
float dentW;
vec3 deformCar(vec3 p){
  dentW = 0.;
  if(uDmg.z < .5) return p;
  vec3 q = p;
  vec3 inward = normalize(vec3(p.x, (p.y - .62)*.55, p.z*.42) + vec3(1e-4));
  for(int i = 0; i < 10; i++){
    vec4 d = uDent[i];
    if(d.w > 0.){
      vec3 e = (p - d.xyz)*vec3(1., 1.25, .8);
      float w = exp(-dot(e, e)/(.09 + d.w*.07));
      float cr = texture(uNoise, vec2(p.z*1.9 + p.y*1.3, p.x*1.7 + p.y) + d.xz*.37).r;
      q -= inward * w * d.w * (.075 + .09*cr);
      dentW += w*d.w;
    }
  }
  float wr = uDmg.x;
  if(wr > 0.){
    float n1 = texture(uNoise, p.xz*.9 + p.y*.7).g - .5;
    q += inward * n1 * .05 * wr;
    q.y += wr*.08*smoothstep(1.05, 1.45, p.z)*smoothstep(.6, .75, p.y)*sin((p.z - 1.)*7.)*(.6 + .4*sign(p.x));
    q.y -= wr*.12*smoothstep(1.85, 2.2, p.z)*smoothstep(.55, .25, p.y)*(p.x > 0. ? 1. : .35);
    q.y -= wr*.08*smoothstep(-1.85, -2.2, p.z)*smoothstep(.6, .3, p.y)*(p.x < 0. ? 1. : .3);
    q.y -= wr*.06*smoothstep(1.1, 1.3, p.y)*smoothstep(.9, .2, abs(p.z + .3));
    q.y -= wr*.16*smoothstep(1.15, 1.28, p.y)*smoothstep(-1.95, -2.1, p.z)*clamp(p.x/.85*.5 + .5, 0., 1.);
  }
  return q;
}`;
const CAR_VS = (d) => GLSL_HEAD + d + CAR_DEFORM + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aUV; layout(location=3) in vec4 aCol;
uniform mat4 uModel;
out vec3 vW; out vec3 vN; out vec3 vO; out vec3 vON; out vec3 vUV; out vec4 vCol; out float vDent;
void main(){ vec3 p = deformCar(aPos); vec4 w = uModel * vec4(p, 1.); vW = w.xyz; vN = mat3(uModel) * aNrm; vO = aPos; vON = aNrm; vUV = aUV; vCol = aCol; vDent = dentW; gl_Position = uViewProj * w; }`;
const CAR_FS = GLSL_HEAD + GLSL_LIGHT + `
in vec3 vW; in vec3 vN; in vec3 vO; in vec3 vON; in vec3 vUV; in vec4 vCol; in float vDent; out vec4 oCol;
uniform vec3 uBody, uAccent; uniform vec4 uP; // mode, spin/plate, brake, speed
uniform float uInside; uniform vec4 uDmg; uniform sampler2D uTex0;
uniform vec4 uCab, uCab2, uCarOpt; // 車款：(cabF, roofF, roofR, cabR)、(B柱, D柱)、(封閉水箱罩, 鍍鉻水箱罩, 玻璃車頂)
float sdBox(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p-c)-h; return max(d.x, d.y); }
float sl(float x){ float w = fwidth(x)*1.2 + .0025; return 1. - smoothstep(.0035, .0035 + w, abs(x)); }
float boxm(vec2 p, vec2 c, vec2 h){ float d = sdBox(p, c, h); return 1. - smoothstep(-.002, .002 + fwidth(d), d); }
void main(){
  vec3 n = normalize(vN); vec3 V = normalize(uCam.xyz - vW);
  bool back = !gl_FrontFacing; if(back) n = -n;
  vec3 base = uBody; float rough = .26, metal = 0., clear = 1., emis = 0.; vec3 ecol = vec3(0.);
  float glass = 0.;
  if(uP.x < .5){
    vec3 p = vO; float ax = abs(p.x);
    // 輪拱開孔
    float wz = abs(abs(p.z) - ${CARGEO.zw.toFixed(2)}); float wd = length(vec2(wz, p.y - .33));
    if(vUV.x < .5 && ax > .55 && wd < .385) discard;
    float lip = smoothstep(.43, .40, wd) * step(vUV.x, .5) * step(.55, ax);
    // 車窗
    float gh = vUV.y;
    float side = step(.5, vUV.x) * step(vUV.x, 1.5);
    float top = step(1.5, vUV.x);
    float sgA = side * smoothstep(.16,.22,gh) * smoothstep(.93,.86,gh) * smoothstep(uCab.x - .19, uCab.x - .27, p.z + (1.-gh)*.4) * smoothstep(uCab.w + .2, uCab.w + .28, p.z - (1.-gh)*.3);
    float bpil = (1. - smoothstep(.05,.03,abs(p.z - uCab2.x))) * (1. - smoothstep(.06,.04,abs(p.z - uCab2.y)));
    float sg = sgA * bpil;
    float ws = top * smoothstep(uCab.y + .08, uCab.y + .14, p.z) * smoothstep(uCab.x - .01, uCab.x - .07, p.z) * smoothstep(.62,.56,ax + (p.z - uCab.y - .08)*.08);
    float rs = top * smoothstep(uCab.w + .04, uCab.w + .1, p.z) * smoothstep(uCab.z - .02, uCab.z - .08, p.z) * smoothstep(.6,.54,ax);
    float gr = uCarOpt.z * top * smoothstep(uCab.z + .08, uCab.z + .14, p.z) * smoothstep(uCab.y - .02, uCab.y - .08, p.z) * smoothstep(.5,.44,ax);
    glass = max(max(sg, gr), max(ws, rs));
    if(uInside > .5 && glass > .5) discard;
    if(back){ oCol = vec4(fogged(vec3(.012), vW), 1.); return; }
    float up = smoothstep(.45, .7, vON.y), sideS = 1. - smoothstep(.35, .6, abs(vON.y)), body = 1. - glass;
    // 塗裝：側面斜紋、車頂與引擎蓋飾條、車號圓
    float stripe = smoothstep(.02,.0, abs(p.y - .52 - p.z*.07) - .09) * (1.-top) * step(p.y, .9);
    float roofS = top * smoothstep(.02,.0, ax - .16) * step(uCab.z + .04, p.z) * step(p.z, uCab.y + .08) * (1. - uCarOpt.z);
    float hoodS = up * smoothstep(.02,.0, ax - .16) * step(.86, p.z);
    base = mix(base, uAccent, max(stripe, max(roofS, hoodS)));
    float num = smoothstep(.2,.185, length(vec2(p.z + .28, p.y - .64))) * sideS * step(.8, ax);
    base = mix(base, vec3(.92), num);
    // 窗框黑色飾條與窗下鍍鉻
    float trim = side * (sgA * (1. - bpil) + clamp(smoothstep(.1,.16,gh) * smoothstep(.97,.93,gh) * smoothstep(uCab.x - .13, uCab.x - .21, p.z + (1.-gh)*.4) * smoothstep(uCab.w + .12, uCab.w + .22, p.z - (1.-gh)*.3) - sgA, 0., 1.));
    base = mix(base, vec3(.012), trim); rough = mix(rough, .35, trim);
    float chrome = side * smoothstep(.115,.13,gh) * smoothstep(.16,.145,gh) * step(uCab.w + .2, p.z) * step(p.z, uCab.x - .23);
    base = mix(base, vec3(.62), chrome); metal = max(metal, chrome);
    // 面板縫
    float seam = 0.; float sdA = sideS * step(.45, ax) * step(.27, p.y) * step(p.y, .9);
    seam = max(seam, sl(p.z - .86) * sdA);
    seam = max(seam, sl(p.z + .04) * sdA);
    seam = max(seam, sl(p.z + .98 - (p.y - .3)*.12) * sdA);
    seam = max(seam, sl(p.y - .31) * sideS * step(-.98, p.z) * step(p.z, .86) * step(.45, ax));
    seam = max(seam, up * sl(p.z - 1.0) * step(ax, .74));
    seam = max(seam, up * sl(ax - .74) * step(1.0, p.z));
    seam = max(seam, up * sl(p.z - uCab.w) * step(ax, .72) * step(p.y, 1.1));
    seam = max(seam, up * sl(ax - .72) * step(p.z, uCab.w));
    seam = max(seam, sl(p.z - 1.92 + (p.y - .4)*.15) * (1. - up) * step(p.y, .75));
    seam = max(seam, sl(p.z + 1.95) * (1. - up) * step(p.y, .8));
    // 油箱蓋（右後）
    float fuel = length(vec2(p.z + 1.3, p.y - .72));
    seam = max(seam, sl(fuel - .075) * step(p.x, -.6) * sideS);
    base *= 1. - seam*.75*body;
    // 門把
    float hdl = (boxm(vec2(p.z, p.y), vec2(.26, .775), vec2(.075, .014)) + boxm(vec2(p.z, p.y), vec2(-.72, .79), vec2(.075, .014))) * sideS * step(.6, ax);
    base = mix(base, vec3(.02), hdl*.85); rough = mix(rough, .4, hdl);
    // 前葉子板散熱孔、引擎蓋散熱孔
    float fv = sideS * step(.6, ax) * boxm(vec2(p.z, p.y), vec2(1.02, .52), vec2(.1, .07)) * step(.45, fract((p.z - .92)/.04));
    float hv = up * boxm(vec2(p.z, ax), vec2(1.55, .34), vec2(.18, .11)) * step(.5, fract((p.z - 1.37)/.035));
    base = mix(base, vec3(.008), max(fv, hv)); clear *= 1. - max(fv, hv);
    // 側方向燈
    float rep = sideS * step(.6, ax) * (1. - smoothstep(.0, .004 + fwidth(p.z), length(vec2(p.z - 1.66, (p.y - .62)*2.2)) - .03));
    base = mix(base, vec3(.9,.42,.04), rep); ecol += vec3(1.,.45,.05) * rep * 1.2 * uMisc.y; emis = max(emis, rep);
    // 黑色下擾流、前後進氣、蜂巢網
    float low = smoothstep(.27,.25,p.y);
    float grille = (1. - uCarOpt.x) * step(2.0, p.z) * smoothstep(.01,.0, sdBox(vec2(ax,p.y), vec2(0.,.42), vec2(.52,.13)));
    float slot = uCarOpt.x * step(2.0, p.z) * smoothstep(.01,.0, sdBox(vec2(ax,p.y), vec2(0.,.33), vec2(.46,.012)));
    float rearLow = step(p.z, -2.0) * smoothstep(.36,.34,p.y);
    float blk = max(max(low, slot), max(grille, max(rearLow, lip)));
    base = mix(base, vec3(.015), blk); rough = mix(rough, .7, blk); clear *= 1.-blk;
    if(grille > .5){
      vec2 g = vec2(p.x, p.y)/vec2(.042, .036); vec2 r = vec2(1., 1.732), h = r*.5;
      vec2 a = mod(g, r) - h, b = mod(g - h, r) - h; vec2 gv = dot(a,a) < dot(b,b) ? a : b;
      float hex = smoothstep(.36, .42, max(abs(gv.x)*.866 + abs(gv.y)*.5, abs(gv.y)));
      base = mix(vec3(.002), vec3(.06), hex); metal = hex*.5;
      if(uCarOpt.y > .5){ float bar = step(.55, fract(p.x/.045)); float fr = 1. - smoothstep(.0, .02, -sdBox(vec2(ax,p.y), vec2(0.,.42), vec2(.52,.13))); base = mix(vec3(.01), vec3(.72), max(bar*.9, fr)); metal = max(bar, fr)*.9; rough = .15; }
    }
    // 頭燈：投射鏡組 ＋ L 形日行燈
    float broke = max(step(.8, uDmg.x), smoothstep(.3, .7, vDent));
    float hl = step(1.86, p.z) * smoothstep(.01,.0, sdBox(vec2(ax,p.y), vec2(.66,.675), vec2(.17,.05)));
    if(hl > .5){
      float pj = 1. - smoothstep(.028, .034, min(length(vec2(ax - .58, p.y - .668)), length(vec2(ax - .73, p.y - .668))));
      float drl = max(1. - smoothstep(.006, .011, abs(p.y - .716)), (1. - smoothstep(.006, .011, abs(ax - .815))) * step(.64, p.y));
      base = mix(vec3(.05,.055,.06), vec3(.8,.85,.9), pj); rough = .08; metal = .6;
      ecol = (vec3(1.,.96,.88) * pj * (.8 + 5.*uMisc.y) + vec3(.9,.95,1.) * drl * 3.) * (1. - broke); emis = 1.;
      base = mix(base, vec3(.25), broke*.6);
    }
    // 尾燈：燈組 ＋ 貫穿式燈條；拋錨時雙黃燈閃爍
    float tl = step(p.z, -2.02) * smoothstep(.01,.0, sdBox(vec2(ax,p.y), vec2(.58,.85), vec2(.26,.04)));
    float bar = step(p.z, -2.02) * (1. - smoothstep(.007, .012, abs(p.y - .9))) * step(ax, .6);
    if(max(tl, bar) > .5){
      float rows = .55 + .45*step(.5, fract((p.y - .81)/.026));
      base = vec3(.3,.01,.01); rough = .12;
      float hz = uDmg.w * step(.5, fract(uCam.w*1.4));
      ecol = mix(vec3(1.,.04,.02) * (.5 + 2.*uMisc.y + 7.*uP.z) * rows, vec3(1.,.5,.03)*8., hz * tl) * (1. - broke*.7); emis = 1.;
    }
    if(glass > .5){ base = vec3(.012,.015,.018); rough = .06; }
    // ── 毀損：撞擊處的細長刮痕與脫漆、全車灰塵、玻璃裂痕
    float dw = clamp(vDent, 0., 1.6), wr = uDmg.x;
    float zone = smoothstep(.12, .55, dw) + wr*.5*smoothstep(.55, .75, texture(uNoise, p.xz*.3 + p.y*.4).b);
    float sn = texture(uNoise, vec2(p.z*.55 + p.x*.3, p.y*7.5)).a, sn2 = texture(uNoise, vec2(p.z*.9 - p.x*.2, p.y*12.)).g;
    float fa = fwidth(sn), fb = fwidth(sn2);
    float lines = clamp((1. - smoothstep(.0, .03 + fa*1.5, abs(sn - .5))) + (1. - smoothstep(.0, .025 + fb*1.5, abs(sn2 - .5)))*.7, 0., 1.);
    lines = mix(lines, .18, smoothstep(.04, .14, max(fa, fb)));
    float scr = clamp(zone, 0., 1.) * lines * body;
    base = mix(base, vec3(.62,.62,.6), scr*.8); metal = max(metal, scr*.7); rough = mix(rough, .35, scr);
    float core = smoothstep(.55, 1.05, dw) * smoothstep(.42, .58, texture(uNoise, p.zy*1.3 + p.x).r) * body;
    base = mix(base, vec3(.16,.16,.15), core*.9); rough = mix(rough, .8, core); clear *= 1. - core;
    base *= 1. - smoothstep(.3, 1.3, dw)*.22*body;
    float dust = uDmg.y * smoothstep(.75, .15, p.y) * (.45 + .55*texture(uNoise, p.xz*2.3 + p.y).g) * body;
    base = mix(base, vec3(.3,.25,.19), dust*.6); clear *= 1. - dust*.6;
    if(glass > .5){
      float crk = clamp(max(max(smoothstep(.25, .65, dw), step(.55, uDmg.y)*ws), wr), 0., 1.);
      float cn = texture(uNoise, p.xz*2.1 + p.y*1.7).r, cn2 = texture(uNoise, p.zy*3.3 + p.x).g;
      float cl = clamp((1. - smoothstep(.0, .012, abs(cn - .5))) + (1. - smoothstep(.0, .01, abs(cn2 - .5))), 0., 1.);
      base = mix(base, vec3(.55,.58,.6), cl*crk*.75 + crk*wr*.18); rough = mix(rough, .35, crk*.4);
    }
    // 凹痕處改用面法線，呈現皺褶
    float fw = clamp(dw*1.6 + wr*.5, 0., .85);
    if(fw > .02){ vec3 fn = normalize(cross(dFdx(vW), dFdy(vW))); if(dot(fn, n) < 0.) fn = -fn; n = normalize(mix(n, fn, fw)); }
  } else if(uP.x < 1.5){
    // 車輪：vCol.a>.75 輪胎；否則輪圈面
    if(vCol.a > .75){
      base = vec3(.02); rough = .85; clear = 0.;
      float r = length(vO.yz), an = atan(vO.y, vO.z);
      float sw = step(.09, abs(vO.x)) * smoothstep(.262, .27, r) * smoothstep(.305, .297, r);
      float letters = sw * step(.42, fract(an*11.)) * step(.8, fract(an*1.7 + .1)) ;
      base += vec3(.2) * letters * (1. - clamp(abs(uP.w)*.05, 0., 1.));
      base += .01*step(.5, fract(an*14. + vO.x*30.))*step(abs(vO.x), .09);
    } else {
      float r = length(vO.yz)/.235, an = atan(vO.y, vO.z), a = an + uP.y;
      float blur = clamp(abs(uP.w)*.03, 0., 1.);
      float sec = abs(fract(an*5./6.2831853 + .5) - .5);
      float sw = (.035 - .012*r);
      float sp = (1. - smoothstep(sw, sw + .012, abs(sec - .065))) * step(.28, r) * step(r, .9);
      sp = mix(sp, .38, blur);
      float hub = 1. - smoothstep(.27, .3, r);
      float rim = smoothstep(.86, .9, r);
      vec3 disc = mix(vec3(.02), vec3(.24,.23,.22), smoothstep(.34,.36,r)*smoothstep(.8,.78,r));
      float holes = step(.82, texture(uNoise, vec2(r*3., an*1.6)).r) * smoothstep(.4,.45,r)*smoothstep(.76,.7,r);
      disc *= 1. - holes*.7*(1. - blur);
      float cal = smoothstep(.5,.6,r)*smoothstep(.82,.76,r)*smoothstep(.5,.38,abs(atan(sin(a - 1.1), cos(a - 1.1))));
      disc = mix(disc, uAccent*.9, cal);
      float m = max(sp, max(rim, hub));
      base = mix(disc, vec3(.55,.55,.57), m); rough = mix(.5, .25, m); metal = m*.85; clear = 0.;
      float nut = 0.; for(int k = 0; k < 5; k++){ float t = float(k)*1.2566 + .63; nut = max(nut, 1. - smoothstep(.028, .04, length(vec2(r*cos(an) - .19*cos(t), r*sin(an) - .19*sin(t))))); }
      base = mix(base, vec3(.12), nut*hub*(1. - blur));
      float cap = 1. - smoothstep(.09, .1, r);
      base = mix(base, uAccent*.8, cap);
      if(r > 1.) base = vec3(.02);
    }
  } else if(uP.x < 2.5){
    base = pow(vCol.rgb, vec3(2.2)); rough = vCol.a > .8 ? .75 : .3; clear = vCol.a > .8 ? 0. : 1.;
    if(vCol.a < .15){ base = uBody; }
    else if(vCol.a < .25){ base = uBody*.8; rough = .85; clear = 0.; }
    else if(vCol.a < .35){ metal = .9; rough = .2; clear = 0.; }
    base = mix(base, vec3(.3,.25,.19), uDmg.y*.3*smoothstep(.6, .15, vO.y));
  } else if(uP.x > 3.5){
    // 修復愛心：寶石紅、邊緣發光
    float fr = pow(1. - abs(dot(n, V)), 2.);
    base = vec3(.75,.02,.07); rough = .12; clear = 1.;
    ecol = vec3(1.,.1,.2)*(.55 + 2.6*fr) + vec3(1.,.6,.7)*.25; emis = 1.;
  } else {
    // 車牌
    vec2 cell = vec2(mod(uP.y, 2.), floor(uP.y/2.));
    base = texture(uTex0, (cell + vUV.xy)/vec2(2., 4.)).rgb; rough = .35; clear = .4;
    base = mix(base, vec3(.3,.25,.19), uDmg.y*.4);
  }
  // 金屬漆片：車身漆面加入細微的亮片法線擾動與色偏（只作用於底漆層，清漆層保持平滑）
  vec3 nc = n;
  float paint = (uP.x < .5 ? 1. : 0.) * (1. - glass) * clear * (1. - emis);
  if(paint > .01){
    float fd = clamp(1. - length(fwidth(vO))*140., 0., 1.);
    vec3 fl = texture(uNoise, vO.xz*21. + vO.y*13.).rgb - .5;
    n = normalize(n + fl*.09*fd*paint*(1. - uDmg.y));
    float ndv0 = max(dot(nc, V), 0.);
    base *= mix(1., .82 + .36*ndv0, paint*.7);   // 正面較亮、側緣較深，增加立體層次
  }
  float ndl = max(dot(n, uSun.xyz), 0.);
  float sh = shadowAt(vW, nc);
  vec3 H = normalize(uSun.xyz + V); float ndv = max(dot(nc,V), 0.);
  vec3 dif = base * (uSunCol.rgb * ndl * sh + ambientL(n));
  float F = .045 + .955*pow(1.-ndv, 5.);
  vec3 R = reflect(-V, nc);
  vec3 env = R.y > 0. ? skyAt(R) : mix(uAmbGnd.rgb*1.2, skyAt(vec3(R.x, 0.02, R.z))*.5, smoothstep(-.3, 0., R.y));
  // 反射中的遠方樹林／山稜剪影，讓車身反射更真實
  { float az = atan(R.x, R.z);
    float hz = .035 + .09*texture(uNoise, vec2(az*.9 + vW.x*.004, .37 + vW.z*.004)).r + .05*texture(uNoise, vec2(az*3.1, .71)).g;
    float band = smoothstep(hz + .012, hz - .004, R.y) * smoothstep(-.06, .0, R.y);
    vec3 tree = mix(uAmbGnd.rgb*.55, skyAt(vec3(R.x, .03, R.z))*.35, .35) + uSunCol.rgb*.02;
    env = mix(env, tree, band*.85); }
  float cano = uAmbGnd.w;
  env = mix(env, vec3(.03,.06,.025)*(uAmbSky.rgb+uSunCol.rgb*.1)*3., cano * smoothstep(-.1,.5,R.y) * (.6 + .4*texture(uNoise, R.xz*1.3 + vW.xz*.02).r));
  env *= mix(.55, 1., sh);
  vec3 spec = uSunCol.rgb * sh * ndl * ggx(max(dot(n,H),0.), max(rough, .1)) * mix(.04, 1., metal) * .25 * (clear > .5 ? 1.6 : 1.);
  // 清漆層：銳利的第二道高光
  spec += uSunCol.rgb * sh * max(dot(nc, uSun.xyz), 0.) * ggx(max(dot(nc,H),0.), .09) * F * clear * .04;
  vec3 lit = dif * (1. - F*clear*.6) * (1. - metal*.6) + spec + env * F * max(clear, metal) * (glass > .5 ? 1.35 : 1.) + env * metal * base * .6;
  lit += ecol * emis;
  oCol = vec4(fogged(lit, vW), 1.);
}`;
const CAR_SH_VS = GLSL_HEAD + CAR_DEFORM + `layout(location=0) in vec3 aPos; uniform mat4 uModel; void main(){ gl_Position = uViewProj * uModel * vec4(deformCar(aPos), 1.); }`;
const CARM = {};
const PLATES = ['RCA-0139', 'KTG-2026', 'DPB-0812', 'BGS-7701', 'TWN-5168', 'CHH-0907', 'NTO-3388', 'PTG-6060'];

// ── 原創車款（外型、性能各不相同；非任何真實車廠車型）
// cabF 擋風玻璃底、roofF 車頂前緣、roofR 車頂後緣、cabR 後窗底（車身局部 z，車長 ±2.28）
const CAR_MODELS = [
  { name: '稜線 GT', en: 'RIDGE GT', type: '賽道版四門房車', layout: '前置後驅・2.0 渦輪',
    desc: '本作的招牌賽車：雙層 GT 尾翼、前下巴導流片、蜂巢水箱罩。各項表現平均，適合第一次上路。',
    cabF: 0.85, roofF: 0.12, roofR: -0.8, cabR: -1.62, h: 0.415, rearH: 0.952, rearExp: 1, bpil: -0.3, cpil: 99, scale: [1, 1, 1],
    wing: 'gt', exhaust: [0.32, 0.48], canard: 1, opt: [0, 0, 0, 0], stats: [4, 4, 4, 3], phys: { pow: 1, grip: 1, drag: 1, stab: 1, trac: 0.8 } },
  { name: '颯 S4', en: 'SA S4', type: '四門跑車', layout: '前置四驅・3.0 雙渦輪',
    desc: '低矮的溜背車頂一路延伸到車尾，搭配鴨尾擾流與四出排氣。直線最快，但高速入彎需要提早煞車。',
    cabF: 0.8, roofF: 0.08, roofR: -0.5, cabR: -1.95, h: 0.37, rearH: 0.97, rearExp: 0.75, bpil: -0.25, cpil: 99, scale: [1.02, 0.95, 1.04],
    wing: 'duck', exhaust: [-0.5, -0.36, 0.36, 0.5], canard: 0, opt: [0, 0, 0, 0], stats: [5, 4, 5, 3], phys: { pow: 1.2, grip: 0.98, drag: 0.84, stab: 0.95, trac: 0.97 } },
  { name: '行雲 L8', en: 'XINGYUN L8', type: '豪華旗艦房車', layout: '前置後驅・4.0 V8',
    desc: '長軸距、高車頂、鍍鉻直瀑式水箱罩。車身最重最穩，過彎不容易甩尾，適合長途山路。',
    cabF: 0.9, roofF: 0.2, roofR: -0.95, cabR: -1.7, h: 0.44, rearH: 0.96, rearExp: 1, bpil: -0.35, cpil: 99, scale: [1.04, 1.04, 1.08],
    wing: 'lip', exhaust: [-0.45, 0.45], canard: 0, opt: [0, 1, 0, 0], stats: [4, 3, 4, 5], phys: { pow: 1.1, grip: 0.95, drag: 1.0, stab: 1.4, trac: 0.76 } },
  { name: '疾風 R', en: 'JIFENG R', type: '性能掀背鋼砲', layout: '前置前驅・2.0 渦輪',
    desc: '車身短、掀背車尾陡直，車頂尾翼壓住後輪。極速較低，但轉向最靈活，最適合連續彎道。',
    cabF: 0.85, roofF: 0.15, roofR: -1.35, cabR: -1.8, h: 0.43, rearH: 0.97, rearExp: 0.45, bpil: -0.35, cpil: 99, scale: [0.98, 1.02, 0.88],
    wing: 'roof', exhaust: [-0.1, 0.1], canard: 0, opt: [0, 0, 0, 0], stats: [3, 5, 3, 3], phys: { pow: 0.9, grip: 1.08, drag: 1.28, stab: 0.9, trac: 0.86 } },
  { name: '旅人 T', en: 'LUREN T', type: '性能旅行車', layout: '前置四驅・2.5 渦輪',
    desc: '長車頂一路延伸到車尾，多了一扇 D 柱側窗。四驅加上較長軸距，各種路面都很穩定。',
    cabF: 0.85, roofF: 0.12, roofR: -1.72, cabR: -2.12, h: 0.415, rearH: 0.97, rearExp: 0.5, bpil: -0.3, cpil: -1.25, scale: [1, 1.02, 1.03],
    wing: 'roof', exhaust: [-0.5, -0.36, 0.36, 0.5], canard: 0, opt: [0, 0, 0, 0], stats: [4, 4, 4, 4], phys: { pow: 1.04, grip: 1, drag: 1.08, stab: 1.15, trac: 0.95 } },
  { name: '電馳 E', en: 'DIANCHI E', type: '純電房車', layout: '雙馬達四驅・純電',
    desc: '封閉式車頭、全景玻璃車頂、沒有排氣管。電動馬達起步扭力最強，出彎加速特別快，引擎聲也最安靜。',
    cabF: 0.95, roofF: 0.05, roofR: -0.65, cabR: -1.95, h: 0.4, rearH: 0.97, rearExp: 0.8, bpil: -0.3, cpil: 99, scale: [1.01, 0.98, 1.03],
    wing: 'lip', exhaust: [], canard: 0, opt: [1, 0, 1, 0], stats: [5, 4, 4, 4], phys: { pow: 1.08, grip: 1.01, drag: 0.93, stab: 1.2, ev: 1, trac: 1.02 } }
];
const STAT_NAMES = ['動力', '操控', '極速', '穩定'];
function carProfile(z, sp = CAR_MODELS[0]) {
  const zf = CARGEO.zf, az = Math.abs(z);
  let W = 0.925 * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (az - 1.25) / (zf - 1.25)), 3.4)), 1 / 3.4);
  if (z > 0) W *= 1 - 0.035 * smooth(0.8, zf, z);
  const fl = 0.17 + 0.17 * smooth(zf - 0.42, zf, z) + 0.2 * smooth(zf - 0.5, zf, -z);
  let belt;
  if (z > 0.85) belt = lerp(0.935, 0.72, Math.pow(sat((z - 0.85) / (zf - 0.85)), 1.7)) - 0.12 * smooth(zf - 0.2, zf, z);
  else if (z > -1.6) belt = lerp(0.935, 0.97, sat((0.85 - z) / 2.45));
  else belt = lerp(0.97, 0.93, sat((-1.6 - z) / (zf - 1.6))) - 0.1 * smooth(zf - 0.14, zf, -z);
  let g = 0;
  if (z < sp.cabF && z > sp.roofF) g = sp.h * smooth(sp.cabF, sp.roofF, z) ** 0.9;
  else if (z <= sp.roofF && z > sp.roofR) g = lerp(sp.h, sp.h * sp.rearH, sat((sp.roofF - z) / (sp.roofF - sp.roofR)));
  else if (z <= sp.roofR && z > sp.cabR) g = sp.h * sp.rearH * smooth(sp.cabR, sp.roofR, z) ** sp.rearExp;
  return { W, fl, belt, g };
}
function buildPlateTex() {
  const c = mkCanvas(512, 256), x = c.getContext('2d');
  PLATES.forEach((s, i) => {
    const ox = (i % 2) * 256, oy = (i / 2 | 0) * 64;
    x.fillStyle = '#f4f4ef'; x.fillRect(ox, oy, 256, 64);
    x.strokeStyle = '#111'; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 4, oy + 4, 248, 56, 7); x.stroke();
    x.fillStyle = '#7a7a76'; x.beginPath(); x.arc(ox + 16, oy + 32, 3.5, 0, TAU); x.arc(ox + 240, oy + 32, 3.5, 0, TAU); x.fill();
    x.font = '800 44px "Saira Condensed","Arial Narrow",Arial,sans-serif'; x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(s, ox + 128, oy + 35, 210);
  });
  TEX.plate = texFromCanvas(c, { wrap: gl.CLAMP_TO_EDGE });
}
function buildCarMeshes() {
  mkProg('car', CAR_VS(''), CAR_FS);
  mkProg('sh_car', CAR_SH_VS, DEPTH_FS);
  buildPlateTex();
  CARM.models = CAR_MODELS.map(sp => ({ body: buildCarBody(sp), kit: buildCarKit(sp), sp }));
  CARM.body = CARM.models[0].body; CARM.kit = CARM.models[0].kit;
  // 車輪（軸向 X，外側 +X）
  { const mb = new MB(1024), prof = [[0.2, -0.115], [0.3, -0.125], [0.322, -0.105], [0.33, -0.07], [0.33, 0.07], [0.322, 0.105], [0.3, 0.125], [0.235, 0.115]], seg = 48;
    mb.col(1, 1, 1, 1);
    for (let k = 0; k < prof.length; k++) { const a = prof[Math.max(0, k - 1)], b = prof[Math.min(prof.length - 1, k + 1)]; let dr = b[0] - a[0], dx = b[1] - a[1]; const l = Math.hypot(dr, dx) || 1; const nr = dx / l, nx = -dr / l;
      for (let s = 0; s <= seg; s++) { const an = s / seg * TAU; mb.v(prof[k][1], Math.sin(an) * prof[k][0], Math.cos(an) * prof[k][0], nx, Math.sin(an) * nr, Math.cos(an) * nr); } }
    for (let k = 0; k < prof.length - 1; k++) for (let s = 0; s < seg; s++) { const a = k * (seg + 1) + s; mb.quad(a, a + 1, a + seg + 2, a + seg + 1); }
    // 輪圈面略為內凹（立體感）
    mb.col(1, 1, 1, 0.5); const c = mb.v(0.07, 0, 0, 1, 0, 0), b0 = mb.nv; for (let s = 0; s <= seg; s++) { const an = s / seg * TAU; mb.v(0.108, Math.sin(an) * 0.238, Math.cos(an) * 0.238, 1, 0, 0); } for (let s = 0; s < seg; s++) mb.tri(c, b0 + s + 1, b0 + s);
    // 立體雙輻條（對齊著色器中的輻條位置），讓輪圈有真正的凹凸
    const qo = (a, b, c2, d, o) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * o[0] + ny * o[1] + nz * o[2] < 0) mb.q4(d, c2, b, a); else mb.q4(a, b, c2, d); };
    const fx = r => 0.07 + 0.038 * r / 0.238;
    for (let k = 0; k < 5; k++) for (const sg of [-1, 1]) {
      const an = (k + sg * 0.065) * TAU / 5, dy = Math.sin(an), dz = Math.cos(an), ty = Math.cos(an), tz = -Math.sin(an);
      const N = 5, r0 = 0.07, r1 = 0.212;
      for (let i = 0; i < N; i++) {
        const ra = r0 + (r1 - r0) * i / N, rb = r0 + (r1 - r0) * (i + 1) / N, wa = 0.0095 - 0.003 * i / N, wb = 0.0095 - 0.003 * (i + 1) / N, h = 0.013;
        const P = (r, w, s, up) => [fx(r) + (up ? h : -0.002), dy * r + ty * w * s, dz * r + tz * w * s];
        qo(P(ra, wa, -1, 1), P(rb, wb, -1, 1), P(rb, wb, 1, 1), P(ra, wa, 1, 1), [1, 0, 0]);
        for (const s of [-1, 1]) qo(P(ra, wa, s, 0), P(rb, wb, s, 0), P(rb, wb, s, 1), P(ra, wa, s, 1), [0, ty * s, tz * s]);
      }
    }
    CARM.wheel = mb.build(); }
  // 車牌（前、後）
  { const mb = new MB(16); mb.col(1, 1, 1, 1);
    const pw = 0.19, ph = 0.06;
    mb.v(-pw, 0.32 - ph, 2.275, 0, 0, 1, 1, 1); mb.v(pw, 0.32 - ph, 2.275, 0, 0, 1, 0, 1); mb.v(pw, 0.32 + ph, 2.275, 0, 0, 1, 0, 0); mb.v(-pw, 0.32 + ph, 2.275, 0, 0, 1, 1, 0);
    mb.quad(0, 1, 2, 3);
    mb.v(pw, 0.45 - ph, -2.262, 0, 0, -1, 1, 1); mb.v(-pw, 0.45 - ph, -2.262, 0, 0, -1, 0, 1); mb.v(-pw, 0.45 + ph, -2.262, 0, 0, -1, 0, 0); mb.v(pw, 0.45 + ph, -2.262, 0, 0, -1, 1, 0);
    mb.quad(4, 5, 6, 7);
    CARM.plate = mb.build(); }
  { const mb = new MB(1024); // 座艙內裝（車內視角）
    mb.col(0.03, 0.03, 0.032, 1); mb.box(0, 0.8, 0.74, 0.8, 0.07, 0.26); mb.box(0, 0.5, 0.2, 0.85, 0.3, 0.75, 0, 4);
    mb.col(0.05, 0.05, 0.05, 1); mb.box(0.36, 0.9, 0.5, 0.15, 0.045, 0.03);
    mb.col(0.1, 0.5, 0.2, 0.1); mb.box(0.36, 0.905, 0.468, 0.12, 0.03, 0.002);
    mb.col(0.04, 0.04, 0.04, 1); for (const sx of [-1, 1]) { mb.box(sx * 0.36, 0.55, -0.35, 0.24, 0.5, 0.08); mb.box(sx * 0.36, 1.05, -0.37, 0.14, 0.12, 0.06); }
    mb.col(0.07, 0.07, 0.07, 0.6); for (const sx of [-1, 1]) { mb.box(sx * 0.68, 0.9, -0.55, 0.02, 0.45, 0.02); } mb.box(0, 1.3, -0.55, 0.68, 0.02, 0.02);
    CARM.cabin = mb.build(); }
  { const mb = new MB(256); mb.col(0.025, 0.025, 0.025, 1); const seg = 20; // 方向盤（XY 平面）
    for (let s = 0; s < seg; s++) { const a0 = s / seg * TAU, a1 = (s + 1) / seg * TAU; for (const [r0, r1, z0, z1] of [[0.15, 0.185, 0, 0], [0.185, 0.185, 0, -0.03], [0.15, 0.15, -0.03, 0]]) mb.q4([Math.cos(a0) * r0, Math.sin(a0) * r0, z0], [Math.cos(a1) * r0, Math.sin(a1) * r0, z0], [Math.cos(a1) * r1, Math.sin(a1) * r1, z1], [Math.cos(a0) * r1, Math.sin(a0) * r1, z1]); }
    mb.box(0, 0, -0.01, 0.16, 0.022, 0.012); mb.box(0, -0.08, -0.01, 0.022, 0.08, 0.012); mb.box(0, 0, -0.012, 0.05, 0.045, 0.014);
    CARM.steer = mb.build(); }
  buildDriverMeshes();
}
function buildCarKit(sp) {
  const mb = new MB(4096), T = M4.create(), R0 = M4.create();
  const at = (x, y, z, ry = 0, rx = 0) => { M4.translate(T, x, y, z); if (ry) M4.mul(T, T, M4.rotY(R0, ry)); if (rx) M4.mul(T, T, M4.rotX(R0, rx)); mb.m = T; };
  const topY = z => { const p = carProfile(z, sp); return p.belt + p.g; };
  mb.col(0.03, 0.03, 0.035, 0.6);
  if (sp.wing === 'gt') { // 雙層 GT 尾翼、端板、鵝頸式支架
    at(0, 1.33, -2.14, 0, -0.07); mb.box(0, 0, 0, 0.84, 0.014, 0.17); mb.box(0, 0.045, -0.1, 0.84, 0.01, 0.07); mb.box(0, 0.03, -0.17, 0.84, 0.02, 0.008); mb.m = null;
    for (const sx of [-1, 1]) { mb.box(sx * 0.85, 1.32, -2.14, 0.01, 0.11, 0.22); mb.box(sx * 0.42, 1.2, -2.0, 0.012, 0.025, 0.07); mb.box(sx * 0.42, 1.13, -1.94, 0.012, 0.06, 0.03); mb.box(sx * 0.42, 1.27, -2.05, 0.012, 0.04, 0.03); }
  } else if (sp.wing === 'duck') { // 鴨尾擾流（車色）
    const z = -2.1, y = topY(z); mb.col(0, 0, 0, 0.1); at(0, y + 0.015, z, 0, -0.32); mb.box(0, 0, 0, 0.72, 0.012, 0.1); mb.m = null;
  } else if (sp.wing === 'roof') { // 車頂尾翼
    const z = sp.roofR + 0.02, y = topY(z) + 0.02; mb.col(0.03, 0.03, 0.035, 0.6); at(0, y, z - 0.12, 0, 0.16); mb.box(0, 0, 0, 0.6, 0.014, 0.15); mb.m = null;
    for (const sx of [-1, 1]) mb.box(sx * 0.6, y - 0.03, z - 0.12, 0.012, 0.05, 0.15);
  } else { // 小尾唇（車色）
    const z = -2.12, y = topY(z); mb.col(0, 0, 0, 0.1); mb.box(0, y + 0.012, z, 0.6, 0.01, 0.05);
  }
  // 前下巴、導流翼片
  const gt = sp.wing === 'gt';
  mb.col(0.02, 0.02, 0.02, 1); mb.box(0, 0.1, 2.12, gt ? 0.88 : 0.72, 0.012, gt ? 0.21 : 0.1);
  if (sp.canard) for (const sx of [-1, 1]) { mb.box(sx * 0.87, 0.14, 2.14, 0.008, 0.04, 0.17); for (const y of [0.3, 0.38]) { at(sx * 0.83, y, 2.05, 0, 0); M4.mul(T, T, M4.rotZ(R0, sx * 0.25)); mb.box(0, 0, 0, 0.1, 0.006, 0.07); } mb.m = null; }
  // 側裙
  for (const sx of [-1, 1]) mb.box(sx * 0.9, 0.17, 0, gt ? 0.035 : 0.02, gt ? 0.035 : 0.02, 0.98);
  // 後擾流
  if (gt) { mb.box(0, 0.2, -2.18, 0.7, 0.07, 0.1); for (let k = -3; k <= 3; k++) mb.box(k * 0.19, 0.2, -2.22, 0.008, 0.08, 0.12); }
  else mb.box(0, 0.2, -2.16, 0.62, 0.045, 0.08);
  // 排氣管
  mb.col(0.62, 0.62, 0.64, 0.3); for (const sx of sp.exhaust) { at(sx, 0.2, -2.36, 0, PI / 2); mb.cyl(0, 0, 0, 0.042, 0.042, 0.18, 12, false); mb.m = null; }
  mb.col(0.01, 0.01, 0.01, 1); for (const sx of sp.exhaust) { at(sx, 0.2, -2.355, 0, PI / 2); mb.cyl(0, 0, 0, 0.033, 0.033, 0.01, 10, true, true); mb.m = null; }
  // 後視鏡：車色外殼、黑色底座、鏡面
  for (const sx of [-1, 1]) {
    mb.col(0.03, 0.03, 0.03, 1); mb.box(sx * 0.9, 0.955, 0.64, 0.05, 0.012, 0.025);
    mb.col(0, 0, 0, 0.1); mb.ellipsoid(sx * 0.99, 0.99, 0.63, 0.085, 0.052, 0.058, 12, 7);
    mb.col(0.7, 0.72, 0.75, 0.3); mb.q4([sx * 1.06, 0.955, 0.582], [sx * 0.93, 0.955, 0.582], [sx * 0.93, 1.025, 0.582], [sx * 1.06, 1.025, 0.582]);
  }
  // 雨刷
  { const z = sp.cabF - 0.05, y = carProfile(z, sp).belt + 0.03; mb.col(0.02, 0.02, 0.02, 1); at(0.22, y, z, 0.12); mb.box(0, 0, 0, 0.27, 0.007, 0.01); at(-0.3, y, z, 0.1); mb.box(0, 0, 0, 0.27, 0.007, 0.01); mb.m = null; }
  // 鯊魚鰭天線
  { const z = sp.roofR + 0.18; mb.col(0.02, 0.02, 0.02, 0.6); mb.ellipsoid(0, topY(z) + 0.012, z, 0.025, 0.045, 0.1, 8, 6); }
  if (gt) { mb.col(0.85, 0.08, 0.05, 1); mb.box(-0.55, 0.21, 2.22, 0.035, 0.015, 0.03); mb.col(0.62, 0.62, 0.64, 0.3); for (const sx of [-1, 1]) mb.cyl(sx * 0.55, 0.79, 1.96, 0.018, 0.018, 0.012, 8, true); }
  return mb.build();
}
function buildCarBody(sp) {
  const NZ = 124, M = 40, zf = CARGEO.zf;
  const P = [], zone = [], ghv = [];
  for (let i = 0; i <= NZ; i++) {
    const t = i / NZ * 2 - 1, z = zf * Math.sign(t) * (1 - Math.pow(1 - Math.abs(t), 1.7));
    const pr = carProfile(z, sp), W = Math.max(pr.W, 0.0005), cab = smooth(0.02, 0.2, pr.g);
    const bul = 0.045 * Math.exp(-(((Math.abs(z) - CARGEO.zw) / 0.5) ** 2));
    const top = pr.belt + pr.g, wg = lerp(0.9, 0.615 / 0.925, cab);
    // 腰線稜角：側面中段一道外凸的線條
    const crease = 0.012 * smooth(-1.9, -1.2, z) * smooth(2.0, 1.4, z);
    const C = [[0, pr.fl], [W * 0.8, pr.fl], [W * 0.985, pr.fl + 0.1], [W + bul, lerp(pr.fl, pr.belt, 0.5)], [W * 0.99 + bul * 0.5 + crease, pr.belt - 0.11], [W * 0.945, pr.belt - 0.005],
    [W * lerp(0.86, 0.9, cab), pr.belt + lerp(0.012, 0.03, cab)], [W * wg, top - lerp(0.0, 0.06, cab) + (1 - cab) * 0.03], [W * wg * lerp(0.4, 0.72, cab), top + lerp(0.045, 0.0, cab)], [0, top + lerp(0.05, 0.022, cab)]];
    for (let j = 0; j <= M; j++) {
      const f = j / M * (C.length - 1), k = Math.min(C.length - 2, Math.floor(f)), u = f - k;
      const p0 = C[Math.max(0, k - 1)], p1 = C[k], p2 = C[k + 1], p3 = C[Math.min(C.length - 1, k + 2)];
      const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
      let x = cr(p0[0], p1[0], p2[0], p3[0]), y = cr(p0[1], p1[1], p2[1], p3[1]);
      if (j === 0 || j === M) x = 0; x = Math.max(0, x);
      P.push(x, y, z);
      zone.push(f < 5.5 ? 0 : f < 7.25 ? 1 : 2); ghv.push(sat((f - 6) / 1.0));
    }
  }
  const V = M + 1, pos = [], nrm = [], uv = [], col = [], idx = [];
  const NN = new Float32Array(P.length);
  for (let i = 0; i <= NZ; i++) for (let j = 0; j <= M; j++) {
    const o = (i * V + j) * 3, ia = (Math.max(0, i - 1) * V + j) * 3, ib = (Math.min(NZ, i + 1) * V + j) * 3, ja = (i * V + Math.max(0, j - 1)) * 3, jb = (i * V + Math.min(M, j + 1)) * 3;
    const ax = P[ib] - P[ia], ay = P[ib + 1] - P[ia + 1], az = P[ib + 2] - P[ia + 2], bx = P[jb] - P[ja], by = P[jb + 1] - P[ja + 1], bz = P[jb + 2] - P[ja + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; let l = Math.hypot(nx, ny, nz);
    if (l < 1e-7) { nx = 0; ny = 0; nz = i < NZ / 2 ? -1 : 1; l = 1; }
    NN[o] = nx / l; NN[o + 1] = ny / l; NN[o + 2] = nz / l;
  }
  { const o = ((NZ >> 1) * V + 8) * 3; if (NN[o] < 0) for (let k = 0; k < NN.length; k++) NN[k] = -NN[k]; }
  for (let side = 0; side < 2; side++) {
    const sx = side ? -1 : 1, base = pos.length / 3;
    for (let k = 0; k < P.length / 3; k++) { pos.push(P[k * 3] * sx, P[k * 3 + 1], P[k * 3 + 2]); nrm.push(NN[k * 3] * sx, NN[k * 3 + 1], NN[k * 3 + 2]); uv.push(zone[k], ghv[k], 0); col.push(255, 255, 255, 255); }
    for (let i = 0; i < NZ; i++) for (let j = 0; j < M; j++) { const a = base + i * V + j, b = a + V; if (!side) idx.push(a, b + 1, b, a, a + 1, b + 1); else idx.push(a, b, b + 1, a, b + 1, a + 1); }
  }
  return mkVAO([{ loc: 0, data: new Float32Array(pos), size: 3 }, { loc: 1, data: new Float32Array(nrm), size: 3 }, { loc: 2, data: new Float32Array(uv), size: 3 }, { loc: 3, data: new Uint8Array(col), size: 4, type: gl.UNSIGNED_BYTE, norm: true }], new Uint16Array(idx));
}
// 車主：分段人形，關節在原點，肢段沿 -Y 延伸
function buildDriverMeshes() {
  const D = CARM.drv = {}, mk = f => { const mb = new MB(512); f(mb); return mb.build(); };
  const SUIT = [1, 1, 1, 0.2], SKIN = [0.78, 0.56, 0.43, 1], HAIR = [0.06, 0.05, 0.045, 1], BLACK = [0.03, 0.03, 0.03, 1], WHITE = [0.9, 0.9, 0.88, 1];
  const C = (mb, c) => mb.col(c[0], c[1], c[2], c[3]);
  const LIP = [0.62, 0.36, 0.32, 1], BROW = [0.05, 0.04, 0.035, 1], SOLE = [0.85, 0.85, 0.82, 1], DARK = [0.07, 0.07, 0.08, 0.6];
  D.pelvis = mk(mb => { C(mb, SUIT); mb.ellipsoid(0, 0, 0, 0.17, 0.115, 0.118, 18, 10); C(mb, BLACK); mb.cyl(0, 0.05, 0, 0.168, 0.168, 0.045, 20, false); C(mb, [0.6, 0.6, 0.62, 0.3]); mb.box(0, 0.072, 0.168, 0.03, 0.02, 0.006); });
  D.torso = mk(mb => { C(mb, SUIT); mb.ellipsoid(0, 0.25, 0, 0.19, 0.29, 0.125, 20, 12); mb.ellipsoid(0, 0.44, 0, 0.21, 0.085, 0.125, 18, 8);
    // 胸前白色飾條、側邊深色拼接、拉鍊
    C(mb, WHITE); mb.box(0.075, 0.3, 0.118, 0.022, 0.2, 0.01); mb.box(-0.075, 0.3, 0.118, 0.022, 0.2, 0.01);
    C(mb, DARK); for (const sx of [-1, 1]) mb.ellipsoid(sx * 0.17, 0.24, 0, 0.03, 0.22, 0.1, 8, 8);
    C(mb, [0.5, 0.5, 0.52, 0.3]); mb.box(0, 0.28, 0.124, 0.006, 0.2, 0.005);
    // 立領
    C(mb, BLACK); mb.cyl(0, 0.49, 0, 0.075, 0.068, 0.07, 16, false); C(mb, SUIT); mb.cyl(0, 0.47, 0, 0.082, 0.078, 0.03, 16, false); });
  D.head = mk(mb => { C(mb, SKIN); mb.cyl(0, 0, 0, 0.05, 0.048, 0.07, 14, false);
    mb.ellipsoid(0, 0.14, 0.01, 0.09, 0.115, 0.1, 22, 16);
    mb.ellipsoid(0, 0.08, 0.04, 0.072, 0.05, 0.07, 14, 8);                     // 下顎
    mb.ellipsoid(0, 0.125, 0.104, 0.017, 0.03, 0.022, 8, 6); mb.ellipsoid(0, 0.105, 0.11, 0.022, 0.012, 0.014, 8, 4); // 鼻樑、鼻頭
    for (const sx of [-1, 1]) { mb.ellipsoid(sx * 0.09, 0.135, 0, 0.014, 0.027, 0.02, 8, 6); mb.ellipsoid(sx * 0.05, 0.11, 0.075, 0.025, 0.018, 0.02, 8, 4);
      C(mb, WHITE); mb.ellipsoid(sx * 0.036, 0.155, 0.088, 0.016, 0.009, 0.008, 8, 4); C(mb, BLACK); mb.ellipsoid(sx * 0.036, 0.155, 0.094, 0.008, 0.008, 0.004, 6, 4);
      C(mb, BROW); mb.ellipsoid(sx * 0.038, 0.176, 0.091, 0.022, 0.0055, 0.006, 6, 3); C(mb, SKIN); }
    C(mb, LIP); mb.ellipsoid(0, 0.078, 0.095, 0.024, 0.007, 0.008, 8, 4);
    C(mb, HAIR); mb.ellipsoid(0, 0.19, -0.01, 0.097, 0.078, 0.106, 18, 10); mb.ellipsoid(0, 0.14, -0.045, 0.094, 0.095, 0.075, 16, 8);
    for (const sx of [-1, 1]) mb.ellipsoid(sx * 0.082, 0.16, 0.02, 0.018, 0.05, 0.05, 8, 5); });
  D.uarm = mk(mb => { C(mb, SUIT); mb.ellipsoid(0, -0.01, 0, 0.068, 0.06, 0.068, 12, 6); mb.ellipsoid(0, -0.14, 0, 0.058, 0.17, 0.058, 14, 9); C(mb, WHITE); mb.cyl(0, -0.2, 0, 0.056, 0.054, 0.025, 12, false); });
  D.farm = mk(mb => { C(mb, SUIT); mb.ellipsoid(0, -0.12, 0, 0.048, 0.15, 0.048, 14, 9); C(mb, BLACK); mb.cyl(0, -0.27, 0, 0.042, 0.045, 0.04, 12, false);
    // 手套：掌、四指、拇指
    mb.ellipsoid(0, -0.3, 0.0, 0.045, 0.05, 0.022, 10, 6);
    for (let f = 0; f < 4; f++) mb.ellipsoid(-0.027 + f * 0.018, -0.355, 0.002, 0.0085, 0.03, 0.009, 6, 4);
    mb.ellipsoid(0.042, -0.29, 0.014, 0.011, 0.028, 0.011, 6, 4); });
  D.thigh = mk(mb => { C(mb, SUIT); mb.ellipsoid(0, -0.22, 0, 0.085, 0.26, 0.09, 14, 9); C(mb, DARK); mb.ellipsoid(0, -0.44, 0.03, 0.06, 0.05, 0.06, 10, 5); });
  D.shin = mk(mb => { C(mb, SUIT); mb.ellipsoid(0, -0.2, 0, 0.065, 0.24, 0.068, 14, 9);
    // 賽車鞋：鞋身、鞋底
    C(mb, BLACK); mb.ellipsoid(0, -0.42, 0.05, 0.055, 0.05, 0.125, 14, 8); mb.cyl(0, -0.42, 0, 0.055, 0.06, 0.06, 12, false);
    C(mb, SOLE); mb.box(0, -0.462, 0.05, 0.05, 0.008, 0.12); });
}
const LIVERIES = [
  { name: '稜線紅', body: [0.52, 0.02, 0.02], accent: [0.92, 0.92, 0.9] }, { name: '茶園綠', body: [0.02, 0.2, 0.09], accent: [0.9, 0.72, 0.08] },
  { name: '晨霧白', body: [0.82, 0.82, 0.8], accent: [0.05, 0.16, 0.5] }, { name: '柏油黑', body: [0.02, 0.02, 0.024], accent: [0.85, 0.3, 0.02] },
  { name: '標線黃', body: [0.8, 0.5, 0.02], accent: [0.03, 0.03, 0.03] }, { name: '海峽藍', body: [0.02, 0.1, 0.42], accent: [0.9, 0.9, 0.9] },
  { name: '紅土橙', body: [0.7, 0.16, 0.02], accent: [0.03, 0.03, 0.03] }, { name: '銀灰', body: [0.3, 0.31, 0.33], accent: [0.7, 0.04, 0.04] }
];
const _cs = M4.create(), _cm = M4.create(), _wm = M4.create(), _t1 = M4.create(), _t2 = M4.create();
function carMatrix(c, out) {
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cr = Math.cos(c.roll), sr = Math.sin(c.roll);
  const fx = sy * cp, fy = sp, fz = cy * cp;         // forward
  const lx = cy, ly = 0, lz = -sy;                   // left
  const ux = fy * lz - fz * ly, uy = fz * lx - fx * lz, uz = fx * ly - fy * lx; // up = f × l
  const rx = lx * cr + ux * sr, ry = ly * cr + uy * sr, rz = lz * cr + uz * sr;
  const vx = ux * cr - lx * sr, vy = uy * cr - ly * sr, vz = uz * cr - lz * sr;
  return M4.fromBasis(out, rx, ry, rz, vx, vy, vz, fx, fy, fz, c.x, c.y + (c.heave || 0), c.z);
}
// 毀損參數
const DMG_MAX = 10;
const _noDent = new Float32Array(40);
function wreckOf(c) { const k = c.dmg || 0; return k >= 10 ? 1 : k >= 9 ? 0.85 : k >= 6 ? (k - 5) * 0.08 : 0; }
function setDamageUniforms(c, P, deform) {
  gl.uniform4fv(P.u('uDent[0]'), c.dents || _noDent);
  gl.uniform4f(P.u('uDmg'), wreckOf(c), (c.dmg || 0) / DMG_MAX, deform ? 1 : 0, c.broken ? 1 : 0);
}
function drawCar(c, P, shadow, inside) {
  carMatrix(c, _cm);
  const CM = CARM.models[c.model || 0], sp = CM.sp, sc = sp.scale;
  M4.mul(_cs, _cm, M4.scale(_t2, sc[0], sc[1], sc[2]));
  gl.uniformMatrix4fv(P.u('uModel'), false, _cs);
  setDamageUniforms(c, P, true);
  if (!shadow) { gl.uniform4f(P.u('uCab'), sp.cabF, sp.roofF, sp.roofR, sp.cabR); gl.uniform4f(P.u('uCab2'), sp.bpil, sp.cpil, 0, 0); gl.uniform4fv(P.u('uCarOpt'), sp.opt); }
  if (!shadow) {
    gl.uniform3fv(P.u('uBody'), c.liv.body); gl.uniform3fv(P.u('uAccent'), c.liv.accent);
    gl.uniform4f(P.u('uP'), 0, 0, c.brakeLight || 0, 0); gl.uniform1f(P.u('uInside'), inside ? 1 : 0);
  }
  gl.bindVertexArray(CM.body.vao); gl.drawElements(gl.TRIANGLES, CM.body.count, CM.body.itype, 0);
  if (!shadow) gl.uniform4f(P.u('uP'), 2, 0, 0, 0);
  gl.bindVertexArray(CM.kit.vao); gl.drawElements(gl.TRIANGLES, CM.kit.count, CM.kit.itype, 0);
  if (!shadow) { gl.uniform4f(P.u('uP'), 3, (c.idx || 0) % 8, 0, 0); bindTex(0, TEX.plate); gl.bindVertexArray(CARM.plate.vao); gl.drawElements(gl.TRIANGLES, CARM.plate.count, CARM.plate.itype, 0); }
  if (inside && !shadow) {
    gl.uniform4f(P.u('uP'), 2, 0, 0, 0); gl.uniform4f(P.u('uDmg'), 0, 0, 0, 0);
    gl.bindVertexArray(CARM.cabin.vao); gl.drawElements(gl.TRIANGLES, CARM.cabin.count, CARM.cabin.itype, 0);
    M4.mul(_t1, _cm, M4.translate(_t2, 0.36, 0.84, 0.36)); M4.mul(_t1, _t1, M4.rotX(_t2, -0.35)); M4.mul(_t1, _t1, M4.rotZ(_t2, -(c.steer || 0) * 3.2));
    gl.uniformMatrix4fv(P.u('uModel'), false, _t1); gl.bindVertexArray(CARM.steer.vao); gl.drawElements(gl.TRIANGLES, CARM.steer.count, CARM.steer.itype, 0);
  }
  gl.uniform4f(P.u('uDmg'), 0, (c.dmg || 0) / DMG_MAX, 0, 0);
  if (!shadow) gl.uniform4f(P.u('uP'), 1, 0, 0, 0);
  gl.bindVertexArray(CARM.wheel.vao);
  const wr = wreckOf(c);
  for (let w = 0; w < 4; w++) {
    const front = w < 2, sx = (w & 1) ? -1 : 1;
    M4.translate(_t1, sx * CARGEO.track * sc[0], CARGEO.wr - (c.heave || 0) * 0.6, (front ? CARGEO.zw : -CARGEO.zw) * sc[2]);
    M4.mul(_wm, _cm, _t1);
    if (front && c.steer) M4.mul(_wm, _wm, M4.rotY(_t2, c.steer));
    // 全毀時左前輪外傾、右後輪內傾
    if (wr > 0.5 && w === 0) M4.mul(_wm, _wm, M4.rotZ(_t2, 0.24 * wr));
    if (wr > 0.5 && w === 3) M4.mul(_wm, _wm, M4.rotZ(_t2, 0.12 * wr));
    if (sx < 0) M4.mul(_wm, _wm, M4.rotY(_t2, PI));
    const spin = (c.spin || 0) * sx;
    M4.mul(_wm, _wm, M4.rotX(_t2, spin));
    gl.uniformMatrix4fv(P.u('uModel'), false, _wm);
    if (!shadow) gl.uniform4f(P.u('uP'), 1, -spin, 0, c.v || 0);
    gl.drawElements(gl.TRIANGLES, CARM.wheel.count, CARM.wheel.itype, 0);
  }
}
// 拋錨後站在車旁、雙手一攤的車主
const _dr = M4.create(), _dj = M4.create(), _dk = M4.create(), _dl = M4.create(), _dt = M4.create(), _dtr = {};
function driverRoot(c, out) {
  const t = trackAt(c.s, _dtr), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw), fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  // 站在靠路中央的一側
  let side = Math.sign(lx * (-c.d * t.nx) + lz * (-c.d * t.nz)) || 1; if (Math.abs(c.d) < 0.8) side = 1;
  const px = c.x + lx * side * 1.85 + fx * 0.5, pz = c.z + lz * side * 1.85 + fz * 0.5, py = groundY(px, pz);
  // 面向外側並略朝車頭
  let hx = lx * side * 0.75 + fx * 0.6, hz = lz * side * 0.75 + fz * 0.6; const hl = Math.hypot(hx, hz); hx /= hl; hz /= hl;
  return M4.fromBasis(out, hz, 0, -hx, 0, 1, 0, hx, 0, hz, px, py, pz);
}
function drawDriver(c, P, shadow) {
  const D = CARM.drv, t = c.brokenT || 0;
  const part = (m, M) => { gl.uniformMatrix4fv(P.u('uModel'), false, M); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, m.itype, 0); };
  gl.uniform4f(P.u('uDmg'), 0, 0, 0, 0); if (!shadow) { gl.uniform4f(P.u('uP'), 2, 0, 0, 0); gl.uniform3fv(P.u('uBody'), c.liv.body); }
  driverRoot(c, _dr);
  const shrug = 0.5 + 0.5 * Math.sin(t * 2.3 - 1.2), f = shrug * shrug * (3 - 2 * shrug);
  const shakeE = Math.max(0, Math.sin(t * 0.7 + 0.8)), look = smooth(0.2, 0.9, Math.sin(t * 0.45 + 2.0));
  // 雙腿
  for (const sx of [-1, 1]) {
    M4.mul(_dj, _dr, M4.translate(_dt, sx * 0.1, 0.93, 0)); M4.mul(_dj, _dj, M4.rotZ(_dt, sx * 0.06));
    part(D.thigh, _dj);
    M4.mul(_dk, _dj, M4.translate(_dt, 0, -0.46, 0)); M4.mul(_dk, _dk, M4.rotZ(_dt, -sx * 0.05));
    part(D.shin, _dk);
  }
  M4.mul(_dj, _dr, M4.translate(_dt, 0, 0.95, 0)); part(D.pelvis, _dj);
  // 軀幹：吸氣聳肩時略後仰
  M4.mul(_dj, _dj, M4.rotX(_dt, -0.05 - 0.04 * f));
  part(D.torso, _dj);
  // 頭：側傾、搖頭、不時回頭看車
  M4.mul(_dk, _dj, M4.translate(_dt, 0, 0.53 + 0.02 * f, 0));
  M4.mul(_dk, _dk, M4.rotY(_dt, -look * 0.9 + 0.28 * Math.sin(t * 6.5) * shakeE));
  M4.mul(_dk, _dk, M4.rotZ(_dt, 0.16 * Math.sin(t * 0.9) + 0.1 * f)); M4.mul(_dk, _dk, M4.rotX(_dt, 0.12 * f - 0.05));
  part(D.head, _dk);
  // 雙臂：上臂外張、手肘彎曲、前臂往外上攤開、掌心朝上
  for (const sx of [-1, 1]) {
    M4.mul(_dk, _dj, M4.translate(_dt, sx * 0.2, 0.45 + 0.05 * f, 0));
    M4.mul(_dk, _dk, M4.rotZ(_dt, sx * (0.38 + 0.18 * f))); M4.mul(_dk, _dk, M4.rotX(_dt, -0.22));
    part(D.uarm, _dk);
    M4.mul(_dl, _dk, M4.translate(_dt, 0, -0.29, 0));
    M4.mul(_dl, _dl, M4.rotX(_dt, -1.45 - 0.25 * f)); M4.mul(_dl, _dl, M4.rotZ(_dt, sx * (0.45 + 0.55 * f))); M4.mul(_dl, _dl, M4.rotY(_dt, sx * (0.9 + 0.3 * f)));
    part(D.farm, _dl);
  }
}
