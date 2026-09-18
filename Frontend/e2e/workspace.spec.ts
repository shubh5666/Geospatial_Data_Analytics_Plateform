import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { User } from '../src/types';

let accounts: User[] = [];
const password = 'E2e-only-test-passphrase!';
const artifactPath = resolve('../tmp/qa');
test.beforeEach(() => { accounts = []; mkdirSync(artifactPath, { recursive: true }); });
test.afterEach(() => {
  if (!accounts.length) return;
  const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? resolve('../Backend/venv/Scripts/python.exe') : 'python');
  execFileSync(python, [resolve('../scripts/cleanup_e2e.py')], { input: JSON.stringify(accounts), stdio: ['pipe', 'pipe', 'pipe'] });
});

async function makeAccount(request: APIRequestContext) {
  const email = `e2e-${randomUUID()}@example.com`;
  const response = await request.post('/api/auth/register', { data: { full_name: 'Field Explorer', email, password } });
  expect(response.status()).toBe(201);
  accounts.push(await response.json());
  return email;
}

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toBeVisible();
}

test('register, explore sample analytics, create project, draw and export a persistent site', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto('/');
  await page.screenshot({ path: resolve(artifactPath, 'sign-in.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Full name').fill('Field Explorer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const registration = page.waitForResponse((response) => response.url().endsWith('/auth/register') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create your account', exact: true }).click();
  accounts.push(await (await registration).json());
  await page.getByRole('button', { name: 'Explore sample data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Western Ghats restoration' })).toBeVisible();
  await expect(page.getByText('Synthetic data', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Carbon history/ })).toBeVisible();
  await page.getByRole('button', { name: 'Biodiversity', exact: true }).click();
  await expect(page.getByRole('img', { name: /Biodiversity history/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(artifactPath, 'dashboard-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a project' });
  await dialog.getByLabel('Project name').fill('River restoration');
  await dialog.getByLabel('Description').fill('A real workflow test with an owned site.');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'River restoration', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Draw site', exact: true }).click();
  const map = page.getByTestId('coordinate-map');
  await map.click({ position: { x: 160, y: 120 } });
  await map.click({ position: { x: 310, y: 130 } });
  await map.click({ position: { x: 290, y: 230 } });
  await map.click({ position: { x: 170, y: 215 } });
  await page.getByRole('button', { name: 'Finish boundary' }).click();
  await page.getByRole('dialog').getByLabel('Site name').fill('Riverbank woodland');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Riverbank woodland has been saved');
  await expect(page.getByText('No measurements have been recorded for this site yet.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export sites' }).click();
  const file = await download;
  const collection = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(collection.type).toBe('FeatureCollection');
  expect(collection.features[0].properties.name).toBe('Riverbank woodland');
  expect(collection.features[0].geometry.type).toBe('Polygon');
  await page.reload();
  await page.getByRole('button', { name: 'River restoration', exact: true }).click();
  await expect(page.getByRole('button', { name: /Riverbank woodland.*hectares/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await signIn(page, email);
  await expect(page.getByRole('button', { name: 'River restoration', exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('mobile navigation, site selection, and layout remain usable', async ({ page, request }) => {
  const email = await makeAccount(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, email);
  await page.getByRole('button', { name: 'Explore sample data', exact: true }).click();
  await expect(page.getByText('Synthetic data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Project sites', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'View on map' }).first().click();
  await expect(page.getByRole('heading', { name: 'Explore your sites' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(artifactPath, 'dashboard-mobile.png'), fullPage: true });
});

test('an expired session returns to sign in instead of exposing cached project data', async ({ page, request }) => {
  await signIn(page, await makeAccount(request));
  await page.evaluate(() => sessionStorage.setItem('darukaa.session', 'expired-or-tampered-token'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('darukaa.session'))).toBeNull();
});

test('project loading errors can be retried without losing the session', async ({ page, request }) => {
  const email = await makeAccount(request);
  await page.route('**/api/projects?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Temporarily unavailable' }) }));
  await signIn(page, email);
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await page.unroute('**/api/projects?*');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Good things start with a place.' })).toBeVisible();
});
