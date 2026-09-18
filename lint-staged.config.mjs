export default {
  '*.{js,mjs,jsx,ts,tsx,css,html,json,md,yml,yaml}': 'prettier --write',
  'Frontend/**/*.{ts,tsx}': 'npm exec --workspace=Frontend -- eslint --fix',
  '*.py': 'python scripts/check_python.py',
};
