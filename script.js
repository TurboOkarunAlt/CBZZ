const DB_NAME = 'cbzReaderDB';
const DB_VERSION = 1;
const STORE_NAME = 'comics';

let db = null;
let currentComic = null;
let currentPageIndex = 0;
let allComics = [];
let zoomLevel = 100;
let fitMode = 'contain';
let readingDirection = 'ltr';
let readingFilter = 'normal';
let spreadMode = false;
let autoplayInterval = null;
let autoplaySpeed = 5000;

const libraryView = document.getElementById('library-view');
const readerView = document.getElementById('reader-view');
const libraryGrid = document.getElementById('library');
const emptyLibrary = document.getElementById('empty-library');
const cbzInput = document.getElementById('cbz-input');
const exportBtn = document.getElementById('export-btn');
const importInput = document.getElementById('import-input');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const backBtn = document.getElementById('back-btn');
const deleteBtn = document.getElementById('delete-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageIndicator = document.getElementById('page-indicator');
const pageSlider = document.getElementById('page-slider');
const currentPageImg = document.getElementById('current-page');
const loadingOverlay = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const comicTitleDisplay = document.getElementById('comic-title-display');
const progressFill = document.getElementById('progress-fill');
const fitBtn = document.getElementById('fit-btn');
const directionBtn = document.getElementById('direction-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const zoomLevelDisplay = document.getElementById('zoom-level');
const readerContainer = document.getElementById('reader-container');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelp = document.getElementById('close-help');
const filterBtn = document.getElementById('filter-btn');
const statsBar = document.getElementById('stats-bar');
const continueSection = document.getElementById('continue-section');
const continueCard = document.getElementById('continue-card');
const randomBtn = document.getElementById('random-btn');
const favoriteBtn = document.getElementById('favorite-btn');
const spreadBtn = document.getElementById('spread-btn');
const autoplayBtn = document.getElementById('autoplay-btn');
const secondPageImg = document.getElementById('second-page');

async function initDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('IndexedDB initialized');
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function getAllComics() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (err) {
      resolve([]);
    }
  });
}

async function saveComic(comic) {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(comic);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function deleteComic(id) {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function parseCBZ(file, onProgress) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip library not loaded');
  }

  const zip = await JSZip.loadAsync(file);

  const allFiles = Object.keys(zip.files);
  const imageFiles = allFiles
    .filter(name => !zip.files[name].dir)
    .filter(name => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (imageFiles.length === 0) {
    throw new Error('No images found in CBZ file');
  }

  const pages = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i];
    try {
      const base64 = await zip.files[filename].async('base64');
      const ext = filename.split('.').pop().toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'webp') mimeType = 'image/webp';

      pages.push(`data:${mimeType};base64,${base64}`);
      if (onProgress) onProgress(i + 1, imageFiles.length);
    } catch (err) {
      console.error('Failed to extract:', filename);
    }
  }

  if (pages.length === 0) {
    throw new Error('Failed to extract images');
  }

  return pages;
}

async function handleFileUpload(files) {
  for (const file of files) {
    showLoading(`Loading ${file.name}...`);

    try {
      const pages = await parseCBZ(file, (current, total) => {
        loadingText.textContent = `Extracting page ${current}/${total}...`;
      });

      const title = file.name.replace(/\.cbz$/i, '');
      const id = Date.now().toString() + Math.random().toString(36).slice(2);

      const comic = {
        id,
        title,
        cover: pages[0],
        pages,
        lastRead: 0,
        totalPages: pages.length,
        addedAt: new Date().toISOString()
      };

      await saveComic(comic);
    } catch (err) {
      alert('Failed to load ' + file.name + ': ' + err.message);
    }
  }

  await loadLibrary();
  hideLoading();
}

function renderComicCard(comic) {
  const card = document.createElement('div');
  card.className = 'comic-card';

  const cover = document.createElement('img');
  cover.className = 'comic-cover';
  cover.src = comic.cover;
  cover.alt = comic.title;
  cover.loading = 'lazy';

  const title = document.createElement('div');
  title.className = 'comic-title';
  title.textContent = comic.title;

  const progress = document.createElement('div');
  progress.className = 'comic-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'comic-progress-fill';
  const percent = comic.totalPages > 1 ? (comic.lastRead / (comic.totalPages - 1)) * 100 : 0;
  progressBar.style.width = percent + '%';
  progress.appendChild(progressBar);

  if (comic.favorite) {
    const favBadge = document.createElement('div');
    favBadge.className = 'favorite-badge';
    favBadge.textContent = '\u2605';
    card.appendChild(favBadge);
  }

  card.appendChild(cover);
  card.appendChild(progress);
  card.appendChild(title);
  card.addEventListener('click', () => openReader(comic));
  return card;
}

async function loadLibrary() {
  allComics = await getAllComics();
  updateStats();
  renderContinueReading();
  renderLibrary();
}

function updateStats() {
  if (allComics.length === 0) {
    statsBar.classList.add('hidden');
    return;
  }
  
  statsBar.classList.remove('hidden');
  
  const totalComics = allComics.length;
  const totalPages = allComics.reduce((sum, c) => sum + (c.totalPages || 0), 0);
  const inProgress = allComics.filter(c => c.lastRead > 0 && c.lastRead < c.totalPages - 1).length;
  const completed = allComics.filter(c => c.totalPages > 1 && c.lastRead >= c.totalPages - 1).length;
  
  document.getElementById('stat-total').textContent = totalComics;
  document.getElementById('stat-pages').textContent = totalPages.toLocaleString();
  document.getElementById('stat-reading').textContent = inProgress;
  document.getElementById('stat-completed').textContent = completed;
}

function renderContinueReading() {
  const inProgress = allComics
    .filter(c => c.lastRead > 0 && c.lastRead < c.totalPages - 1)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  
  if (inProgress.length === 0) {
    continueSection.classList.add('hidden');
    return;
  }
  
  continueSection.classList.remove('hidden');
  const comic = inProgress[0];
  const percent = Math.round((comic.lastRead / (comic.totalPages - 1)) * 100);
  
  continueCard.innerHTML = `
    <img src="${comic.cover}" alt="${comic.title}" class="continue-cover">
    <div class="continue-info">
      <div class="continue-title">${comic.title}</div>
      <div class="continue-progress">
        <div class="continue-progress-bar">
          <div class="continue-progress-fill" style="width: ${percent}%"></div>
        </div>
        <span>${percent}% - Page ${comic.lastRead + 1} of ${comic.totalPages}</span>
      </div>
      <button class="continue-btn">Continue Reading</button>
    </div>
  `;
  
  continueCard.querySelector('.continue-btn').addEventListener('click', () => openReader(comic));
  continueCard.querySelector('.continue-cover').addEventListener('click', () => openReader(comic));
}

function renderLibrary() {
  const searchTerm = searchInput.value.toLowerCase();
  const sortBy = sortSelect.value;

  let filtered = allComics.filter(c =>
    c.title.toLowerCase().includes(searchTerm)
  );

  if (sortBy === 'recent') {
    filtered.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  } else if (sortBy === 'title') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'progress') {
    filtered.sort((a, b) => {
      const pa = a.totalPages > 1 ? a.lastRead / (a.totalPages - 1) : 0;
      const pb = b.totalPages > 1 ? b.lastRead / (b.totalPages - 1) : 0;
      return pb - pa;
    });
  } else if (sortBy === 'favorites') {
    filtered.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return new Date(b.addedAt) - new Date(a.addedAt);
    });
  }

  libraryGrid.innerHTML = '';

  if (filtered.length === 0) {
    emptyLibrary.style.display = 'flex';
    emptyLibrary.querySelector('p').textContent = searchTerm
      ? 'No comics match your search.'
      : 'No comics yet. Upload a CBZ file to get started!';
  } else {
    emptyLibrary.style.display = 'none';
    filtered.forEach(comic => {
      libraryGrid.appendChild(renderComicCard(comic));
    });
  }
}

function openReader(comic) {
  currentComic = comic;
  currentPageIndex = comic.lastRead || 0;
  zoomLevel = 100;
  fitMode = 'contain';
  spreadMode = false;
  stopAutoplay();

  pageSlider.max = comic.pages.length;
  pageSlider.value = currentPageIndex + 1;
  comicTitleDisplay.textContent = comic.title;

  updateFitMode();
  updateZoomDisplay();
  updateFavoriteBtn();
  updateSpreadMode();
  showPage(currentPageIndex);
  showView('reader');
}

function updateFavoriteBtn() {
  if (currentComic && currentComic.favorite) {
    favoriteBtn.textContent = '\u2605';
    favoriteBtn.classList.add('active');
  } else {
    favoriteBtn.textContent = '\u2606';
    favoriteBtn.classList.remove('active');
  }
}

async function toggleFavorite() {
  if (!currentComic) return;
  currentComic.favorite = !currentComic.favorite;
  await saveComic(currentComic);
  updateFavoriteBtn();
}

function pickRandomComic() {
  if (allComics.length === 0) {
    alert('No comics in library!');
    return;
  }
  const randomIndex = Math.floor(Math.random() * allComics.length);
  openReader(allComics[randomIndex]);
}

function toggleSpreadMode() {
  spreadMode = !spreadMode;
  updateSpreadMode();
  showPage(currentPageIndex);
}

function updateSpreadMode() {
  if (spreadMode) {
    spreadBtn.textContent = '2P';
    spreadBtn.classList.add('active');
    document.getElementById('page-display').classList.add('spread-mode');
  } else {
    spreadBtn.textContent = '1P';
    spreadBtn.classList.remove('active');
    document.getElementById('page-display').classList.remove('spread-mode');
    secondPageImg.classList.add('hidden');
  }
}

function startAutoplay() {
  if (autoplayInterval) return;
  autoplayInterval = setInterval(() => {
    if (currentComic && currentPageIndex < currentComic.pages.length - 1) {
      nextPage();
    } else {
      stopAutoplay();
    }
  }, autoplaySpeed);
  autoplayBtn.textContent = 'Stop';
  autoplayBtn.classList.add('active');
}

function stopAutoplay() {
  if (autoplayInterval) {
    clearInterval(autoplayInterval);
    autoplayInterval = null;
  }
  autoplayBtn.textContent = 'Play';
  autoplayBtn.classList.remove('active');
}

function toggleAutoplay() {
  if (autoplayInterval) {
    stopAutoplay();
  } else {
    startAutoplay();
  }
}

function showPage(index) {
  if (!currentComic) return;

  index = Math.max(0, Math.min(index, currentComic.pages.length - 1));
  currentPageIndex = index;

  currentPageImg.src = currentComic.pages[index];
  pageIndicator.textContent = `${index + 1} / ${currentComic.pages.length}`;
  pageSlider.value = index + 1;

  const percent = currentComic.pages.length > 1
    ? (index / (currentComic.pages.length - 1)) * 100
    : 100;
  progressFill.style.width = percent + '%';

  currentComic.lastRead = index;
  saveComic(currentComic).catch(() => {});
  
  currentPageImg.classList.remove('filter-sepia', 'filter-night', 'filter-warm');
  if (readingFilter === 'sepia') currentPageImg.classList.add('filter-sepia');
  else if (readingFilter === 'night') currentPageImg.classList.add('filter-night');
  else if (readingFilter === 'warm') currentPageImg.classList.add('filter-warm');
  
  if (spreadMode && index < currentComic.pages.length - 1) {
    secondPageImg.src = currentComic.pages[index + 1];
    secondPageImg.classList.remove('hidden');
    secondPageImg.classList.remove('filter-sepia', 'filter-night', 'filter-warm');
    if (readingFilter === 'sepia') secondPageImg.classList.add('filter-sepia');
    else if (readingFilter === 'night') secondPageImg.classList.add('filter-night');
    else if (readingFilter === 'warm') secondPageImg.classList.add('filter-warm');
    pageIndicator.textContent = `${index + 1}-${index + 2} / ${currentComic.pages.length}`;
  } else {
    secondPageImg.classList.add('hidden');
  }
}

function nextPage() {
  if (!currentComic) return;
  if (readingDirection === 'rtl') {
    if (currentPageIndex > 0) showPage(currentPageIndex - 1);
  } else {
    if (currentPageIndex < currentComic.pages.length - 1) showPage(currentPageIndex + 1);
  }
}

function prevPage() {
  if (!currentComic) return;
  if (readingDirection === 'rtl') {
    if (currentPageIndex < currentComic.pages.length - 1) showPage(currentPageIndex + 1);
  } else {
    if (currentPageIndex > 0) showPage(currentPageIndex - 1);
  }
}

function updateFitMode() {
  currentPageImg.classList.remove('fit-width', 'fit-height');
  if (fitMode === 'width') {
    currentPageImg.classList.add('fit-width');
    fitBtn.textContent = 'Width';
  } else if (fitMode === 'height') {
    currentPageImg.classList.add('fit-height');
    fitBtn.textContent = 'Height';
  } else {
    fitBtn.textContent = 'Fit';
  }
}

function cycleFitMode() {
  if (fitMode === 'contain') fitMode = 'width';
  else if (fitMode === 'width') fitMode = 'height';
  else fitMode = 'contain';
  updateFitMode();
}

function toggleDirection() {
  readingDirection = readingDirection === 'ltr' ? 'rtl' : 'ltr';
  directionBtn.textContent = readingDirection.toUpperCase();
  readerContainer.classList.toggle('rtl', readingDirection === 'rtl');
}

function cycleFilter() {
  const filters = ['normal', 'sepia', 'night', 'warm'];
  const currentIndex = filters.indexOf(readingFilter);
  readingFilter = filters[(currentIndex + 1) % filters.length];
  
  currentPageImg.classList.remove('filter-sepia', 'filter-night', 'filter-warm');
  
  if (readingFilter === 'sepia') {
    currentPageImg.classList.add('filter-sepia');
    filterBtn.textContent = 'Sepia';
  } else if (readingFilter === 'night') {
    currentPageImg.classList.add('filter-night');
    filterBtn.textContent = 'Night';
  } else if (readingFilter === 'warm') {
    currentPageImg.classList.add('filter-warm');
    filterBtn.textContent = 'Warm';
  } else {
    filterBtn.textContent = 'Normal';
  }
}

function openHelpModal() {
  helpModal.classList.remove('hidden');
}

function closeHelpModal() {
  helpModal.classList.add('hidden');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

function updateZoom(delta) {
  zoomLevel = Math.max(25, Math.min(300, zoomLevel + delta));
  currentPageImg.style.transform = `scale(${zoomLevel / 100})`;
  updateZoomDisplay();
}

function resetZoom() {
  zoomLevel = 100;
  currentPageImg.style.transform = 'scale(1)';
  updateZoomDisplay();
}

function updateZoomDisplay() {
  zoomLevelDisplay.textContent = zoomLevel + '%';
}

function showView(view) {
  if (view === 'library') {
    libraryView.classList.add('active');
    readerView.classList.remove('active');
    renderLibrary();
  } else {
    libraryView.classList.remove('active');
    readerView.classList.add('active');
  }
}

function showLoading(text = 'Loading...') {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

cbzInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    handleFileUpload(files);
    e.target.value = '';
  }
});

searchInput.addEventListener('input', renderLibrary);
sortSelect.addEventListener('change', renderLibrary);

async function exportLibrary() {
  showLoading('Preparing backup...');
  try {
    const comics = await getAllComics();
    if (comics.length === 0) {
      alert('No comics to export!');
      hideLoading();
      return;
    }
    
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      comics: comics
    };
    
    const json = JSON.stringify(backup);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbzz-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    hideLoading();
  } catch (err) {
    hideLoading();
    alert('Export failed: ' + err.message);
  }
}

async function importLibrary(file) {
  showLoading('Restoring backup...');
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    
    if (!backup.comics || !Array.isArray(backup.comics)) {
      throw new Error('Invalid backup file format');
    }
    
    let imported = 0;
    let skipped = 0;
    const existingComics = await getAllComics();
    const existingIds = new Set(existingComics.map(c => c.id));
    
    for (const comic of backup.comics) {
      loadingText.textContent = `Importing ${imported + 1}/${backup.comics.length}...`;
      
      if (!comic.id || !comic.title || !comic.pages) {
        skipped++;
        continue;
      }
      
      if (existingIds.has(comic.id)) {
        skipped++;
        continue;
      }
      
      await saveComic(comic);
      imported++;
    }
    
    await loadLibrary();
    hideLoading();
    alert(`Imported ${imported} comics. ${skipped > 0 ? `Skipped ${skipped} (duplicates or invalid).` : ''}`);
  } catch (err) {
    hideLoading();
    alert('Import failed: ' + err.message);
  }
}

exportBtn.addEventListener('click', exportLibrary);

importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    importLibrary(file);
    e.target.value = '';
  }
});

backBtn.addEventListener('click', async () => {
  showView('library');
  currentComic = null;
  resetZoom();
  readingFilter = 'normal';
  filterBtn.textContent = 'Normal';
  await loadLibrary();
});

deleteBtn.addEventListener('click', async () => {
  if (!currentComic) return;
  if (confirm(`Delete "${currentComic.title}"?`)) {
    await deleteComic(currentComic.id);
    showView('library');
    currentComic = null;
    await loadLibrary();
  }
});

prevBtn.addEventListener('click', prevPage);
nextBtn.addEventListener('click', nextPage);

pageSlider.addEventListener('input', (e) => {
  showPage(parseInt(e.target.value) - 1);
});

fitBtn.addEventListener('click', cycleFitMode);
directionBtn.addEventListener('click', toggleDirection);
filterBtn.addEventListener('click', cycleFilter);
fullscreenBtn.addEventListener('click', toggleFullscreen);

helpBtn.addEventListener('click', openHelpModal);
closeHelp.addEventListener('click', closeHelpModal);
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) closeHelpModal();
});

randomBtn.addEventListener('click', pickRandomComic);
favoriteBtn.addEventListener('click', toggleFavorite);
spreadBtn.addEventListener('click', toggleSpreadMode);
autoplayBtn.addEventListener('click', toggleAutoplay);

zoomInBtn.addEventListener('click', () => updateZoom(25));
zoomOutBtn.addEventListener('click', () => updateZoom(-25));
zoomResetBtn.addEventListener('click', resetZoom);

document.addEventListener('keydown', (e) => {
  if (!currentComic) return;

  if (e.key === 'ArrowLeft') {
    prevPage();
  } else if (e.key === 'ArrowRight') {
    nextPage();
  } else if (e.key === 'Escape') {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      showView('library');
    }
  } else if (e.key === 'f') {
    toggleFullscreen();
  } else if (e.key === '+' || e.key === '=') {
    updateZoom(25);
  } else if (e.key === '-') {
    updateZoom(-25);
  } else if (e.key === '0') {
    resetZoom();
  } else if (e.key === ' ' && !e.repeat) {
    e.preventDefault();
    e.stopPropagation();
    nextPage();
  } else if (e.key === 'd' || e.key === 'D') {
    toggleSpreadMode();
  } else if (e.key === 'p' || e.key === 'P') {
    toggleAutoplay();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) {
    closeHelpModal();
  }
});

readerContainer.addEventListener('click', (e) => {
  if (e.target === readerContainer || e.target === document.getElementById('page-display')) {
    const rect = readerContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width / 2) {
      prevPage();
    } else {
      nextPage();
    }
  }
});

async function init() {
  try {
    await initDB();
    await loadLibrary();
    console.log('App initialized');
  } catch (err) {
    console.error('Init failed:', err);
    alert('Failed to initialize: ' + err.message);
  }
}

init();
