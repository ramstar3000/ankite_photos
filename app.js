import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { CognitoIdentityClient } from "@aws-sdk/client-cognito-identity";

// ===== CONFIGURATION — edit these values =====
const CONFIG = {
  REGION: "us-east-1",
  IDENTITY_POOL_ID: "us-east-1:e9dce307-e5bc-4924-acf4-2f875452dbfc",
  BUCKET: "ankita-photos-upload",
  PREFIX: "uploads/",
  PASSWORD: "photos2026",
  MAX_FILE_SIZE_MB: 50,
};

// ===== State =====
let selectedFiles = [];
let s3Client = null;
let toastTimer = null;

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const passwordSection = $("password-section");
const passwordForm = $("password-form");
const passwordInput = $("password-input");
const passwordError = $("password-error");
const uploadSection = $("upload-section");
const dropZone = $("drop-zone");
const fileInput = $("file-input");
const cameraInput = $("camera-input");
const chooseBtn = $("choose-btn");
const cameraBtn = $("camera-btn");
const uploadQueue = $("upload-queue");
const uploadBtn = $("upload-btn");
const toast = $("toast");
const historySection = $("history-section");
const historyCount = $("history-count");
const historyList = $("history-list");
const clearHistoryBtn = $("clear-history-btn");

// ===== Toast Notifications =====
function showToast(message, type = "success", duration = 4000) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = type;
  toastTimer = setTimeout(() => { toast.className = "hidden"; }, duration);
}

// ===== S3 Client (lazy init) =====
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: CONFIG.REGION,
      credentials: fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region: CONFIG.REGION }),
        identityPoolId: CONFIG.IDENTITY_POOL_ID,
      }),
    });
  }
  return s3Client;
}

// ===== Password Gate =====
function checkSession() {
  if (sessionStorage.getItem("photo_auth") === "true") {
    showUploadSection();
  }
}

passwordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (passwordInput.value === CONFIG.PASSWORD) {
    sessionStorage.setItem("photo_auth", "true");
    showUploadSection();
  } else {
    passwordError.classList.remove("hidden");
    passwordForm.classList.add("shake");
    setTimeout(() => passwordForm.classList.remove("shake"), 400);
    passwordInput.value = "";
    passwordInput.focus();
  }
});

function showUploadSection() {
  passwordSection.classList.add("hidden");
  uploadSection.classList.remove("hidden");
}

// ===== File Selection =====
dropZone.addEventListener("click", () => fileInput.click());
chooseBtn.addEventListener("click", () => fileInput.click());
cameraBtn.addEventListener("click", () => cameraInput.click());

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

cameraInput.addEventListener("change", () => {
  addFiles(cameraInput.files);
  cameraInput.value = "";
});

// Drag and drop
dropZone.addEventListener("dragenter", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  addFiles(e.dataTransfer.files);
});

function addFiles(fileList) {
  let skipped = 0;
  for (const file of fileList) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      skipped++;
      continue;
    }
    if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(`"${file.name}" exceeds ${CONFIG.MAX_FILE_SIZE_MB} MB limit`, "warn", 5000);
      continue;
    }
    if (selectedFiles.some((f) => f.name === file.name && f.size === file.size)) continue;
    selectedFiles.push(file);
  }
  if (skipped > 0) {
    showToast(`${skipped} file${skipped > 1 ? "s" : ""} skipped (unsupported format)`, "warn");
  }
  renderQueue();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderQueue();
}

function renderQueue() {
  uploadQueue.innerHTML = "";
  selectedFiles.forEach((file, i) => {
    const card = document.createElement("div");
    card.className = "file-card";
    card.dataset.index = i;

    const thumb = document.createElement(file.type.startsWith("video/") ? "div" : "img");
    thumb.className = "thumb";
    if (file.type.startsWith("image/")) {
      thumb.src = URL.createObjectURL(file);
      thumb.alt = file.name;
    } else {
      thumb.textContent = "\uD83C\uDFAC";
      thumb.style.display = "flex";
      thumb.style.alignItems = "center";
      thumb.style.justifyContent = "center";
      thumb.style.fontSize = "1.5rem";
    }

    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `<div class="name">${escapeHtml(file.name)}</div><div class="size">${formatSize(file.size)}</div>`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove";
    removeBtn.textContent = "\u00D7";
    removeBtn.addEventListener("click", (e) => { e.stopPropagation(); removeFile(i); });

    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    progressBar.style.width = "0%";

    card.append(thumb, info, removeBtn, progressBar);
    uploadQueue.appendChild(card);
  });

  if (selectedFiles.length > 0) {
    uploadBtn.textContent = `Upload ${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""}`;
    uploadBtn.classList.remove("hidden");
  } else {
    uploadBtn.classList.add("hidden");
  }
}

// ===== Upload =====
uploadBtn.addEventListener("click", () => uploadAll());

async function uploadAll() {
  const files = [...selectedFiles];
  if (files.length === 0) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading...";

  // Hide remove buttons during upload
  document.querySelectorAll(".file-card .remove").forEach((b) => (b.style.display = "none"));

  const MAX_CONCURRENT = 3;
  const queue = files.map((f, i) => ({ file: f, index: i }));
  let successCount = 0;
  let errorCount = 0;

  const workers = Array(Math.min(MAX_CONCURRENT, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const { file, index } = queue.shift();
        const card = uploadQueue.children[index];
        card.classList.add("uploading");
        card.querySelector(".progress-bar").style.width = "60%";

        try {
          await uploadFile(file);
          card.classList.remove("uploading");
          card.classList.add("done");
          const icon = document.createElement("span");
          icon.className = "status-icon";
          icon.textContent = "\u2713";
          icon.style.color = "var(--success)";
          card.querySelector(".remove")?.replaceWith(icon);
          successCount++;
        } catch (err) {
          card.classList.remove("uploading");
          card.classList.add("error");
          const icon = document.createElement("span");
          icon.className = "status-icon";
          icon.textContent = "\u2717";
          icon.style.color = "var(--error)";
          card.querySelector(".remove")?.replaceWith(icon);
          console.error(`Upload failed for ${file.name}:`, err);
          errorCount++;
        }
      }
    });

  await Promise.all(workers);

  if (errorCount === 0) {
    showToast(`${successCount} file${successCount > 1 ? "s" : ""} uploaded successfully!`, "success", 5000);
    selectedFiles = [];
    // Clear queue after a short delay so user sees the green checkmarks
    setTimeout(() => {
      uploadQueue.innerHTML = "";
      uploadBtn.classList.add("hidden");
      uploadBtn.disabled = false;
    }, 2000);
  } else {
    showToast(`${successCount} uploaded, ${errorCount} failed. Please try again.`, "fail", 8000);
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Retry failed";
  }
}

async function uploadFile(file) {
  const key = CONFIG.PREFIX + Date.now() + "-" + sanitizeFilename(file.name);
  const command = new PutObjectCommand({
    Bucket: CONFIG.BUCKET,
    Key: key,
    Body: file,
    ContentType: file.type,
  });
  await getS3Client().send(command);
  saveToHistory({ name: file.name, size: file.size, key, uploadedAt: new Date().toISOString() });
}

// ===== Upload History (localStorage) =====
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("photo_uploads") || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  const history = getHistory();
  history.unshift(entry);
  localStorage.setItem("photo_uploads", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  if (history.length === 0) {
    historySection.classList.add("hidden");
    return;
  }

  historySection.classList.remove("hidden");
  historyCount.textContent = `${history.length}`;

  historyList.innerHTML = "";
  history.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const info = document.createElement("div");
    info.className = "history-info";
    const date = new Date(entry.uploadedAt);
    info.innerHTML = `<span class="history-name">${escapeHtml(entry.name)}</span><span class="history-meta">${formatSize(entry.size)} \u00B7 ${formatDate(date)}</span>`;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "history-delete";
    deleteBtn.textContent = "Remove";
    deleteBtn.addEventListener("click", () => deleteUpload(i, entry.key));

    row.append(info, deleteBtn);
    historyList.appendChild(row);
  });

  clearHistoryBtn.classList.toggle("hidden", history.length < 2);
}

async function deleteUpload(index, key) {
  const row = historyList.children[index];
  const btn = row.querySelector(".history-delete");
  btn.textContent = "Removing...";
  btn.disabled = true;

  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: CONFIG.BUCKET, Key: key }));
  } catch (err) {
    console.warn("S3 delete failed (file may already be gone):", err);
  }

  const history = getHistory();
  history.splice(index, 1);
  localStorage.setItem("photo_uploads", JSON.stringify(history));
  renderHistory();
  showToast("File removed", "success", 3000);
}

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem("photo_uploads");
  renderHistory();
});

// ===== Helpers =====
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===== Init =====
checkSession();
renderHistory();
