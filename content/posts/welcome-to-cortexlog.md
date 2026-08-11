---
title: "CortexLog 자동 발행 시스템 오픈"
slug: "welcome-to-cortexlog"
summary: "GitHub 저장소에 Markdown 파일을 추가하기만 하면 홈페이지가 자동으로 업데이트되는 애드센스 수익형 블로그 시스템 구축 완료."
date: "2026-08-12"
updated: "2026-08-12"
author: "CortexLog 수석 개발자"
image: "https://fzfnjtlzovbpbglvkroh.supabase.co/storage/v1/object/public/thought-images/00dc2292-d179-4e54-b717-68a040a4e3a5/cortexlog.webp"
published: true
---

## 🚀 GitHub 기반 홈페이지 자동 발행 시스템 개요

이제 로컬이나 GitHub 웹 인터페이스에서 `content/posts/` 폴더에 Markdown(`.md`) 파일 형식으로 글을 작성하고 커밋하면, 사이트가 자동으로 빌드되어 홈페이지와 sitemap.xml에 반영됩니다.

### 주요 특징

1. **마크다운 기반 글 작성**: 복잡한 대시보드나 에디터 없이도 텍스트 파일 하나로 간편하게 포스팅을 관리할 수 있습니다.
2. **애드센스 최적화**: 구글 애드센스 광고 단위와 `ads.txt`, `robots.txt`, `sitemap.xml`이 완벽하게 연동되어 수익 창출과 검색엔진 색인에 최적화되어 있습니다.
3. **초안 제어 기능**: 메타데이터에 `published: true`를 지정한 글만 공개되며, `false`이거나 생략된 글은 안전하게 초안으로 유지됩니다.

| 구성 요소 | 역할 및 설명 |
| :--- | :--- |
| **`content/posts/*.md`** | 실제 글을 작성하는 Markdown 원본 폴더 |
| **`scripts/build-content.mjs`** | 마크다운을 HTML로 변환하고 JSON 및 sitemap을 생성하는 빌드 엔진 |
| **`GitHub Pages`** | 별도의 서버 비용 없이 정적 사이트를 안정적으로 호스팅하는 공간 |

> "콘텐츠 작성에만 집중하고, 배포와 발행은 자동화하세요." — CortexLog Team
