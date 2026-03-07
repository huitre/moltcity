#!/usr/bin/env node
// ============================================
// Generate Advisor Avatars (Pixel Art)
// ============================================

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const ADVISOR_COLORS = {
  mayor: { skin: '#f4d4b8', hair: '#4a3728', suit: '#2c3e50', accent: '#e74c3c' },
  finance: { skin: '#e8c4a8', hair: '#6b6b6b', suit: '#1a252f', accent: '#f1c40f' },
  urban: { skin: '#f0d0b8', hair: '#8b4513', suit: '#27ae60', accent: '#3498db' },
  utilities: { skin: '#ddb896', hair: '#2c1810', suit: '#e67e22', accent: '#ecf0f1' },
  safety: { skin: '#d4a574', hair: '#1a1a1a', suit: '#34495e', accent: '#c0392b' },
  education: { skin: '#f5e0c8', hair: '#5c3317', suit: '#8e44ad', accent: '#f39c12' }
};

function darkenColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max((num >> 16) - amt, 0);
  const G = Math.max((num >> 8 & 0x00FF) - amt, 0);
  const B = Math.max((num & 0x0000FF) - amt, 0);
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function generateAdvisorAvatar(advisorId, size = 128) {
  const colors = ADVISOR_COLORS[advisorId];
  if (!colors) return null;
  
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  const px = size / 16;
  
  const drawPx = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * px, y * px, px, px);
  };
  
  // Clear with transparent background
  ctx.clearRect(0, 0, size, size);
  
  // Face shape
  const facePixels = [
    [6,3], [7,3], [8,3], [9,3],
    [5,4], [6,4], [7,4], [8,4], [9,4], [10,4],
    [4,5], [5,5], [6,5], [7,5], [8,5], [9,5], [10,5], [11,5],
    [4,6], [5,6], [6,6], [7,6], [8,6], [9,6], [10,6], [11,6],
    [4,7], [5,7], [6,7], [7,7], [8,7], [9,7], [10,7], [11,7],
    [4,8], [5,8], [6,8], [7,8], [8,8], [9,8], [10,8], [11,8],
    [5,9], [6,9], [7,9], [8,9], [9,9], [10,9],
    [6,10], [7,10], [8,10], [9,10],
  ];
  facePixels.forEach(([x, y]) => drawPx(x, y, colors.skin));
  
  // Hair styles
  const hairStyles = {
    mayor: [[5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [4,3], [5,3], [10,3], [11,3], [4,4], [11,4]],
    finance: [[6,2], [7,2], [8,2], [9,2], [5,3], [10,3]],
    urban: [[5,1], [6,1], [7,1], [8,1], [9,1], [10,1], [4,2], [5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [11,2], [4,3], [5,3], [10,3], [11,3], [3,4], [4,4], [11,4], [12,4]],
    utilities: [[5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [4,3], [5,3], [10,3], [11,3], [4,4], [4,5], [11,4], [11,5]],
    safety: [[5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [5,3], [10,3]],
    education: [[5,1], [6,1], [7,1], [8,1], [9,1], [10,1], [4,2], [5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [11,2], [3,3], [4,3], [5,3], [10,3], [11,3], [12,3], [3,4], [12,4], [3,5], [12,5], [3,6], [12,6]]
  };
  (hairStyles[advisorId] || hairStyles.mayor).forEach(([x, y]) => drawPx(x, y, colors.hair));
  
  // Eyes
  drawPx(6, 6, '#2c3e50');
  drawPx(9, 6, '#2c3e50');
  drawPx(6, 5, '#ffffff');
  drawPx(9, 5, '#ffffff');
  
  // Eyebrows
  drawPx(5, 5, colors.hair);
  drawPx(6, 4, colors.hair);
  drawPx(9, 4, colors.hair);
  drawPx(10, 5, colors.hair);
  
  // Nose
  drawPx(7, 7, darkenColor(colors.skin, 20));
  drawPx(8, 7, darkenColor(colors.skin, 20));
  drawPx(7, 8, darkenColor(colors.skin, 30));
  
  // Mouth
  drawPx(7, 9, '#c0392b');
  drawPx(8, 9, '#c0392b');
  
  // Suit
  const suitPixels = [
    [5,11], [6,11], [7,11], [8,11], [9,11], [10,11],
    [4,12], [5,12], [6,12], [7,12], [8,12], [9,12], [10,12], [11,12],
    [3,13], [4,13], [5,13], [6,13], [7,13], [8,13], [9,13], [10,13], [11,13], [12,13],
    [2,14], [3,14], [4,14], [5,14], [6,14], [7,14], [8,14], [9,14], [10,14], [11,14], [12,14], [13,14],
    [1,15], [2,15], [3,15], [4,15], [5,15], [6,15], [7,15], [8,15], [9,15], [10,15], [11,15], [12,15], [13,15], [14,15],
  ];
  suitPixels.forEach(([x, y]) => drawPx(x, y, colors.suit));
  
  // Tie/accent
  drawPx(7, 11, colors.accent);
  drawPx(8, 11, colors.accent);
  drawPx(7, 12, colors.accent);
  drawPx(8, 12, colors.accent);
  drawPx(7, 13, colors.accent);
  drawPx(8, 13, colors.accent);
  
  return canvas;
}

// Main
const outputDir = path.join(process.cwd(), 'client/assets/advisors');
fs.mkdirSync(outputDir, { recursive: true });

console.log('Generating advisor avatars...');

for (const advisorId of Object.keys(ADVISOR_COLORS)) {
  const canvas = generateAdvisorAvatar(advisorId, 128);
  const buffer = canvas.toBuffer('image/png');
  const filePath = path.join(outputDir, `${advisorId}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`✓ Generated ${filePath}`);
}

console.log('Done!');
