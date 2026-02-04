import { loadLogoForShare } from './share.js';

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export async function buildShareCard({
  gameName,
  logoPath,
  accent = '#f0c674',
  accentSoft = 'rgba(240, 198, 104, 0.12)',
  backgroundStart = '#0a0a0f',
  backgroundEnd = '#12121a',
  dateText,
  timeText,
  gridLabel,
  footerText
}) {
  const scale = 2;
  const width = 400;
  const height = 340;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, backgroundStart);
  gradient.addColorStop(1, backgroundEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let i = 0; i < width; i += 20) {
    for (let j = 0; j < height; j += 20) {
      ctx.fillRect(i, j, 1, 1);
    }
  }

  const glowGradient = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, 180);
  glowGradient.addColorStop(0, accentSoft);
  glowGradient.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, width, height);

  const logoImage = logoPath ? await loadLogoForShare(logoPath) : null;

  const titleY = 50;
  ctx.fillStyle = accent;
  ctx.font = 'bold 32px "Space Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';

  if (logoImage) {
    const textWidth = ctx.measureText(gameName).width;
    const logoSize = 34;
    const gap = 8;
    const totalWidth = logoSize + gap + textWidth;
    const startX = (width - totalWidth) / 2;

    ctx.drawImage(logoImage, startX, titleY - 26, logoSize, logoSize);

    ctx.textAlign = 'left';
    ctx.fillText(gameName, startX + logoSize + gap, titleY);
    ctx.textAlign = 'center';
  } else {
    ctx.fillText(gameName, width / 2, titleY);
  }

  ctx.fillStyle = '#71717a';
  ctx.font = '14px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText('Daily Grid Puzzle', width / 2, titleY + 24);

  ctx.fillStyle = hexToRgba(accent, 0.1);
  const badgeWidth = 160;
  const badgeHeight = 26;
  const badgeX = (width - badgeWidth) / 2;
  const badgeY = titleY + 38;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 13);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.25);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(dateText, width / 2, badgeY + 17);

  ctx.fillStyle = hexToRgba(accent, 0.08);
  const timeBoxWidth = 180;
  const timeBoxHeight = 85;
  const timeBoxX = (width - timeBoxWidth) / 2;
  const timeBoxY = badgeY + 38;
  ctx.beginPath();
  ctx.roundRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight, 14);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.15);
  ctx.stroke();

  ctx.fillStyle = hexToRgba(accent, 0.5);
  ctx.font = '10px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText('MY TIME', width / 2, timeBoxY + 22);

  ctx.fillStyle = accent;
  ctx.font = 'bold 38px "JetBrains Mono", monospace, system-ui';
  ctx.fillText(timeText, width / 2, timeBoxY + 58);

  ctx.fillStyle = '#52525b';
  ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(gridLabel, width / 2, timeBoxY + timeBoxHeight + 18);

  if (footerText) {
    ctx.fillStyle = hexToRgba(accent, 0.08);
    const footerY = height - 50;
    ctx.beginPath();
    ctx.roundRect(width / 2 - 120, footerY, 240, 32, 16);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(footerText, width / 2, footerY + 21);
  }

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], `${gameName.toLowerCase()}-result.png`, { type: 'image/png' });
}
