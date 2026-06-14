const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { ExifTool } = require('exiftool-vendored');
const { generateRandomExif } = require('./exifGenerator');
const { generateUniqueVirtualFilename } = require('./filenameGenerator');
const { generateAltText } = require('./altTextGenerator');

// 로그 파일 경로
const logFilePath = path.join(__dirname, '../logs/app.log');
const logDir = path.dirname(logFilePath);

// 로그 디렉토리 생성
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 로그 파일 초기화 (앱 시작 시)
if (fs.existsSync(logFilePath)) {
  fs.unlinkSync(logFilePath);
}

// 로그 함수
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage);
  console.log(message);
}

// 랜덤 정수 생성 헬퍼 함수
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 바이트 포맷 헬퍼 함수
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


/**
 * 기존 임시 파일 정리
 */
async function cleanupTempFiles(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      if (file.endsWith('.temp') || file.endsWith('.temp.webp') || file.endsWith('.temp.jpg')) {
        const filePath = path.join(folderPath, file);
        try {
          fs.unlinkSync(filePath);
          log(`[기존 임시 파일 삭제] ${filePath}`);
        } catch (e) {
          log(`[기존 임시 파일 삭제 실패] ${filePath}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    log(`[임시 파일 정리 실패] ${e.message}`);
  }
}

/**
 * 이미지 처리 파이프라인
 * 1. 원본 EXIF 제거 및 회전 처리
 * 2. 랜덤 메타데이터 생성
 * 3. WebP 변환
 * 4. EXIF 메타데이터 추가
 * 5. 가상 파일명으로 저장
 */
async function processImage(imagePath, progressCallback, options = {}) {
  log(`[이미지 처리 시작] ${imagePath}`);
  
  // 독립적인 exiftool 인스턴스 생성
  const exiftool = new ExifTool();
  
  // 기존 임시 파일 정리
  const folderPath = path.dirname(imagePath);
  await cleanupTempFiles(folderPath);
  
  try {
    progressCallback({ status: 'reading', message: '이미지 읽기 중...' });
    
    // 원본 파일 메타데이터 저장 (전후 비교용)
    const originalMetadata = await sharp(imagePath).metadata();
    const originalStats = fs.statSync(imagePath);
    const originalSize = originalStats.size;
    
    // EXIF 백업 (선택적)
    try {
      const exiftool = new ExifTool();
      const exifData = await exiftool.read(imagePath);
      const backupPath = imagePath + '.exif.json';
      fs.writeFileSync(backupPath, JSON.stringify(exifData, null, 2));
      log(`[EXIF 백업 완료] ${backupPath}`);
      await exiftool.end();
    } catch (e) {
      log(`[EXIF 백업 실패] ${e.message}`);
    }
    
    progressCallback({ status: 'removing_exif', message: 'EXIF 메타데이터 제거 중...' });
    
    // 임시 파일에 EXIF 없이 저장 (명시적 회전 처리)
    const tempPath = imagePath + '.temp';
    const metadata = await sharp(imagePath).metadata();
    
    // EXIF Orientation에 따른 회전 각도 계산
    let rotationAngle = 0;
    if (metadata.orientation) {
      switch (metadata.orientation) {
        case 3:
          rotationAngle = 180;
          break;
        case 6:
          rotationAngle = 90;
          break;
        case 8:
          rotationAngle = -90;
          break;
        default:
          rotationAngle = 0;
      }
    }
    
    // 모서리 크롭 옵션
    let sharpProcessor = sharp(imagePath).rotate(rotationAngle).withMetadata({ orientation: 1 });
    
    if (options.cornerCrop) {
      progressCallback({ status: 'corner_crop', message: '모서리 크롭 중...' });
      // 이미지 모서리 5% 크롭
      const cropPercent = 0.05;
      sharpProcessor = sharpProcessor.extract({
        left: Math.floor(metadata.width * cropPercent),
        top: Math.floor(metadata.height * cropPercent),
        width: Math.floor(metadata.width * (1 - 2 * cropPercent)),
        height: Math.floor(metadata.height * (1 - 2 * cropPercent))
      });
    }
    
    // 모서리 둥글게 옵션
    if (options.cornerRadius) {
      progressCallback({ status: 'corner_radius', message: '모서리 둥글게 처리 중...' });
      // 이미지 모서리 둥글게 처리 (composite 사용)
      const radius = 20; // 둥글게 처리할 픽셀
      const croppedMetadata = await sharpProcessor.metadata();
      const roundedCorners = Buffer.from(
        `<svg><rect x="0" y="0" width="${croppedMetadata.width}" height="${croppedMetadata.height}" rx="${radius}" ry="${radius}" fill="black"/></svg>`
      );
      sharpProcessor = sharpProcessor.composite([{ input: roundedCorners, blend: 'dest-in' }]);
    }
    
    await sharpProcessor.toFile(tempPath);
    log(`[임시 파일 생성 완료] ${tempPath}`);
    
    // sharp 프로세서 명시적으로 닫기
    sharpProcessor = null;
    
    // 파일이 완전히 닫힐 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 500));
    
    progressCallback({ status: 'generating_metadata', message: '랜덤 메타데이터 생성 중...' });
    
    // 랜덤 EXIF 메타데이터 생성
    const exifData = generateRandomExif();
    
    progressCallback({ status: 'converting', message: 'WebP 변환 중...' });
    
    // WebP 변환 및 최적화 (이미 회전된 이미지이므로 rotate() 호출하지 않음)
    const webpTempPath = tempPath + '.webp';
    const quality = randomInt(80, 85); // 품질 80-85%
    
    await sharp(tempPath)
      .webp({ 
        quality: quality,
        effort: 4 // 최적화 레벨 (0-6)
      })
      .toFile(webpTempPath);
    log(`[WebP 변환 완료] ${webpTempPath}`);
    
    progressCallback({ status: 'adding_metadata', message: '메타데이터 추가 중...' });
    
    // EXIF 메타데이터 추가 (exiftool-vendored 라이브러리 사용)
    try {
      const exifTags = {
        Make: exifData.Make,
        Model: exifData.Model,
        Software: exifData.Software,
        Orientation: 1, // 이미 회전 처리했으므로 1로 설정
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
      
      await exiftool.write(webpTempPath, exifTags);
      log(`[EXIF 메타데이터 추가 완료] ${webpTempPath}`);
    } catch (error) {
      log(`[EXIF 메타데이터 추가 실패] ${error.message}`);
    }
    
    // 파일 잠금 해제 대기 (시간 증가)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    progressCallback({ status: 'naming', message: '가상 파일명 생성 중...' });
    
    // 가상 파일명 생성
    const newFilename = generateUniqueVirtualFilename(folderPath, 'webp');
    const newPath = path.join(folderPath, newFilename);
    
    progressCallback({ status: 'saving', message: '파일 저장 중...' });
    
    // 최종 파일로 이동
    fs.renameSync(webpTempPath, newPath);
    log(`[파일 이동 완료] ${webpTempPath} -> ${newPath}`);
    
    // 파일 핸들 해제 대기 (시간 증가)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 최적화된 파일 메타데이터 저장 (전후 비교용)
    const optimizedStats = fs.statSync(newPath);
    const optimizedSize = optimizedStats.size;
    const optimizedMetadata = await sharp(newPath).metadata();
    
    // 전후 비교 정보 계산
    const sizeReduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(2);
    const sizeSaved = (originalSize - optimizedSize);
    
    const comparison = {
      original: {
        size: originalSize,
        sizeFormatted: formatBytes(originalSize),
        width: originalMetadata.width,
        height: originalMetadata.height,
        format: originalMetadata.format
      },
      optimized: {
        size: optimizedSize,
        sizeFormatted: formatBytes(optimizedSize),
        width: optimizedMetadata.width,
        height: optimizedMetadata.height,
        format: optimizedMetadata.format
      },
      reduction: {
        percentage: sizeReduction,
        bytes: sizeSaved,
        bytesFormatted: formatBytes(sizeSaved)
      }
    };
    
    progressCallback({ 
      status: 'completed', 
      message: '완료',
      filename: newFilename,
      originalPath: imagePath,
      newPath: newPath,
      comparison: comparison
    });
    
    return {
      success: true,
      filename: newFilename,
      originalPath: imagePath,
      newPath: newPath,
      comparison: comparison
    };
    
  } catch (error) {
    console.error('이미지 처리 오류:', error);
    
    // 임시 파일 정리 (삭제 기능 제거)
    const tempPath = imagePath + '.temp';
    const webpTempPath = tempPath + '.webp';
    log(`[임시 파일 정리 건너뜀] ${tempPath}, ${webpTempPath}`);
    
    progressCallback({ 
      status: 'error', 
      message: `오류: ${error.message}`,
      error: error
    });
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    // exiftool 인스턴스 항상 종료
    try {
      await exiftool.end();
      log(`[exiftool 인스턴스 종료 (finally)]`);
    } catch (e) {
      console.error('exiftool 종료 실패:', e);
    }
  }
}

/**
 * 대량 이미지 처리 (병렬 처리)
 */
async function processMultipleImages(imagePaths, progressCallback, maxConcurrency = 3, options = {}) {
  const results = [];
  const total = imagePaths.length;
  let completed = 0;
  
  // 병렬 처리를 위한 함수
  const processWithProgress = async (imagePath) => {
    const result = await processImage(imagePath, (fileProgress) => {
      const currentProgress = ((completed + 1) / total) * 100;
      progressCallback({
        ...fileProgress,
        overallProgress: currentProgress,
        currentIndex: completed + 1,
        total: total
      });
    }, options);
    
    completed++;
    const currentProgress = (completed / total) * 100;
    progressCallback({
      overallProgress: currentProgress,
      currentIndex: completed,
      total: total,
      currentFile: path.basename(imagePath)
    });
    
    return result;
  };
  
  // 병렬 처리 실행
  const chunks = [];
  for (let i = 0; i < imagePaths.length; i += maxConcurrency) {
    chunks.push(imagePaths.slice(i, i + maxConcurrency));
  }
  
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((imagePath) => processWithProgress(imagePath))
    );
    results.push(...chunkResults);
  }
  
  return results;
}

module.exports = {
  processImage,
  processMultipleImages
};
