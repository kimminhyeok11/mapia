const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');
const errorSection = document.getElementById('errorSection');
const resultsList = document.getElementById('resultsList');
const resetBtn = document.getElementById('resetBtn');
const errorResetBtn = document.getElementById('errorResetBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const folderWatchStatus = document.getElementById('folderWatchStatus');
const cornerCropCheckbox = document.getElementById('cornerCrop');
const cornerRadiusCheckbox = document.getElementById('cornerRadius');
const webServerSection = document.getElementById('webServerSection');
const webServerQR = document.getElementById('webServerQR');
const uploadDirPath = document.getElementById('uploadDirPath');
const videoUrlDialog = document.getElementById('videoUrlDialog');
const currentVideoUrl = document.getElementById('currentVideoUrl');
const videoUrlInput = document.getElementById('videoUrlInput');
const cancelVideoUrl = document.getElementById('cancelVideoUrl');
const saveVideoUrl = document.getElementById('saveVideoUrl');
const minimizeModeBtn = document.getElementById('minimizeModeBtn');
const minimizeMode = document.getElementById('minimizeMode');
const minimizeDropZone = document.getElementById('minimizeDropZone');
const exitMinimizeMode = document.getElementById('exitMinimizeMode');
const minimizeCornerCrop = document.getElementById('minimizeCornerCrop');
const minimizeCornerRadius = document.getElementById('minimizeCornerRadius');
const wifiServerUrl = document.getElementById('wifiServerUrl');
const externalServerUrl = document.getElementById('externalServerUrl');

let isFolderWatching = false;

// 저장 폴더 표시 함수
async function updateUploadDirDisplay() {
  const result = await window.electronAPI.getUploadDir();
  if (result.success) {
    uploadDirPath.textContent = result.uploadDir;
  }
}

// 페이지 로드 시 저장 폴더 표시
updateUploadDirDisplay();

// 알림 권한 요청
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// 파일 크기 제한 설정 다이얼로그 이벤트 리스너 (페이지 로드 후 등록)
const maxFileSizeDialog = document.getElementById('maxFileSizeDialog');
const currentMaxFileSize = document.getElementById('currentMaxFileSize');
const maxFileSizeInput = document.getElementById('maxFileSizeInput');
const cancelMaxFileSize = document.getElementById('cancelMaxFileSize');
const saveMaxFileSize = document.getElementById('saveMaxFileSize');

// 다이얼로그 닫기 공통 함수
function closeDialog(dialogElement) {
  dialogElement.classList.add('hidden');
}

window.electronAPI.onOpenMaxFileSizeDialog(async (data) => {
  const currentSizeMB = (data.currentSize / 1024 / 1024).toFixed(1);
  currentMaxFileSize.textContent = currentSizeMB;
  maxFileSizeInput.value = Math.round(data.currentSize / 1024 / 1024);
  maxFileSizeDialog.classList.remove('hidden');
});

cancelMaxFileSize.addEventListener('click', () => closeDialog(maxFileSizeDialog));

saveMaxFileSize.addEventListener('click', async () => {
  const newSizeMB = parseFloat(maxFileSizeInput.value);
  if (newSizeMB > 0 && newSizeMB <= 1000) {
    const result = await window.electronAPI.setMaxFileSize(newSizeMB);
    if (result.success) {
      closeDialog(maxFileSizeDialog);
      currentMaxFileSize.textContent = newSizeMB;
      alert(`파일 크기 제한이 ${newSizeMB}MB로 설정되었습니다.`);
    } else {
      alert('설정 저장 실패: ' + result.error);
    }
  } else {
    alert('1MB ~ 1000MB 사이의 값을 입력해주세요.');
  }
});

// 동영상 주소 설정 다이얼로그 이벤트 리스너
window.electronAPI.onOpenVideoUrlDialog(async (data) => {
  currentVideoUrl.textContent = data.currentUrl || '설정되지 않음';
  videoUrlInput.value = data.currentUrl || '';
  videoUrlDialog.classList.remove('hidden');
});

cancelVideoUrl.addEventListener('click', () => closeDialog(videoUrlDialog));

saveVideoUrl.addEventListener('click', async () => {
  const newUrl = videoUrlInput.value.trim();
  if (newUrl) {
    const result = await window.electronAPI.setVideoUrl(newUrl);
    if (result.success) {
      closeDialog(videoUrlDialog);
      currentVideoUrl.textContent = newUrl;
      alert('동영상 주소가 설정되었습니다.');
    } else {
      alert('설정 저장 실패: ' + result.error);
    }
  } else {
    alert('동영상 주소를 입력해주세요.');
  }
});

// 저장 폴더 변경 이벤트 리스너
window.electronAPI.onUploadDirChanged((data) => {
  if (data.uploadDir) {
    uploadDirPath.textContent = data.uploadDir;
  }
});

// 메뉴 IPC 메시지 리스너
window.electronAPI.onToggleCornerCrop(() => {
  cornerCropCheckbox.checked = !cornerCropCheckbox.checked;
  minimizeCornerCrop.checked = cornerCropCheckbox.checked;
});

window.electronAPI.onToggleCornerRadius(() => {
  cornerRadiusCheckbox.checked = !cornerRadiusCheckbox.checked;
  minimizeCornerRadius.checked = cornerRadiusCheckbox.checked;
});

// 최소화 모드 전환 함수
async function switchToMinimizeMode() {
  minimizeMode.classList.remove('hidden');
  document.querySelector('.container').classList.add('hidden');
  await window.electronAPI.setWindowSize(250, 300);
  setTimeout(() => {
    if (!animationId) {
      animateDot();
    }
  }, 100);
}

// 일반 모드 전환 함수
async function switchToNormalMode() {
  minimizeMode.classList.add('hidden');
  document.querySelector('.container').classList.remove('hidden');
  await window.electronAPI.setWindowSize(800, 600);
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  dotX = 0;
  dotY = 0;
  minimizeDot.style.transform = 'translate(0, 0)';
}

// 최소화 모드 토글
minimizeModeBtn.addEventListener('click', async () => {
  await switchToMinimizeMode();
});

// 최소화 모드 종료
exitMinimizeMode.addEventListener('click', async () => {
  await switchToNormalMode();
});

// 최소화 모드 드롭존 클릭
minimizeDropZone.addEventListener('click', () => {
  fileInput.click();
});

// 최소화 모드 드래그 앤 드롭
minimizeDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  minimizeDropZone.classList.add('dragover');
});

minimizeDropZone.addEventListener('dragleave', () => {
  minimizeDropZone.classList.remove('dragover');
});

minimizeDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  minimizeDropZone.classList.remove('dragover');
  
  const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
  if (files.length > 0) {
    handleFiles(files);
  }
});

// 크기 조절 기능
const resizeHandle = document.querySelector('.minimize-resize-handle');
let isResizing = false;
let startX, startY, startWidth, startHeight;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  startX = e.clientX;
  startY = e.clientY;
  startWidth = minimizeMode.offsetWidth;
  startHeight = minimizeMode.offsetHeight;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  const width = startWidth + (e.clientX - startX);
  const height = startHeight + (e.clientY - startY);
  
  if (width >= 150 && width <= 400) {
    minimizeMode.style.width = width + 'px';
  }
  if (height >= 150 && height <= 400) {
    minimizeMode.style.height = height + 'px';
  }
});

document.addEventListener('mouseup', () => {
  isResizing = false;
});

// 검은 점 내벽 튕기는 애니메이션
const minimizeDot = document.querySelector('.minimize-dot');
let dotX = 0, dotY = 0;
let dotVX = 1.5, dotVY = 1.5;
const dotSpeed = 1.5;
const dotSize = 12;
let animationId = null;

function animateDot() {
  const container = document.querySelector('.minimize-dot-container');
  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight;
  const maxX = containerWidth / 2 - dotSize / 2;
  const maxY = containerHeight / 2 - dotSize / 2;
  
  dotX += dotVX;
  dotY += dotVY;
  
  // 내벽 충돌 체크
  if (dotX > maxX || dotX < -maxX) {
    dotVX = -dotVX;
    dotX = dotX > maxX ? maxX : -maxX;
  }
  if (dotY > maxY || dotY < -maxY) {
    dotVY = -dotVY;
    dotY = dotY > maxY ? maxY : -maxY;
  }
  
  minimizeDot.style.transform = `translate(${dotX}px, ${dotY}px)`;
  animationId = requestAnimationFrame(animateDot);
}

// 웹 서버 시작 이벤트 리스너
window.electronAPI.onWebServerStarted((data) => {
  console.log('웹 서버 시작 데이터 수신:', data);
  updateWebServerUI(data);
});

// 웹 서버 UI 업데이트 함수
function updateWebServerUI(data) {
  webServerSection.classList.remove('hidden');
  wifiServerUrl.textContent = data.localUrl;
  wifiServerUrl.href = data.localUrl;
  externalServerUrl.textContent = data.url;
  externalServerUrl.href = data.url;
  
  if (data.qrCode) {
    console.log('QR 코드 설정:', data.qrCode.substring(0, 50) + '...');
    webServerQR.src = data.qrCode;
    webServerQR.style.display = 'block';
  } else {
    console.log('QR 코드 없음');
    webServerQR.style.display = 'none';
  }
}

// 렌더러 로드 시 웹 서버 상태 요청
async function requestWebServerStatus() {
  try {
    const status = await window.electronAPI.getWebServerStatus();
    if (status) {
      console.log('웹 서버 상태 수신:', status);
      updateWebServerUI(status);
    }
  } catch (error) {
    console.log('웹 서버 상태 요청 실패:', error);
  }
}

// 페이지 로드 시 웹 서버 상태 요청
requestWebServerStatus();

// path 모듈 대신 파일명 추출 헬퍼 함수
function getBasename(filePath) {
  return filePath.split(/[/\\]/).pop();
}

// 진행 상태 요소
const progressCount = document.getElementById('progressCount');
const overallProgressBar = document.getElementById('overallProgressBar');
const overallProgressText = document.getElementById('overallProgressText');
const currentFileName = document.getElementById('currentFileName');
const currentFileStatus = document.getElementById('currentFileStatus');
const errorMessage = document.getElementById('errorMessage');

// 드래그 앤 드롭 이벤트
dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  handleFiles(files);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  
  const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
  if (files.length > 0) {
    handleFiles(files);
  }
});

// 파일 처리
async function handleFiles(files) {
  if (files.length === 0) {
    showError('이미지 파일을 선택해주세요.');
    return;
  }

  // 최소화 모드에서 파일 처리 시 옵션 동기화 및 일반 모드로 전환
  const isMinimizeMode = !minimizeMode.classList.contains('hidden');
  if (isMinimizeMode) {
    // 최소화 모드 옵션을 일반 모드 옵션에 동기화
    cornerCropCheckbox.checked = minimizeCornerCrop.checked;
    cornerRadiusCheckbox.checked = minimizeCornerRadius.checked;
    
    // 일반 모드로 전환 (결과 표시를 위해)
    await switchToNormalMode();
  }

  const filePaths = files.map(file => file.path);
  const options = {
    cornerCrop: cornerCropCheckbox.checked,
    cornerRadius: cornerRadiusCheckbox.checked
  };
  
  // UI 상태 변경
  dropZone.classList.add('hidden');
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  
  // 진행 상태 리스너 등록
  window.electronAPI.onProcessingProgress((progress) => {
    updateProgress(progress);
  });
  
  try {
    const result = await window.electronAPI.processImages(filePaths, options);
    
    // 리스너 제거
    window.electronAPI.removeProcessingProgressListener();
    
    if (result.success) {
      showResults(result.results);
      
      // 데스크톱 알림 전송
      if ('Notification' in window && Notification.permission === 'granted') {
        const successCount = result.results.filter(r => r.success).length;
        new Notification('이미지 처리 완료', {
          body: `${successCount}/${result.results.length}개 파일 처리가 완료되었습니다.`
        });
      }
    } else {
      showError(result.error);
    }
  } catch (error) {
    window.electronAPI.removeProcessingProgressListener();
    showError(error.message);
  }
}

// 진행 상태 업데이트
function updateProgress(progress) {
  if (progress.overallProgress !== undefined) {
    progressCount.textContent = `${progress.currentIndex} / ${progress.total}`;
    overallProgressBar.style.width = `${progress.overallProgress}%`;
    overallProgressText.textContent = `${Math.round(progress.overallProgress)}%`;
  }
  
  if (progress.currentFile) {
    currentFileName.textContent = progress.currentFile;
  }
  
  if (progress.message) {
    currentFileStatus.textContent = progress.message;
  }
}

// 결과 표시
function showResults(results) {
  progressSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  
  resultsList.innerHTML = '';
  
  results.forEach((result, index) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'result-name';
    nameSpan.textContent = result.filename || `파일 ${index + 1}`;
    
    const statusSpan = document.createElement('span');
    statusSpan.className = `result-status ${result.success ? '' : 'error'}`;
    statusSpan.textContent = result.success ? '완료' : '실패';
    
    item.appendChild(nameSpan);
    item.appendChild(statusSpan);
    resultsList.appendChild(item);
  });
}

// 오류 표시
function showError(message) {
  progressSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  errorSection.classList.remove('hidden');
  errorMessage.textContent = message;
}

// 리셋 버튼
resetBtn.addEventListener('click', resetUI);
errorResetBtn.addEventListener('click', resetUI);

// 폴더 감시 버튼
selectFolderBtn.addEventListener('click', async () => {
  if (isFolderWatching) {
    // 감시 중지
    const result = await window.electronAPI.stopFolderWatch();
    if (result.success) {
      isFolderWatching = false;
      selectFolderBtn.textContent = '폴더 감시 시작';
      selectFolderBtn.classList.remove('active');
      folderWatchStatus.textContent = '';
      window.electronAPI.removeFolderWatchNewFileListener();
    }
  } else {
    // 폴더 선택 및 감시 시작
    const result = await window.electronAPI.selectFolder();
    if (result.success) {
      const watchResult = await window.electronAPI.startFolderWatch(result.folderPath);
      if (watchResult.success) {
        isFolderWatching = true;
        selectFolderBtn.textContent = '폴더 감시 중지';
        selectFolderBtn.classList.add('active');
        folderWatchStatus.textContent = `감시 중: ${result.folderPath}`;
        
        // 새 파일 감시 리스너 등록
        window.electronAPI.onFolderWatchNewFile(async (filePath) => {
          console.log('새 파일 감지:', filePath);
          try {
            // 파일 처리
            const file = {
              path: filePath,
              name: getBasename(filePath)
            };
            await handleFiles([file]);
          } catch (error) {
            console.error('폴더 감시 파일 처리 오류:', error);
          }
        });
      }
    }
  }
});

// Ctrl+V 클립보드 붙여넣기
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.key === 'v') {
    e.preventDefault();
    
    // 클립보드에 이미지가 있는지 확인
    const hasImage = await window.electronAPI.hasClipboardImage();
    if (!hasImage) {
      showError('클립보드에 이미지가 없습니다.');
      return;
    }
    
    // 클립보드 이미지 읽기
    const result = await window.electronAPI.readClipboardImage();
    if (result.success) {
      // 파일 객체 생성
      const file = {
        path: result.filePath,
        name: getBasename(result.filePath)
      };
      
      await handleFiles([file]);
    } else {
      showError(result.message || result.error);
    }
  }
});

function resetUI() {
  dropZone.classList.remove('hidden');
  progressSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  fileInput.value = '';
  
  // 진행 상태 초기화
  progressCount.textContent = '0 / 0';
  overallProgressBar.style.width = '0%';
  overallProgressText.textContent = '0%';
  currentFileName.textContent = '-';
  currentFileStatus.textContent = '-';
}
