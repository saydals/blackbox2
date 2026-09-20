# fix.md — Android 전체화면 터치 컨트롤 추가 (3분할 탭 · 핀치 줌 · 드래그 이동)

> 대상 저장소: [`saydals/blackbox2`](https://github.com/saydals/blackbox2)
> 기준 커밋: `51d1402` ("Add legend value reserve to prevent float drop during playback")
> 수정 파일: `src/blackbox-viewer/main.js`, `src/blackbox-viewer/grapher.js`, `src/blackbox-viewer/css/main.css` (기존 3개) + `src/blackbox-viewer/touch_fullscreen_controls.js` (신규 1개)
> 동반 파일: `fullscreen-touch-controls.patch` (본 문서 4장의 DIFF와 동일 — 저장소 루트에서 `git apply fullscreen-touch-controls.patch` 로 바로 적용 가능)

---

## 0. 요약 — 증상 ↔ 원인 ↔ 수정 위치 매핑

| # | 증상 | 근본 원인 | 수정 위치 | 성격 |
|---|------|-----------|-----------|------|
| A | Android APK에서 그래프 좌상단 전체화면 아이콘으로 전체화면에 들어가면 재생/일시정지, 배속, 줌, 시크 바가 전부 사라져 그래프를 전혀 제어할 수 없다. 데스크톱은 키보드(Space·F·←/→·Shift+←/→)가 대신해 주지만 APK에는 키보드가 없어 대체 수단 자체가 없다 | 전체화면 토글(`graphStore.toggleFullscreen()`)이 루트에 `is-fullscreen` 클래스를 붙이면 `main.css` 가 ① 상단 툴바(재생·배속·줌·시간·싱크 패널) ② 하단 시크 바 ③ 상태 바를 모두 `display: none` 으로 제거한다. 이 설계는 "전체 화면 = 그래프만"이라는 의도대로 정확히 동작한 것이고, 빠진 것은 **터치라는 입력 채널에 대한 제어 계층**이다 | `touch_fullscreen_controls.js` 신설 + `main.js` 배선 — 전체화면 진입 중일 때만 캔버스에 제스처 계층을 얹는다 | 기능 결핍 (컨트롤 DOM 제거의 부작용) |
| B | 그래프 캔버스에서 두 손가락으로 확대/축소하려 하면 화면이 확대되지 않고 엉뚱한 시점으로 시크된다 | 기존 `grapher.js` 터치 핸들러는 `e.touches[0]` 한 점만 추적하며, `touchstart` 는 손가락마다 발화하므로 두 번째 손가락이 닿는 순간 `lastMouseX` 가 리셋된다. 핀치는 줌이 아니라 "갑자기 튄 시크"로 소비된다 | `touch_fullscreen_controls.js` — 2-터치 핀치를 별도 모드로 판정해 시크와 분리 | 제스처 충돌 |
| C | 캔버스에서 터치 제스처를 하면 때때로 WebView의 페이지 핀치 줌/스크롤이 같이 발동한다 | `#graphCanvas` 에 `touch-action` 지정이 없고, 기존 시크의 `touchmove` 리스너는 document 레벨이라 Chromium에서 passive 기본값으로 붙어 `preventDefault()` 가 무시된다 | `main.css` — `#graphCanvas { touch-action: none; }` | 브라우저 기본 동작 경합 |

**요구사항 (사용자 지시):**
1. **Android 조건 + 전체화면 조건**이 동시에 성립할 때만 터치로 비디오/그래프 영역을 컨트롤한다.
2. 그래프 영역을 **3등분**한다: **중앙 터치 = Play / Pause**, **왼쪽 터치 = 느리게 플레이**, **오른쪽 터치 = 빠르게 플레이**.
3. 전체 영역 **두 손가락 터치 드래그 = 확대/축소**.
4. 전체 영역 **한 손가락 드래그 = 그래프 이동**.

### 수정 후 동작 개요

```text
전체화면 (Android APK) 그래프 영역:

┌─────────────────────┬─────────────────────┬─────────────────────┐
│                     │                     │ [⤢]                 │
│    왼쪽 1/3 탭       │    중앙 1/3 탭       │    오른쪽 1/3 탭     │
│    느리게 재생(25%)  │   Play / Pause 토글  │    빠르게 재생(200%) │
│                     │                     │                     │
│  한 손가락 드래그    →   그래프 이동 (시간축 팬, 전 영역)              │
│  두 손가락 드래그    →   확대 / 축소 (시간 윈도우 줌, 전 영역)           │
└─────────────────────┴─────────────────────┴─────────────────────┘
     ※ 좌상단 [⤢] 전체화면 해제 버튼은 제스처와 무관하게 항상 동작
```

### 제스처 상태 머신

```text
                 터치 1개 시작                    슬로프(10px) 초과
   idle ────────────────────────► deciding ────────────────────────► pan
     ▲                              │      350ms 이내 손 뗌             │
     │                              │      └──────────► 탭(존 판정)     │
     │        터치 2개               ▼                                  │
     ├──────────────────────────── pinch ◄────────────────────────────┤
     │                 두 손가락 거리 비율 → 줌                          │
     │    손가락 1개만 남으면 → deciding 으로 복귀                       │
     └────────────────── 모든 손가락 뗌 / touchcancel ──────────────────┘
```

---

## 1. 재현 조건과 증상

### 1.1 재현 조건

1. Android APK(`com.rotorflight.blackboxviewer`, Capacitor 8 빌드)에서 `.bbl` 로그를 연다.
2. 그래프 영역 **좌상단의 전체화면 아이콘**(`.graph-fullscreen-toggle`, `i-lucide-maximize-2`)을 탭한다. `graphStore.toggleFullscreen()` 이 호출되고 루트 엘리먼트에 `is-fullscreen` 클래스가 부여된다.
3. 이 상태에서 그래프(비디오) 영역을 조작하려 한다.

### 1.2 증상 (수정 전)

전체화면 진입 순간 다음 표의 모든 제어 수단이 사라진다:

| 제어 수단 | 일반 모드 | 전체화면 | 제거 주체 |
|-----------|-----------|----------|-----------|
| 툴바 재생/일시정지 버튼 (`PlaybackControls`) | 있음 | **소실** | `.video-top-controls` → `display: none` |
| 배속 패널 (`SpeedPanel`, 10~200%) | 있음 | **소실** | 同上 |
| 줌 패널 (`ZoomPanel`) · 시간 패널 | 있음 | **소실** | 同上 |
| 하단 타임라인 (시크 바) | 있음 | **소실** | `.log-seek-bar` → `display: none` |
| 상태 바 (북마크/루프 정보) | 있음 | **소실** | `.vue-statusbar` → `display: none` |
| 키보드: Space(재생/정지), ←/→(점프), Shift+←/→(줌), F(전체화면), Esc(해제) | 데스크톱에서 유효 | **APK에 키보드가 없어 무용지물** | 하드웨어 제약 |
| 마우스 휠 (점프/Alt+휠 줌) | 데스크톱에서 유효 | **APK에 휠이 없어 무용지물** | 하드웨어 제약 |
| 좌상단 전체화면 해제 버튼 | — | 유일하게 남음 | `.graph-fullscreen-toggle` (z-index 6) |
| 캔버스 한 손가락 드래그 | 시크로 동작 | 시크로 동작 (유일한 조작) | `grapher.js` `onTouchStart`/`onTouchMove` |

즉 **전체화면 = 재생 자체를 걸거나 멈출 방법이 없는 상태**가 된다. 데스크톱 전체화면은 `keyboard_handler.js` 의 단축키가 컨트롤 소실을 보완하는 숨은 계층이지만, APK에는 그 계층이 존재하지 않는다.

기존 캔버스 터치(`grapher.js` 100~144행)에는 구조적 결함이 세 가지 있다:

1. **탭 개념 부재** — 손을 뗐을 때를 판정하는 로직이 없다. 터치는 움직임(드래그 시크)으로만 해석되므로, "여기를 터치하면 재생" 같은 동작을 담을 자리가 없다.
2. **핀치가 시크로 파손** — `touchstart` 는 손가락마다 발화한다. 두 번째 손가락이 닿는 순간 `lastMouseX = e.touches[0].pageX` 가 다시 실행되어 기준점이 튄다. 게다가 `onTouchMove` 는 `e.touches[0]` 한 점만 읽으므로 두 손가락의 거리 변화(줌 의도)는 전혀 추적되지 않고, 첫 손가락의 흔들림만 시크로 변환된다.
3. **WebView 기본 제스처와 경합** — `#graphCanvas` 에 `touch-action` 이 없어, 브라우저는 같은 터치를 페이지 핀치 줌/스크롤 후보로도 취급할 수 있다. 기존 시크의 `touchmove` 리스너는 `document.addEventListener("touchmove", onTouchMove)` 로 document 레벨에 붙는데, Chromium은 document 레벨 터치 리스너를 **passive 기본값**으로 등록하므로 내부의 `e.preventDefault()` 가 실제로는 무시된다(콘솔에 경고만 남는다). 캔버스 레벨 `touchstart` 의 `preventDefault()` 가 제스처 전체의 기본 동작을 막아주고는 있지만, 이는 구현 세부에 의존하는 우연한 방어다.

### 1.3 수정 후 목표 상태

`isAndroid() && graphStore.isFullscreen && 로그 로드됨` 조건이 성립하는 동안만:

- 탭: 왼쪽 1/3 → 25% 배속으로 재생, 중앙 1/3 → 재생/일시정지 토글, 오른쪽 1/3 → 200% 배속으로 재생.
- 한 손가락 드래그: 그래프 이동(데스크톱 마우스 드래그와 동일한 시크 경로, 동일 감각).
- 두 손가락 드래그: 손가락 벌어짐 비율 그대로 시간 윈도우 확대/축소(1:1).
- 조건이 깨지는 즉시(전체화면 해제) 기존 동작이 그대로 복원된다. 그 외 모든 호스트(데스크톱 브라우저, Android 웹 브라우저, iOS)는 수정 전과 1바이트도 다르게 동작하지 않는다.

"비디오 영역 컨트롤"은 별도 경로가 아니라 기존 동기 파이프라인이 자동으로 해결한다 — 재생/일시정지는 `setGraphState()` 가 `videoElement.play()/pause()` 를 겸하고, 배속 변경은 `setPlaybackRate()` 가 `videoElement.playbackRate` 를 견인한다(§3.3). 그래프 캔버스는 비디오 위를 덮는 입력 표면이므로(`has-video` 에서 `#graphCanvas` 배경이 투명), 비디오 위 탭도 동일한 캔버스 제스처로 받는다.

---

## 2. 원인 분석

### 2.1 전체화면 = 컨트롤 DOM 제거 체인

전체화면 토글의 전체 체인은 다음과 같다. 어디에도 "컨트롤을 숨겼으므로 다른 입력을 제공한다"는 단계가 없다:

```text
[좌상단 아이콘 탭 / F 키]
  → graphStore.toggleFullscreen()                     (stores/graph.js 173행)
  → isFullscreen = !isFullscreen
  → App.vue watchEffect: 루트에 "is-fullscreen" 클래스 부여
  → main.css 577~592행:
      .is-fullscreen.has-log .video-top-controls { display: none }  ← 재생·배속·줌·시간·싱크
      .is-fullscreen.has-log .log-seek-bar       { display: none }  ← 타임라인
      .is-fullscreen.has-log .vue-statusbar      { display: none }  ← 상태 바
  → main.css 594~607행: .graph-row 가 제거된 세 영역의 높이를 흡수 (그래프 최대화)
```

이 설계 자체는 정확하다. 원본 Blackbox Explorer 계열은 "전체 화면 = 그래프만"이며, 데스크톱에서는 `keyboard_handler.js` 의 단축키 계층(Space·화살표·F·Esc)이 컨트롤 소실을 보완한다. 즉 증상의 본질은 "컨트롤을 숨긴 것"이 아니라, **키보드라는 보완 계층이 없는 호스트(Android)에 대한 대체 입력 계층이 정의되어 있지 않은 것**이다. 이 구분이 중요한 이유는 해결 방향을 결정하기 때문이다 — 숨긴 컨트롤을 되살리는(CSS로 툴바를 되살린다든가) 것이 정답이 아니라, 키보드 계층과 대등한 **터치 제스처 계층**을 새로 정의하는 것이 정답이다.

### 2.2 입력 채널 매트릭스 — 무엇이 남는가

| 입력 채널 | 데스크톱 브라우저 | Android APK |
|-----------|-------------------|-------------|
| 키보드 (`keyboard_handler.js`) | ✅ | ❌ 하드웨어 부재 |
| 마우스 휠 (`main.js onDocumentWheel`) | ✅ | ❌ 부재 |
| 툴바/시크바 클릭 | ✅ | 전체화면에서 DOM 제거 |
| 마우스 드래그 시크 (`grapher.js onMouseDown`) | ✅ | (마우스 없음) |
| **터치** (`grapher.js onTouchStart`) | (터치스크린 노트북만) | ✅ **유일하게 남은 채널** |

유일하게 남은 터치 채널이 §1.2 의 세 결함(탭 부재, 핀치 파손, 기본 제스처 경합)을 안고 있으므로, 이 채널을 제대로 된 제어 계층으로 승격시키는 것이 수정의 전부다.

### 2.3 기존 터치 시크 코드의 구조

`grapher.js` 의 기존 터치 처리(수정 전):

```js
function onTouchStart(e) {
    if (e.touches && e.touches.length > 0) {
        lastMouseX = e.touches[0].pageX;                    // ← 손가락마다 발화: 핀치 시 기준점 튐
        document.addEventListener("touchmove", onTouchMove); // ← document 레벨 = passive 기본값
        function onTouchEnd() { /* ... */ }
        document.addEventListener("touchend", onTouchEnd);
        e.preventDefault();
    }
}

const onTouchMove = (e) => {
    e.preventDefault();
    if (this.onSeek) {
        this.onSeek(((lastMouseX - e.touches[0].pageX) / canvas.width) * windowWidthMicros); // ← touches[0] 고정
    }
    lastMouseX = e.touches[0].pageX;
};
```

이 핸들러의 시크 공식 자체는 훌륭하다 — 캔버스 폭 대비 드래그 비율을 현재 시간 윈도우(`windowWidthMicros`)에 매핑하고, `main.js` 의 `graph.onSeek`(182~192행)가 ×2 "seek faster" 계수를 곱한 뒤 비디오/로그에 맞는 실제 시크를 수행한다. **드래그로 그래프를 이동시킨다**는 요구사항(4번)은 이 경로를 그대로 계승하면 된다. 문제는 이 한 핸들러가 (a) 탭/드래그/핀치를 구분하지 못하고 (b) 단일 손가락만 모델링한다는 점이므로, 교체가 아니라 **제스처 상태 머신 뒤로 흡수**하는 것이 맞다.

### 2.4 왜 `preventDefault()` 만으로 부족하고 `touch-action: none` 이 필요한가

Chromium(51 이후)은 성능을 위해 `window`, `document`, `body` 레벨의 `touchstart`/`touchmove` 리스너를 **passive 기본값**으로 등록한다. passive 리스너 안의 `preventDefault()` 는 무시되며 "Unable to preventDefault inside passive event listener" 경고만 남는다. 기존 시크가 그럼에도 스크롤 없이 동작한 것은, 캔버스 레벨(비-passive) `touchstart` 의 `preventDefault()` 가 "이 터치 시퀀스의 기본 동작 전부를 취소"하기 때문이다. 그러나 이것은 (1) 구현 디테일에 의존하고 (2) 새 제스처 계층처럼 리스너 구성이 바뀌는 순간 깨지기 쉬운 우연한 방어다.

CSS `touch-action: none` 은 이보다 강하고 선언적이다 — **캔버스에서 시작한 터치에 대해서는 브라우저가 스크롤·핀치 페이지 줌·더블탭 줌 등 어떤 기본 제스처도 컴포지터 단계부터 개입하지 않는다**. 제스처 의도 해석을 완전히 앱에 위임하는 선언이므로, 리스너가 passive냐 아니냐와 무관하게 성립한다.

반면 **viewport meta에 `user-scalable=no` 를 넣는 방법은 채택하지 않았다.** 그 한 줄로 페이지 전체의 확대가 금지되는데, 이는 (1) 저시력 사용자의 접근성을 해치고 (2) 이 파일 하나가 웹(PWA/GitHub Pages)·Tauri·Capacitor 세 호스트를 공유하는 구조에서 "전체화면 그래프에서만 필요한 제약"을 전역으로 흘려보내는 것이다. `touch-action` 은 정확히 필요한 엘리먼트(`#graphCanvas`)에만 국한된다.

### 2.5 왜 "Android + 전체화면" 조건인가

- **전체화면에서만**: 일반 모드에서는 툴바·시크바가 살아 있다. 거기에 존 탭(좌/중/우)을 얹으면 캔버스 드래그 시크와 기존 UX가 충돌하고, 같은 동작이 두 경로(툴바 버튼 vs 탭)로 중복 노출된다. 요구사항도 명시적으로 "전체화면 조건"을 전제한다.
- **Android에서만**: 데스크톱은 키보드 계층이 이미 존재하고(§2.1), 터치스크린 노트북의 데스크톱 전체화면에서 제스처가 발동하면 기존 드래그 시크와 이중으로 경합한다. 요구사항의 "안드로이드 APK"는 Capacitor 네이티브 빌드를 지칭하므로 판정은 `checkCompatibility.js` 의 기존 `isAndroid()`(`Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"`)를 재사용한다 — Android **웹 브라우저**(PWA 포함)는 제외된다. 거기서는 전체화면을 해제하면 툴바가 돌아오므로 APK와 동일한 결핍이 아니고, 기존 동작 보존이 우선이다.
- **iOS는 범위 외**: 동일 결핍이 존재하지만 요구사항이 Android 한정이므로 확장 지점으로만 남긴다(§3.8 조건식에 `isIOS()` 를 OR 하는 것으로 확장 가능).

---

## 3. 해결 방법

### 3.1 아키텍처 — "제스처 인식"과 "동작 실행"의 분리

새 모듈 `touch_fullscreen_controls.js` 는 **터치 이벤트를 의미 있는 제스처로 번역하는 일만** 하고, 번역 결과(탭 존·핀치 배율·팬 오프셋)를 콜백으로 넘긴다. 실제 동작은 `main.js` 가 기존 파이프라인으로 수행한다:

```text
                    touch_fullscreen_controls.js                기존 파이프라인 (전부 main.js 범위)
        ┌─────────── 인식: 탭 존 / 팬 오프셋 / 핀치 배율 ───────────┐
캔버스 ─┤  onSlowPlay  ─→  setPlaybackRate(25) + setGraphState(PLAY) ─→ videoElement.playbackRate·play()
터치    │  onPlayPause ─→  logPlayPause()                             ← Space 키와 동일 함수
        │  onFastPlay  ─→  setPlaybackRate(200) + setGraphState(PLAY)
        │  onGraphSeek ─→  graph.onSeek(offset)                       ← 마우스 드래그 시크와 동일 경로
        └  onZoom      ─→  setGraphZoom(zoom)                         ← Alt+휠/Shift+화살표와 동일 경로
```

이 분리의 이점: (1) 배속·줌·시크·비디오 동기가 숨겨진 툴바 버튼과 **정확히 같은 함수**를 타므로 상태(store) 불일치가 원천적으로 없고, (2) 모듈은 DOM도 store 변경도 하지 않아 테스트·철수(teardown)가 단순하며, (3) 미래에 iOS를 켜거나 존 배율을 바꿀 때 만지는 곳이 한 곳이다.

### 3.2 제스처 상태 머신 — 탭/드래그/핀치의 판정

상태는 `idle → deciding → (tap | pan)` 와 `deciding|pan → pinch` 의 조합이다. 핵심 파라미터 두 개:

| 파라미터 | 값 | 근거 |
|----------|-----|------|
| `TAP_SLOP_PX` | 10px | Android 플랫폼 표준 터치 슬로프(`ViewConfiguration` 기준 8px, 밀도 편차 감안 +2px). 이 이상 움직이면 탭이 아니라 드래그로 재분류한다 |
| `TAP_MAX_MS` | 350ms | 일반적인 tap timeout(약 300ms)에 여유. 그보다 오래 누르고 뗀 것은 탭으로 인정하지 않음(장시간 홀드 = 무동작, 오조작 방지) |

- **탭 판정**: `deciding` 상태에서 슬로프·시간 예산 안에 모든 손가락이 떼어지면 탭. 존 판정은 `changedTouches[0].clientX` 를 캔버스 `getBoundingClientRect()` 로 CSS 픽셀 환산해 `x < 1/3` 좌, `< 2/3` 중앙, 나머지 우측(§3.3). 위치 기준을 **손을 뗀 순간**으로 잡은 것은, 탭인지 드래그인지는 뗌 이벤트까지 봐야 확정되기 때문이다.
- **드래그(팬) 판정**: `deciding` 중 이동량이 슬로프를 넘으면 `pan` 전환. 전환 시점에 `lastX` 를 현재 위치로 **리베이스**한다 — 판정에 쓴 지터(최대 10px)를 시크 오프셋에 합산하면 탭 직전의 미세 시크가 발생하기 때문이다. 이후 매 `touchmove` 마다 §2.3 의 공식 그대로 `onGraphSeek(((lastX - x) / canvas.width) * windowWidthMicros)` 를 호출한다(×2 계수는 `graph.onSeek` 내부에 이미 있다 — 이중 곱셈 없음).
- **핀치 판정**: 두 번째 손가락 `touchstart` 시 `pinch` 전환. 시작 거리 `pinchStartDist` 와 시작 줌 `pinchStartZoom`(store의 `graphZoom`, 백분율)을 기록하고, 이후 `dist / pinchStartDist` 비율을 줌에 곱한다. 손가락이 2배 벌어지면 시간 윈도우가 2배 확대(줌 ×2) — **화면 지각률 1:1**. 손가락 하나를 떼면 남은 손가락으로 `deciding` 을 재시작해 "핀치 직후 탭/드래그"가 자연스럽게 이어진다.
- **3손가락 이상**: `idle` 로 강등해 오작동을 차단한다.
- 모든 핸들러는 `{ passive: false }` 로 등록하고 `preventDefault()` 하며, 여기에 §3.7 의 `touch-action: none` 이 더해져 WebView 기본 제스처와는 완전히 단절된다.

### 3.3 3분할 존과 배속 프리셋 — 25% / 200% 의 근거

존 경계는 캔버스 폭의 1/3·2/3이고 세로 전체가 존이다. 탭 타깃 최소 폭은 320px 뷰포트에서도 약 106px — WCAG 2.5.5(권장 44px)·2.5.8(최소 24px)을 여유 있게 충족한다. "전체 영역 드래그 = 이동/줌"은 존과 독립적으로 동작하므로(탭이 아니면 어디서든 제스처) 존 경계 근처 오조작의 불안은 없다.

배속 프리셋은 `SpeedPanel.vue` 의 `STEPS = [10, 25, 50, 75, 100, 150, 200]` 와 정렬했다:

| 프리셋 | 값 | 근거 |
|--------|-----|------|
| 느리게(좌측 탭) | **25%** | STEPS 최하단 10%는 루프 8kHz 로그에서 사실상 슬라이드쇼라 "플레이"로 쓰기 어렵다. 스텝상 두 번째인 25%가 "느리게 보기"의 최저 실용 속도다. store의 하한 `PLAYBACK_MIN_RATE`(10)와도 일관 |
| 빠르게(우측 탭) | **200%** | STEPS의 최고 스텝. store 상한 `PLAYBACK_MAX_RATE`(300)까지 열면 UI에서 도달할 수 없는 값을 만들어 상태가 어긋나므로 UI 스텝 최고값에 맞춘다 |

탭 시 동작: `setPlaybackRate(프리셋)` 후 **PAUSED 상태면 `setGraphState(GRAPH_STATE_PLAY)` 로 재생을 시작**한다. "느리게 플레이/빠르게 플레이"가 속도 *변경*이 아니라 *재생 지시*를 포함하기 때문이다. 이미 재생 중이면 배속만 바뀐다(연속 탭 = 배속 유지, 예측 가능). 중앙 탭은 `logPlayPause()` — Space 키·툴바 버튼과 완전히 동일한 함수다.

### 3.4 핀치 줌의 앵커 — 왜 커서가 중심에 고정되는가

`grapher.js render()`(872~875행)는 윈도우를 항상 현재 시간 커서 중심으로 둔다:

```js
windowCenterTime = windowCenterTimeMicros;      // 커서 = 윈도우 중심
windowStartTime = windowCenterTime - windowWidthMicros / 2;
```

따라서 줌(`windowWidthMicros` 변경)은 별도의 앵커 보정 없이 **항상 커서(화면 중앙)를 중심**으로 일어난다. 핀치 중점을 앵커로 쓰는 지도 앱류와 다르게, 이 뷰어의 시맨틱에서는 "지금 비행 중인 시점을 중심으로 시간 해상도를 바꾼다"가 옳다 — PID 튜닝에서 줌의 목적은 특정 순간의 파형을 세밀히 보는 것이고 그 순간은 커서에 있다. 배율 클램프는 store의 `GRAPH_MIN_ZOOM`(1)~`GRAPH_MAX_ZOOM`(1000) 경계를 모듈과 `setGraphZoom` 양쪽에서 이중으로 적용하고, `Math.round` 로 백분율 정수를 유지한다(ZoomPanel 표시 정합).

### 3.5 grapher.js 의 손댐 최소화 — `touchSeekEnabled` 플래그

기존 터치 시크를 지우는 대신, 인스턴스 플래그 하나로 겸직을 전환한다:

```js
this.touchSeekEnabled = true;          // 신설 (기본값 = 기존 동작)

const onTouchStart = (e) => {
    if (!this.touchSeekEnabled) {
        return;                        // 전체화면 제스처 계층이 캔버스를 소유
    }
    /* ...기존 코드 1바이트도 불변... */
};
```

- **리스너 remove/재-add가 아닌 플래그인 이유**: 리스너는 `FlightLogGrapher` 생성 시 한 번만 부착되고 `destroy()` 에서 해제된다. 전체화면 토글마다 리스너를 붙였다 뗐다 하면 (a) 부착 순서가 뒤섞여 제스처 계층과의 경합이 상태에 따라 달라지고 (b) 실패 지점이 늘어난다. 플래그는 동기화 원자성이 명확하다.
- **`function onTouchStart` → `const onTouchStart = (e) =>` 전환**: 가드가 `this.touchSeekEnabled` 를 읽는데, `addEventListener` 는 일반 함수의 `this` 를 캔버스 엘리먼트에 바인딩한다. 이는 인스턴스가 아니므로 가드가 항상 발동하는 버그가 된다. 화살표 함수로 렉시컬 `this`(그래퍼 인스턴스)를 유지한다 — 같은 파일의 `onMouseMove`/`onTouchMove` 가 이미 화살표 함수이므로 스타일 정합도 맞다.
- 기본값이 `true` 이므로 **main.js 의 배선이 없는 호스트에서는 동작이 완전히 불변**이다.

### 3.6 조건 평가의 삼중 방어 — 왜 세 곳에서 동기화하는가

"Android + 전체화면 + 로그"의 성립은 시간순서에 따라 세 경로로 도달한다:

| 경로 | 시나리오 | 담당 |
|------|----------|------|
| ① 매 터치 이벤트 | 언제나 — 조건이 깨진 뒤 들어오는 잔여 이벤트 차단 | 모듈 `active()`: `graphStore.isFullscreen && logStore.hasLog && graphStore.graph != null` |
| ② 전체화면 토글 watch | 로그 로드 후 전체화면 진입/해제 | `watch(() => graphStore.isFullscreen, ...)` → `graph.touchSeekEnabled = !fullscreen` |
| ③ 로그 생성 시점 | **전체화면 켠 상태에서 로그를 나중에 연다** — ②는 토글에만 반응하므로 이 경로를 놓치면 새 그래퍼가 기본값(`touchSeekEnabled = true`)으로 살아나 제스처 계층과 이중 제어 | `selectLog()` 내 `graph.touchSeekEnabled = !(graphStore.isFullscreen && isAndroid())` |

③이 없으면 "전체화면 → 로그 열기" 순서에서만 재현되는 이중 시크 버그가 생긴다. 세 경로가 모두 같은 단일 진실(`graphStore.isFullscreen`)을 읽으므로 상태 충돌은 불가능하다. 모듈 부착 자체는 `if (isAndroid())` 로 부트 시 1회 — Capacitor 판정은 세션 내 불변이므로 동적 재평가가 불필요하다.

### 3.7 CSS — `touch-action: none` 의 정확한 범위

`#graphCanvas` 에만 적용한다(§2.4). 캔버스는 `.log-graph` 를 100% 덮으므로 "전체 영역" 요구를 그대로 충족하고, Legend 패널은 `.graph-row` 의 **형제 엘리먼트**라 터치 동작(항목 탭·숨기기·드래그 순서 변경)이 전혀 영향받지 않는다. 좌상단 전체화면 버튼은 `z-index: 6` 으로 캔버스 위에 있어 탭이 버튼으로 향하고 캔버스 리스너는 발화하지 않는다 — 전체화면 해제 경로가 제스처와 무관하게 보존된다.

### 3.8 사용자 피드백 — `mouseNotification` 재사용

- 전체화면 진입 시(Android+로그 있음) 2.5초간: `Touch · left: slow · center: play/pause · right: fast` / `Pinch: zoom · drag: pan` — 제스처는 발견 가능성(discoverability)이 낮은 UI이므로 진입 순간 1회 힌트를 제공.
- 존 탭으로 배속이 바뀔 때 1초간: `25 % · slow` / `200 % · fast` — 숨겨진 SpeedPanel 값의 변화를 보이게 한다.

둘 다 기존 `mouseNotification.show(..., "bottom-right", 0)` 패턴(`main.js applyPenChange`)을 그대로 쓰며, 알림 엘리먼트 `#mouseNotification` 은 `.graph-row` 안에 이미 존재한다. 새 DOM/의존성 없음.

### 3.9 부작용 검토 (전부 확인 완료)

| 항목 | 영향 | 이유 |
|------|------|------|
| 데스크톱 마우스 드래그 시크 | **무변화** | `onMouseDown`/`onMouseMove` 미수정. 플래그는 터치 경로만 검사 |
| 데스크톱/노트북 터치스크린 (웹) | 무변화 | `isAndroid()`(Capacitor 네이티브 한정) false → 제스처 계층 미부착, `touchSeekEnabled` 항상 true → 기존 터치 시크 유지 |
| Android 웹 브라우저 / PWA | 무변화 | 同上 — APK가 아니므로 제스처 계층 없음, 전체화면은 여전히 해제 버튼만 가능(기존과 동일) |
| iOS Capacitor | 무변화(범위 외) | `isAndroid()` false. 확장은 §3.6 조건식에 `isIOS()` OR |
| `#graphCanvas { touch-action: none }` 의 웹 브라우저 영향 | 스크롤 무관 | 뷰어 레이아웃은 fixed 포지셔닝이라 캔버스에서 시작하는 페이지 스크롤이 원래 없음. Legend 등 타 엘리먼트는 별도 요소라 무영향 |
| Legend 패널 조작 | 무변화 | 제스처 대상은 `#graphCanvas` 한정. Legend는 형제 엘리먼트 |
| Analyser/Stick/지도 오버레이 | 기존과 동일한 한계 | 오버레이 캔버스(`#analyserCanvas` 등)가 표시 중이면 그 위의 터치는 캔버스가 받지 못한다 — 기존 드래그 시크와 동일한 한계로, 회귀 아님 |
| 전체화면 해제 버튼 | 무변화 | z-index 6 버튼이 터치를 선점 — 캔버스 제스처 미발화 |
| 비디오 동기 | 오히려 정합 | 재생/배속이 `setGraphState`/`setPlaybackRate` 경유 → `videoElement.play()/pause()/playbackRate` 자동 반영. 시크는 `graph.onSeek` → `setVideoTime` 경유 |
| 비디오 익스포트 | 무영향 | 익스포트 중 `isExportInProgress()` 면 키보드 계층이 차단되지만, 제스처는 캔버스 터치라 별개. 익스포트는 전체화면 해제 후 툴바에서 걸므로 실질 경합 없음 |
| 키보드 단축키 | 무변화 | `keyboard_handler.js` 미수정. Space/화살표/F/Esc 그대로 |
| 멀티 로그 전환 (`selectLog`) | 안전 | 새 그래퍼마다 ③ 경로로 플래그 재설정. 구 그래퍼는 `destroy()` 로 리스너 해제, 제스처 계층 리스너는 캔버스 소유라 그대로 유효 |
| 테마/다크 모드 | 무영향 | 신설 CSS는 `touch-action` 한 줄 — 색상·레이아웃 불변 |

### 3.10 파라미터 튜닝 가이드

| 값 | 위치 | 바꾸면 |
|----|------|--------|
| `TOUCH_SLOW_RATE` / `TOUCH_FAST_RATE` | `touch_fullscreen_controls.js` 상단 | 좌/우 탭 배속. SpeedPanel STEPS 멤버 범위 내 권장 (10~200) |
| `TAP_SLOP_PX` / `TAP_MAX_MS` | 同上 | 탭 판정 민감도. 진동 많은 환경(헬기 현장)에서는 12~14px로 완화 |
| 존 경계 (1/3·2/3) | `onTouchEnd` 의 `x < 1/3` 비교 | 좌우 존을 넓히려면 0.4/0.6 등 |

---

## 4. DIFF

`git apply fullscreen-touch-controls.patch` (저장소 루트에서) 또는 수동 적용:

### 4.1 `src/blackbox-viewer/css/main.css` — WebView 기본 제스처 차단

```diff
diff --git a/src/blackbox-viewer/css/main.css b/src/blackbox-viewer/css/main.css
index 7ed85a2..1b7be63 100644
--- a/src/blackbox-viewer/css/main.css
+++ b/src/blackbox-viewer/css/main.css
@@ -286,6 +286,15 @@
     width: 100%;
     height: 100%;
     background-color: var(--graph-background);
+    /* Fullscreen touch gestures (Android): the canvas runs its own pan and
+       pinch handlers (touch_fullscreen_controls.js), so the WebView must
+       never reinterpret those touches as page scroll or page pinch-zoom.
+       touch-action: none blocks every default touch behavior for touches
+       that BEGIN on the canvas — preventDefault() alone cannot guarantee
+       that, because a document-level touchmove listener (e.g. grapher.js's
+       legacy drag-seek capture) is passive-by-default on Chromium. The
+       Legend panel is a separate element and keeps its own touch behavior. */
+    touch-action: none;
 }
 
 #craftCanvas,
```

### 4.2 `src/blackbox-viewer/grapher.js` — 터치 시크 겸직 플래그

```diff
diff --git a/src/blackbox-viewer/grapher.js b/src/blackbox-viewer/grapher.js
index bef36a5..e98df05 100644
--- a/src/blackbox-viewer/grapher.js
+++ b/src/blackbox-viewer/grapher.js
@@ -82,6 +82,14 @@ export function FlightLogGrapher(flightLog, graphConfig, canvas, stickCanvas, cr
         watermarkLogo; /* Watermark feature */
     this.onSeek = null;
 
+    /* When false, the built-in single-finger drag-to-seek below stands down.
+     * main.js disables it for the Android+fullscreen combination, where the
+     * fullscreen touch gesture layer (touch_fullscreen_controls.js) must be
+     * the only touch handler on the canvas — otherwise the grapher would seek
+     * on every pan and its touchstart would reset lastMouseX under the pinch.
+     * Every other host (desktop mouse/touchscreen) keeps the legacy behavior. */
+    this.touchSeekEnabled = true;
+
     this.getAnalyser = function () {
         return analyser;
     };
@@ -126,7 +134,12 @@ export function FlightLogGrapher(flightLog, graphConfig, canvas, stickCanvas, cr
         }
     }
 
-    function onTouchStart(e) {
+    // Arrow function on purpose: the guard reads `this.touchSeekEnabled`, and
+    // addEventListener would otherwise bind `this` to the canvas element.
+    const onTouchStart = (e) => {
+        if (!this.touchSeekEnabled) {
+            return; // the fullscreen touch gesture layer owns the canvas
+        }
         if (e.touches && e.touches.length > 0) {
             lastMouseX = e.touches[0].pageX;
 
@@ -141,7 +154,7 @@ export function FlightLogGrapher(flightLog, graphConfig, canvas, stickCanvas, cr
 
             e.preventDefault();
         }
-    }
+    };
 
     function identifyFields() {
         let motorGraphColorIndex = 0,
```

### 4.3 `src/blackbox-viewer/main.js` — 제스처 계층 배선

```diff
diff --git a/src/blackbox-viewer/main.js b/src/blackbox-viewer/main.js
index a87a910..f4c08ec 100644
--- a/src/blackbox-viewer/main.js
+++ b/src/blackbox-viewer/main.js
@@ -10,6 +10,12 @@ import { FlightLog } from "./flightlog.js";
 import { stringTimetoMsec, validate, mouseNotification } from "./tools.js";
 import { restorePenDefaults, changePenSmoothing, changePenZoom, changePenExpo } from "./pen_adjustment.js";
 import { createKeydownHandler, createDropdownSpaceGuard } from "./keyboard_handler.js";
+import {
+    attachFullscreenTouchControls,
+    TOUCH_SLOW_RATE,
+    TOUCH_FAST_RATE,
+} from "./touch_fullscreen_controls.js";
+import { isAndroid } from "@/js/utils/checkCompatibility.js";
 import { upgradeWorkspaceFormat, saveWorkspaces, loadWorkspaces } from "./workspace_io.js";
 import { exportCsv, exportGpx, exportSpectrumToCsv } from "./export_utils.js";
 import { cancelActiveVideoExport } from "./video_export.js";
@@ -52,7 +58,7 @@ import { ThemeColors } from "./theme_colors.js";
 import { pinia } from "@/js/pinia_instance.js";
 import { useLogStore } from "./stores/log.js";
 import { useGraphStore } from "./stores/graph.js";
-import { usePlaybackStore, GRAPH_STATE_PAUSED } from "./stores/playback.js";
+import { usePlaybackStore, GRAPH_STATE_PAUSED, GRAPH_STATE_PLAY } from "./stores/playback.js";
 import { useWorkspaceStore } from "./stores/workspace.js";
 import { useAppStore } from "./stores/app.js";
 import { useSettingsStore } from "./stores/settings.js";
@@ -173,6 +179,10 @@ export function bootstrapViewer() {
             userSettings,
         );
         graphStore.graph = graph;
+        // A log opened while Android fullscreen is already on must hand touch
+        // control straight to the fullscreen gesture layer — the watch below
+        // only runs on toggle, not on graph (re)creation.
+        graph.touchSeekEnabled = !(graphStore.isFullscreen && isAndroid());
 
         setVideoInTime(false);
         setVideoOutTime(false);
@@ -817,6 +827,74 @@ export function bootstrapViewer() {
         }
     };
 
+    // --- Android fullscreen touch controls ----------------------------------
+    // In graph-only fullscreen the toolbar, the seek bar and the status bar
+    // are hidden (the .is-fullscreen rules in main.css) and an Android APK has
+    // no keyboard, so play/pause, rate and zoom become unreachable. Attach the
+    // touch gesture layer (3-zone tap / pinch zoom / drag pan) for
+    // Capacitor-Android builds; every other host — including Android web
+    // browsers — keeps the legacy single-finger drag-to-seek only.
+    if (isAndroid()) {
+        const showTouchNote = (message, delay) => {
+            mouseNotification.show(
+                document.getElementById("log-graph"),
+                null,
+                null,
+                message,
+                delay,
+                null,
+                "bottom-right",
+                0,
+            );
+        };
+
+        const destroyFullscreenTouchControls = attachFullscreenTouchControls({
+            canvas,
+            graphStore,
+            logStore,
+            actions: {
+                // Drag pan reuses the grapher's seek path (offset in micros,
+                // ×2 "seek faster" factor included) so the touch drag feels
+                // identical to the desktop mouse drag.
+                onGraphSeek: (offset) => graph?.onSeek?.(offset),
+                onPlayPause: () => logPlayPause(),
+                onSlowPlay: () => {
+                    setPlaybackRate(TOUCH_SLOW_RATE);
+                    setGraphState(GRAPH_STATE_PLAY);
+                    showTouchNote(`${TOUCH_SLOW_RATE} % · slow`, 1000);
+                },
+                onFastPlay: () => {
+                    setPlaybackRate(TOUCH_FAST_RATE);
+                    setGraphState(GRAPH_STATE_PLAY);
+                    showTouchNote(`${TOUCH_FAST_RATE} % · fast`, 1000);
+                },
+                // playback_controls.setGraphZoom clamps to [1, 1000], syncs
+                // the store, the grapher window and invalidates the graph.
+                onZoom: (zoom) => setGraphZoom(Math.round(zoom)),
+            },
+        });
+        cleanupFns.push(destroyFullscreenTouchControls);
+
+        // Hand the canvas over to the gesture layer exactly while Android
+        // fullscreen is on; restore the legacy touchseek on exit. Logs opened
+        // while fullscreen is already on are handled in selectLog.
+        const stopFullscreenTouchWatch = watch(
+            () => graphStore.isFullscreen,
+            (fullscreen) => {
+                if (graph) {
+                    graph.touchSeekEnabled = !fullscreen;
+                }
+                if (fullscreen && logStore.hasLog) {
+                    showTouchNote(
+                        "Touch · left: slow · center: play/pause · right: fast<br>Pinch: zoom · drag: pan",
+                        2500,
+                    );
+                }
+            },
+        );
+        cleanupFns.push(stopFullscreenTouchWatch);
+    }
+
     // Teardown: reverse every global side-effect so the tab can be re-mounted cleanly.
     return function teardown() {
         // Stop the export loop before the shared grapher and canvases are released.
```

### 4.4 `src/blackbox-viewer/touch_fullscreen_controls.js` — 신규 파일 (제스처 계층)

```diff
diff --git a/src/blackbox-viewer/touch_fullscreen_controls.js b/src/blackbox-viewer/touch_fullscreen_controls.js
new file mode 100644
index 0000000..0c068b1
--- /dev/null
+++ b/src/blackbox-viewer/touch_fullscreen_controls.js
@@ -0,0 +1,182 @@
+import { GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM } from "./stores/graph.js";
+
+/**
+ * Android fullscreen touch gesture layer for the graph canvas.
+ *
+ * In graph-only fullscreen the toolbar, the seek bar and the status bar are
+ * all hidden (the `.is-fullscreen` rules in main.css) and an Android APK has
+ * no keyboard, so nothing can play/pause, change the rate or zoom the graph
+ * any more. This module gives the graph canvas a touch gesture set, active
+ * only while the graph-only fullscreen is on and a log is loaded:
+ *
+ *   tap  left third   → slow playback (TOUCH_SLOW_RATE, plays if paused)
+ *   tap  center third → play / pause toggle
+ *   tap  right third  → fast playback (TOUCH_FAST_RATE, plays if paused)
+ *   two-finger drag   → pinch zoom of the graph time window
+ *   one-finger drag   → pan the graph through time
+ *
+ * Gesture recognition lives here; every action is a callback supplied by
+ * main.js, so playback, rate and zoom run through the exact same pipeline
+ * (playback_controls.js → video sync) the hidden toolbar buttons use. In
+ * particular the pan callback feeds `graph.onSeek` — the offset formula and
+ * the ×2 "seek faster" factor stay identical to the desktop mouse drag.
+ *
+ * The grapher's own single-finger drag-to-seek handler (grapher.js
+ * onTouchStart) must stand down while this layer owns the canvas; main.js
+ * flips `graph.touchSeekEnabled` to false for the
+ * fullscreen+Android combination and restores it otherwise.
+ */
+
+/* "%" playback rates for the left / right tap zones. Both are members of the
+ * SpeedPanel STEPS list so the hidden Speed readout stays on a known step:
+ * 25 % is the slowest practical watch-speed step, 200 % is the fastest one. */
+export const TOUCH_SLOW_RATE = 25;
+export const TOUCH_FAST_RATE = 200;
+
+/* A touch counts as a tap only while it stays inside this pixel budget and
+ * this time budget; anything else is a pan and must not fire a zone action. */
+const TAP_SLOP_PX = 10;
+const TAP_MAX_MS = 350;
+
+/**
+ * @param {Object} ctx
+ * @param {HTMLCanvasElement} ctx.canvas - #graphCanvas (fills .log-graph)
+ * @param {Object} ctx.graphStore - graph Pinia store (isFullscreen, graphZoom, graph)
+ * @param {Object} ctx.logStore - log Pinia store (hasLog)
+ * @param {Object} ctx.actions
+ * @param {Function} ctx.actions.onGraphSeek - offset micros (same units as graph.onSeek)
+ * @param {Function} ctx.actions.onPlayPause
+ * @param {Function} ctx.actions.onSlowPlay
+ * @param {Function} ctx.actions.onFastPlay
+ * @param {Function} ctx.actions.onZoom - zoom factor in percent units, clamped by the caller
+ * @returns {Function} destroy — removes the listeners
+ */
+export function attachFullscreenTouchControls({ canvas, graphStore, logStore, actions }) {
+    const { onGraphSeek, onPlayPause, onSlowPlay, onFastPlay, onZoom } = actions;
+
+    // idle → deciding → (tap | pan) → idle, or deciding|pan → pinch → idle.
+    let mode = "idle";
+    let startX = 0;
+    let startY = 0;
+    let startTime = 0;
+    let lastX = 0;
+    let pinchStartDist = 0;
+    let pinchStartZoom = 0;
+
+    function active() {
+        return graphStore.isFullscreen && logStore.hasLog && graphStore.graph != null;
+    }
+
+    function pinchDistance(e) {
+        const a = e.touches[0];
+        const b = e.touches[1];
+        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
+    }
+
+    function beginDecision(e) {
+        mode = "deciding";
+        startX = lastX = e.touches[0].pageX;
+        startY = e.touches[0].pageY;
+        startTime = Date.now();
+    }
+
+    function onTouchStart(e) {
+        if (!active()) {
+            return;
+        }
+        if (e.touches.length === 1) {
+            beginDecision(e);
+        } else if (e.touches.length === 2) {
+            // Pinch takes over from whatever the first finger was doing; the
+            // zoom is anchored on the spread the two fingers started with.
+            mode = "pinch";
+            pinchStartDist = pinchDistance(e);
+            pinchStartZoom = graphStore.graphZoom;
+        } else {
+            // Three or more fingers — leave gesture mode entirely so a stray
+            // extra finger can never keep a stale pan/pinch alive.
+            mode = "idle";
+        }
+        e.preventDefault();
+    }
+
+    function onTouchMove(e) {
+        if (mode === "deciding") {
+            const dx = e.touches[0].pageX - startX;
+            const dy = e.touches[0].pageY - startY;
+            if (Math.hypot(dx, dy) <= TAP_SLOP_PX) {
+                return; // still a candidate tap — wait for touchend
+            }
+            // Crossed the slop budget: this is a pan. Re-baseline lastX so the
+            // jitter accumulated before the decision is not seeked away.
+            mode = "pan";
+            lastX = e.touches[0].pageX;
+        }
+
+        if (mode === "pan") {
+            const x = e.touches[0].pageX;
+            // Same formula and units as grapher.js onTouchMove: fraction of
+            // the canvas width mapped onto the visible window width. main.js
+            // applies the ×2 "seek faster" factor inside graph.onSeek.
+            const windowWidth = graphStore.graph.getWindowWidthTime();
+            onGraphSeek(((lastX - x) / canvas.width) * windowWidth);
+            lastX = x;
+        } else if (mode === "pinch") {
+            if (e.touches.length >= 2 && pinchStartDist > 0) {
+                const dist = pinchDistance(e);
+                // 1:1 with the finger spread; the window stays centered on the
+                // time cursor because grapher.render() always centers it.
+                const zoom = Math.max(
+                    GRAPH_MIN_ZOOM,
+                    Math.min(GRAPH_MAX_ZOOM, pinchStartZoom * (dist / pinchStartDist)),
+                );
+                onZoom(zoom);
+            }
+        } else {
+            return;
+        }
+        e.preventDefault();
+    }
+
+    function onTouchEnd(e) {
+        if (mode === "deciding" && Date.now() - startTime <= TAP_MAX_MS) {
+            // Zone verdict from where the finger LIFTED (changedTouches), in
+            // CSS pixels relative to the on-screen canvas box.
+            const rect = canvas.getBoundingClientRect();
+            const x = (e.changedTouches[0].clientX - rect.left) / rect.width;
+            if (x < 1 / 3) {
+                onSlowPlay();
+            } else if (x < 2 / 3) {
+                onPlayPause();
+            } else {
+                onFastPlay();
+            }
+        }
+
+        if (e.touches.length === 0) {
+            mode = "idle";
+        } else if (e.touches.length === 1 && mode === "pinch") {
+            // One finger lifted out of a pinch: the survivor restarts the tap
+            // decision so a follow-up tap or pan works without re-touching.
+            beginDecision(e);
+        }
+    }
+
+    function onTouchCancel() {
+        mode = "idle";
+    }
+
+    // passive: false — these handlers must be allowed to preventDefault(); the
+    // gesture set below relies on blocking the WebView's default touch moves.
+    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
+    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
+    canvas.addEventListener("touchend", onTouchEnd);
+    canvas.addEventListener("touchcancel", onTouchCancel);
+
+    return function destroy() {
+        canvas.removeEventListener("touchstart", onTouchStart);
+        canvas.removeEventListener("touchmove", onTouchMove);
+        canvas.removeEventListener("touchend", onTouchEnd);
+        canvas.removeEventListener("touchcancel", onTouchCancel);
+    };
+}
```

변경 통계: 4개 파일, **+285 −3** (기존 파일: `main.js` +79−1, `grapher.js` +15−2, `main.css` +9−0 / 신규: `touch_fullscreen_controls.js` +182−0 — 주석과 JSDoc 포함).

---

## 5. 검증 방법

### 5.1 수동 절차 (Android APK)

빌드: `npm run android:sync` → `npm run android:release` (또는 `android:run`).

1. `.bbl` 로그를 열고, 좌상단 전체화면 아이콘으로 전체화면에 진입한다. **기대**: 하단 우측에 2.5초간 제스처 힌트가 표시된다.
2. **중앙 1/3 탭** → 재생 시작. 다시 중앙 탭 → 일시정지. (비디오를 로드한 상태라면 비디오도 함께 재생/정지된다.)
3. **왼쪽 1/3 탭** → "25 % · slow" 표시와 함께 25% 배속으로 재생된다. 일시정지 상태에서 탭하면 25%로 재생이 시작된다.
4. **오른쪽 1/3 탭** → "200 % · fast" 표시와 함께 200% 배속으로 재생된다.
5. **한 손가락 드래그** → 데스크톱 마우스 드래그와 동일한 감각으로 그래프가 시간축을 따라 이동한다(드래그 방향 = 데이터를 잡아 끄는 방향, ×2 가속 포함).
6. **두 손가락 벌리기/모으기** → 커서를 중심으로 시간 윈도우가 확대/축소된다. 줌 한계(1% ~ 1000%)에서 더 벌려도 값이 튀지 않는다.
7. 두 손가락을 벌린 뒤 한 손가락을 떼고 나머지로 즉시 드래그 → 팬으로 전환된다. 뗀 뒤 탭하면 존 동작이 발화한다.
8. 좌상단 아이콘으로 전체화면 해제 → 한 손가락 드래그가 기존의 단일 터치 시크로 복귀하고, 탭/핀치는 무반응이다. 툴바·시크바가 돌아온다.
9. **전체화면 켠 상태에서 다른 로그로 전환**(LogPanel) → 제스처가 새 그래프에서도 동작한다(§3.6 ③ 경로).
10. 페이지 핀치 줌/스크롤이 캔버스 위 제스처와 발생하지 않는지 확인한다(`touch-action: none`).

### 5.2 수동 절차 (데스크톱 회귀)

1. Chrome DevTools의 **기기 에뮬레이션을 끄고** 웹(`npm run dev`)에서 동일 로그를 연다.
2. 마우스 드래그 시크, 휠 점프/Alt+휠 줌, Space·F·화살표 단축키가 수정 전과 동일한지 확인한다.
3. F로 전체화면 진입 → **탭/핀치가 발화하지 않는다**(마우스 클릭·휠만 동작). Esc로 해제.
4. 터치스크린 노트북이 있다면 전체화면에서 한 손가락 드래그가 기존 시크로 동작하는지 확인한다(제스처 계층 미부착 경로).

### 5.3 코드 수준 확인 (DevTools / 에뮬레이터)

- Android 에뮬레이터 + Chrome 원격 디버깅으로 `#graphCanvas` computed style의 `touch-action` = `none` 확인.
- 전체화면 진입 시 `graph.touchSeekEnabled === false`, 해제 시 `true` 확인(콘솔).
- 존 탭 후 Pinia: `playbackStore.playbackRate` = 25/200, `graphState` = 1(PLAY) 확인.

### 5.4 회귀 체크리스트

- [ ] APK 전체화면: 중앙 탭 재생/일시정지, 좌 탭 25% 재생, 우 탭 200% 재생
- [ ] APK 전체화면: 한 손가락 드래그 = 그래프 이동(마우스 드래그와 동일 감각), 팬 시작 시 지터 미반영
- [ ] APK 전체화면: 두 손가락 핀치 = 확대/축소, 커서 중심 앵커, 1%~1000% 클램프, 페이지 줌 미발생
- [ ] APK 전체화면: 핀치 중 한 손가락 해제 후 탭/드래그 연속 동작
- [ ] APK 전체화면: 전체화면 해제 버튼 탭 정상 (제스처와 미간섭)
- [ ] APK 전체화면: Legend 항목 탭·숨기기, 분석기(Analyser) 표시 등 기존 기능 정상
- [ ] APK 전체화면: 비디오 로드 상태에서 재생/정지/배속/시크가 비디오에 동기 반영
- [ ] 전체화면 해제 후: 툴바·시크바·상태바 복귀, 단일 터치 시크 복귀, 탭/핀치 무반응
- [ ] 데스크톱(웹): 마우스 드래그 시크·휠·키보드 단축키 100% 불변
- [ ] Android 웹 브라우저(PWA): 동작 불변 (제스처 계층 미부착)
- [ ] 비디오 익스포트·CSV/BBL 익스포트 등 부수 기능 무영향
- [ ] `npm run lint`(eslint + vue-tsc) 통과


