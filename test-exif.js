const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { ExifTool } = require('exiftool-vendored');
const { generateRandomExif } = require('./utils/exifGenerator');

// 로그 파일 경로
const logFilePath = path.join(__dirname, 'logs/test-exif.log');
const logDir = path.dirname(logFilePath);

// 로그 디렉토리 생성
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 로그 함수
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage);
  console.log(message);
}

// 테스트 이미지 생성
async function createTestImage() {
  const testImagePath = path.join(__dirname, 'test-image.webp');
  
  // 간단한 테스트 이미지 생성
  await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
  .webp({ quality: 85 })
  .toFile(testImagePath);
  
  log(`테스트 이미지 생성 완료: ${testImagePath}`);
  return testImagePath;
}

// EXIF 메타데이터 확인
async function verifyExif(imagePath) {
  const exiftool = new ExifTool();
  
  try {
    const metadata = await exiftool.read(imagePath);
    log(`EXIF 메타데이터 확인: ${JSON.stringify(metadata, null, 2)}`);
    
    // 주요 필드 확인
    const requiredFields = ['Make', 'Model', 'DateTimeOriginal', 'GPSLatitude'];
    const missingFields = requiredFields.filter(field => !metadata[field]);
    
    if (missingFields.length > 0) {
      log(`EXIF 메타데이터 누락: ${missingFields.join(', ')}`);
      return false;
    }
    
    log('EXIF 메타데이터 확인 완료');
    return true;
  } catch (error) {
    log(`EXIF 메타데이터 확인 실패: ${error.message}`);
    return false;
  } finally {
    await exiftool.end();
  }
}

// EXIF 메타데이터 추가 테스트
async function testExifInsertion(imagePath) {
  const exiftool = new ExifTool();
  
  try {
    const exifData = generateRandomExif();
    log(`생성된 EXIF 데이터: ${JSON.stringify(exifData, null, 2)}`);
    
    const exifTags = {
      Make: exifData.Make,
      Model: exifData.Model,
      Software: exifData.Software,
      Orientation: exifData.Orientation,
      Copyright: exifData.Copyright,
      ImageDescription: exifData.ImageDescription,
      DateTimeOriginal: exifData.DateTimeOriginal,
      CreateDate: exifData.CreateDate,
      ModifyDate: exifData.ModifyDate,
      ExposureTime: exifData.ExposureTime,
      FNumber: exifData.FNumber,
      ISO: exifData.ISO,
      FocalLength: exifData.FocalLength,
      GPSLatitude: Array.isArray(exifData.GPSLatitude) ? exifData.GPSLatitude : [0, 0, 0],
      GPSLatitudeRef: exifData.GPSLatitudeRef,
      GPSLongitude: Array.isArray(exifData.GPSLongitude) ? exifData.GPSLongitude : [0, 0, 0],
      GPSLongitudeRef: exifData.GPSLongitudeRef,
      GPSAltitude: exifData.GPSAltitude,
      GPSAltitudeRef: exifData.GPSAltitudeRef
    };
    
    await exiftool.write(imagePath, exifTags);
    log('EXIF 메타데이터 추가 완료');
    
    // 파일 잠금 해제 대기
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return true;
  } catch (error) {
    log(`EXIF 메타데이터 추가 실패: ${error.message}`);
    log(`오류 스택: ${error.stack}`);
    return false;
  } finally {
    await exiftool.end();
  }
}

// 메인 테스트 함수
async function runTest() {
  log('=== EXIF 메타데이터 테스트 시작 ===');
  
  let testImagePath = null;
  let attempt = 0;
  const maxAttempts = 10;
  
  while (attempt < maxAttempts) {
    attempt++;
    log(`시도 ${attempt}/${maxAttempts}`);
    
    try {
      // 테스트 이미지 생성
      testImagePath = await createTestImage();
      
      // EXIF 메타데이터 추가
      const insertSuccess = await testExifInsertion(testImagePath);
      
      if (!insertSuccess) {
        log('EXIF 메타데이터 추가 실패, 다음 시도...');
        // 테스트 이미지 삭제
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
        continue;
      }
      
      // EXIF 메타데이터 확인
      const verifySuccess = await verifyExif(testImagePath);
      
      if (verifySuccess) {
        log('=== EXIF 메타데이터 테스트 성공 ===');
        // 테스트 이미지 삭제
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
        return true;
      } else {
        log('EXIF 메타데이터 확인 실패, 다음 시도...');
        // 테스트 이미지 삭제
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
        continue;
      }
    } catch (error) {
      log(`테스트 오류: ${error.message}`);
      log(`오류 스택: ${error.stack}`);
      // 테스트 이미지 삭제
      if (testImagePath && fs.existsSync(testImagePath)) {
        fs.unlinkSync(testImagePath);
      }
      continue;
    }
  }
  
  log('=== EXIF 메타데이터 테스트 실패 (최대 시도 횟수 초과) ===');
  return false;
}

// 테스트 실행
runTest().then(success => {
  if (success) {
    log('테스트 성공');
    process.exit(0);
  } else {
    log('테스트 실패');
    process.exit(1);
  }
}).catch(error => {
  log(`테스트 실행 오류: ${error.message}`);
  process.exit(1);
});
