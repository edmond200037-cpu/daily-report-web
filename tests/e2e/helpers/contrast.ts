import { expect, type Locator } from '@playwright/test';

/** Sample after the reveal/entrance has settled, including its ancestor opacity. */
export async function readSettledContrast(target: Locator) {
  let sample: Awaited<ReturnType<typeof readContrast>> | undefined;
  await expect.poll(async () => {
    const settled = await target.evaluate(async (node) => {
      const ancestors: Element[] = [];
      for (let element: Element | null = node; element; element = element.parentElement) ancestors.push(element);
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const stable = () => ancestors.every((element) => Number(getComputedStyle(element).opacity) === 1
        && element.getAnimations().every((animation) => !animation.pending && animation.playState !== 'running'));
      await frame(); await frame();
      if (!stable()) return false;
      await frame(); await frame();
      return stable();
    });
    if (!settled) return false;
    sample = await readContrast(target);
    return sample.opacity === 1;
  }).toBe(true);
  return sample!;
}

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
