// For typeScript to be happy
declare global {
  interface CanvasRenderingContext2D {
    drawLight(x: number, y: number, radius: number, color: string, step?: number): void;
    drawRoundedRect(x: number, y: number, width: number, height: number, radius: number, colorTop: string, colorBottom: string, strokeColor?: string | null, gradientType?: string, topRadius?: number): void;
    drawCircle(x: number, y: number, radius: number, color: string): void;
  }
}

CanvasRenderingContext2D.prototype.drawLight = function (this: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, step: number = 0) {
  const gradient = this.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(step, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)'); // fade to transparent

  this.fillStyle = gradient;
  this.beginPath();
  this.arc(x, y, radius, 0, Math.PI * 2);
  this.fill();
};

CanvasRenderingContext2D.prototype.drawRoundedRect = function (this: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, colorTop: string, colorBottom: string, strokeColor: string | null = null, gradientType: string = 'linear', topRadius: number = NaN) {
  if (radius > width / 2) radius = width / 2;
  if (radius > height / 2) radius = height / 2;

  // Create linear gradient from top to bottom
  let gradient = null
  if (gradientType === 'radial') {
    // radial gradient centered in the rectangle
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.max(width, height) / 2;
    gradient = this.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
    this.fillStyle = gradient;
  } else {
    // default linear gradient top to bottom
    gradient = this.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
    this.fillStyle = gradient;
  }

  if (isNaN(topRadius)) {
    topRadius = radius;
  }

  this.beginPath();
  this.moveTo(x + topRadius, y);
  this.lineTo(x + width - topRadius, y);
  this.quadraticCurveTo(x + width, y, x + width, y + topRadius);
  this.lineTo(x + width, y + height - radius);
  this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  this.lineTo(x + radius, y + height);
  this.quadraticCurveTo(x, y + height, x, y + height - radius);
  this.lineTo(x, y + topRadius);
  this.quadraticCurveTo(x, y, x + topRadius, y);
  this.closePath();
  this.fillStyle = gradient;
  this.fill();

  if (strokeColor) {
    this.strokeStyle = strokeColor;
    this.stroke();
  }
};

CanvasRenderingContext2D.prototype.drawCircle = function (this: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  this.fillStyle = color;
  this.beginPath();
  this.arc(x, y, radius, 0, Math.PI * 2);
  this.fill();
};
