const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, Menu, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { processImage, processMultipleImages } = require('./utils/imageProcessor');
const chokidar = require('chokidar');

let mainWindow;
let folderWatcher = null;
let webServer = null;
let uploadDir = path.join(os.homedir(), 'Desktop', 'images');
let maxFileSize = 10 * 1024 * 1024; // 기본 10MB
let videoUrl = 'https://www.youtube.com/embed/_4W8MKfioDU?autoplay=1&mute=1'; // 기본 동영상 주소

// 통계 데이터
let statistics = {
  totalProcessed: 0,
  totalOriginalSize: 0,
  totalOptimizedSize: 0,
  totalSaved: 0,
  lastUpdated: null
};

// 웹 서버 상태 저장
let webServerStatus = null;

// 웹 서버 상태 요청 핸들러
ipcMain.handle('get-web-server-status', async () => {
  return webServerStatus;
});

// 통계 업데이트 함수
function updateStatistics(comparison) {
  if (comparison) {
    statistics.totalProcessed++;
    statistics.totalOriginalSize += comparison.original.size;
    statistics.totalOptimizedSize += comparison.optimized.size;
    statistics.totalSaved += comparison.reduction.bytes;
    statistics.lastUpdated = new Date().toISOString();
  }
}

// 설정 파일 경로
const configPath = path.join(app.getPath('userData'), 'config.json');

// 설정 저장
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('설정 저장 실패:', error);
  }
}

// 설정 로드
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.uploadDir) {
        uploadDir = config.uploadDir;
      }
      if (config.maxFileSize) {
        maxFileSize = config.maxFileSize;
      }
      if (config.videoUrl) {
        videoUrl = config.videoUrl;
      }
      return config;
    }
  } catch (error) {
    console.error('설정 로드 실패:', error);
  }
  return { uploadDir, maxFileSize, videoUrl };
}

// 웹 서버 설정
const webApp = express();

// multer 설정 함수
function createUpload() {
  return multer({ 
    dest: uploadDir,
    limits: {
      fileSize: maxFileSize
    },
    fileFilter: (req, file, cb) => {
      // 파일명 UTF-8 디코딩
      try {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch (e) {
        // 디코딩 실패 시 원본 파일명 사용
      }
      cb(null, true);
    }
  });
}

let upload = createUpload();

// 로컬 IP 주소 가져오기
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// 웹 서버 시작
function startWebServer() {
  const port = 8080;
  
  // 요청 로깅 미들웨어
  webApp.use((req, res, next) => {
    console.log(`[요청] ${req.method} ${req.url} from ${req.ip}`);
    next();
  });
  
  // 정적 파일 제공 (캐싱 비활성화로 실시간 반영)
  webApp.use(express.static(path.join(__dirname, 'web'), {
    etag: false,
    lastModified: false,
    setHeaders: (res, path) => {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  
  // 동영상 주소 API 엔드포인트
  webApp.get('/api/video-url', (req, res) => {
    res.json({ success: true, videoUrl });
  });
  
  // 통계 조회 API 엔드포인트
  webApp.get('/api/statistics', (req, res) => {
    const reductionPercentage = statistics.totalOriginalSize > 0 
      ? ((statistics.totalSaved / statistics.totalOriginalSize) * 100).toFixed(2)
      : 0;
    
    res.json({ 
      success: true, 
      statistics: {
        ...statistics,
        reductionPercentage: reductionPercentage
      }
    });
  });
  
  // 파일 업로드 엔드포인트 (단일 파일)
  webApp.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '파일이 없습니다' });
      }
      
      const uploadedPath = req.file.path;
      const ext = path.extname(req.file.originalname);
      const baseName = path.basename(req.file.originalname, ext);
      const timestamp = Date.now();
      const uniqueFilename = `${baseName}_${timestamp}${ext}`;
      const targetPath = path.join(uploadDir, uniqueFilename);
      
      // 파일 이동 (고유한 파일명 사용)
      fs.renameSync(uploadedPath, targetPath);
      
      // 이미지 처리 (크롭 옵션 포함)
      const options = {
        cornerCrop: req.body.cornerCrop === 'true',
        cornerRadius: req.body.cornerRadius === 'true'
      };
      const result = await processImage(targetPath, (progress) => {
        mainWindow.webContents.send('processing-progress', progress);
      }, options).catch(error => {
        console.error('이미지 처리 오류:', error);
        throw error;
      });
      
      // 통계 업데이트
      updateStatistics(result.comparison);
      
      // 데스크톱 알림 전송
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: '이미지 처리 완료',
          body: `${path.basename(targetPath)} 처리가 완료되었습니다.`,
          silent: false
        });
        notification.show();
      }
      
      res.json({ 
        success: true, 
        message: '파일 업로드 및 처리 완료',
        comparison: result.comparison
      });
      
      // 처리 완료 후 로그 확인
      const logFilePath = path.join(__dirname, 'logs/app.log');
      if (fs.existsSync(logFilePath)) {
        const logContent = fs.readFileSync(logFilePath, 'utf8');
        const logLines = logContent.split('\n').filter(line => line.trim());
        const recentLogs = logLines.slice(-20); // 최근 20줄
        console.log('=== 최근 로그 ===');
        recentLogs.forEach(line => console.log(line));
        console.log('================');
      }
    } catch (error) {
      console.error('파일 업로드 오류:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 다중 파일 업로드 엔드포인트
  webApp.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '파일이 없습니다' });
      }
      
      const uploadedFiles = req.files;
      const results = [];
      
      for (const file of uploadedFiles) {
        try {
          const uploadedPath = file.path;
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          const timestamp = Date.now();
          const uniqueFilename = `${baseName}_${timestamp}${ext}`;
          const targetPath = path.join(uploadDir, uniqueFilename);
          
          // 파일 이동
          fs.renameSync(uploadedPath, targetPath);
          
          // 이미지 처리
          const options = {
            cornerCrop: req.body.cornerCrop === 'true',
            cornerRadius: req.body.cornerRadius === 'true'
          };
          const result = await processImage(targetPath, (progress) => {
            mainWindow.webContents.send('processing-progress', progress);
          }, options).catch(error => {
            console.error('이미지 처리 오류:', error);
            throw error;
          });
          
          // 통계 업데이트
          updateStatistics(result.comparison);
          
          results.push({
            originalName: file.originalname,
            filename: result.filename,
            success: true,
            comparison: result.comparison
          });
        } catch (error) {
          console.error(`파일 처리 오류 (${file.originalname}):`, error);
          results.push({
            originalName: file.originalname,
            success: false,
            error: error.message
          });
        }
      }
      
      // 데스크톱 알림 전송
      if (Notification.isSupported()) {
        const successCount = results.filter(r => r.success).length;
        const notification = new Notification({
          title: '이미지 처리 완료',
          body: `${successCount}/${results.length}개 파일 처리가 완료되었습니다.`,
          silent: false
        });
        notification.show();
      }
      
      res.json({ 
        success: true, 
        message: `${results.length}개 파일 처리 완료`,
        results: results
      });
    } catch (error) {
      console.error('다중 파일 업로드 오류:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Multer 에러 처리
  webApp.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(1);
        return res.status(413).json({ 
          error: `파일 크기가 ${maxSizeMB}MB를 초과했습니다. 현재 제한: ${maxSizeMB}MB` 
        });
      }
    }
    next(error);
  });
  
  // 웹 서버 시작
  webServer = webApp.listen(port, '0.0.0.0', () => {
    const localIP = getLocalIP();
    const serverURL = `http://${localIP}:${port}`;
    console.log(`웹 서버 시작: ${serverURL}`);
    
    // QR 코드 생성 및 렌더러로 전송
    generateQRCodeAndSend(serverURL);
  });
}

// QR 코드 생성 및 전송 함수
function generateQRCodeAndSend(serverURL) {
  console.log('QR 코드 생성 시작:', serverURL);
  QRCode.toDataURL(serverURL, (err, url) => {
    if (err) {
      console.error('QR 코드 생성 오류:', err);
      webServerStatus = { 
        url: serverURL, 
        localUrl: serverURL,
        qrCode: null 
      };
    } else {
      console.log('QR 코드 생성 성공');
      webServerStatus = { 
        url: serverURL, 
        localUrl: serverURL,
        qrCode: url 
      };
    }
    mainWindow.webContents.send('web-server-started', webServerStatus);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'SEO 이미지 최적화'
  });

  mainWindow.loadFile('renderer/index.html');
  
  // 개발자 도구 자동 열기 (디버깅용)
  mainWindow.webContents.openDevTools();

  // 상단 메뉴 생성
  const template = [
    {
      label: '파일',
      submenu: [
        {
          label: '저장 폴더 설정',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory']
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const dirPath = result.filePaths[0];
              if (fs.existsSync(dirPath)) {
                uploadDir = dirPath;
                saveConfig({ uploadDir });
                mainWindow.webContents.send('upload-dir-changed', { uploadDir });
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: '저장 폴더 변경',
                  message: `저장 폴더가 ${uploadDir}로 변경되었습니다.`
                });
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: '종료',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '에디터',
      submenu: [
        {
          label: '모서리 크롭',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            mainWindow.webContents.send('toggle-corner-crop');
          }
        },
        {
          label: '모서리 둥글게',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            mainWindow.webContents.send('toggle-corner-radius');
          }
        }
      ]
    },
    {
      label: '도구',
      submenu: [
        {
          label: '웹 서버 시작',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            startWebServer();
          }
        },
        {
          label: '폴더 감시 시작',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            mainWindow.webContents.send('start-folder-watch');
          }
        },
        {
          label: '폴더 감시 중지',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            mainWindow.webContents.send('stop-folder-watch');
          }
        },
        { type: 'separator' },
        {
          label: '로그 보기',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            const logPath = path.join(__dirname, 'logs', 'app.log');
            if (fs.existsSync(logPath)) {
              shell.openPath(logPath);
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '로그 파일',
                message: '로그 파일이 없습니다.'
              });
            }
          }
        },
        {
          label: '저장 폴더 열기',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (fs.existsSync(uploadDir)) {
              shell.openPath(uploadDir);
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: '폴더 열기',
                message: '저장 폴더가 존재하지 않습니다.'
              });
            }
          }
        }
      ]
    },
    {
      label: '설정',
      submenu: [
        {
          label: '파일 크기 제한 설정',
          click: () => {
            mainWindow.webContents.send('open-max-file-size-dialog', {
              currentSize: maxFileSize
            });
          }
        },
        {
          label: '동영상 주소 설정',
          click: () => {
            mainWindow.webContents.send('open-video-url-dialog', {
              currentUrl: videoUrl
            });
          }
        },
        { type: 'separator' },
        {
          label: '설정 초기화',
          click: async () => {
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: '설정 초기화',
              message: '모든 설정을 기본값으로 초기화하시겠습니까?',
              buttons: ['취소', '초기화'],
              defaultId: 0
            });
            if (result.response === 1) {
              const configPath = path.join(app.getPath('userData'), 'config.json');
              if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
              }
              uploadDir = path.join(os.homedir(), 'Desktop', 'images');
              maxFileSize = 10 * 1024 * 1024;
              saveConfig({ uploadDir, maxFileSize });
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '설정 초기화',
                message: '설정이 초기화되었습니다. 앱을 다시 시작하세요.'
              });
            }
          }
        }
      ]
    },
    {
      label: '도움말',
      submenu: [
        {
          label: '현재 저장 폴더',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '현재 저장 폴더',
              message: `현재 저장 폴더: ${uploadDir}`
            });
          }
        },
        {
          label: '쓰레드',
          click: () => {
            shell.openExternal('https://www.threads.net/@salad');
          }
        },
        { type: 'separator' },
        {
          label: '앱 정보',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'SEO 이미지 최적화',
              message: '버전: 1.0.0\n\n이미지를 최적화하고 SEO 친화적인 메타데이터를 추가하는 앱입니다.'
            });
          }
        },
        {
          label: '단축키 안내',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '단축키',
              message: '저장 폴더 설정: CmdOrCtrl+S\n모서리 크롭: CmdOrCtrl+Shift+C\n모서리 둥글게: CmdOrCtrl+Shift+R\n웹 서버 시작: CmdOrCtrl+W\n폴더 감시 시작: CmdOrCtrl+F\n폴더 감시 중지: CmdOrCtrl+Shift+F\n로그 보기: CmdOrCtrl+L\n저장 폴더 열기: CmdOrCtrl+O\n종료: CmdOrCtrl+Q'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  loadConfig(); // 설정 로드
  createWindow();
  startWebServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 핸들러
ipcMain.handle('set-window-size', async (event, width, height) => {
  if (mainWindow) {
    mainWindow.setSize(width, height);
    mainWindow.center();
    return { success: true };
  }
  return { success: false, error: 'Window not found' };
});

ipcMain.handle('process-images', async (event, filePaths, options = {}) => {
  try {
    // 병렬 처리 (동시 2개로 제한)
    const results = await processMultipleImages(filePaths, (progress) => {
      mainWindow.webContents.send('processing-progress', progress);
    }, 2, options);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 폴더 감시 시작
ipcMain.handle('start-folder-watch', async (event, folderPath) => {
  try {
    // 기존 감시 중지
    if (folderWatcher) {
      await folderWatcher.close();
    }

    // 처리된 파일 추적
    const processedFiles = new Set();

    // 기존 파일 자동 처리
    try {
      const existingFiles = fs.readdirSync(folderPath);
      const imageFiles = existingFiles.filter(file => 
        file.match(/\.(jpg|jpeg|png|gif|bmp)$/i) && !file.endsWith('.webp')
      );
      
      for (const file of imageFiles) {
        const filePath = path.join(folderPath, file);
        processedFiles.add(filePath);
        
        try {
          await processImage(filePath, (progress) => {
            mainWindow.webContents.send('processing-progress', progress);
          });
        } catch (error) {
          console.error('기존 파일 처리 오류:', error);
        }
      }
      
      console.log(`기존 파일 ${imageFiles.length}개 처리 완료`);
    } catch (error) {
      console.error('기존 파일 스캔 오류:', error);
    }

    // 주기적 폴더 스캔 (5분마다)
    const scanInterval = setInterval(async () => {
      try {
        const currentFiles = fs.readdirSync(folderPath);
        const imageFiles = currentFiles.filter(file => 
          file.match(/\.(jpg|jpeg|png|gif|bmp)$/i) && !file.endsWith('.webp')
        );
        
        for (const file of imageFiles) {
          const filePath = path.join(folderPath, file);
          if (!processedFiles.has(filePath)) {
            processedFiles.add(filePath);
            
            try {
              await processImage(filePath, (progress) => {
                mainWindow.webContents.send('processing-progress', progress);
              });
              console.log(`주기적 스캔: ${filePath} 처리 완료`);
            } catch (error) {
              console.error('주기적 스캔 파일 처리 오류:', error);
            }
          }
        }
      } catch (error) {
        console.error('주기적 스캔 오류:', error);
      }
    }, 5 * 60 * 1000); // 5분마다

    // 새 감시 시작
    folderWatcher = chokidar.watch(folderPath, {
      ignored: [
        /(^|[\/\\])\../, // 숨김 파일 무시
        /node_modules/, // node_modules 무시
        /\.temp$/, // 임시 파일 무시
        /\.temp\.webp$/, // WebP 임시 파일 무시
        /\.webp$/ // 모든 WebP 파일 무시 (처리된 파일)
      ],
      persistent: true,
      ignoreInitial: true // 초기 파일 무시
    });

    folderWatcher.on('add', async (filePath) => {
      // 이미지 파일만 처리
      if (filePath.match(/\.(jpg|jpeg|png|gif|bmp)$/i)) {
        // 이미 처리된 파일인지 확인
        if (processedFiles.has(filePath)) {
          return;
        }
        
        processedFiles.add(filePath);
        mainWindow.webContents.send('folder-watch-new-file', filePath);
        
        // 자동 처리
        try {
          await processImage(filePath, (progress) => {
            mainWindow.webContents.send('processing-progress', progress);
          });
        } catch (error) {
          console.error('폴더 감시 이미지 처리 오류:', error);
        }
      }
    });

    // 감시 중지 시 인터벌 정리
    folderWatcher.on('close', () => {
      clearInterval(scanInterval);
    });

    return { success: true, message: '폴더 감시 시작' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 폴더 감시 중지
ipcMain.handle('stop-folder-watch', async () => {
  try {
    if (folderWatcher) {
      await folderWatcher.close();
      folderWatcher = null;
    }
    return { success: true, message: '폴더 감시 중지' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 폴더 선택 대화상자
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) {
    return { success: false, message: '취소됨' };
  }
  
  return { success: true, folderPath: result.filePaths[0] };
});

// 클립보드 이미지 확인
ipcMain.handle('has-clipboard-image', async () => {
  try {
    const image = clipboard.readImage();
    return !image.isEmpty();
  } catch (error) {
    return false;
  }
});

// 클립보드 이미지 읽기
ipcMain.handle('read-clipboard-image', async () => {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return { success: false, message: '클립보드에 이미지가 없습니다' };
    }
    
    // 임시 파일로 저장
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `clipboard-${Date.now()}.png`);
    const buffer = image.toPNG();
    fs.writeFileSync(tempPath, buffer);
    
    return { success: true, filePath: tempPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 저장 폴더 설정
ipcMain.handle('set-upload-dir', async (event, dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      uploadDir = dirPath;
      saveConfig({ uploadDir });
      return { success: true, uploadDir };
    } else {
      return { success: false, error: '폴더가 존재하지 않습니다' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 저장 폴더 가져오기
ipcMain.handle('get-upload-dir', async () => {
  return { success: true, uploadDir };
});

// 파일 크기 제한 설정
ipcMain.handle('set-max-file-size', async (event, sizeMB) => {
  try {
    const newSize = sizeMB * 1024 * 1024;
    maxFileSize = newSize;
    saveConfig({ uploadDir, maxFileSize });
    
    // multer 설정 다시 생성
    upload = createUpload();
    
    // 웹 서버가 실행 중이면 재시작
    if (webServer) {
      webServer.close();
      startWebServer();
    }
    
    return { success: true, maxFileSize };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 파일 크기 제한 가져오기
ipcMain.handle('get-max-file-size', async () => {
  return { success: true, maxFileSize };
});

// 동영상 주소 설정
ipcMain.handle('set-video-url', async (event, url) => {
  try {
    videoUrl = url;
    saveConfig({ uploadDir, maxFileSize, videoUrl });
    return { success: true, videoUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 동영상 주소 가져오기
ipcMain.handle('get-video-url', async () => {
  return { success: true, videoUrl };
});

// 이미지 자동 삭제 기능 (1시간 단위)
let autoDeleteInterval = null;

function startAutoDelete() {
  if (autoDeleteInterval) {
    clearInterval(autoDeleteInterval);
  }

  autoDeleteInterval = setInterval(() => {
    try {
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
        
        files.forEach(file => {
          const filePath = path.join(uploadDir, file);
          const ext = path.extname(file).toLowerCase();
          
          if (imageExtensions.includes(ext)) {
            const stats = fs.statSync(filePath);
            const fileAge = Date.now() - stats.mtimeMs;
            const oneHour = 60 * 60 * 1000;
            
            if (fileAge > oneHour) {
              fs.unlinkSync(filePath);
              console.log(`자동 삭제: ${file}`);
            }
          }
        });
      }
    } catch (error) {
      console.error('자동 삭제 오류:', error);
    }
  }, 60 * 60 * 1000); // 1시간마다 실행
}

// 앱 시작 시 자동 삭제 시작
app.whenReady().then(() => {
  startAutoDelete();
});
