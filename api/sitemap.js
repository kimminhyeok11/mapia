// Vercel 서버리스 함수 환경에서 실행됩니다.
// Supabase 클라이언트를 가져옵니다.
import { createClient } from '@supabase/supabase-js';

// 사이트 기본 주소
const SITE_URL = 'https://mapia.vercel.app';

// Supabase 접속 정보. Vercel 프로젝트의 환경 변수에서 가져옵니다.
// Vercel 대시보드 > Settings > Environment Variables 에서 설정해야 합니다.
// SUPABASE_URL=...
// SUPABASE_ANON_KEY=...
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// sitemap.xml을 생성하는 메인 함수
export default async function handler(req, res) {
    try {
        // Supabase의 'posts' 테이블에서 모든 글의 id와 생성일을 가져옵니다.
        const { data: posts, error } = await supabase
            .from('posts')
            .select('id, created_at');

        if (error) {
            throw new Error('데이터베이스에서 글 목록을 가져오는 데 실패했습니다: ' + error.message);
        }

        // XML 문서의 시작 부분
        let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`;

        // 각 글에 대한 URL 항목을 동적으로 추가합니다.
        posts.forEach(post => {
            sitemapXml += `
  <url>
    <loc>${SITE_URL}/#/post/${post.id}</loc>
    <lastmod>${new Date(post.created_at).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
        });

        // XML 문서의 마지막 부분
        sitemapXml += `
</urlset>`;

        // 생성된 XML을 sitemap.xml 형식으로 응답합니다.
        res.setHeader('Content-Type', 'application/xml');
        // Vercel의 CDN 캐시를 설정하여 24시간 동안 유지되도록 합니다.
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        res.status(200).send(sitemapXml);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}

