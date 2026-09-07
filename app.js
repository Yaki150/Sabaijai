(() => {
  'use strict';

  const audioPlayer = document.getElementById('audioPlayer');
  const fileInput = document.getElementById('fileInput');
  const trackListEl = document.getElementById('trackList');
  const playlistItemsEl = document.getElementById('playlistItems');
  const playlistSubEl = document.getElementById('playlistSub');
  const playlistTitleEl = document.getElementById('playlistTitle');

  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const loopBtn = document.getElementById('loopBtn');
  const seekSlider = document.getElementById('seekSlider');
  const currentTimeEl = document.getElementById('currentTime');
  const durationTimeEl = document.getElementById('durationTime');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeToggle = document.getElementById('volumeToggle');
  const likeBtn = document.getElementById('likeBtn');

  const playerCover = document.getElementById('playerCover');
  const nowPlayingTitle = document.getElementById('nowPlayingTitle');
  const nowPlayingArtist = document.getElementById('nowPlayingArtist');

  const panelCover = document.getElementById('panelCover');
  const panelSongTitle = document.getElementById('panelSongTitle');
  const panelSongArtist = document.getElementById('panelSongArtist');

  const playlistImageContainer = document.getElementById('playlistImageContainer');
  const playlistImageInput = document.getElementById('playlistImageInput');

  const nameDetailsBtn = document.getElementById('nameDetailsBtn');
  const detailsModal = document.getElementById('detailsModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const saveModalBtn = document.getElementById('saveModalBtn');
  const playlistNameInput = document.getElementById('playlistNameInput');
  const playlistDescTextarea = document.getElementById('playlistDescTextarea');
  const modalImagePreview = document.getElementById('modalImagePreview');
  const modalImageInput = document.getElementById('modalImageInput');

  const createPlaylistBtn = document.getElementById('createPlaylistBtn');
  const playPlaylistBtn = document.getElementById('playPlaylistBtn');
  const searchInput = document.getElementById('searchInput');

  let tracks = [];              // {id, title, artist, album, dateAdded, order, duration, liked, url, blob}
  let currentTrackId = null;
  let isLooping = false;
  let isMuted = false;
  let lastVolume = 70;

  // ---------------------------------------------------------------
  // IndexedDB persistence — uploaded songs & playlist details are
  // kept in the browser so they survive a page refresh. Nothing is
  // uploaded anywhere; it all stays on this device.
  // ---------------------------------------------------------------
  const DB_NAME = 'sabaijaiMusicDB';
  const DB_VERSION = 1;
  const TRACK_STORE = 'tracks';
  const META_STORE = 'meta';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB not supported')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(TRACK_STORE)) db.createObjectStore(TRACK_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function dbPutTrack(record) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TRACK_STORE, 'readwrite');
        tx.objectStore(TRACK_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) { /* storage unavailable — app still works this session */ }
  }

  async function dbDeleteTrack(id) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TRACK_STORE, 'readwrite');
        tx.objectStore(TRACK_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) { /* no-op */ }
  }

  async function dbGetAllTracks() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(TRACK_STORE, 'readonly');
        const req = tx.objectStore(TRACK_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (err) { return []; }
  }

  async function dbSaveMeta(meta) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readwrite');
        tx.objectStore(META_STORE).put({ key: 'playlist', ...meta });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) { /* no-op */ }
  }

  async function dbGetMeta() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const req = tx.objectStore(META_STORE).get('playlist');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) { return null; }
  }

  // ---------------------------------------------------------------

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function guessMeta(fileName) {
    const base = fileName.replace(/\.[^/.]+$/, '');
    const parts = base.split(' - ');
    if (parts.length >= 2) return { title: parts.slice(1).join(' - ').trim(), artist: parts[0].trim() };
    return { title: base, artist: 'Unknown Artist' };
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function trackById(id) { return tracks.find((t) => t.id === id); }
  function indexById(id) { return tracks.findIndex((t) => t.id === id); }

  function persistTrack(track) {
    dbPutTrack({
      id: track.id, title: track.title, artist: track.artist, album: track.album,
      order: track.order, dateAdded: track.dateAdded, duration: track.duration,
      liked: track.liked, blob: track.blob
    });
  }

  // ---------- Adding / loading tracks ----------

  async function addFiles(fileList) {
    const files = Array.from(fileList);
    for (const file of files) {
      const meta = guessMeta(file.name);
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const track = {
        id,
        title: meta.title,
        artist: meta.artist,
        album: 'Uploaded',
        order: Date.now(),
        dateAdded: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        duration: null,
        liked: false,
        url: URL.createObjectURL(file),
        blob: file
      };
      tracks.push(track);
      persistTrack(track);
    }
    renderTracks();
    renderQueue();
  }

  async function loadTracksFromDB() {
    const stored = await dbGetAllTracks();
    if (!stored.length) return;
    stored.sort((a, b) => (a.order || 0) - (b.order || 0));
    tracks = stored.map((rec) => ({ ...rec, url: URL.createObjectURL(rec.blob) }));
    renderTracks();
    renderQueue();
  }

  // ---------- Rendering ----------

  function renderTracks() {
    trackListEl.innerHTML = '';
    if (tracks.length === 0) {
      trackListEl.innerHTML = '<tr><td colspan="6" class="empty-state">ยังไม่มีเพลง — กด "เพิ่มเพลง" เพื่อเริ่มต้น</td></tr>';
      playlistSubEl.textContent = '0 songs';
      return;
    }
    playlistSubEl.textContent = `${tracks.length} song${tracks.length > 1 ? 's' : ''}`;

    tracks.forEach((track, index) => {
      const tr = document.createElement('tr');
      tr.className = 'track-row' + (track.id === currentTrackId ? ' playing' : '');
      tr.innerHTML = `
        <td class="track-idx">
          <span class="idx-num">${index + 1}</span>
          <span class="idx-play">${track.id === currentTrackId && !audioPlayer.paused ? '⏸' : '▶'}</span>
        </td>
        <td>
          <div class="track-title-cell">
            <div class="track-cover"></div>
            <div class="track-title-text">
              <span class="track-name">${escapeHtml(track.title)}</span>
              <span class="track-artist">${escapeHtml(track.artist)}</span>
            </div>
          </div>
        </td>
        <td>${escapeHtml(track.album)}</td>
        <td>${track.dateAdded}</td>
        <td class="track-duration">${track.duration ? formatTime(track.duration) : '--:--'}</td>
        <td><button class="track-remove" data-id="${track.id}" title="Remove">✕</button></td>
      `;
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.track-remove')) return;
        playTrackById(track.id);
      });
      trackListEl.appendChild(tr);
    });

    trackListEl.querySelectorAll('.track-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrack(btn.dataset.id);
      });
    });
  }

  function renderQueue() {
    if (tracks.length === 0) {
      playlistItemsEl.innerHTML = '<p class="empty-state">ยังไม่มีเพลงในเพลย์ลิสต์</p>';
      return;
    }
    playlistItemsEl.innerHTML = tracks.map((track) => `
      <div class="queue-item" data-id="${track.id}">
        <div class="track-cover"></div>
        <div class="track-title-text">
          <span class="track-name">${escapeHtml(track.title)}</span>
          <span class="track-artist">${escapeHtml(track.artist)}</span>
        </div>
      </div>
    `).join('');
    playlistItemsEl.querySelectorAll('.queue-item').forEach((el) => {
      el.addEventListener('click', () => playTrackById(el.dataset.id));
    });
  }

  function removeTrack(id) {
    const idx = indexById(id);
    if (idx === -1) return;
    if (id === currentTrackId) {
      audioPlayer.pause();
      audioPlayer.removeAttribute('src');
      audioPlayer.load();
      currentTrackId = null;
      updateNowPlaying(null);
    }
    URL.revokeObjectURL(tracks[idx].url);
    tracks.splice(idx, 1);
    dbDeleteTrack(id);
    renderTracks();
    renderQueue();
  }

  // ---------- Playback ----------

  function playTrackById(id) {
    const idx = indexById(id);
    if (idx === -1) return;
    currentTrackId = id;
    const track = tracks[idx];
    audioPlayer.src = track.url;
    audioPlayer.play().catch(() => {});
    updateNowPlaying(track);
    renderTracks();
  }

  function updateNowPlaying(track) {
    if (!track) {
      nowPlayingTitle.textContent = 'ยังไม่ได้เล่นเพลง';
      nowPlayingArtist.textContent = '—';
      panelSongTitle.textContent = 'Song';
      panelSongArtist.textContent = 'Choose a track to play';
      playPauseBtn.textContent = '▶';
      likeBtn.classList.remove('liked');
      likeBtn.textContent = '♡';
      return;
    }
    nowPlayingTitle.textContent = track.title;
    nowPlayingArtist.textContent = track.artist;
    panelSongTitle.textContent = track.title;
    panelSongArtist.textContent = track.artist;
    likeBtn.classList.toggle('liked', !!track.liked);
    likeBtn.textContent = track.liked ? '♥' : '♡';
  }

  function togglePlayPause() {
    if (currentTrackId === null) {
      if (tracks.length > 0) playTrackById(tracks[0].id);
      return;
    }
    if (audioPlayer.paused) audioPlayer.play().catch(() => {});
    else audioPlayer.pause();
  }

  playPauseBtn.addEventListener('click', togglePlayPause);
  playPlaylistBtn.addEventListener('click', togglePlayPause);

  audioPlayer.addEventListener('play', () => {
    playPauseBtn.textContent = '⏸';
    playPlaylistBtn.textContent = '⏸';
    renderTracks();
  });

  audioPlayer.addEventListener('pause', () => {
    playPauseBtn.textContent = '▶';
    playPlaylistBtn.textContent = '▶';
    renderTracks();
  });

  audioPlayer.addEventListener('loadedmetadata', () => {
    durationTimeEl.textContent = formatTime(audioPlayer.duration);
    seekSlider.value = 0;
    const track = trackById(currentTrackId);
    if (track) {
      track.duration = audioPlayer.duration;
      persistTrack(track);
      renderTracks();
    }
  });

  audioPlayer.addEventListener('timeupdate', () => {
    if (audioPlayer.duration) seekSlider.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  });

  audioPlayer.addEventListener('ended', () => {
    if (isLooping) {
      audioPlayer.currentTime = 0;
      audioPlayer.play().catch(() => {});
    } else {
      playNext();
    }
  });

  function playNext() {
    if (tracks.length === 0) return;
    const idx = indexById(currentTrackId);
    playTrackById(tracks[(idx + 1) % tracks.length].id);
  }

  function playPrev() {
    if (tracks.length === 0) return;
    if (audioPlayer.currentTime > 3) { audioPlayer.currentTime = 0; return; }
    const idx = indexById(currentTrackId);
    playTrackById(tracks[(idx - 1 + tracks.length) % tracks.length].id);
  }

  nextBtn.addEventListener('click', playNext);
  prevBtn.addEventListener('click', playPrev);

  loopBtn.addEventListener('click', () => {
    isLooping = !isLooping;
    loopBtn.classList.toggle('loop-active', isLooping);
  });

  seekSlider.addEventListener('input', () => {
    if (audioPlayer.duration) audioPlayer.currentTime = (seekSlider.value / 100) * audioPlayer.duration;
  });

  volumeSlider.addEventListener('input', () => {
    audioPlayer.volume = volumeSlider.value / 100;
    isMuted = Number(volumeSlider.value) === 0;
    volumeToggle.textContent = isMuted ? '🔇' : (volumeSlider.value < 50 ? '🔉' : '🔊');
  });

  volumeToggle.addEventListener('click', () => {
    if (isMuted) {
      volumeSlider.value = lastVolume || 70;
      audioPlayer.volume = (lastVolume || 70) / 100;
      isMuted = false;
    } else {
      lastVolume = volumeSlider.value;
      volumeSlider.value = 0;
      audioPlayer.volume = 0;
      isMuted = true;
    }
    volumeToggle.textContent = isMuted ? '🔇' : (volumeSlider.value < 50 ? '🔉' : '🔊');
  });

  audioPlayer.volume = volumeSlider.value / 100;

  likeBtn.addEventListener('click', () => {
    const track = trackById(currentTrackId);
    if (!track) return;
    track.liked = !track.liked;
    likeBtn.classList.toggle('liked', track.liked);
    likeBtn.textContent = track.liked ? '♥' : '♡';
    persistTrack(track);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      addFiles(e.target.files);
      fileInput.value = '';
    }
  });

  const dropZone = document.querySelector('.main-content');
  ['dragover', 'drop'].forEach((evt) => dropZone.addEventListener(evt, (e) => e.preventDefault()));
  dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('audio/'));
    if (files.length) addFiles(files);
  });

  // ---------- Playlist cover image (persisted too) ----------

  function applyPlaylistImage(url) {
    playlistImageContainer.style.backgroundImage = `url(${url})`;
    playlistImageContainer.querySelector('.playlist-image-placeholder')?.remove();
    modalImagePreview.style.backgroundImage = `url(${url})`;
    modalImagePreview.querySelector('.playlist-image-placeholder')?.remove();
    playerCover.style.backgroundImage = `url(${url})`;
    panelCover.style.backgroundImage = `url(${url})`;
  }

  async function setPlaylistImage(file) {
    applyPlaylistImage(URL.createObjectURL(file));
    const meta = (await dbGetMeta()) || {};
    dbSaveMeta({
      title: meta.title || playlistTitleEl.textContent,
      description: meta.description || playlistDescTextarea.value,
      imageBlob: file
    });
  }

  playlistImageContainer.addEventListener('click', () => playlistImageInput.click());
  playlistImageInput.addEventListener('change', (e) => { if (e.target.files[0]) setPlaylistImage(e.target.files[0]); });

  modalImagePreview.addEventListener('click', () => modalImageInput.click());
  modalImageInput.addEventListener('change', (e) => { if (e.target.files[0]) setPlaylistImage(e.target.files[0]); });

  // ---------- Details modal ----------

  nameDetailsBtn.addEventListener('click', () => {
    playlistNameInput.value = playlistTitleEl.textContent;
    detailsModal.classList.remove('hidden');
  });
  closeModalBtn.addEventListener('click', () => detailsModal.classList.add('hidden'));
  detailsModal.addEventListener('click', (e) => { if (e.target === detailsModal) detailsModal.classList.add('hidden'); });
  saveModalBtn.addEventListener('click', async () => {
    const name = playlistNameInput.value.trim() || 'Liked Songs';
    const description = playlistDescTextarea.value.trim();
    playlistTitleEl.textContent = name;
    const activeNav = document.querySelector('.nav-item.active .nav-item-title');
    if (activeNav) activeNav.textContent = name;
    detailsModal.classList.add('hidden');
    const meta = (await dbGetMeta()) || {};
    dbSaveMeta({ title: name, description, imageBlob: meta.imageBlob || null });
  });

  // ---------- Create playlist button ----------

  const sidebarItems = document.getElementById('sidebarItems');
  let playlistCount = 1;
  createPlaylistBtn.addEventListener('click', () => {
    playlistCount += 1;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.playlist = `playlist-${playlistCount}`;
    btn.innerHTML = `
      <span class="nav-item-icon">♪</span>
      <span class="nav-item-text">
        <span class="nav-item-title">My Playlist #${playlistCount - 1}</span>
        <span class="nav-item-sub">Playlist</span>
      </span>
    `;
    btn.addEventListener('click', () => {
      sidebarItems.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      playlistTitleEl.textContent = btn.querySelector('.nav-item-title').textContent;
    });
    sidebarItems.appendChild(btn);
    btn.click();
  });

  document.querySelector('.nav-item[data-playlist="liked-songs"]').addEventListener('click', function () {
    sidebarItems.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    this.classList.add('active');
    playlistTitleEl.textContent = this.querySelector('.nav-item-title').textContent;
  });

  // ---------- Search field (native-style: leading icon menu,
  // trailing clear button, recent-searches dropdown) ----------

  const headerSearch = document.getElementById('headerSearch');
  const searchIconBtn = document.getElementById('searchIconBtn');
  const searchClearBtn = document.getElementById('searchClearBtn');
  const searchRecentsMenu = document.getElementById('searchRecentsMenu');
  const searchRecentsList = document.getElementById('searchRecentsList');
  const searchClearRecentsBtn = document.getElementById('searchClearRecentsBtn');

  const RECENTS_KEY = 'sabaijaiMusic.recentSearches';
  const MAX_RECENTS = 10;

  function loadRecents() {
    try {
      return JSON.parse(localStorage.getItem(RECENTS_KEY)) || [];
    } catch (err) {
      return [];
    }
  }

  function saveRecents(list) {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch (err) { /* storage unavailable — ignore */ }
  }

  function addRecent(term) {
    const trimmed = term.trim();
    if (!trimmed) return;
    let list = loadRecents().filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    list.unshift(trimmed);
    if (list.length > MAX_RECENTS) list = list.slice(0, MAX_RECENTS);
    saveRecents(list);
  }

  function removeRecent(term) {
    saveRecents(loadRecents().filter((t) => t !== term));
    renderRecents();
  }

  function renderRecents() {
    const list = loadRecents();
    if (list.length === 0) {
      searchRecentsList.innerHTML = '<li class="search-recents-empty">No Recent Searches</li>';
      return;
    }
    searchRecentsList.innerHTML = list.map((term) => `
      <li class="search-recents-item" data-term="${escapeHtml(term)}">
        <svg class="recents-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <span class="recents-text">${escapeHtml(term)}</span>
        <button class="recents-remove" data-term="${escapeHtml(term)}" title="Remove" type="button">✕</button>
      </li>
    `).join('');

    searchRecentsList.querySelectorAll('.search-recents-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.recents-remove')) return;
        applySearch(item.dataset.term);
        closeRecentsMenu();
      });
    });
    searchRecentsList.querySelectorAll('.recents-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeRecent(btn.dataset.term);
      });
    });
  }

  function openRecentsMenu() {
    renderRecents();
    searchRecentsMenu.classList.remove('hidden');
    searchIconBtn.setAttribute('aria-expanded', 'true');
  }

  function closeRecentsMenu() {
    searchRecentsMenu.classList.add('hidden');
    searchIconBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleRecentsMenu() {
    if (searchRecentsMenu.classList.contains('hidden')) openRecentsMenu();
    else closeRecentsMenu();
  }

  function filterTracks(q) {
    const query = q.trim().toLowerCase();
    document.querySelectorAll('.track-row').forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
    });
  }

  function applySearch(term) {
    searchInput.value = term;
    searchInput.focus();
    updateClearButton();
    filterTracks(term);
    addRecent(term);
  }

  function updateClearButton() {
    searchClearBtn.classList.toggle('hidden', searchInput.value.length === 0);
  }

  searchInput.addEventListener('input', () => {
    updateClearButton();
    filterTracks(searchInput.value);
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.length === 0) openRecentsMenu();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addRecent(searchInput.value);
      closeRecentsMenu();
    } else if (e.key === 'Escape') {
      if (searchInput.value) {
        searchInput.value = '';
        updateClearButton();
        filterTracks('');
      }
      closeRecentsMenu();
    }
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    updateClearButton();
    filterTracks('');
    searchInput.focus();
    openRecentsMenu();
  });

  searchIconBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRecentsMenu();
    searchInput.focus();
  });

  searchClearRecentsBtn.addEventListener('click', () => {
    saveRecents([]);
    renderRecents();
  });

  document.addEventListener('click', (e) => {
    if (!headerSearch.contains(e.target)) closeRecentsMenu();
  });

  updateClearButton();

  // ---------- Boot ----------

  async function init() {
    renderTracks();
    renderQueue();
    await loadTracksFromDB();

    const meta = await dbGetMeta();
    if (meta) {
      if (meta.title) {
        playlistTitleEl.textContent = meta.title;
        const activeNav = document.querySelector('.nav-item.active .nav-item-title');
        if (activeNav) activeNav.textContent = meta.title;
      }
      if (meta.description) playlistDescTextarea.value = meta.description;
      if (meta.imageBlob) applyPlaylistImage(URL.createObjectURL(meta.imageBlob));
    }
  }

  init();
})();