const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const execAsync = promisify(exec);

class Youtube4KDownloaderExtractor {
  constructor() {
    console.log('🎬 YouTube4KDownloader 추출기 초기화됨');
    this.timeout = 60; // 60초
    this.baseUrl = 'https://youtube4kdownloader.com';
    this.apiUrl = 'https://s4.youtube4kdownloader.com/ajax/getLinks.php';
  }

  /**
   * YouTube4KDownloader를 통한 URL 추출 (curl 기반)
   */
  async extractDownloadUrl(videoUrl, quality = '720p', useProxy = true) {
    try {
      console.log(`🎬 YouTube4KDownloader 추출 시작: ${videoUrl} (${quality})`);

      const proxy = useProxy ? this.getProxyConfig() : null;
      if (proxy) {
        console.log(`🌐 프록시 사용: ${proxy.host}:${proxy.port}`);
      }

      // 1. 먼저 메인 페이지에 접근해서 폼을 제출
      const videoId = this.extractVideoId(videoUrl);
      const encodedUrl = encodeURIComponent(videoUrl);
      
      console.log(`📺 비디오 ID: ${videoId}`);
      console.log(`🔗 인코딩된 URL: ${encodedUrl}`);

      // 2. API 호출 (GET 요청 - 실제 네트워크 분석 결과)
      const randomString = 'ySLMdLX528j8cga'; // 성공했던 실제 값 사용
      const apiUrl = `${this.apiUrl}?video=${encodedUrl}&rand=${randomString}`;
      
      let curlCmd = 'curl -s';
      
      if (proxy) {
        curlCmd += ` --proxy ${proxy.host}:${proxy.port}`;
        curlCmd += ` --proxy-user "${proxy.username}:${proxy.password}"`;
      }
      
      curlCmd += ` --header "Accept: application/json, text/plain, */*"`;
      curlCmd += ` --header "Referer: https://youtube4kdownloader.com/"`;
      curlCmd += ` --header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`;
      curlCmd += ` --max-time 30`;
      curlCmd += ` --insecure`;
      curlCmd += ` '${apiUrl}'`; // 작은따옴표로 감싸서 shell 이스케이핑 문제 해결

      console.log('🔧 API 호출 중...');
      const { stdout: apiResponse, stderr } = await execAsync(curlCmd);

      if (stderr) {
        console.warn(`⚠️ API curl stderr: ${stderr}`);
      }

      console.log(`📥 API 응답: ${apiResponse.substring(0, 200)}...`);

      // 3. JSON 응답 파싱
      if (apiResponse && apiResponse.trim()) {
        try {
          const jsonResponse = JSON.parse(apiResponse);
          
          if (jsonResponse.status === 'success') {
            console.log('✅ API 호출 성공, JSON 파싱 중...');
            return this.parseJsonResponse(jsonResponse, quality);
          } else if (jsonResponse.status === 'red') {
            // Redirect 처리
            console.log('🔄 Redirect 응답 처리 중...');
            const redirectUrl = jsonResponse.data;
            console.log(`🔗 Redirect URL: ${redirectUrl.substring(0, 100)}...`);
            
            // Redirect URL로 재요청
            let redirectCmd = 'curl -s';
            
            if (proxy) {
              redirectCmd += ` --proxy ${proxy.host}:${proxy.port}`;
              redirectCmd += ` --proxy-user "${proxy.username}:${proxy.password}"`;
            }
            
            redirectCmd += ` --header "Accept: application/json, text/plain, */*"`;
            redirectCmd += ` --header "Referer: https://youtube4kdownloader.com/"`;
            redirectCmd += ` --header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`;
            redirectCmd += ` --max-time 30`;
            redirectCmd += ` --insecure`;
            redirectCmd += ` '${redirectUrl}'`;
            
            console.log('🔧 Redirect API 호출 중...');
            const { stdout: redirectResponse, stderr: redirectStderr } = await execAsync(redirectCmd);
            
            if (redirectStderr) {
              console.warn(`⚠️ Redirect curl stderr: ${redirectStderr}`);
            }
            
            if (redirectResponse && redirectResponse.trim()) {
              const redirectJsonResponse = JSON.parse(redirectResponse);
              
              if (redirectJsonResponse.status === 'success') {
                console.log('✅ Redirect API 호출 성공, JSON 파싱 중...');
                return this.parseJsonResponse(redirectJsonResponse, quality);
              }
            }
          } else {
            console.error(`❌ API 오류: ${jsonResponse.error_msg}`);
          }
        } catch (parseError) {
          console.error(`❌ JSON 파싱 실패: ${parseError.message}`);
        }
      }

      // 4. 대안: 직접 form 제출 방식
      console.log('🔄 대안 방법 시도: 직접 form 제출...');
      return await this.extractViaDirectSubmission(videoUrl, quality, proxy);

    } catch (error) {
      console.error(`❌ YouTube4KDownloader 추출 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        service: 'YouTube4KDownloader'
      };
    }
  }

  /**
   * 직접 form 제출 방식
   */
  async extractViaDirectSubmission(videoUrl, quality, proxy = null) {
    try {
      console.log('📝 직접 form 제출 방식 시도...');
      
      // 메인 페이지에서 form을 제출하는 방식으로 시도
      const encodedUrl = encodeURIComponent(videoUrl);
      const submitUrl = `${this.baseUrl}/`;
      
      let curlCmd = 'curl -s -L -X POST';
      
      if (proxy) {
        curlCmd += ` --proxy ${proxy.host}:${proxy.port}`;
        curlCmd += ` --proxy-user "${proxy.username}:${proxy.password}"`;
      }
      
      curlCmd += ` --header "Content-Type: application/x-www-form-urlencoded"`;
      curlCmd += ` --header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"`;
      curlCmd += ` --header "Referer: https://youtube4kdownloader.com/"`;
      curlCmd += ` --header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`;
      curlCmd += ` --data "video=${encodedUrl}"`;
      curlCmd += ` --max-time 45`;
      curlCmd += ` --insecure`;
      curlCmd += ` "${submitUrl}"`;

      console.log('🚀 Form 제출 중...');
      const { stdout: htmlResponse } = await execAsync(curlCmd);

      if (htmlResponse && htmlResponse.length > 1000) {
        // HTML 방식은 더 이상 지원하지 않음 (JavaScript가 필요함)
        throw new Error('HTML 파싱은 JavaScript가 필요하여 지원하지 않습니다. API 방식을 사용하세요.');
      }

      throw new Error('Form 제출 실패 또는 빈 응답');

    } catch (error) {
      console.error(`❌ 직접 제출 방식 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * JSON API 응답 파싱
   */
  parseJsonResponse(jsonResponse, targetQuality) {
    try {
      console.log(`📋 JSON 응답 파싱 중...`);
      
      const data = jsonResponse.data;
      if (!data) {
        throw new Error('응답 데이터가 없습니다');
      }

      // 비디오+오디오 결합 링크들 (av 배열)
      const avLinks = data.av || [];
      const downloadLinks = [];

      console.log(`🔍 ${avLinks.length}개 다운로드 옵션 발견`);

      // av 배열을 downloadLinks 형태로 변환
      avLinks.forEach((item, index) => {
        const sizeInMB = item.size ? (item.size / 1024 / 1024).toFixed(1) + ' MB' : 'Unknown';
        
        // URL에서 [[_index_]] placeholder를 실제 인덱스로 교체
        const actualUrl = item.url.replace('c[[_index_]]', `c${index}`);
        
        downloadLinks.push({
          quality: item.quality,
          format: item.ext,
          size: sizeInMB,
          codec: item.vcodec || 'Unknown',
          fps: item.fps || '',
          hdr: item.hdr || '',
          url: actualUrl,
          rawQuality: this.extractQualityNumber(item.quality),
          originalSize: item.size
        });
      });

      console.log(`🔍 ${downloadLinks.length}개 다운로드 링크 처리됨`);

      if (downloadLinks.length > 0) {
        // 원하는 품질에 맞는 링크 선택
        const selectedLink = this.selectBestLink(downloadLinks, targetQuality);
        
        if (selectedLink) {
          console.log(`🎯 선택된 링크: ${selectedLink.quality} ${selectedLink.format} (${selectedLink.size})`);

          return {
            success: true,
            downloadUrl: selectedLink.url,
            quality: selectedLink.quality,
            format: selectedLink.format,
            size: selectedLink.size,
            codec: selectedLink.codec,
            fps: selectedLink.fps,
            hdr: selectedLink.hdr,
            service: 'YouTube4KDownloader',
            method: 'curl_api',
            videoInfo: {
              title: data.title || 'Unknown',
              thumbnail: data.thumbnail || '',
              duration: data.duration || ''
            },
            alternativeUrls: downloadLinks.slice(0, 5).map(link => link.url)
          };
        }
      }

      throw new Error('유효한 다운로드 링크를 찾을 수 없습니다');

    } catch (error) {
      console.error(`❌ JSON 파싱 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 최적 링크 선택
   */
  selectBestLink(links, targetQuality) {
    const targetNum = this.extractQualityNumber(targetQuality);
    
    // 1. 정확한 품질 매치 찾기
    let exactMatch = links.find(link => link.rawQuality === targetNum);
    
    // 2. MP4 우선순위
    if (exactMatch) {
      const mp4Match = links.find(link => 
        link.rawQuality === targetNum && link.format.toLowerCase() === 'mp4'
      );
      if (mp4Match) exactMatch = mp4Match;
    }

    if (exactMatch) return exactMatch;

    // 3. 가장 가까운 품질 찾기
    const sortedByQuality = links.sort((a, b) => 
      Math.abs(a.rawQuality - targetNum) - Math.abs(b.rawQuality - targetNum)
    );

    return sortedByQuality[0];
  }

  /**
   * 품질 텍스트에서 숫자 추출
   */
  extractQualityNumber(qualityText) {
    const match = qualityText.match(/(\d+)p?/);
    return match ? parseInt(match[1]) : 720;
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
   * 랜덤 문자열 생성 (브라우저 패턴과 동일)
   */
  generateRandomString(length = 15) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 프록시 설정 가져오기
   */
  getProxyConfig() {
    try {
      // YouTube4KDownloader용 기본 프록시 설정 (세션 없이)
      return {
        host: 'proxy.smartproxy.net',
        port: 3120,
        username: 'smart-hqmx0000',
        password: 'Straight8'
      };
    } catch (error) {
      console.warn(`⚠️ 프록시 설정 실패: ${error.message}`);
    }
    
    return null;
  }

  /**
   * curl로 실제 파일 다운로드
   */
  async downloadWithCurl(downloadUrl, outputPath, useProxy = true, onProgress = null) {
    try {
      console.log(`⬇️ YouTube4K curl 다운로드 시작: ${outputPath}`);
      
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
      
      curlCmd += ` --header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`;
      curlCmd += ` --header "Referer: https://youtube4kdownloader.com/"`;
      curlCmd += ` --max-time 300`; // 5분
      curlCmd += ` --insecure`;
      curlCmd += ` -L`; // Follow redirects
      curlCmd += ` --cookie-jar /tmp/yt4k_cookies.txt`; // Save cookies
      curlCmd += ` --cookie /tmp/yt4k_cookies.txt`; // Use cookies
      curlCmd += ` --progress-bar`; // 진행률 표시
      curlCmd += ` -o "${outputPath}"`;
      curlCmd += ` "${downloadUrl}"`;

      console.log('🚀 YouTube4K curl 다운로드 실행 중...');
      const startTime = Date.now();
      
      const { stdout, stderr } = await execAsync(curlCmd);
      
      const totalTime = Date.now() - startTime;
      
      // 파일 크기 확인
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;
        const avgSpeed = (fileSize / 1024 / 1024) / (totalTime / 1000);
        
        console.log(`✅ YouTube4K curl 다운로드 완료: ${(fileSize / 1024 / 1024).toFixed(2)}MB (${avgSpeed.toFixed(2)}MB/s)`);
        
        if (fileSize > 1024 * 1024) { // 1MB 이상
          return {
            success: true,
            filePath: outputPath,
            fileSize: fileSize,
            totalTime: totalTime,
            avgSpeed: avgSpeed,
            method: 'youtube4k_curl'
          };
        } else {
          throw new Error(`파일 크기가 너무 작음: ${fileSize} 바이트`);
        }
      } else {
        throw new Error('다운로드된 파일을 찾을 수 없음');
      }

    } catch (error) {
      console.error(`❌ YouTube4K curl 다운로드 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 지원되는 품질 옵션
   */
  getSupportedQualities() {
    return ['1080p', '720p', '480p', '360p'];
  }
}

module.exports = new Youtube4KDownloaderExtractor();