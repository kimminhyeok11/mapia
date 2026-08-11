import { normalizePost, renderArticlePage, renderFrontmatter, renderSitemap, slugify } from '../scripts/content-renderer.mjs';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_REPOSITORY = 'kimminhyeok11/mapia';
const DEFAULT_BRANCH = 'main';
const DEFAULT_SITE_URL = 'https://kimminhyeok11.github.io/mapia';
const MAX_TOPIC_LENGTH = 300;
const MAX_BODY_LENGTH = 30000;

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getRequestKey(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(req.headers['x-api-key'] || '').trim();
}

function setCors(res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
  if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function parseModelJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI 응답을 JSON으로 해석할 수 없습니다.');
  }
}

async function callAi({ topic, keywords, tone, length }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.');
  const baseUrl = (process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const system = `당신은 한국어 전문 콘텐츠 에디터입니다. 사용자가 제공한 주제에 대해 독창적이고 검수 가능한 블로그 원고를 작성합니다.
반드시 다음 원칙을 지키세요.
- 검색순위 조작을 위한 키워드 반복이나 내용 없는 문장을 만들지 않습니다.
- 사실을 단정할 때는 확인이 필요한 부분을 명확히 표시하고, 출처가 필요한 주장에는 본문에 링크를 포함합니다.
- 독자가 실제로 도움을 받을 수 있도록 문제 정의, 핵심 설명, 단계별 방법, 주의점, 요약 순서로 구성합니다.
- 본문은 안전한 Markdown이며 HTML과 JavaScript를 직접 삽입하지 않습니다.
- 제목, 요약, 본문, slug만 반환합니다. 마크다운 코드 블록이나 설명 문장은 반환하지 않습니다.
- 본문에는 최소 3개의 ## 소제목을 포함합니다.
- slug는 영문 소문자와 숫자, 하이픈만 사용하며 3~70자로 작성합니다.

JSON 스키마:
{"title":"string","summary":"string","slug":"string","body":"markdown string"}`;
  const user = `주제: ${topic}\n핵심 키워드: ${keywords || '없음'}\n문체: ${tone || '전문적이고 읽기 쉬운 설명체'}\n분량: ${length || '약 1,200~1,800자'}\n\n위 조건으로 바로 게시 가능한 한국어 원고를 작성하세요.`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `AI API 오류(${response.status})`);
  const text = payload?.choices?.[0]?.message?.content;
  const article = parseModelJson(text);
  if (!article.title || !article.body) throw new Error('AI가 제목 또는 본문을 생성하지 못했습니다.');
  return article;
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function githubRequest(token, pathname, options = {}) {
  const response = await fetch(`${GITHUB_API}${pathname}`, { ...options, headers: { ...githubHeaders(token), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || `GitHub API 오류(${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function getExistingGeneratedPosts(token, repository, branch) {
  try {
    const file = await githubRequest(token, `/repos/${repository}/contents/generated/posts.json?ref=${encodeURIComponent(branch)}`);
    const source = Buffer.from(String(file.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
    const posts = JSON.parse(source);
    return Array.isArray(posts) ? posts : [];
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

async function commitFiles({ token, repository, branch, files, deletions = [], message }) {
  const ref = await githubRequest(token, `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentCommitSha = ref.object.sha;
  const parentCommit = await githubRequest(token, `/repos/${repository}/git/commits/${parentCommitSha}`);
  const treeEntries = [];
  for (const file of files) {
    const blob = await githubRequest(token, `/repos/${repository}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' })
    });
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  for (const filePath of deletions) treeEntries.push({ path: filePath, mode: '100644', type: 'blob', sha: null });
  const tree = await githubRequest(token, `/repos/${repository}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeEntries })
  });
  const commit = await githubRequest(token, `/repos/${repository}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentCommitSha] })
  });
  await githubRequest(token, `/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return { commitSha: commit.sha, commitUrl: commit.html_url };
}

function publicPost(post) {
  const { body, adsenseClient, ...safePost } = post;
  return safePost;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST 요청만 허용됩니다.' });

  const expectedKey = process.env.PUBLISH_API_KEY;
  const requestKey = getRequestKey(req);
  if (!expectedKey || !requestKey || requestKey !== expectedKey) return json(res, 401, { ok: false, error: '유효한 발행 API 키가 필요합니다.' });

  try {
    const input = parseBody(req);
    const topic = String(input.topic || '').trim();
    if (!topic) return json(res, 400, { ok: false, error: 'topic은 필수입니다.' });
    if (topic.length > MAX_TOPIC_LENGTH) return json(res, 400, { ok: false, error: `topic은 ${MAX_TOPIC_LENGTH}자 이하로 입력하세요.` });

    const repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
    const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
    const siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL;
    const adsenseClient = process.env.ADSENSE_CLIENT || 'ca-pub-5239497835591112';
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error('GITHUB_TOKEN 환경 변수가 설정되지 않았습니다.');

    const article = await callAi({ topic, keywords: input.keywords, tone: input.tone, length: input.length });
    const normalized = normalizePost({
      ...article,
      slug: slugify(article.slug || article.title),
      published: input.published !== false,
      date: input.date,
      updated: input.updated,
      author: input.author || 'CortexLog AI Editor',
      image: input.image || ''
    }, { siteUrl, adsenseClient });
    if (normalized.body.length > MAX_BODY_LENGTH) throw new Error(`생성된 본문이 ${MAX_BODY_LENGTH}자를 초과했습니다.`);

    const existingPosts = await getExistingGeneratedPosts(githubToken, repository, branch);
    const duplicate = existingPosts.find(post => post.slug === normalized.slug);
    if (duplicate && input.overwrite !== true) return json(res, 409, { ok: false, error: `같은 slug의 글이 이미 있습니다: ${normalized.slug}`, slug: normalized.slug });

    const nextPosts = existingPosts.filter(post => post.slug !== normalized.slug);
    if (normalized.published) nextPosts.push(publicPost(normalized));
    nextPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const files = [
      { path: `content/posts/${normalized.slug}.md`, content: renderFrontmatter(normalized) },
      { path: `generated/posts.json`, content: `${JSON.stringify(nextPosts, null, 2)}\n` },
      { path: `sitemap.xml`, content: renderSitemap(nextPosts, { siteUrl }) },
      { path: `robots.txt`, content: `User-agent: *\nAllow: /\nSitemap: ${String(siteUrl).replace(/\/$/, '')}/sitemap.xml\n` }
    ];
    const deletions = [];
    if (normalized.published) files.push({ path: `posts/${normalized.slug}/index.html`, content: renderArticlePage(normalized, { siteUrl, adsenseClient }) });
    else if (duplicate) deletions.push(`posts/${normalized.slug}/index.html`);

    const commit = await commitFiles({
      token: githubToken,
      repository,
      branch,
      files,
      deletions,
      message: `${normalized.published ? 'feat' : 'chore'}: publish AI article ${normalized.slug}`
    });

    return json(res, 201, {
      ok: true,
      status: normalized.published ? 'published' : 'draft',
      title: normalized.title,
      slug: normalized.slug,
      url: normalized.published ? normalized.url : null,
      commit: commit.commitUrl,
      message: normalized.published ? 'AI 글이 GitHub에 커밋되었습니다. GitHub Pages 반영까지 잠시 걸릴 수 있습니다.' : 'AI 초안이 GitHub에 저장되었습니다.'
    });
  } catch (error) {
    console.error('AI publish error:', error);
    const status = error.status === 409 ? 409 : 500;
    return json(res, status, { ok: false, error: error.message || 'AI 글 발행에 실패했습니다.' });
  }
}
