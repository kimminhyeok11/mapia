const fs = require('fs');
const path = require('path');

// 카메라 프로필 로드
const cameraProfilesPath = path.join(__dirname, '../data/cameraProfiles.json');
const cameraProfiles = JSON.parse(fs.readFileSync(cameraProfilesPath, 'utf8'));

/**
 * 랜덤 정수 생성
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 랜덤 배열 요소 선택
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 랜덤 카메라 프로필 선택
 */
function getRandomCamera() {
  return randomChoice(cameraProfiles.cameras);
}

/**
 * 랜덤 서울 위치 선택 (약간의 오프셋 추가)
 */
function getRandomSeoulLocation() {
  const location = randomChoice(cameraProfiles.seoulLocations);
  // 약간의 랜덤 오프셋 추가 (약 100m 반경)
  const latOffset = (Math.random() - 0.5) * 0.001;
  const lonOffset = (Math.random() - 0.5) * 0.001;
  
  return {
    lat: location.lat + latOffset,
    lon: location.lon + lonOffset,
    name: location.name
  };
}

/**
 * 랜덤 촬영 시간 생성 (최근 7일 내)
 */
function getRandomDateTime() {
  const now = new Date();
  const daysAgo = randomInt(0, 7);
  const hoursAgo = randomInt(0, 23);
  const minutesAgo = randomInt(0, 59);
  const secondsAgo = randomInt(0, 59);
  
  const dateTime = new Date(now);
  dateTime.setDate(dateTime.getDate() - daysAgo);
  dateTime.setHours(hoursAgo, minutesAgo, secondsAgo);
  
  return dateTime;
}

/**
 * EXIF GPS 좌표를 도분초 형식으로 변환 (exiftool 호환 배열 형식)
 */
function toDMS(decimal) {
  const degrees = Math.floor(decimal);
  const minutesFloat = (decimal - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  
  // exiftool 호환 배열 형식으로 반환
  return [degrees, minutes, seconds];
}

/**
 * 랜덤 EXIF 메타데이터 생성
 */
function generateRandomExif() {
  const camera = getRandomCamera();
  const location = getRandomSeoulLocation();
  const dateTime = getRandomDateTime();
  
  const resolution = randomChoice(camera.resolutions);
  const iso = randomInt(camera.isoRange[0], camera.isoRange[1]);
  const aperture = randomChoice(camera.apertureRange);
  const shutterSpeed = randomChoice(camera.shutterSpeeds);
  const colorProfile = randomChoice(camera.colorProfiles);
  
  // GPS 좌표 변환
  const latDMS = toDMS(Math.abs(location.lat));
  const lonDMS = toDMS(Math.abs(location.lon));
  
  // 날짜 형식화
  const dateStr = dateTime.toISOString().replace(/[-:]/g, '').split('.')[0];
  const year = dateTime.getFullYear();
  const month = String(dateTime.getMonth() + 1).padStart(2, '0');
  const day = String(dateTime.getDate()).padStart(2, '0');
  const hour = String(dateTime.getHours()).padStart(2, '0');
  const minute = String(dateTime.getMinutes()).padStart(2, '0');
  const second = String(dateTime.getSeconds()).padStart(2, '0');
  
  return {
    // 기본 정보
    Make: camera.make,
    Model: camera.model,
    Software: camera.software,
    
    // 이미지 정보
    ImageWidth: resolution.width,
    ImageHeight: resolution.height,
    Orientation: 1,
    XResolution: 72,
    YResolution: 72,
    ResolutionUnit: 2,
    
    // 촬영 정보
    DateTimeOriginal: `${year}:${month}:${day} ${hour}:${minute}:${second}`,
    CreateDate: `${year}:${month}:${day} ${hour}:${minute}:${second}`,
    ModifyDate: `${year}:${month}:${day} ${hour}:${minute}:${second}`,
    
    // 노출 정보
    ExposureTime: shutterSpeed,
    FNumber: parseFloat(aperture.replace('f/', '')),
    ISO: iso,
    
    // GPS 정보
    GPSLatitude: latDMS,
    GPSLatitudeRef: location.lat >= 0 ? 'N' : 'S',
    GPSLongitude: lonDMS,
    GPSLongitudeRef: location.lon >= 0 ? 'E' : 'W',
    GPSAltitude: randomInt(10, 100),
    GPSAltitudeRef: 0,
    
    // 렌즈 정보
    LensModel: camera.lensModel,
    FocalLength: randomInt(24, 70),
    
    // 색상 정보
    ColorSpace: colorProfile === 'sRGB' ? 1 : 2,
    
    // 추가 정보
    Flash: randomInt(0, 1),
    MeteringMode: randomInt(0, 6),
    WhiteBalance: randomInt(0, 2),
    
    // SEO 최적화를 위한 추가 메타데이터
    UserComment: `Photo taken in ${location.name}, Seoul`,
    Copyright: `© ${year}`,
    
    // 원본 데이터 삭제를 위한 빈 값들
    Thumbnail: null,
    PreviewImage: null
  };
}

module.exports = {
  generateRandomExif,
  getRandomCamera,
  getRandomSeoulLocation,
  getRandomDateTime,
  randomInt
};
