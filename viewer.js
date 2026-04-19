// Shared config (must match app.js)
var CONFIG = {
  REGION: "us-east-1",
  IDENTITY_POOL_ID: "us-east-1:e9dce307-e5bc-4924-acf4-2f875452dbfc",
  BUCKET: "ankita-photos-upload",
};

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

    var isVideo = entry.name && (
      entry.name.toLowerCase().endsWith(".mp4") ||
      entry.name.toLowerCase().endsWith(".mov") ||
      entry.name.toLowerCase().endsWith(".webm")
    );

    if (isVideo) {
      // Show video placeholder
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
      // Show loading state
      var loading = document.createElement("div");
      loading.className = "tile-loading";
      loading.textContent = "Loading...";
      tile.appendChild(loading);

      // Load image via presigned URL
      var img = document.createElement("img");
      img.alt = entry.name;
      img.loading = "lazy";
      img.onload = function() {
        if (loading.parentNode) loading.parentNode.removeChild(loading);
      };
      img.onerror = function() {
        loading.textContent = "Failed";
      };
      img.src = getSignedUrl(entry.key);
      tile.appendChild(img);
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
  lightboxMeta.textContent = formatSize(entry.size) + " \u00B7 " + formatDate(new Date(entry.uploadedAt));

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

// Keyboard nav
document.addEventListener("keydown", function(e) {
  if (lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") lightboxPrev.click();
  if (e.key === "ArrowRight") lightboxNext.click();
});

// Init
renderGrid();
