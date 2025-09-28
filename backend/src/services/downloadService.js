const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const proxyService = require('./proxyService');
const youtubeStreamService = require('./youtubeStreamService');
const config = require('../config');
const { 
  formatFileSize, 
  generateTaskId,
  createErrorResponse,
  createSuccessResponse,
  retry,
  extractVideoId,
  isValidYouTubeUrl
} = require('../utils/helpers');

class DownloadService {
  constructor() {
    this.activeTasks = new Map();
    this.downloadDir = path.join(__dirname, '../../downloads');
    
    // 다운로드 디렉토리 생성
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * 다운로드 요청 처리 (실제 YouTube 스트림 URL 제공)
   */
  async requestDownload(options) {
    const {
      url,
      mediaType = 'video', // 'video' 또는 'audio'
      formatType = 'mp4',   // 'mp4', 'webm', 'mp3', 'm4a' 등
      quality = '720p',     // '720p', '480p', '360p' 등
      videoInfo = null
    } = options;

    try {
      console.log(`다운로드 요청: ${mediaType} ${formatType} ${quality}`);
      
      const taskId = generateTaskId();
      
      // 작업 정보 저장
      const task = {
        id: taskId,
        url,
        mediaType,
        formatType, 
        quality,
        status: 'pending',
        createdAt: new Date().toISOString(),
        videoInfo
      };
      
      this.activeTasks.set(taskId, task);
      
      // 실제 다운로드 URL 생성
      const downloadUrl = await this.generateDownloadUrl(task);
      
      if (!downloadUrl) {
        throw new Error('다운로드 URL을 생성할 수 없습니다');
      }
      
      // 작업 완료 상태로 업데이트
      task.status = 'ready';
      task.downloadUrl = downloadUrl.download_url || downloadUrl;
      task.downloadInfo = downloadUrl;
      task.updatedAt = new Date().toISOString();
      
      console.log(`다운로드 URL 생성 완료: ${taskId}`);
      
      return createSuccessResponse({
        task_id: taskId,
        download_url: task.downloadUrl,
        media_type: mediaType,
        format: formatType,
        quality: quality,
        title: downloadUrl.title || 'YouTube 비디오',
        author: downloadUrl.author || 'YouTube',
        thumbnail: downloadUrl.thumbnail || '',
        direct_download: downloadUrl.direct_download || false,
        headers: downloadUrl.headers || {},
        message: downloadUrl.message || '다운로드 준비가 완료되었습니다.',
        fallback: downloadUrl.fallback || false
      });
      
    } catch (error) {
      console.error('다운로드 요청 처리 실패:', error);
      throw new Error(`다운로드 요청 실패: ${error.message}`);
    }
  }

  /**
   * 실제 다운로드 URL 생성 - YouTube 스트림 URL 추출
   */
  async generateDownloadUrl(task) {
    try {
      const { url, mediaType, formatType, quality, videoInfo } = task;
      
      // YouTube URL 확인
      if (!isValidYouTubeUrl(url)) {
        throw new Error('YouTube URL이 아닙니다');
      }
      
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error('YouTube 비디오 ID를 추출할 수 없습니다');
      }
      
      console.log(`실제 스트림 URL 생성 중: ${videoId}`);
      
      // YouTube 스트림 정보 가져오기
      const downloadInfo = await youtubeStreamService.getDownloadInfo(videoId, {
        quality: quality,
        mediaType: mediaType,
        format: formatType
      });
      
      if (!downloadInfo || !downloadInfo.downloadUrl) {
        throw new Error('스트림 URL을 찾을 수 없습니다');
      }
      
      console.log(`실제 스트림 URL 생성 완료: ${videoId}`);
      
      return {
        download_url: downloadInfo.downloadUrl,
        direct_download: true,
        title: downloadInfo.title,
        author: downloadInfo.author,
        duration: downloadInfo.duration,
        thumbnail: downloadInfo.thumbnail,
        format_info: downloadInfo.formatInfo,
        headers: downloadInfo.headers,
        message: `${downloadInfo.title} - 다운로드 준비가 완료되었습니다.`,
        fallback: false
      };
      
    } catch (error) {
      console.error('다운로드 URL 생성 실패:', error);
      
      // 실패 시 기본 정보 제공
      return {
        download_url: task.url,
        direct_download: false,
        message: '스트림 URL을 가져올 수 없어 원본 URL을 제공합니다. 브라우저에서 직접 다운로드하세요.',
        fallback: true,
        error: error.message
      };
    }
  }

  /**
   * 포맷 리스트에서 직접 다운로드 URL 추출
   */
  extractDirectUrl(formats, mediaType, formatType, quality) {
    console.log(`포맷 검색: ${mediaType} ${formatType} ${quality}`);
    
    let targetHeight = parseInt(quality.replace('p', ''));
    if (isNaN(targetHeight)) {
      targetHeight = 720; // 기본값
    }
    
    // 비디오 요청인 경우
    if (mediaType === 'video') {
      // 1. 통합 포맷 우선 (비디오+오디오)
      const combinedFormats = formats.filter(f => 
        f.hasVideo && 
        f.hasAudio && 
        f.height === targetHeight &&
        (f.ext === formatType || !formatType)
      );
      
      if (combinedFormats.length > 0) {
        const bestFormat = combinedFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        console.log(`통합 포맷 선택: ${bestFormat.formatId} ${bestFormat.quality}`);
        return bestFormat.url;
      }
      
      // 2. 분리된 비디오 포맷
      const videoFormats = formats.filter(f => 
        f.hasVideo && 
        !f.hasAudio &&
        f.height === targetHeight
      );
      
      if (videoFormats.length > 0) {
        const bestVideo = videoFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        console.log(`비디오 포맷 선택: ${bestVideo.formatId} ${bestVideo.quality}`);
        return bestVideo.url;
      }
      
      // 3. 가장 가까운 품질
      const allVideoFormats = formats.filter(f => f.hasVideo && f.height);
      if (allVideoFormats.length > 0) {
        const closest = allVideoFormats.reduce((prev, curr) => 
          Math.abs(curr.height - targetHeight) < Math.abs(prev.height - targetHeight) ? curr : prev
        );
        console.log(`근사 품질 선택: ${closest.formatId} ${closest.quality}`);
        return closest.url;
      }
    }
    
    // 오디오 요청인 경우
    if (mediaType === 'audio') {
      const audioFormats = formats.filter(f => 
        f.hasAudio && 
        !f.hasVideo &&
        (f.ext === formatType || !formatType)
      );
      
      if (audioFormats.length > 0) {
        const bestAudio = audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        console.log(`오디오 포맷 선택: ${bestAudio.formatId}`);
        return bestAudio.url;
      }
    }
    
    // 마지막 수단: 첫 번째 사용 가능한 포맷
    const anyFormat = formats.find(f => f.url);
    if (anyFormat) {
      console.log(`기본 포맷 선택: ${anyFormat.formatId}`);
      return anyFormat.url;
    }
    
    throw new Error('사용 가능한 다운로드 포맷을 찾을 수 없습니다');
  }

  /**
   * 작업 상태 확인
   */
  getTaskStatus(taskId) {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      return createErrorResponse('작업을 찾을 수 없습니다', 'TASK_NOT_FOUND', 404);
    }
    
    return createSuccessResponse({
      task_id: taskId,
      status: task.status,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      download_url: task.downloadUrl,
      media_type: task.mediaType,
      format: task.formatType,
      quality: task.quality
    });
  }

  /**
   * 완료된 작업 정리
   */
  cleanupCompletedTasks() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1시간
    
    for (const [taskId, task] of this.activeTasks.entries()) {
      const taskTime = new Date(task.createdAt).getTime();
      
      if (now - taskTime > maxAge) {
        this.activeTasks.delete(taskId);
        console.log(`작업 정리: ${taskId}`);
      }
    }
  }

  /**
   * 활성 작업 목록 반환
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 서비스 상태 반환
   */
  getServiceStatus() {
    return {
      active_tasks: this.activeTasks.size,
      download_directory: this.downloadDir,
      max_file_size: formatFileSize(config.download.maxFileSize),
      allowed_formats: config.download.allowedFormats,
      timeout: config.download.timeout
    };
  }
}

// 정기적으로 완료된 작업 정리 (10분마다)
const downloadService = new DownloadService();
setInterval(() => {
  downloadService.cleanupCompletedTasks();
}, 10 * 60 * 1000);

module.exports = downloadService;