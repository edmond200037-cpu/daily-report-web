import type { Locator } from '@playwright/test';

export async function readContrast(target: Locator) {
  return target.evaluate((node) => {
    const context = document.createElement('canvas').getContext('2d')!;
    const rgba = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
    const over = (front: number[], back: number[]) => front.slice(0, 3).map((value, index) => value * front[3] / 255 + back[index] * (1 - front[3] / 255));
    const ancestors: { part: string; background: string; opacity: number }[] = [];
    for (let element: Element | null = node; element; element = element.parentElement) { const style = getComputedStyle(element); ancestors.push({ part: element.className, background: style.backgroundColor, opacity: Number(style.opacity) }); }
    let background = [255, 255, 255];
    for (const ancestor of [...ancestors].reverse()) background = over(rgba(ancestor.background), background);
    const style = getComputedStyle(node), foreground = over(rgba(style.color), background);
    const luminance = (color: number[]) => color.map((part) => { const value = part / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [.2126, .7152, .0722][index], 0);
    const a = luminance(background), b = luminance(foreground);
    return { background, foreground, opacity: ancestors.reduce((value, ancestor) => value * ancestor.opacity, 1), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), ancestors };
  });
}
