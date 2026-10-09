import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/version';

describe('應用程式版本', () => {
  it('以單一常數標示本次手機修復版本', () => {
    expect(APP_VERSION).toBe('0.1.4');
  });
});
