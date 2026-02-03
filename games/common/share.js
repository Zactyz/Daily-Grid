const logoCache = new Map();

export function buildShareText({ gameName, puzzleLabel, gridLabel, timeText, shareUrl }) {
  const parts = [
    `${gameName} by Daily Grid`,
    `${puzzleLabel} • ${gridLabel}`,
    `Time: ${timeText}`,
    '',
    shareUrl
  ];
  return parts.join('\n');
}

export function formatDateForShare(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export async function shareWithFallback({ shareText, shareTitle, shareUrl, shareFile, onCopy, onError }) {
  const shareData = {
    title: shareTitle,
    text: shareText,
    url: shareUrl
  };

  if (shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
    shareData.files = [shareFile];
  }

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.warn('Native share failed, falling back to clipboard', error);
    }
  }

  try {
    await navigator.clipboard.writeText(shareText);
    onCopy?.();
  } catch (clipboardError) {
    console.warn('Clipboard copy failed during share fallback', clipboardError);
    onError?.();
  }
}

export async function loadLogoForShare(logoPath) {
  if (!logoPath) return null;
  if (logoCache.has(logoPath)) {
    const cached = logoCache.get(logoPath);
    if (cached instanceof Promise) {
      return cached;
    }
    return Promise.resolve(cached);
  }

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      logoCache.set(logoPath, img);
      resolve(img);
    };
    img.onerror = () => {
      logoCache.set(logoPath, null);
      resolve(null);
    };
    img.src = logoPath;
  });

  logoCache.set(logoPath, promise);
  return promise;
}

export function showShareFeedback(button, message, { durationMs = 2000 } = {}) {
  if (!button) return;

  const originalHTML = button.innerHTML;
  button.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
    </svg>
    ${message}
  `;
  button.disabled = true;

  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.disabled = false;
  }, durationMs);
}
