import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'posts');
const GENERATED_DIR = path.join(ROOT, 'generated');
const PUBLIC_POSTS_DIR = path.join(ROOT, 'posts');
const SITE_URL = (process.env.SITE_URL || 'https://mapia.vercel.app').replace(/\/$/, '');
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || 'ca-pub-5239497835591112';
const SANITIZE_OPTIONS = {
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'strong', 'em', 'del', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'div', 'span', 'iframe'],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    iframe: ['src', 'title', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'loading'],
    '*': ['class']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'youtu.be']
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const escapeXml = (value = '') => escapeHtml(value);

function slugify(value) {
  const slug = String(value)
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `post-${Date.now()}`;
}

function parseScalar(value) {
  const trimmed = String(value ?? '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^\[.*\]$/.test(trimmed)) {
    try { return JSON.parse(trimmed.replaceAll("'", '"')); } catch { return trimmed; }
  }
  return trimmed;
}

function parseFrontmatter(source) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    data[key] = parseScalar(line.slice(separator + 1));
  }
  return { data, body: match[2].trim() };
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>#*_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(value, fallback) {
  const parsed = new Date(value || fallback);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback).toISOString() : parsed.toISOString();
}

function articleTemplate(post) {
  const canonical = `${SITE_URL}/posts/${post.slug}/`;
  const imageMeta = post.image ? `<meta property="og:image" content="${escapeHtml(post.image)}"><meta name="twitter:image" content="${escapeHtml(post.image)}">` : '';
  const cover = post.image ? `<img class="cover" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="eager">` : '';
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.summary,
    datePublished: post.created_at,
    dateModified: post.updated_at,
    mainEntityOfPage: canonical,
    author: { '@type': 'Person', name: post.author || 'CortexLog' },
    ...(post.image ? { image: [post.image] } : {})
  }).replaceAll('<', '\\u003c');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(post.title)} | CortexLog</title>
  <meta name="description" content="${escapeHtml(post.summary)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(post.title)} | CortexLog">
  <meta property="og:description" content="${escapeHtml(post.summary)}">
  ${imageMeta}
  <meta name="twitter:card" content="summary_large_image">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(ADSENSE_CLIENT)}" crossorigin="anonymous"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Pretendard:wght@400;500;700&display=swap" rel="stylesheet">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root { --bg:#0b0b0b; --panel:#141414; --border:#2a2a2a; --text:#f0f0f0; --muted:#aaa; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:Pretendard,system-ui,sans-serif; line-height:1.8; }
    .wrap { width:min(920px, calc(100% - 32px)); margin:0 auto; }
    header { position:sticky; top:0; z-index:2; padding:16px 0; background:rgba(11,11,11,.86); backdrop-filter:blur(12px); border-bottom:1px solid rgba(42,42,42,.7); }
    nav { display:flex; justify-content:space-between; align-items:center; gap:16px; }
    .brand { color:var(--text); font:800 20px 'Plus Jakarta Sans',sans-serif; text-decoration:none; letter-spacing:.4px; }
    .back { color:var(--muted); border:1px solid var(--border); padding:6px 12px; border-radius:6px; text-decoration:none; font-size:13px; }
    main { padding:64px 0 96px; }
    .eyebrow { color:var(--muted); font-size:13px; margin:0 0 14px; }
    h1,h2,h3,h4 { font-family:'Plus Jakarta Sans',Pretendard,sans-serif; line-height:1.3; color:var(--text); }
    h1 { font-size:clamp(30px, 6vw, 52px); margin:0 0 18px; letter-spacing:-.03em; }
    .summary { color:var(--muted); font-size:18px; margin:0 0 32px; }
    .cover { width:100%; max-height:520px; object-fit:cover; border-radius:10px; margin:0 0 42px; }
    .prose { color:#bdbdbd; font-size:17px; }
    .prose h2,.prose h3 { margin-top:2.2em; padding-bottom:.35em; border-bottom:1px solid var(--border); }
    .prose a { color:var(--text); text-underline-offset:3px; }
    .prose img { max-width:100%; height:auto; border-radius:8px; }
    .prose pre { overflow:auto; padding:18px; background:#050505; border:1px solid var(--border); border-radius:8px; }
    .prose code { background:#222; padding:.15em .35em; border-radius:4px; }
    .prose blockquote { margin:24px 0; padding-left:18px; border-left:2px solid #aaa; color:var(--muted); }
    .prose table { display:block; width:100%; overflow:auto; border-collapse:collapse; }
    .prose th,.prose td { border:1px solid var(--border); padding:8px 12px; text-align:left; }
    .prose th { background:var(--panel); color:var(--text); }
    .ad { min-height:90px; margin:56px 0; }
    footer { padding:28px 0 50px; color:#777; border-top:1px solid var(--border); font-size:13px; }
    @media (max-width:600px) { main { padding-top:40px; } .prose { font-size:16px; } }
  </style>
</head>
<body>
  <header><div class="wrap"><nav><a class="brand" href="${SITE_URL}/">CortexLog</a><a class="back" href="${SITE_URL}/">목록으로</a></nav></div></header>
  <main class="wrap">
    <p class="eyebrow">${escapeHtml(new Date(post.created_at).toLocaleDateString('ko-KR'))}</p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="summary">${escapeHtml(post.summary)}</p>
    ${cover}
    <article class="prose">${post.html}</article>
    <div class="ad"><ins class="adsbygoogle" style="display:block" data-ad-client="${escapeHtml(ADSENSE_CLIENT)}" data-ad-slot="2069100221" data-ad-format="auto" data-full-width-responsive="true"></ins></div>
    <p><a class="back" href="${SITE_URL}/">다른 글 읽기</a></p>
  </main>
  <footer><div class="wrap">© ${new Date(post.created_at).getFullYear()} CortexLog. 글의 내용은 작성자의 관점입니다.</div></footer>
  <script>window.addEventListener('load',()=>{try{(adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}});</script>
</body>
</html>`;
}

function sitemapTemplate(posts) {
  const urls = [
    `<url><loc>${escapeXml(`${SITE_URL}/`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...posts.map(post => `<url><loc>${escapeXml(`${SITE_URL}/posts/${post.slug}/`)}</loc><lastmod>${escapeXml(post.updated_at)}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`)
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  ${url}`).join('\n')}\n</urlset>\n`;
}

async function main() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.rm(PUBLIC_POSTS_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_POSTS_DIR, { recursive: true });

  const entries = (await fs.readdir(CONTENT_DIR, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const posts = [];
  for (const entry of entries) {
    const source = await fs.readFile(path.join(CONTENT_DIR, entry.name), 'utf8');
    const { data, body } = parseFrontmatter(source);
    const title = String(data.title || entry.name.replace(/\.md$/, ''));
    const slug = slugify(data.slug || title);
    const published = data.published === true || data.published === 'true';
    if (!published) continue;
    const createdAt = isoDate(data.date || data.created_at, new Date().toISOString());
    const updatedAt = isoDate(data.updated || data.updated_at || data.date, createdAt);
    const html = sanitizeHtml(marked.parse(body, { gfm: true, breaks: false }), SANITIZE_OPTIONS);
    const summary = String(data.summary || stripMarkdown(body).slice(0, 150));
    posts.push({
      id: slug,
      slug,
      title,
      summary,
      html,
      image: data.image ? String(data.image) : '',
      author: data.author ? String(data.author) : 'CortexLog',
      created_at: createdAt,
      updated_at: updatedAt,
      url: `${SITE_URL}/posts/${slug}/`
    });
  }

  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  await fs.writeFile(path.join(GENERATED_DIR, 'posts.json'), `${JSON.stringify(posts, null, 2)}\n`);
  for (const post of posts) {
    const dir = path.join(PUBLIC_POSTS_DIR, post.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), articleTemplate(post));
  }
  await fs.writeFile(path.join(ROOT, 'sitemap.xml'), sitemapTemplate(posts));
  await fs.writeFile(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Built ${posts.length} published post(s).`);
}

main().catch(error => { console.error(error); process.exit(1); });
