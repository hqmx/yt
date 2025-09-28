const { chromium } = require('playwright');
const proxyPoolManager = require('../proxyPoolManager');
const fs = require('fs');
const path = require('path');

class PlaywrightExtractor {
  constructor() {
    console.log('🎭 Playwright 추출기 초기화됨');
    this.browser = null;
    this.context = null;
    this.timeout = 60000; // 60초
  }

  /**
   * Playwright 브라우저 초기화 (프록시 포함)
   */
  async initializeBrowser(useProxy = true) {
    try {
      console.log('🚀 Playwright 브라우저 초기화 중...');

      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      };

      // 프록시 설정
      if (useProxy) {
        const bestProxies = proxyPoolManager.getBestProxies(1);
        if (bestProxies.length > 0) {
          const proxy = bestProxies[0];
          console.log(`🌐 프록시 사용: ${proxy.id}`);
          
          launchOptions.proxy = {
            server: `http://${proxy.host}:${proxy.port}`,
            username: proxy.username,
            password: proxy.password
          };
        } else {
          console.warn('⚠️ 사용 가능한 프록시가 없음, 직접 연결 사용');
        }
      }

      this.browser = await chromium.launch(launchOptions);
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true
      });

      console.log('✅ Playwright 브라우저 초기화 완료');
      return true;

    } catch (error) {
      console.error(`❌ Playwright 초기화 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * SaveFrom.net을 통한 YouTube URL 추출 (Playwright)
   */
  async extractViaSaveFrom(videoUrl, quality = '720p') {
    try {
      console.log(`🔗 SaveFrom.net 브라우저 추출 시작: ${videoUrl} (${quality})`);

      if (!this.context) {
        await this.initializeBrowser();
      }

      const page = await this.context.newPage();
      
      try {
        // 1. SaveFrom.net 메인 페이지 접근
        console.log('📄 SaveFrom.net 페이지 로딩...');
        await page.goto('https://savefrom.net/', { 
          waitUntil: 'networkidle',
          timeout: this.timeout 
        });

        // 2. URL 입력 필드에 YouTube URL 입력
        console.log('📝 YouTube URL 입력 중...');
        await page.fill('input[name="sf_url"]', videoUrl);
        
        // 3. 다운로드 버튼 클릭
        console.log('🔍 분석 버튼 클릭...');
        await page.click('input[value="Download"]');
        
        // 4. 결과 대기
        console.log('⏳ 다운로드 링크 생성 대기...');
        await page.waitForSelector('.def-btn-box', { timeout: this.timeout });

        // 5. 다운로드 링크 추출
        const downloadLinks = await page.$$eval('a.link-download', links => {
          return links.map(link => ({
            url: link.href,
            text: link.textContent.trim(),
            quality: link.textContent.includes('720p') ? '720p' : 
                    link.textContent.includes('480p') ? '480p' : 
                    link.textContent.includes('360p') ? '360p' : 'unknown'
          }));
        });

        console.log(`✅ ${downloadLinks.length}개 다운로드 링크 발견`);

        // 6. 원하는 품질 선택
        const targetLink = this.selectBestQualityLink(downloadLinks, quality);
        
        if (targetLink) {
          console.log(`🎯 ${targetLink.quality} 품질 링크 선택됨`);
          return {
            success: true,
            downloadUrl: targetLink.url,
            quality: targetLink.quality,
            service: 'SaveFrom.net (Playwright)',
            method: 'browser_automation'
          };
        } else {
          throw new Error('원하는 품질의 다운로드 링크를 찾을 수 없습니다');
        }

      } finally {
        await page.close();
      }

    } catch (error) {
      console.error(`❌ SaveFrom 브라우저 추출 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        service: 'SaveFrom.net (Playwright)'
      };
    }
  }

  /**
   * SSYouTube.com을 통한 YouTube URL 추출 (Playwright)
   */
  async extractViaSSYouTube(videoUrl, quality = '720p') {
    try {
      console.log(`🟦 SSYouTube 브라우저 추출 시작: ${videoUrl} (${quality})`);

      if (!this.context) {
        await this.initializeBrowser();
      }

      const page = await this.context.newPage();
      
      try {
        // 1. YouTube URL을 SSYouTube URL로 변환
        const ssyoutubeUrl = this.convertToSSYouTubeUrl(videoUrl);
        console.log(`🔗 SSYouTube URL: ${ssyoutubeUrl}`);

        // 2. SSYouTube 페이지 접근
        console.log('📄 SSYouTube 페이지 로딩...');
        await page.goto(ssyoutubeUrl, { 
          waitUntil: 'networkidle',
          timeout: this.timeout 
        });

        // 3. 다운로드 링크 대기 및 추출
        console.log('⏳ 다운로드 링크 대기...');
        await page.waitForSelector('a[href*="googlevideo.com"]', { timeout: this.timeout });

        // 4. Google Video URL 추출
        const googleVideoUrls = await page.$$eval('a[href*="googlevideo.com"]', links => {
          return links.map(link => link.href).filter(url => url.includes('googlevideo.com'));
        });

        console.log(`✅ ${googleVideoUrls.length}개 Google Video URL 발견`);

        if (googleVideoUrls.length > 0) {
          // 첫 번째 Google Video URL 사용 (일반적으로 최적 품질)
          return {
            success: true,
            downloadUrl: googleVideoUrls[0],
            quality: quality,
            service: 'SSYouTube.com (Playwright)',
            method: 'browser_automation'
          };
        } else {
          throw new Error('Google Video URL을 찾을 수 없습니다');
        }

      } finally {
        await page.close();
      }

    } catch (error) {
      console.error(`❌ SSYouTube 브라우저 추출 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        service: 'SSYouTube.com (Playwright)'
      };
    }
  }

  /**
   * Y2mate.com을 통한 YouTube URL 추출 (Playwright)
   */
  async extractViaY2mate(videoUrl, quality = '720p') {
    try {
      console.log(`🟡 Y2mate 브라우저 추출 시작: ${videoUrl} (${quality})`);

      if (!this.context) {
        await this.initializeBrowser();
      }

      const page = await this.context.newPage();
      
      try {
        // 1. Y2mate.com 접근
        console.log('📄 Y2mate 페이지 로딩...');
        await page.goto('https://www.y2mate.com/', { 
          waitUntil: 'networkidle',
          timeout: this.timeout 
        });

        // 2. URL 입력
        console.log('📝 YouTube URL 입력 중...');
        await page.fill('#txt-url', videoUrl);
        await page.click('#btn-submit');

        // 3. 변환 결과 대기
        console.log('⏳ 변환 결과 대기...');
        await page.waitForSelector('.caption', { timeout: this.timeout });

        // 4. 원하는 품질의 다운로드 버튼 클릭
        console.log(`🎯 ${quality} 품질 다운로드 버튼 찾는 중...`);
        
        const downloadButton = await page.$(`tr:has-text("${quality}") .btn-file`);
        if (!downloadButton) {
          throw new Error(`${quality} 품질 옵션을 찾을 수 없습니다`);
        }

        await downloadButton.click();
        
        // 5. 실제 다운로드 링크 대기
        console.log('⏳ 실제 다운로드 링크 생성 대기...');
        await page.waitForSelector('a[href*="dl"]', { timeout: this.timeout });

        const finalDownloadUrl = await page.$eval('a[href*="dl"]', link => link.href);

        console.log('✅ Y2mate 다운로드 URL 추출 성공');

        return {
          success: true,
          downloadUrl: finalDownloadUrl,
          quality: quality,
          service: 'Y2mate.com (Playwright)',
          method: 'browser_automation'
        };

      } finally {
        await page.close();
      }

    } catch (error) {
      console.error(`❌ Y2mate 브라우저 추출 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        service: 'Y2mate.com (Playwright)'
      };
    }
  }

  /**
   * 여러 경쟁사 서비스를 통한 통합 추출 (브라우저 기반)
   */
  async extractYouTubeDownloadUrl(videoUrl, options = {}) {
    const { quality = '720p', timeout = this.timeout, preferredService = null } = options;
    
    console.log(`🎭 Playwright 통합 추출 시작: ${videoUrl} (${quality})`);

    try {
      await this.initializeBrowser();

      const extractors = [
        { name: 'ssyoutube', method: this.extractViaSSYouTube.bind(this) },
        { name: 'savefrom', method: this.extractViaSaveFrom.bind(this) },
        { name: 'y2mate', method: this.extractViaY2mate.bind(this) }
      ];

      // 선호 서비스 우선 시도
      if (preferredService) {
        const preferredExtractor = extractors.find(e => e.name === preferredService);
        if (preferredExtractor) {
          console.log(`🎯 선호 서비스 우선 시도: ${preferredService}`);
          const result = await preferredExtractor.method(videoUrl, quality);
          if (result.success) {
            return result;
          }
        }
      }

      // 모든 추출기 순차 시도
      for (const extractor of extractors) {
        if (extractor.name === preferredService) continue; // 이미 시도함
        
        console.log(`🔄 ${extractor.name} 추출기 시도 중...`);
        
        try {
          const result = await extractor.method(videoUrl, quality);
          if (result.success) {
            console.log(`🎉 ${extractor.name} 추출 성공!`);
            return result;
          }
        } catch (error) {
          console.warn(`⚠️ ${extractor.name} 실패: ${error.message}`);
        }
      }

      throw new Error('모든 Playwright 추출기 실패');

    } finally {
      await this.cleanup();
    }
  }

  /**
   * 브라우저에서 직접 파일 다운로드
   */
  async downloadDirectlyInBrowser(downloadUrl, outputPath, onProgress = null) {
    try {
      console.log('📥 브라우저 직접 다운로드 시작...');

      if (!this.context) {
        await this.initializeBrowser(false); // 다운로드는 프록시 없이
      }

      const page = await this.context.newPage();
      
      try {
        // 다운로드 이벤트 리스너 설정
        const downloadPromise = page.waitForEvent('download');
        
        // 다운로드 URL로 이동
        await page.goto(downloadUrl);
        
        // 다운로드 시작 대기
        const download = await downloadPromise;
        
        console.log(`📁 다운로드 시작: ${download.suggestedFilename()}`);
        
        // 파일 저장
        await download.saveAs(outputPath);
        
        console.log(`✅ 브라우저 다운로드 완료: ${outputPath}`);
        
        // 파일 크기 확인
        const stats = fs.statSync(outputPath);
        
        return {
          success: true,
          filePath: outputPath,
          fileSize: stats.size,
          method: 'browser_download'
        };

      } finally {
        await page.close();
      }

    } catch (error) {
      console.error(`❌ 브라우저 다운로드 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * YouTube URL을 SSYouTube URL로 변환
   */
  convertToSSYouTubeUrl(youtubeUrl) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = youtubeUrl.match(pattern);
      if (match) {
        const videoId = match[1];
        return `https://ssyoutube.com/watch?v=${videoId}`;
      }
    }

    throw new Error('유효하지 않은 YouTube URL입니다');
  }

  /**
   * 최적 품질 링크 선택
   */
  selectBestQualityLink(links, targetQuality) {
    const qualityPriority = {
      '1080p': ['1080p', '720p', '480p', '360p'],
      '720p': ['720p', '1080p', '480p', '360p'],
      '480p': ['480p', '720p', '360p', '1080p'],
      '360p': ['360p', '480p', '720p', '1080p']
    };

    const priorities = qualityPriority[targetQuality] || qualityPriority['720p'];
    
    for (const quality of priorities) {
      const link = links.find(l => l.quality === quality);
      if (link) {
        return link;
      }
    }

    // 폴백: 첫 번째 링크 사용
    return links.length > 0 ? links[0] : null;
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
      
      console.log('🧹 Playwright 리소스 정리 완료');
    } catch (error) {
      console.error(`❌ Playwright 정리 실패: ${error.message}`);
    }
  }
}

module.exports = new PlaywrightExtractor();