import assert from 'node:assert/strict';
import handler from '../api/ai-publish.mjs';

process.env.PUBLISH_API_KEY = 'test-publish-key';
process.env.GITHUB_TOKEN = 'test-github-token';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.OPENAI_MODEL = 'test-model';
process.env.GITHUB_REPOSITORY = 'kimminhyeok11/mapia';
process.env.GITHUB_BRANCH = 'main';
process.env.SITE_URL = 'https://kimminhyeok11.github.io/mapia';

const calls = [];
const article = {
  title: '테스트용 AI 글',
  summary: '자동 발행 API가 생성한 테스트 글입니다.',
  slug: 'test-ai-article',
  body: '## 핵심 내용\n\nAPI 테스트 본문입니다.\n\n## 마무리\n\n검증을 완료합니다.'
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  calls.push({ url: String(url), method, body: options.body ? JSON.parse(options.body) : null });
  if (String(url).includes('/chat/completions')) {
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(article) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (String(url).includes('/contents/generated/posts.json')) {
    return new Response(JSON.stringify({ content: Buffer.from('[]').toString('base64') }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (String(url).includes('/git/ref/heads/main') && method === 'GET') {
    return new Response(JSON.stringify({ object: { sha: 'parent-commit' } }), { status: 200 });
  }
  if (String(url).includes('/git/commits/parent-commit') && method === 'GET') {
    return new Response(JSON.stringify({ tree: { sha: 'parent-tree' } }), { status: 200 });
  }
  if (String(url).endsWith('/git/blobs') && method === 'POST') {
    return new Response(JSON.stringify({ sha: `blob-${calls.length}` }), { status: 201 });
  }
  if (String(url).endsWith('/git/trees') && method === 'POST') {
    return new Response(JSON.stringify({ sha: 'new-tree' }), { status: 201 });
  }
  if (String(url).endsWith('/git/commits') && method === 'POST') {
    return new Response(JSON.stringify({ sha: 'new-commit', html_url: 'https://github.com/kimminhyeok11/mapia/commit/new-commit' }), { status: 201 });
  }
  if (String(url).includes('/git/refs/heads/main') && method === 'PATCH') {
    return new Response(JSON.stringify({ ref: 'refs/heads/main' }), { status: 200 });
  }
  return new Response(JSON.stringify({ message: 'unexpected request' }), { status: 500 });
};

const response = { statusCode: 200, headers: {}, body: '' };
const res = {
  status(code) { response.statusCode = code; return this; },
  setHeader(name, value) { response.headers[name] = value; return this; },
  end(body = '') { response.body = body; return this; }
};
const req = { method: 'POST', headers: { authorization: 'Bearer test-publish-key' }, body: { topic: '한국어 AI 자동 발행 테스트', keywords: 'GitHub, AI, 자동화' } };
await handler(req, res);
const payload = JSON.parse(response.body);

assert.equal(response.statusCode, 201);
assert.equal(payload.ok, true);
assert.equal(payload.slug, 'test-ai-article');
assert.ok(calls.some(call => call.url.endsWith('/git/trees') && call.body.tree.some(file => file.path === 'content/posts/test-ai-article.md')));
assert.ok(calls.some(call => call.url.endsWith('/git/trees') && call.body.tree.some(file => file.path === 'posts/test-ai-article/index.html')));
console.log('AI publish API test passed:', payload.url);

globalThis.fetch = originalFetch;
