# FIX.MD — 그래프/범례 색상 미표시 + 재생 중 화면 깜빡임 원인 분석 및 수정 Diff

> 대상 저장소: `blackbox2` (Rotorflight Blackbox Viewer)
> 기준 커밋: `e2cb29d` ("Fix workspace preset menu hidden behind timeline; add APK build guide")
> 작성 시점: 2026-09-20 (KST), 기준 커밋 이후 6시간 이내 커밋 5개(`697e3ef`→`e2cb29d`) 검토 완료
> 동반 파일: `fix.patch` (본 문서의 전체 DIFF와 동일 — 저장소 루트에서 `git apply fix.patch`로 바로 적용 가능)

---

## 0. 요약 — 증상 ↔ 원인 ↔ 수정 위치 매핑

| # | 증상 | 근본 원인 | 수정 위치 | 성격 |
|---|------|-----------|-----------|------|
| A | 그래프 선이 검은색으로 그려짐 (색깔 표시 안 됨) | `grapher.js` plotField 호출부의 색상 폴백이 `GraphConfig.PALETTE[...]` **객체**를 그대로 `strokeStyle`에 대입 — 유효하지 않은 값이라 대입이 무시되고 이전 strokeStyle(검정)이 유지됨 | `grapher.js` | 잠재 버그 |
| B | Legend 항목의 색상 칩이 투명 (색깔 표시 안 됨) | `graph_config.js` `extendFields()`가 `[all]` 와일드카드 필드의 실제 색상(`"#fccde5"`)을 `undefined`로 **덮어써서 파괴** — 확장된 필드(motor[0], motor[1]…)가 전부 `color: undefined`가 됨. 이 변경은 워크스페이스 저장값(localStorage)까지 오염시킴 | `graph_config.js` | 잠재 버그 |
| C | 재생 중 화면 깜빡임 (수 초에 수 회) | `de1a247`에서 추가된 캔버스 `ResizeObserver` + Legend 패널의 **콘텐츠 기반 flex 폭** 조합. 재생 중 250ms마다 갱신되는 실시간 값 텍스트가 패널 폭을 진동시키고(실측 188↔198px), 그래프 캔버스 박스가 함께 진동(1045↔1056px)하면서 RO가 발동 → `canvas.width` 재대입(=캔버스 전체 클리어) → 다음 rAF에서 재描画, 이 사이 빈 프레임이 화면에 노출. 실측 **초당 7~8회** 클리어 반복 | `main.css` + `grapher.js` | 회귀 |

**"6시간 이내 수정 이후"라고 인식된 이유:**

- **A·B는 9/15~16부터 존재하던 잠재 버그**입니다. 그러나 버그를 발동시키는 `motor[all]` 필드는 **Power Preset** 워크스페이스에만 있고, `e2cb29d`(6시간 이내)가 "프리셋 메뉴가 타임라인 뒤에 가려진다"는 버그를 고정하면서 폰에서 Power/Roll/Pitch 프리셋에 **처음 접근 가능**해졌습니다. 즉, 6시간 이내 수정이 버그를 *만든* 것이 아니라 *드러내게* 한 것입니다.
- **C는 6시간 이내 커밋 `de1a247`이 직접 유발한 회귀**입니다. 해당 커밋이 추가한 `ResizeObserver` 자체는 올바른 수정(문제 E — 캔버스 재측정 누락)이지만, "RO는 읽기 전용 측정이라 관찰 루프 위험 없음"이라는 당시 판단이 잘못이었습니다. Legend 패널 폭이 콘텐츠(실시간 값 텍스트)에 따라 변하는 구조에서는 **레이아웃 → RO → 캔버스 클리어 → 재描画**의 피드백 루프가 실제로 발생합니다.

---

## 1. 검증 환경 및 재현 절차

Vite 개발 서버(`npm run dev`) + Chromium(Playwright)에서 `sample.bbl` 자동 로드 상태로 실측했습니다. 모든 수치는 브라우저에서 직접 계측한 값입니다.

**증상 A·B 재현 (수정 전):**

1. 앱 기동 → 워크스페이스 드롭다운에서 **Power Preset** 선택
2. Legend에서 `Motor [1]` 행의 색상 칩이 투명하고, 그래프 "Headspeed and Motor" 섹션의 모터 출력 선이 검은색으로 그려짐
3. 다른 프리셋(Filter Tuning / Governor / Yaw / Pitch / Roll)은 모두 정상 — `[all]` 필드 + 실제 색상 조합은 Power Preset의 `motor[all]`이 유일

**증상 C 재현 (수정 전):**

1. 임의 워크스페이스에서 재생 시작
2. `graphCanvas`의 `width` 세터 호출을 계측 → **재생 4초간 30회**, 캔버스 박스 폭이 1045.6 / 1048.6 / 1050 / 1053 / 1054.5 / 1056px 사이에서 진동
3. 일시정지 → 계측 값 변화 **0회** (재생 중에만 발생 = 값 텍스트 갱신이 트리거임을 확정)

---

## 2. 문제 A·B — 그래프/범례 색상 미표시

### 2.1 원인 (코드 레벨)

**(1) 트리거 데이터** — `ws_rf.json`의 6번째 프리셋(Power Preset)만이 `[all]` 와일드카드 필드에 *실제 색상*을 지정하고 있습니다:

```json
{ "name": "motor[all]", "color": "#fccde5", ... }   // ws_rf.json — Power Preset, "Headspeed and Motor" 그래프
```

의도는 모든 `motor[N]` 확장 필드가 핑크(`#fccde5`)를 공유하는 것입니다. 다른 프리셋의 `[all]` 필드는 없거나 자동 배정 sentinel(`-1`)을 사용합니다.

**(2) 색상 파괴** — `graph_config.js` `extendFields()`:

```js
const setupColor = field?.color === -1;              // "#fccde5" → false
...
field.color = setupColor ? color : undefined;        // ← 범인: "#fccde5"를 undefined로 덮어씀
fields.push(adaptField(flightLog, { ...field, ... })); // 확장 필드 전부 color: undefined
```

- `setupColor`는 "자동 배정이 필요한가"의 의미인데, 실제 색상이 있을 때(`false`) **템플릿의 색을 `undefined`로 지워버리는** 동작이었습니다.
- 이 함수는 **원본 워크스페이스 객체를 직접 변형(mutation)** 합니다. 변형된 객체는 워크스페이스 전환 시 `prefs.set("workspaceGraphConfigs", ...)`로 localStorage에 저장되므로, Power Preset을 한 번이라도 연 사용자의 저장값은 이미 `color: undefined`로 오염된 상태입니다. → 수정 후에도 오염된 저장값을 정상 처리하는 복구 로직이 필요합니다 (아래 참고).

**(3) 표면 증상** — 두 가지 경로로 "색깔 표시 안 됨"이 발생합니다:

- **Legend 칩**: `LegendPanel.vue`의 `:style="{ background: field.color }"` → `undefined` → 투명 배경.
- **그래프 선**: `grapher.js` plotField 호출부:

```js
field.color ? field.color : GraphConfig.PALETTE[j % GraphConfig.PALETTE.length],
//                            ^^^^^^ { color: "#fb8072", name: "Red" } 객체 자체를 전달 (.color 누락)
```

```js
canvasContext.strokeStyle = color;   // 객체 대입은 유효하지 않아 조용히 무시됨
```

`strokeStyle`에 잘못된 값이 대입되면 예외 없이 **무시**되고 이전 값(기본 검정 또는 이전 필드의 색)이 유지됩니다. 그 결과 모터 선이 검은색으로 그려졌습니다.

### 2.2 수정 내용

**`graph_config.js`** — (a) 자동 배정 판정을 넓혀 **오염된 저장값(`null`/`undefined`)도 자동 복구**, (b) 템플릿 mutation 제거, (c) 확장 필드에 색상을 명시 전달:

```js
// BEFORE
const setupColor = field?.color === -1;
...
field.color = setupColor ? color : undefined;
fields.push(adaptField(flightLog, { ...field, curve: { ...field.curve }, name: fieldName, friendlyName: ... }, forceNewCurve));

// AFTER
const setupColor = field?.color == null || field?.color === -1;
...
fields.push(adaptField(flightLog, {
    ...field,
    curve: { ...field.curve },
    name: fieldName,
    color: setupColor ? color : field.color,   // 템플릿은 불변, 확장 필드에만 색상 부여
    friendlyName: ...,
}, forceNewCurve));
```

- 실제 색상(`"#fccde5"`)이 있으면 그대로 유지 → 모든 motor[N]이 프리셋 의도대로 핑크 공유.
- `undefined`/`null`(이전 버전이 파괴해 둔 localStorage) 또는 `-1`이면 팔레트 자동 배정 → 기존 사용자도 재시작만으로 정상화.
- 템플릿을 변형하지 않으므로 재적용(adaptGraphs 반복)에도 멱등.

**`grapher.js`** — 폴백이 반드시 **색상 문자열**을 전달하도록 `.color` 접근 (방어층):

```js
// BEFORE
field.color ? field.color : GraphConfig.PALETTE[j % GraphConfig.PALETTE.length],
// AFTER
field.color ? field.color : GraphConfig.PALETTE[j % GraphConfig.PALETTE.length].color,
```

임의로 편집된 설정 등 어떤 경로에서 `color`가 비어 넘어와도, 이제는 객체가 아닌 유효한 색 문자열이 strokeStyle에 들어갑니다.

---

## 3. 문제 C — 재생 중 화면 깜빡임

### 3.1 원인 (코드 레벨) — 레이아웃 피드백 루프

재생 중 매 250ms마다 `updateValuesRateLimited()`가 legend의 실시간 값 텍스트(예: `72.0 %` → `100.0 %`)를 갱신하는데, 여기서부터 다음 루프가 돌았습니다:

```
① 값 텍스트 폭 변화
② .log-graph-config 가 flex-basis: auto(콘텐츠 기반)라 패널 폭이 따라 진동 (실측 188↔198.4px)
③ flex 형제인 .log-graph 폭도 함께 진동 → #graphCanvas 박스 변화 (실측 1045.6↔1056px)
④ de1a247이 추가한 ResizeObserver 발동 → updateCanvasSize()
⑤ graph.resize()가 canvas.width/height 재대입 → 캔버스 전체 클리어 (핵심: 크기가 같든 다르든 무조건 클리어)
⑥ invalidateGraph() → 다음 rAF에서 재描画
   → ⑤~⑥ 사이 빈 캔버스 프레임이 실제로 페인트됨 → 초당 7~8회 반복 = 눈에 보이는 깜빡임
```

실측 데이터:

| 항목 | 값 |
|------|-----|
| 재생 4초간 `canvas.width` 세터 호출 | **30회 (~7.5회/초)** |
| 캔버스 박스 진동 폭 | 1045.6 ~ 1056px (6종) |
| legend 패널 진동 폭 | 188.0 ~ 198.4px (6종) |
| 일시정지 시 호출 | **0회** (재생 중에만 발생) |
| 저사양 기기(Android WebView)에서의 체감 | 클리어→재描画 간격이 여러 vsync로 늘어나며 뚜렷한 깜빡임 |

`de1a247`의 ResizeObserver는 스마트폰 레이아웃 수정(문제 E)에 필요한 올바른 장치이므로 **제거하지 않습니다.** 대신 루프의 근원(②)과 증폭기(⑤)를 차단합니다.

### 3.2 수정 내용

**`main.css`** — 근본 수정: legend 패널 폭을 콘텐츠와 무관하게 고정.

```css
/* BEFORE */
.log-graph-config {
    ...
    min-width: 135px;
    flex-grow: 0.02;          /* basis: auto → 값 텍스트 폭이 패널 폭을 흔듦 */
    flex-direction: column;
    display: none;
}

/* AFTER */
.log-graph-config {
    ...
    min-width: 135px;
    flex: 0.02 1 200px;       /* 고정 basis 200px — 값 텍스트가 패널 폭을 바꾸지 못함 */
    flex-direction: column;
    display: none;
}
```

- 좁은 화면에서는 종전과 동일하게 `shrink` + `min-width: 135px`로 수축하므로 폰 레이아웃 영향 없음 (폰 실측 캔버스 570px 유지).
- 검증: 이 수정만으로 재생 중 `canvas.width` 호출이 4초 30회 → **1회**(재생 시작 시 정상 1회)로 감소.

**`grapher.js`** — 방어층: 크기가 실제로 바뀔 때만 백킹 스토어에 대입.

```js
// BEFORE
this.resize = function (width, height) {
    canvas.width = width;       // 같은 크기라도 무조건 클리어됨
    canvas.height = height;

// AFTER
this.resize = function (width, height) {
    if (canvas.width !== width) {
        canvas.width = width;
    }
    if (canvas.height !== height) {
        canvas.height = height;
    }
```

ResizeObserver가 어떤 이유로 재발동하더라도(미디어쿼리 경계, 스크롤바 토글 등) 같은 크기의 재클리어가 일어나지 않습니다. 실제 크기 변화가 있을 때는 정상적으로 클리어+재描画됩니다.

---

## 4. 전체 DIFF (`git apply fix.patch`로 적용 가능)

```diff
diff --git a/src/blackbox-viewer/css/main.css b/src/blackbox-viewer/css/main.css
index 866f2e2..3797c98 100644
--- a/src/blackbox-viewer/css/main.css
+++ b/src/blackbox-viewer/css/main.css
@@ -172,7 +172,12 @@
     border-radius: 6px;
     border: 1px solid var(--border-color, #e5e5e5);
     min-width: 135px;
-    flex-grow: 0.02;
+    /* Fixed flex-basis: the panel width must NOT follow its content. With the
+       default `auto` basis, the floated live values ("72.0 %" → "100.0 %")
+       resized the panel every 250 ms during playback, which resized the graph
+       canvas box, which fired the canvas ResizeObserver and cleared/redrew
+       the canvas several times per second — visible flicker while playing. */
+    flex: 0.02 1 200px;
     flex-direction: column;
     display: none;
 }
diff --git a/src/blackbox-viewer/graph_config.js b/src/blackbox-viewer/graph_config.js
index 2952011..29a7344 100644
--- a/src/blackbox-viewer/graph_config.js
+++ b/src/blackbox-viewer/graph_config.js
@@ -52,7 +52,10 @@ export function GraphConfig(graphConfig) {
         const matches = field.name.match(/^(.+)\[all\]$/);
         const logFieldNames = flightLog.getMainFieldNames();
         const fields = [];
-        const setupColor = field?.color === -1;
+        // Auto-assign palette colors only when the template has no real color
+        // (-1 = sentinel, null/undefined = legacy wiped configs). A concrete
+        // color ("#fccde5") must be kept and shared by every expanded field.
+        const setupColor = field?.color == null || field?.color === -1;
         const sysConfig = flightLog.getSysConfig();
         const apiVersion = sysConfig.apiVersion;
         if (matches) {
@@ -64,7 +67,6 @@ export function GraphConfig(graphConfig) {
                     // forceNewCurve must be true for min max computing extended curves.
                     const forceNewCurve = true;
                     const color = GraphConfig.PALETTE[colorIndex++ % GraphConfig.PALETTE.length].color;
-                    field.color = setupColor ? color : undefined;
                     fields.push(
                         adaptField(
                             flightLog,
@@ -72,6 +74,12 @@ export function GraphConfig(graphConfig) {
                                 ...field,
                                 curve: { ...field.curve },
                                 name: fieldName,
+                                // Pass the color per expanded field instead of
+                                // mutating the template: assigning `undefined`
+                                // here used to wipe the preset color from the
+                                // (persisted) workspace config and blanked the
+                                // legend chips / graph lines.
+                                color: setupColor ? color : field.color,
                                 friendlyName: FlightLogFieldPresenter.fieldNameToFriendly(
                                     fieldName,
                                     sysConfig.debug_mode,
                                     apiVersion,
                                     sysConfig.firmwareType,
                                     sysConfig.firmwareVersion,
                                 ),
                             },
                             forceNewCurve,
                         ),
                     );
                 }
             }
         } else {
diff --git a/src/blackbox-viewer/grapher.js b/src/blackbox-viewer/grapher.js
index 924fc97..bef36a5 100644
--- a/src/blackbox-viewer/grapher.js
+++ b/src/blackbox-viewer/grapher.js
@@ -809,8 +809,16 @@ export function FlightLogGrapher(flightLog, graphConfig, canvas, stickCanvas, cr
     }
 
     this.resize = function (width, height) {
-        canvas.width = width;
-        canvas.height = height;
+        // Only touch the backing store when the size really changed: setting
+        // canvas.width/height resets (clears) the whole canvas. The graph
+        // canvas is observed by a ResizeObserver, and redundant no-op resizes
+        // here translated into visible flicker while playing.
+        if (canvas.width !== width) {
+            canvas.width = width;
+        }
+        if (canvas.height !== height) {
+            canvas.height = height;
+        }
 
         const sticksHeight = (canvas.height * Number.parseInt(options.sticks.size, 10)) / 2 / 100;
         // The total width available to draw both sticks in:
@@ -925,7 +933,11 @@ export function FlightLogGrapher(flightLog, graphConfig, canvas, stickCanvas, cr
                         field.index,
                         field.curve,
                         (canvas.height * graph.height) / 2,
-                        field.color ? field.color : GraphConfig.PALETTE[j % GraphConfig.PALETTE.length],
+                        // Fallback must be a color STRING: PALETTE entries are
+                        // {color, name} objects, and assigning an object to
+                        // canvasContext.strokeStyle is silently ignored, which
+                        // left the line drawn in the previous (black) stroke.
+                        field.color ? field.color : GraphConfig.PALETTE[j % GraphConfig.PALETTE.length].color,
                         field.lineWidth ? field.lineWidth : null,
                         graphConfig.highlightGraphIndex === i && graphConfig.highlightFieldIndex === j,
                     );
```

---

## 5. 수정 후 검증 결과

| 검증 항목 | 수정 전 | 수정 후 |
|-----------|---------|---------|
| Power Preset `Motor [1]` legend 칩 배경 | `(none)` 투명 | `rgb(252, 205, 229)` = 프리셋 색 `#fccde5` |
| 그래프 모터 출력 선 색상 | 검정 (strokeStyle 무시) | 핑크 — 캔버스 픽셀 검사상 `#fccde5` 매칭 1,012픽셀 |
| 재생 6초간 `canvas.width` 클리어 횟수 | ~45회 (7~8회/초) | **0회** |
| 일시정지 상태 캔버스 클리어 | 0회 | 0회 (동일) |
| 폰 가로 뷰포트(800×360) 레이아웃 | — | 캔버스 570px로 기존과 동일, legend 수축 정상 |
| `vitest run` | 33 통과 / 4 실패 | 33 통과 / 4 실패 (동일 — 실패 4개는 `tests/rf_sample_e2e.test.js`의 **수정 전부터 존재한** 실패로 본 수정과 무관. `git stash` 후 원본 기준 재실행으로 확인) |
| `eslint` (수정 파일 2종) | — | 경고 0 |

추가 확인 사항:

- **기존 사용자 복구**: Power Preset을 열어본 적 있는 사용자의 localStorage에는 이미 `motor[all]`의 색이 `undefined`로 저장되어 있습니다. 수정된 `setupColor == null` 판정이 이 경우 팔레트 자동 배정으로 복구하므로, 별도 초기화 없이 새 버전 실행만으로 그래프/범례 색상이 정상화됩니다. (저장값을 지우지 않아도 됩니다.)
- **APK 재빌드**: Android 앱에서 확인하려면 `build.md`의 절차로 웹 에셋 재빌드 + APK 재생성이 필요합니다 (`npm run android:sync` → 빌드).

## 6. 남은 권고 사항 (선택)

- `values_display.js`의 값 갱신 주기(250ms)와 무관하게, legend 값 텍스트는 `font-variant-numeric: tabular-nums`를 적용하면 숫자 폭 변동 자체가 사라져 텍스트 흔들림도 줄어듭니다. (본 수정으로 레이아웃 영향은 이미 차단되었으므로 필수는 아님.)
- `GraphConfigDialog.vue`에서 `[all]` 템플릿 필드의 색상을 편집하는 경우, 이제 템플릿 색상이 보존되어 모든 확장 필드에 일관 적용됩니다. 기대 동작과 다르면 별도 이슈로 분리 검토 권장.
