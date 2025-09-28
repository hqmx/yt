const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class SimpleBrowserExtractor {
  constructor() {
    console.log('🌐 간단한 브라우저 추출기 초기화됨');
    this.browser = null;
    this.context = null;
    this.timeout = 30000; // 30초
  }

  /**
   * 브라우저 초기화 (프록시 설정 옵션)
   */
  async initializeBrowser(proxyConfig = null) {
    try {
      console.log('🚀 브라우저 시작 중...');

      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      };

      // 프록시 설정이 있는 경우 적용
      if (proxyConfig) {
        console.log(`🌐 프록시 적용: ${proxyConfig.host}:${proxyConfig.port}`);
        launchOptions.proxy = {
          server: `http://${proxyConfig.host}:${proxyConfig.port}`,
          username: proxyConfig.username,
          password: proxyConfig.password
        };
      } else {
        console.log('🔓 프록시 없이 직접 연결');
      }

      this.browser = await chromium.launch(launchOptions);
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        ignoreHTTPSErrors: true
      });

      console.log('✅ 브라우저 초기화 완료');
      return true;

    } catch (error) {
      console.error(`❌ 브라우저 초기화 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 경쟁사 사이트에서 YouTube 다운로드 URL 직접 추출
   */
  async extractDownloadUrlViaBrowser(videoUrl, quality = '720p', useProxy = false) {
    try {
      console.log(`🔍 브라우저로 YouTube URL 추출: ${videoUrl} (${quality})`);

      // 프록시 설정 (EC2에서만)
      let proxyConfig = null;
      if (useProxy) {
        const proxyPoolManager = require('../proxyPoolManager');
        const bestProxies = proxyPoolManager.getBestProxies(1);
        if (bestProxies.length > 0) {
          const proxy = bestProxies[0];
          proxyConfig = {
            host: proxy.host,
            port: proxy.port,
            username: proxy.username,
            password: proxy.password
          };
        }
      }

      await this.initializeBrowser(proxyConfig);
      const page = await this.context.newPage();

      try {
        // YouTube 비디오 ID 추출
        const videoId = this.extractVideoId(videoUrl);
        console.log(`📺 비디오 ID: ${videoId}`);

        // 1차 시도: SSYouTube를 통한 간접 접근
        console.log('🟦 SSYouTube 방식 시도...');
        const ssyoutubeUrl = `https://ssyoutube.com/watch?v=${videoId}`;
        
        await page.goto(ssyoutubeUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: this.timeout 
        });

        // 페이지 로딩 대기
        await page.waitForTimeout(3000);

        // Google Video URL 찾기
        const googleVideoUrls = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          return links
            .map(link => link.href)
            .filter(url => url.includes('googlevideo.com') && url.includes('videoplayback'))
            .slice(0, 3); // 최대 3개
        });

        if (googleVideoUrls.length > 0) {
          console.log(`✅ ${googleVideoUrls.length}개 Google Video URL 발견`);
          
          // 첫 번째 URL로 실제 다운로드 테스트
          const testUrl = googleVideoUrls[0];
          const isValid = await this.validateDownloadUrl(testUrl);
          
          if (isValid) {
            return {
              success: true,
              downloadUrl: testUrl,
              quality: quality,
              service: 'SSYouTube (Browser)',
              method: 'browser_extraction',
              alternativeUrls: googleVideoUrls.slice(1)
            };
          }
        }

        // 2차 시도: SaveFrom.net 방식
        console.log('🔗 SaveFrom.net 방식 시도...');
        await page.goto('https://savefrom.net/', { 
          waitUntil: 'domcontentloaded',
          timeout: this.timeout 
        });

        // URL 입력 및 처리
        await page.fill('input[name="sf_url"]', videoUrl);
        await page.click('input[type="submit"], button[type="submit"], .btn-submit');
        
        // 결과 대기
        await page.waitForTimeout(5000);
        
        // 다운로드 링크 찾기
        const saveFromUrls = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          return links
            .map(link => ({ url: link.href, text: link.textContent }))
            .filter(item => 
              item.url.includes('googlevideo.com') || 
              item.text.includes('Download') || 
              item.text.includes('MP4')
            )
            .map(item => item.url);
        });

        if (saveFromUrls.length > 0) {
          console.log(`✅ SaveFrom에서 ${saveFromUrls.length}개 URL 발견`);
          
          const testUrl = saveFromUrls[0];
          const isValid = await this.validateDownloadUrl(testUrl);
          
          if (isValid) {
            return {
              success: true,
              downloadUrl: testUrl,
              quality: quality,
              service: 'SaveFrom (Browser)',
              method: 'browser_extraction'
            };
          }
        }

        // 실패
        throw new Error('모든 브라우저 추출 방법 실패');

      } finally {
        await page.close();
      }

    } catch (error) {
      console.error(`❌ 브라우저 추출 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        service: 'Browser Extractor'
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 다운로드 URL 유효성 검증
   */
  async validateDownloadUrl(url) {
    try {
      console.log('🔍 URL 유효성 검증 중...');
      
      const response = await axios.head(url, { 
        timeout: 10000,
        validateStatus: status => status < 400
      });
      
      const contentLength = parseInt(response.headers['content-length'] || 0);
      console.log(`📏 컨텐츠 크기: ${contentLength} 바이트`);
      
      // 최소 1MB 이상이어야 유효한 비디오로 간주
      return contentLength > 1024 * 1024;
      
    } catch (error) {
      console.warn(`⚠️ URL 검증 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * YouTube URL에서 비디오 ID 추출
   */
  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    throw new Error('유효하지 않은 YouTube URL입니다');
  }

  /**
   * 실제 파일 다운로드 (axios 사용)
   */
  async downloadFile(downloadUrl, outputPath, onProgress = null) {
    try {
      console.log(`⬇️ 파일 다운로드 시작: ${outputPath}`);
      
      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const startTime = Date.now();
      
      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: 120000, // 2분
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const totalSize = parseInt(response.headers['content-length']) || 0;
      let downloadedSize = 0;

      const writeStream = fs.createWriteStream(outputPath);
      
      // 진행률 추적
      if (onProgress && totalSize > 0) {
        response.data.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progressPercent = ((downloadedSize / totalSize) * 100).toFixed(1);
          console.log(`📥 진행률: ${progressPercent}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
          
          onProgress({
            downloadedSize,
            totalSize,
            progressPercent,
            elapsedTime: Date.now() - startTime
          });
        });
      }

      response.data.pipe(writeStream);

      return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          const totalTime = Date.now() - startTime;
          const fileStats = fs.statSync(outputPath);
          const avgSpeed = (fileStats.size / 1024 / 1024) / (totalTime / 1000);
          
          console.log(`✅ 다운로드 완료: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB (${avgSpeed.toFixed(2)}MB/s)`);
          
          resolve({
            success: true,
            filePath: outputPath,
            fileSize: fileStats.size,
            totalTime: totalTime,
            avgSpeed: avgSpeed
          });
        });

        writeStream.on('error', reject);
        response.data.on('error', reject);
      });

    } catch (error) {
      console.error(`❌ 다운로드 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 전체 프로세스: 추출 + 다운로드
   */
  async extractAndDownload(videoUrl, outputPath, options = {}) {
    const { quality = '720p', useProxy = false, onProgress = null } = options;
    
    try {
      console.log(`🚀 전체 프로세스 시작: ${videoUrl}`);

      // 1. URL 추출
      const extractResult = await this.extractDownloadUrlViaBrowser(videoUrl, quality, useProxy);
      
      if (!extractResult.success) {
        throw new Error(`URL 추출 실패: ${extractResult.error}`);
      }

      console.log(`✅ URL 추출 성공: ${extractResult.service}`);

      // 2. 파일 다운로드
      const downloadResult = await this.downloadFile(extractResult.downloadUrl, outputPath, onProgress);

      return {
        success: true,
        extraction: extractResult,
        download: downloadResult,
        totalProcessTime: Date.now()
      };

    } catch (error) {
      console.error(`❌ 전체 프로세스 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 리소스 정리
   */
  async cleanup() {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      console.log('🧹 브라우저 리소스 정리 완료');
    } catch (error) {
      console.warn(`⚠️ 정리 중 오류: ${error.message}`);
    }
  }
}

module.exports = new SimpleBrowserExtractor();