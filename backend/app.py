import logging
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta
import json

from flask import Flask, jsonify, request, Response, send_file, Blueprint
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
import yt_dlp
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# i18n support
def get_translation(lang='en'):
    """Load translation file for the specified language"""
    try:
        with open(f'../frontend/locales/{lang}.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # Fallback to English
        try:
            with open('../frontend/locales/en.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}

def t(key, lang='en', **kwargs):
    """Get translated text"""
    translations = get_translation(lang)
    text = translations.get(key, key)
    return text.format(**kwargs) if kwargs else text

def get_request_language():
    """Get language from request headers or default to 'en'"""
    accept_language = request.headers.get('Accept-Language', '')
    
    # Check for exact language matches first
    if accept_language == 'ko':
        return 'ko'
    elif accept_language == 'ja':
        return 'ja'
    elif accept_language == 'zh-CN':
        return 'zh-CN'
    elif accept_language == 'zh-TW':
        return 'zh-TW'
    elif accept_language == 'ar':
        return 'ar'
    elif accept_language == 'en':
        return 'en'
    
    # Fallback to partial matches
    if 'ko' in accept_language:
        return 'ko'
    elif 'ja' in accept_language:
        return 'ja'
    elif 'zh' in accept_language:
        return 'zh-CN'
    elif 'ar' in accept_language:
        return 'ar'
    else:
        return 'en'

# --- 1. Basic Setup: Logging, Flask App, CORS ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
app = Flask(__name__)
CORS(app, expose_headers=['Content-Disposition'])

# Create API Blueprint with /api prefix
api = Blueprint('api', __name__, url_prefix='/api')

# --- 2. Global State Management & Threading Lock ---
tasks = {}
TEMP_DIR = tempfile.mkdtemp(prefix='hqmx_')
update_lock = threading.Lock()

# --- 3. Helper Functions ---
def get_clean_title(info):
    """Extracts a more meaningful title, especially for Instagram."""
    title = info.get('title')
    # For Instagram, if the title is generic and a description exists, use the first line of the description.
    if info.get('extractor_key') == 'Instagram' and info.get('description'):
        # A generic title is one that is machine-generated and not descriptive.
        is_generic_title = title is None or title.lower().startswith(('video by', 'image by', 'post by'))
        if is_generic_title:
            for line in info.get('description', '').splitlines():
                cleaned_line = line.strip()
                if cleaned_line:
                    return cleaned_line  # Return the first non-empty line
    return title if title else 'download'

def sanitize_filename(filename):
    """Removes characters that are invalid in filenames and limits length."""
    s = re.sub(r'[\n\r\t]+', ' ', filename)
    # Remove invalid filename characters
    s = re.sub(r'[\\/:*?"<>|]', '', s)
    s = s.strip()
    # Limit total length to 200 chars to be safe
    return s[:200]

def convert_https_to_http(url):
    """Convert HTTPS URLs to HTTP for SmartProxy compatibility.

    SmartProxy only supports HTTP connections. YouTube/SNS URLs are converted
    from https:// to http:// to work with the proxy.
    """
    if url.startswith('https://'):
        converted_url = 'http://' + url[8:]
        # Log conversion (truncate URL for privacy/readability)
        logging.info(f"URL converted for SmartProxy: https://... → http://...")
        return converted_url
    return url

def get_proxy_url():
    """Generate SmartProxy URL from environment variables.

    Returns:
        str: Proxy URL in format 'http://username:password@host:port' or None if disabled
    """
    use_proxy = os.getenv('USE_PROXY', 'false').lower() == 'true'

    if not use_proxy:
        return None

    host = os.getenv('SMARTPROXY_HOST')
    port = os.getenv('SMARTPROXY_PORT')
    username = os.getenv('SMARTPROXY_USERNAME')
    password = os.getenv('SMARTPROXY_PASSWORD')

    if all([host, port, username, password]):
        proxy_url = f'http://{username}:{password}@{host}:{port}'
        logging.info(f"SmartProxy enabled: {host}:{port}")
        return proxy_url
    else:
        logging.warning("SmartProxy enabled but configuration incomplete")
        return None

def update_progress(task_id, percentage, message, status=None, filepath=None, download_name=None):
    with update_lock:
        if task_id not in tasks:
            tasks[task_id] = {}
        
        tasks[task_id]['percentage'] = percentage
        tasks[task_id]['message'] = message
        if status:
            tasks[task_id]['status'] = status
        if filepath:
            tasks[task_id]['final_filepath'] = filepath
        if download_name:
             tasks[task_id]['download_name'] = download_name
        tasks[task_id]['timestamp'] = datetime.now().isoformat()
        logging.info(f"Progress Update - Task {task_id}: {status} at {percentage}% - '{message}'")

def cleanup_old_files():
    logging.info(f"Running scheduled cleanup in {TEMP_DIR}...")
    now = datetime.now()
    try:
        for item_name in os.listdir(TEMP_DIR):
            item_path = os.path.join(TEMP_DIR, item_name)
            try:
                item_stat = os.stat(item_path)
                item_mtime = datetime.fromtimestamp(item_stat.st_mtime)
                if now - item_mtime > timedelta(hours=24):
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                        logging.info(f"Removed old temp directory: {item_path}")
                    else:
                        os.remove(item_path)
                        logging.info(f"Removed old temp file: {item_path}")
            except Exception as e:
                logging.error(f"Error during cleanup of {item_path}: {e}")
    except Exception as e:
        logging.error(f"Could not list items in temp directory {TEMP_DIR}: {e}")

# --- 4. Core Download Logic (Worker Thread) ---
def download_media_worker(task_id, url, media_type, format_type, quality, request_lang='en'):
    class ProgressHook:
        def __init__(self, d_id, lang):
            self.d_id = d_id
            self.lang = lang
        def __call__(self, d):
            if d['status'] == 'downloading':
                percent_str = d.get('_percent_str', '0%')
                clean_percent_str = re.sub(r'\x1b\[[0-9;]*m', '', percent_str)
                try:
                    percentage = float(clean_percent_str.strip().replace('%',''))
                    scaled_percentage = percentage * 0.9
                    speed_bytes = d.get('speed')
                    if speed_bytes:
                        speed_mbps = (speed_bytes * 8) / 1000000
                        speed_str = f"{speed_mbps:.2f} Mbps"
                    else:
                        speed_str = d.get('_speed_str', 'N/A')

                    message = t('downloading_progress', lang=self.lang, percentage=f"{percentage:.1f}", speed=speed_str)
                    update_progress(self.d_id, scaled_percentage, message, status='downloading')
                except ValueError:
                    with update_lock:
                        current_percentage = tasks.get(self.d_id, {}).get('percentage', 0)
                    update_progress(self.d_id, current_percentage, t('download_in_progress', lang=self.lang), status='downloading')
            elif d['status'] == 'finished':
                update_progress(self.d_id, 90, t('download_complete_preparing', lang=self.lang), filepath=d.get('filename'))

    class PostprocessorHook:
        def __init__(self, d_id, lang):
            self.d_id = d_id
            self.lang = lang
        def __call__(self, d):
            if d['status'] == 'running':
                update_progress(self.d_id, 95, t('finalizing_file', lang=self.lang, processor=d.get('postprocessor')), status='processing')
            elif d['status'] == 'started':
                update_progress(self.d_id, 90.1, t('starting_finalization', lang=self.lang, processor=d.get('postprocessor')), status='processing')
            elif d['status'] == 'finished':
                update_progress(self.d_id, 99.9, t('finalization_complete', lang=self.lang), filepath=d['info_dict'].get('filepath'))

    try:
        lang = request_lang
        # Convert HTTPS to HTTP for SmartProxy compatibility
        url = convert_https_to_http(url)
        update_progress(task_id, 5, t('analyzing_media_info', lang=lang), status='starting')

        # Initial metadata extraction with proxy
        metadata_opts = {'quiet': True, 'noplaylist': True, 'nocolor': True}
        proxy_url = get_proxy_url()
        if proxy_url:
            metadata_opts['proxy'] = proxy_url

        with yt_dlp.YoutubeDL(metadata_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        
        clean_title = get_clean_title(info)
        safe_filename_base = sanitize_filename(clean_title)
        download_name = f"{safe_filename_base}.{format_type}"
        update_progress(task_id, 0, "", download_name=download_name)

        base_filename = f"{task_id}_{int(time.time())}"
        ydl_opts = {
            'outtmpl': os.path.join(TEMP_DIR, f"{base_filename}.%(ext)s"),
            'noplaylist': True, 'nocolor': True, 'quiet': True, 'progress': True,
            'progress_hooks': [ProgressHook(task_id, lang)],
            'postprocessor_hooks': [PostprocessorHook(task_id, lang)],
            'http_headers': { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36' }
        }

        # Add SmartProxy for actual download
        if proxy_url:
            ydl_opts['proxy'] = proxy_url

        if media_type == 'video':
            def find_best_stream(formats, quality_str, codec_prefix, stream_type='video'):
                target_quality = int(quality_str) if quality_str != 'best' else 9999
                
                key_map = {'video': ('vcodec', 'height'), 'audio': ('acodec', 'abr')}
                codec_key, quality_key = key_map[stream_type]

                filtered = [f for f in formats if f.get(codec_key, 'none').startswith(codec_prefix) and f.get(quality_key)]
                if not filtered: return None
                
                # Find the stream with the quality closest to the target
                return min(filtered, key=lambda f: abs(f[quality_key] - target_quality))

            remux_possible = False
            # 1. Attempt to REMUX (fast, lossless combination)
            if format_type == 'webm':
                best_video = find_best_stream(info['formats'], quality, 'vp9', 'video')
                best_audio = find_best_stream(info['formats'], 'best', 'opus', 'audio')
                if best_video and best_audio:
                    update_progress(task_id, 10, t('compatible_webm_streams_found', lang=lang))
                    ydl_opts['format'] = f"{best_video['format_id']}+{best_audio['format_id']}"
                    ydl_opts['merge_output_format'] = 'webm'
                    remux_possible = True
            elif format_type == 'mp4':
                best_video = find_best_stream(info['formats'], quality, 'avc1', 'video')
                best_audio = find_best_stream(info['formats'], 'best', 'mp4a', 'audio')
                if best_video and best_audio:
                    update_progress(task_id, 10, t('compatible_mp4_streams_found', lang=lang))
                    ydl_opts['format'] = f"{best_video['format_id']}+{best_audio['format_id']}"
                    ydl_opts['merge_output_format'] = 'mp4'
                    remux_possible = True

            # 2. Fallback to RE-ENCODE (slower, lossy conversion)
            if not remux_possible:
                update_progress(task_id, 10, t('no_direct_streams_converting', lang=lang, format=format_type))
                
                ffmpeg_args = []
                if format_type == 'webm':
                    ffmpeg_args = ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus', '-b:a', '192k']
                else: # Default for MP4
                    ffmpeg_args = ['-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-preset', 'fast']

                ydl_opts['format'] = 'bestvideo+bestaudio/best'
                ydl_opts['merge_output_format'] = 'mkv'
                ydl_opts['postprocessors'] = [{'key': 'FFmpegVideoConvertor', 'preferedformat': format_type}]
                ydl_opts['postprocessor_args'] = {'videoconvertor': ffmpeg_args}

        elif media_type == 'audio':
            update_progress(task_id, 10, t('starting_audio_extraction', lang=lang))
            audio_quality_arg = quality if quality != 'best' else '0'
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': format_type, 'preferredquality': audio_quality_arg}, 
                                   {'key': 'FFmpegMetadata'}],
            })

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)

        # ... (rest of the download finalization logic)
        with update_lock:
            final_path_from_hook = tasks.get(task_id, {}).get('final_filepath')
        if final_path_from_hook and os.path.exists(final_path_from_hook):
            update_progress(task_id, 100, t('download_complete_ready', lang=lang), status='complete', filepath=final_path_from_hook)
        else:
            for f in os.listdir(TEMP_DIR):
                if f.startswith(base_filename):
                    final_path = os.path.join(TEMP_DIR, f)
                    update_progress(task_id, 100, t('download_complete_ready', lang=lang), status='complete', filepath=final_path)
                    return
            raise yt_dlp.utils.DownloadError(t('converted_file_not_found', lang=lang))

    except yt_dlp.utils.DownloadError as e:
        error_message_display = t('download_error_check_url', lang=lang)
        if "Unsupported URL" in str(e):
            error_message_display = t('unsupported_link', lang=lang)
        logging.error(f"DownloadError for task {task_id}: {e}")
        update_progress(task_id, 0, error_message_display, status='error')
    except Exception as e:
        logging.error(f"An unexpected error occurred for task {task_id}: {e}", exc_info=True)
        update_progress(task_id, 0, t('unknown_critical_error', lang=lang), status='error')

def extract_format_info(f):
    if not f: return None
    
    # Calculate estimated size if not provided
    filesize = f.get('filesize') or f.get('filesize_approx')
    if not filesize and f.get('duration'):
        # Estimate size based on bitrate
        bitrate = f.get('tbr') or f.get('abr') or f.get('vbr')
        if bitrate:
            filesize = (bitrate * 1000 / 8) * f.get('duration')
    
    return {
        'format_id': f.get('format_id'), 
        'ext': f.get('ext'), 
        'resolution': f.get('resolution'),
        'height': f.get('height'), 
        'vcodec': f.get('vcodec'), 
        'acodec': f.get('acodec'),
        'abr': f.get('abr'), 
        'filesize': filesize,
        'tbr': f.get('tbr'),
        'vbr': f.get('vbr'),
        'duration': f.get('duration'),
    }

def extract_media_info(info):
    video_formats = [extract_format_info(f) for f in info.get('formats', []) if f.get('vcodec') != 'none']
    audio_formats = [extract_format_info(f) for f in info.get('formats', []) if f.get('acodec') != 'none' and f.get('vcodec') == 'none']
    unique_video_formats = {f['format_id']: f for f in video_formats if f}.values()
    unique_audio_formats = {f['format_id']: f for f in audio_formats if f}.values()
    
    # --- Thumbnail Extraction Logic ---
    thumbnail_url = info.get('thumbnail')
    if not thumbnail_url:
        thumbnails = info.get('thumbnails')
        if isinstance(thumbnails, list) and thumbnails:
            # Sort by height (and then width) to find the best quality thumbnail
            best_thumbnail = max(thumbnails, key=lambda t: (t.get('height', 0), t.get('width', 0)))
            thumbnail_url = best_thumbnail.get('url')

    return {
        'title': get_clean_title(info),
        'thumbnail': thumbnail_url, 
        'duration': info.get('duration'),
        'view_count': info.get('view_count'),
        'video_formats': sorted(list(unique_video_formats), key=lambda f: f.get('height') or 0, reverse=True),
        'audio_formats': sorted(list(unique_audio_formats), key=lambda f: f.get('abr') or 0, reverse=True),
    }

# --- 5. Flask API Endpoints ---

# Health check on root (not under /api)
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

# Main analyze endpoint - handles all analysis types
@api.route('/analyze', methods=['POST'])
@api.route('/youtube/analyze', methods=['POST'])
@api.route('/user-mimic-analyze', methods=['POST'])
@api.route('/user-analyze', methods=['POST'])
@api.route('/client-analyze', methods=['POST'])
def analyze_url():
    lang = get_request_language()
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': t('url_not_provided', lang=lang)}), 400
    url = data['url']
    # Convert HTTPS to HTTP for SmartProxy compatibility
    url = convert_https_to_http(url)
    logging.info(f"Analyzing URL: {url}")
    try:
        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'forcejson': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Accept-Encoding': 'gzip,deflate',
                'Accept-Charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.7',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
            'socket_timeout': 30,
            'retries': 10,
            'extractor_retries': 3,
            'ignoreerrors': False,
            'no_warnings': False
        }

        # Add SmartProxy if configured
        proxy_url = get_proxy_url()
        if proxy_url:
            ydl_opts['proxy'] = proxy_url

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        logging.info("Successfully extracted info from yt-dlp.")
        media_info = extract_media_info(info)
        response_data = json.dumps(media_info, allow_nan=False)
        logging.info(f"Returning media_info for '{media_info.get('title', 'N/A')}'. Payload size: {len(response_data)} bytes.")
        return Response(response_data, mimetype='application/json')
    except yt_dlp.utils.DownloadError as e:
        error_message = str(e).split(':')[-1].strip()
        logging.error(f"yt-dlp download error for URL {url}: {error_message}")
        return jsonify({'error': t('download_error', lang=lang, error=error_message)}), 400
    except Exception as e:
        logging.exception(f"Unexpected error during analysis for URL {url}")
        return jsonify({'error': t('unknown_error_occurred', lang=lang, error=str(e))}), 500

@api.route('/download', methods=['POST'])
def download_media():
    data = request.json
    task_id = str(uuid.uuid4())
    lang = get_request_language()
    tasks[task_id] = {'status': 'queued', 'percentage': 0, 'message': t('task_added_to_queue', lang=lang)}
    thread = threading.Thread(
        target=download_media_worker,
        args=(task_id, data['url'], data['mediaType'], data['formatType'], data['quality'], lang)
    )
    thread.daemon = True
    thread.start()
    return jsonify({'success': True, 'task_id': task_id})

@api.route('/stream-progress/<task_id>')
def stream_progress(task_id):
    def generate():
        last_update_json = None
        while True:
            with update_lock:
                task_data = tasks.get(task_id, {}).copy()
            current_json = json.dumps(task_data)
            if current_json != last_update_json:
                yield f"data: {current_json}\n\n"
                last_update_json = current_json
                if task_data.get('status') in ['complete', 'error']:
                    break
            time.sleep(0.5)
    return Response(generate(), mimetype='text/event-stream')

@api.route('/get-file/<task_id>', methods=['GET'])
def get_file(task_id):
    with update_lock:
        task = tasks.get(task_id, {}).copy()
    if task.get('status') == 'complete':
        file_path = task.get('final_filepath')
        download_name = task.get('download_name', 'download.file')
        if file_path and os.path.exists(file_path):
            logging.info(f"Sending file {file_path} as {download_name}")
            return send_file(file_path, as_attachment=True, download_name=download_name)
    logging.error(f"File not found or task not complete for {task_id}.")
    lang = get_request_language()
    return jsonify({"error": t('file_not_found_or_incomplete', lang=lang)}), 404

@api.route('/check-status/<task_id>', methods=['GET'])
def check_task_status(task_id):
    """Checks the status of a download task."""
    with update_lock:
        task = tasks.get(task_id, {})
    if not task:
        return jsonify({'status': 'not_found', 'message': 'The specified task could not be found.'}), 404
    return jsonify(task)

# Register API Blueprint
app.register_blueprint(api)

# --- 6. Main Execution ---
if __name__ == '__main__':
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(cleanup_old_files, 'interval', hours=1)
    scheduler.start()
    logging.info(f"Temporary files will be stored in: {TEMP_DIR}")
    logging.info("Scheduled temp file cleanup job to run every hour.")
    logging.info("API endpoints available at /api/* (e.g., /api/analyze, /api/download)")
    try:
        app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
    finally:
        scheduler.shutdown()
        try:
            shutil.rmtree(TEMP_DIR)
            logging.info(f"Removed temp directory on shutdown: {TEMP_DIR}")
        except Exception as e:
            logging.error(f"Error removing temp directory on shutdown: {e}")
