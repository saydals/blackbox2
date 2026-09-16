# blackbox2 개조 로드맵

## 개요
- 참조: `/home/betaflight/rfblackbox/js/`
- 목표: Betaflight 뷰어 → **Rotorflight 전용 뷰어**로 전환
- 조건: Vite 빌드, Android(Capacitor) 빌드 유지

---

## 완료된 작업

### 1-8단계: RF 파싱/분석/브랜딩 완료
- 펌웨어 식별, RF 테이블, 라벨/디코드, 계산식 이식 완료
- 그래프/헤더/이벤트 UI RF 분기 완료
- 브랜딩: 별도 앱 ID `com.rotorflight.blackboxviewer`
- E2E 테스트 8/8 통과, build/lint/sync 전부 통과

### craft 헬기 3D 모델
- `craft_heli_3d.js` 신설, bell_cw.glb 로드
- BF 로그는 기존 Craft3D 유지

### 버그픽스 (BP-1 ~ BP-7)
- RATES_TYPE off-by-one, FAILSAFE_PHASE 확장, RF 라벨 이식, heli 3D yaw 반전, craft 기본값 사용자 지정, stick yaw 비반전, 동영상 I/O 마크 등 모두 수정 완료

### 워크스페이스 프리셋 교체
- BF 프리셋(`ctzsnooze`, `supaflyfpv`) 제거
- 원본 RF `default_workspaces.js` 기반 프리셋 적용
- 빈 슬롯 0~9(편집/저장 가능) + 하단 이름있는 프리셋(편집 불가) 구조로 정리

### GitHub Pages 자동 배포
- `.github/workflows/deploy.yml` 생성
- `master` 푸시 시 자동 빌드/배포
- `https://saydals.github.io/blackbox2/`

### PWA 지원
- `manifest.webmanifest`, `sw.js`, PWA 아이콘 추가
- 브라우저 앱 설치 아이콘 표시 가능

### Android 빌드
- 디버그 APK: `app-debug.apk` (5.2MB)
- 릴리즈 APK: `app-release-signed.apk` (4.1MB)

---

## 미해결 문제

1. **안드로이드 태블릿 터치 타겟**
   - 상단 툴바와 사이드바 버튼이 너무 작아 터치가 어려움
   - 팝업/확대 형태 등 UI 개선 필요

2. **expo on/off 토글**
   - 새 그래프 추가 시 `power: 1`로 기본 설정되어 expo 효과가 보이지 않음
   - `getDefaultCurveForField()` 기본값이 원본과 달라 `setpoint` 등 일부 필드의 power 비율이 `0.25`가 아님

3. **새 그래프 추가 시 속성 상속**
   - 필드 추가 시 기존 그래프의 smoothing/expo/line color/MinMax 등을 상속받지 않고 기본값으로 생성됨
   - 원본의 `adaptField()` 로직과 불일치

4. **아이콘 미교체**
   - 앱 아이콘이 BF 기본 아이콘(`bf_icon_128.png`) 그대로 사용 중
   - RF 전용 아이콘으로 교체 필요
