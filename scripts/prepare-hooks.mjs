import { existsSync } from 'node:fs';

// Never install project hooks into an unrelated parent repository, CI, or production.
if (
  existsSync('.git') &&
  process.env.CI !== 'true' &&
  process.env.CI !== '1' &&
  process.env.VERCEL !== '1' &&
  process.env.NODE_ENV !== 'production'
) {
  try {
    const { default: husky } = await import('husky');
    const result = husky();
    if (result) console.log(result);
  } catch {
    // Ignore if husky is not installed
  }
}
