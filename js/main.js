"use strict";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // --- 1. SELECCIÓN DE ELEMENTOS --- 
    // ==========================================
    const video = document.getElementById('mainVideo');
    const audio = document.getElementById('mainAudio');
    const controls = document.getElementById('video-controls');

    // Controles básicos
    const stopBtn = document.getElementById('stopBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseImg = playPauseBtn.querySelector('img');
    const muteBtn = document.getElementById('muteBtn');
    const volumeBar = document.getElementById('volume-bar');
    const volumeImg = muteBtn.querySelector('img');
    const progressBar = document.getElementById('progress-bar');

    // Controles de subtítulos y calidad
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

    // Asegurar que JS reconozca los src de los tag <source> iniciales
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

        // FIX: Wait for STREAM_INITIALIZED before seeking, otherwise seek is ignored
        dashPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, function onInit() {
            dashPlayer.off(dashjs.MediaPlayer.events.STREAM_INITIALIZED, onInit);
            if (currentTime > 0) dashPlayer.seek(currentTime);
            if (wasPlaying) {
                video.play()
                    .then(() => { playPauseImg.src = 'media/images/controls/pause-icon.png'; })
                    .catch(e => console.log("DASH play interceptado:", e));
            }
            // Re-enable play button after DASH is ready
            playPauseBtn.disabled = false;
            playPauseBtn.style.opacity = '1';
        });

        dashPlayer.initialize(video, DASH_MANIFEST_URL, false);

        // Sync volumes from the audio element to the video element (DASH uses video for audio)
        video.volume = audio.volume;
        video.muted = audio.muted;

        // Silence the native audio element so MP4 audio doesn't overlap
        audio.muted = true;

        // Disable play button while DASH initialises
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

        // FIX: Restore audio.muted based on a tracked boolean, not a fragile src comparison
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
            // Native HLS (Safari)
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

    // FIX: Track mute state explicitly (not via src string inspection)
    let isMuted = false;

    window.waitForMediaLoad = function(resumePlay = false, restoreTime = 0) {
        let isVideoReady = false;
        // FIX: When DASH/HLS is active, we don't wait for the native audio element
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
            console.error(`Error: El ${type} no pudo cargarse o hubo un problema de red.`);
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

        // FIX: Only register audio listeners when not in streaming mode
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
            // Mark all buttons with this label as active
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

            console.log(`Modo ${label} activado.`);

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
            // FIX: video.pause() and audio.pause() are synchronous — no await needed
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
        if (!isMuted) {
            volumeBar.value = audio.volume;
        }
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
        const tiempoDestino = (progressBar.value / 100) * video.duration;
        video.currentTime = tiempoDestino;
    });

    video.addEventListener('ended', () => {
        stopBtn.click();
    });

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
        if (isSubtitlesActive) {
            hideAllTracks();
        } else {
            showTrack(currentLang);
        }
    });

    langOptions.forEach(btn => {
        btn.addEventListener('click', (event) => {
            const selectedLang = event.target.dataset.lang;
            if (isSubtitlesActive && currentLang === selectedLang) {
                hideAllTracks();
            } else {
                showTrack(selectedLang);
            }
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
                    if (isDashActive || isHlsActive) {
                        await video.play();
                    } else {
                        await Promise.all([video.play(), audio.play()]);
                    }
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

                const imgMas = document.getElementById('meta-mas-jugado-img');
                imgMas.src = data.p_mas.f;
                document.getElementById('meta-mas-jugado-p').textContent = data.p_mas.n;

                const imgOri = document.getElementById('meta-origen-img');
                imgOri.src = data.p_ori.f;
                document.getElementById('meta-origen-p').textContent = data.p_ori.n;

                const imgTop1 = document.getElementById('meta-top1-img');
                imgTop1.src = data.tops[0].p;
                document.getElementById('meta-top1-p').textContent = data.tops[0].n;

                const imgTop2 = document.getElementById('meta-top2-img');
                imgTop2.src = data.tops[1].p;
                document.getElementById('meta-top2-p').textContent = data.tops[1].n;

                const imgTop3 = document.getElementById('meta-top3-img');
                imgTop3.src = data.tops[2].p;
                document.getElementById('meta-top3-p').textContent = data.tops[2].n;

            } catch (e) { console.error("Error metadatos:", e); }
        });
    }

    // ==========================================
    // --- 11. LÓGICA DE PREGUNTAS (QUIZ) ---
    // ==========================================
    const quizOverlay = document.getElementById('quiz-overlay');
    const quizQuestion = document.getElementById('quiz-question');
    const quizOptionsContainer = document.getElementById('quiz-options');
    const quizFeedback = document.getElementById('quiz-feedback');

    // FIX: kind="preguntas" is not a valid HTML track kind — browsers silently ignore it.
    // Changed to kind="metadata" with label="Quiz" in the HTML, and matched here.
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

                video.pause();
                if (!isDashActive && !isHlsActive) audio.pause();
                playPauseImg.src = 'media/images/controls/play-icon.png';

                controls.classList.add('controls-disabled');

                quizQuestion.textContent = quizData.question;
                quizOptionsContainer.innerHTML = '';
                quizFeedback.textContent = '';

                quizOverlay.style.display = 'flex';

                quizData.options.forEach((opcion, index) => {
                    const btn = document.createElement('button');
                    btn.className = 'quiz-option';
                    btn.textContent = opcion;

                    btn.addEventListener('click', () => {
                        const todosBotones = quizOptionsContainer.querySelectorAll('.quiz-option');
                        todosBotones.forEach(b => b.disabled = true);

                        if (index === quizData.correctIndex) {
                            btn.classList.add('correct');
                            quizFeedback.textContent = '¡Correcto!';
                            quizFeedback.style.color = '#28a745';
                        } else {
                            btn.classList.add('incorrect');
                            quizFeedback.textContent = 'Respuesta incorrecta.';
                            quizFeedback.style.color = '#dc3545';
                            todosBotones[quizData.correctIndex].classList.add('correct');
                        }

                        setTimeout(async () => {
                            quizOverlay.style.display = 'none';
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
                                console.log("Error al reanudar tras la pregunta:", e);
                            }
                        }, 2500);
                    });

                    quizOptionsContainer.appendChild(btn);
                });

            } catch (e) {
                console.error("Error al parsear la pregunta del VTT:", e);
            }
        });
    }

});
