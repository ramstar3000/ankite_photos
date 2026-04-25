// CONFIG is loaded from config.js

// AWS Setup
AWS.config.region = CONFIG.REGION;
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: CONFIG.IDENTITY_POOL_ID,
});
var s3 = new AWS.S3({ apiVersion: "2006-03-01" });

// State
var currentIndex = -1;

// DOM
var photoGrid = document.getElementById("photo-grid");
var emptyState = document.getElementById("empty-state");
var viewerCount = document.getElementById("viewer-count");
var lightbox = document.getElementById("lightbox");
var lightboxImg = document.getElementById("lightbox-img");
var lightboxName = document.getElementById("lightbox-name");
var lightboxMeta = document.getElementById("lightbox-meta");
var lightboxClose = document.getElementById("lightbox-close");
var lightboxPrev = document.getElementById("lightbox-prev");
var lightboxNext = document.getElementById("lightbox-next");

// History helpers
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("photo_uploads") || "[]");
  } catch (e) {
    return [];
  }
}

function removeFromHistory(key) {
  var history = getHistory();
  var filtered = history.filter(function(entry) { return entry.key !== key; });
  if (filtered.length !== history.length) {
    localStorage.setItem("photo_uploads", JSON.stringify(filtered));
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

function getSignedUrl(key) {
  return s3.getSignedUrl("getObject", {
    Bucket: CONFIG.BUCKET,
    Key: key,
    Expires: 3600,
  });
}

// Render grid
function renderGrid() {
  var history = getHistory();

  if (history.length === 0) {
    emptyState.classList.remove("hidden");
    photoGrid.innerHTML = "";
    viewerCount.textContent = "";
    return;
  }

  emptyState.classList.add("hidden");
  viewerCount.textContent = history.length + " photo" + (history.length !== 1 ? "s" : "") + " from this device";

  photoGrid.innerHTML = "";
  history.forEach(function(entry, i) {
    var tile = document.createElement("div");
    tile.className = "photo-tile";

    var fileName = entry.name || "";
    var isVideo = fileName.toLowerCase().match(/\.(mp4|mov|webm|avi)$/);

    if (isVideo) {
      var placeholder = document.createElement("div");
      placeholder.className = "tile-loading";
      placeholder.textContent = "\uD83C\uDFAC";
      placeholder.style.fontSize = "1.5rem";
      tile.appendChild(placeholder);

      var badge = document.createElement("div");
      badge.className = "video-badge";
      badge.textContent = "VIDEO";
      tile.appendChild(badge);
    } else {
      var loading = document.createElement("div");
      loading.className = "tile-loading";
      loading.textContent = "Loading...";
      tile.appendChild(loading);

      var img = document.createElement("img");
      img.alt = entry.name;
      img.loading = "lazy";
      img.style.opacity = "0";
      img.style.transition = "opacity 0.3s";
      tile.appendChild(img);

      (function(imgEl, loadingEl, key) {
        var url = getSignedUrl(key);
        imgEl.onload = function() {
          imgEl.style.opacity = "1";
          if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        };
        imgEl.onerror = function() {
          removeFromHistory(key);
          renderGrid();
        };
        imgEl.src = url;
      })(img, loading, entry.key);
    }

    tile.addEventListener("click", (function(idx) {
      return function() { openLightbox(idx); };
    })(i));

    photoGrid.appendChild(tile);
  });
}

// Lightbox
function openLightbox(index) {
  var history = getHistory();
  if (index < 0 || index >= history.length) return;

  currentIndex = index;
  var entry = history[index];

  lightboxImg.src = getSignedUrl(entry.key);
  lightboxName.textContent = entry.name;

  var metaParts = [];
  if (entry.size) metaParts.push(formatSize(entry.size));
  if (entry.uploadedAt) metaParts.push(formatDate(new Date(entry.uploadedAt)));
  lightboxMeta.textContent = metaParts.join(" \u00B7 ");

  lightboxPrev.style.display = index > 0 ? "" : "none";
  lightboxNext.style.display = index < history.length - 1 ? "" : "none";

  lightbox.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  document.body.style.overflow = "";
  lightboxImg.src = "";
  currentIndex = -1;
}

lightboxClose.addEventListener("click", closeLightbox);

lightbox.addEventListener("click", function(e) {
  if (e.target === lightbox || e.target.id === "lightbox-content") {
    closeLightbox();
  }
});

lightboxPrev.addEventListener("click", function(e) {
  e.stopPropagation();
  if (currentIndex > 0) openLightbox(currentIndex - 1);
});

lightboxNext.addEventListener("click", function(e) {
  e.stopPropagation();
  var history = getHistory();
  if (currentIndex < history.length - 1) openLightbox(currentIndex + 1);
});

document.addEventListener("keydown", function(e) {
  if (lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") lightboxPrev.click();
  if (e.key === "ArrowRight") lightboxNext.click();
});

// Init
AWS.config.credentials.get(function(err) {
  if (err) {
    console.error("Failed to get credentials:", err);
    viewerCount.textContent = "Failed to load credentials. Please refresh.";
    return;
  }
  renderGrid();
});
