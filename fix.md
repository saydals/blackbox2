# fix.md — 전체화면 그래프 제스처가 오른쪽 영역에서만 작동하는 문제

- 대상 저장소: https://github.com/saydals/blackbox2 (master)
- 기준 커밋: `5bb0288` "Add Android fullscreen touch controls (3-zone tap / pinch zoom / drag pan)"
- 변경 파일: `src/blackbox-viewer/touch_fullscreen_controls.js`, `src/blackbox-viewer/css/main.css`, `src/blackbox-viewer/main.js`
- 작성일: 2026-09-20

---

## 1. 문제 제기

메인 그래프 영역(`#log-graph` > `#graphCanvas`)과 Legend 영역(`.log-graph-config`)이 존재하고,
그래프 영역 왼쪽 위의 전체화면 아이콘으로 그래프 전용 전체화면에 진입할 수 있다. 이 상태에서
Android APK 환경으로 다음 증상이 보고되었다.

| # | 증상 |
|---|------|
| 1 | 전체화면에서 play/pause 터치가 그래프 영역의 오른쪽 반쪽에서만 동작한다 |
| 2 | 오른쪽 터치(속도 증가)는 되지만, 왼쪽 터치(속도 감소)는 전혀 반응이 없다 — 즉 "증가만 되고 감소는 안 된다" |
| 3 | 두 손가락 핀치 확대/축소도 오른쪽 반쪽에서만 시작된다 |
| 4 | 드래그로 그래프 이동도 오른쪽 일부(체감상 약 60~90% 구간)에서만 작동한다 |
| 5 | 전체화면이 아닌 일반 화면의 드래그 시크(drag-to-seek)도 마찬가지로 오른쪽에서만 작동한다 (최초 보고) |

왼쪽에는 주파수 분석 박스(Spectrum Analyser)가 떠 있고, 이 박스는 스펙트럼 타입 선택·줌 슬라이더
등 터치로 조작해야 하는 기능을 담고 있다. 그래프 영역 전체를 제스처 핸들러로 쓰면 이 기능과
충돌하기 때문에, **왼쪽은 분석기에 예약하고 제스처는 오른쪽 50~100% 영역에서만 구현하는 것**을
요구사항으로 확정한다.

- 탭 3분할: **50–65% 느리게 / 65–85% 정지·플레이 / 85–100% 빠르게**
- 드래그(그래프 이동)와 핀치(확대·축소)도 **오른쪽 영역에서만** 작동

---

## 2. 원인 분석

### 2.1 구조적 원인 — 그래프 캔버스 위에 얹힌 "투명하지만 터치를 먹는" 오버레이

`#log-graph`(.log-graph) 내부의 DOM 나열 순서는 곧 쌓임(stack) 순서이며, 아래로 갈수록 위에
페인트된다.

```
#log-graph (position: relative)
├─ button.graph-fullscreen-toggle   z-index 6 · 좌상단 28×28 (전체화면 아이콘)
├─ .graph-filename-overlay          pointer-events: none → 터치 통과 (문제 없음)
├─ video#logVideo                   캔버스보다 아래 (문제 없음)
├─ canvas#graphCanvas               ◀ 제스처 레이어 / 드래그 시크가 부착되는 대상
├─ canvas#craftCanvas               ◀ [원인 1] 그래프 위에 표시되는 3D 모델
├─ #analyser (SpectrumAnalyser)     ◀ [원인 2] z-index 10 · 주파수 분석 박스
├─ #mapContainer                    (GPS 지도 — 기본 비표시)
└─ canvas#stickCanvas               ◀ [원인 3] 그래프 위에 표시되는 스틱 게이지
```

기본 사용자 설정(`user_settings_data.js`)과 배치 계산(`grapher.js resize()`)에 따른 실제
기하학적 점유는 다음과 같다.

| 오버레이 | 기본 설정 | 화면 점유 (가로 그래프 기준) | 터치 필요 여부 |
|----------|-----------|------------------------------|----------------|
| `#craftCanvas` | `hasCraft: true`, `craft {left 20%, top 5%, size 80%}` | 그래프 **높이의 80% 정사각형**을 좌상단에 배치 → **왼쪽 약 35~50%+ 를 덮음** (화면 비율에 따라 가변) | 불필요 (핸들러 없음) |
| `#analyser` | `analyser {left 2%, top 60%, size 35%}`, **z-index 10** | 좌하단 (주파수 박스) | **필요** — 스펙트럼 타입 셀렉트, 줌 슬라이더, PSD 입력 |
| `#stickCanvas` | `drawSticks: true`, `sticks {left 75%, top 20%, size 30%}` | **x = 60~90%, y = 12.5~27.5%** 밴드 → 오른쪽 영역 한가운데를 가로지르는 죽은 띠 | 불필요 (핸들러 없음) |

여기서 핵심은 브라우저(WebView)의 히트테스트 규칙이다.

> **캔버스 요소는 픽셀이 완전히 투명해도 터치 히트테스트 대상이 된다.**

craft/sticks 캔버스는 배경이 투명해서 눈으로는 뒤의 그래프가 그대로 보이지만, 해당 사각형 위의
터치는 전부 캔버스 요소가 받아버린다. 전체 소스를 검색한 결과 이 두 캔버스에는 **어떤 이벤트
핸들러도 등록되어 있지 않다**(`craftCanvas.addEventListener` / `stickCanvas.addEventListener`
0건). 즉 순수하게 터치만 가로채고 아무 기능도 하지 않는 요소다.

### 2.2 왜 "속도 증가만 되고 감소는 안 되었나"

마지막 커밋(`5bb0288`)의 탭 존 판정은 **캔버스 전체 폭을 3등분**하는 경계를 사용했다.

```js
// 구버전 touch_fullscreen_controls.js (onTouchEnd)
const x = (e.changedTouches[0].clientX - rect.left) / rect.width;
if (x < 1/3)       onSlowPlay();   // 왼쪽 1/3 — 감속
else if (x < 2/3)  onPlayPause();  // 중앙 1/3 — 재생/정지
else               onFastPlay();   // 오른쪽 1/3 — 가속
```

이 경계와 2.1의 오버레이 점유를 겹쳐 보면 증상이 정확히 설명된다.

- **감속 존(0~33%)**: craft 모델(좌상단, 폭의 35~50%+)과 분석기(좌하단)가 사실상 전부 덮는다.
  터치가 `graphCanvas`의 `touchstart`에 도달하기 전에 오버레이가 받아버리므로 **감속 탭은
  100% 유실**된다.
- **재생/정지 존(33~67%)**: 왼쪽 절반은 craft에 가려지고, 상단의 sticks 밴드(60~90% ×
  12.5~27.5%)에 걸치는 부분도 유실된다. 확실히 도달하는 영역이 좁다.
- **가속 존(67~100%)**: sticks 밴드와 겹치는 상단 일부를 제외하면 대부분 캔버스에 직접
  도달한다 → **"가속만 되는 것처럼 보인다."**
- **드래그/핀치**: 손가락이 오버레이가 안 덮는 오른쪽 중앙 부근에 놓일 때만 상태 머신이
  시작된다. 기기·설정에 따라 경계가 달라지지만 사용자가 체감한 "약 60~90%에서만 작동"은
  이 죽은 구간들의 합성 결과다.

즉, 제스처 인식 로직 자체의 버그가 아니라 **"누가 터치를 먼저 받느냐(히트테스트 순서)"의
문제**이며, 전체화면 여부와 무관하게 원래부터 존재하던 구조적 결함이다. 전체화면 전용 제스처
레이어가 캔버스 전체를 3등분하는 순간, 기존의 죽은 영역이 그대로 탭 존 유실로 드러난 것이다.

---

## 3. 해결 방법

요구사항(왼쪽 분석기 보존 + 제스처는 오른쪽 50~100% 전용)에 맞춰 3개 파일을 수정한다.

### 3.1 `touch_fullscreen_controls.js` — 제스처 존 게이트와 새 탭 경계

- 제스처 존을 **캔버스 폭의 50~100%**로 한정한다 (`TOUCH_ZONE_START = 0.5`).
- 탭 존 경계를 **50–65 / 65–85 / 85–100%**로 변경한다
  (`TOUCH_ZONE_SLOW_END = 0.65`, `TOUCH_ZONE_CENTER_END = 0.85`).
- 탭 판정 기준을 "손가락을 **뗀** 위치"에서 "손가락을 **누른** 위치(`startXFraction`)"로
  바꾼다 — 터치 순간에 밑에 있던 존이 동작을 결정하는 직관적 규칙이고, 드래그 판정과 무관하게
  존이 고정된다.
- `onTouchStart`에서 첫 손가락이 왼쪽 절반이면 아예 `preventDefault()`조차 하지 않고
  스탠드다운한다 → 왼쪽(분석기 박스 포함)의 고유 터치 동작을 침범하지 않는다.
- 핀치 중 한 손가락을 뗀 뒤 남은 손가락이 왼쪽 절반으로 밀렸을 경우에는 탭 재판정을 시작하지
  않도록 `beginDecision`에 동일한 게이트를 둔다.

### 3.2 `main.css` — 장식용 오버레이 터치 투과

- `#craftCanvas`, `#stickCanvas`에 `pointer-events: none`을 부여해 그래프 캔버스 위의 터치를
  더 이상 가로채지 않게 한다. 두 캔버스는 핸들러가 전혀 없는 장식 요소이므로 부작용이 없다.
- **`#analyser`는 의도적으로 제외한다** — 주파수 박스의 터치 선택 기능을 그대로 보존하기
  위함이며, 이것이 "왼쪽 절반을 제스처에 쓰지 않는다"는 요구사항의 근거이기도 하다.
- 부수 효과로 **일반 화면(비전체화면)의 드래그 시크도 craft 모델/스틱 위에서 막히지 않게
  된다**(분석기 박스 영역은 제외) — 최초 보고였던 증상 5가 이 변경 하나로 함께 완화된다.

### 3.3 `main.js` — 안내 문구 갱신

전체화면 진입 시 표시되는 터치 안내 토스트를 새 존 경계(50-65 / 65-85 / 85-100)에 맞춰
수정한다.

### 3.4 수정 후 동작 지도

```
 0%            50%      65%          85%          100%
 ┌─────────────────┬────────┬────────────┬────────────┐
 │  분석기 예약 영역  │ 느리게  │ 정지/플레이  │   빠르게    │  ◀ 탭
 │ (주파수 박스 등   ├────────┴────────────┴────────────┤
 │  기존 터치 유지)  │  드래그 = 그래프 이동              │  ◀ 1손가락 드래그
 │                  │  핀치   = 확대/축소                │  ◀ 2손가락
 └─────────────────┴───────────────────────────────────┘
        왼쪽 절반                     오른쪽 절반 (제스처 존)
```

---

## 4. 수정 diff

`git diff` 출력 그대로이다. 아래 내용을 `fix.patch` 등으로 저장해
`git apply fix.patch`로 적용할 수 있다.

```diff
diff --git a/src/blackbox-viewer/css/main.css b/src/blackbox-viewer/css/main.css
index 1b7be63..a5542f6 100644
--- a/src/blackbox-viewer/css/main.css
+++ b/src/blackbox-viewer/css/main.css
@@ -314,6 +314,25 @@
     display: block;
 }
 
+/*
+ * #craftCanvas and #stickCanvas are pure decorations painted OVER the graph
+ * canvas (3D model, top-left ≈ first 40–46 % of the width; stick gauges, a
+ * 60–90 % width band). A canvas hit-tests every touch even where its pixels
+ * are fully transparent, so these overlays used to swallow the touches meant
+ * for #graphCanvas: the left half of the graph went dead (craft model) and a
+ * dead band cut through the right half (sticks) — breaking both the legacy
+ * drag-to-seek and the fullscreen gesture layer. Neither canvas registers
+ * any event handler of its own, so making them click-through is safe.
+ * #analyser is intentionally NOT listed: it hosts real touch targets
+ * (spectrum type select, zoom sliders, PSD inputs) and keeps its pointer
+ * events on the left half of the graph — see touch_fullscreen_controls.js,
+ * whose gesture zone starts at 50 % of the canvas width.
+ */
+#craftCanvas,
+#stickCanvas {
+    pointer-events: none;
+}
+
 #mapContainer.no-gps-data:before {
     position: absolute;
     display: block;
diff --git a/src/blackbox-viewer/main.js b/src/blackbox-viewer/main.js
index f4c08ec..1dc18c7 100644
--- a/src/blackbox-viewer/main.js
+++ b/src/blackbox-viewer/main.js
@@ -886,7 +886,7 @@ export function bootstrapViewer() {
                 }
                 if (fullscreen && logStore.hasLog) {
                     showTouchNote(
-                        "Touch · left: slow · center: play/pause · right: fast<br>Pinch: zoom · drag: pan",
+                        "Touch right half · 50-65: slow · 65-85: play/pause · 85-100: fast<br>Pinch: zoom · drag: pan",
                         2500,
                     );
                 }
diff --git a/src/blackbox-viewer/touch_fullscreen_controls.js b/src/blackbox-viewer/touch_fullscreen_controls.js
index 0c068b1..722470f 100644
--- a/src/blackbox-viewer/touch_fullscreen_controls.js
+++ b/src/blackbox-viewer/touch_fullscreen_controls.js
@@ -9,11 +9,16 @@ import { GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM } from "./stores/graph.js";
  * any more. This module gives the graph canvas a touch gesture set, active
  * only while the graph-only fullscreen is on and a log is loaded:
  *
- *   tap  left third   → slow playback (TOUCH_SLOW_RATE, plays if paused)
- *   tap  center third → play / pause toggle
- *   tap  right third  → fast playback (TOUCH_FAST_RATE, plays if paused)
- *   two-finger drag   → pinch zoom of the graph time window
- *   one-finger drag   → pan the graph through time
+ *   Gesture zone — the RIGHT HALF of the canvas only (x >= 50 % of the
+ *   width). The left half is reserved for the analyser overlay (#analyser:
+ *   spectrum type select, zoom sliders, PSD inputs — real touch targets),
+ *   so the gesture layer ignores every touch that begins there.
+ *
+ *   tap  50–65 %   → slow playback (TOUCH_SLOW_RATE, plays if paused)
+ *   tap  65–85 %   → play / pause toggle
+ *   tap  85–100 %  → fast playback (TOUCH_FAST_RATE, plays if paused)
+ *   two-finger drag (anchored in the zone) → pinch zoom of the time window
+ *   one-finger drag (starts in the zone)   → pan the graph through time
  *
  * Gesture recognition lives here; every action is a callback supplied by
  * main.js, so playback, rate and zoom run through the exact same pipeline
@@ -38,6 +43,21 @@ export const TOUCH_FAST_RATE = 200;
 const TAP_SLOP_PX = 10;
 const TAP_MAX_MS = 350;
 
+/* Gesture zone — right half of the canvas, as a fraction of its width.
+ * Touches that begin left of this line are not gestures: they belong to
+ * the analyser overlay (frequency box) and stay untouched by this layer.
+ * The decorative craft/stick canvases that used to swallow touches inside
+ * the right half are made click-through in main.css (pointer-events:none),
+ * so the zone below is guaranteed reachable edge to edge (50–100 %). */
+export const TOUCH_ZONE_START = 0.5;
+
+/* Tap verdict bounds INSIDE the gesture zone, still expressed as fractions
+ * of the FULL canvas width: 50–65 slow, 65–85 play/pause, 85–100 fast.
+ * The verdict uses where the finger WENT DOWN (not where it lifted), so
+ * the zone under the finger at touch time decides the action. */
+export const TOUCH_ZONE_SLOW_END = 0.65;
+export const TOUCH_ZONE_CENTER_END = 0.85;
+
 /**
  * @param {Object} ctx
  * @param {HTMLCanvasElement} ctx.canvas - #graphCanvas (fills .log-graph)
@@ -59,6 +79,7 @@ export function attachFullscreenTouchControls({ canvas, graphStore, logStore, ac
     let startX = 0;
     let startY = 0;
     let startTime = 0;
+    let startXFraction = 0;
     let lastX = 0;
     let pinchStartDist = 0;
     let pinchStartZoom = 0;
@@ -73,8 +94,27 @@ export function attachFullscreenTouchControls({ canvas, graphStore, logStore, ac
         return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
     }
 
+    /* X of a client-space point as a fraction of the on-screen canvas box
+     * (CSS pixels — the same space the tap zones are defined in). */
+    function canvasXFraction(clientX) {
+        const rect = canvas.getBoundingClientRect();
+        return (clientX - rect.left) / rect.width;
+    }
+
+    function inGestureZone(clientX) {
+        return canvasXFraction(clientX) >= TOUCH_ZONE_START;
+    }
+
     function beginDecision(e) {
+        const x = canvasXFraction(e.touches[0].clientX);
+        if (x < TOUCH_ZONE_START) {
+            // Survivor finger of a pinch drifted into the analyser half —
+            // never start a tap decision from the left half.
+            mode = "idle";
+            return;
+        }
         mode = "deciding";
+        startXFraction = x;
         startX = lastX = e.touches[0].pageX;
         startY = e.touches[0].pageY;
         startTime = Date.now();
@@ -84,6 +124,14 @@ export function attachFullscreenTouchControls({ canvas, graphStore, logStore, ac
         if (!active()) {
             return;
         }
+        // Zone gate — the FIRST touch of the list anchors the gesture. When
+        // it starts on the left half this layer stands down entirely and
+        // does NOT preventDefault(), so the analyser overlay and everything
+        // under it keep their native touch behavior. (This also rejects a
+        // pinch whose first finger landed on the analyser.)
+        if (!inGestureZone(e.touches[0].clientX)) {
+            return;
+        }
         if (e.touches.length === 1) {
             beginDecision(e);
         } else if (e.touches.length === 2) {
@@ -140,13 +188,13 @@ export function attachFullscreenTouchControls({ canvas, graphStore, logStore, ac
 
     function onTouchEnd(e) {
         if (mode === "deciding" && Date.now() - startTime <= TAP_MAX_MS) {
-            // Zone verdict from where the finger LIFTED (changedTouches), in
-            // CSS pixels relative to the on-screen canvas box.
-            const rect = canvas.getBoundingClientRect();
-            const x = (e.changedTouches[0].clientX - rect.left) / rect.width;
-            if (x < 1 / 3) {
+            // Zone verdict from where the finger WENT DOWN (startXFraction,
+            // fraction of the full canvas width): 50–65 slow, 65–85
+            // play/pause, 85–100 fast. A deciding touch always started in
+            // the gesture zone, so no left-half case can reach here.
+            if (startXFraction < TOUCH_ZONE_SLOW_END) {
                 onSlowPlay();
-            } else if (x < 2 / 3) {
+            } else if (startXFraction < TOUCH_ZONE_CENTER_END) {
                 onPlayPause();
             } else {
                 onFastPlay();
```

---

## 5. 적용 및 빌드

```bash
# 저장소 루트에서
git apply fix.patch

# 웹 빌드 확인
npm install
npm run build

# Android APK 반영
npx cap sync android
cd android && ./gradlew assembleDebug   # 또는 assembleRelease
```

## 6. 검증 체크리스트 (Android APK, 로그 로드 후)

전체화면 진입(그래프 좌상단 아이콘) 상태에서:

- [ ] 그래프 폭의 50~65% 지점 탭 → 재생 속도 25%로 감속 (정지 상태였다면 재생 시작)
- [ ] 65~85% 지점 탭 → play/pause 토글
- [ ] 85~100% 지점 탭 → 재생 속도 200%로 가속
- [ ] **오른쪽 절반의 어느 지점에서든** 1손가락 드래그 → 그래프 시간 이동 (craft 모델·스틱 게이지 위 포함)
- [ ] 오른쪽 절반에서 2손가락 벌리기/모으기 → 그래프 확대/축소 (커서 중심 유지)
- [ ] 왼쪽 절반(분석기 박스 밖) 터치 → 아무 제스처도 발생하지 않음 (의도된 예약 영역)
- [ ] 왼쪽 주파수 박스 터치 → 스펙트럼 타입 선택, 줌 슬라이더 등 기존 기능 정상
- [ ] 전체화면 해제 → 데스크톱/키보드 동작(마우스 드래그 시크 등)에 변화 없음
- [ ] 일반 화면에서 craft 모델·스틱 게이지 위를 드래그 → 시크 동작 (부수 개선)

## 7. 참고 사항

- 제스처 존의 기준은 `graphCanvas`의 화면상 사각형(`getBoundingClientRect()`)이므로, 기기
  회전·화면 비율·Legend 폭이 달라져도 항상 "그래프 영역의 오른쪽 절반"으로 자동 보정된다.
- 사용자 설정(User Settings)에서 Analyser 박스를 이동하면 그 영역은 분석기가 최상단(z-index
  10)이라 분석기 터치가 우선한다. 제스처 존과 분석기를 겹치지 않게 두려면 Analyser를 기본값
  대로 왼쪽에 두면 된다.
- 탭 감속/가속 비율(`TOUCH_SLOW_RATE = 25`, `TOUCH_FAST_RATE = 200`)은 기존 값을 유지하며,
  SpeedPanel 스텝 목록의 값이므로 숨겨진 속도 표시와 정합성이 유지된다.
