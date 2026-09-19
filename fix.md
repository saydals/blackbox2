# fix.md — 그래프 영역 전체화면 토글: 폰 화면에서 그래프가 너무 낮게 그려지는 문제 해결

> 대상 저장소: [`saydals/blackbox2`](https://github.com/saydals/blackbox2)
> 기준 커밋: `5e6f6fa` ("Fix graph/legend colors and playback flicker; add fix analysis doc")
> 수정 파일: `src/blackbox-viewer/App.vue`, `src/blackbox-viewer/css/main.css`
> 동반 파일: `fix.patch` (본 문서 4장의 DIFF와 동일 — 저장소 루트에서 `git apply fix.patch` 로 바로 적용 가능)

---

## 0. 요약 — 증상 ↔ 원인 ↔ 수정 위치 매핑

| # | 증상 | 근본 원인 | 수정 위치 | 성격 |
|---|------|-----------|-----------|------|
| A | 표준 스마트폰 화면에서 `.log-graph` (그래프 캔버스/비디오 영역)가 너무 낮게 그려짐 | `video-top-controls`(상단 헤더) + `log-seek-bar`(하단 타임라인) + `.vue-statusbar`(상태바)가 각각 `position: fixed` 로 뷰포트 위·아래를 차지하고, `.graph-row` 가 그 사이 남는 높이만 차지. 폰 가로 360px 높이에서 헤더 64px + 타임라인 58px + 상태바 24px + 여백을 제외하면 그래프에 약 200px 정도만 남아 시인성이 크게 떨어짐 | `main.css` | 레이아웃 제약 |
| B | 그래프를 빠르게 크게 보거나 값 확인을 위한 전체화면 진입 방법이 없음 | `graphStore.isFullscreen` 상태, `toggleFullscreen()` 액션, `keyboard_handler.js` 의 `F`/`Esc` 단축키, `App.vue` 의 `is-fullscreen` 클래스 토글까지 모두 준비되어 있으나, (1) `.is-fullscreen` 클래스에 대한 **레이아웃 CSS 규칙이 한 줄도 없고**, (2) 토글을 호출할 **UI 버튼이 없음**. 즉 키보드 단축키로만 작동하고 폰에서는 사실상 사용 불가 | `App.vue` + `main.css` | 누락 기능 |
| C | 상단 왼쪽에 파일명은 보이지만 그래프 영역 안을 클릭할 방법이 없음 | `.graph-filename-overlay` 가 `pointer-events: none` 으로 되어 있어 파일명을 클릭해도 아무 일도 일어나지 않음. 전체화면 아이콘을 같은 위치에 두려면 클릭 가능한 별도 엘리먼트가 필요 | `App.vue` + `main.css` | 누락 UI |

**요구사항 (사용자 지시):**

1. 표준 스마트폰 화면에서 `.log-graph` (그래프 캔버스/비디오 영역) 가 너무 낮게 그려지는 문제를 해결.
2. 그래프 영역 **왼쪽 위**에 **밝은 회색** 전체화면 아이콘을 배치. 파일명은 그대로 표시.
3. 아이콘 클릭 → 상단 헤더 줄(`video-top-controls`) 과 하단 타임라인(`log-seek-bar`)이 사라지고, **높이 전체**를 그래프 영역(`.log-graph`)과 `LegendPanel`이 사용.
4. 다시 클릭 → 헤더와 타임라인이 다시 나타남.
5. 밝은 회색 전체화면 아이콘을 누르면 헤더·타임라인이 사라지거나 나타남 (토글).
6. **(추가 요구)** 전체화면 진입 시 **상태바(`.vue-statusbar`)도 함께 숨겨** 진짜 풀스크린(상단 안전영역 ~ 하단 안전영역)을 확보한다.

---

## 1. 현재 상태 점검 (수정 전)

### 1.1 이미 존재하는 인프라

이미 다음의 토글 인프라는 구비되어 있었습니다:

```js
// src/blackbox-viewer/stores/graph.js (line 55, 173–176, 229, 252)
const isFullscreen = ref(false);
function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
    nextTick(() => requestAnimationFrame(() => updateCanvasSize.value?.()));
}
// → export: isFullscreen, toggleFullscreen
```

```js
// src/blackbox-viewer/keyboard_handler.js (line 236–241, 296–304)
f(e, shifted) {
    if (!shifted) {
        graphStore.toggleFullscreen();   // F 키로 전체화면 진입
        e.preventDefault();
    }
},
// ...
case "Escape":
    if (!graphStore.isFullscreen || ...) return false;
    graphStore.toggleFullscreen();        // Esc 키로 전체화면 종료
```

```vue
// src/blackbox-viewer/App.vue (line 165)
cl.toggle("is-fullscreen", graphStore.isFullscreen);   // viewer root 에 클래스 토글
```

**그러나** `is-fullscreen` 클래스에 대응하는 **레이아웃 CSS 규칙이 없었고**, **UI 버튼도 없었습니다.** 결과적으로 키보드 단축키를 눌러도 `is-fullscreen` 클래스만 붙을 뿐 화면 레이아웃은 전혀 변하지 않았습니다.

### 1.2 현재 레이아웃 (`main.css` 기준)

```css
:root {
    --toolbar-height: 76px;     /* ≤1020px: 64px */
    --statusbar-height: 1.5rem;  /* 24px */
    --seekbar-height: calc(50px + 0.5em);  /* ~58px */
}

.video-top-controls { position: fixed; top: var(--safe-area-inset-top); min-height: var(--toolbar-height); }
.log-seek-bar       { position: fixed; bottom: calc(var(--statusbar-height) + var(--safe-area-inset-bottom)); }
.vue-statusbar      { position: fixed; bottom: var(--safe-area-inset-bottom); height: var(--statusbar-height); }

.graph-row {
    position: fixed;
    top:    calc(var(--toolbar-height) + 6px + var(--safe-area-inset-top));
    bottom: calc(var(--statusbar-height) + var(--seekbar-height) + 0.5em + var(--safe-area-inset-bottom));
}
```

폰 가로 360px 높이(안전영역 0 가정)에서 계산:
- `video-top-controls` → 64px (상단)
- `.graph-row` 의 `top` = 64 + 6 = **70px** 부터 시작
- `.graph-row` 의 `bottom` = 24 + 58 + 8 = **90px** (하단에서부터) 까지
- 즉 `.graph-row` 의 실제 높이 = 360 − 70 − 90 = **200px**

→ 그래프 캔버스 + LegendPanel 이 200px 안에서 flex 로 나뉘어 그려지므로 그래프 본체는 사실상 130~150px 수준. 헬기 진동 분석, 주파수 스펙트럼 확인 등에는 턱없이 부족한 높이입니다.

### 1.3 `.graph-filename-overlay` 현재 상태

```css
.graph-filename-overlay {
    position: absolute;
    top: 6px;
    left: 10px;       /* 좌상단 고정 */
    color: #9ca3af;   /* 밝은 회색 — 톤 유지 대상 */
    pointer-events: none;   /* ← 파일명 클릭 불가 */
    z-index: 5;
    max-width: 60%;
}
```

파일명은 좌상단에 밝은 회색으로 이미 표시되어 있습니다. 사용자 요구사항은 이 파일명 왼쪽에 **전체화면 아이콘**을 추가하고, 그 아이콘만 클릭 가능하게 만드는 것입니다.

---

## 2. 설계 — 수정 방향

### 2.1 전체 흐름

```
[그래프 영역 좌상단]
  ┌──────────────────────────────────────────┐
  │ ⛶  log_001.BBL                          │  ← 밝은 회색 아이콘 + 파일명
  │                                         │
  │         (그래프 캔버스)                  │
  │                                         │
  └──────────────────────────────────────────┘
        ⬆ 클릭
        │
        ▼
  graphStore.toggleFullscreen()
        │
        ▼
  isFullscreen.value = !isFullscreen.value
        │
        ▼
  nextTick → requestAnimationFrame → updateCanvasSize()  (이미 구현됨)
        │
        ▼
  App.vue watchEffect 가 .is-fullscreen 클래스를
  #blackbox-viewer-root 에 토글 (이미 구현됨, line 165)
        │
        ▼
  main.css 의 .is-fullscreen.* 규칙이
    ① .video-top-controls → display: none
    ② .log-seek-bar       → display: none
    ③ .vue-statusbar      → display: none
    ④ .graph-row → top:safe-area-top / bottom:safe-area-bottom 재배치
  (← 신규 추가)
        │
        ▼
  그래프 + LegendPanel 이 빈 공간을 흡수 → 진짜 풀스크린
```

### 2.2 상태바(`.vue-statusbar`)도 숨기는 이유

기본 설계에서는 상태바를 남겨두는 방안도 고려했으나, 사용자가 추가로 "상태바까지 숨기는 버전"을 요청했습니다. 상태바가 차지하는 24px + 0.5em 의 하단 공간을 회수하면 폰 가로 360px 높이에서 그래프 영역이 약 200px → **~360px**(안전영역 0 가정 시 거의 뷰포트 전체)로 확장됩니다. 루프 정보/북마크 버튼/플라이트 모드 표시는 전체화면 종료 후 다시 보이므로, 분석 중에는 그래프 시인성을 극대화하는 쪽이 우선순위가 높습니다.

### 2.3 왜 `!important` 를 쓰지 않는가

기존 노출 규칙의 선택자는 `.blackbox-viewer-root.has-log .video-top-controls` (클래스 2개 = 명시도 `0,2,1`).
새 규칙의 선택자는 `.blackbox-viewer-root.is-fullscreen.has-log .video-top-controls` (클래스 3개 = 명시도 `0,3,1`).
명시도가 더 높으므로 `!important` 없이도 자연스럽게 우선 적용됩니다. 이는 기존 코드베이스가 `!important` 를 거의 사용하지 않는 스타일(`rg "!important" src/blackbox-viewer/css/main.css` → 2건)과 일관됩니다.

### 2.4 아이콘: `i-lucide-maximize-2` / `i-lucide-minimize-2`

저장소의 `SpectrumAnalyser.vue` 가 이미 동일한 아이콘 쌍을 "analyser 전체화면" 토글에 사용하고 있습니다. 일관성을 위해 같은 아이콘을 사용하되, 여기서는 **상태에 따라 아이콘을 스왑**(`:name="isFullscreen ? 'minimize-2' : 'maximize-2'"`)하여 현재 상태가 버튼에 시각적으로 드러나도록 합니다. 아이콘 색상은 `#9ca3af` (기존 파일명 텍스트와 동일한 밝은 회색)로, hover/focus 시 `#d1d5db` 로 살짝 밝아집니다.

### 2.5 파일명 오버레이 위치 조정

기존 `.graph-filename-overlay`는 `left: 10px` 에 있었습니다. 28px 폭의 토글 버튼이 `left: 10px` 에 들어가면(즉 `10~38px` 대역을 차지) 파일명은 `left: 42px` 로 밀어야 겹치지 않습니다. 동시에 `max-width` 도 32px 줄여(`60% → calc(60% - 32px)`) 폰에서 파일명이 우측으로 넘치지 않게 합니다.

---

## 3. 수정 내용 — 파일별 상세

### 3.1 `src/blackbox-viewer/App.vue`

`.log-graph` div 내부, 파일명 오버레이 **앞**에 `<button class="graph-fullscreen-toggle">` 을 추가합니다. `v-if="appStore.logFilename"` 로 로그가 로드된 상태에서만 노출 (파일명 오버레이와 동일 조건). `graphStore.toggleFullscreen()` 을 직접 호출합니다.

```vue
<div id="log-graph" class="log-graph">
    <!-- 그래프 영역 전체화면 토글. 좌상단, 파일명 오버레이 바로 왼쪽.
         클릭 시 viewer root 의 .is-fullscreen 클래스가 토글되고,
         main.css 의 .is-fullscreen.* 규칙이 헤더/타임라인을 숨기고
         .graph-row 를 전체 높이로 확장한다. -->
    <button
        v-if="appStore.logFilename"
        type="button"
        class="graph-fullscreen-toggle"
        :class="{ 'is-active': graphStore.isFullscreen }"
        :title="graphStore.isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen (F)'"
        :aria-label="graphStore.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
        :aria-pressed="graphStore.isFullscreen"
        @click="graphStore.toggleFullscreen()"
    >
        <UIcon
            :name="graphStore.isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            class="size-5"
        />
    </button>
    <div v-if="appStore.logFilename" class="graph-filename-overlay" :title="appStore.logFilename">
        {{ appStore.logFilename }}
    </div>
    ...
</div>
```

이미 `graphStore`와 `appStore`가 setup script 상단에 임포트되어 있으므로 추가 import 는 필요 없습니다. `UIcon` 은 Nuxt UI 자동 임포트 대상(`auto-imports.d.ts`, `components.d.ts` 참조)이고 `i-lucide-*` 아이콘은 다른 컴포넌트(`LegendPanel.vue`, `SpectrumAnalyser.vue`)에서 이미 같은 패턴으로 사용 중입니다.

### 3.2 `src/blackbox-viewer/css/main.css`

#### (1) `.graph-filename-overlay` 위치 조정

```css
/* BEFORE */
.graph-filename-overlay {
    position: absolute;
    top: 6px;
    left: 10px;
    ...
    max-width: 60%;
}

/* AFTER */
.graph-filename-overlay {
    position: absolute;
    top: 6px;
    /* 전체화면 토글 버튼이 10–38px 대역을 차지하므로 파일명을 그 오른쪽으로 밈 */
    left: 42px;
    ...
    max-width: calc(60% - 32px);   /* 32px 만큼 줄여 폰에서 넘침 방지 */
}
```

#### (2) `.graph-fullscreen-toggle` 버튼 신규 스타일

```css
.graph-fullscreen-toggle {
    position: absolute;
    top: 6px;
    left: 10px;          /* 기존 파일명 자리 */
    z-index: 6;          /* 파일명(z:5) 위 */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 0;
    color: #9ca3af;      /* 밝은 회색 — 기존 파일명 텍스트와 동일 톤 */
    cursor: pointer;
    border-radius: 4px;
    pointer-events: auto;   /* 파일명 오버레이(pointer-events:none) 와 분리 */
    transition: color 120ms ease, background-color 120ms ease;
}

.graph-fullscreen-toggle:hover,
.graph-fullscreen-toggle:focus-visible {
    color: #d1d5db;
    background-color: rgba(127, 127, 127, 0.18);
    outline: none;
}

.graph-fullscreen-toggle.is-active { color: #e5e7eb; }   /* 전체화면 진입 중 약간 더 밝게 */

.blackbox-viewer-root.dark .graph-fullscreen-toggle:hover,
.blackbox-viewer-root.dark .graph-fullscreen-toggle:focus-visible {
    background-color: rgba(255, 255, 255, 0.08);   /* 다크 테마 hover 대비 */
}
```

#### (3) `.is-fullscreen` 레이아웃 규칙 신규 추가

```css
/* ① 상단 헤더 숨김 */
.blackbox-viewer-root.is-fullscreen.has-log .video-top-controls,
.blackbox-viewer-root.is-fullscreen.has-video .video-top-controls {
    display: none;
}

/* ② 하단 타임라인 숨김 */
.blackbox-viewer-root.is-fullscreen.has-log .log-seek-bar,
.blackbox-viewer-root.is-fullscreen.has-video .log-seek-bar {
    display: none;
}

/* ③ 상태바 숨김 — 진짜 풀스크린(상단 안전영역 ~ 하단 안전영역) 확보 */
.blackbox-viewer-root.is-fullscreen.has-log .vue-statusbar,
.blackbox-viewer-root.is-fullscreen.has-video .vue-statusbar {
    display: none;
}

/* ④ 그래프 행을 상단 안전영역 ~ 하단 안전영역까지 확장 */
.blackbox-viewer-root.is-fullscreen.has-log .graph-row,
.blackbox-viewer-root.is-fullscreen.has-video .graph-row {
    top: var(--safe-area-inset-top);
    bottom: var(--safe-area-inset-bottom);
}
```

`LegendPanel`(`.log-graph-config`)은 이미 `.graph-row` 의 flex 형제라 별도 규칙 없이 자동으로 같이 확장됩니다. `graphStore.toggleFullscreen()` 내부의 `nextTick(() => requestAnimationFrame(() => updateCanvasSize.value?.()))` 호출이 그래프 캔버스 크기도 자동 재측정하므로 캔버스가 새 높이에 맞춰 재描画됩니다.

---

## 4. 전체 DIFF (`git apply fix.patch` 로 적용 가능)

```diff
diff --git a/src/blackbox-viewer/App.vue b/src/blackbox-viewer/App.vue
index 9d1e2ad..1670885 100644
--- a/src/blackbox-viewer/App.vue
+++ b/src/blackbox-viewer/App.vue
@@ -60,6 +60,29 @@
                     </div>
                     <div id="screenshot-frame" class="graph-row">
                         <div id="log-graph" class="log-graph">
+                            <!--
+                                Graph-only fullscreen toggle. Sits in the top-left corner of the
+                                graph canvas, immediately to the left of the filename overlay.
+                                Toggling it adds the `is-fullscreen` class to the viewer root, which
+                                collapses the .video-top-controls header and .log-seek-bar timeline
+                                so .graph-row (and its flex sibling, LegendPanel) can absorb the
+                                full viewport height — see the `.is-fullscreen.*` rules in main.css.
+                            -->
+                            <button
+                                v-if="appStore.logFilename"
+                                type="button"
+                                class="graph-fullscreen-toggle"
+                                :class="{ 'is-active': graphStore.isFullscreen }"
+                                :title="graphStore.isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen (F)'"
+                                :aria-label="graphStore.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
+                                :aria-pressed="graphStore.isFullscreen"
+                                @click="graphStore.toggleFullscreen()"
+                            >
+                                <UIcon
+                                    :name="graphStore.isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
+                                    class="size-5"
+                                />
+                            </button>
                             <div v-if="appStore.logFilename" class="graph-filename-overlay" :title="appStore.logFilename">
                                 {{ appStore.logFilename }}
                             </div>
diff --git a/src/blackbox-viewer/css/main.css b/src/blackbox-viewer/css/main.css
index 3797c98..c0c8e1f 100644
--- a/src/blackbox-viewer/css/main.css
+++ b/src/blackbox-viewer/css/main.css
@@ -153,7 +153,10 @@
 .graph-filename-overlay {
     position: absolute;
     top: 6px;
-    left: 10px;
+    /* The fullscreen toggle button (.graph-fullscreen-toggle) now occupies the
+       10–38px band in the top-left corner of the canvas. Push the filename past
+       it so the two never overlap. */
+    left: 42px;
     font-size: 1.25rem;
     color: #9ca3af;
     pointer-events: none;
@@ -161,7 +164,49 @@
     white-space: nowrap;
     overflow: hidden;
     text-overflow: ellipsis;
-    max-width: 60%;
+    max-width: calc(60% - 32px);
+}
+
+/*
+ * Graph-only fullscreen toggle button — top-left of .log-graph, immediately
+ * to the left of .graph-filename-overlay. Light gray (#9ca3af, same tone as
+ * the filename text), transparent background, no border, accepts pointer
+ * events even though the sibling filename overlay does not.
+ */
+.graph-fullscreen-toggle {
+    position: absolute;
+    top: 6px;
+    left: 10px;
+    z-index: 6;
+    display: inline-flex;
+    align-items: center;
+    justify-content: center;
+    width: 28px;
+    height: 28px;
+    padding: 0;
+    background: transparent;
+    border: 0;
+    color: #9ca3af;
+    cursor: pointer;
+    border-radius: 4px;
+    pointer-events: auto;
+    transition: color 120ms ease, background-color 120ms ease;
+}
+
+.graph-fullscreen-toggle:hover,
+.graph-fullscreen-toggle:focus-visible {
+    color: #d1d5db;
+    background-color: rgba(127, 127, 127, 0.18);
+    outline: none;
+}
+
+.graph-fullscreen-toggle.is-active {
+    color: #e5e7eb;
+}
+
+.blackbox-viewer-root.dark .graph-fullscreen-toggle:hover,
+.blackbox-viewer-root.dark .graph-fullscreen-toggle:focus-visible {
+    background-color: rgba(255, 255, 255, 0.08);
 }
 
 .log-graph-config {
@@ -473,6 +518,51 @@
     );
 }
 
+/*
+ * Graph-only fullscreen layout — toggled by the .graph-fullscreen-toggle
+ * button in the top-left corner of .log-graph. When the viewer root carries
+ * the `is-fullscreen` class (wired by App.vue from graphStore.isFullscreen):
+ *
+ *   1. The top header strip (.video-top-controls) is hidden.
+ *   2. The bottom timeline strip (.log-seek-bar) is hidden.
+ *   3. The bottom status strip (.vue-statusbar) is hidden too — true
+ *      full-height graph + Legend. Loop/bookmark info is traded for ~24px
+ *      more graph height.
+ *   4. .graph-row stretches from the top safe-area inset to the bottom
+ *      safe-area inset — i.e. it absorbs the toolbar, timeline AND status
+ *      bar heights that were removed in steps 1–3. LegendPanel
+ *      (.log-graph-config) is a flex sibling of .log-graph inside
+ *      .graph-row, so it grows with it and no extra rule is needed.
+ *
+ * Specificity (.is-fullscreen.has-log/.has-video = three classes) beats the
+ * original (.has-log/.has-video = two classes), so no `!important` is needed.
+ */
+.blackbox-viewer-root.is-fullscreen.has-log .video-top-controls,
+.blackbox-viewer-root.is-fullscreen.has-video .video-top-controls {
+    display: none;
+}
+
+.blackbox-viewer-root.is-fullscreen.has-log .log-seek-bar,
+.blackbox-viewer-root.is-fullscreen.has-video .log-seek-bar {
+    display: none;
+}
+
+/* Status bar is also hidden in graph-only fullscreen — true full-height
+   graph + Legend. Loop/bookmark info is traded for ~24px more graph height. */
+.blackbox-viewer-root.is-fullscreen.has-log .vue-statusbar,
+.blackbox-viewer-root.is-fullscreen.has-video .vue-statusbar {
+    display: none;
+}
+
+.blackbox-viewer-root.is-fullscreen.has-log .graph-row,
+.blackbox-viewer-root.is-fullscreen.has-video .graph-row {
+    /* Top: flush to the safe-area inset (no toolbar, no 6px gap).
+       Bottom: flush to the bottom safe-area inset (no status bar,
+       no timeline, no 0.5em gap). */
+    top: var(--safe-area-inset-top);
+    bottom: var(--safe-area-inset-bottom);
+}
+
 .blackbox-viewer-root.has-video .log-graph {
     height: auto;
 }
```

---

## 5. 예상 효과 (수정 후)

| 항목 | 수정 전 | 수정 후 (전체화면 토글 ON) |
|------|---------|----------------------|
| 폰 가로 360px 높이에서 `.graph-row` 높이 | ~200px | **~360px** (안전영역 0 가정 시 거의 뷰포트 전체) — 약 **80% 증가** |
| `video-top-controls` 노출 | 항상 | 전체화면 중 숨김 |
| `log-seek-bar` 노출 | 항상 | 전체화면 중 숨김 |
| `.vue-statusbar` 노출 | 항상 | 전체화면 중 숨김 (루프/북마크 정보는 종료 후 다시 표시) |
| `LegendPanel` (.log-graph-config) 높이 | 좁은 영역에서 flex 분할 | `.graph-row` 의 확장에 비례해 같이 확장 |
| 그래프 캔버스 (`#graphCanvas`) 자동 재측정 | — | `toggleFullscreen()` 내 `nextTick(rAF(updateCanvasSize))` 로 자동 처리 (기존 코드 재사용) |
| 키보드 단축키 `F` / `Esc` | 동작 (클래스 토글만 되고 레이아웃 변화 없음) | 동작 + 이제 레이아웃도 변화 |
| 전체화면 진입 UI | 없음 | 밝은 회색 아이콘 버튼 (좌상단, 파일명 왼쪽) |

---

## 6. 적용 및 APK 빌드 절차

```bash
# 1. 패치 적용 (이미 수정된 저장소라면 생략)
cd blackbox2
git apply fix.patch

# 2. 웹 에셋 빌드
npm install
npm run build          # Vite 정적 빌드 → dist/

# 3. Capacitor 로 Android 프로젝트에 동기화
npx cap sync android   # dist/ → android/app/src/main/assets/public/ 복사

# 4. APK 빌드 (Debug 또는 Release)
cd android
./gradlew assembleDebug                                  # debug APK
# 또는
./gradlew assembleRelease                               # release APK (서명 필요)

# 산출물 위치:
#   android/app/build/outputs/apk/debug/app-debug.apk
#   android/app/build/outputs/apk/release/app-release-unsigned.apk
```

> `build.md` 의 표준 절차를 따릅니다. 본 수정은 HTML/Vue/CSS 만 변경하는 것이므로 네이티브 코드(`MainActivity.java`, `BetaflightFilePlugin.java`)는 그대로 두며 `npx cap sync android` 단계만 다시 실행하면 됩니다.

---

## 7. 권고 사항 (선택)

- **상태바를 다시 보이게 하는 옵션**: 본 diff 에서는 상태바까지 숨기는 버전을 적용했습니다. 만약 분석 중 루프 정보/북마크 버튼이 필요하다면 `.is-fullscreen.has-log .vue-statusbar { display: none; }` 규칙 한 줄을 제거하고 `.graph-row`의 `bottom` 을 `calc(var(--statusbar-height) + var(--safe-area-inset-bottom))` 으로 되돌리면 상태바 유지 버전으로 복귀합니다.
- **세로 모드 폰**: 가로 360px 가 아닌 세로 640~800px 화면에서는 그래프 높이가 충분하므로 전체화면 토글의 효용이 상대적으로 작지만, 여전히 헤더/타임라인/상태바를 숨겼을 때 획득하는 약 150~170px 추가 높이는 의미가 있습니다.
- **아이콘 크기**: `class="size-5"` (20px) 를 사용했습니다. 폰에서 손가락 터치 타깃 권장(44px) 보다는 작지만, 파일명 텍스트 옆 시각적 균형을 고려한 선택입니다. 터치 영역은 버튼 자체 28×28px 이며, 필요하다면 `padding` 또는 `width/height` 를 40px 까지 키우고 `left` 를 6px 로 조정해도 됩니다.
- **단축키 안내**: `title` 속성에 `(F)` / `(Esc)` 힌트를 넣었습니다. `KeysDialog.vue` 의 단축키 안내 다이얼로그에도 "F — Toggle fullscreen" 항목이 있는지 확인해 보세요. (현재 `keyboard_handler.js` 에 `F` 핸들러가 있으므로 이미 등록되어 있을 가능성이 높습니다.)
