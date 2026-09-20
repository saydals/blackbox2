# fix2.md — 전체화면 터치 속도 조절을 "고정 속도"에서 "단계별 증감"으로 변경

- 대상 저장소: https://github.com/saydals/blackbox2 (master)
- 기준 커밋: `80bb424` "fix: restrict fullscreen touch gesture zone to right canvas half and make decorative overlays click-through"
  (이전 fix.md 패치가 적용·푸시된 상태 = 그 위에 바로 적용되는 2차 패치)
- 변경 파일: `src/blackbox-viewer/stores/playback.js`, `src/blackbox-viewer/main.js`,
  `src/blackbox-viewer/touch_fullscreen_controls.js`, `src/blackbox-viewer/components/SpeedPanel.vue`
- 작성일: 2026-09-20

---

## 1. 문제 제기

이전 패치로 전체화면 제스처 존(오른쪽 50~100%, 탭 3분할 50-65 / 65-85 / 85-100)이 동작하게
되었지만, 속도 조절 방식이 요구사항과 다르다.

| # | 증상 |
|---|------|
| 1 | 왼쪽(50~65%) 터치 시 항상 **25%로 고정**, 오른쪽(85~100%) 터치 시 항상 **200%로 고정**된다 |
| 2 | 초기 100% 속도로 재생되다가 양쪽 터치를 하면 무조건 25% 또는 200%로 점프한다 |
| 3 | 사용자가 원한 것은 감속/가속 **버튼** — 터치할 때마다 한 단계씩 증감하는 방식이다 |

요구되는 동작(앱이 지원하는 속도 단계: **10 · 25 · 50 · 75 · 100 · 150 · 200 %**):

- 100%에서 왼쪽 터치 → 75%, 한 번 더 왼쪽 터치 → 50% → 25% → 10% (단계별 감속)
- 100%에서 오른쪽 터치 → 150%, 한 번 더 오른쪽 터치 → 200% (단계별 가속)
- 가운데(65~85%) 터치 = play/pause (기존 유지)

## 2. 원인 분석

### 2.1 고정 상수 하드코딩

`touch_fullscreen_controls.js`가 속도를 상수로 박아 두었다.

```js
// 구버전 — 왼쪽/오른쪽 터치가 "해당 값으로 이동"하는 스냅 동작
export const TOUCH_SLOW_RATE = 25;   // 왼쪽 탭 → 무조건 25 %
export const TOUCH_FAST_RATE = 200;  // 오른쪽 탭 → 무조건 200 %
```

`main.js`의 액션도 이 상수를 그대로 `setPlaybackRate()`에 넘기고, 심지어
`setGraphState(GRAPH_STATE_PLAY)`로 **일방적으로 재생까지 시작**했다.

```js
// 구버전 main.js actions
onSlowPlay: () => {
    setPlaybackRate(TOUCH_SLOW_RATE);      // 25로 스냅
    setGraphState(GRAPH_STATE_PLAY);       // 강제 재생
    showTouchNote(`${TOUCH_SLOW_RATE} % · slow`, 1000);
},
onFastPlay: () => {
    setPlaybackRate(TOUCH_FAST_RATE);      // 200으로 스냅
    ...
},
```

즉 "현재 속도가 몇이든" 왼쪽은 25, 오른쪽은 200으로 이동하는 **이동(snap) 버튼**이었지,
증감(stepper) 버튼이 아니었다.

### 2.2 속도 사다리가 컴포넌트 안에 갇혀 있었음

단계 목록 `[10, 25, 50, 75, 100, 150, 200]`과 "가장 가까운 단계 찾기" 로직은
`SpeedPanel.vue`의 **script setup 지역 상수/함수**로만 존재했다. 터치 제스처 레이어에서 같은
사다리를 쓰려면 이 목록을 공유 모듈로 승격시켜야 한다. (중복 정의하면 나중에 단계를 바꿀 때
두 곳을 고쳐야 하므로 단일 진실 공급원으로 옮기는 것이 정답.)

## 3. 해결 방법

### 3.1 `stores/playback.js` — 공유 속도 사다리 도입

- `PLAYBACK_RATE_STEPS = [10, 25, 50, 75, 100, 150, 200]`를 스토어 모듈에서 export.
- `findClosestRateStepIndex(rate)` 헬퍼도 함께 export — 현재 속도가 목록 밖의 값(프로그램
  설정값 등)이어도 가장 가까운 단계에서 증감을 시작하므로 조회가 깨지지 않는다.

### 3.2 `SpeedPanel.vue` — 중복 제거

- 지역 `STEPS` 상수와 `findClosestStepIndex()`를 삭제하고 스토어의 공유 사다리를 import.
  패널의 ±/사이클 버튼 동작은 기존과 100% 동일하다.

### 3.3 `touch_fullscreen_controls.js` — 액션 시그니처 변경

- `TOUCH_SLOW_RATE` / `TOUCH_FAST_RATE` 상수 삭제.
- `onSlowPlay` / `onFastPlay` → **`onRateDown` / `onRateUp`** 으로 교체. 제스처 레이어는
  "어느 존가 탭되었는가"만 판정하고, 실제 증감은 콜백(main.js)이 수행한다 — 기존 설계 원칙
  (제스처 인식과 동작의 분리)을 그대로 유지.

### 3.4 `main.js` — 단계 증감 헬퍼

```js
const stepTouchRate = (direction) => {
    const currentIndex = findClosestRateStepIndex(playbackStore.playbackRate);
    const nextIndex = Math.max(0, Math.min(PLAYBACK_RATE_STEPS.length - 1, currentIndex + direction));
    const nextRate = PLAYBACK_RATE_STEPS[nextIndex];
    setPlaybackRate(nextRate);
    showTouchNote(`${nextRate} %...`, 1000);
};
```

동작 규격:

- **한 번 탭 = 사다리 한 칸.** 왼쪽 존 `-1`, 오른쪽 존 `+1`.
- **끝에서는 클램프** — 10%에서 왼쪽 탭하면 10% 유지(토스트에 `10 % · min`), 200%에서
  오른쪽 탭하면 200% 유지(`200 % · max`). 감속 버튼이 갑자기 최고 속도로 "순환(wrap)"하는
  것은 버튼의 직관에 어긋나므로, SpeedPanel의 wrap 방식과 일부러 다르게 클램프를 선택했다.
- **재생 상태는 건드리지 않음.** 이전 패치의 강제 재생(`GRAPH_STATE_PLAY`)을 제거했다.
  속도 조절은 순수 속도 변경이고 재생/정지는 가운데 존 전용이다. (정지 상태에서 탭하면
  속도만 바뀌고 토스트로 확인 가능)
- 토스트는 새 속도를 표시하므로 연속 탭 시 `100 % → 75 % → 50 % …` 진행이 눈에 보인다.

### 3.5 수정 후 동작 흐름

```
  현재 속도가 playbackStore.playbackRate (%) 에 저장됨
        │  왼쪽 탭 (50~65%)                오른쪽 탭 (85~100%)
        ▼                                     ▼
  onRateDown()                          onRateUp()
        └────────── stepTouchRate(±1) ────────┘
                        │
      findClosestRateStepIndex(현재 속도) → 인덱스 ±1 (클램프)
                        │
              PLAYBACK_RATE_STEPS[인덱스]
                        │
      setPlaybackRate(새 속도) + 토스트 "새 속도 %"

  사다리:  10 ── 25 ── 50 ── 75 ── 100 ── 150 ── 200
           ◀── 왼쪽 탭                    오른쪽 탭 ──▶
```

예: 100%에서 왼쪽 탭 → 75% → 왼쪽 탭 → 50% → 25% → 10% (· min)
    100%에서 오른쪽 탭 → 150% → 오른쪽 탭 → 200% (· max)

---

## 4. 수정 diff

기준 커밋 `80bb424` (이전 fix 패치가 적용된 상태) 위에 바로 적용된다. 아래 내용을
`fix2.patch` 등으로 저장해 `git apply fix2.patch`로 적용할 수 있다.

```diff
diff --git a/src/blackbox-viewer/components/SpeedPanel.vue b/src/blackbox-viewer/components/SpeedPanel.vue
index 1356bdf..80774e8 100644
--- a/src/blackbox-viewer/components/SpeedPanel.vue
+++ b/src/blackbox-viewer/components/SpeedPanel.vue
@@ -16,40 +16,25 @@
 </template>
 
 <script setup>
-import { usePlaybackStore } from "../stores/playback.js";
+import { usePlaybackStore, PLAYBACK_RATE_STEPS, findClosestRateStepIndex } from "../stores/playback.js";
 
 const emit = defineEmits(["rate-change"]);
 
 const playbackStore = usePlaybackStore();
 
-const STEPS = [10, 25, 50, 75, 100, 150, 200];
-
-function findClosestStepIndex(rate) {
-    let index = 0;
-    let minDiff = Math.abs(STEPS[0] - rate);
-    for (let i = 1; i < STEPS.length; i++) {
-        const diff = Math.abs(STEPS[i] - rate);
-        if (diff < minDiff) {
-            minDiff = diff;
-            index = i;
-        }
-    }
-    return index;
-}
-
 function cycleRate() {
     const current = playbackStore.playbackRate;
-    const currentIndex = findClosestStepIndex(current);
-    const nextIndex = (currentIndex + 1) % STEPS.length;
-    emit("rate-change", STEPS[nextIndex]);
+    const currentIndex = findClosestRateStepIndex(current);
+    const nextIndex = (currentIndex + 1) % PLAYBACK_RATE_STEPS.length;
+    emit("rate-change", PLAYBACK_RATE_STEPS[nextIndex]);
 }
 
 function changeRate(direction) {
     const current = playbackStore.playbackRate;
-    const currentIndex = findClosestStepIndex(current);
+    const currentIndex = findClosestRateStepIndex(current);
     let nextIndex = currentIndex + direction;
-    if (nextIndex < 0) nextIndex = STEPS.length - 1;
-    if (nextIndex >= STEPS.length) nextIndex = 0;
-    emit("rate-change", STEPS[nextIndex]);
+    if (nextIndex < 0) nextIndex = PLAYBACK_RATE_STEPS.length - 1;
+    if (nextIndex >= PLAYBACK_RATE_STEPS.length) nextIndex = 0;
+    emit("rate-change", PLAYBACK_RATE_STEPS[nextIndex]);
 }
 </script>
diff --git a/src/blackbox-viewer/main.js b/src/blackbox-viewer/main.js
index 1dc18c7..5742409 100644
--- a/src/blackbox-viewer/main.js
+++ b/src/blackbox-viewer/main.js
@@ -10,11 +10,7 @@ import { FlightLog } from "./flightlog.js";
 import { stringTimetoMsec, validate, mouseNotification } from "./tools.js";
 import { restorePenDefaults, changePenSmoothing, changePenZoom, changePenExpo } from "./pen_adjustment.js";
 import { createKeydownHandler, createDropdownSpaceGuard } from "./keyboard_handler.js";
-import {
-    attachFullscreenTouchControls,
-    TOUCH_SLOW_RATE,
-    TOUCH_FAST_RATE,
-} from "./touch_fullscreen_controls.js";
+import { attachFullscreenTouchControls } from "./touch_fullscreen_controls.js";
 import { isAndroid } from "@/js/utils/checkCompatibility.js";
 import { upgradeWorkspaceFormat, saveWorkspaces, loadWorkspaces } from "./workspace_io.js";
 import { exportCsv, exportGpx, exportSpectrumToCsv } from "./export_utils.js";
@@ -58,7 +54,12 @@ import { ThemeColors } from "./theme_colors.js";
 import { pinia } from "@/js/pinia_instance.js";
 import { useLogStore } from "./stores/log.js";
 import { useGraphStore } from "./stores/graph.js";
-import { usePlaybackStore, GRAPH_STATE_PAUSED, GRAPH_STATE_PLAY } from "./stores/playback.js";
+import {
+    usePlaybackStore,
+    GRAPH_STATE_PAUSED,
+    PLAYBACK_RATE_STEPS,
+    findClosestRateStepIndex,
+} from "./stores/playback.js";
 import { useWorkspaceStore } from "./stores/workspace.js";
 import { useAppStore } from "./stores/app.js";
 import { useSettingsStore } from "./stores/settings.js";
@@ -848,6 +849,22 @@ export function bootstrapViewer() {
             );
         };
 
+        /* One tap on the left/right zone moves the playback rate by a single
+         * rung of the shared ladder (10·25·50·75·100·150·200 % — the same
+         * stops the SpeedPanel stepper uses), clamped at the ends: a speed
+         * STEPPER, not a fixed-rate button. Purely a rate change — the
+         * play/pause state is left untouched (the center zone owns that). */
+        const stepTouchRate = (direction) => {
+            const currentIndex = findClosestRateStepIndex(playbackStore.playbackRate);
+            const nextIndex = Math.max(0, Math.min(PLAYBACK_RATE_STEPS.length - 1, currentIndex + direction));
+            const nextRate = PLAYBACK_RATE_STEPS[nextIndex];
+            setPlaybackRate(nextRate);
+            showTouchNote(
+                `${nextRate} %${nextIndex === 0 ? " · min" : nextIndex === PLAYBACK_RATE_STEPS.length - 1 ? " · max" : ""}`,
+                1000,
+            );
+        };
+
         const destroyFullscreenTouchControls = attachFullscreenTouchControls({
             canvas,
             graphStore,
@@ -858,16 +875,8 @@ export function bootstrapViewer() {
                 // identical to the desktop mouse drag.
                 onGraphSeek: (offset) => graph?.onSeek?.(offset),
                 onPlayPause: () => logPlayPause(),
-                onSlowPlay: () => {
-                    setPlaybackRate(TOUCH_SLOW_RATE);
-                    setGraphState(GRAPH_STATE_PLAY);
-                    showTouchNote(`${TOUCH_SLOW_RATE} % · slow`, 1000);
-                },
-                onFastPlay: () => {
-                    setPlaybackRate(TOUCH_FAST_RATE);
-                    setGraphState(GRAPH_STATE_PLAY);
-                    showTouchNote(`${TOUCH_FAST_RATE} % · fast`, 1000);
-                },
+                onRateDown: () => stepTouchRate(-1),
+                onRateUp: () => stepTouchRate(1),
                 // playback_controls.setGraphZoom clamps to [1, 1000], syncs
                 // the store, the grapher window and invalidates the graph.
                 onZoom: (zoom) => setGraphZoom(Math.round(zoom)),
@@ -886,7 +895,7 @@ export function bootstrapViewer() {
                 }
                 if (fullscreen && logStore.hasLog) {
                     showTouchNote(
-                        "Touch right half · 50-65: slow · 65-85: play/pause · 85-100: fast<br>Pinch: zoom · drag: pan",
+                        "Touch right half · 50-65: speed down · 65-85: play/pause · 85-100: speed up<br>Pinch: zoom · drag: pan",
                         2500,
                     );
                 }
diff --git a/src/blackbox-viewer/stores/playback.js b/src/blackbox-viewer/stores/playback.js
index b2e2e1a..61c01f9 100644
--- a/src/blackbox-viewer/stores/playback.js
+++ b/src/blackbox-viewer/stores/playback.js
@@ -8,6 +8,29 @@ export const PLAYBACK_MAX_RATE = 300;
 export const PLAYBACK_DEFAULT_RATE = 100;
 export const PLAYBACK_RATE_STEP = 5;
 
+/* Canonical playback-rate ladder (percent) — the stops the SpeedPanel's
+ * touch/stepper UI supports. Single source of truth shared by the SpeedPanel
+ * stepper and the Android fullscreen touch gestures (tap 50–65 % = one step
+ * down, tap 85–100 % = one step up), so every rate control moves on the same
+ * stops and the readout always shows a known step. */
+export const PLAYBACK_RATE_STEPS = [10, 25, 50, 75, 100, 150, 200];
+
+/* Index of the ladder step closest to `rate`. Off-ladder rates (set
+ * programmatically or restored from legacy prefs) therefore step sensibly
+ * from their nearest stop instead of breaking the index lookup. */
+export function findClosestRateStepIndex(rate) {
+    let index = 0;
+    let minDiff = Math.abs(PLAYBACK_RATE_STEPS[0] - rate);
+    for (let i = 1; i < PLAYBACK_RATE_STEPS.length; i++) {
+        const diff = Math.abs(PLAYBACK_RATE_STEPS[i] - rate);
+        if (diff < minDiff) {
+            minDiff = diff;
+            index = i;
+        }
+    }
+    return index;
+}
+
 export const usePlaybackStore = defineStore("playback", () => {
     const graphState = ref(GRAPH_STATE_PAUSED);
     const playbackRate = ref(PLAYBACK_DEFAULT_RATE);
diff --git a/src/blackbox-viewer/touch_fullscreen_controls.js b/src/blackbox-viewer/touch_fullscreen_controls.js
index 722470f..4ff8728 100644
--- a/src/blackbox-viewer/touch_fullscreen_controls.js
+++ b/src/blackbox-viewer/touch_fullscreen_controls.js
@@ -14,9 +14,10 @@ import { GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM } from "./stores/graph.js";
  *   spectrum type select, zoom sliders, PSD inputs — real touch targets),
  *   so the gesture layer ignores every touch that begins there.
  *
- *   tap  50–65 %   → slow playback (TOUCH_SLOW_RATE, plays if paused)
+ *   tap  50–65 %   → playback rate one STEP down the shared ladder
+ *                    (10·25·50·75·100·150·200 %, see stores/playback.js)
  *   tap  65–85 %   → play / pause toggle
- *   tap  85–100 %  → fast playback (TOUCH_FAST_RATE, plays if paused)
+ *   tap  85–100 %  → playback rate one STEP up the shared ladder
  *   two-finger drag (anchored in the zone) → pinch zoom of the time window
  *   one-finger drag (starts in the zone)   → pan the graph through time
  *
@@ -32,12 +33,6 @@ import { GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM } from "./stores/graph.js";
  * fullscreen+Android combination and restores it otherwise.
  */
 
-/* "%" playback rates for the left / right tap zones. Both are members of the
- * SpeedPanel STEPS list so the hidden Speed readout stays on a known step:
- * 25 % is the slowest practical watch-speed step, 200 % is the fastest one. */
-export const TOUCH_SLOW_RATE = 25;
-export const TOUCH_FAST_RATE = 200;
-
 /* A touch counts as a tap only while it stays inside this pixel budget and
  * this time budget; anything else is a pan and must not fire a zone action. */
 const TAP_SLOP_PX = 10;
@@ -66,13 +61,13 @@ export const TOUCH_ZONE_CENTER_END = 0.85;
  * @param {Object} ctx.actions
  * @param {Function} ctx.actions.onGraphSeek - offset micros (same units as graph.onSeek)
  * @param {Function} ctx.actions.onPlayPause
- * @param {Function} ctx.actions.onSlowPlay
- * @param {Function} ctx.actions.onFastPlay
+ * @param {Function} ctx.actions.onRateDown - playback rate one ladder step down
+ * @param {Function} ctx.actions.onRateUp - playback rate one ladder step up
  * @param {Function} ctx.actions.onZoom - zoom factor in percent units, clamped by the caller
  * @returns {Function} destroy — removes the listeners
  */
 export function attachFullscreenTouchControls({ canvas, graphStore, logStore, actions }) {
-    const { onGraphSeek, onPlayPause, onSlowPlay, onFastPlay, onZoom } = actions;
+    const { onGraphSeek, onPlayPause, onRateDown, onRateUp, onZoom } = actions;
 
     // idle → deciding → (tap | pan) → idle, or deciding|pan → pinch → idle.
     let mode = "idle";
@@ -189,15 +184,16 @@ export function attachFullscreenTouchControls({ canvas, graphStore, logStore, ac
     function onTouchEnd(e) {
         if (mode === "deciding" && Date.now() - startTime <= TAP_MAX_MS) {
             // Zone verdict from where the finger WENT DOWN (startXFraction,
-            // fraction of the full canvas width): 50–65 slow, 65–85
-            // play/pause, 85–100 fast. A deciding touch always started in
-            // the gesture zone, so no left-half case can reach here.
+            // fraction of the full canvas width): 50–65 one rate step down,
+            // 65–85 play/pause, 85–100 one rate step up. A deciding touch
+            // always started in the gesture zone, so no left-half case can
+            // reach here.
             if (startXFraction < TOUCH_ZONE_SLOW_END) {
-                onSlowPlay();
+                onRateDown();
             } else if (startXFraction < TOUCH_ZONE_CENTER_END) {
                 onPlayPause();
             } else {
-                onFastPlay();
+                onRateUp();
             }
         }
 
```

---

## 5. 적용 및 빌드

```bash
# 저장소 루트에서 (이전 fix 패치가 적용된 상태 그대로)
git apply fix2.patch

npm run build          # 웹 빌드 확인
npx cap sync android
cd android && ./gradlew assembleDebug
```

## 6. 검증 체크리스트 (Android APK, 로그 로드 후 전체화면)

- [ ] 초기 100% 상태에서 오른쪽(85~100%) 탭 → 150%, 한 번 더 → 200%, 한 번 더 → 200% 유지 + "200 % · max" 토스트
- [ ] 100%에서 왼쪽(50~65%) 탭 → 75% → 50% → 25% → 10%, 한 번 더 → 10% 유지 + "10 % · min" 토스트
- [ ] 감속 후 가속 탭을 번갈아 누르면 단계가 왕복한다 (예: 50 ↔ 75)
- [ ] 정지 상태에서 좌/우 탭 → 속도 값만 변경되고 재생은 시작되지 않음
- [ ] 가운데(65~85%) 탭 → play/pause 토글 (기존과 동일)
- [ ] 드래그(팬)·핀치(줌)·왼쪽 절반 예약 동작은 이전 fix와 동일하게 유지
- [ ] 데스크톱/웹의 SpeedPanel ± 버튼과 터치 제스처가 같은 단계(10·25·50·75·100·150·200)를 공유하는지 확인
- [ ] 전체화면 진입 안내 문구가 "speed down / speed up"으로 갱신되었는지 확인

## 7. 참고 사항

- **클램프 vs 순환**: SpeedPanel의 ± 버튼은 끝에서 반대편으로 순환(wrap)하는 기존 동작을
  유지했고, 터치 제스처는 끝에서 클램프를 선택했다. 터치는 연속 탭이 많아 "더 이상 못 줄임/
  올림"이 즉시 보이는 편이 안전하기 때문이다. 순환을 원하면 `stepTouchRate`의 `Math.max/
  Math.min` 두 줄을 `(nextIndex + length) % length` 계산으로 바꾸면 된다.
- `PLAYBACK_RATE_STEPS`는 하나만 고치면 SpeedPanel·터치 제스처 양쪽에 동시에 반영되는 단일
  진실 공급원이다. (예: 300% 단계를 추가하고 싶으면 배열에 `300`만 추가)
- `stores/playback.js`의 `PLAYBACK_MAX_RATE = 300`은 그대로다. 사다리 최대값(200)이 상한
  클램프보다 작으므로 `setPlaybackRate`의 범위 검사는 항상 통과한다.
- 이전 fix(제스처 존 50~100% + 장식 캔버스 터치 투과)와 충돌 없음 — 이 패치는 속도 액션
  계열과 사다리 공유만 손대고 존 게이트·핀치·팬 로직은 전혀 변경하지 않는다.
