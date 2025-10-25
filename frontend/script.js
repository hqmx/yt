document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let state = {
        currentTaskId: null,
        currentFormat: 'video',
        mediaInfo: null,
        eventSource: null
    };

    // --- CONFIGURATION ---
    // API 엔드포인트 설정
// 로컬 개발: http://localhost:5001/api
// 프로덕션: https://yt.hqmx.net/api (메인), https://hqmx.net/api (레거시)
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '10.0.1.65'
    ? 'http://10.0.1.65:5001/api'
    : 'https://yt.hqmx.net/api';

    // Quality preset definitions
    const VIDEO_PRESETS = [
        { label: '4K', height: 2160 },
        { label: '2K', height: 1440 },
        { label: '1080HD', height: 1080 },
        { label: '720p', height: 720 },
        { label: '480p', height: 480 },
        { label: '360p', height: 360 },
        { label: '240p', height: 240 },
        { label: '144p', height: 144 }
    ];

    const FPS_PRESETS = [60, 30, 24];

    const AUDIO_PRESETS = [
        { label: 'Lossless', value: 'lossless' },
        { label: '320kbps', value: '320' },
        { label: '192kbps', value: '192' },
        { label: '128kbps', value: '128' }
    ];

    // --- DOM ELEMENT CACHE ---
    const dom = {
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        urlInput: document.getElementById('urlInput'),
        analyzeBtn: document.getElementById('analyzeBtn'),
        analyzeBtnIcon: document.getElementById('analyzeBtn').querySelector('i'),
        analyzeBtnText: document.getElementById('analyzeBtn').querySelector('span'),
        previewSection: document.getElementById('previewSection'),
        previewContainer: document.getElementById('previewContainer'),
        urlSection: document.getElementById('urlSection'),
        adBannerSection: document.getElementById('adBannerSection'),
        thumbnailImg: document.getElementById('thumbnailImg'),
        mediaTitle: document.getElementById('mediaTitle'),
        mediaDuration: document.getElementById('mediaDuration'),
        formatTabs: document.querySelectorAll('.format-tab'),
        videoFormatsContainer: document.getElementById('videoFormats'),
        audioFormatsContainer: document.getElementById('audioFormats'),
        videoFormat: document.getElementById('videoFormat'),
        videoQuality: document.getElementById('videoQuality'),
        videoFps: document.getElementById('videoFps'),
        audioFormat: document.getElementById('audioFormat'),
        audioQuality: document.getElementById('audioQuality'),
        videoSizeEstimate: document.getElementById('videoSizeEstimate'),
        audioSizeEstimate: document.getElementById('audioSizeEstimate'),
        downloadBtn: document.getElementById('downloadBtn'),
        progressContainer: document.getElementById('progressSection'),
        spinner: document.querySelector('#progressSection .spinner'),
        progressStatus: document.getElementById('progressStatus'),
        progressPercentage: document.querySelector('#progressSection .progress-percentage'),
        progressBar: document.querySelector('#progressSection .progress-fill'),
    };

    // --- THEME MANAGEMENT ---
    const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.body.setAttribute('data-theme', currentTheme);

    // --- BACKGROUND IMAGE LOADING ---
    // 테마 설정 후 배경 이미지 로드
    function handleThemeToggle() {
        const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // Navigation Functions
    function toggleMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

        hamburgerMenu.classList.toggle('active');
        mobileMenuOverlay.classList.toggle('show');

        // 모바일 메뉴가 열릴 때 토글 버튼들 강제 표시
        if (mobileMenuOverlay.classList.contains('show')) {
            const mobileControls = document.querySelector('.mobile-menu-controls');
            const mobileControlItems = document.querySelectorAll('.mobile-control-item');
            const mobileThemeBtn = document.getElementById('mobileThemeToggleBtn');
            const mobileLangBtn = document.getElementById('mobileLanguageSelectorBtn');

            if (mobileControls) {
                mobileControls.style.display = 'block';
                mobileControls.style.visibility = 'visible';
                mobileControls.style.opacity = '1';
            }

            mobileControlItems.forEach(item => {
                item.style.display = 'flex';
                item.style.visibility = 'visible';
                item.style.opacity = '1';
            });

            if (mobileThemeBtn) {
                mobileThemeBtn.style.display = 'flex';
                mobileThemeBtn.style.visibility = 'visible';
                mobileThemeBtn.style.opacity = '1';
            }

            if (mobileLangBtn) {
                mobileLangBtn.style.display = 'flex';
                mobileLangBtn.style.visibility = 'visible';
                mobileLangBtn.style.opacity = '1';
            }
        }
    }

    function closeMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

        hamburgerMenu.classList.remove('active');
        mobileMenuOverlay.classList.remove('show');
    }

    // --- EVENT LISTENERS ---
    dom.themeToggleBtn.addEventListener('click', handleThemeToggle);

    // Navigation Event Listeners
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

    if (hamburgerMenu && mobileMenuOverlay) {
        hamburgerMenu.addEventListener('click', toggleMobileMenu);
        mobileMenuOverlay.addEventListener('click', (e) => {
            if (e.target === mobileMenuOverlay) {
                closeMobileMenu();
            }
        });

        // 모바일 메뉴 링크 클릭 시 메뉴 닫기
        document.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                // 기존 네비게이션 로직 사용
                document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(l => l.classList.remove('active'));
                document.querySelectorAll(`[data-section="${section}"]`).forEach(l => l.classList.add('active'));
                closeMobileMenu();
            });
        });

        // 모바일 토글 버튼 이벤트 리스너
        const mobileThemeToggleBtn = document.getElementById('mobileThemeToggleBtn');
        const mobileLanguageSelectorBtn = document.getElementById('mobileLanguageSelectorBtn');
        const mobileLanguageOptions = document.getElementById('mobileLanguageOptions');

        if (mobileThemeToggleBtn) {
            mobileThemeToggleBtn.addEventListener('click', handleThemeToggle);
        }

        if (mobileLanguageSelectorBtn && mobileLanguageOptions) {
            mobileLanguageSelectorBtn.addEventListener('click', () => {
                mobileLanguageOptions.classList.toggle('show');
            });

            mobileLanguageOptions.addEventListener('click', async (e) => {
                if (e.target.dataset.lang) {
                    e.preventDefault(); // Prevent default <a> tag behavior
                    const lang = e.target.dataset.lang;

                    // Close mobile language selector
                    mobileLanguageOptions.classList.remove('show');

                    // Update language using i18n
                    if (typeof i18n !== 'undefined' && i18n.changeLanguage) {
                        await i18n.changeLanguage(lang);
                        const currentLangElement = document.getElementById('mobileCurrentLanguage');
                        if (currentLangElement) {
                            currentLangElement.textContent = e.target.textContent;
                        }
                    }
                }
            });
        }
    }

    dom.analyzeBtn.addEventListener('click', handleAnalyzeClick);
    dom.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAnalyzeClick();
    });
    dom.formatTabs.forEach(tab => {
        tab.addEventListener('click', () => handleFormatSwitch(tab.dataset.mediaType));
    });
    [dom.videoFormat, dom.videoQuality, dom.audioFormat, dom.audioQuality].forEach(el => {
        el.addEventListener('change', updateSizeEstimates);
    });
    dom.downloadBtn.addEventListener('click', handleDownloadClick);

    // --- STATUS DISPLAY FUNCTION ---
    function showStatus(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // 상태 메시지를 UI에 표시 (선택사항)
        // dom.statusDisplay && (dom.statusDisplay.textContent = message);
    }

    // --- HANDLER: Analyze URL ---
    async function handleAnalyzeClick() {
        console.log('🎯 Analyze button clicked!');
        const url = dom.urlInput.value.trim();
        console.log('🔗 URL:', url);
        
        if (!url) {
            console.log('❌ No URL provided');
            showError(t('please_enter_url'));
            return;
        }
        
        console.log('🚀 Starting analysis...');
        setAnalyzingState(true);
        resetUI();

        try {
            const currentLang = localStorage.getItem('language') || 'en';
            console.log('🌍 Language:', currentLang);
            console.log('🔄 API_BASE_URL:', API_BASE_URL);
            
            // 🚀 ULTIMATE SaveFrom 방식으로 분석 수행
            const clientAnalysisResult = await performUltimateAnalysis(url);
            console.log('✅ Analysis result:', clientAnalysisResult);
            
            state.mediaInfo = clientAnalysisResult;
            renderPreview(clientAnalysisResult);
            dom.previewSection.style.display = 'block';

            // 레이아웃 재배치: 미리보기를 상단으로, URL 입력창을 하단으로 이동
            rearrangeLayout();

        } catch (error) {
            console.error('❌ Analysis Error:', error);
            console.error('❌ Error stack:', error.stack);
            showError(t('analysis_failed', { error: error.message }));
        } finally {
            console.log('🏁 Analysis finished, resetting state...');
            setAnalyzingState(false);
        }
    }

    // --- HANDLER: Switch Format ---
    function handleFormatSwitch(type) {
        state.currentFormat = type;
        dom.formatTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mediaType === type));
        dom.videoFormatsContainer.classList.toggle('active', type === 'video');
        dom.audioFormatsContainer.classList.toggle('active', type === 'audio');
        updateSizeEstimates();
    }

    // --- HANDLER: Start Download ---
    async function handleDownloadClick() {
        if (!state.mediaInfo) {
            showError(t('please_analyze_first'));
            return;
        }
        const payload = {
            url: dom.urlInput.value.trim(),
            mediaType: state.currentFormat,
            formatType: state.currentFormat === 'video' ? dom.videoFormat.value : dom.audioFormat.value,
            quality: state.currentFormat === 'video' ? dom.videoQuality.value : dom.audioQuality.value,
            fps: state.currentFormat === 'video' ? dom.videoFps.value : undefined,
            audio_quality: state.currentFormat === 'audio' ? dom.audioQuality.value : undefined,
            useClientIP: true
        };
        setDownloadingState(true);
        updateProgress(0, 'Requesting download...');

        try {
            const currentLang = localStorage.getItem('language') || 'en';
            const response = await fetch(`${API_BASE_URL}/download`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept-Language': currentLang
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok || !data.task_id) throw new Error(data.error || t('failed_to_start_download'));

            state.currentTaskId = data.task_id;
            startProgressMonitor(data.task_id);

        } catch (error) {
            console.error('Download Start Error:', error);
            showError(t('error_prefix', { error: error.message }));
            setDownloadingState(false);
        }
    }

    // --- REAL-TIME: Progress Monitoring via SSE ---
    function startProgressMonitor(taskId) {
        if (state.eventSource) state.eventSource.close();
        state.eventSource = new EventSource(`${API_BASE_URL}/stream-progress/${taskId}`);
        
        state.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.status === 'error') {
                   throw new Error(data.message);
                }
                updateProgress(data.percentage, data.message);
                if (data.status === 'complete') {
                   handleDownloadCompletion(taskId);
                }
            } catch (error) {
                console.error("SSE Message Error:", error)
                showError(t('error_prefix', { error: error.message }));
                handleDownloadTermination();
            }
        };
        
        state.eventSource.onerror = (err) => {
            console.error('SSE connection error:', err);
            showError(t('connection_lost_retrying'));
            setTimeout(() => fetchFinalStatus(taskId), 2000);
            handleDownloadTermination();
        };
    }
    
    // --- FINALIZATION ---
    function handleDownloadCompletion(taskId) {
        updateProgress(100, t('download_complete_transferring'));
        window.location.href = `${API_BASE_URL}/get-file/${taskId}`;
        setTimeout(() => setDownloadingState(false), 3000);
        handleDownloadTermination();
    }
    
    function handleDownloadTermination() {
        if (state.eventSource) {
            state.eventSource.close();
            state.eventSource = null;
        }
        state.currentTaskId = null;
    }

    async function fetchFinalStatus(taskId) {
        try {
            const response = await fetch(`${API_BASE_URL}/check-status/${taskId}`);
            const data = await response.json();
            if (data.status === 'complete') {
                handleDownloadCompletion(taskId);
            } else {
                showError(data.message || t('could_not_complete_task'));
                setDownloadingState(false);
            }
        } catch (error) {
            showError(t('could_not_retrieve_status'));
            setDownloadingState(false);
        }
    }

    // --- UI RENDERING & STATE ---
    function setAnalyzingState(isAnalyzing) {
        dom.analyzeBtn.disabled = isAnalyzing;
        dom.analyzeBtnIcon.className = isAnalyzing ? 'fas fa-spinner fa-spin' : 'fas fa-search';
        dom.analyzeBtnText.textContent = isAnalyzing ? t('analyzing') : t('analyze');
    }

    function setDownloadingState(isDownloading) {
        dom.downloadBtn.style.display = isDownloading ? 'none' : 'block';
        dom.progressContainer.style.display = isDownloading ? 'block' : 'none';
        if (!isDownloading) {
            updateProgress(0, '');
        }
    }
    
    function resetUI() {
        dom.previewSection.style.display = 'none';
        dom.thumbnailImg.src = '';
        dom.thumbnailImg.parentElement.classList.remove('fallback-active');
        state.mediaInfo = null;
        state.currentTaskId = null;
        setDownloadingState(false);
    }

    /**
     * Get thumbnail URL - use direct URL (CORS is handled by CDN)
     * @param {string} thumbnailUrl - Original thumbnail URL
     * @returns {string} Direct thumbnail URL
     */
    function getProxiedThumbnailUrl(thumbnailUrl) {
        if (!thumbnailUrl) return '';

        // Return direct URL - Instagram/YouTube CDNs allow cross-origin image loading
        return thumbnailUrl;
    }

    // --- LAYOUT REARRANGEMENT ---
    function rearrangeLayout() {
        // 미리보기 섹션을 previewContainer로 이동 (상단)
        if (dom.previewSection && dom.previewContainer) {
            dom.previewContainer.appendChild(dom.previewSection);
        }

        // 광고 배너 표시
        if (dom.adBannerSection) {
            dom.adBannerSection.style.display = 'block';
        }

        // URL 섹션의 제목 숨기기 (선택사항: 분석 후에는 제목 불필요)
        const urlSectionTitle = dom.urlSection.querySelector('h4');
        if (urlSectionTitle) {
            urlSectionTitle.style.display = 'none';
        }
    }

    function renderPreview(info) {
        const thumbContainer = dom.thumbnailImg.parentElement;
        thumbContainer.classList.remove('fallback-active');

        let attemptedProxy = false;

        // Detect aspect ratio and apply appropriate class
        dom.thumbnailImg.onload = () => {
            const img = dom.thumbnailImg;
            const aspectRatio = img.naturalWidth / img.naturalHeight;

            // Thumbnail loaded successfully - hide fallback icon
            thumbContainer.classList.remove('fallback-active');

            // Remove all aspect ratio classes
            thumbContainer.classList.remove('vertical', 'horizontal', 'square');

            // Apply appropriate class based on aspect ratio
            if (aspectRatio < 0.75) {
                // Vertical video (9:16 or taller) - Instagram Reels, TikTok
                thumbContainer.classList.add('vertical');
            } else if (aspectRatio > 1.5) {
                // Horizontal video (16:9 or wider) - YouTube, standard videos
                thumbContainer.classList.add('horizontal');
            } else {
                // Square or near-square (1:1)
                thumbContainer.classList.add('square');
            }
        };

        dom.thumbnailImg.onerror = (e) => {
            console.error('❌ Thumbnail load failed:', dom.thumbnailImg.src);
            console.error('Error event:', e);
            // If proxy failed, try original URL as fallback
            if (attemptedProxy && info.thumbnail) {
                console.log('🔄 Thumbnail proxy failed, trying original URL');
                dom.thumbnailImg.src = info.thumbnail;
                attemptedProxy = false;
            } else {
                thumbContainer.classList.add('fallback-active');
            }
        };

        if (info.thumbnail) {
            console.log('🖼️ Loading thumbnail:', info.thumbnail.substring(0, 100) + '...');
            attemptedProxy = true;
            dom.thumbnailImg.src = getProxiedThumbnailUrl(info.thumbnail);
        } else {
            console.warn('⚠️ No thumbnail in response');
            thumbContainer.classList.add('fallback-active');
            dom.thumbnailImg.src = '';
        }

        dom.mediaTitle.textContent = info.title || t('mediaTitleDefault');
        
        const durationText = info.duration ? `${t('duration')}: ${formatDuration(info.duration)}` : `${t('duration')}: --:--`;
        dom.mediaDuration.innerHTML = `<i class="fas fa-clock"></i> ${durationText}`;

        populateQualityDropdowns(info);
        updateSizeEstimates();
    }
    
    function populateQualityDropdowns(info) {
        // Extract available values from formats
        const availableHeights = [...new Set(info.video_formats?.map(f => f.height).filter(h => h))];
        const availableFps = [...new Set(info.video_formats?.map(f => f.fps).filter(fps => fps))].sort((a, b) => b - a);

        // Filter video presets to show only available qualities
        const availableVideoPresets = VIDEO_PRESETS.filter(preset =>
            availableHeights.includes(preset.height)
        );

        // Filter FPS presets to show only available frame rates
        const availableFpsPresets = FPS_PRESETS.filter(fps =>
            availableFps.includes(fps)
        );

        // Populate video quality dropdown - "원본 화질" as default
        dom.videoQuality.innerHTML = '';
        dom.videoQuality.innerHTML += `<option value="best" selected>${t('originalQuality')}</option>`;
        if (availableVideoPresets.length > 0) {
            availableVideoPresets.forEach((preset) => {
                dom.videoQuality.innerHTML += `<option value="${preset.height}">${preset.label}</option>`;
            });
        }

        // Populate FPS dropdown - "원본 fps" as default
        dom.videoFps.innerHTML = '';
        dom.videoFps.innerHTML += `<option value="any" selected>${t('originalFps')}</option>`;
        if (availableFpsPresets.length > 0) {
            availableFpsPresets.forEach((fps) => {
                dom.videoFps.innerHTML += `<option value="${fps}">${fps}fps</option>`;
            });
        }

        // Populate audio quality dropdown - "원본 음질" as default
        dom.audioQuality.innerHTML = '';
        dom.audioQuality.innerHTML += `<option value="best" selected>${t('originalAudioQuality')}</option>`;
        AUDIO_PRESETS.forEach(preset => {
            if (preset.value !== 'lossless') { // Skip lossless since "원본 음질" serves same purpose
                dom.audioQuality.innerHTML += `<option value="${preset.value}">${preset.label}</option>`;
            }
        });
    }

    function updateProgress(percentage, message) {
        dom.progressContainer.style.display = 'block';
        const clampedPercentage = Math.min(100, Math.max(0, percentage));
        dom.progressBar.style.width = clampedPercentage + '%';
        dom.progressPercentage.textContent = Math.round(clampedPercentage) + '%';
        
        const cleanMessage = message.replace(/\[\d+(?:;\d+)*m/g, '');
        dom.progressStatus.textContent = cleanMessage;

        dom.spinner.style.display = clampedPercentage < 100 && clampedPercentage > 0 ? 'block' : 'none';
    }

    // --- UTILITY: Get Format Size ---
    function getFormatSize(format, duration, fallbackBitrate = 0) {
        if (!format && fallbackBitrate === 0) return 0;

        // First try to get direct size information
        const directSize = format?.filesize || format?.filesize_approx;
        if (directSize && directSize > 0) {
            return parseFloat(directSize);
        }

        // Calculate from bitrate and duration
        const bitrate = format?.tbr || format?.abr || format?.vbr || fallbackBitrate;
        if (bitrate && duration > 0) {
            return (parseFloat(bitrate) * 1000 / 8) * duration;
        }

        // Fallback estimation for formats with no size/bitrate info
        if (duration > 0) {
            let assumedBitrate = 192; // Default audio bitrate

            if (format?.vcodec && format?.vcodec !== 'none') {
                // Video format - codec-aware bitrate estimation
                const height = format?.height || 360;
                const codec = (format?.vcodec || '').toLowerCase();

                // AV1 and VP9 have better compression than H.264
                const isModernCodec = codec.includes('av01') || codec.includes('av1') ||
                                      codec.includes('vp09') || codec.includes('vp9');

                if (height >= 2160) { // 4K
                    assumedBitrate = isModernCodec ? 12000 : 20000;
                } else if (height >= 1440) { // 2K
                    assumedBitrate = isModernCodec ? 8000 : 12000;
                } else if (height >= 1080) { // 1080p
                    assumedBitrate = isModernCodec ? 3500 : 5000;
                } else if (height >= 720) { // 720p
                    assumedBitrate = isModernCodec ? 2000 : 3000;
                } else if (height >= 480) { // 480p
                    assumedBitrate = isModernCodec ? 1200 : 1800;
                } else if (height >= 360) { // 360p
                    assumedBitrate = isModernCodec ? 800 : 1200;
                } else { // 240p and below
                    assumedBitrate = isModernCodec ? 400 : 600;
                }
            } else if (format?.acodec && format?.acodec !== 'none') {
                // Audio format - estimate based on quality
                assumedBitrate = format?.abr || 192;
            }

            return (assumedBitrate * 1000 / 8) * duration;
        }

        return 0;
    }

    function updateSizeEstimates() {
        if (!state.mediaInfo) {
            console.log('No media info available');
            return;
        }

        const selectedMediaType = document.querySelector('.format-tab.active').dataset.mediaType;
        let estimatedSize = 0;
        let sizeEstimateEl;
        const duration = state.mediaInfo.duration || 0;

        console.log('Updating size estimates:', {
            selectedMediaType,
            duration,
            videoFormats: state.mediaInfo.video_formats?.length || 0,
            audioFormats: state.mediaInfo.audio_formats?.length || 0
        });

        if (selectedMediaType === 'video') {
            sizeEstimateEl = dom.videoSizeEstimate;
            const quality = dom.videoQuality.value;
            const videoFormats = state.mediaInfo.video_formats || [];
            const allAudioFormats = [...(state.mediaInfo.audio_formats || [])].sort((a, b) => (b.abr || 0) - (a.abr || 0));
            const bestAudio = allAudioFormats.length > 0 ? allAudioFormats[0] : null;

            console.log('Video size calculation:', {
                quality,
                videoFormatsCount: videoFormats.length,
                bestAudio: bestAudio ? { abr: bestAudio.abr, ext: bestAudio.ext } : null
            });

            if (quality === 'best') {
                const bestVideo = [...videoFormats].sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0))[0];
                const videoSize = getFormatSize(bestVideo, duration);
                const audioSize = getFormatSize(bestAudio, duration);
                estimatedSize = videoSize + audioSize;
                console.log('Best quality calculation:', { videoSize, audioSize, total: estimatedSize });
            } else {
                const selectedHeight = parseInt(quality);
                // First try to find a pre-merged format (video + audio)
                const premergedFormat = videoFormats.find(f => f.height === selectedHeight && f.vcodec && f.acodec);
                if (premergedFormat) {
                    estimatedSize = getFormatSize(premergedFormat, duration);
                    console.log('Pre-merged format found:', { height: premergedFormat.height, size: estimatedSize });
                } else {
                    // Find best video for selected height
                    const bestVideoForHeight = videoFormats.filter(f => f.height === selectedHeight && f.vcodec && !f.acodec).sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
                    if (bestVideoForHeight) {
                        const videoSize = getFormatSize(bestVideoForHeight, duration);
                        const audioSize = getFormatSize(bestAudio, duration);
                        estimatedSize = videoSize + audioSize;
                        console.log('Separate video+audio calculation:', { videoSize, audioSize, total: estimatedSize });
                    } else {
                        // Fallback to any video format with selected height
                        const anyVideoForHeight = videoFormats.find(f => f.height === selectedHeight);
                        const videoSize = getFormatSize(anyVideoForHeight, duration);
                        const audioSize = getFormatSize(bestAudio, duration);
                        estimatedSize = videoSize + audioSize;
                        console.log('Fallback calculation:', { videoSize, audioSize, total: estimatedSize });
                    }
                }
            }
        } else { // audio
            sizeEstimateEl = dom.audioSizeEstimate;
            const quality = dom.audioQuality.value;
            const formatType = dom.audioFormat.value;
            
            console.log('Audio size calculation:', { quality, formatType });
            
            // Find best matching audio format
            const audioFormats = state.mediaInfo.audio_formats || [];
            let bestMatch = audioFormats.find(f => f.ext === formatType) || audioFormats[0];
            
            if (bestMatch) {
                estimatedSize = getFormatSize(bestMatch, duration);
                console.log('Audio format match found:', { ext: bestMatch.ext, abr: bestMatch.abr, size: estimatedSize });
            } else {
                // Fallback calculation based on quality and format
                let fallbackBitrate = parseInt(quality);
                if (formatType === 'flac' || formatType === 'wav' || formatType === 'alac') {
                    fallbackBitrate = 1000; // Average for lossless formats
                }
                
                if (duration > 0) {
                    estimatedSize = (duration * fallbackBitrate * 1000) / 8;
                    console.log('Audio fallback calculation:', { fallbackBitrate, duration, size: estimatedSize });
                }
            }
        }

        console.log('Base estimated size:', estimatedSize);

        // Add container conversion overhead for non-MP4 formats
        if (selectedMediaType === 'video' && estimatedSize > 0) {
            const selectedFormat = dom.videoFormat.value;
            let conversionOverhead = 1.0; // No overhead by default

            // FFmpeg remuxing adds slight overhead (metadata, container structure)
            if (selectedFormat === 'mkv') {
                conversionOverhead = 1.03; // ~3% overhead for MKV container
            } else if (selectedFormat === 'webm') {
                conversionOverhead = 1.02; // ~2% overhead for WebM (already efficient)
            } else if (selectedFormat === 'mov') {
                conversionOverhead = 1.04; // ~4% overhead for MOV (Apple container)
            }
            // MP4 has no overhead since most sources are already MP4

            if (conversionOverhead > 1.0) {
                estimatedSize *= conversionOverhead;
                console.log(`Applied ${selectedFormat.toUpperCase()} conversion overhead (${((conversionOverhead - 1) * 100).toFixed(1)}%)`);
            }
        }

        console.log('Final estimated size:', estimatedSize);

        if (estimatedSize > 0) {
            const formattedSize = formatBytes(estimatedSize);
            sizeEstimateEl.textContent = `${t('sizeEstimateDefault').replace('--', formattedSize)}`;
            sizeEstimateEl.style.display = 'block';
            console.log('Size estimate updated:', formattedSize);
        } else {
            sizeEstimateEl.style.display = 'none';
            console.log('No size estimate available');
        }
    }
    
    // --- YouTube 분석 함수 ---
    async function performUltimateAnalysis(url) {
        console.log('🔥 Starting YouTube analysis for:', url);
        
        showStatus('🔄 YouTube 분석 중...', 'info');
        
        try {
            const response = await fetch(`${API_BASE_URL}/analyze`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept-Language': navigator.language || 'ko-KR',
                    'User-Agent': navigator.userAgent
                },
                body: JSON.stringify({ 
                    url
                })
            });

            // Parse JSON response first (works for both success and error responses)
            const result = await response.json();

            // Check for error in response (HTTP 400/500 with error details)
            if (!response.ok || result.error) {
                throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            console.log('✅ Analysis succeeded:', result);
            showStatus('✅ 분석 완료!', 'success');
            return {
                success: true,
                title: result.title,
                thumbnail: result.thumbnail,
                duration: result.duration,
                video_formats: result.video_formats || [],
                audio_formats: result.audio_formats || [],
                original_url: url
            };
        } catch (error) {
            console.error('❌ YouTube analysis failed:', error);
            throw new Error(`분석 실패: ${error.message}`);
        }
    }

    // --- 🎭 사용자 정보 활용 고급 분석 ---
    async function performUserMimicAnalysis(url) {
        console.log('🎭 Starting user-mimic analysis for:', url);
        
        showStatus('🎭 사용자 프로필 수집 중...', 'info');
        
        // 고급 사용자 프로필 수집
        let userProfile = null;
        if (window.userProfileCollector) {
            console.log('🎭 Collecting comprehensive user profile...');
            userProfile = await window.userProfileCollector.updateProfile();
            console.log('✅ User profile collected:', {
                platform: userProfile.platform,
                language: userProfile.language,
                screen: `${userProfile.screen.width}x${userProfile.screen.height}`,
                timezone: userProfile.timezone,
                fingerprint: !!userProfile.fingerprint.canvas
            });
        }

        const requestData = {
            url: url,
            userProfile: userProfile
        };

        showStatus('🔍 SaveFrom 패턴으로 YouTube 접근 중...', 'info');

        const response = await fetch(`${API_BASE_URL}/user-mimic-analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept-Language': userProfile?.language || navigator.language,
                'User-Agent': userProfile?.userAgent || navigator.userAgent
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `User-mimic API error: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ User-mimic analysis succeeded:', result);
            
            // 성공 메시지에 사용된 프로필 정보 포함
            const profileInfo = result.profile_used ? 
                `(${result.profile_used.platform}, ${result.profile_used.language})` : '';
            
            showStatus(`✅ 고급 분석 성공! ${profileInfo} - 비디오: ${result.video_formats?.length || 0}개, 오디오: ${result.audio_formats?.length || 0}개`, 'success');
            
            // Terms of Service 준수 알림
            if (result.compliance_note) {
                console.log('📜 Compliance:', result.compliance_note);
            }
            
            return result;
        } else {
            throw new Error(result.message || 'User-mimic analysis failed');
        }
    }

    // --- UTILITY: User IP Analysis (백업용) ---
    async function performUserIPAnalysis(url) {
        console.log('Performing analysis with user IP for:', url);
        
        // 고급 사용자 정보 수집 시스템
        const userInfo = await collectComprehensiveUserData(url);
        
        // 사용자 세션 지속성 확보
        await establishPersistentSession(userInfo);
        
        console.log('User info:', userInfo);
        
        // 사용자의 고유 IP로 분석 요청
        const response = await fetch(`${API_BASE_URL}/user-analyze`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept-Language': userInfo.language
            },
            body: JSON.stringify({ 
                url, 
                userInfo: userInfo,
                analysisType: 'user_ip'
            })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'User IP analysis failed');
        
        return data;
    }
    
    // === 고급 사용자 데이터 수집 시스템 ===
    async function collectComprehensiveUserData(targetUrl) {
        const userInfo = {
            // 기본 브라우저 정보
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages,
            platform: navigator.platform,
            timestamp: Date.now(),
            
            // 화면 및 디스플레이 정보
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight
            },
            
            // 시간대 및 지역 정보
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),
            
            // 고급 브라우저 핑거프린팅
            fingerprint: await generateAdvancedFingerprint(),
            
            // 쿠키 및 스토리지 정보
            cookies: document.cookie,
            localStorage: getLocalStorageData(),
            sessionStorage: getSessionStorageData(),
            
            // 네트워크 및 연결 정보
            connection: getConnectionInfo(),
            
            // 플러그인 및 확장 정보
            plugins: getPluginInfo(),
            
            // YouTube 특화 데이터
            youtubeData: await extractYouTubeData(targetUrl),
            
            // 사용자 행동 패턴
            behaviorPattern: getUserBehaviorPattern(),
            
            // 웹 비콘 데이터
            webBeaconData: await collectWebBeaconData()
        };
        
        return userInfo;
    }

    // 고급 브라우저 핑거프린팅
    async function generateAdvancedFingerprint() {
        const fingerprint = {
            // Canvas 핑거프린팅
            canvas: generateCanvasFingerprint(),
            
            // WebGL 핑거프린팅
            webgl: generateWebGLFingerprint(),
            
            // Audio Context 핑거프린팅
            audio: await generateAudioFingerprint(),
            
            // 폰트 감지
            fonts: detectInstalledFonts(),
            
            // 하드웨어 정보
            hardware: getHardwareInfo(),
            
            // 브라우저 특성
            browserFeatures: getBrowserFeatures()
        };
        
        return fingerprint;
    }

    // Canvas 핑거프린팅
    function generateCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 복잡한 그래픽 그리기
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('HQMX Canvas Fingerprint 🔒', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Advanced Bot Detection', 4, 45);
            
            // 추가 그래픽 요소
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgb(255,0,255)';
            ctx.beginPath();
            ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
            
            return {
                dataURL: canvas.toDataURL(),
                hash: hashString(canvas.toDataURL())
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // WebGL 핑거프린팅
    function generateWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (!gl) return { error: 'WebGL not supported' };
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            
            return {
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
                unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
                extensions: gl.getSupportedExtensions()
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // Audio Context 핑거프린팅
    async function generateAudioFingerprint() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const analyser = audioContext.createAnalyser();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(10000, audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            
            oscillator.connect(analyser);
            analyser.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(0);
            
            const frequencyData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(frequencyData);
            
            oscillator.stop();
            audioContext.close();
            
            return {
                sampleRate: audioContext.sampleRate,
                maxChannelCount: audioContext.destination.maxChannelCount,
                frequencyData: Array.from(frequencyData).slice(0, 50), // 처음 50개만
                hash: hashString(frequencyData.toString())
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // YouTube 특화 데이터 추출
    async function extractYouTubeData(targetUrl) {
        const youtubeData = {
            // YouTube 쿠키 추출
            youtubeCookies: extractYouTubeCookies(),
            
            // YouTube 세션 정보
            sessionInfo: getYouTubeSessionInfo(),
            
            // 사용자의 YouTube 활동 패턴
            activityPattern: getYouTubeActivityPattern(),
            
            // YouTube 관련 로컬 스토리지
            youtubeStorage: getYouTubeStorageData()
        };
        
        // 만약 대상 URL이 YouTube라면 추가 정보 수집
        if (targetUrl && targetUrl.includes('youtube.com')) {
            youtubeData.targetVideoInfo = await analyzeYouTubeUrl(targetUrl);
        }
        
        return youtubeData;
    }

    // YouTube 쿠키 추출
    function extractYouTubeCookies() {
        const cookies = document.cookie.split(';');
        const youtubeCookies = {};
        
        cookies.forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && (name.includes('youtube') || name.includes('VISITOR_INFO') || 
                       name.includes('YSC') || name.includes('PREF') || name.includes('GPS'))) {
                youtubeCookies[name] = value;
            }
        });
        
        return youtubeCookies;
    }

    // 사용자 세션 지속성 확보
    async function establishPersistentSession(userInfo) {
        // 고유 세션 ID 생성
        const sessionId = generateSessionId(userInfo);
        
        // 다양한 스토리지에 세션 정보 저장
        localStorage.setItem('hqmx_session', sessionId);
        sessionStorage.setItem('hqmx_session', sessionId);
        
        // 쿠키 설정 (1년 만료)
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `hqmx_session=${sessionId}; expires=${expires.toUTCString()}; path=/; SameSite=None; Secure`;
        
        // IndexedDB에도 저장
        await storeInIndexedDB('hqmx_session', sessionId, userInfo);
        
        // 웹 비콘 설정
        setupWebBeacon(sessionId);
    }

    // 유틸리티 함수들
    function getLocalStorageData() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !key.includes('sensitive')) {
                data[key] = localStorage.getItem(key);
            }
        }
        return data;
    }

    function getConnectionInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return connection ? {
            effectiveType: connection.effectiveType,
            downlink: connection.downlink,
            rtt: connection.rtt,
            saveData: connection.saveData
        } : null;
    }

    function getPluginInfo() {
        return Array.from(navigator.plugins).map(plugin => ({
            name: plugin.name,
            filename: plugin.filename,
            description: plugin.description
        }));
    }

    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    function generateSessionId(userInfo) {
        const data = JSON.stringify(userInfo) + Date.now() + Math.random();
        return hashString(data);
    }

    // 웹 비콘 설정
    function setupWebBeacon(sessionId) {
        const beacon = document.createElement('img');
        beacon.src = `${API_BASE_URL}/beacon?session=${sessionId}&timestamp=${Date.now()}`;
        beacon.style.display = 'none';
        beacon.width = 1;
        beacon.height = 1;
        document.body.appendChild(beacon);
    }

    // 누락된 함수들 구현
    function getSessionStorageData() {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && !key.includes('sensitive')) {
                data[key] = sessionStorage.getItem(key);
            }
        }
        return data;
    }

    function detectInstalledFonts() {
        const fonts = [
            'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Palatino',
            'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact'
        ];
        
        const detected = [];
        const testString = 'mmmmmmmmmmlli';
        const testSize = '72px';
        const baseFonts = ['monospace', 'sans-serif', 'serif'];
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        fonts.forEach(font => {
            let fontDetected = false; // 변수명 변경
            baseFonts.forEach(baseFont => {
                context.font = testSize + ' ' + baseFont;
                const baseWidth = context.measureText(testString).width;
                
                context.font = testSize + ' ' + font + ',' + baseFont;
                const width = context.measureText(testString).width;
                
                if (width !== baseWidth) {
                    fontDetected = true;
                }
            });
            if (fontDetected) {
                detected.push(font);
            }
        });
        
        return detected;
    }

    function getHardwareInfo() {
        return {
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            deviceMemory: navigator.deviceMemory || 'unknown',
            maxTouchPoints: navigator.maxTouchPoints || 0,
            vendor: navigator.vendor || 'unknown',
            vendorSub: navigator.vendorSub || 'unknown',
            productSub: navigator.productSub || 'unknown'
        };
    }

    function getBrowserFeatures() {
        return {
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            javaEnabled: navigator.javaEnabled ? navigator.javaEnabled() : false,
            onLine: navigator.onLine,
            webdriver: navigator.webdriver || false,
            localStorage: !!window.localStorage,
            sessionStorage: !!window.sessionStorage,
            indexedDB: !!window.indexedDB,
            webGL: !!window.WebGLRenderingContext,
            webRTC: !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection)
        };
    }

    function getUserBehaviorPattern() {
        return {
            mouseMovements: window.mouseMovements || [],
            clickPatterns: window.clickPatterns || [],
            scrollBehavior: window.scrollBehavior || [],
            keyboardPatterns: window.keyboardPatterns || [],
            timeOnSite: Date.now() - (window.siteEntryTime || Date.now())
        };
    }

    async function collectWebBeaconData() {
        return {
            pageViews: localStorage.getItem('hqmx_page_views') || '0',
            sessionCount: localStorage.getItem('hqmx_session_count') || '0',
            lastVisit: localStorage.getItem('hqmx_last_visit') || 'never',
            referrer: document.referrer || 'direct'
        };
    }

    function getYouTubeSessionInfo() {
        return {
            hasYouTubeSession: document.cookie.includes('YSC') || document.cookie.includes('VISITOR_INFO'),
            youtubeLanguage: localStorage.getItem('yt-player-language') || 'unknown',
            youtubeQuality: localStorage.getItem('yt-player-quality') || 'unknown'
        };
    }

    function getYouTubeActivityPattern() {
        return {
            watchHistory: localStorage.getItem('yt-remote-session-app') ? 'present' : 'absent',
            searchHistory: localStorage.getItem('yt-remote-session-name') ? 'present' : 'absent',
            preferences: localStorage.getItem('yt-player-headers-readable') ? 'present' : 'absent'
        };
    }

    function getYouTubeStorageData() {
        const youtubeKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('yt-') || key.includes('youtube'))) {
                youtubeKeys.push(key);
            }
        }
        return youtubeKeys;
    }

    async function analyzeYouTubeUrl(url) {
        const videoId = extractVideoId(url);
        return {
            videoId: videoId,
            timestamp: Date.now(),
            referrer: document.referrer,
            userAgent: navigator.userAgent
        };
    }

    function extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async function storeInIndexedDB(key, value, metadata) {
        try {
            const request = indexedDB.open('HQMX_DB', 1);
            
            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'id' });
                }
            };
            
            request.onsuccess = function(event) {
                const db = event.target.result;
                const transaction = db.transaction(['sessions'], 'readwrite');
                const store = transaction.objectStore('sessions');
                
                store.put({
                    id: key,
                    value: value,
                    metadata: metadata,
                    timestamp: Date.now()
                });
            };
        } catch (e) {
            console.warn('IndexedDB storage failed:', e);
        }
    }

    // --- UTILITY: Client Side Analysis ---
    async function performClientSideAnalysis(url) {
        console.log('Performing client-side analysis for:', url);
        
        // 클라이언트 브라우저에서 직접 분석 수행
        const clientInfo = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            timestamp: Date.now(),
            screen: {
                width: screen.width,
                height: screen.height
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            cookies: document.cookie
        };
        
        console.log('Client info:', clientInfo);
        
        // 클라이언트 브라우저에서 직접 분석을 시도
        try {
            // 1. 클라이언트 브라우저에서 직접 분석 시도
            const clientAnalysisResult = await performDirectClientAnalysis(url, clientInfo);
            return clientAnalysisResult;
        } catch (clientError) {
            console.log('Client-side analysis failed, falling back to server:', clientError);
            
            // 2. 실패 시 서버에 클라이언트 정보와 함께 요청
            const response = await fetch(`${API_BASE_URL}/analyze`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept-Language': clientInfo.language
                },
                body: JSON.stringify({ 
                    url, 
                    useClientIP: true,
                    clientInfo: clientInfo
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Analysis failed');
            
            return data;
        }
    }
    
    // 클라이언트 브라우저에서 직접 분석 수행
    async function performDirectClientAnalysis(url, clientInfo) {
        console.log('Attempting direct client analysis...');
        
        // 클라이언트 브라우저에서 직접 분석을 시도
        // 이는 실제로는 클라이언트의 IP와 브라우저 환경을 사용
        const analysisData = {
            url,
            clientInfo,
            analysisType: 'direct_client',
            timestamp: Date.now()
        };
        
        // 클라이언트 브라우저에서 직접 분석을 수행하는 프록시 엔드포인트 호출
        const response = await fetch(`${API_BASE_URL}/client-analyze`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept-Language': clientInfo.language
            },
            body: JSON.stringify(analysisData)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Client analysis failed');
        
        return data;
    }

    // --- UTILITY FUNCTIONS ---
    function showError(message) {
        alert(message);
    }
    const formatDuration = (s) => {
        // Round to nearest second (remove sub-second precision)
        const totalSeconds = Math.round(s);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    const formatViews = (n) => n > 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n > 1000 ? `${(n/1000).toFixed(1)}K` : n.toString();
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes'
        const k = 1024
        const dm = decimals < 0 ? 0 : decimals
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }
    const getQualityLabel = (h) => {
        if (h >= 3840) return `4K UHD (${h}p)`;
        if (h >= 2160) return `4K UHD (${h}p)`;
        if (h >= 1440) return `2K QHD (${h}p)`;
        if (h >= 1080) return `Full HD (${h}p)`;
        if (h >= 720) return `HD (${h}p)`;
        return `${h}p`;
    };

    // 스크롤 시 헤더 blur 효과
    const topNav = document.querySelector('.top-nav');

    function handleScroll() {
        if (window.scrollY > 0) {
            topNav.classList.add('scrolled');
        } else {
            topNav.classList.remove('scrolled');
        }
    }

    // 초기 상태 확인
    handleScroll();

    // 스크롤 이벤트 리스너 추가
    window.addEventListener('scroll', handleScroll, { passive: true });

    // --- CONVERTER EXPAND FUNCTIONALITY ---
    const converterExpandBtn = document.getElementById('converterExpandBtn');
    const converterLogoLink = document.querySelector('.sitemap-left .logo-link');
    const categoryIconsNav = document.querySelector('.category-icons-nav');
    const categoryIconBtns = document.querySelectorAll('.category-icon-btn');
    const supportedConversions = document.querySelector('.supported-conversions');

    // Function to toggle category icons
    function toggleCategoryIcons() {
        if (categoryIconsNav) {
            // Close DOWNLOADER panel if it's open (mutual exclusion)
            const platformNav = document.querySelector('.platform-icons-nav');
            const dlExpandBtn = document.getElementById('downloaderExpandBtn');
            const platformBtns = document.querySelectorAll('.platform-icon-btn');

            if (platformNav && platformNav.classList.contains('show')) {
                platformNav.classList.remove('show');
                if (dlExpandBtn) {
                    dlExpandBtn.classList.remove('expanded');
                }
                platformBtns.forEach(btn => btn.classList.remove('active'));
            }

            categoryIconsNav.classList.toggle('show');
            if (converterExpandBtn) {
                converterExpandBtn.classList.toggle('expanded');
            }

            // If hiding, also hide all categories
            if (!categoryIconsNav.classList.contains('show')) {
                const allCategories = document.querySelectorAll('.conversion-category');
                allCategories.forEach(cat => {
                    cat.classList.remove('active');
                    cat.classList.remove('show-badges');
                });
                categoryIconBtns.forEach(btn => btn.classList.remove('active'));

                // Hide supported conversions when category icons are hidden
                if (supportedConversions) {
                    supportedConversions.style.display = 'none';
                }
            } else {
                // Show supported conversions when category icons are shown
                if (supportedConversions) {
                    supportedConversions.style.display = 'block';
                }
            }
        }
    }

    // Converter + button click
    if (converterExpandBtn) {
        converterExpandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCategoryIcons();
        });
    }

    // Converter logo click - Removed (now just a link to hqmx.net)

    // 카테고리 아이콘 버튼 클릭 시 배지 표시
    categoryIconBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;

            // Show category icons if not shown
            if (!categoryIconsNav.classList.contains('show')) {
                categoryIconsNav.classList.add('show');
                if (converterExpandBtn) {
                    converterExpandBtn.classList.add('expanded');
                }
            }

            // 모든 카테고리 아이콘 버튼에서 active 제거
            categoryIconBtns.forEach(b => b.classList.remove('active'));
            // 클릭한 버튼에 active 추가
            btn.classList.add('active');

            // 모든 카테고리에서 active와 show-badges 제거
            const allCategories = document.querySelectorAll('.conversion-category');
            allCategories.forEach(cat => {
                cat.classList.remove('active');
                cat.classList.remove('show-badges');
            });

            // 클릭한 카테고리를 active로 설정하고 배지 표시
            const targetCategory = document.querySelector(`.conversion-category[data-category="${category}"]`);
            if (targetCategory) {
                targetCategory.classList.add('active');
                targetCategory.classList.add('show-badges');

                // Show supported conversions section
                if (supportedConversions) {
                    supportedConversions.style.display = 'block';
                }
            }
        });
    });

    // --- DOWNLOADER EXPAND FUNCTIONALITY ---
    const downloaderExpandBtn = document.getElementById('downloaderExpandBtn');
    const downloaderLogoLink = document.querySelector('.sitemap-right .logo-link');
    const platformIconsNav = document.querySelector('.platform-icons-nav');
    const platformIconBtns = document.querySelectorAll('.platform-icon-btn');

    // Function to toggle platform icons
    function togglePlatformIcons() {
        if (platformIconsNav) {
            // Close CONVERTER panel if it's open (mutual exclusion)
            const categoryNav = document.querySelector('.category-icons-nav');
            const convExpandBtn = document.getElementById('converterExpandBtn');
            const categoryBtns = document.querySelectorAll('.category-icon-btn');
            const supportedConv = document.querySelector('.supported-conversions');

            if (categoryNav && categoryNav.classList.contains('show')) {
                categoryNav.classList.remove('show');
                if (convExpandBtn) {
                    convExpandBtn.classList.remove('expanded');
                }
                categoryBtns.forEach(btn => btn.classList.remove('active'));

                // Also hide conversion categories and supported conversions
                const allCategories = document.querySelectorAll('.conversion-category');
                allCategories.forEach(cat => {
                    cat.classList.remove('active');
                    cat.classList.remove('show-badges');
                });
                if (supportedConv) {
                    supportedConv.style.display = 'none';
                }
            }

            platformIconsNav.classList.toggle('show');
            if (downloaderExpandBtn) {
                downloaderExpandBtn.classList.toggle('expanded');
            }

            // If hiding, remove active states
            if (!platformIconsNav.classList.contains('show')) {
                platformIconBtns.forEach(btn => btn.classList.remove('active'));
            }
        }
    }

    // Downloader + button click
    if (downloaderExpandBtn) {
        downloaderExpandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePlatformIcons();
        });
    }

    // Downloader logo click - Removed (now just a link to downloader.hqmx.net)

    // Platform icon button click handlers
    platformIconBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Ignore clicks on disabled buttons
            if (btn.disabled || btn.classList.contains('disabled')) {
                return;
            }

            const platform = btn.dataset.platform;

            // Show platform icons if not shown
            if (!platformIconsNav.classList.contains('show')) {
                platformIconsNav.classList.add('show');
                if (downloaderExpandBtn) {
                    downloaderExpandBtn.classList.add('expanded');
                }
            }

            // Toggle active state
            platformIconBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Navigate to platform-specific downloader page
            // For now, just log - you can implement navigation later
            console.log(`${platform} downloader selected`);
            // window.location.href = `https://hqmx.net/downloader/${platform}`;
        });
    });
});
