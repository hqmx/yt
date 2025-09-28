const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const execAsync = promisify(exec);

class CurlExtractor {
  constructor() {
    console.log('🔧 Curl 기반 추출기 초기화됨');
    this.timeout = 60; // 60초
  }

  /**
   * Smartproxy를 통한 curl 명령어 생성
   */
  buildCurlCommand(url, options = {}) {
    const {
      proxy = null,
      userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      followRedirects = true,
      timeout = this.timeout
    } = options;

    let curlCmd = 'curl -s -L';
    
    // 프록시 설정
    if (proxy) {
      curlCmd += ` --proxy ${proxy.host}:${proxy.port}`;
      curlCmd += ` --proxy-user "${proxy.username}:${proxy.password}"`;
    }
    
    // 기본 헤더들
    curlCmd += ` --user-agent "${userAgent}"`;
    curlCmd += ` --header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"`;
    curlCmd += ` --header "Accept-Language: en-US,en;q=0.5"`;
    curlCmd += ` --header "Accept-Encoding: gzip, deflate, br"`;
    curlCmd += ` --header "DNT: 1"`;
    curlCmd += ` --header "Connection: keep-alive"`;
    curlCmd += ` --header "Upgrade-Insecure-Requests: 1"`;
    
    // 옵션들
    if (followRedirects) curlCmd += ' -L';
    curlCmd += ` --max-time ${timeout}`;
    curlCmd += ' --compressed';
    curlCmd += ' --insecure'; // SSL 검증 우회
    
    curlCmd += ` "${url}"`;
    
    return curlCmd;
  }

  /**
   * 프록시 설정 가져오기
   */
  getProxyConfig() {
    try {
      const proxyPoolManager = require('../proxyPoolManager');
      const bestProxies = proxyPoolManager.getBestProxies(1);
      
      if (bestProxies.length > 0) {
        const proxy = bestProxies[0];
        return {
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password
        };
      }
    } catch (error) {
      console.warn(`⚠️ 프록시 설정 실패: ${error.message}`);
    }
    
    return null;
  }

  /**
   * SSYouTube를 통한 URL 추출 (curl + cheerio)
   */
  async extractViaSSYouTube(videoUrl, quality = '720p', useProxy = true) {
    try {
      console.log(`🟦 SSYouTube curl 추출 시작: ${videoUrl} (${quality})`);

      // YouTube URL을 SSYouTube URL로 변환
      const videoId = this.extractVideoId(videoUrl);
      const ssyoutubeUrl = `https://ssyoutube.com/watch?v=${videoId}`;
      
      console.log(`🔗 SSYouTube URL: ${ssyoutubeUrl}`);

      // 프록시 설정
      const proxy = useProxy ? this.getProxyConfig() : null;
      if (proxy) {
        console.log(`🌐 프록시 사용: ${proxy.host}:${proxy.port}`);
      }

      // curl 명령어 실행
      const curlCmd = this.buildCurlCommand(ssyoutubeUrl, { proxy });
      console.log('🔧 curl 명령어 실행 중...');
      
      const { stdout, stderr } = await execAsync(curlCmd);
      
      if (stderr) {
        console.warn(`⚠️ curl stderr: ${stderr}`);
      }

      if (!stdout || stdout.length < 100) {
        throw new Error('빈 응답 또는 접근 차단');
      }

      console.log(`✅ HTML 응답 크기: ${stdout.length} 바이트`);

      // cheerio로 HTML 파싱
      const $ = cheerio.load(stdout);
      
      // Google Video URL 찾기 (여러 패턴 시도)
      const googleVideoUrls = [];
      
      // 링크에서 찾기
      $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href && href.includes('googlevideo.com') && href.includes('videoplayback')) {
          googleVideoUrls.push(href);
        }
      });

      // 텍스트에서 정규식으로 찾기
      const textMatches = stdout.match(/https:\/\/[^"]*googlevideo\.com[^"]*/g);
      if (textMatches) {
        textMatches.forEach(url => {
          if (url.includes('videoplayback') && !googleVideoUrls.includes(url)) {
            googleVideoUrls.push(url);
          }
        });
      }

      if (googleVideoUrls.length > 0) {
        console.log(`🎯 ${googleVideoUrls.length}개 Google Video URL 발견`);
        
        // 첫 번째 URL의 유효성 검증
        const testUrl = googleVideoUrls[0];
        const isValid = await this.validateUrlWithCurl(testUrl, proxy);
        
        if (isValid) {
          return {
            success: true,
            downloadUrl: testUrl,
            quality: quality,
            service: 'SSYouTube (curl)',
            method: 'curl_extraction',
            alternativeUrls: googleVideoUrls.slice(1, 3)
          };
        }
      }

      throw new Error('유효한 Google Video URL을 찾을 수 없습니다');

    } catch (error) {
      console.error(`❌ SSYouTube curl 추출 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        service: 'SSYouTube (curl)'
      };
    }
  }

  /**
   * SaveFrom을 통한 URL 추출 (curl + 간단한 요청)
   */
  async extractViaSaveFrom(videoUrl, quality = '720p', useProxy = true) {
    try {
      console.log(`🔗 SaveFrom curl 추출 시작: ${videoUrl} (${quality})`);

      const proxy = useProxy ? this.getProxyConfig() : null;

      // SaveFrom API 호출 (POST 요청)
      const postData = `url=${encodeURIComponent(videoUrl)}&lang=en`;
      let curlCmd = 'curl -s -X POST';
      
      if (proxy) {
        curlCmd += ` --proxy ${proxy.host}:${proxy.port}`;
        curlCmd += ` --proxy-user "${proxy.username}:${proxy.password}"`;
      }
      
      curlCmd += ' --header "Content-Type: application/x-www-form-urlencoded"';
      curlCmd += ' --header "Accept: application/json, text/plain, */*"';
      curlCmd += ` --data "${postData}"`;
      curlCmd += ' --max-time 30';
      curlCmd += ' --insecure';
      curlCmd += ' "https://savefrom.net/process"';

      console.log('🔧 SaveFrom API 호출 중...');
      const { stdout, stderr } = await execAsync(curlCmd);

      if (stderr) {
        console.warn(`⚠️ curl stderr: ${stderr}`);
      }

      if (!stdout) {
        throw new Error('빈 응답');
      }

      // JSON 응답 파싱 시도
      try {
        const response = JSON.parse(stdout);
        if (response.links && Object.keys(response.links).length > 0) {
          console.log(`✅ SaveFrom에서 ${Object.keys(response.links).length}개 링크 발견`);
          
          // 원하는 품질의 링크 찾기
          const targetUrl = this.findBestQualityUrl(response.links, quality);
          
          if (targetUrl) {
            const isValid = await this.validateUrlWithCurl(targetUrl, proxy);
            
            if (isValid) {
              return {
                success: true,
                downloadUrl: targetUrl,
                quality: quality,
                service: 'SaveFrom (curl)',
                method: 'curl_api'
              };
            }
          }
        }
      } catch (parseError) {
        console.warn(`⚠️ JSON 파싱 실패: ${parseError.message}`);
        // HTML 응답일 수도 있으므로 HTML 파싱으로 폴백
      }

      throw new Error('SaveFrom에서 유효한 링크를 찾을 수 없습니다');

    } catch (error) {
      console.error(`❌ SaveFrom curl 추출 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        service: 'SaveFrom (curl)'
      };
    }
  }

  /**
   * curl로 URL 유효성 검증 (HEAD 요청)
   */
  async validateUrlWithCurl(url, proxy = null) {
    try {
      console.log('🔍 curl로 URL 유효성 검증 중...');
      
      let curlCmd = 'curl -I -s';
      
      if (proxy) {
        curlCmd += ` --proxy ${proxy.host}:${proxy.port}`;
        curlCmd += ` --proxy-user "${proxy.username}:${proxy.password}"`;
      }
      
      curlCmd += ' --max-time 10';
      curlCmd += ' --insecure';
      curlCmd += ` "${url}"`;

      const { stdout } = await execAsync(curlCmd);
      
      // Content-Length 확인
      const contentLengthMatch = stdout.match(/content-length:\s*(\d+)/i);
      if (contentLengthMatch) {
        const contentLength = parseInt(contentLengthMatch[1]);
        console.log(`📏 컨텐츠 크기: ${(contentLength / 1024 / 1024).toFixed(1)}MB`);
        
        // 최소 1MB 이상이어야 유효
        return contentLength > 1024 * 1024;
      }

      // 200 응답인지 확인
      const isSuccess = stdout.includes('200 OK') || stdout.includes('HTTP/2 200');
      console.log(`📊 응답 상태: ${isSuccess ? 'OK' : 'FAIL'}`);
      
      return isSuccess;

    } catch (error) {
      console.warn(`⚠️ URL 검증 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * curl로 실제 파일 다운로드
   */
  async downloadWithCurl(downloadUrl, outputPath, useProxy = true, onProgress = null) {
    try {
      console.log(`⬇️ curl 다운로드 시작: ${outputPath}`);
      
      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const proxy = useProxy ? this.getProxyConfig() : null;
      
      let curlCmd = 'curl -L';
      
      if (proxy) {
        curlCmd += ` --proxy ${proxy.host}:${proxy.port}`;
        curlCmd += ` --proxy-user "${proxy.username}:${proxy.password}"`;
      }
      
      curlCmd += ' --header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"';
      curlCmd += ' --max-time 300'; // 5분
      curlCmd += ' --insecure';
      curlCmd += ' --progress-bar'; // 진행률 표시
      curlCmd += ` -o "${outputPath}"`;
      curlCmd += ` "${downloadUrl}"`;

      console.log('🚀 curl 다운로드 실행 중...');
      const startTime = Date.now();
      
      const { stdout, stderr } = await execAsync(curlCmd);
      
      const totalTime = Date.now() - startTime;
      
      // 파일 크기 확인
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        const avgSpeed = (fileSize / 1024 / 1024) / (totalTime / 1000);
        
        console.log(`✅ curl 다운로드 완료: ${(fileSize / 1024 / 1024).toFixed(2)}MB (${avgSpeed.toFixed(2)}MB/s)`);
        
        if (fileSize > 1024 * 1024) { // 1MB 이상
          return {
            success: true,
            filePath: outputPath,
            fileSize: fileSize,
            totalTime: totalTime,
            avgSpeed: avgSpeed,
            method: 'curl'
          };
        } else {
          throw new Error(`파일 크기가 너무 작음: ${fileSize} 바이트`);
        }
      } else {
        throw new Error('다운로드된 파일을 찾을 수 없음');
      }

    } catch (error) {
      console.error(`❌ curl 다운로드 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 통합 추출 + 다운로드
   */
  async extractAndDownload(videoUrl, outputPath, options = {}) {
    const { quality = '720p', useProxy = true, preferredService = 'ssyoutube' } = options;
    
    try {
      console.log(`🚀 curl 통합 프로세스 시작: ${videoUrl}`);

      let extractResult = null;
      
      // 선호 서비스 우선 시도
      if (preferredService === 'ssyoutube') {
        extractResult = await this.extractViaSSYouTube(videoUrl, quality, useProxy);
        if (!extractResult.success) {
          console.warn('⚠️ SSYouTube 실패, SaveFrom 시도...');
          extractResult = await this.extractViaSaveFrom(videoUrl, quality, useProxy);
        }
      } else {
        extractResult = await this.extractViaSaveFrom(videoUrl, quality, useProxy);
        if (!extractResult.success) {
          console.warn('⚠️ SaveFrom 실패, SSYouTube 시도...');
          extractResult = await this.extractViaSSYouTube(videoUrl, quality, useProxy);
        }
      }

      if (!extractResult.success) {
        throw new Error(`모든 curl 추출 방법 실패: ${extractResult.error}`);
      }

      console.log(`✅ URL 추출 성공: ${extractResult.service}`);

      // 실제 다운로드
      const downloadResult = await this.downloadWithCurl(
        extractResult.downloadUrl, 
        outputPath, 
        useProxy
      );

      return {
        success: true,
        extraction: extractResult,
        download: downloadResult,
        service: extractResult.service + ' + curl'
      };

    } catch (error) {
      console.error(`❌ curl 통합 프로세스 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * YouTube 비디오 ID 추출
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
   * 최적 품질 URL 선택
   */
  findBestQualityUrl(links, targetQuality) {
    const qualityPriority = {
      '1080p': ['1080p', '720p', '480p', '360p'],
      '720p': ['720p', '1080p', '480p', '360p'],
      '480p': ['480p', '720p', '360p', '1080p'],
      '360p': ['360p', '480p', '720p', '1080p']
    };

    const priorities = qualityPriority[targetQuality] || qualityPriority['720p'];
    
    for (const quality of priorities) {
      for (const [key, link] of Object.entries(links)) {
        if (key.includes(quality) && link.url) {
          console.log(`🎯 ${quality} 품질 링크 발견: ${key}`);
          return link.url;
        }
      }
    }

    // 폴백: 첫 번째 사용 가능한 링크
    for (const [key, link] of Object.entries(links)) {
      if (link.url) {
        console.log(`🔄 폴백 링크 사용: ${key}`);
        return link.url;
      }
    }

    return null;
  }
}

module.exports = new CurlExtractor();