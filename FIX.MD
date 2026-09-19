# FIX.MD — 표준 스마트폰 화면 레이아웃 + 안드로이드 시스템바 문제 분석 및 수정 Diff

> 대상 저장소: `blackbox2` (Rotorflight Blackbox Viewer)
> 기준 커밋: `0af2670` ("Android app fixes: safe-area layout, hide system bars, ...")
> 수정 대상 파일:
> - `src/blackbox-viewer/css/main.css` — 레이아웃/세이프에어리어
> - `src/blackbox-viewer/main.js` — 캔버스 재측정
> - `android/app/src/main/java/betaflight/app/MainActivity.java` — 몰입(sticky immersive) 모드
> - `android/app/build.gradle` — androidx.core 명시 의존성
>
> 동반 파일: `fix-layout.patch` (본 문서의 DIFF와 동일, `git apply`로 바로 적용 가능 — `git apply --check`로 적용 가능 여부 검증 완료)

---

## 0. 요약 — 증상 ↔ 원인 ↔ 수정 위치 매핑

| # | 증상 | 근본 원인 | 수정 위치 |
|---|------|-----------|-----------|
| A | 상단 메뉴 오른쪽(ZOOM부터)이 화면 밖으로 잘려 보이지 않고, AppMenu(내보내기/설정)에도 접근 불가 | 툴바의 고정 `min-width: 1390px` — 폰 가로폭(~800~920dp)보다 넓게 렌더링되며, `position: fixed`라 화면 밖 영역에 도달할 방법이 없음 | main.css 툴바 블록 |
| B | 상단 메뉴를 옆으로 스크롤할 수 없음 | 가로 스크롤 컨테이너(`.video-top-controls-scroll`)는 이미 존재하지만 뷰포트가 아닌 1390px 부모 폭을 물려받아 **오버플로 자체가 발생하지 않음** + 내부 패널이 `flex-shrink`로 눌려 스크롤이 생성되지 않는 구조 | main.css 스크롤 컨테이너 |
| C | 헤더–그래프–타임라인 사이 간격이 넓어 공간 낭비, 그래프가 남는 공간을 채우지 못함 | 데스크톱 기준 하드코딩 오프셋(그래프 상단 85px·115px, 하단 96px), 미디어쿼리마다 `!important` 파편 — 폰(가로 높이 360~400px)에서는 크롬+여백이 화면의 절반 가까이 차지 | main.css `:root` 변수 + `.graph-row` |
| D | (숨은 버그, "하단 타임라인 잘림"의 또 다른 원인) 하단 상태바가 타임라인 캔버스 하단 ~16px을 항상 덮음 | 시크바 `bottom` 여유가 `0.5em`(8px)인데 상태바는 높이 `1.5rem`(24px) + `z-index: 100`(시크바는 10) — 24px > 8px 이므로 항상 겹침 | main.css `.log-seek-bar` |
| E | 레이아웃 변경 후 그래프 캔버스가 새 크기를 반영하지 못함 | `updateCanvasSize()`가 `window.resize` 이벤트에만 연결 — 브레이크포인트 통과/세이프에어리어 변화는 resize 이벤트를 발생시키지 않음 | main.js `ResizeObserver` |
| F | 처음엔 전체화면 + 타임라인 정상 → 시스템바(하단 내비게이션 바)가 한 번 나타난 뒤에는 전체화면이 복구되지 않고 타임라인이 시스템바에 가려져 잘림 | ① Capacitor 내장 SystemBars 플러그인의 `hide()`가 `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`를 설정하지 않음 → 한 번 나타난 바가 자동 숨김되지 않고 **영구 표시** ② 숨김 적용이 시작 시 1회뿐 — 포커스 회복 시 재적용 없음 ③ 바 표시 중 플러그인의 safe-area 변수 주입이 실패하면(조건부 로직) 하단 UI가 그대로 바 뒤에 가려짐 | MainActivity.java + app/build.gradle + main.css `:root` |

**"표준 스마트폰에서 비율에 맞지 않게 표시됨" = A + B + C + D의 복합 결과**이며,
**"시스템바 등장 후 전체화면/타임라인 깨짐" = F(+D)** 입니다. 화면 폭 방향(A·B), 화면 높이 방향(C·D), 수명주기 방향(F)으로 나뉩니다.

---

## 1. 문제 A — 상단 메뉴 우측(ZOOM 이후) 잘림

### 증상
- 표준 스마트폰(가로 기준 폭 800dp 내외)에서 툴바가 **ZOOM 패널부터** 화면 오른쪽 밖으로 밀려나 보이지 않음.
- 툴바 맨 끝의 AppMenu(내보내기/설정 메뉴)도 함께 접근 불가.

### 원인 (코드 레벨)
`main.css`의 `.video-top-controls`:

```css
width: 100%;
min-width: 1390px;   /* ← 범인 */
```

- `position: fixed` 요소는 `min-width: 1390px`을 그대로 반영해 **뷰포트보다 넓게** 렌더링됩니다. 폰에서는 800px 정도의 뷰포트에 1390px짜리 툴바가 그려지므로, 왼쪽부터 ~800px까지만 보이고 나머지는 화면 밖입니다.
- `position: fixed`이므로 페이지 스크롤로도 도달할 수 없고, 내부 스크롤 컨테이너도(문제 B) 작동하지 않아 **잘린 영역은 영구적으로 접근 불가**입니다.
- 부수적 버그: 이 요소는 `left/right` 지정 없이 정적 위치(부모 `padding 15px` 지점)에서 시작하므로, `width: 100%`만으로도 오른쪽이 15px 넘칩니다. 데스크톱에서도 AppMenu 우측 15px이 잘려 있던 셈입니다.
- 툴바 내 패널 순서는 `Open | ViewControls | Playback | Speed | Zoom | Time | Sync | Workspace | Log | AppMenu` 이므로, 잘리기 시작하는 지점이 대략 ZOOM 부근이 됩니다.

### 수정 내용
- `min-width: 1390px` 제거, `inset-inline-start/end: 0` + `width: auto`로 뷰포트에 정확히 고정.
- `top: 0` → `top: var(--safe-area-inset-top)` (세이프에어리어 대응, 노치 기기).
- `min-height`를 `var(--toolbar-height)` 변수화 (문제 C와 연동).

---

## 2. 문제 B — 상단 메뉴 가로 스크롤 불가

### 증상
- 사용자 요구: "상단 메뉴는 스크롤 기능으로 옆으로 움직일 수 있게 해줘".
- 현재는 잘린 채 아무 반응이 없음.

### 원인 (코드 레벨)
`main.css`:

```css
.video-top-controls-scroll {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    overflow-x: auto;   /* 스크롤 컨테이너는 "이미" 존재함 */
    ...
}
```

- 스크롤 컨테이너가 이미 구현되어 있음에도 작동하지 않는 이유는 두 가지입니다.
  1. **부모가 1390px**이므로 flex 레이아웃상 스크롤 컨테이너도 넉넉한 폭을 배정받습니다. 콘텐츠가 컨테이너 안에 다 들어가므로 오버플로가 발생하지 않고 → 스크롤바가 생길 이유가 없습니다. (잘리는 것은 컨테이너 밖, 즉 뷰포트)
  2. 뷰포트를 줄이면(예: 데스크톱에서 창 축소) 이번엔 내부 `.toolbar-panel`들이 기본 `flex-shrink: 1`이라 **패널 자체가 눌리면서** 오버플로가 발생하지 않습니다. 오버플로가 없으면 스크롤도 없습니다.

### 수정 내용
- `.video-top-controls-scroll > .toolbar-panel { flex: none; }` — 패널을 자연 폭으로 유지해 컨테이너가 실제로 오버플로 → 가로 스크롤 활성화.
- `scrollbar-width: thin;` — 터치/마우스 모두 얇은 스크롤바로 가시성 확보.
- (문제 A 수정과 함께) 툴바가 뷰포트 폭으로 제한되므로, 넘치는 패널은 전부 스크롤로 접근 가능. AppMenu는 스크롤 영역 밖(`flex: none`) 오른쪽 끝에 **항상** 표시됩니다.

---

## 3. 문제 C — 헤더/그래프/타임라인 사이 고정 여백 (공간 낭비)

### 증상
- 상단 메뉴와 그래프, 그래프와 하단 타임라인 사이의 여백이 커서 그래프가 좁게 그려짐.
- 사용자 요구: "헤더–메인–하단 사이 간격은 그래프가 차지하게 해줘".

### 원인 (코드 레벨)
모두 데스크톱(높이 800px+) 기준 하드코딩 값입니다.

```css
.graph-row {
    top: calc(85px + var(--safe-area-inset-top));
    bottom: calc(96px + var(--safe-area-inset-bottom));
}
@media (max-width: 1020px) { .graph-row { top: 85px !important; } }
@media (max-width: 675px)  { div.graph-row { top: 115px !important; } }
```

- 폰 가로(높이 360~400px) 기준 계산:
  - 툴바 `min-height: 64px` (≤1020px 쿼리) → 0~64px
  - 그래프 `top: 85px !important` → **툴바 아래 21px가 그대로 죽은 여백**
  - 그래프 `bottom: 96px` → 하단 96px 중 시크바(58px)+상태바(24px)=82px만 사용, 나머지 여백
  - 결과: 360px 화면에서 그래프는 **179px(약 50%)** 만 사용
- `115px !important`(≤675px)는 툴바가 절대 줄바꿈하지 않는(`nowrap`, 고정 폭) 구조에서 근거 없는 값으로, 세로가 가장 짧은 화면에서 오히려 여백만 키웁니다.

### 수정 내용 — 크롬 높이를 CSS 변수로 추출하고 그래프가 사이를 정확히 채움

```css
:root {
    --toolbar-height: 76px;                /* 툴바 높이 (≤1020px에서 64px) */
    --statusbar-height: 1.5rem;            /* 상태바 24px */
    --seekbar-height: calc(50px + 0.5em);  /* 타임라인 캔버스 + 상단 마진 */
}
.graph-row {
    top:    calc(var(--toolbar-height) + 6px + var(--safe-area-inset-top));
    bottom: calc(var(--statusbar-height) + var(--seekbar-height) + 0.5em + var(--safe-area-inset-bottom));
}
```

- 툴바/상태바/시크바 높이가 바뀌면 그래프가 자동으로 따라가는 구조가 됩니다.
- 미디어쿼리의 `top: 85px/115px !important` 파편을 삭제하고, `≤1020px`에서는 `--toolbar-height: 64px`만 오버라이드합니다.

**변경 전/후 비교 (폰 가로 800×360 기준):**

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 툴바→그래프 간격 | 21px | 6px |
| 그래프 높이 | 179px (49.7%) | **200px (55.6%, +12%)** |
| 그래프→타임라인 실효 간격 | ~14px | 8px |
| 타임라인 실효 표시 높이 | 34px (하단 16px 상태바에 가려짐) | **50px 전체** |
| 데스크톱(1280×800) 그래프 | 619px | 628px (+9px, 회귀 없음) |

---

## 4. 문제 D — 하단 상태바가 타임라인 캔버스를 덮음 (발견된 추가 버그)

### 증상
- 타임라인(seek bar) 하단 ~16px이 하단 상태바(버전/전압/북마크 표시줄)에 가려짐.
- 폰처럼 화면이 낮을수록 비율상 피해가 커짐. (안드로이드 시스템바 이슈와 별개로 **항상** 존재하던 버그)

### 원인 (코드 레벨)
```css
.log-seek-bar    { bottom: var(--bottom-bar-clearance); }  /* = max(0.5em, safe) ≈ 8px */
.vue-statusbar   { bottom: var(--safe-area-inset-bottom); z-index: 100; }  /* 높이 1.5rem = 24px */
#log-seek-bar    { z-index: 10; }
```

- 시크바는 화면 하단에서 8~66px 구간, 상태바는 0~24px 구간 → **8~24px 구간 겹침**.
- 상태바가 불투명 배경(`--surface-200`) + 더 높은 z-index라서 캔버스 하단 16px을 덮습니다. 시크바 캔버스는 0~높이 끝까지 그리므로 그려진 내용이 실제로 가려집니다.

### 수정 내용
```css
bottom: calc(var(--statusbar-height) + var(--safe-area-inset-bottom));
```
- 시크바가 항상 상태바 **바로 위**에 적층되도록 변경. 상태바 높이가 바뀌어도 자동 대응.
- 기존 `--bottom-bar-clearance` 변수는 유일한 사용처가 이 값이므로 함께 제거했습니다.

---

## 5. 문제 E — 그래프 캔버스 재측정 누락 (main.js)

### 증상
- 위 레이아웃 수정으로 그래프 박스가 커져도, 캔버스 드로잉 버퍼가 갱신되지 않아 그래프가 옛 크기로 남는 경우가 있음.

### 원인 (코드 레벨)
```js
const onWindowResize = () => updateCanvasSize();
window.addEventListener("resize", onWindowResize);
```
- `updateCanvasSize()`는 `canvas.clientWidth/Height`를 읽어 `graph.resize()`를 호출하는데, **window resize 이벤트에서만** 호출됩니다.
- 미디어쿼리 브레이크포인트 통과(1020px/675px), 세이프에어리어 변수 갱신 등은 window 크기 변화 없이 박스 크기만 바꾸므로 재측정이 누락됩니다.

### 수정 내용
- 그래프 캔버스 박스를 관찰하는 `ResizeObserver`를 추가하고 정리(cleanup) 체인에 등록.
  - `updateCanvasSize()`는 읽기 전용 측정이므로 관찰 루프(loop) 위험 없음.
  - 그래프가 로드되지 않은 상태(`graphStore.graph === null`)에서는 기존 가드가 그대로 작동합니다.

---

## 6. 문제 F — 시스템바 재등장 후 전체화면 유실 + 타임라인 가림 (안드로이드)

### 증상
- APK 설치 후 첫 실행: 전체화면(시스템바 숨김) + 하단 타임라인 정상 표시.
- 이후 하단 안드로이드 시스템바가 한 번 나타난 뒤: 전체화면이 복구되지 않고, 타임라인이 시스템바에 가려져 잘림.

### 원인 (코드 레벨) — 3계층 구조

**① 숨김 동작(behavior) 미설정 → 바가 영구 표시됨**

Capacitor 8에 내장된 SystemBars 플러그인(`com.getcapacitor.plugin.SystemBars`)의 숨김 코드:

```java
// capacitor 8.3.4 SystemBars.setHidden()
if (hide) {
    windowInsetsControllerCompat.hide(WindowInsetsCompat.Type.statusBars());
    windowInsetsControllerCompat.hide(WindowInsetsCompat.Type.navigationBars());
    return;   // ← setSystemBarsBehavior() 호출이 없음!
}
```

- `hide()`만 호출하고 `setSystemBarsBehavior(BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)`를 설정하지 않으므로 컨트롤러는 기본값(`BEHAVIOR_DEFAULT`)으로 동작합니다.
- 기본 동작에서는 엣지 스와이프 등으로 나타난 시스템바가 **자동으로 다시 숨겨지지 않고 영구 표시**됩니다. (sticky/transient 모드라면 1~2초 후 자동 숨김)
- 숨김은 앱 시작 시 설정의 `"SystemBars": { "hidden": true }`로 **딱 1회**만 수행되고, 그 이후의 해제는 앱이 다시 되돌리지 않습니다.

**② 수명주기 재적용 없음 → 포커스 회복 시 숨김 상태가 유실된 채 방치**

- 시스템 파일 선택기(SAF)에서 복귀, 키보드(IME) 종료, 알림센터 닫힘 등은 액티비티 재생성 없이 숨김 상태를 해제합니다. 재적용 코드가 없어 그대로 방치됩니다. (로그 파일을 여는 순간 = 파일 선택기 왕복 = 재현 확률이 매우 높은 경로)

**③ 바가 표시된 동안 safe-area 변수 주입이 조건부 → 하단 UI가 바 뒤에 가려짐**

- targetSdk 36(Android 15+ 강제 edge-to-edge)에서 WebView는 시스템바 아래까지 그려지므로, 바가 나타나면 하단 UI가 바 뒤로 들어갑니다.
- 이를 보정하는 `--safe-area-inset-*` 변수는 플러그인이 **Android 15+ && WebView 140+ && `viewport-fit=cover` 확인(`hasViewportCover`)** 조건을 모두 통과해야 주입합니다. 하나라도 어긋나면 주입이 없어 시크바/상태바가 시스템바 뒤에 그려져 **타임라인이 잘린 것처럼** 보입니다.

### 수정 내용

**① MainActivity — sticky immersive 모드 구현 (핵심 수정)**

```java
private void applyImmersiveStickyMode() {
    Window window = getWindow();
    if (window == null) return;
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(window, window.getDecorView());
    controller.setSystemBarsBehavior(
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);  // ← 자동 재숨김
    controller.hide(WindowInsetsCompat.Type.systemBars());
}
```

- `onCreate` 1회 + `onWindowFocusChanged(hasFocus=true)`마다 재적용 → 파일 선택기 복귀/키보드 종료/알림센터 닫힘 직후 자동 재숨김.
- `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` 설정으로 스와이프 시에도 바는 **일시 오버레이로 나타났다 자동 숨김**됩니다(스티키 몰입 표준 동작).

**② app/build.gradle — `androidx.core` 명시 의존성 추가**

- MainActivity가 `androidx.core.view.*`(WindowInsetsController API)를 사용하므로, 전이 의존에 의존하지 않고 `variables.gradle`이 핀닝한 버전으로 명시 선언합니다.

**③ main.css `:root` — `env(safe-area-inset-*)` 폴백 (방어층)**

```css
--safe-area-inset-top: env(safe-area-inset-top, 0px);
--safe-area-inset-right: env(safe-area-inset-right, 0px);
--safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
--safe-area-inset-left: env(safe-area-inset-left, 0px);
```

- 기존 정적 `0px` 대신 `env()`를 기본값으로 사용. 플러그인의 인라인 주입(있으면)이 이 규칙보다 우선하므로 기존 동작은 그대로입니다.
- 주입이 없는 환경에서 WebView가 실제 인셋을 받는다면(WebView 140+ + `viewport-fit=cover`) **바가 표시된 동안** 시크바/상태바/그래프가 자동으로 바 위로 올라가고, 바가 숨겨지면 원위치됩니다. 데스크톱 브라우저에서는 `env()`가 0이라 변화 없음.

**수정 후 동작 시나리오:**

| 상황 | 기존 | 수정 후 |
|------|------|---------|
| 엣지 스와이프로 바 노출 | 영구 표시, 전체화면 붕괴 | 일시 오버레이 → 1~2초 후 자동 숨김 |
| 파일 선택기 복귀 | 바 표시된 채 방치 | 포커스 회복 시 즉시 재숨김 |
| 키보드 닫음 | 바 잔류 가능 | 포커스 회복 시 재숨김 |
| 바 표시 중 타임라인 | 시스템바에 가려 잘림 | env()/변수에 따라 바 위로 리프트, 숨겨지면 원위치 |

---

## 7. 전체 DIFF (검증 완료: `git apply --check` 통과)

```diff
diff --git a/android/app/build.gradle b/android/app/build.gradle
index f63ed02..1b3e177 100644
--- a/android/app/build.gradle
+++ b/android/app/build.gradle
@@ -45,6 +45,9 @@ repositories {
 dependencies {
     implementation fileTree(include: ['*.jar'], dir: 'libs')
     implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
+    // Explicit (not transitive): MainActivity uses androidx.core.view.*
+    // WindowInsetsController APIs for sticky immersive mode.
+    implementation "androidx.core:core:$androidxCoreVersion"
     implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
     implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
     implementation 'androidx.documentfile:documentfile:1.0.1'
diff --git a/android/app/src/main/java/betaflight/app/MainActivity.java b/android/app/src/main/java/betaflight/app/MainActivity.java
index 682b6b5..d3c5e40 100644
--- a/android/app/src/main/java/betaflight/app/MainActivity.java
+++ b/android/app/src/main/java/betaflight/app/MainActivity.java
@@ -1,6 +1,11 @@
 package betaflight.app;
 
 import android.os.Bundle;
+import android.view.Window;
+
+import androidx.core.view.WindowCompat;
+import androidx.core.view.WindowInsetsCompat;
+import androidx.core.view.WindowInsetsControllerCompat;
 
 import com.getcapacitor.BridgeActivity;
 import betaflight.app.file.BetaflightFilePlugin;
@@ -10,5 +15,41 @@ public class MainActivity extends BridgeActivity {
   public void onCreate(Bundle savedInstanceState) {
     registerPlugin(BetaflightFilePlugin.class);
     super.onCreate(savedInstanceState);
+    applyImmersiveStickyMode();
+  }
+
+  @Override
+  public void onWindowFocusChanged(boolean hasFocus) {
+    super.onWindowFocusChanged(hasFocus);
+    // The system can clear the hidden state without recreating the activity:
+    // returning from the file picker, closing the IME, pulling down the
+    // notification shade, a swipe reveal, etc. Re-assert the hidden bars
+    // every time the window regains focus.
+    if (hasFocus) {
+      applyImmersiveStickyMode();
+    }
+  }
+
+  /**
+   * Full "sticky immersive" mode:
+   * - hides the status + navigation bars;
+   * - BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE makes a swipe reveal a transient
+   *   overlay that auto-hides again. The Capacitor SystemBars plugin's
+   *   hide() runs with the default controller behavior, so once the bars
+   *   were revealed they never re-hid on their own and fullscreen was lost.
+   */
+  private void applyImmersiveStickyMode() {
+    Window window = getWindow();
+    if (window == null) {
+      return;
+    }
+    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
+      window,
+      window.getDecorView()
+    );
+    controller.setSystemBarsBehavior(
+      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
+    );
+    controller.hide(WindowInsetsCompat.Type.systemBars());
   }
 }
diff --git a/src/blackbox-viewer/css/main.css b/src/blackbox-viewer/css/main.css
index 7ae12be..ef61a5b 100644
--- a/src/blackbox-viewer/css/main.css
+++ b/src/blackbox-viewer/css/main.css
@@ -9,18 +9,28 @@
 /*
  * Android 15+ forces edge-to-edge, so the system bars (gesture/navigation
  * bar) draw over the app. Capacitor's SystemBars plugin hides them and
- * injects --safe-area-inset-* variables into the WebView. Bottom-fixed UI
- * (seek bar / timeline, status bar) uses the variable so the timeline stays
- * fully visible even if the bar reappears transiently (swipe, fallback) or
- * hiding is unavailable. A static fallback keeps the layout usable before
- * the plugin injects the variables.
+ * injects --safe-area-inset-* variables into the WebView as inline styles,
+ * which take precedence over this rule. env(safe-area-inset-*) is used as
+ * the stylesheet fallback so bottom-fixed UI (seek bar / timeline, status
+ * bar) still lifts above a re-appearing system bar before the plugin
+ * injects, or whenever its injection is unavailable (older WebViews,
+ * Android < 15). In regular browsers env() resolves to 0.
  */
 :root {
-    --safe-area-inset-top: 0px;
-    --safe-area-inset-right: 0px;
-    --safe-area-inset-bottom: 0px;
-    --safe-area-inset-left: 0px;
-    --bottom-bar-clearance: max(0.5em, var(--safe-area-inset-bottom));
+    --safe-area-inset-top: env(safe-area-inset-top, 0px);
+    --safe-area-inset-right: env(safe-area-inset-right, 0px);
+    --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
+    --safe-area-inset-left: env(safe-area-inset-left, 0px);
+
+    /*
+     * Fixed-chrome metrics. The graph row is placed BETWEEN the toolbar and
+     * the seek bar / status bar, so the graph absorbs all leftover space
+     * instead of living inside hardcoded dead margins. Phone media queries
+     * below override these values.
+     */
+    --toolbar-height: 76px; /* .video-top-controls height (64px ≤1020px) */
+    --statusbar-height: 1.5rem; /* .vue-statusbar height (24px) */
+    --seekbar-height: calc(50px + 0.5em); /* timeline canvas + its top margin */
 }
 
 .blackbox-viewer-root a:hover {
@@ -51,8 +61,10 @@
         min-height: 52px;
     }
 
-    .graph-row {
-        top: 85px !important;
+    /* Phone landscape: shorter chrome — the graph gains the difference
+       automatically because .graph-row is placed via the variables. */
+    :root {
+        --toolbar-height: 64px;
     }
 }
 
@@ -91,10 +103,6 @@
     .video-top-controls .toolbar-panel {
         margin-inline-end: 2px;
     }
-
-    div.graph-row {
-        top: 115px !important;
-    }
 }
 
 /* With video */
@@ -450,9 +458,14 @@
 .blackbox-viewer-root.has-log .graph-row {
     display: flex;
     position: fixed;
-    top: calc(85px + var(--safe-area-inset-top));
+    /* Fill the space between the toolbar and the seek bar: the former
+       fixed gaps (85px/96px/115px) go to the graph instead. */
+    top: calc(var(--toolbar-height) + 6px + var(--safe-area-inset-top));
     width: calc(100% - 30px);
-    bottom: calc(96px + var(--safe-area-inset-bottom));
+    bottom: calc(
+        var(--statusbar-height) + var(--seekbar-height) + 0.5em +
+        var(--safe-area-inset-bottom)
+    );
 }
 
 .blackbox-viewer-root.has-video .log-graph {
@@ -568,7 +581,10 @@
 .blackbox-viewer-root.has-log .log-seek-bar {
     display: block;
     position: fixed;
-    bottom: var(--bottom-bar-clearance);
+    /* Stack directly on top of the 24px status bar. Previously the bottom
+       clearance was only 0.5em (8px), so the opaque status bar overlapped
+       and covered the bottom ~16px of the timeline canvas. */
+    bottom: calc(var(--statusbar-height) + var(--safe-area-inset-bottom));
     padding-inline-start: calc(15px + var(--safe-area-inset-left));
     padding-inline-end: calc(15px + var(--safe-area-inset-right));
 }
@@ -592,19 +608,25 @@
 
 .blackbox-viewer-root.has-video .video-top-controls,
 .blackbox-viewer-root.has-log .video-top-controls {
-    top: 0;
-    padding: 6px 0.75rem;
+    /* Anchored to the viewport edges — NO min-width. A fixed min-width
+       (1390px) rendered the bar wider than a phone viewport, pushing
+       everything from the ZOOM panel rightwards (including AppMenu) off
+       screen with no way to reach it. */
+    top: var(--safe-area-inset-top);
+    inset-inline-start: 0;
+    inset-inline-end: 0;
+    width: auto;
+    min-width: 0;
+    padding: 6px 15px;
     position: fixed;
     z-index: 10;
     background-color: var(--surface-0);
     border-bottom: 1px solid var(--border-color, #e5e5e5);
-    width: 100%;
-    min-width: 1390px;
     white-space: nowrap;
     display: flex;
     align-items: stretch;
     justify-content: flex-start;
-    min-height: 76px;
+    min-height: var(--toolbar-height);
 }
 
 .video-top-controls-scroll {
@@ -615,6 +637,15 @@
     overflow-x: auto;
     overflow-y: hidden;
     padding-inline-start: 12px;
+    scrollbar-width: thin;
+}
+
+/* Keep every panel at its natural width so this container actually
+   overflows (and scrolls) on narrow screens instead of squashing the
+   panels — this is what makes ZOOM and the panels after it reachable
+   on phones. */
+.video-top-controls-scroll > .toolbar-panel {
+    flex: none;
 }
 
 .video-top-controls .toolbar-panel--open {
diff --git a/src/blackbox-viewer/main.js b/src/blackbox-viewer/main.js
index f5f4899..a87a910 100644
--- a/src/blackbox-viewer/main.js
+++ b/src/blackbox-viewer/main.js
@@ -498,6 +498,13 @@ export function bootstrapViewer() {
         const onWindowResize = () => updateCanvasSize();
         window.addEventListener("resize", onWindowResize);
         cleanupFns.push(() => window.removeEventListener("resize", onWindowResize));
+        // Breakpoint / safe-area driven layout changes resize the graph box
+        // without firing a window resize event (e.g. crossing the phone
+        // media queries). Re-measure the canvases whenever the graph canvas
+        // box itself changes so the graph keeps filling its container.
+        const graphResizeObserver = new ResizeObserver(() => updateCanvasSize());
+        graphResizeObserver.observe(canvas);
+        cleanupFns.push(() => graphResizeObserver.disconnect());
 
         function toggleOverrideStatus(userSetting) {
             settingsStore.saveSetting(userSetting, !userSettings[userSetting]);
```

---

## 8. 적용 방법

```bash
# 방법 1 — 패치 파일로 일괄 적용 (권장)
cd blackbox2
git apply --check fix-layout.patch   # 적용 가능 여부 미리 확인
git apply fix-layout.patch

# 방법 2 — 직접 수정 시에는 위 DIFF를 파일별로 수동 반영
# 이후 웹 에셋 재빌드 + 안드로이드 동기화/빌드
npm run android:sync     # 또는 npm run android:run / android:release
```

- 웹 쪽(main.css/main.js) 수정은 Capacitor 웹 에셋 재빌드가 필요하고, 네이티브 쪽(MainActivity.java/build.gradle) 수정은 APK 재빌드가 필요합니다. `android:sync`/`android:run` 스크립트가 둘 다 처리합니다.

---

## 9. 검증 체크리스트

### 레이아웃 (A~E)
- [ ] 800×360dp(갤럭시 S류 가로) 에뮬레이터: ZOOM / 시간 / 워크스페이스 패널이 **가로 스와이프로 접근** 가능
- [ ] AppMenu(내보내기/설정) 버튼이 오른쪽 끝에 **항상** 표시됨
- [ ] 그래프가 툴바 바로 아래(6px 간격)부터 타임라인 바로 위까지 채워짐
- [ ] 타임라인 하단이 상태바에 가려지지 않음 (시크바가 상태바 위에 적층)
- [ ] 데스크톱 1280×800 이상: 기존과 거의 동일(그래프 +9px), 패널 눌림/줄바꿈 없음
- [ ] 데스크톱에서 창을 1390px 이하로 줄여도 툴바가 스크롤되고 패널이 찌그러지지 않음
- [ ] 로그 로드 → 화면 회전/브레이크포인트 통과 시 그래프 캔버스가 즉시 새 크기로 다시 그려짐

### 몰입 모드 (F)
- [ ] 앱 시작 시 시스템바 숨김(전체화면) 유지
- [ ] 화면 아래 가장자리에서 위로 스와이프 → 시스템바가 일시적으로 나타났다 **1~2초 후 자동 숨김**
- [ ] 시스템 파일 선택기로 로그 열고 복귀 → **자동으로 전체화면 복원**
- [ ] 키보드 입력 후 닫기 → 자동 재숨김
- [ ] 시스템바가 일시 표시되는 동안 타임라인/상태바가 시스템바에 가려지지 않음(위로 리프트)

## 10. 참고 — 이번 범위 밖의 알려진 이슈

- `.analyser .analyser-slider-x { inset-inline-start: 975px }` 등 애널라이저 오버레이 좌표는 px 고정값이라 폰 폭에서 넘칠 수 있습니다. 필요 시 별도 조정이 필요합니다.
- 스와이프로 시스템바가 일시 표시되는 짧은 순간 동안 하단 UI가 위로 살짝 올라왔다가 내려오는(리프트-복원) 미세한 움직임이 있을 수 있습니다. 이는 콘텐츠가 바에 가려지는 것을 막는 의도된 동작입니다.
