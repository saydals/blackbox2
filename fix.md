# fix.md — 그래프 전체화면 하단 여백 문제 해결 (v2 · 자연스러운 간격 조정 버전)

> 대상 저장소: [`saydals/blackbox2`](https://github.com/saydals/blackbox2)
> 기준 커밋: `21e697d` ("Fix rates fallback to +/-500 when header rates are 0")
> 수정 파일: `src/blackbox-viewer/css/main.css` (1개 파일, CSS만 수정 — JS 변경 없음)
> 동반 파일: `fullscreen-bottom-margin.patch` (본 문서 4장의 DIFF와 동일 — 저장소 루트에서 `git apply fullscreen-bottom-margin.patch` 로 바로 적용 가능)
> 문서 버전: **v2** — v1(`margin-top/bottom: 1em` 고정)을 **간격 조정 가능한 자연스러운 버전**으로 개정. 근본 원인 분석과 하단 여백 부여 방향은 v1과 동일하며, 여백 값과 구현 방식이 바뀌었다.

---

## 0. 요약 — 증상 ↔ 원인 ↔ 수정 위치 매핑

| # | 증상 | 근본 원인 | 수정 위치 | 성격 |
|---|------|-----------|-----------|------|
| A | 그래프 영역 왼쪽 위의 밝은 회색 전체화면 토글(`.graph-fullscreen-toggle`)로 전환하면 **상단에는 약 16px 여백**이 보이는데, **하단은 그래프 캔버스/비디오(`#graphCanvas`, `#logVideo`)가 뷰포트 아래 끝에 완전히 붙어버림**(여백 0). 표준 화면 비율 스마트폰에서 특히 뚜렷함 | `.graph-row` 의 기본 규칙 `margin-top: 1em`(main.css 134행)이 전체화면 레이아웃으로 **그대로 새어 들어감(leak)**. `.is-fullscreen` 규칙은 `top`/`bottom` 오프셋만 재정의했을 뿐 margin 은 재정의하지 않았음. `position: fixed` 요소에 `top`/`bottom`을 모두 지정하면 **마진 박스(margin box)**가 두 오프셋 사이에 놓이므로 `margin-top` 만큼 위쪽이 벌어지고, `margin-bottom: 0` 인 아래쪽은 뷰포트에 밀착함 | `main.css` ① `:root` 에 튜닝용 변수 `--fullscreen-graph-gap` 신설 ② `.blackbox-viewer-root.is-fullscreen.* .graph-row` 규칙이 상·하 margin 을 변수로 대칭 선언 | CSS 마진 비대칭 (박스 모델 미반영) |

**요구사항 (사용자 지시):**
1. 전체화면에서 하단에도 상단에서 보이는 정도의 여백을 부여한다.
2. **(v2 요구)** 그 여백이 화면에서 "자연스럽게" 보이도록 간격 값을 다듬고, 이후 기기·취향에 따라 쉽게 조정할 수 있는 구조로 만든다.
3. 일반(비전체화면) 레이아웃은 절대 건드리지 않는다.

### v1 → v2 무엇이 바뀌었나

| 항목 | v1 | v2 (채택) | 바꾼 이유 |
|------|----|-----------|-----------|
| 여백 값 | `1em` (16px) | **`15px`** | 전체화면에서 그래프 행의 좌우 바깥 여백이 이미 15px 이다. 상·하도 15px 로 맞추면 **사방 15px 균일 프레임**이 되어 시각적으로 가장 자연스럽다 (§3.1) |
| 구현 방식 | 규칙 안에 `margin: 1em` 하드코딩 | **`:root` 변수 `--fullscreen-graph-gap` 한 줄 튜닝** | 코드베이스 관례(`:root` fixed-chrome metrics + 폰 미디어쿼리 오버라이드)와 일치. 값 조정 시 규칙 본문을 건드리지 않음 (§3.2) |
| 상단 여백 | 16px | 15px | 1px 축소. 좌우 여백(15px)과의 정합이 우선 — "상단만큼"이라는 요구의 본질은 대칭이지 정확히 16px 가 아니므로 문제없음 |

---

## 1. 재현 조건과 증상

### 1.1 재현 조건

1. `.bbl` 로그(또는 동영상)를 연다 — `has-log`/`has-video` 클래스가 붙은 상태.
2. 그래프 영역 왼쪽 위의 밝은 회색 전체화면 아이콘(`.graph-fullscreen-toggle`)을 누르거나 `F` 키를 누른다. `graphStore.toggleFullscreen()` → viewer root 에 `is-fullscreen` 클래스가 부여된다.
3. 표준 화면 비율 스마트폰(또는 DevTools 모바일 뷰포트, 예: 360×640)에서 관찰한다.

### 1.2 증상 (수정 전)

```text
┌──────────────────────────────┐ ─┐
│ ↕ ⬌ (16px 여백 — margin-top)  │  │ ← 상단: 여백 있음 ("약간의 여백")
├──────────────────────────────┤ ─┘
│                              │
│      그래프 캔버스 / 비디오      │
│                              │
│                              │
└──────────────────────────────┘ ─┐
                                   │ ← 하단: 여백 0px, 뷰포트에 밀착
────────────────────────────────── ─┘ (화면 하단 끝)
```

일반 모드(전체화면 해제)에서는 상단 헤더(`video-top-controls`) 아래 22px(6px + 1em), 하단 타임라인(`log-seek-bar`) 위 8px(0.5em)의 간격이 각각 존재하므로 문제가 없다. 비대칭은 **전체화면 진입 시에만** 나타난다.

### 1.3 수정 후 목표 상태 (v2)

```text
15px                                  15px ─┐
┌─────────────────────────────────────────┐   │
│   ↑ 15px (--fullscreen-graph-gap)       │  ─┘ 상단
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
15px →│        그래프 캔버스 / 비디오          │← 15px  ← 좌우 거터와 동일
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│   ↓ 15px (--fullscreen-graph-gap)       │  ─┐ 하단
└─────────────────────────────────────────┘   │
                                      15px ─┘
```

상·하·좌·우 네 변의 바깥 여백이 모두 15px 로 동일해진다.

---

## 2. 원인 분석

### 2.1 전체화면 레이아웃 구조

전체화면 진입 시 `main.css` 의 `.is-fullscreen` 규칙들이 다음을 수행한다:

```css
/* main.css — 세 개의 고정 UI 스트립을 숨김 */
.blackbox-viewer-root.is-fullscreen.has-log .video-top-controls { display: none; }  /* 상단 헤더 */
.blackbox-viewer-root.is-fullscreen.has-log .log-seek-bar       { display: none; }  /* 하단 타임라인 */
.blackbox-viewer-root.is-fullscreen.has-log .vue-statusbar      { display: none; }  /* 상태바 */

/* main.css — 그래프 행을 safe-area 에만 붙임 (수정 전) */
.blackbox-viewer-root.is-fullscreen.has-log .graph-row,
.blackbox-viewer-root.is-fullscreen.has-video .graph-row {
    top: var(--safe-area-inset-top);
    bottom: var(--safe-area-inset-bottom);
}
```

숨겨진 헤더·타임라인·상태바의 높이를 `.graph-row` 가 흡수하는 구조다. 문제는 이 규칙이 `top`/`bottom` **오프셋**만 다룬다는 점에 있다.

### 2.2 핵심 — fixed 요소와 margin 의 상호작용 (CSS 2.1 §10.3.7)

`position: fixed`(절대 위치의 일종) 비치환 요소에 `top`, `bottom` 이 모두 지정되고 `height: auto` 이면, 브라우저는 다음 제약식을 풀어 높이를 정한다:

```text
top + margin-top + height + margin-bottom + bottom = 뷰포트(컨테이닝 블록) 높이
```

즉 오프셋 사이에 놓이는 것은 **마진 박스**이지, 보이는 박스(border box)가 아니다. 그 결과:

- **보이는 박스의 상단 간격 = `top` 오프셋 + `margin-top`**
- **보이는 박스의 하단 간격 = `bottom` 오프셋 + `margin-bottom`**

한편 `.graph-row` 의 기본 규칙(main.css 134–137행)은:

```css
.graph-row {
    margin-top: 1em;   /* ← 이 값이 전체화면에서도 살아있음 (루트 폰트 16px 기준 16px) */
    display: none;
}
```

`.is-fullscreen` 규칙은 margin 을 하나도 재정의하지 않았으므로 `margin-top: 1em` 이 그대로 적용되고, `margin-bottom` 은 어디에서도 선언된 적이 없어 `0` 이다.

### 2.3 숫자로 확인 (표준 스마트폰 기준)

표준 화면 스마트폰에서는 두 실행 환경 모두 safe-area inset 이 사실상 0 이다:

- **브라우저 / PWA**: `env(safe-area-inset-*)` = 0 (노치·펀치홀 없음).
- **Capacitor Android 앱**: `MainActivity.applyImmersiveStickyMode()` 가 sticky immersive 로 시스템 바를 숨기므로, WebView 에 주입되는 `--safe-area-inset-*` 도 0.

따라서 수정 전 계산은:

```text
상단 간격 = --safe-area-inset-top (0px)   + margin-top (1em = 16px) = 16px  ← "약간의 여백"으로 관측됨
하단 간격 = --safe-area-inset-bottom (0px) + margin-bottom (0px)    =  0px  ← "꽉 채움"으로 관측됨
```

사용자가 본 "상단엔 여백, 하단엔 여백 없음"의 정체는 safe-area 가 아니라 **기본 규칙에서 새어 들어온 `margin-top: 1em`** 이다. 참고로 노치/제스처바가 있는 기기라면 `상단 = inset-top + 16px, 하단 = inset-bottom + 0` 이 되어 inset 크기와 무관하게 **같은 비대칭**이 재현된다.

### 2.4 `margin-top: 1em` 은 원래 어떤 값인가

일반 모드에서는 이 마진이 의도된 값이다. 일반 모드의 `.graph-row` 는 `top: calc(var(--toolbar-height) + 6px + var(--safe-area-inset-top))` 이므로, 헤더 하단에서 그래프까지의 시각적 간격 = 6px + 1em(16px) = 22px — 툴바 아래의 "호흡 간격" 역할을 한다. 전체화면 규칙을 작성할 때 top/bottom 오프셋만 교체하고 이 마진을 재정의하지 않아 상단에만 간격이 남았고, 하단은 대응하는 마진이 없어 밀착됐다. 규칙 위의 기존 주석("Top: flush to the safe-area inset…") 역시 실제 동작과 어긋나 있었다.

---

## 3. 해결 방법 (v2 — 자연스러운 간격 + 조정 가능 구조)

### 3.1 왜 15px 인가 — 사방 균일 프레임

전체화면에서 `.graph-row` 의 **좌우 바깥 여백은 이미 15px** 로 고정되어 있다:

```css
.app-main-pane {
    padding-inline-start: 15px;
    padding-inline-end: 15px;
}

.blackbox-viewer-root.has-video .graph-row,
.blackbox-viewer-root.has-log .graph-row {
    width: calc(100% - 30px);   /* 100% − 좌우 15px×2 → 좌우 거터 15px */
}
```

이 상태에서 상·하 여백을 15px 로 맞추면 그래프 행이 **네 변이 모두 15px 인 균일 프레임** 안에 놓인다. 16px(1em)도 어차피 15px 와 시각적 차이가 1px 에 불과하지만, "좌우와 동일"이라는 명확한 디자인 근거가 있는 쪽이 훨씬 자연스럽다. 화면 가장자리에서 시작하는 캔버스 그리드·눈금이 네 방향으로 동일한 호흡 공간을 갖게 되어, 전체화면이라는 "콘텐츠만 남긴" 레이아웃에서도 의도된 여백처럼 보인다.

### 3.2 왜 `:root` 변수로 뽑았는가 — 코드베이스 관례 + 한 줄 튜닝

`main.css` 는 이미 레이아웃 메트릭을 `:root` 변수로 관리하는 관례가 있다:

```css
:root {
    --toolbar-height: 76px;   /* ≤1020px: 64px 로 미디어쿼리가 오버라이드 */
    --statusbar-height: 1.5rem;
    --seekbar-height: calc(50px + 0.5em);
}
```

이 줄기에 `--fullscreen-graph-gap` 을 추가하면 (1) 기존 변수 문화와 일치하고, (2) 나중에 값을 바잘 때 규칙 본문이 아니라 변수 한 줄만 고치면 되며, (3) 필요하면 폰 미디어쿼리에서 기기별 오버라이드도 기존 패턴 그대로 가능하다. 실제로 폰에서는 여백을 조금 더 줄여 그래프를 더 크게 쓰고 싶어질 수 있는데, 그 경우 다음 한 블록만 추가하면 된다 (기본 diff 에는 포함하지 않음 — 선택 사항):

```css
/* 선택: 좁은 폰 화면에서는 여백을 12px 로 축소해 그래프를 더 확보 */
@media (max-width: 675px) {
    :root {
        --fullscreen-graph-gap: 12px;
    }
}
```

### 3.3 최종 구현

```css
/* :root 블록에 추가 */
:root {
    /* …기존 변수들… */

    /*
     * Graph-only fullscreen breathing gap — the visible clearance between
     * .graph-row and each viewport edge (on top of the safe-area insets).
     * 15px matches the horizontal gutters (.app-main-pane padding-inline /
     * .graph-row width: calc(100% - 30px)), giving the fullscreen graph a
     * uniform 15px frame on all four sides. Tune this single value to taste.
     */
    --fullscreen-graph-gap: 15px;
}

/* 전체화면 규칙 — 상·하 margin 을 변수로 대칭 선언 */
.blackbox-viewer-root.is-fullscreen.has-log .graph-row,
.blackbox-viewer-root.is-fullscreen.has-video .graph-row {
    top: var(--safe-area-inset-top);
    bottom: var(--safe-area-inset-bottom);
    margin-top: var(--fullscreen-graph-gap);
    margin-bottom: var(--fullscreen-graph-gap);
}
```

`margin-top` 을 변수로 **명시적으로 재정의**하는 이유: 기본 규칙의 `margin-top: 1em` 이 새어 들어오는 것을 차단하고 상단 간격도 같은 변수로 통제해야, 나중에 값을 바꿀 때 상·하가 항상 함께 움직여 대칭이 깨지지 않는다.

### 3.4 간격 튜닝 가이드

`--fullscreen-graph-gap` 값을 바꿔가며 취향에 맞게 고르면 된다:

| 값 | 느낌 | 근거 / 추천 상황 |
|----|------|------------------|
| `8px` (0.5em) | 아주 타이트 — 그래프 최대 확보 | 일반 모드의 "타임라인 위 간격"과 같은 값. 소형 폰에서 세로 공간이 절실할 때 |
| `12px` (0.75em) | 절충 | 위 폰 오버라이드 예시 값. 675px 이하 미디어쿼리와 함께 쓰기 좋음 |
| **`15px` (기본)** | **균일 프레임 — 가장 자연스러움** | **좌우 거터와 정확히 일치. 본 문서 권장값** |
| `16px` (1em) | v1 값 | 루트 폰트 배수로 유지하고 싶을 때 (1px 차이일 뿐 시각적으로는 15px 와 거의 동일) |

### 3.5 적용 후 계산

```text
상단 간격 = --safe-area-inset-top    + --fullscreen-graph-gap (15px)
하단 간격 = --safe-area-inset-bottom + --fullscreen-graph-gap (15px)
좌우 간격 = 15px (기존 규칙 그대로)
→ inset 이 0 인 표준 스마트폰에서 네 변 모두 15px. 노치/제스처바 기기에서는
  상하가 각각 inset + 15px 로 늘어나지만 서로 대칭이므로 균형이 유지된다.
```

### 3.6 부작용 검토 (전부 확인 완료 — 추가 변경 불필요)

| 항목 | 영향 | 이유 |
|------|------|------|
| 그래프 캔버스 재측정 | 없음 (자동 처리) | `toggleFullscreen()`(stores/graph.js)이 `nextTick(() => requestAnimationFrame(() => updateCanvasSize()))` 로 레이아웃 반영 후 재측정함 — JS 수정 불필요 |
| `LegendPanel`(`.log-graph-config`) | 자동 수축 | `.graph-row` 의 flex 형제로 함께 높이가 줄어듦 (이전 fix.md 3장과 동일 메커니즘) |
| 일반(비전체화면) 모드 | 무영향 | 변수는 새로 추가된 것(다른 규칙이 참조하지 않음), margin 규칙은 `.is-fullscreen` 스코프 안에 있음. 일반 모드의 22px/8px 간격은 그대로 |
| `#screenshot-frame` / 동영상 내보내기 | 무영향 | `screenshot-frame` 은 JS 에서 참조하지 않는 레거시 id (저장소 전수 검색 확인) |
| 세로 공간 | −15px | 요구된 하단 여백의 비용. v1(−16px)보다 오히려 1px 덜 잠식 |
| 캔버스 절대 좌표(`#graphCanvas` 등) | 무영향 | 캔버스는 `.log-graph` 내부 `position: absolute; width/height: 100%` 라 부모 크기만 따라감 |

---

## 4. DIFF

`git apply fullscreen-bottom-margin.patch` (저장소 루트에서) 또는 수동 적용:

```diff
diff --git a/src/blackbox-viewer/css/main.css b/src/blackbox-viewer/css/main.css
index 5508816..3eae720 100644
--- a/src/blackbox-viewer/css/main.css
+++ b/src/blackbox-viewer/css/main.css
@@ -31,6 +31,15 @@
     --toolbar-height: 76px; /* .video-top-controls height (64px ≤1020px) */
     --statusbar-height: 1.5rem; /* .vue-statusbar height (24px) */
     --seekbar-height: calc(50px + 0.5em); /* timeline canvas + its top margin */
+
+    /*
+     * Graph-only fullscreen breathing gap — the visible clearance between
+     * .graph-row and each viewport edge (on top of the safe-area insets).
+     * 15px matches the horizontal gutters (.app-main-pane padding-inline /
+     * .graph-row width: calc(100% - 30px)), giving the fullscreen graph a
+     * uniform 15px frame on all four sides. Tune this single value to taste.
+     */
+    --fullscreen-graph-gap: 15px;
 }
 
 .blackbox-viewer-root a:hover {
@@ -556,11 +565,17 @@
 
 .blackbox-viewer-root.is-fullscreen.has-log .graph-row,
 .blackbox-viewer-root.is-fullscreen.has-video .graph-row {
-    /* Top: flush to the safe-area inset (no toolbar, no 6px gap).
-       Bottom: flush to the bottom safe-area inset (no status bar,
-       no timeline, no 0.5em gap). */
+    /* Top/bottom edges sit at the safe-area insets; the visible breathing
+       gap on each edge comes from the margins. The base .graph-row rule
+       supplies margin-top: 1em (in normal layout that is the gap below the
+       toolbar) — override BOTH margins with --fullscreen-graph-gap so the
+       vertical gap stays symmetric and matches the 15px horizontal gutters.
+       Previously the bottom sat flush against the viewport
+       (margin-bottom: 0). */
     top: var(--safe-area-inset-top);
     bottom: var(--safe-area-inset-bottom);
+    margin-top: var(--fullscreen-graph-gap);
+    margin-bottom: var(--fullscreen-graph-gap);
 }
 
 .blackbox-viewer-root.has-video .log-graph {
```

변경 통계: `src/blackbox-viewer/css/main.css` 1개 파일, +17 −3 (코드 라인은 `:root` 변수 1줄 + margin 2줄, 나머지는 주석).

---

## 5. 검증 방법

### 5.1 수동 절차 (기기)

1. `.bbl` 파일을 연다.
2. 좌상단 밝은 회색 아이콘으로 전체화면 진입.
3. 기대 결과: **상·하·좌·우 여백이 모두 15px 로 동일**하다. 그래프 캔버스와 범례 패널이 새 높이에 맞춰 즉시 재축소되고 다시 그려진다.
4. 다시 아이콘(또는 `Esc`)으로 종료 → 기존 일반 레이아웃(헤더/타임라인/상태바 복원, 22px/8px 간격)이 그대로 돌아오는지 확인.
5. 재생 중 전체화면 토글 → 캔버스 flicker 나 좌표 어긋남이 없는지 확인 (`updateCanvasSize` 재측정 체계가 그대로 동작).

### 5.2 수동 절차 (DevTools 대체)

Chrome DevTools 기기 에뮬레이션(예: 360×640, DPR 2)으로 동일 절차 수행. 요소 검사로 `.graph-row` 의 computed style 이 `margin: 15px 0` (그리고 좌우 15px 거터)이고, bounding box 하단이 `뷰포트 높이 − 15px` 인지 확인한다.

### 5.3 간격 미세 조정 시

값을 바꾸려면 `main.css` 의 `--fullscreen-graph-gap: 15px;` 한 줄만 고친다. 상·하가 항상 함께 움직이므로 대칭은 절대 깨지지 않는다. 폰에서만 다른 값을 쓰고 싶으면 §3.2의 미디어쿼리 스니펫을 추가한다.

### 5.4 회귀 체크리스트

- [ ] 전체화면에서 사방 여백 균일 (inset 0 기기: 네 변 모두 15px)
- [ ] 노치/제스처바 기기에서도 상하 대칭 (`inset + 15px`)
- [ ] 일반 모드 레이아웃 무변화
- [ ] 분석기 전체화면(`has-analyser-fullscreen`), 지도, 스틱 오버레이 정상
- [ ] 동영상/CSV 내보내기 정상 (`screenshot-frame` JS 참조 없음 확인 완료)
