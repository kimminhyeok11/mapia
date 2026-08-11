# 글 작성 방법

이 폴더에 Markdown 파일을 만들고 상단에 YAML 형식의 메타데이터를 작성합니다. `published: true`인 글만 홈페이지에 공개됩니다.

```markdown
---
title: "글 제목"
slug: "글-주소"
summary: "검색 결과와 글 목록에 표시할 짧은 요약"
date: "2026-08-12"
updated: "2026-08-12"
author: "작성자"
image: "https://example.com/cover.webp"
published: true
---

## 소제목

본문을 Markdown으로 작성합니다.
```

`published`를 `false`로 두거나 생략하면 초안으로 남고 배포되지 않습니다. 파일을 GitHub에 커밋하거나 Pull Request를 병합하면 자동 빌드가 시작되며, 배포가 끝난 뒤 `/posts/글-주소/`에서 직접 접근할 수 있습니다.

저작권·개인정보·광고 정책을 확인한 뒤 직접 검수한 원문을 발행하세요. 자동 생성 글을 검수 없이 대량 발행하는 용도로 사용하지 않는 것이 좋습니다.
