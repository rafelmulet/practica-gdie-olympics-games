"use strict";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // --- 0. WEBRTC Y SEÑALIZACIÓN --- 
    // ==========================================
    const socket = io();
    const room = 'sala-quiz';
    let peerConnection;
    let dataChannel;

    socket.emit('join', room);

    socket.on('ready', () => {
        console.log('Respondedor conectado. Iniciando conexión WebRTC...');
        crearPeerConnection();
    });

    socket.on('message', async (message) => {
        if (!peerConnection) crearPeerConnection();

        if (message.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message));
        } else if (message.type === 'candidate') {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    });

    function crearPeerConnection() {
        if (peerConnection) return;
        peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('message', { room, message: { type: 'candidate', candidate: event.candidate } });
            }
        };

        // Creamos el DataChannel en el cliente que inicia (Visualizador)
        dataChannel = peerConnection.createDataChannel('quizChannel');
        dataChannel.onopen = () => console.log('DataChannel abierto en el Visualizador.');
        
        dataChannel.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'RESUME_VIDEO') {
                controls.classList.remove('controls-disabled');
                
                if (!isDashActive && !isHlsActive) audio.currentTime = video.currentTime;

                try {
                    if (isDashActive || isHlsActive) {
                        await video.play();
                    } else {
                        await Promise.all([video.play(), audio.play()]);
                    }
                    playPauseImg.src = 'media/images/controls/pause-icon.png';
                } catch (e) {
                    console.log("Error al reanudar tras la orden del respondedor:", e);
                }
            }
        };

        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => socket.emit('message', { room, message: peerConnection.localDescription }))
            .catch(e => console.error("Error WebRTC:", e));
    }

    // ==========================================
    // --- 1. SELECCIÓN DE ELEMENTOS --- 
    // ==========================================
    const video = document.getElementById('mainVideo');
    const audio = document.getElementById('mainAudio');
    const controls = document.getElementById('video-controls');

    const stopBtn = document.getElementById('stopBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseImg = playPauseBtn.querySelector('img');
    const muteBtn = document.getElementById('muteBtn');
    const volumeBar = document.getElementById('volume-bar');
    const volumeImg = muteBtn.querySelector('img');
    const progressBar = document.getElementById('progress-bar');

    const subtitlesBtn = document.getElementById('subtitlesBtn');
    const subtitlesImg = document.getElementById('subtitles-img');
    const videoQImg = document.getElementById('video-q-img');
    const audioQImg = document.getElementById('audio-q-img');

    const langOptions = document.querySelectorAll('.opt-btn[data-lang]');
    const videoOptions = document.querySelectorAll('.opt-btn[data-video-src]');
    const audioOptions = document.querySelectorAll('.opt-btn[data-audio-src]');

    // ==========================================
    // --- VARIABLES DASH / HLS --- 
    // ==========================================
    let dashPlayer = null;
    let isDashActive = false;
    let hlsPlayer = null;
    let isHlsActive = false;
    const DASH_MANIFEST_URL = 'media/dash/manifest.mpd';
    const HLS_MANIFEST_URL  = 'media/hls/master.m3u8';

    // ==========================================
    // --- 2. CONFIGURACIÓN INICIAL --- 
    // ==========================================
    video.controls = false;
    audio.controls = false;
    controls.setAttribute('data-state', 'visible');
    video.muted = true;
    audio.volume = 0.5;

    if (!video.src || video.src === window.location.href) {
        const sourceEl = video.querySelector('source');
        if (sourceEl) video.src = sourceEl.src;
    }
    if (!audio.src || audio.src === window.location.href) {
        const sourceEl = audio.querySelector('source');
        if (sourceEl) audio.src = sourceEl.src;
    }

    // ==========================================
    // --- LÓGICA MPEG-DASH ---
    // ==========================================
    function activarDash() {
        if (isDashActive) return;

        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;

        video.pause();
        audio.pause();

        isDashActive = true;

        dashPlayer = dashjs.MediaPlayer().create();
        dashPlayer.updateSettings({
            streaming: {
                abr: { autoSwitchBitrate: { video: true, audio: true } }
            }
        });

        dashPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, function onInit() {
            dashPlayer.off(dashjs.MediaPlayer.events.STREAM_INITIALIZED, onInit);
            if (currentTime > 0) dashPlayer.seek(currentTime);
            if (wasPlaying) {
                video.play()
                    .then(() => { playPauseImg.src = 'media/images/controls/pause-icon.png'; })
                    .catch(e => console.log("DASH play interceptado:", e));
            }
            playPauseBtn.disabled = false;
            playPauseBtn.style.opacity = '1';
        });

        dashPlayer.initialize(video, DASH_MANIFEST_URL, false);
        video.volume = audio.volume;
        video.muted = audio.muted;
        audio.muted = true;

        playPauseBtn.disabled = true;
        playPauseBtn.style.opacity = '0.5';
    }

    function desactivarDash() {
        if (!isDashActive) return;
        isDashActive = false;

        if (dashPlayer) {
            dashPlayer.reset();
            dashPlayer = null;
        }
        audio.muted = isMuted;
    }

    // ==========================================
    // --- LÓGICA HLS ---
    // ==========================================
    function activarHls() {
        if (isHlsActive) return;

        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;

        video.pause();
        audio.pause();

        isHlsActive = true;

        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsPlayer = new Hls();
            hlsPlayer.loadSource(HLS_MANIFEST_URL);
            hlsPlayer.attachMedia(video);

            hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
                if (currentTime > 0) video.currentTime = currentTime;
                video.volume = audio.volume;
                video.muted = audio.muted;
                audio.muted = true;

                if (wasPlaying) {
                    video.play()
                        .then(() => { playPauseImg.src = 'media/images/controls/pause-icon.png'; })
                        .catch(e => console.log("HLS play interceptado:", e));
                }
                playPauseBtn.disabled = false;
                playPauseBtn.style.opacity = '1';
            });

            playPauseBtn.disabled = true;
            playPauseBtn.style.opacity = '0.5';
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = HLS_MANIFEST_URL;
            video.currentTime = currentTime;
            if (wasPlaying) video.play().catch(e => console.log(e));
        } else {
            console.error('HLS no soportado en este navegador.');
            isHlsActive = false;
        }
    }

    function desactivarHls() {
        if (!isHlsActive) return;
        isHlsActive = false;

        if (hlsPlayer) {
            hlsPlayer.destroy();
            hlsPlayer = null;
        }
        audio.muted = isMuted;
    }

    function desactivarStreaming() {
        if (isDashActive) desactivarDash();
        if (isHlsActive) desactivarHls();
    }

    // ==========================================
    // --- 3. FUNCIÓN DE CARGA ROBUSTA --- 
    // ==========================================
    let isMuted = false;

    window.waitForMediaLoad = function(resumePlay = false, restoreTime = 0) {
        let isVideoReady = false;
        let isAudioReady = isDashActive || isHlsActive;

        playPauseBtn.disabled = true;
        playPauseBtn.style.opacity = '0.5';

        const checkReadyState = () => {
            if (isVideoReady && isAudioReady) {
                playPauseBtn.disabled = false;
                playPauseBtn.style.opacity = '1';

                if (resumePlay) {
                    if (isDashActive || isHlsActive) {
                        video.play()
                            .then(() => { playPauseImg.src = 'media/images/controls/pause-icon.png'; })
                            .catch(e => console.log(e));
                    } else {
                        Promise.all([video.play(), audio.play()])
                            .then(() => { playPauseImg.src = 'media/images/controls/pause-icon.png'; })
                            .catch(e => console.log("Auto-play interceptado:", e));
                    }
                }
            }
        };

        const handleMediaError = (type) => {
            console.error(`Error: El ${type} no pudo cargarse.`);
            playPauseBtn.disabled = false;
            playPauseBtn.style.opacity = '1';
        };

        if (restoreTime > 0) {
            video.addEventListener('loadedmetadata', () => { video.currentTime = restoreTime; }, { once: true });
            if (!isDashActive && !isHlsActive) {
                audio.addEventListener('loadedmetadata', () => { audio.currentTime = restoreTime; }, { once: true });
            }
        }

        video.addEventListener('canplaythrough', () => {
            isVideoReady = true;
            checkReadyState();
        }, { once: true });
        video.addEventListener('error', () => handleMediaError('Video'), { once: true });

        if (!isDashActive && !isHlsActive) {
            audio.addEventListener('canplaythrough', () => {
                isAudioReady = true;
                checkReadyState();
            }, { once: true });
            audio.addEventListener('error', () => handleMediaError('Audio'), { once: true });
        }

        video.load();
        if (!isDashActive && !isHlsActive) audio.load();
    };

    window.waitForMediaLoad();

    // ==========================================
    // --- 4. SINCRONIZACIÓN PERFECTA --- 
    // ==========================================
    const syncMedia = () => {
        if (!isDashActive && !isHlsActive && Math.abs(video.currentTime - audio.currentTime) > 0.15) {
            audio.currentTime = video.currentTime;
        }
    };

    const checkStreamingSync = (label) => {
        if (label === 'DASH' || label === 'HLS') {
            const allBtns = document.querySelectorAll('.opt-btn');
            allBtns.forEach(btn => {
                if (btn.textContent.trim() === label) {
                    const parent = btn.parentElement;
                    parent.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active-opt'));
                    btn.classList.add('active-opt');

                    if (parent.id === 'video-options') videoQImg.src = btn.dataset.icon;
                    if (parent.id === 'audio-options') audioQImg.src = btn.dataset.icon;
                }
            });

            if (label === 'DASH') {
                desactivarHls();
                activarDash();
            } else {
                desactivarDash();
                activarHls();
            }
            return true;
        }
        return false;
    };

    video.addEventListener('seeking', () => { if (!isDashActive && !isHlsActive) audio.currentTime = video.currentTime; });
    video.addEventListener('waiting', () => { if (!isDashActive && !isHlsActive) audio.pause(); });
    video.addEventListener('timeupdate', syncMedia);
    video.addEventListener('playing', () => {
        syncMedia();
        if (!video.paused && !isDashActive && !isHlsActive) {
            audio.play().catch(e => console.log("Audio play interceptado", e));
        }
    });

    // ==========================================
    // --- 5. CAMBIO DE CALIDAD DINÁMICO ---
    // ==========================================
    const wasInSyncMode = () => {
        const activeOpt = Array.from(videoOptions).find(opt => opt.classList.contains('active-opt'));
        return activeOpt && (activeOpt.textContent.trim() === 'DASH' || activeOpt.textContent.trim() === 'HLS');
    };

    function setAudioQuality(label) {
        const audioQuality = Array.from(audioOptions).find(opt => opt.textContent.trim() === label);
        if (audioQuality) {
            audioOptions.forEach(b => b.classList.remove('active-opt'));
            audioQuality.classList.add('active-opt');
            audioQImg.src = audioQuality.dataset.icon;
            audio.src = audioQuality.dataset.audioSrc;
        }
    }

    videoOptions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const label = e.target.textContent.trim();
            if (label === 'DASH' || label === 'HLS') {
                checkStreamingSync(label);
                return;
            }
            if (e.target.classList.contains('active-opt')) return;

            desactivarStreaming();
            const comingFromSync = wasInSyncMode();
            const newSrc = e.target.dataset.videoSrc;
            const newIcon = e.target.dataset.icon;
            const wasPlaying = !video.paused;
            const currentTime = video.currentTime;

            videoOptions.forEach(b => b.classList.remove('active-opt'));
            e.target.classList.add('active-opt');
            videoQImg.src = newIcon;
            video.src = newSrc;

            if (comingFromSync) setAudioQuality('MD');
            window.waitForMediaLoad(wasPlaying, currentTime);
        });
    });

    function setVideoQuality(label) {
        const videoQuality = Array.from(videoOptions).find(opt => opt.textContent.trim() === label);
        if (videoQuality) {
            videoOptions.forEach(b => b.classList.remove('active-opt'));
            videoQuality.classList.add('active-opt');
            videoQImg.src = videoQuality.dataset.icon;
            video.src = videoQuality.dataset.videoSrc;
        }
    }

    audioOptions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const label = e.target.textContent.trim();
            if (label === 'DASH' || label === 'HLS') {
                checkStreamingSync(label);
                return;
            }
            if (e.target.classList.contains('active-opt')) return;

            desactivarStreaming();
            const comingFromSync = wasInSyncMode();
            const newSrc = e.target.dataset.audioSrc;
            const newIcon = e.target.dataset.icon;
            const wasPlaying = !video.paused;
            const currentTime = video.currentTime;

            audioOptions.forEach(b => b.classList.remove('active-opt'));
            e.target.classList.add('active-opt');
            audioQImg.src = newIcon;
            audio.src = newSrc;

            if (comingFromSync) setVideoQuality('720p');
            window.waitForMediaLoad(wasPlaying, currentTime);
        });
    });

    // ==========================================
    // --- 6. LÓGICA DE REPRODUCCIÓN Y VOLUMEN ---
    // ==========================================
    function actualizarIconoVolumen() {
        if (isMuted) {
            volumeImg.src = 'media/images/controls/volume-mute-icon.png';
            volumeBar.style.background = `rgba(255, 255, 255, 0.3)`;
        } else {
            const currentVolume = (isDashActive || isHlsActive) ? video.volume : audio.volume;
            if (currentVolume < 0.4) {
                volumeImg.src = 'media/images/controls/volume-icon.png';
            } else if (currentVolume < 0.8) {
                volumeImg.src = 'media/images/controls/volume-down-icon.png';
            } else {
                volumeImg.src = 'media/images/controls/volume-up-icon.png';
            }
            const porcentaje = currentVolume * 100;
            volumeBar.style.background = `linear-gradient(to right, #0505A1 ${porcentaje}%, rgba(255, 255, 255, 0.3) ${porcentaje}%)`;
        }
    }

    stopBtn.addEventListener('click', () => {
        desactivarStreaming();
        video.pause();
        audio.pause();
        playPauseImg.src = 'media/images/controls/play-icon.png';

        audio.volume = 0.5;
        volumeBar.value = 0.5;
        isMuted = false;
        audio.muted = false;
        video.muted = false;
        actualizarIconoVolumen();

        video.currentTime = 0;
        audio.currentTime = 0;
        progressBar.value = 0;
        progressBar.style.background = `rgba(255, 255, 255, 0.3)`;

        setAudioQuality('MD');
        setVideoQuality('720p');
        hideAllTracks();
        currentLang = 'en';

        window.waitForMediaLoad(false, 0);
    });

    playPauseBtn.addEventListener('click', async () => {
        if (video.paused || video.ended) {
            try {
                if (isDashActive || isHlsActive) {
                    await video.play();
                } else {
                    audio.currentTime = video.currentTime;
                    await Promise.all([video.play(), audio.play()]);
                }
                playPauseImg.src = 'media/images/controls/pause-icon.png';
            } catch (error) {
                console.error("Error en reproducción:", error);
            }
        } else {
            video.pause();
            if (!isDashActive && !isHlsActive) {
                audio.pause();
                audio.currentTime = video.currentTime;
            }
            playPauseImg.src = 'media/images/controls/play-icon.png';
        }
    });

    volumeBar.addEventListener('input', () => {
        const vol = parseFloat(volumeBar.value);
        audio.volume = vol;
        if (isDashActive || isHlsActive) video.volume = vol;
        actualizarIconoVolumen();
    });

    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        audio.muted = isMuted;
        if (isDashActive || isHlsActive) video.muted = isMuted;
        if (!isMuted) volumeBar.value = audio.volume;
        actualizarIconoVolumen();
    });

    actualizarIconoVolumen();

    // ==========================================
    // --- 7. LÓGICA DE LA BARRA DE PROGRESO --- 
    // ==========================================
    video.addEventListener('timeupdate', () => {
        if (!isNaN(video.duration)) {
            const porcentaje = (video.currentTime / video.duration) * 100;
            progressBar.value = porcentaje;
            progressBar.style.background = `linear-gradient(to right, #0505A1 ${porcentaje}%, rgba(255, 255, 255, 0.2) ${porcentaje}%)`;
        }
    });

    progressBar.addEventListener('input', () => {
        video.currentTime = (progressBar.value / 100) * video.duration;
    });

    video.addEventListener('ended', () => stopBtn.click());

    // ==========================================
    // --- 8. LÓGICA DE SUBTÍTULOS ---
    // ==========================================
    let isSubtitlesActive = false;
    let currentLang = 'en';

    const hideAllTracks = () => {
        for (let i = 0; i < video.textTracks.length; i++) {
            if (video.textTracks[i].kind === 'subtitles' || video.textTracks[i].kind === 'captions') {
                video.textTracks[i].mode = 'hidden';
            }
        }
        isSubtitlesActive = false;
        subtitlesImg.src = 'media/images/controls/subtitles-off-icon.png';
        updateActiveButton(null, false);
    };

    const showTrack = (lang) => {
        hideAllTracks();
        for (let i = 0; i < video.textTracks.length; i++) {
            if (video.textTracks[i].language === lang &&
                (video.textTracks[i].kind === 'subtitles' || video.textTracks[i].kind === 'captions')) {
                video.textTracks[i].mode = 'showing';
                isSubtitlesActive = true;
                currentLang = lang;
                subtitlesImg.src = 'media/images/controls/subtitles-on-icon.png';
                updateActiveButton(lang, true);
                break;
            }
        }
    };

    const updateActiveButton = (lang, isActive) => {
        langOptions.forEach(btn => {
            if (isActive && btn.dataset.lang === lang) {
                btn.classList.add('active-opt');
            } else {
                btn.classList.remove('active-opt');
            }
        });
    };

    subtitlesBtn.addEventListener('click', () => {
        if (isSubtitlesActive) hideAllTracks();
        else showTrack(currentLang);
    });

    langOptions.forEach(btn => {
        btn.addEventListener('click', (event) => {
            const selectedLang = event.target.dataset.lang;
            if (isSubtitlesActive && currentLang === selectedLang) hideAllTracks();
            else showTrack(selectedLang);
        });
    });

    // ==========================================
    // --- 9. GESTIÓN DE PESTAÑA ACTIVA ---
    // ==========================================
    let wasPlayingBeforeHidden = false;

    document.addEventListener("visibilitychange", async () => {
        if (document.hidden) {
            wasPlayingBeforeHidden = !video.paused;
            video.pause();
            audio.pause();
        } else {
            if (!isDashActive && !isHlsActive) audio.currentTime = video.currentTime;
            if (wasPlayingBeforeHidden) {
                try {
                    if (isDashActive || isHlsActive) await video.play();
                    else await Promise.all([video.play(), audio.play()]);
                    playPauseImg.src = 'media/images/controls/pause-icon.png';
                } catch (e) {
                    console.log("Reanudación bloqueada por el navegador");
                }
            }
        }
    });

    // ==========================================
    // --- 10. LÓGICA DE METADATOS (WEBVTT) ---
    // ==========================================
    const metadataTrack = Array.from(video.textTracks).find(t => t.kind === 'metadata' && t.label === 'Español');

    if (metadataTrack) {
        metadataTrack.mode = 'hidden';
        metadataTrack.addEventListener('cuechange', () => {
            const cue = metadataTrack.activeCues[0];
            if (!cue) return;

            try {
                const data = JSON.parse(cue.text);
                document.querySelector('.info-bajo-video h2').textContent = data.title;
                document.querySelector('.info-bajo-video p').textContent = data.desc;

                document.getElementById('meta-mas-jugado-img').src = data.p_mas.f;
                document.getElementById('meta-mas-jugado-p').textContent = data.p_mas.n;

                document.getElementById('meta-origen-img').src = data.p_ori.f;
                document.getElementById('meta-origen-p').textContent = data.p_ori.n;

                document.getElementById('meta-top1-img').src = data.tops[0].p;
                document.getElementById('meta-top1-p').textContent = data.tops[0].n;

                document.getElementById('meta-top2-img').src = data.tops[1].p;
                document.getElementById('meta-top2-p').textContent = data.tops[1].n;

                document.getElementById('meta-top3-img').src = data.tops[2].p;
                document.getElementById('meta-top3-p').textContent = data.tops[2].n;

            } catch (e) { console.error("Error metadatos:", e); }
        });
    }

    // ==========================================
    // --- 11. LÓGICA DE PREGUNTAS (QUIZ) VÍA WEBRTC ---
    // ==========================================
    const quizTrackEl = Array.from(video.textTracks).find(
        t => t.kind === 'metadata' && t.label === 'Quiz'
    );

    if (quizTrackEl) {
        quizTrackEl.mode = 'hidden';

        quizTrackEl.addEventListener('cuechange', () => {
            const cue = quizTrackEl.activeCues[0];
            if (!cue) return;

            try {
                const quizData = JSON.parse(cue.text);

                // Pausar y bloquear el Visualizador
                video.pause();
                if (!isDashActive && !isHlsActive) audio.pause();
                playPauseImg.src = 'media/images/controls/play-icon.png';
                controls.classList.add('controls-disabled');

                // Enviar al dispositivo Respondedor P2P
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({
                        type: 'SHOW_QUIZ',
                        payload: quizData
                    }));
                } else {
                    console.warn("No hay Respondedor conectado (DataChannel cerrado).");
                }
            } catch (e) {
                console.error("Error al parsear la pregunta del VTT:", e);
            }
        });
    }

});