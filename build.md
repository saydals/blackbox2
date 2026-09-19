# build.md — Android Debug APK 빌드 매뉴얼 (blackbox-debug.apk)

> 대상: `blackbox2` (Rotorflight/Betaflight Blackbox Viewer, Capacitor + Vite + Vue 3)
> 결과물: **`/home/betaflight/blackbox2/blackbox-debug.apk`** (프로젝트 루트, 이름 고정)
> 최종 수정: 2026-09-20

---

## 0. 이 매뉴얼이 필요한 이유 (과거 실수 사례 — 반드시 읽을 것)

2026-09-20, z-index 수정 후 APK를 다시 빌드했더니 폰에서 **흰 화면만** 보이는
사고가 있었다. 원인과 교훈:

| 실수 | 원인 | 결과 |
|------|------|------|
| ❌ `npm run build` 로 dist 생성 후 수동으로 `cap sync` | `vite.config.js`의 기본 `base: "/blackbox2/"` 가 적용되어 APK 내부 `index.html`이 **절대경로**(`/blackbox2/assets/...`)를 가리킴 | Capacitor WebView(`https://localhost`)에서 `/blackbox2/` 경로는 존재하지 않으므로 JS/CSS 로딩 실패 → **흰 화면** |
| ❌ 빌드 후 크기/내용 검증을 생략 | assets 일부가 빠져도 눈치챌 수 없었음 | 문제를 기기 설치 후에야 발견 |

**결론 — dist 생성은 반드시 `npm run android:sync` 하나로만 한다.**
이 스크립트는 내부에서 `vite build --base=./` (상대경로)를 실행하므로
절대경로 문제가 원천적으로 발생하지 않는다. 절대로 다음을 하지 말 것:

- `npm run build` 후 그 결과를 그대로 `cap sync` 하는 것 (base가 `/blackbox2/`로 깨짐)
- `vite build` 를 `--base` 없이 직접 실행하는 것
- 이전 빌드의 `dist/` 가 남아있는 상태에서 sync만 하고 넘어가는 것 (반드시 sync 스크립트가
  새로 빌드하는지 로그로 확인)

---

## 1. 사전 준비물 (1회 확인)

```sh
# Node ≥ 24, npm ≥ 11 (package.json engines 참조)
node -v && npm -v

# Java 21 (Gradle 8.x 요구)
java -version

# Android SDK — android/local.properties 에 경로 고정되어 있음
cat android/local.properties
# → sdk.dir=/home/betaflight/android-sdk
ls "$HOME/android-sdk"   # build-tools, platform-tools, licenses 등이 있어야 함
```

의존성이 없거나 처음 클론한 상태라면:

```sh
npm install
```

참고: `JAVA_HOME` 이 비어 있어도 `android/gradlew` 는 시스템 기본 `java`(21)를
사용하므로 동작한다. 빌드 실패 시에만
`export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))` 설정.

---

## 2. 빌드 절차 (전체 흐름)

```
[소스 수정]
    ↓ ① npm run android:sync     ← dist 생성(--base=./) + capacitor 설정 + 안드로이드 동기화
    ↓ ② ./gradlew assembleDebug  ← android/ 에서 APK 빌드
    ↓ ③ 복사/이름변경            ← blackbox-debug.apk 로 프로젝트 루트에 저장
    ↓ ④ 검증 (§4 체크리스트)     ← 여기서 놓치면 기기에서 흰 화면
[blackbox-debug.apk 완성]
```

### ① 웹 자산 빌드 + 안드로이드 동기화 (공식 스크립트 — 이것만 사용)

```sh
cd /home/betaflight/blackbox2
npm run android:sync
```

이 한 줄이 다음을 **순서대로** 실행한다 (`package.json`의 `android:sync`):

1. `vite build --base=./` → `dist/` 생성 (index.html이 `./assets/...` 상대경로)
2. `node capacitor.config.generator.mjs` → `capacitor.config.json` STANDARD 생성
   (dev 서버 주입 없음, `SystemBars: { hidden: true }` 유지)
3. `npx cap sync android` → `dist/` → `android/app/src/main/assets/public/` 복사
   + capacitor 런타임/플러그인 갱신

**정상 로그 예시 (아래 3단계가 모두 보여야 한다):**

```
✓ built in ~2s
Generating capacitor.config.json STANDARD with: { appId: '...', webDir: 'dist', ... }
✔ Copying web assets from dist to android/app/src/main/assets/public
✔ Creating capacitor.config.json in android/app/src/main/assets
[info] Sync finished in ...
```

### ② APK 빌드 (Gradle)

```sh
cd /home/betaflight/blackbox2/android
./gradlew assembleDebug
```

- 성공 시: `BUILD SUCCESSFUL in ...s`
- 결과물: `android/app/build/outputs/apk/debug/app-debug.apk`
- 장시간 걸리면 백그라운드 실행 후 로그 확인:
  `./gradlew assembleDebug --no-daemon > /tmp/gradle-build.log 2>&1 &` 후 `tail -f /tmp/gradle-build.log`

### ③ 프로젝트 루트로 복사 + 이름 변경 (blackbox-debug.apk)

Gradle 출력물 이름은 `app-debug.apk` 이다. 이것을 **반드시 복사+이름변경**해서
프로젝트 루트의 `blackbox-debug.apk` 로 만든다:

```sh
cp /home/betaflight/blackbox2/android/app/build/outputs/apk/debug/app-debug.apk \
   /home/betaflight/blackbox2/blackbox-debug.apk
```

> ⚠️ `android/app/build/.../app-debug.apk`를 그대로 쓰지 말고 루트의
> `blackbox-debug.apk`로 복사해 둔다. 배포/전달은 항상 이 파일 하나를 사용한다.

---

## 3. 한 번에 실행하는 명령 (복붙용)

```sh
cd /home/betaflight/blackbox2 && \
npm run android:sync && \
cd android && ./gradlew assembleDebug && \
cp app/build/outputs/apk/debug/app-debug.apk ../blackbox-debug.apk && \
ls -la ../blackbox-debug.apk
```

---

## 4. 검증 체크리스트 (복사 후 반드시 수행 — 생략 금지)

기기에 설치하기 전에 APK 내부를 직접 검사한다. 하나라도 실패하면 **설치하지 말고**
§5 트러블슈팅으로 이동.

### 4-1. 크기 (정상 범위: 약 5.5 ~ 6.5 MB)

```sh
ls -la /home/betaflight/blackbox2/blackbox-debug.apk
```

- 정상: **약 5.8 MB (6.3M 급)**
- 4 MB 이하로 뚝 떨어졌다면 웹 자산(sample.bbl, heli.glb, 이미지 등)이 누락된 것 → §5-2

### 4-2. index.html 의 경로가 반드시 상대경로인지 (흰 화면 방지 — 최중요)

```sh
unzip -p /home/betaflight/blackbox2/blackbox-debug.apk assets/public/index.html \
  | grep -E 'script src|stylesheet'
```

- ✅ 정상: `src="./assets/index-XXXX.js"` / `href="./assets/index-XXXX.css"` (**`./` 로 시작**)
- ❌ 이상: `src="/blackbox2/assets/..."` → 절대경로. **이 APK는 흰 화면 난다. 폐기하고 §5-1로.**

### 4-3. 대용량 에셋 포함 여부

```sh
unzip -l /home/betaflight/blackbox2/blackbox-debug.apk | grep -E 'sample.*\.bbl|heli.*\.glb'
```

- ✅ `sample-XXXX.bbl` (약 162 KB) 과 `heli-XXXX.glb` (약 237 KB) 가 모두 보여야 한다.

### 4-4. 웹 자산 개수 일치 (동기화 누락 확인)

```sh
diff <(ls /home/betaflight/blackbox2/android/app/src/main/assets/public/assets) \
     <(ls /home/betaflight/blackbox2/dist/assets) && echo SAME
```

- ✅ `SAME` 이 출력되어야 한다.

### 4-5. Capacitor 설정 확인 (dev 설정 잔존 여부)

```sh
unzip -p /home/betaflight/blackbox2/blackbox-debug.apk assets/public/capacitor.config.json
```

- ✅ `{"appName":"...","appId":"...","webDir":"dist","plugins":{"SystemBars":{"hidden":true}}}`
- ❌ `server: { url: "http://...:8080" }` 가 있으면 **dev용 설정**이다. 폰이 PC의 vite
  서버를 찾느라 흰 화면/연결 실패가 된다. `npm run android:sync`를 다시 실행해
  STANDARD 설정으로 재생성·재동기화한다.

### 4-6. (선택) 직전 코드 수정이 들어갔는지 확인

직전 수정이 CSS/JS였다면 빌드 산출물에 반영됐는지 샘플 검증. 예 — z-index 수정
(드롭다운 `z-[60]`, 상태바 `z-index: 55`) 건:

```sh
unzip -p /home/betaflight/blackbox2/blackbox-debug.apk 'assets/public/assets/index-*.css' | grep -c 'z-index:60'
unzip -p /home/betaflight/blackbox2/blackbox-debug.apk 'assets/public/assets/index-*.css' | grep -c 'z-index:55'
```

- ✅ 각각 `1` 이상이면 반영됨.

### 4-7. 기기 설치

- **기존 앱을 먼저 언인스톨**하고 설치 권장 (동일 appId 오버설치 시 이전 리소스 잔존 가능)
- 설치 후 앱이 열리고(흰 화면 아님) 로그 파일 열기가 되는지 확인

---

## 5. 트러블슈팅

### 5-1. 앱 실행 시 흰 화면만 보임

원인: 웹 자산 경로 문제 또는 dev 설정 잔존. 다음 순서로 확인:

1. §4-2 실행 — `src="/blackbox2/..."` 이면 **base 경로 실수**:
   ```sh
   # 잘못된 dist를 폐기하고 공식 스크립트로 재빌드·재동기화
   rm -rf dist
   npm run android:sync
   # §4-2 재검증 후 §2-② 부터 다시
   ```
2. §4-5 실행 — `server.url` 이 있으면 dev용 capacitor 설정이 APK에 들어간 것:
   ```sh
   npm run android:sync   # generator가 STANDARD로 재생성한다
   ```

> 왜 이런 일이 생기나: `vite.config.js`는 웹 배포 기준 `base: "/blackbox2/"`를
> 기본값으로 갖는다. 브라우저/PWA 배포용이라면 맞지만, Capacitor WebView는
> `https://localhost/index.html` 에서 자산을 찾으므로 **상대경로(`--base=./`)**만 동작한다.

### 5-2. APK 크기가 갑자기 작아짐 (예: 6.3M → 4M대)

웹 자산 일부가 누락된 것. §4-3, §4-4 확인:

- `dist/assets/` 에 sample.bbl / heli.glb / 이미지가 있는지 확인
- `android/app/src/main/assets/public/assets` 와 `dist/assets` 가 동일한지 diff
- 불일치하면 `npm run android:sync` 재실행 (sync는 기본적으로 전체 재복사)

### 5-3. gradle 빌드 실패

```sh
cd /home/betaflight/blackbox2/android
./gradlew assembleDebug --no-daemon 2>&1 | tail -40
```

- `SDK location not found` → `android/local.properties` 에 `sdk.dir=/home/betaflight/android-sdk` 확인
- Java 버전 오류 → Java 21 사용 확인 (`java -version`)
- 캐시 꼬임 의심 시: `./gradlew clean assembleDebug`

### 5-4. cap sync가 dist를 못 찾음

`npm run android:sync` 전체를 다시 실행 (dist를 따로 수동 빌드하지 말 것).
`capacitor.config.json`의 `webDir`는 `dist`로 고정.

### 5-5. 설치는 되는데 실행이 안 되거나 화면이 깨짐

- §4 체크리스트 전 항목 재검증
- 기존 앱 언인스톨 후 재설치
- `adb logcat | grep -i chromium` 으로 WebView 콘솔 에러 확인

---

## 6. 참고: 릴리스(서명) 빌드가 필요할 때

이 매뉴얼은 **debug APK** 전용이다. 릴리스 빌드는 같은 웹 자산 절차(§2-①)를 그대로
쓰되 Gradle 태스크와 서명 구성이 필요하다:

```sh
npm run android:release   # vite build --base=./ + capacitor 설정 + cap build android --release
```

서명 키/keystore 구성은 별도 문서 참조.

---

## 7. 파일 위치 요약

| 파일 | 설명 |
|------|------|
| `dist/` | Vite 웹 빌드 출력 (`--base=./`) — 직접 수정 금지, 항상 스크립트로 재생성 |
| `android/app/src/main/assets/public/` | `cap sync`가 dist를 복사해 둔 곳 — 직접 수정 금지 |
| `android/app/build/outputs/apk/debug/app-debug.apk` | Gradle 원본 출력 |
| **`/home/betaflight/blackbox2/blackbox-debug.apk`** | **최종 전달물 (이름/위치 고정)** |

---

## 8. 요약 — 3줄 빌드

```sh
npm run android:sync                       # dist(--base=./) + capacitor sync
(cd android && ./gradlew assembleDebug)    # APK 빌드
cp android/app/build/outputs/apk/debug/app-debug.apk blackbox-debug.apk   # 이름 고정
```

그리고 §4 체크리스트. 끝.




