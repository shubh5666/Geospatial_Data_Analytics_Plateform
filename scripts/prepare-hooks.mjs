import { existsSync } from 'node:fs';

// Never install project hooks into an unrelated parent repository.
if (
  existsSync('.git') &&
  process.env.CI !== 'true' &&
  process.env.VERCEL !== '1' &&
  process.env.NODE_ENV !== 'production'
) {
  const { default: husky } = await import('husky');
  const result = husky();
  if (result) console.log(result);
}
