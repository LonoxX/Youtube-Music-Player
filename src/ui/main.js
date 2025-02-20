const serverUrl = 'http://192.168.178.20:26538';
let currentToken = '';
let refreshInterval = 10;
let refreshTimer;
let progressTimer;
let isPlaying = false;
let currentSongDuration = 0;
let currentElapsedTime = 0;

// Helper function to safely add event listeners
const addEventListenerSafe = (element, event, handler) => {
    if (element) {
        element.addEventListener(event, handler);
    }
};

// Helper function to safely get DOM elements
const getElement = (id) => document.getElementById(id);

// Initialize UI elements
const elements = {
    songTitleEl: getElement('song-title'),
    songArtistEl: getElement('song-artist'),
    songImageEl: getElement('song-image'),
    songDurationEl: getElement('song-duration'),
    songElapsedEl: getElement('song-elapsed'),
    songAlbumEl: getElement('song-album'),
    songUrlEl: getElement('song-url'),
    refreshTimerEl: getElement('refresh-timer'),
    songProgressEl: getElement('song-progress'),
    volumeSlider: getElement('volumeSlider'),
    volumeValueEl: getElement('volume-value'),
    searchInput: getElement('searchInput'),
    searchBtn: getElement('searchBtn'),
    searchResults: getElement('searchResults'),
    queueList: getElement('queueList'),
    clearQueueBtn: getElement('clearQueue'),
    likeBtn: getElement('likeBtn'),
    dislikeBtn: getElement('dislikeBtn'),
    muteBtn: getElement('muteBtn'),
    shuffleBtn: getElement('shuffleBtn'),
    repeatBtn: getElement('repeatBtn'),
    goBackBtn: getElement('goBackBtn'),
    goForwardBtn: getElement('goForwardBtn')
};

async function loadAppVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        const versionElement = document.getElementById('app-version');
        if (versionElement) {
            versionElement.textContent = data.version;
        }
    } catch (error) {
        console.error('Error loading version:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {

    const views = {
        'now-playing': document.getElementById('now-playing-view'),
        'search': document.getElementById('search-view'),
        'credits': document.getElementById('credits-view')
    };

    function switchView(viewName) {

        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        Object.entries(views).forEach(([name, element]) => {
            if (name === viewName) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        });

        const titles = {
            'now-playing': 'Now Playing',
            'search': 'Search',
            'credits': 'Credits'
        };
        document.title = `Music Player - ${titles[viewName]}`;

        const queueSection = document.querySelector('.queue-section');
        if (queueSection) {
            queueSection.style.opacity = viewName === 'now-playing' ? '1' : '0';
        }
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const viewName = item.dataset.view;

            if (item.classList.contains('active')) return;

            const mainContent = document.querySelector('.main-content');
            mainContent.style.opacity = '0';
            mainContent.style.transform = 'translateY(20px)';

            setTimeout(() => {
                switchView(viewName);
                mainContent.style.opacity = '1';
                mainContent.style.transform = 'translateY(0)';
            }, 200);

            if (viewName === 'credits') {
                loadAppVersion();
            }
        });
    });

    try {
        const response = await fetch(`${serverUrl}/auth/1`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch initial token');
        }

        const data = await response.json();
        currentToken = data.accessToken;
        await loadVolume();
        await loadSongInfo();
        updateRefreshTimer();
        await loadQueue();
        startQueueRefresh();
    } catch (error) {
        console.error('Error during initialization:', error);
    }

    const commandButtons = document.querySelectorAll('.command-btn');
    commandButtons.forEach(btn => {
        addEventListenerSafe(btn, 'click', async () => {
            const endpoint = btn.getAttribute('data-endpoint');
            try {
                const response = await fetch(`${serverUrl}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentToken}`
                    }
                });

                switch(endpoint) {
                    case '/api/v1/pause':
                        stopProgress();
                        stopRefreshTimer();
                        isPlaying = false;
                        await loadSongInfo();
                        break;
                    case '/api/v1/play':
                        isPlaying = true;
                        await loadSongInfo();
                        updateProgressBar();
                        updateRefreshTimer();
                        break;
                    case '/api/v1/next':
                    case '/api/v1/previous':
                        stopProgress();
                        stopRefreshTimer();
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await loadSongInfo();
                        if (isPlaying) {
                            updateProgressBar();
                            updateRefreshTimer();
                        }
                        break;
                }

            } catch (error) {
                if (elements.responseEl) {
                    elements.responseEl.textContent = error.toString();
                }
            }
        });
    });

    addEventListenerSafe(elements.volumeSlider, 'input', () => {
        if (elements.volumeValueEl) {
            elements.volumeValueEl.textContent = elements.volumeSlider.value;
        }
    });

    addEventListenerSafe(elements.volumeSlider, 'change', async () => {
        const volume = parseInt(elements.volumeSlider.value, 10);
        try {
            const response = await fetch(`${serverUrl}/api/v1/volume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ volume })
            });
            if (!response.ok) {
                throw new Error('Error setting volume.');
            }
            const data = await response.json();
            const volumeValue = data.state || volume;
            elements.volumeSlider.value = volumeValue;
            if (elements.volumeValueEl) {
                elements.volumeValueEl.textContent = volumeValue;
            }
            console.log('Volume set to:', volumeValue);
        } catch (error) {
            if (elements.responseEl) {
                elements.responseEl.textContent = error.toString();
            }
        }
    });
    let touchTimeout;
    addEventListenerSafe(elements.volumeSlider, 'touchstart', () => {
        clearTimeout(touchTimeout);
    });

    addEventListenerSafe(elements.volumeSlider, 'touchend', () => {
        touchTimeout = setTimeout(() => {
            const tooltip = document.querySelector('.volume-tooltip');
            tooltip.style.display = 'none';
        }, 1500);
    });

    addEventListenerSafe(elements.songInfoBtn, 'click', async () => {
        await loadSongInfo();
    });

    async function loadSongInfo() {
        try {
            const response = await fetch(`${serverUrl}/api/v1/song`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            const data = await response.json();
            if (elements.songTitleEl) elements.songTitleEl.textContent = data.title || 'No Title';
            if (elements.songArtistEl) elements.songArtistEl.textContent = data.artist || 'Unknown Artist';
            if (elements.songImageEl) {
                elements.songImageEl.src = data.imageSrc || '';
                elements.songImageEl.alt = data.title || 'Album Art';
            }
            updateMiniPlayer({
                title: data.title || 'No Title',
                artist: data.artist || 'Unknown Artist',
                imageSrc: data.imageSrc || '',
                isLiked: data.isLiked
            });

            if (elements.songViewsEl) elements.songViewsEl.textContent = `Views: ${data.views}`;
            if (elements.songUploadDateEl) elements.songUploadDateEl.textContent = `Upload Date: ${new Date(data.uploadDate).toLocaleDateString()}`;
            currentSongDuration = data.songDuration;
            currentElapsedTime = data.elapsedSeconds;
            if (elements.songDurationEl) elements.songDurationEl.textContent = formatTime(data.songDuration);
            if (elements.songElapsedEl) elements.songElapsedEl.textContent = formatTime(data.elapsedSeconds);
            if (elements.songAlbumEl) elements.songAlbumEl.textContent = `Album: ${data.album}`;
            if (elements.songUrlEl) elements.songUrlEl.href = data.url;
            const progress = (data.elapsedSeconds / data.songDuration) * 100;
            if (elements.songProgressEl) elements.songProgressEl.style.width = `${progress}%`;

            isPlaying = !data.isPaused;
            updateButtonStates(data.isPaused);

            if (!data.isPaused) {
                updateProgressBar();
            }
            await loadVolume();
            await updateShuffleState();
            await updateRepeatState();
            await loadQueue();

            const miniPlayerImage = document.getElementById('mini-player-image');
            const miniPlayerTitle = document.getElementById('mini-player-title');
            const miniPlayerArtist = document.getElementById('mini-player-artist');

            if (miniPlayerImage) miniPlayerImage.src = data.imageSrc;
            if (miniPlayerTitle) miniPlayerTitle.textContent = data.title;
            if (miniPlayerArtist) miniPlayerArtist.textContent = data.artist;

        } catch (error) {
            if (elements.responseEl) {
                elements.responseEl.textContent = error.toString();
            }
        }
    }

    function updateMiniPlayer(songData) {
        const miniPlayerImage = document.getElementById('mini-player-image');
        const miniPlayerTitle = document.getElementById('mini-player-title');
        const miniPlayerArtist = document.getElementById('mini-player-artist');
        const miniLikeBtn = document.getElementById('miniLikeBtn');

        if (miniPlayerImage) {
            miniPlayerImage.src = songData.imageSrc;
            miniPlayerImage.alt = songData.title;
        }
        if (miniPlayerTitle) miniPlayerTitle.textContent = songData.title;
        if (miniPlayerArtist) miniPlayerArtist.textContent = songData.artist;

        if (miniLikeBtn) {
            const likeIcon = miniLikeBtn.querySelector('i');
            if (likeIcon) {
                likeIcon.className = songData.isLiked ? 'fas fa-heart' : 'far fa-heart';
                miniLikeBtn.classList.toggle('active', songData.isLiked);
            }
        }
    }

    addEventListenerSafe(document.getElementById('miniLikeBtn'), 'click', async () => {
        try {
            await fetch(`${serverUrl}/api/v1/like`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            await loadSongInfo();
        } catch (error) {
            console.error('Error toggling like:', error);
        }
    });

    addEventListenerSafe(document.querySelector('.mini-player'), 'click', (e) => {
        if (e.target.closest('#miniLikeBtn')) return;
        switchView('now-playing');
    });

    async function loadVolume() {
        try {
            const volumeResponse = await fetch(`${serverUrl}/api/v1/volume`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (!volumeResponse.ok) {
                throw new Error('Error loading volume.');
            }

            const data = await volumeResponse.json();
            if (data && typeof data.state === 'number') {
                if (elements.volumeSlider) {
                    elements.volumeSlider.value = data.state;
                }
                if (elements.volumeValueEl) {
                    elements.volumeValueEl.textContent = data.state;
                }
                const progressBar = document.querySelector('.volume-slider-progress');
                if (progressBar) {
                    progressBar.style.width = `${data.state}%`;
                }
                const muteIcon = elements.muteBtn?.querySelector('i');
                console.log('Mute icon:', muteIcon);
                if (muteIcon) {
                    muteIcon.className = getVolumeIconClass(data.state);
                }
                console.log('Initial volume loaded:', data.state); // Debug output
            }
        } catch (error) {
            console.error('Error loading volume:', error);
        }
    }

    addEventListenerSafe(elements.volumeSlider, 'input', (e) => {
        const value = e.target.value;
        updateVolumeUI(value);
    });

    function updateVolumeUI(value) {
        if (elements.volumeValueEl) {
            elements.volumeValueEl.textContent = value;
        }
        const progressBar = document.querySelector('.volume-slider-progress');
        if (progressBar) {
            progressBar.style.width = `${value}%`;
        }
        const muteIcon = elements.muteBtn?.querySelector('i');
        if (muteIcon) {
            muteIcon.className = getVolumeIconClass(value);
        }
    }

    function getVolumeIconClass(volume) {
        if (volume === 0) return 'fas fa-volume-mute';
        if (volume < 50) return 'fas fa-volume-down';
        return 'fas fa-volume-up';
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function updateProgressBar() {
        stopProgress();

        if (isPlaying) {
            progressTimer = setInterval(() => {
                if (currentElapsedTime < currentSongDuration) {
                    currentElapsedTime++;
                    const progress = (currentElapsedTime / currentSongDuration) * 100;
                    if (elements.songProgressEl) elements.songProgressEl.style.width = `${progress}%`;
                    if (elements.songElapsedEl) elements.songElapsedEl.textContent = formatTime(currentElapsedTime);
                } else {
                    stopProgress();
                    loadSongInfo();
                }
            }, 1000);
        }
    }

    function stopProgress() {
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    }

    function updateButtonStates(isPaused) {
        const playButton = document.querySelector('[data-endpoint="/api/v1/play"]');
        const pauseButton = document.querySelector('[data-endpoint="/api/v1/pause"]');

        if (isPaused) {
            playButton.style.display = 'inline-block';
            pauseButton.style.display = 'none';
        } else {
            playButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
        }
    }

    function updateRefreshTimer() {
        stopRefreshTimer();
        let timeLeft = refreshInterval;
        if (elements.refreshTimerEl) elements.refreshTimerEl.textContent = `Next refresh in: ${timeLeft} seconds`;
        refreshTimer = setInterval(() => {
            timeLeft -= 1;
            if (elements.refreshTimerEl) elements.refreshTimerEl.textContent = `Next refresh in: ${timeLeft} seconds`;
            if (timeLeft <= 0) {
                clearInterval(refreshTimer);
                loadSongInfo();
                updateRefreshTimer();
            }
        }, 1000);
    }

    function stopRefreshTimer() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    async function performSearch() {
        const query = elements.searchInput?.value.trim();
        if (!query) return;
        switchView('search');

        try {
            const response = await fetch(`${serverUrl}/api/v1/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ query })
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const data = await response.json();
            let searchResults = [];
            if (data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents) {
                const sections = data.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents;
                sections.forEach(section => {
                    if (section.musicShelfRenderer?.contents) {
                        searchResults = searchResults.concat(section.musicShelfRenderer.contents);
                    }
                });
            } else if (data.contents?.sectionListRenderer?.contents) {
                const sections = data.contents.sectionListRenderer.contents;
                sections.forEach(section => {
                    if (section.musicShelfRenderer?.contents) {
                        searchResults = searchResults.concat(section.musicShelfRenderer.contents);
                    }
                });
            }
            displaySearchResults(searchResults);
        } catch (error) {
            console.error('Search error:', error);
            if (elements.searchResults) {
                elements.searchResults.innerHTML = `
                    <div class="text-danger p-3">Search failed: ${error.message}</div>
                `;
            }
        }
    }

    function displaySearchResults(results) {
        if (!elements.searchResults) return;

        if (!Array.isArray(results) || results.length === 0) {
            elements.searchResults.innerHTML = `
                <div class="search-empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No Results Found</h3>
                    <p>Try different search terms</p>
                </div>
            `;
            return;
        }

        elements.searchResults.innerHTML = results.map(item => {
            const musicItem = item.musicResponsiveListItemRenderer;
            if (!musicItem) return '';

            const videoId = musicItem.playlistItemData?.videoId ||
                musicItem.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
                musicItem.navigationEndpoint?.watchEndpoint?.videoId;

            if (!videoId) return '';

            const title = musicItem.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unknown Title';
            const artist = musicItem.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unknown Artist';
            const thumbnailUrl = musicItem.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url ||
                musicItem.thumbnail?.thumbnails?.[0]?.url || '';
            console.log('Thumbnail URL:', thumbnailUrl);
            return `
                <div class="search-result-item" data-video-id="${videoId}">
                    <div class="search-result-image">
                        <img src="${thumbnailUrl}" alt="${title}">
                    </div>
                    <div class="search-result-content">
                        <div class="search-result-title">${title}</div>
                        <div class="search-result-artist">${artist}</div>
                        <button class="add-to-queue-btn">
                            <i class="fas fa-plus"></i>
                            Add to Queue
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const addButtons = elements.searchResults.querySelectorAll('.add-to-queue-btn');
        addButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent event bubbling
                const resultItem = button.closest('.search-result-item');
                const videoId = resultItem.dataset.videoId;

                try {
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

                    const response = await fetch(`${serverUrl}/api/v1/queue`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentToken}`
                        },
                        body: JSON.stringify({
                            videoId,
                            insertPosition: "INSERT_AT_END"
                        })
                    });

                    if (!response.ok) throw new Error('Failed to add to queue');

                    resultItem.classList.add('added-to-queue');
                    button.innerHTML = '<i class="fas fa-check"></i> Added';
                    setTimeout(() => {
                        resultItem.classList.remove('added-to-queue');
                        button.innerHTML = '<i class="fas fa-plus"></i> Add to Queue';
                        button.disabled = false;
                    }, 2000);
                    await loadQueue();
                } catch (error) {
                    console.error('Error adding to queue:', error);
                    button.innerHTML = '<i class="fas fa-times"></i> Failed';
                    setTimeout(() => {
                        button.innerHTML = '<i class="fas fa-plus"></i> Add to Queue';
                        button.disabled = false;
                    }, 2000);
                }
            });
        });
    }

    if (elements.searchBtn) {
        elements.searchBtn.addEventListener('click', performSearch);
    }
    if (elements.searchInput) {
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }

    async function loadQueue() {
        try {
            const response = await fetch('/api/v1/queue');
            if (!response.ok) throw new Error(`Fehler: ${response.status}`);
            const data = await response.json();

            const rawItems = Array.isArray(data) ? data : (data.items || []);
            const currentIndex = rawItems.findIndex(item => {
                const renderer = item.playlistPanelVideoRenderer ||
                               (item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer);
                return renderer?.isCurrentlyPlaying || renderer?.selected;
            });

            const queueWithOriginalIndices = rawItems.map((item, index) => ({
                ...item,
                originalIndex: index
            }));

            displayQueue(queueWithOriginalIndices);
        } catch (error) {
            console.error('Queue loading error:', error);
            elements.queueList.innerHTML = `<div class="error">${error.message}</div>`;
        }
    }

    function displayQueue(queue) {
        if (!elements.queueList) return;

        if (!Array.isArray(queue) || queue.length === 0) {
            elements.queueList.innerHTML = '<div class="queue-empty">Queue is empty</div>';
            if (document.getElementById('nowPlayingItem')) {
                document.getElementById('nowPlayingItem').innerHTML = '';
            }
            if (document.getElementById('queueCount')) {
                document.getElementById('queueCount').textContent = '0 Songs';
            }
            return;
        }

        const currentSong = queue.find(song => {
            const renderer = song.playlistPanelVideoRenderer ||
                            (song.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer);
            return renderer?.isCurrentlyPlaying || renderer?.selected;
        });


        if (currentSong && document.getElementById('nowPlayingItem')) {
            const renderer = currentSong.playlistPanelVideoRenderer ||
                            (currentSong.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer);

            const title = renderer?.title?.runs?.[0]?.text || 'Unbekannter Titel';
            const artist = renderer?.longBylineText?.runs?.[0]?.text || 'Unbekannter Künstler';
            const duration = renderer?.lengthText?.runs?.[0]?.text || '--:--';
            const thumbnail = renderer?.thumbnail?.thumbnails?.[0]?.url || '';

            document.getElementById('nowPlayingItem').innerHTML = `
                <div class="queue-item-drag">
                    <i class="fas fa-music"></i>
                </div>
                <div class="queue-item-image">
                    <img src="${thumbnail}" alt="${title}">
                </div>
                <div class="queue-item-info">
                    <div class="queue-item-title">${title}</div>
                    <div class="queue-item-artist">${artist}</div>
                    <div class="queue-item-label">Just Playing</div>
                </div>
                <div class="queue-item-duration">${duration}</div>
            `;

            queue = queue.filter(item => item !== currentSong);
        }

        if (document.getElementById('queueCount')) {
            document.getElementById('queueCount').textContent = `${queue.length} Songs`;
        }

        elements.queueList.innerHTML = queue.map((song) => {
            const renderer = song.playlistPanelVideoRenderer ||
                            (song.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer);

            const title = renderer?.title?.runs?.[0]?.text || 'Unknown Title';
            const artist = renderer?.longBylineText?.runs?.[0]?.text || 'Unknown Artist';
            const duration = renderer?.lengthText?.runs?.[0]?.text || '--:--';
            const thumbnail = renderer?.thumbnail?.thumbnails?.[0]?.url || '';

            return `
                <div class="queue-item" data-index="${song.originalIndex}" draggable="true">
                    <div class="queue-item-drag">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    <div class="queue-item-image">
                        <img src="${thumbnail}" alt="${title}">
                    </div>
                    <div class="queue-item-info">
                        <div class="queue-item-title">${title}</div>
                        <div class="queue-item-artist">${artist}</div>
                        <div class="queue-item-label">IN QUEUE</div>
                    </div>
                    <div class="queue-item-duration">${duration}</div>
                    <div class="queue-item-controls">
                        <button class="btn-icon play-queue-item" data-original-index="${song.originalIndex}">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn-icon remove-queue-item" data-original-index="${song.originalIndex}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function startQueueRefresh() {
        setInterval(() => {
            if (currentToken) {
                loadQueue();
            }
        }, 5000);
    }

    loadQueue();
    startQueueRefresh();

    // Add song to queue with feedback
    addEventListenerSafe(elements.searchResults, 'click', async (e) => {
        const resultItem = e.target.closest('.search-result-item');
        if (!resultItem) return;

        const videoId = resultItem.dataset.videoId;
        try {
            const response = await fetch(`${serverUrl}/api/v1/queue`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    videoId,
                    insertPosition: "INSERT_AT_END"  // or "INSERT_AFTER_CURRENT_VIDEO"
                })
            });
            if (!response.ok) {
                throw new Error('Failed to add to queue');
            }
            // Show feedback
            resultItem.classList.add('added-to-queue');
            setTimeout(() => resultItem.classList.remove('added-to-queue'), 1000);
            await loadQueue();
        } catch (error) {
            console.error('Error adding to queue:', error);
        }
    });

    addEventListenerSafe(elements.clearQueueBtn, 'click', async () => {
        try {
            await fetch(`${serverUrl}/api/v1/queue`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            await loadQueue();
        } catch (error) {
            console.error('Error clearing queue:', error);
        }
    });

    addEventListenerSafe(elements.queueList, 'click', async (e) => {
        const button = e.target.closest('.play-queue-item, .remove-queue-item');
        if (!button) return;

        const originalIndex = button.dataset.originalIndex;

        if (button.classList.contains('play-queue-item')) {
            try {
                await fetch(`${serverUrl}/api/v1/queue`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentToken}`
                    },
                    body: JSON.stringify({ index: parseInt(originalIndex) })
                });
                await loadSongInfo();
                await loadQueue();
            } catch (error) {
                console.error('Error setting queue index:', error);
            }
        } else if (button.classList.contains('remove-queue-item')) {
            try {
                await fetch(`${serverUrl}/api/v1/queue/${originalIndex}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${currentToken}`
                    }
                });
                await loadQueue();
            } catch (error) {
                console.error('Error removing from queue:', error);
            }
        }
    });

    let draggedItem = null;

    addEventListenerSafe(elements.queueList, 'dragstart', (e) => {
        draggedItem = e.target.closest('.queue-item');
        draggedItem.classList.add('dragging');
    });

    addEventListenerSafe(elements.queueList, 'dragend', () => {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
    });

    addEventListenerSafe(elements.queueList, 'dragover', (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.queue-item');
        if (!targetItem || targetItem === draggedItem) return;

        const rect = targetItem.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;

        targetItem.classList.remove('drag-over');
        if (isAbove) {
            targetItem.classList.add('drag-over');
        }
    });

    addEventListenerSafe(elements.queueList, 'drop', async (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.queue-item');
        if (!targetItem || targetItem === draggedItem) return;

        const fromIndex = parseInt(draggedItem.dataset.index);
        const toIndex = parseInt(targetItem.dataset.index);

        try {
            await fetch(`${serverUrl}/api/v1/queue/${fromIndex}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ toIndex })
            });
            await loadQueue();
        } catch (error) {
            console.error('Error moving queue item:', error);
        }
    });


    addEventListenerSafe(elements.likeBtn, 'click', async () => {
        try {
            const response = await fetch(`${serverUrl}/api/v1/like`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            if (response.ok) {
                const likeIcon = elements.likeBtn.querySelector('i');
                const isCurrentlyLiked = likeIcon.classList.contains('fas');

                if (isCurrentlyLiked) {
                    likeIcon.classList.remove('fas');
                    likeIcon.classList.add('far');
                    elements.likeBtn.classList.remove('active');
                } else {
                    likeIcon.classList.remove('far');
                    likeIcon.classList.add('fas');
                    elements.likeBtn.classList.add('active');
                }
            }

            await loadQueue();
            elements.dislikeBtn.classList.remove('active');
        } catch (error) {
            console.error('Error:', error);
        }
    });

    addEventListenerSafe(elements.dislikeBtn, 'click', async () => {
        try {
            await fetch(`${serverUrl}/api/v1/dislike`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            elements.dislikeBtn.classList.toggle('active');
            elements.likeBtn.classList.remove('active');
        } catch (error) {
            console.error('Error:', error);
        }
    });

    addEventListenerSafe(elements.goBackBtn, 'click', () => seekRelative(-10));
    addEventListenerSafe(elements.goForwardBtn, 'click', () => seekRelative(10));

    async function seekRelative(seconds) {
        try {
            const endpoint = seconds < 0 ? '/api/v1/go-back' : '/api/v1/go-forward';
            await fetch(`${serverUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ seconds: Math.abs(seconds) })
            });
            await loadSongInfo();
        } catch (error) {
            console.error('Error:', error);
        }
    }

    addEventListenerSafe(elements.shuffleBtn, 'click', async () => {
        try {
            await fetch(`${serverUrl}/api/v1/shuffle`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            await updateShuffleState();
        } catch (error) {
            console.error('Error:', error);
        }
    });

    async function updateShuffleState() {
        try {
            const response = await fetch(`${serverUrl}/api/v1/shuffle`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const data = await response.json();
            elements.shuffleBtn.classList.toggle('active', data.state);
        } catch (error) {
            console.error('Error:', error);
        }
    }

    addEventListenerSafe(elements.repeatBtn, 'click', async () => {
        try {
            await fetch(`${serverUrl}/api/v1/switch-repeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ iteration: 1 })
            });
            await updateRepeatState();
        } catch (error) {
            console.error('Error:', error);
        }
    });

    async function updateRepeatState() {
        try {
            const response = await fetch(`${serverUrl}/api/v1/repeat-mode`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const data = await response.json();
            elements.repeatBtn.dataset.mode = data.mode;
            elements.repeatBtn.classList.toggle('active', data.mode !== 'NONE');
        } catch (error) {
            console.error('Error:', error);
        }
    }

    addEventListenerSafe(elements.muteBtn, 'click', async () => {
        try {
            await fetch(`${serverUrl}/api/v1/toggle-mute`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            elements.muteBtn.dataset.state = elements.muteBtn.dataset.state === 'muted' ? 'unmuted' : 'muted';
        } catch (error) {
            console.error('Error:', error);
        }
    });

    addEventListenerSafe(elements.fullscreenBtn, 'click', async () => {
        try {
            const response = await fetch(`${serverUrl}/api/v1/fullscreen`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ state: true })
            });
            if (response.ok) {
                elements.fullscreenBtn.classList.toggle('active');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    loadSongInfo();
    updateRefreshTimer();

    // Enhanced Mobile Navigation
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    let touchStartX = 0;
    let touchEndX = 0;

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }

    // Touch gestures for sidebar
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
    }, false);

    document.addEventListener('touchmove', (e) => {
        touchEndX = e.touches[0].clientX;
    }, false);

    document.addEventListener('touchend', () => {
        if (!sidebar.classList.contains('active') && touchEndX - touchStartX > 100 && touchStartX < 50) {
            // Swipe right from left edge
            toggleSidebar();
        } else if (sidebar.classList.contains('active') && touchStartX - touchEndX > 100) {
            // Swipe left when sidebar is open
            toggleSidebar();
        }
    }, false);

    mobileNavToggle?.addEventListener('click', toggleSidebar);
    sidebarOverlay?.addEventListener('click', toggleSidebar);

    // Close sidebar when clicking on a nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                toggleSidebar();
            }
        });
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar?.classList.remove('active');
            sidebarOverlay?.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Prevent touchmove when sidebar is open to prevent body scroll
    document.body.addEventListener('touchmove', (e) => {
        if (sidebar.classList.contains('active')) {
            e.preventDefault();
        }
    }, { passive: false });
});
