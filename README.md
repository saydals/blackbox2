# Betaflight Blackbox Viewer — standalone file-based log viewer

`masterconfig`의 블랙박스 뷰어 탭 내용을 독립 실행 앱으로 분리한 디렉토리다.
탭 메뉴도 없고, FC 연결 메뉴/버튼도 없다. 로그 파일 열기/드래그앤드롭으로만 동작한다.

## 구조

- `index.html` — 단일 진입점. 뷰어 DOM(`#blackbox-viewer-root`, 캔버스, 비디오)은
  `src/blackbox-viewer/App.vue`가 직접 렌더링한다 (탭용 Teleport 스캐폴드 없음).
- `src/blackbox-viewer/` — `masterconfig/src/blackbox-viewer`와 동일 계열.
  FC 다운로드(`download-from-fc`, `bbvDataflash` 주입)는 제거됨.
- `src/js/` — 뷰어가 실제로 import하는 최소 지원 모듈만 포함:
  `FileSystem.js` + `ConfigStorage.js` + `protocols/CapacitorFile.js` (Android SAF 파일 열기/저장),
  `utils/checkCompatibility.js` + `utils/bytes.js`,
  `data_storage.js` (API 버전 상수 미니멀 미러),
  `utils/debugModes.js` + `debug_*_table.ts` (디버그 필드명, `scripts/generate-debug-modes.mjs`로 재생성),
  `js/webworkers/` (CSV/GPX/스펙트럼 export 워커),
  `pinia_instance.js`, `nuxt_ui_router.js`.
- `src/images/` — 뷰어가 번들로 참조하는 이미지만 포함
  (웰컴 배경, 지도 마커, 믹서/스틱 프리뷰, PWA 아이콘).
- `android/` — `masterconfig/android`에서 파일 선택용으로 축소 복사.
  `MainActivity`는 `BetaflightFilePlugin`(SAF)만 등록하고,
  시리얼/BLE/TCP/DFU 플러그인·USB/BT 권한·`device_filter.xml`은 제거됨.
  `applicationId`는 `com.betaflight.blackboxviewer`.
- 빌드 준비물: `vite.config.js` (Vite 빌드), `nuxt-ui.vite.js`,
  `capacitor.config.base.json` + `capacitor.config.generator.mjs` (Android/Capacitor),
  `package.json`, `eslint.config.js`, `tsconfig.json`.

## 실행/빌드

```sh
npm install
npm run dev      # Vite 개발 서버 (:8080)
npm run build    # Vite 프로덕션 빌드 -> dist/
npm run lint     # eslint + vue-tsc

# Android (Capacitor)
npm run android:sync   # dist 빌드 + capacitor sync
npm run android:open   # Android Studio 열기
npm run android:run    # 기기/에뮬레이터 실행
```

## 안드로이드 버전 (APK 다운로드)

빌드된 APK는 GitHub Releases에서 내려받을 수 있다.

- **APK 직접 다운로드 (최신 릴리즈)**:
  <https://github.com/saydals/blackbox2/releases/latest/download/blackbox-debug.apk>
- **릴리즈 페이지**:
  <https://github.com/saydals/blackbox2/releases>
- 현재 릴리즈: `v2026.12.0-alpha` (debug 서명 APK, `blackbox-debug.apk`)

설치: APK를 기기로 내려받아 열면 설치된다. 최초 설치 시
"출처를 알 수 없는 앱 설치" 허용이 필요하다.

새 APK를 릴리즈에 올릴 때는(`gh` CLI 미설치 환경) GitHub API를 사용한다:

```sh
TOKEN=<GitHub PAT>
# 1) 릴리즈 생성
curl -s -X POST https://api.github.com/repos/saydals/blackbox2/releases \
  -H "Authorization: token $TOKEN" \
  -d '{"tag_name":"<태그>","name":"<제목>","body":"<설명>","prerelease":true}'
# 2) 응답의 id로 에셋 업로드
curl -s -X POST "https://uploads.github.com/repos/saydals/blackbox2/releases/<릴리즈ID>/assets?name=blackbox-debug.apk" \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @blackbox-debug.apk
```
