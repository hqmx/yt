const { chromium } = require('playwright');
const proxyService = require('./proxyService');

class YouTubeSignatureService {
  constructor() {
    console.log('🔐 YouTube Signature Service 초기화됨');
    this.browser = null;
    this.context = null;
    this.signatureFunctions = new Map(); // 캐시된 시그니처 함수들
  }

  /**
   * 브라우저 인스턴스 초기화
   */
  async initBrowser() {
    try {
      if (this.browser) {
        return; // 이미 초기화됨
      }

      console.log('🌐 시그니처 디코딩용 Chromium 브라우저 시작 중...');
      
      // Smartproxy 설정
      const proxySettings = {
        server: `http://${process.env.PROXY_HOST || 'proxy.smartproxy.net'}:${process.env.PROXY_PORT || '3120'}`,
        username: process.env.PROXY_USERNAME || 'smart-hqmx0000',
        password: process.env.PROXY_PASSWORD || 'Straight8'
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
          '--disable-gpu'
        ]
      });

      this.context = await this.browser.newContext({
        proxy: proxySettings,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York'
      });

      console.log('✅ 시그니처 브라우저 초기화 완료');
      
    } catch (error) {
      console.error('❌ 시그니처 브라우저 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * YouTube에서 시그니처 디코딩 함수 추출
   */
  async extractSignatureFunction(videoId) {
    const cacheKey = `signature_${videoId}`;
    
    if (this.signatureFunctions.has(cacheKey)) {
      console.log('✅ 캐시된 시그니처 함수 사용');
      return this.signatureFunctions.get(cacheKey);
    }

    await this.initBrowser();
    const page = await this.context.newPage();

    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`🔍 시그니처 함수 추출: ${videoUrl}`);
      
      // YouTube 페이지 방문
      await page.goto(videoUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      // 페이지 로드 대기
      await page.waitForTimeout(3000);

      // JavaScript에서 시그니처 디코딩 함수 추출
      const signatureData = await page.evaluate(() => {
        try {
          // ytInitialPlayerResponse에서 시그니처 관련 정보 찾기
          let playerResponse = null;
          
          // 다양한 방법으로 playerResponse 찾기
          if (window.ytInitialPlayerResponse) {
            playerResponse = window.ytInitialPlayerResponse;
          } else {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || script.innerText;
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
                  } catch (e) {
                    continue;
                  }
                }
              }
              if (playerResponse) break;
            }
          }

          if (!playerResponse) {
            throw new Error('playerResponse를 찾을 수 없습니다');
          }

          // 시그니처 관련 스크립트 찾기
          let baseJsUrl = null;
          const scripts = document.querySelectorAll('script');
          
          for (const script of scripts) {
            const src = script.src;
            if (src && src.includes('/s/player/')) {
              baseJsUrl = src.startsWith('/') ? `https://www.youtube.com${src}` : src;
              break;
            }
          }

          if (!baseJsUrl) {
            // HTML 내용에서 player JS URL 찾기
            for (const script of scripts) {
              const content = script.textContent || script.innerText;
              const match = content.match(/"jsUrl":"([^"]*player[^"]*\.js[^"]*)"/);
              if (match) {
                baseJsUrl = match[1].replace(/\\/g, '');
                if (baseJsUrl.startsWith('/')) {
                  baseJsUrl = `https://www.youtube.com${baseJsUrl}`;
                }
                break;
              }
            }
          }

          return {
            success: true,
            playerResponse,
            baseJsUrl,
            videoId: playerResponse?.videoDetails?.videoId
          };

        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      });

      await page.close();

      if (!signatureData.success) {
        throw new Error(`시그니처 데이터 추출 실패: ${signatureData.error}`);
      }

      // 시그니처 함수를 캐시에 저장 (5분간)
      this.signatureFunctions.set(cacheKey, signatureData);
      setTimeout(() => this.signatureFunctions.delete(cacheKey), 5 * 60 * 1000);

      console.log('✅ 시그니처 함수 추출 완료');
      console.log(`📄 Base JS URL: ${signatureData.baseJsUrl?.substring(0, 50)}...`);

      return signatureData;

    } catch (error) {
      console.error('❌ 시그니처 함수 추출 실패:', error);
      if (page) {
        await page.close().catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Base JS에서 시그니처 디코딩 함수 다운로드 및 분석
   */
  async fetchSignatureDecoder(baseJsUrl) {
    try {
      console.log(`🔽 Base JS 다운로드: ${baseJsUrl}`);
      
      const response = await proxyService.get(baseJsUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.youtube.com/'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Base JS 다운로드 실패: HTTP ${response.status}`);
      }

      const jsContent = response.data;
      
      // 시그니처 디코딩 함수 찾기
      const signatureFunction = this.parseSignatureFunction(jsContent);
      
      console.log('✅ 시그니처 디코딩 함수 파싱 완료');
      return signatureFunction;

    } catch (error) {
      console.error('❌ 시그니처 디코딩 함수 다운로드 실패:', error);
      throw error;
    }
  }

  /**
   * JavaScript에서 시그니처 디코딩 함수 파싱
   */
  parseSignatureFunction(jsContent) {
    try {
      // 시그니처 함수 패턴들 찾기
      const patterns = [
        // 일반적인 시그니처 함수 패턴
        /([a-zA-Z_$][\w$]*)\s*=\s*function\s*\(\s*a\s*\)\s*{\s*a\s*=\s*a\.split\s*\(\s*[""''][""'']\s*\)/,
        /([a-zA-Z_$][\w$]*)\s*:\s*function\s*\(\s*a\s*\)\s*{\s*a\s*=\s*a\.split\s*\(\s*[""''][""'']\s*\)/,
        // splice, reverse 등을 사용하는 패턴
        /([a-zA-Z_$][\w$]*)\s*=\s*function\s*\(\s*a\s*\)\s*{\s*a\s*=\s*a\.split\s*\(\s*[""''][""'']\s*\)[\s\S]*?return\s+a\.join\s*\(\s*[""''][""'']\s*\)/g
      ];

      let signatureFunctionName = null;
      let signatureFunctionCode = null;

      for (const pattern of patterns) {
        // matchAll을 위해 global flag 추가
        const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');
        const matches = jsContent.matchAll(globalPattern);
        for (const match of matches) {
          signatureFunctionName = match[1];
          
          // 함수 전체 코드 추출
          const functionStart = match.index;
          let braceCount = 0;
          let inFunction = false;
          let functionEnd = functionStart;

          for (let i = functionStart; i < jsContent.length; i++) {
            const char = jsContent[i];
            
            if (char === '{') {
              braceCount++;
              inFunction = true;
            } else if (char === '}') {
              braceCount--;
              if (inFunction && braceCount === 0) {
                functionEnd = i + 1;
                break;
              }
            }
          }

          signatureFunctionCode = jsContent.substring(functionStart, functionEnd);
          
          if (signatureFunctionCode && signatureFunctionCode.includes('split') && 
              signatureFunctionCode.includes('join')) {
            break;
          }
        }
        
        if (signatureFunctionName && signatureFunctionCode) {
          break;
        }
      }

      if (!signatureFunctionName || !signatureFunctionCode) {
        throw new Error('시그니처 함수를 찾을 수 없습니다');
      }

      console.log(`🔍 시그니처 함수명: ${signatureFunctionName}`);
      console.log(`📝 함수 코드 길이: ${signatureFunctionCode.length}자`);

      return {
        functionName: signatureFunctionName,
        functionCode: signatureFunctionCode
      };

    } catch (error) {
      console.error('❌ 시그니처 함수 파싱 실패:', error);
      throw error;
    }
  }

  /**
   * signatureCipher 디코딩
   */
  async decodeSignatureCipher(signatureCipher, videoId) {
    try {
      console.log(`🔐 시그니처 디코딩 시작: ${videoId}`);
      
      const params = new URLSearchParams(signatureCipher);
      const encodedUrl = params.get('url');
      const signature = params.get('s');
      const signatureParam = params.get('sp') || 'signature';

      if (!encodedUrl) {
        throw new Error('URL이 signatureCipher에서 찾을 수 없습니다');
      }

      let finalUrl = decodeURIComponent(encodedUrl);

      if (signature) {
        console.log(`🔑 시그니처 디코딩 필요: ${signature.substring(0, 20)}...`);
        
        // 시그니처 함수 정보 가져오기
        const signatureData = await this.extractSignatureFunction(videoId);
        
        if (signatureData.baseJsUrl) {
          // 시그니처 디코더 다운로드
          const decoder = await this.fetchSignatureDecoder(signatureData.baseJsUrl);
          
          // 브라우저에서 시그니처 디코딩 실행
          const decodedSignature = await this.executeSignatureDecoding(decoder, signature);
          
          // 디코딩된 시그니처를 URL에 추가
          finalUrl += `&${signatureParam}=${encodeURIComponent(decodedSignature)}`;
          
          console.log('✅ 시그니처 디코딩 완료');
        } else {
          console.log('⚠️ Base JS URL을 찾을 수 없어 시그니처 디코딩 건너뜀');
        }
      }

      return {
        success: true,
        url: finalUrl,
        originalSignature: signature,
        hasSignature: !!signature
      };

    } catch (error) {
      console.error('❌ 시그니처 디코딩 실패:', error);
      return {
        success: false,
        error: error.message,
        url: null
      };
    }
  }

  /**
   * 브라우저에서 시그니처 디코딩 실행
   */
  async executeSignatureDecoding(decoder, signature) {
    await this.initBrowser();
    const page = await this.context.newPage();

    try {
      console.log('🖥️ 브라우저에서 시그니처 디코딩 실행');
      
      const decodedSignature = await page.evaluate((functionCode, sig) => {
        try {
          // 함수 코드를 실행 가능한 형태로 변환
          const funcBody = functionCode.replace(/^[^{]*{/, '').replace(/}[^}]*$/, '');
          const decodingFunc = new Function('a', funcBody);
          
          // 시그니처 디코딩 실행
          return decodingFunc(sig);
          
        } catch (error) {
          throw new Error(`시그니처 디코딩 실행 실패: ${error.message}`);
        }
      }, decoder.functionCode, signature);

      await page.close();
      
      console.log(`✅ 시그니처 디코딩 성공: ${signature.substring(0, 10)}... -> ${decodedSignature.substring(0, 10)}...`);
      return decodedSignature;

    } catch (error) {
      console.error('❌ 시그니처 디코딩 실행 실패:', error);
      if (page) {
        await page.close().catch(() => {});
      }
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
      console.log('✅ 시그니처 브라우저 종료됨');
    } catch (error) {
      console.error('❌ 시그니처 브라우저 종료 실패:', error);
    }
  }

  /**
   * 정리 작업
   */
  async cleanup() {
    await this.closeBrowser();
    this.signatureFunctions.clear();
    console.log('✅ YouTube Signature Service 정리 완료');
  }
}

module.exports = new YouTubeSignatureService();