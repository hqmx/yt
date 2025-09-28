const { chromium } = require('playwright');
const proxyPoolManager = require('./proxyPoolManager');
const youtubeSignatureService = require('./youtubeSignatureService');

class YouTubeBrowserService {
  constructor() {
    console.log('🚀 HQMX YouTube Browser Service 초기화됨');
    this.browser = null;
    this.context = null;
  }

  /**
   * 프록시 없는 브라우저 테스트 (연결 문제 진단용)
   */
  async initBrowserWithoutProxy() {
    try {
      if (this.browser) {
        await this.closeBrowser();
      }

      console.log('🧪 프록시 없는 Chromium 브라우저 테스트 시작...');
      
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });
      
      console.log('✅ 프록시 없는 브라우저 초기화 완료');
      
    } catch (error) {
      console.error('❌ 프록시 없는 브라우저 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 브라우저 인스턴스 초기화 (다중 프록시 지원)
   */
  async initBrowser(useRegion = null) {
    try {
      if (this.browser) {
        return; // 이미 초기화됨
      }

      console.log('🌐 다중 프록시 Chromium 브라우저 시작 중...');
      
      // 최적 프록시 선택
      let selectedProxy;
      if (useRegion) {
        const regionalProxies = proxyPoolManager.getProxiesByRegion(useRegion);
        selectedProxy = regionalProxies.length > 0 ? regionalProxies[0] : proxyPoolManager.getBestProxies(1)[0];
      } else {
        selectedProxy = proxyPoolManager.getBestProxies(1)[0];
      }
      
      if (!selectedProxy) {
        throw new Error('사용 가능한 프록시가 없습니다');
      }
      
      console.log(`🎯 선택된 프록시: ${selectedProxy.id} (${selectedProxy.region?.name || 'Default'})`);
      
      // 프록시 설정
      const proxySettings = {
        server: `${selectedProxy.host}:${selectedProxy.port}`,
        username: selectedProxy.username,
        password: selectedProxy.password
      };

      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      this.context = await this.browser.newContext({
        proxy: proxySettings,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: ['camera', 'microphone'],
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Sec-Ch-Ua': '"Not A;Brand";v="99", "Chromium";v="131", "Google Chrome";v="131"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      // 선택된 프록시 정보 저장
      this.currentProxy = selectedProxy;
      
      console.log('✅ 다중 프록시 브라우저 초기화 완료');
      console.log(`📊 프록시 성능: 지연 ${selectedProxy.performance.latency.toFixed(0)}ms, 성공률 ${(selectedProxy.performance.successRate * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.error('❌ 브라우저 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 브라우저 종료
   */
  async closeBrowser() {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      console.log('✅ 브라우저 종료됨');
    } catch (error) {
      console.error('❌ 브라우저 종료 실패:', error);
    }
  }

  /**
   * YouTube 비디오 ID 추출
   */
  extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  /**
   * 실제 브라우저로 YouTube 페이지 방문 및 데이터 추출 (다중 프록시)
   */
  async extractVideoDataWithBrowser(videoUrl, retryCount = 0) {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('유효하지 않은 YouTube URL입니다');
    }

    await this.initBrowser();
    
    const page = await this.context.newPage();
    let extractedData = null;

    try {
      console.log(`🎬 YouTube 페이지 방문: ${videoUrl}`);
      
      // 페이지 로드 전에 스크립트 인젝션
      await page.addInitScript(() => {
        // 브라우저 감지 우회를 위한 기본 설정
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        
        // Chrome DevTools 감지 우회
        window.chrome = {
          runtime: {}
        };
        
        // Permissions API 모킹
        Object.defineProperty(navigator, 'permissions', {
          get: () => ({
            query: () => Promise.resolve({ state: 'granted' })
          })
        });
      });

      // YouTube 페이지로 이동
      const startTime = Date.now();
      const response = await page.goto(videoUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      const loadTime = Date.now() - startTime;

      if (!response.ok()) {
        // 프록시 성능 업데이트 (실패)
        if (this.currentProxy) {
          proxyPoolManager.updateProxyPerformance(this.currentProxy.id, {
            success: false
          });
        }
        
        throw new Error(`HTTP ${response.status()}: 페이지 로드 실패`);
      }
      
      // 프록시 성능 업데이트 (성공)
      if (this.currentProxy) {
        proxyPoolManager.updateProxyPerformance(this.currentProxy.id, {
          latency: loadTime,
          success: true
        });
      }

      console.log('📄 페이지 로드 완료, 데이터 추출 중...');

      // 페이지가 완전히 로드될 때까지 대기
      await page.waitForTimeout(3000);

      // ytInitialPlayerResponse 추출
      extractedData = await page.evaluate(() => {
        try {
          // 여러 방법으로 ytInitialPlayerResponse 찾기
          let playerResponse = null;

          // 방법 1: window.ytInitialPlayerResponse
          if (window.ytInitialPlayerResponse) {
            playerResponse = window.ytInitialPlayerResponse;
          }
          
          // 방법 2: 스크립트 태그에서 추출
          if (!playerResponse) {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || script.innerText;
              
              // 다양한 패턴으로 시도
              const patterns = [
                /var ytInitialPlayerResponse = ({.+?});/,
                /window\["ytInitialPlayerResponse"\] = ({.+?});/,
                /"ytInitialPlayerResponse":\s*({.+?}),/,
                /ytInitialPlayerResponse\s*=\s*({.+?});/
              ];

              for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match) {
                  try {
                    playerResponse = JSON.parse(match[1]);
                    break;
                  } catch (e) {
                    continue;
                  }
                }
              }
              
              if (playerResponse) break;
            }
          }

          if (!playerResponse) {
            throw new Error('ytInitialPlayerResponse를 찾을 수 없습니다');
          }

          // 비디오 세부 정보 추출
          const videoDetails = playerResponse.videoDetails;
          const streamingData = playerResponse.streamingData;

          if (!videoDetails) {
            throw new Error('비디오 정보를 찾을 수 없습니다');
          }

          if (!streamingData) {
            throw new Error('스트리밍 데이터를 찾을 수 없습니다');
          }

          // 포맷 정보 추출
          const formats = [
            ...(streamingData.formats || []),
            ...(streamingData.adaptiveFormats || [])
          ];

          return {
            success: true,
            videoId: videoDetails.videoId,
            title: videoDetails.title,
            author: videoDetails.author,
            lengthSeconds: parseInt(videoDetails.lengthSeconds) || 0,
            thumbnail: `https://i.ytimg.com/vi/${videoDetails.videoId}/maxresdefault.jpg`,
            formats: formats,
            rawPlayerResponse: playerResponse
          };

        } catch (error) {
          return {
            success: false,
            error: error.message,
            pageTitle: document.title,
            url: window.location.href
          };
        }
      });

      await page.close();

      if (!extractedData.success) {
        throw new Error(`브라우저 추출 실패: ${extractedData.error}`);
      }

      console.log(`✅ 브라우저로 데이터 추출 성공: ${extractedData.formats.length}개 포맷 발견`);
      return extractedData;

    } catch (error) {
      console.error('❌ 브라우저 데이터 추출 실패:', error);
      
      // 프록시 성능 업데이트 (실패)
      if (this.currentProxy) {
        proxyPoolManager.updateProxyPerformance(this.currentProxy.id, {
          success: false
        });
      }
      
      if (page) {
        await page.close().catch(() => {});
      }
      
      // 다른 프록시로 재시도 (최대 2회)
      if (retryCount < 2) {
        console.log(`🔄 다른 프록시로 재시도: ${retryCount + 1}/2`);
        
        // 브라우저 종료 후 새로운 프록시로 재시작
        await this.closeBrowser();
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
        return this.extractVideoDataWithBrowser(videoUrl, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * 포맷 정보 처리 및 분류
   */
  async processFormats(formats, videoId) {
    const processedFormats = [];
    
    for (const format of formats) {
      let downloadUrl = format.url;
      
      // signatureCipher 처리
      if (!downloadUrl && format.signatureCipher) {
        console.log(`🔐 signatureCipher 디코딩 중: ${format.itag}`);
        
        const decodingResult = await youtubeSignatureService.decodeSignatureCipher(
          format.signatureCipher, 
          videoId
        );
        
        if (decodingResult.success) {
          downloadUrl = decodingResult.url;
          console.log(`✅ 시그니처 디코딩 성공: ${format.itag}`);
        } else {
          console.error(`❌ 시그니처 디코딩 실패: ${format.itag} - ${decodingResult.error}`);
          
          // 폴백: 기본 URL 디코딩 시도
          const params = new URLSearchParams(format.signatureCipher);
          const encodedUrl = params.get('url');
          if (encodedUrl) {
            downloadUrl = decodeURIComponent(encodedUrl);
            console.log(`⚠️ 기본 URL 디코딩으로 폴백: ${format.itag}`);
          }
        }
      }

      // 포맷 타입 판정
      const hasVideo = format.mimeType ? format.mimeType.includes('video') : false;
      const hasAudio = format.audioQuality || (format.mimeType ? format.mimeType.includes('audio') : false);
      
      if (downloadUrl) {
        processedFormats.push({
          itag: format.itag,
          url: downloadUrl,
          mimeType: format.mimeType,
          quality: format.quality,
          qualityLabel: format.qualityLabel,
          height: format.height,
          width: format.width,
          fps: format.fps,
          bitrate: format.bitrate,
          audioQuality: format.audioQuality,
          hasVideo: hasVideo,
          hasAudio: hasAudio,
          container: format.mimeType ? format.mimeType.split(';')[0].split('/')[1] : 'unknown',
          contentLength: format.contentLength
        });
      }
    }

    console.log(`📊 처리된 포맷: ${processedFormats.length}/${formats.length}`);
    return this.categorizeByQuality(processedFormats);
  }

  /**
   * 품질별로 포맷 분류
   */
  categorizeByQuality(formats) {
    const videoFormats = formats.filter(f => f.hasVideo);
    const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);
    
    // 비디오 품질별 그룹화
    const qualityGroups = {};
    videoFormats.forEach(format => {
      if (format.height) {
        const quality = `${format.height}p`;
        if (!qualityGroups[quality]) {
          qualityGroups[quality] = [];
        }
        qualityGroups[quality].push(format);
      }
    });

    // 품질 옵션 생성
    const options = Object.keys(qualityGroups)
      .map(quality => ({
        quality,
        height: parseInt(quality.replace('p', '')),
        formats: qualityGroups[quality].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      }))
      .sort((a, b) => b.height - a.height);

    return {
      video: options,
      audio: audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)),
      all: formats
    };
  }

  /**
   * 특정 품질의 다운로드 URL 반환
   */
  getDownloadUrl(formats, quality = '720p', preferAudio = false) {
    const targetHeight = parseInt(quality.replace('p', ''));
    
    if (preferAudio) {
      const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);
      if (audioFormats.length > 0) {
        const best = audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        return {
          url: best.url,
          format: best,
          type: 'audio'
        };
      }
    }

    // 비디오+오디오 통합 포맷 우선
    const combinedFormats = formats.filter(f => 
      f.hasVideo && f.hasAudio && f.height === targetHeight
    );
    
    if (combinedFormats.length > 0) {
      const best = combinedFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      return {
        url: best.url,
        format: best,
        type: 'combined'
      };
    }
    
    // 비디오만 포맷
    const videoFormats = formats.filter(f => 
      f.hasVideo && f.height === targetHeight
    );
    
    if (videoFormats.length > 0) {
      const best = videoFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      return {
        url: best.url,
        format: best,
        type: 'video',
        requiresAudio: true
      };
    }
    
    // 가장 가까운 품질 찾기
    const allVideo = formats.filter(f => f.hasVideo && f.height);
    if (allVideo.length > 0) {
      const closest = allVideo.reduce((prev, curr) => 
        Math.abs(curr.height - targetHeight) < Math.abs(prev.height - targetHeight) ? curr : prev
      );
      return {
        url: closest.url,
        format: closest,
        type: 'fallback'
      };
    }
    
    throw new Error(`${quality} 품질을 찾을 수 없습니다`);
  }

  /**
   * 프록시 없이 YouTube 접속 테스트 (진단용)
   */
  async testWithoutProxy(videoUrl) {
    const startTime = Date.now();
    
    try {
      console.log(`🧪 프록시 없이 YouTube 접속 테스트: ${videoUrl}`);
      
      await this.initBrowserWithoutProxy();
      const page = await this.context.newPage();
      
      try {
        // 기본 YouTube 페이지 접속 테스트
        console.log('📄 YouTube 페이지 로딩 중...');
        const response = await page.goto(videoUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        
        const loadTime = Date.now() - startTime;
        
        if (!response.ok()) {
          throw new Error(`HTTP ${response.status()}: 페이지 로드 실패`);
        }
        
        // 페이지 기본 정보 추출
        const pageInfo = await page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            hasYtInitialPlayerResponse: typeof window.ytInitialPlayerResponse !== 'undefined',
            hasYtPlayer: typeof window.YT !== 'undefined'
          };
        });
        
        const result = {
          success: true,
          message: '프록시 없이 YouTube 접속 성공',
          loadTime: loadTime,
          pageInfo: pageInfo
        };
        
        console.log(`✅ 프록시 없이 접속 성공: ${loadTime}ms`);
        console.log(`📊 페이지 정보:`, pageInfo);
        
        await page.close();
        return result;
        
      } catch (error) {
        await page.close().catch(() => {});
        throw error;
      }
      
    } catch (error) {
      console.error('❌ 프록시 없는 접속 테스트 실패:', error.message);
      return {
        success: false,
        error: error.message,
        loadTime: Date.now() - startTime
      };
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * 프록시 없이 YouTube 분석 (빠른 버전)
   */
  async analyzeWithoutProxy(videoUrl) {
    const startTime = Date.now();
    
    try {
      console.log(`🎬 프록시 없는 YouTube 분석 시작: ${videoUrl}`);
      
      await this.initBrowserWithoutProxy();
      const page = await this.context.newPage();
      
      try {
        const response = await page.goto(videoUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 20000 
        });
        
        if (!response.ok()) {
          throw new Error(`HTTP ${response.status()}: 페이지 로드 실패`);
        }
        
        await page.waitForTimeout(3000);
        
        const extractedData = await page.evaluate(() => {
          try {
            let playerResponse = window.ytInitialPlayerResponse;
            
            if (!playerResponse) {
              const scripts = document.querySelectorAll('script');
              for (const script of scripts) {
                const content = script.textContent;
                const patterns = [
                  /var ytInitialPlayerResponse = ({.+?});/,
                  /window\["ytInitialPlayerResponse"\] = ({.+?});/
                ];
                
                for (const pattern of patterns) {
                  const match = content.match(pattern);
                  if (match) {
                    try {
                      playerResponse = JSON.parse(match[1]);
                      break;
                    } catch (e) { continue; }
                  }
                }
                if (playerResponse) break;
              }
            }
            
            if (!playerResponse?.videoDetails?.title) {
              throw new Error('비디오 정보를 찾을 수 없습니다');
            }
            
            const videoDetails = playerResponse.videoDetails;
            const streamingData = playerResponse.streamingData;
            const formats = [...(streamingData?.formats || []), ...(streamingData?.adaptiveFormats || [])];
            
            return {
              success: true,
              videoId: videoDetails.videoId,
              title: videoDetails.title,
              author: videoDetails.author,
              lengthSeconds: parseInt(videoDetails.lengthSeconds) || 0,
              thumbnail: `https://i.ytimg.com/vi/${videoDetails.videoId}/maxresdefault.jpg`,
              formats: formats.filter(f => f.url && f.mimeType)
            };
            
          } catch (error) {
            return {
              success: false,
              error: error.message
            };
          }
        });
        
        if (!extractedData.success) {
          throw new Error(`데이터 추출 실패: ${extractedData.error}`);
        }
        
        const analysisTime = Date.now() - startTime;
        console.log(`✅ 프록시 없는 분석 완료: ${extractedData.formats.length}개 포맷 (${analysisTime}ms)`);
        
        return {
          ...extractedData,
          analysisTime: analysisTime
        };
        
      } finally {
        await page.close().catch(() => {});
      }
      
    } catch (error) {
      console.error('❌ 프록시 없는 분석 실패:', error.message);
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * 메인 분석 함수 - 다중 프록시 브라우저를 사용한 완전한 추출
   */
  async analyze(videoUrl) {
    const startTime = Date.now();
    
    try {
      console.log(`🎬 다중 프록시 브라우저 기반 YouTube 분석 시작: ${videoUrl}`);
      console.log(`📊 현재 프록시 풀 상태: ${proxyPoolManager.getStatus().activeProxies}개 활성 프록시`);
      
      const extractedData = await this.extractVideoDataWithBrowser(videoUrl);
      const qualityOptions = await this.processFormats(extractedData.formats, extractedData.videoId);
      
      const analysisTime = Date.now() - startTime;
      
      const result = {
        videoId: extractedData.videoId,
        title: extractedData.title || '제목 없음',
        author: extractedData.author || '알 수 없음',
        lengthSeconds: extractedData.lengthSeconds || 0,
        thumbnail: extractedData.thumbnail,
        formats: qualityOptions.all,
        qualityOptions: qualityOptions,
        proxyUsed: this.currentProxy ? {
          id: this.currentProxy.id,
          region: this.currentProxy.region?.name,
          performance: this.currentProxy.performance
        } : null,
        analysisTime: analysisTime
      };

      console.log(`✅ 다중 프록시 브라우저 분석 완료: ${qualityOptions.all.length}개 포맷 발견 (${analysisTime}ms)`);
      return result;

    } catch (error) {
      console.error('❌ 다중 프록시 브라우저 분석 실패:', error.message);
      throw error;
    }
  }

  /**
   * 프록시 없이 브라우저 세션으로 직접 다운로드
   */
  async downloadDirectlyWithBrowser(videoUrl, outputDir = '/Users/wonjunjang/Downloads') {
    const startTime = Date.now();
    
    try {
      console.log(`🎬 프록시 없는 브라우저 기반 직접 다운로드 시작: ${videoUrl}`);
      console.log(`💾 출력 디렉토리: ${outputDir}`);
      
      await this.initBrowserWithoutProxy();
      const page = await this.context.newPage();
      
      // 다운로드 허용
      const client = await page.context().newCDPSession(page);
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: outputDir
      });
      
      try {
        // YouTube 페이지 접속
        console.log('🌐 YouTube 페이지 접속 중...');
        const response = await page.goto(videoUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        if (!response.ok()) {
          throw new Error(`HTTP ${response.status()}: 페이지 로드 실패`);
        }
        
        // 페이지 완전 로딩 대기
        await page.waitForTimeout(5000);
        
        console.log('🔍 YouTube 데이터 추출 중...');
        
        // YouTube 데이터 추출
        const extractedData = await page.evaluate(() => {
          try {
            let playerResponse = null;
            
            // ytInitialPlayerResponse 찾기
            if (window.ytInitialPlayerResponse) {
              playerResponse = window.ytInitialPlayerResponse;
            } else {
              const scripts = document.querySelectorAll('script');
              for (const script of scripts) {
                const content = script.textContent;
                const patterns = [
                  /var ytInitialPlayerResponse = ({.+?});/,
                  /window\["ytInitialPlayerResponse"\] = ({.+?});/,
                  /"ytInitialPlayerResponse":\s*({.+?}),/
                ];
                
                for (const pattern of patterns) {
                  const match = content.match(pattern);
                  if (match) {
                    try {
                      playerResponse = JSON.parse(match[1]);
                      break;
                    } catch (e) { continue; }
                  }
                }
                if (playerResponse) break;
              }
            }
            
            if (!playerResponse) {
              throw new Error('YouTube 플레이어 데이터를 찾을 수 없습니다');
            }
            
            const videoDetails = playerResponse.videoDetails;
            const streamingData = playerResponse.streamingData;
            
            if (!videoDetails || !streamingData) {
              throw new Error('비디오 정보 또는 스트리밍 데이터가 없습니다');
            }
            
            // 다운로드 가능한 포맷 찾기
            const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];
            const goodFormats = formats.filter(f => f.url && f.mimeType && (f.height >= 360 || f.audioQuality));
            
            return {
              success: true,
              videoId: videoDetails.videoId,
              title: videoDetails.title,
              lengthSeconds: videoDetails.lengthSeconds,
              formats: goodFormats
            };
            
          } catch (error) {
            return {
              success: false,
              error: error.message
            };
          }
        });
        
        if (!extractedData.success) {
          throw new Error(`데이터 추출 실패: ${extractedData.error}`);
        }
        
        console.log(`📊 추출된 포맷 수: ${extractedData.formats.length}`);
        
        // 가장 좋은 비디오 포맷 선택 (360p 이상의 mp4)
        const videoFormat = extractedData.formats.find(f => 
          f.mimeType.includes('video/mp4') && f.height >= 360 && f.url
        ) || extractedData.formats.find(f => 
          f.mimeType.includes('video') && f.url
        );
        
        if (!videoFormat) {
          throw new Error('다운로드 가능한 비디오 포맷을 찾을 수 없습니다');
        }
        
        console.log(`🎯 선택된 포맷: ${videoFormat.qualityLabel || videoFormat.height + 'p'} ${videoFormat.mimeType}`);
        
        // 파일명 생성
        const sanitizedTitle = extractedData.title
          .replace(/[^\w\s-]/gi, '')
          .replace(/\s+/g, '_')
          .slice(0, 50);
        const extension = videoFormat.mimeType.includes('webm') ? 'webm' : 'mp4';
        const filename = `${sanitizedTitle}.${extension}`;
        const outputPath = require('path').join(outputDir, filename);
        
        console.log(`📁 다운로드 파일: ${filename}`);
        console.log(`🔗 다운로드 URL: ${videoFormat.url.substring(0, 100)}...`);
        
        // 브라우저로 직접 다운로드 시도
        console.log('🚀 브라우저 다운로드 시작...');
        
        // 새 탭에서 다운로드 URL 접속
        const downloadPage = await this.context.newPage();
        
        try {
          // 다운로드 URL에 직접 접속
          const downloadResponse = await downloadPage.goto(videoFormat.url, {
            timeout: 60000,
            waitUntil: 'commit'
          });
          
          if (!downloadResponse.ok()) {
            throw new Error(`다운로드 실패: HTTP ${downloadResponse.status()}`);
          }
          
          // 몇 초 대기 (다운로드 시작 대기)
          await downloadPage.waitForTimeout(10000);
          
          console.log('✅ 브라우저 다운로드 시도 완료');
          
        } catch (downloadError) {
          console.error('❌ 브라우저 다운로드 실패:', downloadError.message);
          
          // 폴백: axios로 스트림 다운로드 시도
          console.log('🔄 스트림 다운로드로 폴백...');
          
          const axios = require('axios');
          const fs = require('fs');
          
          const streamResponse = await axios({
            method: 'get',
            url: videoFormat.url,
            responseType: 'stream',
            timeout: 120000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Referer': `https://www.youtube.com/watch?v=${extractedData.videoId}`,
              'Accept': '*/*'
            }
          });
          
          // 파일 쓰기 스트림 생성
          const writer = fs.createWriteStream(outputPath);
          
          // 스트림 연결
          streamResponse.data.pipe(writer);
          
          // 완료 대기
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            streamResponse.data.on('error', reject);
          });
          
          console.log('✅ 스트림 다운로드 완료');
        }
        
        await downloadPage.close();
        
        // 파일 존재 확인
        const fs = require('fs');
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
          
          if (stats.size > 1024 * 100) { // 100KB 이상이면 성공으로 간주
            const totalTime = Date.now() - startTime;
            
            const result = {
              success: true,
              videoId: extractedData.videoId,
              title: extractedData.title,
              filename: filename,
              filePath: outputPath,
              fileSize: stats.size,
              fileSizeMB: fileSizeMB,
              duration: extractedData.lengthSeconds,
              format: videoFormat,
              downloadTime: totalTime
            };
            
            console.log(`🎉 다운로드 성공: ${fileSizeMB}MB, ${(totalTime/1000).toFixed(1)}초`);
            return result;
          } else {
            console.error(`❌ 파일 크기 너무 작음: ${fileSizeMB}MB`);
            fs.unlinkSync(outputPath); // 작은 파일 삭제
          }
        }
        
        throw new Error('다운로드된 파일이 없거나 크기가 너무 작습니다');
        
      } finally {
        await page.close().catch(() => {});
      }
      
    } catch (error) {
      console.error('❌ 브라우저 기반 다운로드 실패:', error.message);
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * 네트워크 요청 가로채기로 실시간 비디오 URL 추출
   */
  async interceptVideoUrlsWithBrowser(videoUrl, outputDir = '/Users/wonjunjang/Downloads') {
    const startTime = Date.now();
    const capturedUrls = [];
    
    try {
      console.log(`🔍 네트워크 요청 가로채기 다운로드 시작: ${videoUrl}`);
      console.log(`💾 출력 디렉토리: ${outputDir}`);
      
      await this.initBrowserWithoutProxy();
      const page = await this.context.newPage();
      
      // 다운로드 허용
      const client = await page.context().newCDPSession(page);
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: outputDir
      });
      
      // 네트워크 요청 가로채기 설정
      console.log('🔍 네트워크 요청 모니터링 시작...');
      
      page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // 비디오 콘텐츠 요청 탐지
        if (
          (contentType.includes('video/') || contentType.includes('application/octet-stream')) &&
          (url.includes('googlevideo.com') || url.includes('youtube.com')) &&
          (url.includes('videoplayback') || url.includes('mime=video'))
        ) {
          console.log(`🎬 비디오 URL 발견: ${url.substring(0, 100)}...`);
          console.log(`🎥 Content-Type: ${contentType}`);
          
          capturedUrls.push({
            url: url,
            contentType: contentType,
            timestamp: Date.now(),
            size: response.headers()['content-length']
          });
        }
      });
      
      try {
        // YouTube 페이지 접속
        console.log('🌐 YouTube 페이지 로딩 중...');
        const response = await page.goto(videoUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        if (!response.ok()) {
          throw new Error(`HTTP ${response.status()}: 페이지 로드 실패`);
        }
        
        console.log('⏸️ 페이지 로드 완료, 비디오 요소 대기 중...');
        await page.waitForTimeout(8000);
        
        // 비디오 업체 정보 추출
        const videoInfo = await page.evaluate(() => {
          try {
            const playerResponse = window.ytInitialPlayerResponse;
            if (!playerResponse?.videoDetails) {
              throw new Error('비디오 정보를 찾을 수 없습니다');
            }
            
            return {
              videoId: playerResponse.videoDetails.videoId,
              title: playerResponse.videoDetails.title,
              lengthSeconds: playerResponse.videoDetails.lengthSeconds
            };
          } catch (error) {
            return { error: error.message };
          }
        });
        
        if (videoInfo.error) {
          throw new Error(`비디오 정보 추출 실패: ${videoInfo.error}`);
        }
        
        console.log(`📊 비디오 정보: ${videoInfo.title} (${videoInfo.lengthSeconds}s)`);
        
        // 비디오 재생 시도 (비디오 데이터 요청 유발)
        console.log('▶️ 비디오 재생 시도 중...');
        
        // 비디오 재생 버튼 클릭 시도
        await page.evaluate(() => {
          // 다양한 비디오 재생 방법 시도
          const selectors = [
            'button[aria-label*="재생"]',
            'button[title*="재생"]',
            '.ytp-play-button',
            '.ytp-large-play-button',
            'button[data-title-no-tooltip="재생"]',
            'button[aria-label*="Play"]',
            '.html5-video-player video'
          ];
          
          for (const selector of selectors) {
            try {
              const element = document.querySelector(selector);
              if (element) {
                console.log(`비디오 재생 시도: ${selector}`);
                
                if (element.tagName === 'VIDEO') {
                  element.play();
                } else {
                  element.click();
                }
                
                return true;
              }
            } catch (e) {
              continue;
            }
          }
          
          // 키보드 사용 (스페이스바 = 재생/일시정지)
          document.body.focus();
          const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space' });
          document.body.dispatchEvent(event);
          
          return false;
        });
        
        // 비디오 요청 대기
        console.log('⏳ 비디오 데이터 요청 대기 중...');
        await page.waitForTimeout(15000);
        
        console.log(`📊 발견된 비디오 URL: ${capturedUrls.length}개`);
        
        if (capturedUrls.length === 0) {
          // 좋은 비디오 URL이 없다면 더 기다리기
          console.log('⏳ 비디오 URL 발견 안됨, 추가 대기...');
          await page.waitForTimeout(10000);
        }
        
        if (capturedUrls.length === 0) {
          throw new Error('비디오 데이터 URL을 찾을 수 없습니다');
        }
        
        // 가장 좋은 URL 선택 (가장 큰 파일 크기)
        const bestUrl = capturedUrls.reduce((best, current) => {
          const bestSize = parseInt(best.size) || 0;
          const currentSize = parseInt(current.size) || 0;
          return currentSize > bestSize ? current : best;
        });
        
        console.log(`🎯 선택된 비디오 URL: ${bestUrl.url.substring(0, 100)}...`);
        console.log(`📊 예상 파일 크기: ${(parseInt(bestUrl.size || 0) / 1024 / 1024).toFixed(2)}MB`);
        
        // 파일명 생성
        const sanitizedTitle = videoInfo.title
          .replace(/[^\w\s-]/gi, '')
          .replace(/\s+/g, '_')
          .slice(0, 50);
        
        const extension = bestUrl.contentType.includes('webm') ? 'webm' : 'mp4';
        const filename = `${sanitizedTitle}.${extension}`;
        const outputPath = require('path').join(outputDir, filename);
        
        console.log(`📁 다운로드 파일: ${filename}`);
        
        // axios로 스트림 다운로드
        console.log('🚀 스트림 다운로드 시작...');
        
        const axios = require('axios');
        const fs = require('fs');
        
        const streamResponse = await axios({
          method: 'get',
          url: bestUrl.url,
          responseType: 'stream',
          timeout: 180000, // 3분
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': `https://www.youtube.com/watch?v=${videoInfo.videoId}`,
            'Accept': '*/*'
          }
        });
        
        // 파일 쓰기 스트림 생성
        const writer = fs.createWriteStream(outputPath);
        
        // 스트림 연결
        streamResponse.data.pipe(writer);
        
        // 완료 대기
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
          streamResponse.data.on('error', reject);
        });
        
        // 파일 사이즈 확인
        const stats = fs.statSync(outputPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        
        if (stats.size > 1024 * 500) { // 500KB 이상이면 성공
          const totalTime = Date.now() - startTime;
          
          const result = {
            success: true,
            method: 'network-interception',
            videoId: videoInfo.videoId,
            title: videoInfo.title,
            filename: filename,
            filePath: outputPath,
            fileSize: stats.size,
            fileSizeMB: fileSizeMB,
            duration: videoInfo.lengthSeconds,
            capturedUrls: capturedUrls.length,
            downloadTime: totalTime,
            videoUrl: bestUrl.url.substring(0, 150) + '...' // 로그용으로 일부만
          };
          
          console.log(`🎉 네트워크 가로채기 다운로드 성공: ${fileSizeMB}MB, ${(totalTime/1000).toFixed(1)}초`);
          return result;
        } else {
          console.error(`❌ 파일 크기 너무 작음: ${fileSizeMB}MB`);
          fs.unlinkSync(outputPath); // 작은 파일 삭제
          throw new Error(`다운로드된 파일 크기가 너무 작습니다: ${fileSizeMB}MB`);
        }
        
      } finally {
        await page.close().catch(() => {});
      }
      
    } catch (error) {
      console.error('❌ 네트워크 가로채기 다운로드 실패:', error.message);
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * 정리 작업
   */
  async cleanup() {
    await this.closeBrowser();
    
    // 시그니처 서비스도 정리
    try {
      await youtubeSignatureService.cleanup();
    } catch (error) {
      console.error('❌ 시그니처 서비스 정리 실패:', error);
    }
    
    console.log('✅ YouTube Browser Service 정리 완료');
  }
}

module.exports = new YouTubeBrowserService();