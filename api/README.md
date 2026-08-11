# AI 글 즉시 발행 API

이 API는 `topic`을 받아 AI로 한국어 블로그 원고를 생성한 뒤, GitHub 저장소에 Markdown 원본과 정적 HTML 게시물, `generated/posts.json`, `sitemap.xml`, `robots.txt`를 한 번의 커밋으로 저장합니다. GitHub Pages가 해당 저장소를 배포하고 있으므로, 커밋 뒤 홈페이지에 글이 자동 반영됩니다.

## 엔드포인트

```text
POST /api/ai-publish
```

요청은 `Authorization: Bearer <PUBLISH_API_KEY>` 또는 `X-API-Key: <PUBLISH_API_KEY>` 헤더로 인증합니다. API 키는 브라우저 코드나 GitHub 저장소에 넣지 말고 배포 플랫폼의 서버 환경 변수에만 저장해야 합니다.

## 요청 예시

```bash
curl -X POST "https://YOUR-API-DOMAIN/api/ai-publish" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PUBLISH_API_KEY" \
  -d '{
    "topic": "초보자를 위한 개인 홈페이지 SEO 설정 방법",
    "keywords": "SEO, sitemap, robots.txt",
    "tone": "전문적이지만 쉽게 설명하는 문체",
    "length": "약 1,500자",
    "published": true,
    "author": "CortexLog"
  }'
```

`published`를 `false`로 보내면 초안으로 GitHub에 저장되지만 공개용 정적 HTML은 삭제됩니다. 같은 `slug`가 이미 존재할 때 `overwrite: true`를 함께 보내야 기존 글을 덮어쓸 수 있습니다. 대표 이미지가 필요하면 `image`에 공개 URL을 전달할 수 있습니다.

## 서버 환경 변수

| 변수 | 설명 |
| --- | --- |
| `PUBLISH_API_KEY` | API 호출을 허용할 긴 무작위 비밀 키 |
| `OPENAI_API_KEY` | 사용할 OpenAI 호환 AI 서비스의 서버 전용 키 |
| `OPENAI_BASE_URL` | 선택 사항. 기본값은 `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 선택 사항. 기본값은 `gpt-4o-mini` |
| `GITHUB_TOKEN` | GitHub 저장소에 커밋할 권한이 있는 서버 전용 토큰 |
| `GITHUB_REPOSITORY` | 선택 사항. 기본값은 `kimminhyeok11/mapia` |
| `GITHUB_BRANCH` | 선택 사항. 기본값은 `main` |
| `SITE_URL` | 선택 사항. 기본값은 `https://kimminhyeok11.github.io/mapia` |
| `ADSENSE_CLIENT` | 선택 사항. 기본값은 현재 사이트의 AdSense 클라이언트 ID |
| `ALLOWED_ORIGIN` | 선택 사항. 브라우저 호출을 허용할 프론트엔드 Origin |

GitHub 토큰은 최소한 해당 저장소의 콘텐츠를 수정할 수 있는 권한만 부여해야 합니다. 공개 API로 운영할 경우 요청 횟수 제한, 로그에서 토큰·원고 전문을 제외하는 정책, 관리자용 인증을 함께 적용하세요.

## 배포

이 저장소는 정적 홈페이지를 GitHub Pages에서 제공하고 있으므로 GitHub Pages 자체에서는 서버 API를 실행할 수 없습니다. 따라서 저장소의 `api/ai-publish.mjs`가 서버리스 함수로 실행되는 별도 배포 주소가 필요합니다. Vercel에 이 저장소를 연결하면 `/api/ai-publish` 경로가 자동으로 서버리스 함수가 되며, 프로젝트 설정의 Environment Variables에 위 표의 비밀 값을 등록한 뒤 재배포하면 됩니다. 기존 `https://mapia.vercel.app` 주소는 현재 유효한 배포가 아니므로, 새로 생성된 Vercel 프로젝트의 URL을 API 호출 주소로 사용해야 합니다.

GitHub Pages에 게시되는 글은 `https://kimminhyeok11.github.io/mapia/posts/{slug}/` 형식의 정적 URL을 사용합니다. AI 생성 결과는 자동 게시 전에 반드시 사실관계, 저작권, 개인정보, 광고 정책을 검수하세요. 자동 생성 글을 검수 없이 대량 발행하는 방식은 검색 품질과 광고 정책 측면에서 위험할 수 있습니다.
