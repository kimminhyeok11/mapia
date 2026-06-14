const { getRandomSeoulLocation } = require('./exifGenerator');

/**
 * SEO Alt 텍스트 생성기
 * GPS 위치와 파일명을 기반으로 자동 생성
 */
function generateAltText(filename, locationName) {
  const location = locationName || getRandomSeoulLocation().name;
  
  // 파일명에서 키워드 추출 (간단한 형태)
  const keywords = extractKeywords(filename);
  
  // Alt 텍스트 생성 템플릿
  const templates = [
    `${location}에서 촬영한 ${keywords.join(', ')} 사진`,
    `${keywords.join(' ')} - ${location}의 아름다운 풍경`,
    `${location}에서 찍은 ${keywords[0] || '사진'}`,
    `${keywords.join('와 ')}이 있는 ${location}의 모습`,
    `${location}의 ${keywords[0] || '장면'}을 담은 사진`
  ];
  
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  
  return randomTemplate;
}

/**
 * 파일명에서 키워드 추출
 */
function extractKeywords(filename) {
  // 파일 확장자 제거
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // 숫자와 특수문자 제거
  const cleanName = nameWithoutExt.replace(/[^a-zA-Z가-힣]/g, ' ');
  
  // 공백으로 분리
  const words = cleanName.split(' ').filter(word => word.length > 1);
  
  // 중복 제거
  const uniqueWords = [...new Set(words)];
  
  // 최대 3개 키워드 반환
  return uniqueWords.slice(0, 3);
}

module.exports = {
  generateAltText,
  extractKeywords
};
