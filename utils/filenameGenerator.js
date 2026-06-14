const { getRandomDateTime, randomInt } = require('./exifGenerator');

/**
 * 랜덤 문자열 생성
 */
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 가상 파일명 생성 - 다양한 카메라 파일명 패턴
 */
function generateVirtualFilename(originalExtension = 'webp') {
  const dateTime = getRandomDateTime();
  const year = dateTime.getFullYear();
  const month = String(dateTime.getMonth() + 1).padStart(2, '0');
  const day = String(dateTime.getDate()).padStart(2, '0');
  const hour = String(dateTime.getHours()).padStart(2, '0');
  const minute = String(dateTime.getMinutes()).padStart(2, '0');
  const second = String(dateTime.getSeconds()).padStart(2, '0');
  
  const patterns = [
    // Samsung Galaxy 패턴
    () => `IMG_${year}${month}${day}_${hour}${minute}${second}.${originalExtension}`,
    
    // iPhone 패턴
    () => `IMG_${randomInt(1000, 9999)}.${originalExtension}`,
    
    // Sony 패턴
    () => `DSC${randomInt(1000, 9999)}.${originalExtension}`,
    
    // Canon 패턴
    () => `IMG_${randomInt(1000, 9999)}.${originalExtension}`,
    
    // Nikon 패턴
    () => `DSC_${randomInt(1000, 9999)}.${originalExtension}`,
    
    // Google Pixel 패턴
    () => `P${month}${day}${randomInt(1000, 9999)}.${originalExtension}`,
    
    // Xiaomi 패턴
    () => `IMG_${year}${month}${day}_${randomInt(100000, 999999)}.${originalExtension}`,
    
    // OnePlus 패턴
    () => `IMG_${randomInt(100000000, 999999999)}.${originalExtension}`,
    
    // 일반 카메라 패턴
    () => `IMG_${year}${month}${day}_${hour}${minute}${second}_${randomString(4)}.${originalExtension}`,
    
    // 날짜 기반 패턴
    () => `${year}${month}${day}_${hour}${minute}${second}.${originalExtension}`,
    
    // 짧은 패턴
    () => `${randomString(8)}.${originalExtension}`
  ];
  
  const pattern = randomChoice(patterns);
  return pattern();
}

/**
 * 랜덤 배열 요소 선택
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 파일명이 이미 존재하는지 확인하고 중복되지 않도록 생성
 */
function generateUniqueVirtualFilename(folderPath, originalExtension = 'webp') {
  const fs = require('fs');
  const path = require('path');
  
  let filename = generateVirtualFilename(originalExtension);
  let fullPath = path.join(folderPath, filename);
  let counter = 1;
  
  while (fs.existsSync(fullPath)) {
    const baseName = path.basename(filename, `.${originalExtension}`);
    filename = `${baseName}_${counter}.${originalExtension}`;
    fullPath = path.join(folderPath, filename);
    counter++;
  }
  
  return filename;
}

module.exports = {
  generateVirtualFilename,
  generateUniqueVirtualFilename
};
