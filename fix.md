# fix.md — Legend 폭 부족으로 단위숫자가 위아래로 튀는 문제 해결

> 대상 저장소: [`saydals/blackbox2`](https://github.com/saydals/blackbox2)
> 기준 커밋: `66407fe` ("Apply fullscreen bottom margin fix and rate-based fallback with 1.2 margin")
> 수정 파일: `src/blackbox-viewer/css/main.css` (1개 파일, CSS만 수정 — JS/템플릿 변경 없음)
> 동반 파일: `legend-value-reserve.patch` (본 문서 4장의 DIFF와 동일 — 저장소 루트에서 `git apply legend-value-reserve.patch` 로 바로 적용 가능)

---

## 0. 요약 — 증상 ↔ 원인 ↔ 수정 위치 매핑

| # | 증상 | 근본 원인 | 수정 위치 | 성격 |
|---|------|-----------|-----------|------|
| A | 재생 중 Legend 각 항목 오른쪽 위의 단위숫자(`.graph-legend-field-value`)가 값 자릿수가 늘면 보이기/숨기기(눈) 아이콘 아래 줄로 내려갔다가, 자릿수가 줄면 다시 위로 올라온다. 단위숫자는 프레임마다 갱신되므로 재생 내내 위아래로 오르락내리락한다 | 값 span 은 `float: inline-end` 인데, **필드명 폭 + 단위숫자 폭 + 눈 아이콘 폭의 합이 한 줄 폭을 넘으면 float 가 아래 줄로 떨어지는**(float drop, CSS 2.1 §9.5.1) CSS 배치 규칙 때문이다. Legend 패널(`.log-graph-config`)의 flex-basis 가 200px 로 고정되어 있어 자릿수가 늘어난 폭을 흡수할 여유가 없다 | `main.css` ① `:root` 에 예비 폭 변수 `--legend-value-reserve` 신설 ② `.log-graph-config` 의 flex-basis 를 `calc(200px + var(--legend-value-reserve))` 로 확장 ③ `.graph-legend-field-value` 에 `white-space: nowrap` 부여 | float drop (한 줄 폭 예산 부족) |

**요구사항 (사용자 지시):**
1. 단위숫자 자릿수가 늘어도 눈 아이콘 옆 같은 줄에 머물게 한다.
2. Legend 영역 폭을 **"현재 단위숫자 폰트 크기의 4개 숫자 표시 폭"** 만큼 넓히고, 그만큼 그래프 영역 폭을 줄인다.
3. 구현은 CSS 만 — JS·템플릿 변경 없음.

### 설계 방향 — 왜 "패널이 값을 따라가게"가 아니라 "고정 예비 폭"인가

가장 먼저 떠올릴 수 있는 선택지는 "값 폭에 맞춰 Legend 패널이 늘어나거나 줄어들게 하자(flex-basis: auto)"이다. 그러나 이 길은 이미 시도했다가 실패한 이력이 코드에 기록되어 있다. `main.css` `.log-graph-config` 주석(229–233행)은 다음을 설명한다:

> 기본 `auto` basis 에서는 떠 있는 live 값("72.0 %" → "100.0 %")이 재생 중 패널 폭을 수시로 바꿨고, 이는 그래프 캔버스 박스 크기를 바꿔 캔버스 ResizeObserver 를 발동시켜 초당 수 번 캔버스를 clear/redraw 했다 — 재생 중 눈에 보이는 flicker.

즉 패널 폭이 콘텐츠를 따르지 않는 것은 버그가 아니라 **anti-flicker 설계**다. 따라서 올바른 해결책은 "폭을 콘텐츠 따라가게"가 아니라, **최악의 자릿수 증가분(4자리)을 고정 상수로 미리 깔아주는 것**이다. basis 는 여전히 콘텐츠와 무관한 상수이므로 flicker 방지 성질은 그대로 보존되면서, 자릿수 변동은 예비 폭이 흡수한다. 이것이 본 수정의 핵심 발상이다.

---

## 1. 재현 조건과 증상

### 1.1 재현 조건

1. `.bbl` 로그를 연다 — `has-log` 상태, Legend(`.log-graph-config`) 표시 중.
2. 재생을 시작한다. 재생 중에는 `playback_controls.js` 의 rAF 애니메이션 루프가 프레임마다 `updateValuesChart()` → `updateLegendValues()`(`values_display.js`)를 호출해 `graphStore.legendValues` 를 갱신한다. 단위숫자는 프레임마다 바뀐다.
3. 값의 자릿수가 변하는 지점을 지나게 한다. 전형적인 경계:
   - `"99.9"` ↔ `"100.0"` (정수부 2↔3자리)
   - `"999.9"` ↔ `"1000.0"` (정수부 3↔4자리)
   - `"-9.9"` ↔ `"-10.0"` (부호+정수부 자릿수 변동)

### 1.2 증상 (수정 전)

```text
항목 이름            [eye] 99.9     ← 값이 짧을 때: 눈 옆 같은 줄, 정상
                       ↓ 값이 100.0 로 변하는 순간
항목 이름            [eye]
                    100.0          ← float drop: 단위숫자가 아래 줄로 떨어짐
                       ↓ 값이 다시 99.9 로
항목 이름            [eye] 99.9     ← 다시 위로 올라옴
```

재생 중 값은 프레임마다 갱신되므로 자릿수가 3↔4, 4↔5 를 오가는 구간에서는 단위숫자가 매 프레임 위/아래로 요동한다. 또한 값 문자열에 공백이 있는 단위 형식(`"100.0 %"`)에서는 float **내부에서** 공백으로 줄이 잘려 숫자는 제자리에 두고 `%` 만 아래로 떨어지는 변형 증상도 같은 원인으로 발생한다.

### 1.3 수정 후 목표 상태

```text
항목 이름            [eye]  99.9    ← 자릿수가 변해도
항목 이름            [eye] 100.0    ← 항상 눈 옆 같은 줄에 고정
항목 이름            [eye] 100.0 %  ← 단위 포함 형식도 한 덩어리
```

Legend 패널은 200px → **232px**(+32px = 4자리 예비 폭)로 넓어지고, 그래프 영역은 정확히 **32px** 줄어든다.

---

## 2. 원인 분석

### 2.1 범례 필드 행의 DOM·CSS 구조

`LegendPanel.vue` 의 각 필드 행(`<li class="graph-legend-field">`)은 네 개의 자식을 가진다:

```html
<li class="graph-legend-field">
    <span class="graph-legend-field-name">…</span>            <!-- 인라인: 필드명 -->
    <button class="graph-legend-field-visibility">…</button>  <!-- float: inline-end → 눈 아이콘 -->
    <span class="graph-legend-field-value">99.9</span>        <!-- float: inline-end → 단위숫자 -->
    <div class="graph-legend-field-settings">…</div>          <!-- 블록: 색상 칩 -->
</li>
```

`main.css` 의 관련 규칙(수정 전):

```css
.graph-legend-field-value {        /* main.css 489–491행 */
    float: inline-end;
}

.graph-legend-field-visibility {   /* main.css 510–514행 */
    float: inline-end;
    margin-inline-start: 0.7em;
}
```

두 요소 모두 오른쪽 float 이며 소스 순서대로 배치된다. float 배치 순서에 따라 **눈 아이콘이 맨 오른쪽 가장자리에 먼저 붙고, 단위숫자는 그 왼쪽에 이어 붙는다**. 사용자가 보는 "각 항목 오른쪽 위에 단위숫자와 보이기/숨기기 아이콘이 나란히 있는" 배치가 바로 이 구조다.

한 줄의 폭 예산은 다음과 같이 계산된다:

```text
한 줄 예산 = 패널 콘텐츠 폭 − (행의 padding-inline 0.7em × 2)
소비 폌   = 필드명 폭 + 단위숫자 폭 + 눈 아이콘 폭 + 눈 아이콘 margin-inline-start 0.7em
```

### 2.2 핵심 — float drop 규칙 (CSS 2.1 §9.5.1)

CSS float 배치 규칙은 "float 박스가 현재 줄에 남은 가로 공간에 들어갈 수 없으면, 들어갈 수 있을 때까지 **아래로 내려간다**"고 정의한다. 이 규칙이 자릿수와 연동해 작동한다:

- **값이 짧을 때** (`"72.0"`, `"99.9"`): 세 요소의 합산 폭 ≤ 한 줄 예산 → 단위숫자 float 가 눈 아이콘 왼쪽 같은 줄에 배치된다. 정상 표시.
- **값이 길어질 때** (`"100.0"`, `"-123.4"`): 합산 폭 > 한 줄 예산 → **단위숫자 float 가 현재 줄에 못 들어가 아래로 떨어져** 눈 아이콘 아래 줄에 표시된다.

패널(`.log-graph-config`)의 폭은 다음처럼 고정되어 있어 값이 아무리 길어져도 한 줄 예산이 늘어나지 않는다:

```css
.log-graph-config {               /* main.css 221–237행 */
    min-width: 135px;
    flex: 0.02 1 200px;           /* ← basis 200px 고정 (anti-flicker 설계) */
}
```

따라서 "자릿수가 늘면 단위숫자가 내려가고, 줄면 올라온다"는 증상은 브라우저 버그가 아니라 **고정된 줄 폭 예산 위에서의 정확한 float 규격 동작**이다. 해결의 열쇠는 규칙을 우회하는 것이 아니라, **예산에 4자리分의 여유를 상수로 추가**하는 것이다.

### 2.3 숫자로 확인 — 왜 32px 인가

사용자 지시대로 "현재 단위숫자 폰트 크기의 4개 숫자 표시 폭"을 계산한다:

```text
단위숫자 폰트 크기 = .log-graph-legend { font-size: 85% } (main.css 148–154행)
                  = 85% × 루트 16px = 13.6px
숫자 1자리 진행폭  = 시스템 UI 폰트(Segoe UI·Roboto·Inter 등)에서
                    숫자 glyph 진행폭 ≈ 0.55–0.6em
                  = 13.6px × 0.6 ≈ 8.2px  (보수적으로 8px 가정)
4자리 예비 폭      = 8px × 4 = 32px      (0.55em 가정 시 30px → 여유 있는 32px 채택)
```

32px 예비 폭이 흡수하는 자릿수 변동:

| 값 변동 | 추가 폭 | 32px 예산에서 |
|---|---|---|
| `"99.9"` → `"100.0"` (2↔3자리 경계) | 약 8px | 흡수 |
| `"999.9"` → `"1000.0"` (3↔4자리 경계) | 약 8px | 흡수 |
| `"-9.9"` → `"-10.0"` (부호 자릿수) | 약 8px | 흡수 |
| 단위 형식 `"100.0"` → `"100.0 %"` | 약 16px | 흡수 |

---

## 3. 해결 방법

### 3.1 구현 원칙 — 고정 예비 폭 32px 를 Legend 에 이전

Legend 패널의 flex-basis 를 `200px` → `calc(200px + 32px)` 로 늘린다. 그래프 영역(`.log-graph`)은 `flex-grow: 1`(basis 0%)로 **남는 폭을 전부 가져가는 구조**이므로, 패널이 늘어난 32px 만큼 그래프가 자동으로 줄어든다 — 별도의 축소 규칙이 필요 없다. "Legend 를 넓히고 그만큼 그래프 영역을 줄인다"는 요구가 flexbox 메커니즘으로 그대로 충족된다.

```text
수정 전:  [ 그래프: row − 206px ][ 6px ][ Legend: 200px ]
수정 후:  [ 그래프: row − 238px ][ 6px ][ Legend: 232px ]   ← 그래프 −32px, Legend +32px
```

### 3.2 왜 `:root` 변수로 뽑았는가 — 코드베이스 관례 + 한 줄 튜닝

`main.css` 는 레이아웃 메트릭을 `:root` 변수로 관리하는 관례가 있다(`--toolbar-height`, `--seekbar-height`, 그리고 직전 수정에서 추가된 `--fullscreen-graph-gap: 15px`). 이 줄기에 `--legend-value-reserve` 를 추가하면 (1) 기존 변수 문화와 일치하고, (2) 값을 바꿀 때 규칙 본문이 아니라 변수 한 줄만 고치면 되며, (3) 폰트나 폰트 크기 정책이 바뀌는 미래에 대응 지점이 한 곳으로 모인다.

### 3.3 최종 구현 (3단계)

**① `:root` 에 예비 폭 변수 신설** — 산출 근거를 주석으로 고정:

```css
:root {
    /* …기존 변수들… */

    /*
     * Legend value-width reserve — extra flex-basis handed to the Legend
     * panel (.log-graph-config) so the right-floated live value
     * (.graph-legend-field-value) never runs out of horizontal room and
     * drops below the visibility eye icon whenever its digits grow during
     * playback ("99.9" -> "100.0", "-9.9" -> "-10.0", ...). The value text
     * updates every frame, so without a fixed reserve the number bounces
     * between the first line and the line below (CSS float drop,
     * CSS 2.1 §9.5.1).
     *
     * 32px = the width of 4 digits at the value font size:
     *   .log-graph-legend font-size 85% × 16px root = 13.6px,
     *   digit advance ≈ 0.6em ≈ 8px  →  4 × 8 = 32px.
     * The graph (.log-graph, flex-grow: 1) gives up exactly this width,
     * so widening the Legend shrinks the graph by the same amount.
     * Tune this single value to taste (24px = 3 digits, 40px = 5 digits).
     */
    --legend-value-reserve: 32px;
}
```

**② Legend 패널 flex-basis 확장** — anti-flicker 주석 아래에 의도를 덧붙임:

```css
.log-graph-config {
    /* …기존 주석 유지… */
    /* 200px panel + --legend-value-reserve: the reserve keeps the floated
       live value on the first line even at its widest (4 extra digits).
       The basis must stay content-independent — see the flicker note
       above; the reserve is a fixed constant, so the panel width never
       follows the live values. */
    flex: 0.02 1 calc(200px + var(--legend-value-reserve));
    /* …나머지 선언 유지… */
}
```

**③ 단위숫자 span 의 내부 분절 금지 (hardening)** — §1.2 말미의 변형 증상(`"100.0"` / `"%"` 분리) 차단:

```css
.graph-legend-field-value {
    float: inline-end;
    /* Never fragment inside the float (a "100.0 %" value breaking into
       "100.0" / "%" on separate lines): the value travels as one
       unbreakable line, and --legend-value-reserve gives it the room. */
    white-space: nowrap;
}
```

`white-space: nowrap` 을 값 span 에 부여해도 float drop 자체는 여전히 가능하다(들어갈 공간이 없으면 덩어리째 아래로 내려감) — 즉 극단적으로 긴 값이 나와도 동작이 일관된다. 예비 폭 32px 가 일상적 자릿수를 전부 흡수하므로, 실제로는 drop 이 관측되지 않는다.

### 3.4 예비 폭 튜닝 가이드

`--legend-value-reserve` 값을 바꿔가며 데이터 성격에 맞게 고르면 된다:

| 값 | 의미 | 추천 상황 |
|----|------|-----------|
| `24px` (3자리) | 타이트 — 그래프 최대 확보 | 단위 표시 OFF(순수 숫자 값) + 필드명이 짧은 로그 전용 |
| **`32px` (기본)** | **4자리 여유 — 사용자 요구사항 그대로** | **단위 표시 ON 포함 일반적인 로그. 본 문서 권장값** |
| `40px` (5자리) | 넉넉 | `-100.0 %` 처럼 부호+소수+단위가 늘 붙는 로그 (예: 전압 계열 필드) |

### 3.5 부작용 검토 (전부 확인 완료 — 추가 변경 불필요)

| 항목 | 영향 | 이유 |
|------|------|------|
| 그래프 영역 폭 | **−32px** (요구된 비용) | `.log-graph` 의 `flex-grow: 1` 이 잉여 폭을 흡수하는 구조라 패널 증가분만큼 자동 감소 |
| 캔버스 재측정 | 로드 시 1회 | 정적 CSS 변경이므로 ResizeObserver 는 적용 시점 1회만 발동. 재생 중 반복 발동이 아님 (§설계 방향 참고) |
| anti-flicker 설계 | 보존 | basis 는 `calc()` 를 해도 여전히 콘텐츠 무관 상수 — live 값이 패널 폭을 바꾸지 못함 |
| `min-width: 135px` | 무영향 (미변경) | flex-shrink 발동 조건 = `.graph-row` 폭 < 232px (basis 합 = 그래프 0% + 패널 232px) → 현실적 뷰포트(≥320px)에서 미발동. min-width 는 수정 전부터 사실상 inert |
| 폰 뷰포트 (≤675px) | 동일 적용 | 해당 미디어쿼리는 padding·h2 표시만 조정하고 flex 를 오버라이드하지 않음 → reserve 그대로 유효. 좌우 padding 제거(1em 0)로 확보된 공간과 누적되어 폰에서도 drop 여유 충분 |
| 다크 테마 | 무영향 | `.dark .log-graph-config` 규칙은 border-color 만 변경 |
| 전체화면(`is-fullscreen`) | 무영향 | 해당 규칙은 top/bottom/margin 만 다룸 — flex 구조 변화 없음. Legend 가 세로로 늘어날 뿐 폭 로직 동일 |
| Legend 표시/숨김 토글 | 무영향 | `v-show` + 기존 flex 규칙 그대로. basis 값만 증가 |
| 드래그 순서 변경·휠 조정·Graph setup | 무영향 | JS 이벤트 체인 미변경 — DOM 구조와 클래스명 불변 |
| `graph-legend-field-settings` 색상 칩 | 무영향 | 블록 요소로 float 흐름 아래에 위치 — 줄 폭 예산과 무관 |

---

## 4. DIFF

`git apply legend-value-reserve.patch` (저장소 루트에서) 또는 수동 적용:

```diff
diff --git a/src/blackbox-viewer/css/main.css b/src/blackbox-viewer/css/main.css
index 3eae720..7ed85a2 100644
--- a/src/blackbox-viewer/css/main.css
+++ b/src/blackbox-viewer/css/main.css
@@ -40,6 +40,25 @@
      * uniform 15px frame on all four sides. Tune this single value to taste.
      */
     --fullscreen-graph-gap: 15px;
+
+    /*
+     * Legend value-width reserve — extra flex-basis handed to the Legend
+     * panel (.log-graph-config) so the right-floated live value
+     * (.graph-legend-field-value) never runs out of horizontal room and
+     * drops below the visibility eye icon whenever its digits grow during
+     * playback ("99.9" -> "100.0", "-9.9" -> "-10.0", ...). The value text
+     * updates every frame, so without a fixed reserve the number bounces
+     * between the first line and the line below (CSS float drop,
+     * CSS 2.1 §9.5.1).
+     *
+     * 32px = the width of 4 digits at the value font size:
+     *   .log-graph-legend font-size 85% × 16px root = 13.6px,
+     *   digit advance ≈ 0.6em ≈ 8px  →  4 × 8 = 32px.
+     * The graph (.log-graph, flex-grow: 1) gives up exactly this width,
+     * so widening the Legend shrinks the graph by the same amount.
+     * Tune this single value to taste (24px = 3 digits, 40px = 5 digits).
+     */
+    --legend-value-reserve: 32px;
 }
 
 .blackbox-viewer-root a:hover {
@@ -231,7 +250,12 @@
        resized the panel every 250 ms during playback, which resized the graph
        canvas box, which fired the canvas ResizeObserver and cleared/redrew
        the canvas several times per second — visible flicker while playing. */
-    flex: 0.02 1 200px;
+    /* 200px panel + --legend-value-reserve: the reserve keeps the floated
+       live value on the first line even at its widest (4 extra digits).
+       The basis must stay content-independent — see the flicker note
+       above; the reserve is a fixed constant, so the panel width never
+       follows the live values. */
+    flex: 0.02 1 calc(200px + var(--legend-value-reserve));
     flex-direction: column;
     display: none;
 }
@@ -488,6 +512,10 @@
 
 .graph-legend-field-value {
     float: inline-end;
+    /* Never fragment inside the float (a "100.0 %" value breaking into
+       "100.0" / "%" on separate lines): the value travels as one
+       unbreakable line, and --legend-value-reserve gives it the room. */
+    white-space: nowrap;
 }
 
 .graph-legend-field-settings {
```

변경 통계: `src/blackbox-viewer/css/main.css` 1개 파일, +35 −1 (코드 라인은 `:root` 변수 1줄 + flex-basis 1줄 + `white-space: nowrap` 1줄, 나머지는 주석).

---

## 5. 검증 방법

### 5.1 수동 절차 (기기/데스크톱)

1. `.bbl` 파일을 열고 재생한다.
2. 값의 자릿수 경계 지점(예: `"99.9"` ↔ `"100.0"`)을 반복 통과시킨다.
   기대 결과: **단위숫자가 눈 아이콘 옆 같은 줄에 고정**되고, 위아로 요동하지 않는다.
3. 단위 표시가 켜진 필드(예: `100.0 %`)에서 `%` 가 숫자와 함께 한 덩어리로 표시되는지 확인한다.
4. Legend 패널이 이전보다 약간 넓어지고(200→232px) 그래프 캔버스가 그만큼 좁아졌는지 눈으로 확인한다.
5. 재생 중 Legend 패널 폭 자체가 변하지 않는지(그래프 캔버스 flicker 가 없는지) 확인한다.

### 5.2 수동 절차 (DevTools 대체)

요소 검사로 다음을 확인한다:

- `.log-graph-config` computed `flex-basis` = `232px` (= 200px + 32px).
- `.graph-legend-field-value` computed `white-space` = `nowrap`.
- `.graph-legend-field` 에서 값이 긴 순간에도 value span 의 bounding box top 이 eye 버튼과 같은 행인지 확인.
- 뷰포트를 360px 로 줄여도(폰 에뮬레이션) 증상이 재발하지 않는지 확인.

### 5.3 예비 폭 미세 조정 시

값을 바꾸려면 `main.css` 의 `--legend-value-reserve: 32px;` 한 줄만 고친다. 패널 폭과 그래프 감소폭이 항상 함께 움직이므로 두 영역의 합은 불변이다.

### 5.4 회귀 체크리스트

- [ ] 재생 중 단위숫자 위아래 요동 없음 (`"99.9"`↔`"100.0"`, `"-9.9"`↔`"-10.0"` 경계 포함)
- [ ] `"100.0 %"` 형식에서 `%` 가 단독으로 아래로 떨어지지 않음
- [ ] 그래프 영역 폭 32px 감소 외 레이아웃 무변화
- [ ] 재생 중 패널 폭 불변 (캔버스 flicker 없음 — anti-flicker 설계 보존 확인)
- [ ] 폰 뷰포트(≤675px)·다크 테마·전체화면 토글에서 동일 동작
- [ ] 필드 드래그 순서 변경·휠 스무딩/스케일 조정·Graph setup 진입 정상
