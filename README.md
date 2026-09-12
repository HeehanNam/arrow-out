# Arrow Out

선을 따라 몸통이 풀려나는 모바일 웹 퍼즐. 분홍 화살표의 길을 열어주세요.

[바로 플레이](https://heehannam.github.io/arrow-out/)

## v2

- 미리 생성하고 검증한 100레벨: 5가지 전체 보드 형태와 10개 난이도 챕터.
- 클래식 60개 / 횟수 제한 20개 / 타임어택 20개.
- 1레벨 12개에서 100레벨 45개 화살표로 증가. 꺾임과 필수 이동도 함께 증가.
- 자기 몸통·꼬리·다른 화살표 관통 금지. 화살촉 직진 + 경로를 따라 풀리는 몸통.
- 목표에 꼭 필요한 최소 순서 힌트, 별점, 확대, 일시정지, 자동 이어하기.
- 기록은 기기별 브라우저 저장소에 보관. 기존 해금 레벨은 유지.

## 개발

Node.js 20 이상. HTTP 서버가 필요합니다 (`file://` 직접 실행은 지원하지 않음).

```sh
npm ci
npm start
# http://127.0.0.1:4173
npm test
npx playwright install chromium
npm run test:browser
```

설치된 Chrome을 사용하려면 환경 변수 `PLAYWRIGHT_CHANNEL=chrome`을 설정합니다.
캠페인 재생성은 `npm run build:campaign` 후 반드시 전체 테스트를 실행하세요.
런타임에는 프레임워크·외부 폰트·광고·분석 SDK가 없습니다.

[조사와 설계 근거](DESIGN.md) · [개발 품질 지침](AGENTS.md)

GitHub Pages 배포는 테스트 성공 이후 정적 파일만 업로드합니다.
